// Rol del día: la hoja que la encargada hacía en Word y mandaba por WhatsApp.
// Una columna por persona con su horario, los residentes que atiende y sus tareas del día.
// Se arma rápido copiando el de ayer y moviendo lo que cambia; cada quien ve su columna en
// "Mis actividades" y marca sus tareas. Quien tiene un residente en su columna ese día
// también puede registrar su baño.
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../database');
const { requireAuth } = require('./auth');
const { ROLES, puede, requierePermiso } = require('../permisos');
const L = require('../medicacion/logica');

db.exec(`
  CREATE TABLE IF NOT EXISTS act_rol (
    fecha          TEXT PRIMARY KEY,
    datos          TEXT NOT NULL DEFAULT '{"columnas":[]}',
    version        INTEGER NOT NULL DEFAULT 1,
    actualizado_por_nombre TEXT DEFAULT '',
    actualizado_en TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS act_rol_hechas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha          TEXT NOT NULL,
    uid            TEXT NOT NULL,
    usuario_id     INTEGER,
    usuario_nombre TEXT DEFAULT '',
    nota           TEXT DEFAULT '',
    hecha_en       TEXT NOT NULL,
    UNIQUE (fecha, uid)
  )
`);
db.exec(`CREATE TABLE IF NOT EXISTS act_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`);

// Lista de tareas de siempre (de donde se eligen rápido) y horarios. Se editan desde la pantalla.
const BASE_INICIAL = {
  tareas: [
    'Sacar pastilleros', 'Poner insulinas', 'Registrar los medicamentos del desayuno', 'Limpiar mesas desayuno', 'Apagar boilers',
    'Hidratación matutina 11 AM', 'Sacar toallas a lavar', 'Registrar medicamentos del almuerzo y cena', 'Hidratación vespertina',
    'Colación matutina', 'Sacar cesto de ropa', 'Sacar pañales', 'Limpiar mesas almuerzo', 'Guardar pastilleros', 'Elaborar reportes',
    'Entregar central limpia', 'Limpiar mesas cena', 'Entregar turno', 'Colación vespertina', 'Ayudar en cocina (12:30 pm)',
    'Sacar basura', 'Meter toallas', 'Dar cena',
  ],
  horarios: ['7 - 3', '7 - 7', '7 - 1', '11 - 7'],
};

const MAX_COLUMNAS = 40, MAX_TAREAS = 60, MAX_RESIDENTES = 60;
const nuevoUid = () => crypto.randomBytes(6).toString('hex');
const uidValido = (u) => typeof u === 'string' && /^[a-z0-9]{6,24}$/.test(u);

function leerJson(s, d) { try { return JSON.parse(s) } catch { return d } }

function base() {
  const fila = db.prepare("SELECT valor FROM act_config WHERE clave = 'rol_base'").get();
  const v = fila ? leerJson(fila.valor, null) : null;
  return {
    tareas: Array.isArray(v?.tareas) ? v.tareas : BASE_INICIAL.tareas,
    horarios: Array.isArray(v?.horarios) ? v.horarios : BASE_INICIAL.horarios,
  };
}

function rolDe(fecha) {
  const f = db.prepare('SELECT * FROM act_rol WHERE fecha = ?').get([fecha]);
  if (!f) return { fecha, columnas: [], version: 0, actualizado_por_nombre: '', actualizado_en: null };
  const d = leerJson(f.datos, {});
  return { fecha, columnas: Array.isArray(d.columnas) ? d.columnas : [], version: f.version, actualizado_por_nombre: f.actualizado_por_nombre, actualizado_en: f.actualizado_en };
}

function hechasDe(fecha) {
  return Object.fromEntries(db.prepare('SELECT * FROM act_rol_hechas WHERE fecha = ?').all([fecha])
    .map(h => [h.uid, { usuario_id: h.usuario_id, usuario_nombre: h.usuario_nombre, hecha_en: h.hecha_en, nota: h.nota }]));
}

