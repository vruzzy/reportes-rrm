// Medicación: esquema por residente, rondas de toma (con descuento de inventario) y existencias.
//
// Cómo se usa en la residencia: los pastilleros se preparan aparte y una persona reparte.
// Por eso no se marca pastilla por pastilla: se confirma la ronda completa ("todos tomaron")
// y solo se anotan las excepciones. Al confirmar, se descuenta del inventario.
//
// Las tablas se crean aquí (y no en database.js) para que el módulo sea autocontenido.
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const { requierePermiso } = require('../permisos');

// ── Tablas ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS med_medicamentos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id  INTEGER NOT NULL,
    nombre        TEXT NOT NULL,              -- ej. "Losartán 50 mg"
    unidad        TEXT NOT NULL DEFAULT 'tableta',
    dosis         REAL NOT NULL DEFAULT 1,    -- piezas por toma (0.5 = media tableta)
    tomas         TEXT NOT NULL DEFAULT '',   -- csv de TOMAS (vacío si es PRN)
    prn           INTEGER NOT NULL DEFAULT 0, -- 1 = solo si hace falta
    indicaciones  TEXT DEFAULT '',
    medico        TEXT DEFAULT '',
    fecha_inicio  TEXT DEFAULT '',
    fecha_fin     TEXT DEFAULT '',
    existencia    REAL NOT NULL DEFAULT 0,
    activo        INTEGER NOT NULL DEFAULT 1, -- 0 = suspendido
    creado_en     TEXT DEFAULT (datetime('now')),
    actualizado_en TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE CASCADE
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS med_rondas (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha          TEXT NOT NULL,
    toma           TEXT NOT NULL,
    hora           TEXT DEFAULT '',
    notas          TEXT DEFAULT '',
    usuario_id     INTEGER,
    usuario_nombre TEXT DEFAULT '',
    creado_en      TEXT DEFAULT (datetime('now')),
    UNIQUE (fecha, toma)
  )
`);
// Qué pasó con cada residente en una ronda
db.exec(`
  CREATE TABLE IF NOT EXISTS med_ronda_residentes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ronda_id     INTEGER NOT NULL,
    residente_id INTEGER NOT NULL,
    estado       TEXT NOT NULL,               -- dada | rechazo | fuera
    nota         TEXT DEFAULT '',
    FOREIGN KEY (ronda_id) REFERENCES med_rondas(id) ON DELETE CASCADE
  )
`);
// Bitácora del inventario: cada entrada, descuento o ajuste
db.exec(`
  CREATE TABLE IF NOT EXISTS med_movimientos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    medicamento_id INTEGER NOT NULL,
    tipo           TEXT NOT NULL,             -- entrada | toma | prn | ajuste | reverso
    cantidad       REAL NOT NULL,             -- positiva suma, negativa descuenta
    existencia     REAL NOT NULL,             -- existencia después del movimiento
    ronda_id       INTEGER,
    nota           TEXT DEFAULT '',
    usuario_id     INTEGER,
    usuario_nombre TEXT DEFAULT '',
    creado_en      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (medicamento_id) REFERENCES med_medicamentos(id) ON DELETE CASCADE
  )
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_med_res ON med_medicamentos (residente_id)') } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_med_mov ON med_movimientos (medicamento_id, creado_en)') } catch {}

router.use(requireAuth);

// ── Constantes y utilidades ──────────────────────────────────────────────────
const TOMAS    = ['ayunas', 'desayuno', 'comida', 'cena', 'dormir'];
const UNIDADES = ['tableta', 'cápsula', 'ml', 'gotas', 'sobre', 'parche', 'inyección', 'disparo', 'pieza'];
const ESTADOS  = ['dada', 'rechazo', 'fuera'];
// Rechazó: la dosis del pastillero se desecha, así que sí se descuenta.
// No estaba (hospital, salida): la dosis regresa, no se descuenta.
const DESCUENTA = { dada: true, rechazo: true, fuera: false };

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const esHora  = (s) => /^\d{2}:\d{2}$/.test(String(s || ''));
const texto   = (v, max = 160) => String(v ?? '').trim().slice(0, max);
const redondear = (n) => Math.round(n * 100) / 100;

