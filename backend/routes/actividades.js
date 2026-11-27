// Actividades del personal.
// Una "rutina" se escribe una vez y se repite sola (todos los días, ciertos días o un solo día).
// Se asigna a una persona o a un puesto completo (rol): las de puesto las ve todo ese puesto y
// la primera persona que la marca la cierra para todos.
// Cada quien ve las suyas en "Mis actividades"; con el permiso `actividades` se monitorea (ver)
// y se asigna (editar).
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const { ROLES, puede, requierePermiso } = require('../permisos');
const L = require('../medicacion/logica');
const { banosDeUsuario } = require('./banos');
const rolDia = require('./rolDia');
const { turnoDeUsuario } = require('./personal');

router.use(requireAuth);

db.exec(`
  CREATE TABLE IF NOT EXISTS act_rutinas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo        TEXT NOT NULL,
    detalle       TEXT DEFAULT '',
    asignado_tipo TEXT NOT NULL CHECK (asignado_tipo IN ('usuario','rol')),
    usuario_id    INTEGER,
    rol           TEXT,
    turno         TEXT,                         -- 'Matutino-Vespertino' | 'Nocturno' | NULL = cualquiera
    hora          TEXT DEFAULT '',
    repeticion    TEXT NOT NULL CHECK (repeticion IN ('diaria','semana','una_vez')),
    dias_semana   TEXT NOT NULL DEFAULT '[]',
    fecha         TEXT,                         -- solo para 'una_vez'
    fecha_inicio  TEXT NOT NULL,
    baja_en       TEXT,                         -- desde este día ya no aplica (no se borra: el monitoreo de días pasados la sigue viendo)
    creado_por    INTEGER,
    creado_por_nombre TEXT DEFAULT '',
    creado_en     TEXT DEFAULT (datetime('now')),
    actualizado_en TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS act_hechas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    rutina_id      INTEGER NOT NULL,
    fecha          TEXT NOT NULL,
    usuario_id     INTEGER,
    usuario_nombre TEXT DEFAULT '',
    nota           TEXT DEFAULT '',
    hecha_en       TEXT NOT NULL,               -- hora local HH:MM
    UNIQUE (rutina_id, fecha),
    FOREIGN KEY (rutina_id) REFERENCES act_rutinas(id) ON DELETE CASCADE
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_act_hechas_fecha ON act_hechas (fecha)');

const TURNOS = ['Matutino-Vespertino', 'Nocturno'];
const MAX_POR_VEZ = 60;
const json = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] } };
const diasValidos = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort();

function rutinaPublica(r) {
  return { ...r, dias_semana: json(r.dias_semana) };
}

/** ¿La rutina toca en esa fecha? */
function aplica(r, fecha) {
  if (fecha < r.fecha_inicio) return false;
  if (r.baja_en && fecha >= r.baja_en) return false;
  if (r.repeticion === 'una_vez') return r.fecha === fecha;
  if (r.repeticion === 'semana') return r.dias_semana.includes(L.diaSemana(fecha));
  return true;
}

const orden = (a, b) => (a.hora || '99').localeCompare(b.hora || '99') || a.titulo.localeCompare(b.titulo, 'es');

function rutinasDelDia(fecha) {
  return db.prepare('SELECT * FROM act_rutinas WHERE fecha_inicio <= ? AND (baja_en IS NULL OR baja_en > ?)')
    .all([fecha, fecha]).map(rutinaPublica).filter(r => aplica(r, fecha));
}

function hechasDelDia(fecha) {
  return Object.fromEntries(db.prepare('SELECT * FROM act_hechas WHERE fecha = ?').all([fecha]).map(h => [h.rutina_id, h]));
}

const conEstado = (r, hechas) => {
  const h = hechas[r.id];
  return {
    id: r.id, titulo: r.titulo, detalle: r.detalle, turno: r.turno, hora: r.hora,
    compartida: r.asignado_tipo === 'rol', rol: r.rol,
    hecha: h ? { usuario_id: h.usuario_id, usuario_nombre: h.usuario_nombre, hecha_en: h.hecha_en, nota: h.nota } : null,
  };
};

function personal() {
  return db.prepare('SELECT id, nombre, rol FROM usuarios WHERE activo = 1 AND aprobado = 1 ORDER BY nombre COLLATE NOCASE').all()
    .map(u => ({ ...u, rol_label: ROLES[u.rol]?.label || u.rol }));
}

const fechaDe = (q) => (L.esFecha(q) ? q : L.hoyMexico());

/** Limita a hoy y ayer a quien no monitorea (el turno de noche termina al día siguiente). */
function fechaPermitida(req, fecha) {
  const hoy = L.hoyMexico();
  if (fecha > hoy) return 'No se puede marcar una actividad de un día que no ha llegado.';
  if (!puede(req.usuario, 'actividades', 'editar') && L.diasEntre(fecha, hoy) > 1) return 'Solo se pueden marcar actividades de hoy o de ayer.';
  return null;
}

const esMia = (r, usuario) =>
  (r.asignado_tipo === 'usuario' && r.usuario_id === usuario.id) || (r.asignado_tipo === 'rol' && r.rol === usuario.rol);

// ── Mis actividades ──────────────────────────────────────────────────────────
// GET /api/gestion/actividades/mias?fecha=
router.get('/mias', (req, res) => {
  const fecha = fechaDe(req.query.fecha);
  try {
    const hechas = hechasDelDia(fecha);
    const actividades = rutinasDelDia(fecha).filter(r => esMia(r, req.usuario)).sort(orden).map(r => conEstado(r, hechas));
    res.json({ fecha, hoy: L.hoyMexico(), actividades, banos: banosDeUsuario(fecha, req.usuario.id), rol: rolDia.rolDeUsuario(fecha, req.usuario.id) });
  } catch (err) {
    console.error('Error en mis actividades:', err);
    res.status(500).json({ error: 'No se pudieron cargar tus actividades.' });
  }
});

// POST /api/gestion/actividades/:id/hecha  { fecha, nota }
router.post('/:id(\\d+)/hecha', (req, res) => {
  const fecha = req.body?.fecha;
  if (!L.esFecha(fecha)) return res.status(400).json({ error: 'Fecha no válida.' });
  const problema = fechaPermitida(req, fecha);
  if (problema) return res.status(400).json({ error: problema });
  try {
    const fila = db.prepare('SELECT * FROM act_rutinas WHERE id = ?').get([Number(req.params.id)]);
    if (!fila) return res.status(404).json({ error: 'Actividad no encontrada.' });
    const r = rutinaPublica(fila);
    if (!esMia(r, req.usuario) && !puede(req.usuario, 'actividades', 'editar')) return res.status(403).json({ error: 'Esta actividad no es tuya.' });
    if (!aplica(r, fecha)) return res.status(400).json({ error: 'Esta actividad no toca ese día.' });
    db.prepare(`
      INSERT INTO act_hechas (rutina_id, fecha, usuario_id, usuario_nombre, nota, hecha_en) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(rutina_id, fecha) DO UPDATE SET nota = excluded.nota
    `).run([r.id, fecha, req.usuario.id, req.usuario.nombre || '', L.texto(req.body?.nota, 300), L.ahoraMexico().hora]);
    res.json(conEstado(r, hechasDelDia(fecha)));
  } catch (err) {
    console.error('Error marcando actividad:', err);
    res.status(500).json({ error: 'No se pudo marcar la actividad.' });
  }
});

// DELETE /api/gestion/actividades/:id/hecha?fecha=  → desmarcar
router.delete('/:id(\\d+)/hecha', (req, res) => {
  const fecha = req.query.fecha;
  if (!L.esFecha(fecha)) return res.status(400).json({ error: 'Fecha no válida.' });
  const problema = fechaPermitida(req, fecha);
  if (problema) return res.status(400).json({ error: problema });
  try {
    const fila = db.prepare('SELECT * FROM act_rutinas WHERE id = ?').get([Number(req.params.id)]);
    if (!fila) return res.status(404).json({ error: 'Actividad no encontrada.' });
    const r = rutinaPublica(fila);
    const h = db.prepare('SELECT * FROM act_hechas WHERE rutina_id = ? AND fecha = ?').get([r.id, fecha]);
    if (!h) return res.json(conEstado(r, {}));
    // La desmarca quien la marcó o quien asigna actividades
    if (h.usuario_id !== req.usuario.id && !puede(req.usuario, 'actividades', 'editar')) {
      return res.status(403).json({ error: `La marcó ${h.usuario_nombre || 'otra persona'}; solo esa persona o la encargada la pueden desmarcar.` });
    }
    db.prepare('DELETE FROM act_hechas WHERE id = ?').run([h.id]);
    res.json(conEstado(r, {}));
  } catch (err) {
    console.error('Error desmarcando actividad:', err);
    res.status(500).json({ error: 'No se pudo desmarcar la actividad.' });
  }
});

// ── Inicio: mi semana ────────────────────────────────────────────────────────
// GET /api/gestion/actividades/semana?fecha=  → la semana (lunes a domingo) que contiene esa fecha:
// por día, mi horario según el rol y cuánto llevo; con permiso de monitoreo, también el equipo de hoy.
router.get('/semana', (req, res) => {
  const base = fechaDe(req.query.fecha);
  const hoy = L.hoyMexico();
  try {
    const lunes = L.sumarDias(base, -((L.diaSemana(base) + 6) % 7));
    const residentes = rolDia.residentesCortos();
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const fecha = L.sumarDias(lunes, i);
      const rol = rolDia.rolDe(fecha);
      const hechasRol = rolDia.hechasDe(fecha);
      const mio = rolDia.rolDeUsuario(fecha, req.usuario.id, { rol, hechas: hechasRol, residentes });
      const hechas = hechasDelDia(fecha);
      const fijas = rutinasDelDia(fecha).filter(r => esMia(r, req.usuario));
      const banos = banosDeUsuario(fecha, req.usuario.id);
      const total = (mio?.tareas.length || 0) + fijas.length + banos.length;
      const listas = (mio?.tareas.filter(t => t.hecha).length || 0) + fijas.filter(r => hechas[r.id]).length + banos.filter(b => b.registro).length;
      const turno = turnoDeUsuario(req.usuario.id, fecha);   // del Horario semanal (si su perfil está vinculado)
      dias.push({
        fecha, hay_rol: rol.columnas.length > 0, en_rol: !!mio, horario: mio?.horario || '', turno,
        residentes: mio?.residentes.length || 0, total, hechas: listas,
      });
    }
    let equipo = null;
    if (puede(req.usuario, 'actividades', 'ver')) {
      const rol = rolDia.rolDe(hoy);
      const hechasRol = rolDia.hechasDe(hoy);
      const nombres = Object.fromEntries(personal().map(u => [u.id, u.nombre]));
      equipo = rol.columnas.map(c => ({
        nombre: c.usuario_id ? (nombres[c.usuario_id] || 'Persona desactivada') : c.nombre,
        con_cuenta: !!c.usuario_id, horario: c.horario, residentes: c.residentes.length,
        total: c.tareas.length, hechas: c.tareas.filter(t => hechasRol[t.uid]).length,
      }));
    }
    const vinculado = !!db.prepare('SELECT 1 FROM personal WHERE usuario_id = ? AND activo = 1').get([req.usuario.id]);
    res.json({ hoy, lunes, dias, equipo, vinculado });
  } catch (err) {
    console.error('Error en la semana:', err);
    res.status(500).json({ error: 'No se pudo cargar tu semana.' });
  }
});

// ── Monitoreo ────────────────────────────────────────────────────────────────
// GET /api/gestion/actividades/monitoreo?fecha=
router.get('/monitoreo', requierePermiso('actividades', 'ver'), (req, res) => {
  const fecha = fechaDe(req.query.fecha);
  try {
    const hechas = hechasDelDia(fecha);
    const rutinas = rutinasDelDia(fecha).sort(orden);
    const gente = personal();
    // Lo del rol del día se junta con lo fijo de cada persona
    const extras = { rol: rolDia.rolDe(fecha), hechas: rolDia.hechasDe(fecha), residentes: rolDia.residentesCortos() };
    const personas = gente.map(u => ({
      usuario: u,
      actividades: rutinas.filter(r => r.asignado_tipo === 'usuario' && r.usuario_id === u.id).map(r => conEstado(r, hechas)),
      banos: banosDeUsuario(fecha, u.id),
      rol: rolDia.rolDeUsuario(fecha, u.id, extras),
    })).filter(p => p.actividades.length || p.banos.length || p.rol?.tareas.length);
    const roles = [...new Set(rutinas.filter(r => r.asignado_tipo === 'rol').map(r => r.rol))];
    const puestos = roles.map(rol => ({
      rol, rol_label: ROLES[rol]?.label || rol,
      personas: gente.filter(u => u.rol === rol).map(u => u.nombre),
      actividades: rutinas.filter(r => r.asignado_tipo === 'rol' && r.rol === rol).map(r => conEstado(r, hechas)),
    }));
    res.json({ fecha, hoy: L.hoyMexico(), personas, puestos });
  } catch (err) {
    console.error('Error en monitoreo de actividades:', err);
    res.status(500).json({ error: 'No se pudo cargar el monitoreo.' });
  }
});

// ── Asignar (rutinas) ────────────────────────────────────────────────────────
// GET /api/gestion/actividades/personal  → personas y puestos para asignar
router.get('/personal', requierePermiso('actividades', 'ver'), (req, res) => {
  try {
    res.json({
      personal: personal(),
      puestos: Object.entries(ROLES).filter(([id]) => id !== 'admin').map(([id, r]) => ({ id, label: r.label })),
    });
  } catch (err) {
    console.error('Error listando personal:', err);
    res.status(500).json({ error: 'No se pudo cargar el personal.' });
  }
});

// GET /api/gestion/actividades/rutinas  → todas las vigentes
router.get('/rutinas', requierePermiso('actividades', 'ver'), (req, res) => {
  const hoy = L.hoyMexico();
  try {
    res.json(db.prepare(`
      SELECT * FROM act_rutinas
      WHERE (baja_en IS NULL OR baja_en > ?) AND NOT (repeticion = 'una_vez' AND fecha < ?)
      ORDER BY hora = '', hora, titulo COLLATE NOCASE
    `).all([hoy, hoy]).map(rutinaPublica));
  } catch (err) {
    console.error('Error listando rutinas:', err);
    res.status(500).json({ error: 'No se pudieron cargar las actividades.' });
  }
});

/** Valida asignación y repetición comunes a crear y editar. */
function leerRutina(b) {
  const tipo = b.asignado_tipo;
  if (!['usuario', 'rol'].includes(tipo)) throw L.errorUsuario('Elige a quién se le asigna.');
  let usuario_id = null, rol = null;
  if (tipo === 'usuario') {
    usuario_id = Number(b.usuario_id);
    if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ? AND activo = 1').get([usuario_id])) throw L.errorUsuario('Esa persona no existe o está desactivada.');
  } else {
    rol = String(b.rol || '');
    if (!ROLES[rol]) throw L.errorUsuario('Ese puesto no existe.');
  }
  const repeticion = ['diaria', 'semana', 'una_vez'].includes(b.repeticion) ? b.repeticion : 'diaria';
  const dias = repeticion === 'semana' ? diasValidos(b.dias_semana) : [];
  if (repeticion === 'semana' && !dias.length) throw L.errorUsuario('Elige al menos un día de la semana.');
  const hoy = L.hoyMexico();
  const fecha = repeticion === 'una_vez' ? (L.esFecha(b.fecha) ? b.fecha : hoy) : null;
  if (fecha && fecha < hoy) throw L.errorUsuario('El día de la actividad ya pasó.');
  return {
    asignado_tipo: tipo, usuario_id, rol, repeticion, dias_semana: JSON.stringify(dias), fecha,
    turno: TURNOS.includes(b.turno) ? b.turno : null,
    hora: L.esHora(b.hora) ? b.hora : '',
  };
}

const enviarError = (res, err, msg) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(msg, err);
  res.status(500).json({ error: msg });
};

// POST /api/gestion/actividades/rutinas  { titulos: [..] | titulo, detalle, asignado_tipo, usuario_id|rol, repeticion, dias_semana, fecha, turno, hora }
// Varias a la vez: un título por renglón.
router.post('/rutinas', requierePermiso('actividades', 'editar'), (req, res) => {
  const b = req.body || {};
  try {
    const base = leerRutina(b);
    const lista = (Array.isArray(b.titulos) ? b.titulos : [b.titulo])
      .map(t => L.texto(String(t || '').replace(/^\s*[-•*·\d.)]+\s*/, ''), 140)).filter(Boolean);
    const titulos = [...new Set(lista)];
    if (!titulos.length) throw L.errorUsuario('Escribe al menos una actividad.');
    if (titulos.length > MAX_POR_VEZ) throw L.errorUsuario(`Son demasiadas a la vez (máximo ${MAX_POR_VEZ}).`);
    const hoy = L.hoyMexico();
    const ins = db.prepare(`
      INSERT INTO act_rutinas (titulo, detalle, asignado_tipo, usuario_id, rol, turno, hora, repeticion, dias_semana, fecha, fecha_inicio, creado_por, creado_por_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const ids = [];
    db.exec('BEGIN');
    try {
      for (const t of titulos) {
        const r = ins.run([t, titulos.length === 1 ? L.texto(b.detalle, 400) : '', base.asignado_tipo, base.usuario_id, base.rol, base.turno, base.hora,
          base.repeticion, base.dias_semana, base.fecha, base.fecha || hoy, req.usuario.id, req.usuario.nombre || '']);
        ids.push(Number(r.lastInsertRowid));
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.status(201).json(ids.map(id => rutinaPublica(db.prepare('SELECT * FROM act_rutinas WHERE id = ?').get([id]))));
  } catch (err) { enviarError(res, err, 'No se pudieron guardar las actividades.') }
});

// PUT /api/gestion/actividades/rutinas/:id
router.put('/rutinas/:id', requierePermiso('actividades', 'editar'), (req, res) => {
  const b = req.body || {};
  try {
    const previa = db.prepare('SELECT * FROM act_rutinas WHERE id = ?').get([Number(req.params.id)]);
    if (!previa) return res.status(404).json({ error: 'Actividad no encontrada.' });
    const titulo = L.texto(b.titulo, 140);
    if (!titulo) throw L.errorUsuario('La actividad necesita un nombre.');
    const d = leerRutina(b);
    db.prepare(`
      UPDATE act_rutinas SET titulo = ?, detalle = ?, asignado_tipo = ?, usuario_id = ?, rol = ?, turno = ?, hora = ?,
        repeticion = ?, dias_semana = ?, fecha = ?, fecha_inicio = ?, actualizado_en = datetime('now') WHERE id = ?
    `).run([titulo, L.texto(b.detalle, 400), d.asignado_tipo, d.usuario_id, d.rol, d.turno, d.hora, d.repeticion, d.dias_semana, d.fecha,
      d.fecha && d.fecha < previa.fecha_inicio ? d.fecha : (d.fecha || previa.fecha_inicio), previa.id]);
    res.json(rutinaPublica(db.prepare('SELECT * FROM act_rutinas WHERE id = ?').get([previa.id])));
  } catch (err) { enviarError(res, err, 'No se pudo guardar la actividad.') }
});

// POST /api/gestion/actividades/rutinas/:id/quitar  → deja de aplicar desde hoy (lo de días pasados se conserva)
router.post('/rutinas/:id/quitar', requierePermiso('actividades', 'editar'), (req, res) => {
  try {
    const r = db.prepare('SELECT * FROM act_rutinas WHERE id = ?').get([Number(req.params.id)]);
    if (!r) return res.status(404).json({ error: 'Actividad no encontrada.' });
    const hoy = L.hoyMexico();
    const hechaHoy = db.prepare('SELECT 1 FROM act_hechas WHERE rutina_id = ? AND fecha = ?').get([r.id, hoy]);
    // Si hoy ya se hizo, se conserva en el día de hoy y deja de aplicar desde mañana
    db.prepare("UPDATE act_rutinas SET baja_en = ?, actualizado_en = datetime('now') WHERE id = ?").run([hechaHoy ? L.sumarDias(hoy, 1) : hoy, r.id]);
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo quitar la actividad.') }
});

// POST /api/gestion/actividades/rutinas/copiar  { de: {tipo, id}, a: {tipo, id} }  → copia las rutinas vigentes
router.post('/rutinas/copiar', requierePermiso('actividades', 'editar'), (req, res) => {
  const { de, a } = req.body || {};
  try {
    const destino = leerRutina({ asignado_tipo: a?.tipo, usuario_id: a?.id, rol: a?.id, repeticion: 'diaria' });
    const hoy = L.hoyMexico();
    const filtro = de?.tipo === 'rol' ? ['rol = ?', String(de.id)] : ['usuario_id = ?', Number(de?.id)];
    const origen = db.prepare(`
      SELECT * FROM act_rutinas WHERE asignado_tipo = ? AND ${filtro[0]}
        AND (baja_en IS NULL OR baja_en > ?) AND NOT (repeticion = 'una_vez' AND fecha < ?)
    `).all([de?.tipo === 'rol' ? 'rol' : 'usuario', filtro[1], hoy, hoy]);
    if (!origen.length) throw L.errorUsuario('No hay actividades para copiar.');
    // No duplica las que el destino ya tiene con el mismo nombre
    const yaTiene = new Set(db.prepare(`
      SELECT titulo FROM act_rutinas WHERE asignado_tipo = ? AND ${destino.asignado_tipo === 'rol' ? 'rol = ?' : 'usuario_id = ?'} AND (baja_en IS NULL OR baja_en > ?)
    `).all([destino.asignado_tipo, destino.asignado_tipo === 'rol' ? destino.rol : destino.usuario_id, hoy]).map(r => L.normalizar(r.titulo)));
    const ins = db.prepare(`
      INSERT INTO act_rutinas (titulo, detalle, asignado_tipo, usuario_id, rol, turno, hora, repeticion, dias_semana, fecha, fecha_inicio, creado_por, creado_por_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let copiadas = 0;
    db.exec('BEGIN');
    try {
      for (const r of origen) {
        if (yaTiene.has(L.normalizar(r.titulo))) continue;
        ins.run([r.titulo, r.detalle, destino.asignado_tipo, destino.usuario_id, destino.rol, r.turno, r.hora, r.repeticion, r.dias_semana, r.fecha,
          r.fecha || hoy, req.usuario.id, req.usuario.nombre || '']);
        copiadas++;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json({ copiadas, omitidas: origen.length - copiadas });
  } catch (err) { enviarError(res, err, 'No se pudieron copiar las actividades.') }
});

module.exports = router;