/** Limpia y valida las columnas que manda la pantalla. */
function limpiarColumnas(columnas) {
  if (!Array.isArray(columnas)) throw L.errorUsuario('El rol no tiene un formato válido.');
  if (columnas.length > MAX_COLUMNAS) throw L.errorUsuario(`Son demasiadas personas (máximo ${MAX_COLUMNAS}).`);
  const usuarios = new Set(db.prepare('SELECT id FROM usuarios').all().map(u => u.id));
  const residentes = new Set(db.prepare('SELECT id FROM residentes').all().map(r => r.id));
  const vistos = new Set(), uids = new Set();
  return columnas.map(c => {
    const usuario_id = usuarios.has(Number(c?.usuario_id)) ? Number(c.usuario_id) : null;
    const nombre = L.texto(c?.nombre, 60);
    if (!usuario_id && !nombre) throw L.errorUsuario('Cada columna necesita una persona.');
    if (usuario_id) {
      if (vistos.has(usuario_id)) throw L.errorUsuario('Una persona aparece dos veces en el rol.');
      vistos.add(usuario_id);
    }
    const res = (Array.isArray(c.residentes) ? c.residentes : []).slice(0, MAX_RESIDENTES)
      .filter(r => residentes.has(Number(r?.id)))
      .map(r => ({ id: Number(r.id), resaltado: !!r.resaltado }));
    const tareas = (Array.isArray(c.tareas) ? c.tareas : []).slice(0, MAX_TAREAS)
      .map(t => {
        const titulo = L.texto(t?.titulo, 140);
        if (!titulo) return null;
        let uid = uidValido(t.uid) && !uids.has(t.uid) ? t.uid : nuevoUid();
        uids.add(uid);
        return { uid, titulo, resaltada: !!t.resaltada };
      }).filter(Boolean);
    return { usuario_id, nombre: usuario_id ? '' : nombre, horario: L.texto(c.horario, 30), residentes: res, tareas };
  });
}

function guardar(fecha, columnas, usuario) {
  db.prepare(`
    INSERT INTO act_rol (fecha, datos, version, actualizado_por_nombre, actualizado_en) VALUES (?, ?, 1, ?, datetime('now'))
    ON CONFLICT(fecha) DO UPDATE SET datos = excluded.datos, version = act_rol.version + 1,
      actualizado_por_nombre = excluded.actualizado_por_nombre, actualizado_en = excluded.actualizado_en
  `).run([fecha, JSON.stringify({ columnas }), usuario.nombre || '']);
}

/** Nombre corto como en la hoja: el primer nombre (o dos palabras si se repite). */
function residentesCortos() {
  const filas = db.prepare(`
    SELECT r.id, r.nombre, r.iniciales, r.foto, r.habitacion, r.ubicacion, r.tipo_servicio, p.dias_semana
    FROM residentes r LEFT JOIN banos_programa p ON p.residente_id = r.id
    ORDER BY r.nombre COLLATE NOCASE
  `).all();
  const palabras = (n) => String(n || '').trim().split(/\s+/);
  const cuenta = {};
  for (const r of filas) { const k = L.normalizar(palabras(r.nombre)[0]); cuenta[k] = (cuenta[k] || 0) + 1 }
  return filas.map(r => {
    const p = palabras(r.nombre);
    const corto = cuenta[L.normalizar(p[0])] > 1 ? p.slice(0, 2).join(' ') : p[0];
    const dias = leerJson(r.dias_semana, []);
    return { ...r, corto, dias_bano: Array.isArray(dias) ? dias : [] };
  });
}

/** La columna de una persona en el rol de un día (o null). */
function columnaDe(fecha, usuarioId) {
  return rolDe(fecha).columnas.find(c => c.usuario_id === usuarioId) || null;
}

/** ¿Ese residente está en la columna de esa persona ese día? (para que pueda registrar su baño) */
function atiendeEnRol(fecha, usuarioId, residenteId) {
  try { return !!columnaDe(fecha, usuarioId)?.residentes.some(r => r.id === residenteId) } catch { return false }
}