function numero(v, { min = 0, max = 100000, nombre = 'La cantidad' } = {}) {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${nombre} no es válida.`);
  return redondear(n);
}

function listaTomas(csv) {
  return String(csv || '').split(',').filter(t => TOMAS.includes(t));
}

/** Agrega datos calculados: tomas como arreglo, consumo diario y días restantes */
function conCalculos(m) {
  const tomas = listaTomas(m.tomas);
  const consumo = m.prn ? 0 : redondear(m.dosis * tomas.length);
  return {
    ...m,
    tomas,
    consumo_diario: consumo,
    dias_restantes: consumo > 0 ? Math.max(0, Math.floor(m.existencia / consumo)) : null,
  };
}

/** ¿El medicamento aplica en esa fecha? (activo y dentro de inicio/fin) */
function vigente(m, fecha) {
  return m.activo && (!m.fecha_inicio || m.fecha_inicio <= fecha) && (!m.fecha_fin || m.fecha_fin >= fecha);
}

function sanitizar(b) {
  const nombre = texto(b.nombre, 120);
  if (!nombre) throw new Error('Escribe el nombre del medicamento.');
  const prn = b.prn ? 1 : 0;
  const tomas = prn ? [] : [...new Set((Array.isArray(b.tomas) ? b.tomas : listaTomas(b.tomas)).filter(t => TOMAS.includes(t)))];
  if (!prn && !tomas.length) throw new Error('Elige al menos una toma (o márcalo como "solo si hace falta").');
  const fecha_inicio = texto(b.fecha_inicio, 10);
  const fecha_fin    = texto(b.fecha_fin, 10);
  if ((fecha_inicio && !esFecha(fecha_inicio)) || (fecha_fin && !esFecha(fecha_fin))) throw new Error('Fecha no válida.');
  if (fecha_inicio && fecha_fin && fecha_fin < fecha_inicio) throw new Error('La fecha de fin es anterior a la de inicio.');
  return {
    nombre,
    unidad: UNIDADES.includes(b.unidad) ? b.unidad : 'tableta',
    dosis: numero(b.dosis, { min: 0.01, max: 1000, nombre: 'La dosis' }),
    tomas: TOMAS.filter(t => tomas.includes(t)).join(','),
    prn,
    indicaciones: texto(b.indicaciones, 300),
    medico: texto(b.medico, 120),
    fecha_inicio,
    fecha_fin,
  };
}

function quien(req) {
  return [req.usuario.id, req.usuario.nombre || ''];
}

/** Mueve el inventario de un medicamento y lo anota en la bitácora (dentro de una transacción) */
function mover(medId, tipo, cantidad, req, { ronda_id = null, nota = '' } = {}) {
  const m = db.prepare('SELECT existencia FROM med_medicamentos WHERE id = ?').get([medId]);
  const existencia = redondear(m.existencia + cantidad);
  db.prepare("UPDATE med_medicamentos SET existencia = ?, actualizado_en = datetime('now') WHERE id = ?").run([existencia, medId]);
  db.prepare(`INSERT INTO med_movimientos (medicamento_id, tipo, cantidad, existencia, ronda_id, nota, usuario_id, usuario_nombre)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run([medId, tipo, redondear(cantidad), existencia, ronda_id, nota, ...quien(req)]);
  return existencia;
}

function transaccion(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    try { db.exec('ROLLBACK') } catch {}
    throw err;
  }
}

const SELECT_MED = `
  SELECT m.*, r.nombre AS residente_nombre, r.iniciales AS residente_iniciales, r.ubicacion AS residente_ubicacion
  FROM med_medicamentos m JOIN residentes r ON r.id = m.residente_id`;

function medicamento(id) {
  const m = db.prepare(`${SELECT_MED} WHERE m.id = ?`).get([id]);
  return m ? conCalculos(m) : null;
}

function enviarError(res, err, mensaje) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(mensaje, err);
  res.status(500).json({ error: mensaje });
}

function errorUsuario(status, message) {
  return Object.assign(new Error(message), { status });
}

