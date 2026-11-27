// Baños: qué días le toca bañarse a cada residente, quién lo baña y el registro de cada baño.
// Lo que le toca a una persona aparece también en su "Mis actividades".
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const { puede, requierePermiso } = require('../permisos');
const L = require('../medicacion/logica');
const rolDia = require('./rolDia');

router.use(requireAuth);

db.exec(`
  CREATE TABLE IF NOT EXISTS banos_programa (
    residente_id INTEGER PRIMARY KEY,
    dias_semana  TEXT NOT NULL DEFAULT '[]',      -- [0..6], 0 = domingo
    turno        TEXT,                            -- 'Matutino-Vespertino' | 'Nocturno' | NULL
    encargado_id INTEGER,                         -- usuario que lo baña (opcional)
    notas        TEXT DEFAULT '',
    actualizado_en TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE CASCADE
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS banos_registro (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id   INTEGER NOT NULL,
    fecha          TEXT NOT NULL,
    estado         TEXT NOT NULL CHECK (estado IN ('hecho','no_hecho')),
    tipo           TEXT DEFAULT '',
    observaciones  TEXT NOT NULL DEFAULT '[]',
    motivo         TEXT DEFAULT '',
    nota           TEXT DEFAULT '',
    hora           TEXT DEFAULT '',
    usuario_id     INTEGER,
    usuario_nombre TEXT DEFAULT '',
    creado_en      TEXT DEFAULT (datetime('now')),
    actualizado_en TEXT DEFAULT (datetime('now')),
    UNIQUE (residente_id, fecha),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE CASCADE
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_banos_fecha ON banos_registro (fecha)');

const TURNOS  = ['Matutino-Vespertino', 'Nocturno'];
const TIPOS   = ['Regadera', 'Regadera con silla', 'Esponja / en cama'];
const OBSERVACIONES = ['Piel íntegra', 'Piel reseca', 'Enrojecimiento', 'Lesión o escara', 'Moretón', 'Hongos', 'Uñas largas', 'Se aplicó crema'];
const VIGILAR = ['Enrojecimiento', 'Lesión o escara', 'Moretón', 'Hongos'];
const MOTIVOS = ['Se negó', 'Enfermo o indispuesto', 'Fuera de la residencia', 'No hubo tiempo', 'Otro'];

const json = (s, d = []) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : d } catch { return d } };
const diasValidos = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort();

function registroPublico(r) {
  return r ? { ...r, observaciones: json(r.observaciones) } : null;
}

function programaPublico(p) {
  return p ? { dias_semana: json(p.dias_semana), turno: p.turno || null, encargado_id: p.encargado_id || null, notas: p.notas || '' } : null;
}

const tocaEn = (programa, fecha) => !!programa && programa.dias_semana.includes(L.diaSemana(fecha));

/** Residentes que están en alguna columna del rol de ese día → esa columna. */
function quienAtiendeEnRol(fecha) {
  const m = {};
  try { for (const c of rolDia.rolDe(fecha).columnas) for (const r of c.residentes) if (!(r.id in m)) m[r.id] = c } catch {}
  return m;
}

/** Baños que le tocan a un usuario en una fecha (para "Mis actividades").
 *  Si el residente está en el rol del día, lo baña quien lo tiene en su columna; si no, el encargado del programa. */
function banosDeUsuario(fecha, usuarioId) {
  const enRol = quienAtiendeEnRol(fecha);
  const filas = db.prepare(`
    SELECT r.id, r.nombre, r.iniciales, r.foto, r.habitacion, r.ubicacion, p.dias_semana, p.turno, p.encargado_id, p.notas
    FROM banos_programa p JOIN residentes r ON r.id = p.residente_id
  `).all().filter(f => (f.id in enRol ? enRol[f.id].usuario_id === usuarioId : f.encargado_id === usuarioId));
  const regs = Object.fromEntries(db.prepare('SELECT * FROM banos_registro WHERE fecha = ?').all([fecha]).map(r => [r.residente_id, r]));
  return filas
    .map(f => ({ ...f, programa: programaPublico(f) }))
    .filter(f => (f.ubicacion || 'residencia') === 'residencia' && tocaEn(f.programa, fecha))
    .map(f => ({
      residente: { id: f.id, nombre: f.nombre, iniciales: f.iniciales, foto: f.foto, habitacion: f.habitacion },
      turno: f.programa.turno, notas: f.programa.notas, registro: registroPublico(regs[f.id]),
    }));
}

const esEncargado = (residenteId, usuarioId) =>
  !!db.prepare('SELECT 1 FROM banos_programa WHERE residente_id = ? AND encargado_id = ?').get([residenteId, usuarioId]);

/** Puede registrar quien tiene Baños con edición, el encargado de ese residente o quien lo tiene en el rol de ese día. */
const puedeRegistrar = (req, residenteId, fecha) => puede(req.usuario, 'banos', 'editar') || esEncargado(residenteId, req.usuario.id)
  || rolDia.atiendeEnRol(fecha, req.usuario.id, residenteId);

// GET /api/gestion/banos/opciones
router.get('/opciones', (req, res) => {
  res.json({ tipos: TIPOS, observaciones: OBSERVACIONES, vigilar: VIGILAR, motivos: MOTIVOS, hoy: L.hoyMexico() });
});

// GET /api/gestion/banos?fecha=AAAA-MM-DD → todos los residentes con su programa y el registro del día
router.get('/', requierePermiso('banos', 'ver'), (req, res) => {
  const fecha = L.esFecha(req.query.fecha) ? req.query.fecha : L.hoyMexico();
  try {
    const residentes = db.prepare(`
      SELECT r.id, r.nombre, r.iniciales, r.foto, r.habitacion, r.ubicacion, r.tipo_servicio,
             p.dias_semana, p.turno, p.encargado_id, p.notas, p.residente_id AS tiene_programa
      FROM residentes r LEFT JOIN banos_programa p ON p.residente_id = r.id
      ORDER BY r.nombre COLLATE NOCASE
    `).all();
    const regs = Object.fromEntries(db.prepare('SELECT * FROM banos_registro WHERE fecha = ?').all([fecha]).map(r => [r.residente_id, r]));
    // Último baño hecho de cada residente (para ver cuántos días lleva)
    const ultimos = Object.fromEntries(db.prepare(`
      SELECT residente_id, MAX(fecha) AS fecha FROM banos_registro WHERE estado = 'hecho' AND fecha <= ? GROUP BY residente_id
    `).all([fecha]).map(r => [r.residente_id, r.fecha]));
    const personal = db.prepare(`SELECT id, nombre, rol FROM usuarios WHERE activo = 1 AND aprobado = 1 ORDER BY nombre COLLATE NOCASE`).all();
    const nombres = Object.fromEntries(personal.map(p => [p.id, p.nombre]));
    const enRol = quienAtiendeEnRol(fecha);
    res.json({
      fecha,
      personal,
      vigilar: VIGILAR,
      residentes: residentes.map(r => {
        const programa = r.tiene_programa ? programaPublico(r) : null;
        return {
          id: r.id, nombre: r.nombre, iniciales: r.iniciales, foto: r.foto, habitacion: r.habitacion,
          ubicacion: r.ubicacion || 'residencia', tipo_servicio: r.tipo_servicio,
          programa, toca: tocaEn(programa, fecha),
          // Ese día lo baña quien lo tiene en el rol; si no está en el rol, el encargado del programa
          encargado_nombre: enRol[r.id] ? (enRol[r.id].usuario_id ? (nombres[enRol[r.id].usuario_id] || '') : enRol[r.id].nombre)
            : programa?.encargado_id ? (nombres[programa.encargado_id] || '') : '',
          en_rol: !!enRol[r.id],
          registro: registroPublico(regs[r.id]),
          ultimo_bano: ultimos[r.id] || null,
        };
      }),
    });
  } catch (err) {
    console.error('Error listando baños:', err);
    res.status(500).json({ error: 'No se pudieron cargar los baños.' });
  }
});

// PUT /api/gestion/banos/programa/:residenteId  { dias_semana, turno, encargado_id, notas }
router.put('/programa/:residenteId', requierePermiso('banos', 'editar'), (req, res) => {
  const rid = Number(req.params.residenteId);
  const b = req.body || {};
  try {
    if (!db.prepare('SELECT 1 FROM residentes WHERE id = ?').get([rid])) return res.status(404).json({ error: 'Residente no encontrado.' });
    const encargado = b.encargado_id ? Number(b.encargado_id) : null;
    if (encargado && !db.prepare('SELECT 1 FROM usuarios WHERE id = ? AND activo = 1').get([encargado])) {
      return res.status(400).json({ error: 'Esa persona no existe o está desactivada.' });
    }
    const dias = diasValidos(b.dias_semana);
    const turno = TURNOS.includes(b.turno) ? b.turno : null;
    db.prepare(`
      INSERT INTO banos_programa (residente_id, dias_semana, turno, encargado_id, notas, actualizado_en)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(residente_id) DO UPDATE SET dias_semana = excluded.dias_semana, turno = excluded.turno,
        encargado_id = excluded.encargado_id, notas = excluded.notas, actualizado_en = datetime('now')
    `).run([rid, JSON.stringify(dias), turno, encargado, L.texto(b.notas, 300)]);
    res.json(programaPublico(db.prepare('SELECT * FROM banos_programa WHERE residente_id = ?').get([rid])));
  } catch (err) {
    console.error('Error guardando programa de baño:', err);
    res.status(500).json({ error: 'No se pudo guardar el programa.' });
  }
});

// PUT /api/gestion/banos/registro  { residente_id, fecha, estado, tipo, observaciones, motivo, nota, hora }
router.put('/registro', (req, res) => {
  const b = req.body || {};
  const rid = Number(b.residente_id);
  const hoy = L.hoyMexico();
  if (!rid || !L.esFecha(b.fecha) || !['hecho', 'no_hecho'].includes(b.estado)) {
    return res.status(400).json({ error: 'Faltan datos del baño (residente, fecha o si se bañó).' });
  }
  if (b.fecha > hoy) return res.status(400).json({ error: 'No se puede registrar un baño de un día que no ha llegado.' });
  if (!puedeRegistrar(req, rid, b.fecha)) return res.status(403).json({ error: 'No tienes permiso para registrar este baño.' });
  if (!puede(req.usuario, 'banos', 'editar') && L.diasEntre(b.fecha, hoy) > 1) {
    return res.status(403).json({ error: 'Solo se puede registrar el baño de hoy o de ayer.' });
  }
  const motivo = b.estado === 'no_hecho' ? L.texto(b.motivo, 60) : '';
  if (b.estado === 'no_hecho' && !motivo) return res.status(400).json({ error: 'Indica por qué no se bañó.' });
  const obs = b.estado === 'hecho' ? [...new Set((Array.isArray(b.observaciones) ? b.observaciones : []).map(o => L.texto(o, 40)).filter(Boolean))].slice(0, 12) : [];
  const tipo = b.estado === 'hecho' ? L.texto(b.tipo, 40) : '';
  const hora = L.esHora(b.hora) ? b.hora : L.ahoraMexico().hora;
  try {
    db.prepare(`
      INSERT INTO banos_registro (residente_id, fecha, estado, tipo, observaciones, motivo, nota, hora, usuario_id, usuario_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(residente_id, fecha) DO UPDATE SET estado = excluded.estado, tipo = excluded.tipo,
        observaciones = excluded.observaciones, motivo = excluded.motivo, nota = excluded.nota, hora = excluded.hora,
        usuario_id = excluded.usuario_id, usuario_nombre = excluded.usuario_nombre, actualizado_en = datetime('now')
    `).run([rid, b.fecha, b.estado, tipo, JSON.stringify(obs), motivo, L.texto(b.nota, 400), hora, req.usuario.id, req.usuario.nombre || '']);
    res.json(registroPublico(db.prepare('SELECT * FROM banos_registro WHERE residente_id = ? AND fecha = ?').get([rid, b.fecha])));
  } catch (err) {
    console.error('Error registrando baño:', err);
    res.status(500).json({ error: 'No se pudo guardar el baño.' });
  }
});

// DELETE /api/gestion/banos/registro/:id  → deshace el registro (vuelve a "pendiente")
router.delete('/registro/:id', (req, res) => {
  try {
    const r = db.prepare('SELECT * FROM banos_registro WHERE id = ?').get([Number(req.params.id)]);
    if (!r) return res.status(404).json({ error: 'Registro no encontrado.' });
    if (!puedeRegistrar(req, r.residente_id, r.fecha)) return res.status(403).json({ error: 'No tienes permiso para cambiar este baño.' });
    db.prepare('DELETE FROM banos_registro WHERE id = ?').run([r.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deshaciendo baño:', err);
    res.status(500).json({ error: 'No se pudo deshacer.' });
  }
});

// GET /api/gestion/banos/residente/:id → últimos baños de un residente
router.get('/residente/:id', requierePermiso('banos', 'ver'), (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM banos_registro WHERE residente_id = ? ORDER BY fecha DESC LIMIT 30').all([Number(req.params.id)]).map(registroPublico));
  } catch (err) {
    console.error('Error en historial de baños:', err);
    res.status(500).json({ error: 'No se pudo cargar el historial.' });
  }
});

module.exports = router;
module.exports.banosDeUsuario = banosDeUsuario;
module.exports.VIGILAR = VIGILAR;