/** Lo que le toca a una persona según el rol (para Mis actividades y Monitoreo). */
function rolDeUsuario(fecha, usuarioId, extras = {}) {
  const rol = extras.rol || rolDe(fecha);
  const col = rol.columnas.find(c => c.usuario_id === usuarioId);
  if (!col) return null;
  const hechas = extras.hechas || hechasDe(fecha);
  const res = extras.residentes || residentesCortos();
  const porId = Object.fromEntries(res.map(r => [r.id, r]));
  return {
    horario: col.horario,
    residentes: col.residentes.filter(r => porId[r.id]).map(r => {
      const x = porId[r.id];
      return { id: x.id, nombre: x.nombre, corto: x.corto, iniciales: x.iniciales, foto: x.foto, habitacion: x.habitacion, resaltado: r.resaltado,
        toca_bano: x.dias_bano.includes(L.diaSemana(fecha)) };
    }),
    tareas: col.tareas.map(t => ({ uid: t.uid, titulo: t.titulo, resaltada: t.resaltada, hecha: hechas[t.uid] || null })),
  };
}

const enviarError = (res, err, msg) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(msg, err);
  res.status(500).json({ error: msg });
};

router.use(requireAuth);

// GET /api/gestion/rol?fecha=  → el rol del día con todo lo necesario para armarlo
router.get('/', requierePermiso('actividades', 'ver'), (req, res) => {
  const fecha = L.esFecha(req.query.fecha) ? req.query.fecha : L.hoyMexico();
  try {
    const anterior = db.prepare(`SELECT fecha FROM act_rol WHERE fecha < ? AND datos NOT LIKE '%"columnas":[]%' ORDER BY fecha DESC LIMIT 1`).get([fecha]);
    const dia = L.diaSemana(fecha);
    res.json({
      fecha, hoy: L.hoyMexico(), rol: rolDe(fecha), hechas: hechasDe(fecha), base: base(),
      anterior: anterior?.fecha || null,
      personal: db.prepare('SELECT id, nombre, rol FROM usuarios WHERE activo = 1 AND aprobado = 1 ORDER BY nombre COLLATE NOCASE').all()
        .map(u => ({ ...u, rol_label: ROLES[u.rol]?.label || u.rol })),
      residentes: residentesCortos().map(r => ({
        id: r.id, nombre: r.nombre, corto: r.corto, iniciales: r.iniciales, habitacion: r.habitacion,
        ubicacion: r.ubicacion || 'residencia', tipo_servicio: r.tipo_servicio, toca_bano: r.dias_bano.includes(dia),
      })),
    });
  } catch (err) { enviarError(res, err, 'No se pudo cargar el rol del día.') }
});

// PUT /api/gestion/rol/:fecha  { columnas, version }
router.put('/:fecha', requierePermiso('actividades', 'editar'), (req, res) => {
  const fecha = req.params.fecha;
  if (!L.esFecha(fecha)) return res.status(400).json({ error: 'Fecha no válida.' });
  try {
    const actual = rolDe(fecha);
    // Si alguien más lo cambió mientras tanto, no se pisa: se regresa el más nuevo
    if (Number(req.body?.version) !== actual.version) {
      return res.status(409).json({ error: `${actual.actualizado_por_nombre || 'Otra persona'} cambió el rol mientras lo editabas. Se cargó su versión.`, rol: actual });
    }
    guardar(fecha, limpiarColumnas(req.body?.columnas), req.usuario);
    res.json({ rol: rolDe(fecha) });
  } catch (err) { enviarError(res, err, 'No se pudo guardar el rol.') }
});

// POST /api/gestion/rol/:fecha/copiar  { de }  → copia personas, horarios, residentes y tareas de otro día
router.post('/:fecha/copiar', requierePermiso('actividades', 'editar'), (req, res) => {
  const fecha = req.params.fecha, de = req.body?.de;
  if (!L.esFecha(fecha) || !L.esFecha(de)) return res.status(400).json({ error: 'Fecha no válida.' });
  if (fecha === de) return res.status(400).json({ error: 'Elige un día distinto.' });
  try {
    const origen = rolDe(de);
    if (!origen.columnas.length) throw L.errorUsuario('Ese día no tiene rol para copiar.');
    const activos = new Set(db.prepare('SELECT id FROM usuarios WHERE activo = 1').all().map(u => u.id));
    const columnas = origen.columnas
      .filter(c => !c.usuario_id || activos.has(c.usuario_id))
      .map(c => ({ ...c, tareas: c.tareas.map(t => ({ ...t, uid: nuevoUid() })) }));
    guardar(fecha, limpiarColumnas(columnas), req.usuario);
    res.json({ rol: rolDe(fecha) });
  } catch (err) { enviarError(res, err, 'No se pudo copiar el rol.') }
});