// ── Residentes (datos mínimos, para no depender del permiso de Listado) ─────
router.get('/residentes', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT id, nombre, iniciales, foto, ubicacion, tipo_servicio FROM residentes ORDER BY nombre COLLATE NOCASE
    `).all());
  } catch (err) { enviarError(res, err, 'No se pudieron cargar los residentes.') }
});

// ── Medicamentos ─────────────────────────────────────────────────────────────
// GET /medicamentos?residente_id=&todos=1  (por defecto solo activos)
router.get('/medicamentos', requierePermiso('medicacion', 'ver'), (req, res) => {
  const where = [], params = [];
  if (req.query.residente_id) { where.push('m.residente_id = ?'); params.push(Number(req.query.residente_id)) }
  if (!req.query.todos) where.push('m.activo = 1');
  try {
    const filas = db.prepare(`${SELECT_MED} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY m.activo DESC, r.nombre COLLATE NOCASE, m.nombre COLLATE NOCASE`).all(params);
    res.json(filas.map(conCalculos));
  } catch (err) { enviarError(res, err, 'No se pudieron cargar los medicamentos.') }
});

router.post('/medicamentos', requierePermiso('medicacion', 'editar'), (req, res) => {
  let campos, existencia;
  const residente_id = Number(req.body?.residente_id);
  try {
    campos = sanitizar(req.body || {});
    existencia = req.body.existencia === '' || req.body.existencia == null ? 0 : numero(req.body.existencia, { nombre: 'La existencia' });
  } catch (err) { return res.status(400).json({ error: err.message }) }
  try {
    if (!db.prepare('SELECT id FROM residentes WHERE id = ?').get([residente_id])) return res.status(404).json({ error: 'Residente no encontrado.' });
    const id = transaccion(() => {
      const cols = Object.keys(campos);
      const r = db.prepare(`INSERT INTO med_medicamentos (residente_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`)
        .run([residente_id, ...cols.map(c => campos[c])]);
      const nuevo = Number(r.lastInsertRowid);
      if (existencia > 0) mover(nuevo, 'entrada', existencia, req, { nota: 'Existencia inicial' });
      return nuevo;
    });
    res.status(201).json(medicamento(id));
  } catch (err) { enviarError(res, err, 'No se pudo guardar el medicamento.') }
});

router.put('/medicamentos/:id', requierePermiso('medicacion', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  let campos;
  try { campos = sanitizar(req.body || {}) } catch (err) { return res.status(400).json({ error: err.message }) }
  try {
    const cols = Object.keys(campos);
    const r = db.prepare(`UPDATE med_medicamentos SET ${cols.map(c => `${c} = ?`).join(', ')}, actualizado_en = datetime('now') WHERE id = ?`)
      .run([...cols.map(c => campos[c]), id]);
    if (!r.changes) return res.status(404).json({ error: 'Medicamento no encontrado.' });
    res.json(medicamento(id));
  } catch (err) { enviarError(res, err, 'No se pudo guardar el medicamento.') }
});

// Suspender / reactivar (no se borra para conservar el historial)
router.patch('/medicamentos/:id/activo', requierePermiso('medicacion', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  try {
    const r = db.prepare("UPDATE med_medicamentos SET activo = ?, actualizado_en = datetime('now') WHERE id = ?").run([req.body?.activo ? 1 : 0, id]);
    if (!r.changes) return res.status(404).json({ error: 'Medicamento no encontrado.' });
    res.json(medicamento(id));
  } catch (err) { enviarError(res, err, 'No se pudo actualizar el medicamento.') }
});

// Borrar solo si se capturó por error (sin rondas confirmadas)
router.delete('/medicamentos/:id', requierePermiso('medicacion', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  try {
    const usado = db.prepare("SELECT 1 FROM med_movimientos WHERE medicamento_id = ? AND tipo IN ('toma', 'prn') LIMIT 1").get([id]);
    if (usado) return res.status(409).json({ error: 'Ya tiene tomas registradas. Suspéndelo en lugar de borrarlo.' });
    transaccion(() => {
      db.prepare('DELETE FROM med_movimientos WHERE medicamento_id = ?').run([id]);
      db.prepare('DELETE FROM med_medicamentos WHERE id = ?').run([id]);
    });
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo borrar el medicamento.') }
});

// ── Inventario ───────────────────────────────────────────────────────────────
// POST /medicamentos/:id/movimiento  { tipo: entrada | ajuste | prn, cantidad, nota }
//   entrada: suma (llegó medicamento) · ajuste: fija la existencia contada · prn: da una dosis "si hace falta"
router.post('/medicamentos/:id/movimiento', requierePermiso('medicacion', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  const { tipo } = req.body || {};
  const nota = texto(req.body?.nota, 200);
  let cantidad;
  try {
    if (!['entrada', 'ajuste', 'prn'].includes(tipo)) throw new Error('Movimiento no válido.');
    cantidad = numero(req.body.cantidad, { min: tipo === 'ajuste' ? 0 : 0.01, nombre: 'La cantidad' });
    if (tipo === 'prn' && !nota) throw new Error('Anota el motivo por el que se dio.');
  } catch (err) { return res.status(400).json({ error: err.message }) }
  try {
    const m = db.prepare('SELECT * FROM med_medicamentos WHERE id = ?').get([id]);
    if (!m) return res.status(404).json({ error: 'Medicamento no encontrado.' });
    transaccion(() => {
      if (tipo === 'entrada') mover(id, 'entrada', cantidad, req, { nota });
      else if (tipo === 'prn') mover(id, 'prn', -cantidad, req, { nota });
      else mover(id, 'ajuste', cantidad - m.existencia, req, { nota: nota || 'Conteo físico' });
    });
    res.json(medicamento(id));
  } catch (err) { enviarError(res, err, 'No se pudo registrar el movimiento.') }
});

// GET /medicamentos/:id/movimientos  → últimos 100
router.get('/medicamentos/:id/movimientos', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT mv.*, ro.fecha AS ronda_fecha, ro.toma AS ronda_toma
      FROM med_movimientos mv LEFT JOIN med_rondas ro ON ro.id = mv.ronda_id
      WHERE mv.medicamento_id = ? ORDER BY mv.id DESC LIMIT 100
    `).all([Number(req.params.id)]));
  } catch (err) { enviarError(res, err, 'No se pudo cargar el historial.') }
});

// ── Rondas ───────────────────────────────────────────────────────────────────
/** Lo que toca en una toma: residentes con sus medicamentos vigentes */
function pendientesDe(fecha, toma) {
  const meds = db.prepare(`${SELECT_MED} WHERE m.activo = 1 AND m.prn = 0 ORDER BY r.nombre COLLATE NOCASE, m.nombre COLLATE NOCASE`).all()
    .map(conCalculos)
    .filter(m => m.tomas.includes(toma) && vigente(m, fecha));
  const porResidente = new Map();
  for (const m of meds) {
    if (!porResidente.has(m.residente_id)) {
      porResidente.set(m.residente_id, {
        residente_id: m.residente_id, nombre: m.residente_nombre, iniciales: m.residente_iniciales,
        ubicacion: m.residente_ubicacion || 'residencia', medicamentos: [],
      });
    }
    porResidente.get(m.residente_id).medicamentos.push(m);
  }
  return [...porResidente.values()];
}

function rondaCompleta(ronda) {
  if (!ronda) return null;
  const residentes = db.prepare('SELECT residente_id, estado, nota FROM med_ronda_residentes WHERE ronda_id = ?').all([ronda.id]);
  return { ...ronda, residentes };
}

// GET /dia?fecha=  → estado de cada toma del día
router.get('/dia', requierePermiso('medicacion', 'ver'), (req, res) => {
  const { fecha } = req.query;
  if (!esFecha(fecha)) return res.status(400).json({ error: 'Fecha no válida.' });
  try {
    const rondas = db.prepare('SELECT * FROM med_rondas WHERE fecha = ?').all([fecha]);
    res.json(TOMAS.map(toma => {
      const lista = pendientesDe(fecha, toma);
      return {
        toma,
        residentes: lista.length,
        medicamentos: lista.reduce((n, r) => n + r.medicamentos.length, 0),
        ronda: rondas.find(r => r.toma === toma) || null,
      };
    }));
  } catch (err) { enviarError(res, err, 'No se pudo cargar el día.') }
});