// PUT /api/gestion/rol/base  { tareas, horarios }  → la lista de tareas de siempre
router.put('/base/lista', requierePermiso('actividades', 'editar'), (req, res) => {
  const limpiar = (v, max) => [...new Map((Array.isArray(v) ? v : [])
    .map(t => L.texto(String(t || '').replace(/^\s*[-•*·]+\s*/, ''), max)).filter(Boolean)
    .map(t => [L.normalizar(t), t])).values()].slice(0, 150);
  try {
    const valor = { tareas: limpiar(req.body?.tareas, 140), horarios: limpiar(req.body?.horarios, 30) };
    db.prepare(`INSERT INTO act_config (clave, valor) VALUES ('rol_base', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`).run([JSON.stringify(valor)]);
    res.json(base());
  } catch (err) { enviarError(res, err, 'No se pudo guardar la lista.') }
});

/** Quién puede marcar una tarea del rol: la persona de esa columna o quien arma el rol. */
function tareaYPermiso(req, fecha) {
  const hoy = L.hoyMexico();
  const editor = puede(req.usuario, 'actividades', 'editar');
  if (fecha > hoy) throw L.errorUsuario('No se puede marcar una tarea de un día que no ha llegado.');
  if (!editor && L.diasEntre(fecha, hoy) > 1) throw L.errorUsuario('Solo se pueden marcar tareas de hoy o de ayer.');
  const col = rolDe(fecha).columnas.find(c => c.tareas.some(t => t.uid === req.params.uid));
  if (!col) throw L.errorUsuario('Esa tarea ya no está en el rol.', 404);
  if (col.usuario_id !== req.usuario.id && !editor) throw L.errorUsuario('Esa tarea no es tuya.', 403);
  return col.tareas.find(t => t.uid === req.params.uid);
}

// POST /api/gestion/rol/:fecha/tarea/:uid/hecha  { nota }
router.post('/:fecha/tarea/:uid/hecha', (req, res) => {
  const fecha = req.params.fecha;
  if (!L.esFecha(fecha)) return res.status(400).json({ error: 'Fecha no válida.' });
  try {
    const t = tareaYPermiso(req, fecha);
    db.prepare(`
      INSERT INTO act_rol_hechas (fecha, uid, usuario_id, usuario_nombre, nota, hecha_en) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fecha, uid) DO UPDATE SET nota = excluded.nota
    `).run([fecha, t.uid, req.usuario.id, req.usuario.nombre || '', L.texto(req.body?.nota, 300), L.ahoraMexico().hora]);
    res.json({ uid: t.uid, titulo: t.titulo, resaltada: t.resaltada, hecha: hechasDe(fecha)[t.uid] });
  } catch (err) { enviarError(res, err, 'No se pudo marcar la tarea.') }
});

// DELETE /api/gestion/rol/:fecha/tarea/:uid/hecha
router.delete('/:fecha/tarea/:uid/hecha', (req, res) => {
  const fecha = req.params.fecha;
  if (!L.esFecha(fecha)) return res.status(400).json({ error: 'Fecha no válida.' });
  try {
    const t = tareaYPermiso(req, fecha);
    const h = db.prepare('SELECT * FROM act_rol_hechas WHERE fecha = ? AND uid = ?').get([fecha, t.uid]);
    if (h && h.usuario_id !== req.usuario.id && !puede(req.usuario, 'actividades', 'editar')) {
      throw L.errorUsuario(`La marcó ${h.usuario_nombre || 'otra persona'}; solo esa persona o la encargada la pueden desmarcar.`, 403);
    }
    if (h) db.prepare('DELETE FROM act_rol_hechas WHERE id = ?').run([h.id]);
    res.json({ uid: t.uid, titulo: t.titulo, resaltada: t.resaltada, hecha: null });
  } catch (err) { enviarError(res, err, 'No se pudo desmarcar la tarea.') }
});

module.exports = router;
module.exports.rolDe = rolDe;
module.exports.hechasDe = hechasDe;
module.exports.rolDeUsuario = rolDeUsuario;
module.exports.residentesCortos = residentesCortos;
module.exports.atiendeEnRol = atiendeEnRol;