// GET /ronda?fecha=&toma=  → lista para repartir y, si ya se confirmó, lo que se registró
router.get('/ronda', requierePermiso('medicacion', 'ver'), (req, res) => {
  const { fecha, toma } = req.query;
  if (!esFecha(fecha) || !TOMAS.includes(toma)) return res.status(400).json({ error: 'Fecha o toma no válidas.' });
  try {
    const ronda = db.prepare('SELECT * FROM med_rondas WHERE fecha = ? AND toma = ?').get([fecha, toma]);
    res.json({ fecha, toma, residentes: pendientesDe(fecha, toma), ronda: rondaCompleta(ronda) });
  } catch (err) { enviarError(res, err, 'No se pudo cargar la toma.') }
});

// POST /ronda  { fecha, toma, hora, notas, excepciones: { [residente_id]: { estado, nota } } }
// Todos los que no estén en excepciones quedan como "dada". Descuenta del inventario.
router.post('/ronda', requierePermiso('medicacion', 'editar'), (req, res) => {
  const b = req.body || {};
  if (!esFecha(b.fecha) || !TOMAS.includes(b.toma)) return res.status(400).json({ error: 'Fecha o toma no válidas.' });
  const excepciones = b.excepciones && typeof b.excepciones === 'object' ? b.excepciones : {};
  try {
    const ronda = transaccion(() => {
      if (db.prepare('SELECT id FROM med_rondas WHERE fecha = ? AND toma = ?').get([b.fecha, b.toma])) {
        throw errorUsuario(409, 'Esta toma ya se confirmó. Recarga para ver quién la registró.');
      }
      const lista = pendientesDe(b.fecha, b.toma);
      if (!lista.length) throw errorUsuario(400, 'No hay medicamentos programados en esta toma.');
      const r = db.prepare('INSERT INTO med_rondas (fecha, toma, hora, notas, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?, ?)')
        .run([b.fecha, b.toma, esHora(b.hora) ? b.hora : '', texto(b.notas, 300), ...quien(req)]);
      const rondaId = Number(r.lastInsertRowid);
      for (const res_ of lista) {
        const ex = excepciones[res_.residente_id];
        const estado = ESTADOS.includes(ex?.estado) ? ex.estado : 'dada';
        const nota = texto(ex?.nota, 200);
        db.prepare('INSERT INTO med_ronda_residentes (ronda_id, residente_id, estado, nota) VALUES (?, ?, ?, ?)')
          .run([rondaId, res_.residente_id, estado, nota]);
        if (!DESCUENTA[estado]) continue;
        for (const m of res_.medicamentos) {
          mover(m.id, 'toma', -m.dosis, req, { ronda_id: rondaId, nota: estado === 'rechazo' ? `Rechazó${nota ? ': ' + nota : ''}` : '' });
        }
      }
      return db.prepare('SELECT * FROM med_rondas WHERE id = ?').get([rondaId]);
    });
    res.status(201).json(rondaCompleta(ronda));
  } catch (err) { enviarError(res, err, 'No se pudo confirmar la toma.') }
});

// DELETE /ronda/:id  → deshace una confirmación hecha por error y regresa el inventario
router.delete('/ronda/:id', requierePermiso('medicacion', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  try {
    const ronda = db.prepare('SELECT * FROM med_rondas WHERE id = ?').get([id]);
    if (!ronda) return res.status(404).json({ error: 'Esa toma ya no existe.' });
    transaccion(() => {
      const movs = db.prepare("SELECT medicamento_id, cantidad FROM med_movimientos WHERE ronda_id = ? AND tipo = 'toma'").all([id]);
      for (const mv of movs) {
        mover(mv.medicamento_id, 'reverso', -mv.cantidad, req, { nota: `Se deshizo la toma ${ronda.toma} del ${ronda.fecha}` });
      }
      db.prepare('DELETE FROM med_ronda_residentes WHERE ronda_id = ?').run([id]);
      db.prepare('UPDATE med_movimientos SET ronda_id = NULL WHERE ronda_id = ?').run([id]);
      db.prepare('DELETE FROM med_rondas WHERE id = ?').run([id]);
    });
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo deshacer la toma.') }
});

module.exports = router;
module.exports.TOMAS = TOMAS;
