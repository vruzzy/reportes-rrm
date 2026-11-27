// Controles diarios: signos vitales al recibir y al entregar cada turno.
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const { requierePermiso } = require('../permisos');
const { CAMPOS_SIGNOS, LIMITES, ETIQUETAS } = require('../signos');

router.use(requireAuth);

const TURNOS   = ['Matutino-Vespertino', 'Nocturno'];
const MOMENTOS = ['recibir', 'entregar'];
const esFecha  = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const esHora   = (s) => /^\d{2}:\d{2}$/.test(String(s || ''));

function leerNumero(campo, v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`${ETIQUETAS[campo]}: no es un número.`);
  const [min, max] = LIMITES[campo];
  if (n < min || n > max) throw new Error(`${ETIQUETAS[campo]}: ${n} está fuera de lo posible (${min}–${max}). Revisa el dato.`);
  return Math.round(n * 10) / 10;
}

// GET /api/gestion/controles?fecha=AAAA-MM-DD&turno=...  → todas las tomas del turno
router.get('/', requierePermiso('controles', 'ver'), (req, res) => {
  const { fecha, turno } = req.query;
  if (!esFecha(fecha) || !TURNOS.includes(turno)) return res.status(400).json({ error: 'Fecha o turno no válidos.' });
  try {
    res.json(db.prepare('SELECT * FROM controles_signos WHERE fecha = ? AND turno = ?').all([fecha, turno]));
  } catch (err) {
    console.error('Error listando controles:', err);
    res.status(500).json({ error: 'No se pudieron cargar los controles.' });
  }
});

// GET /api/gestion/controles/residente/:id?dias=14  → historial reciente de un residente
router.get('/residente/:id', requierePermiso('controles', 'ver'), (req, res) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 14, 1), 120);
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  try {
    res.json(db.prepare(`
      SELECT * FROM controles_signos WHERE residente_id = ? AND fecha >= ?
      ORDER BY fecha DESC, turno = 'Nocturno' DESC, momento = 'entregar' DESC
    `).all([Number(req.params.id), desde]));
  } catch (err) {
    console.error('Error en historial de controles:', err);
    res.status(500).json({ error: 'No se pudo cargar el historial.' });
  }
});

// PUT /api/gestion/controles  → guarda (o reemplaza) una toma. Si todos los valores
// quedan vacíos, la toma se borra.
router.put('/', requierePermiso('controles', ['crear', 'editar']), (req, res) => {
  const b = req.body || {};
  const residente_id = Number(b.residente_id);
  if (!residente_id || !esFecha(b.fecha) || !TURNOS.includes(b.turno) || !MOMENTOS.includes(b.momento)) {
    return res.status(400).json({ error: 'Faltan datos de la toma (residente, fecha, turno o momento).' });
  }
  let valores;
  try {
    valores = Object.fromEntries(CAMPOS_SIGNOS.map(c => [c, leerNumero(c, b[c])]));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const notas = String(b.notas ?? '').trim().slice(0, 300);
  const hora  = esHora(b.hora) ? b.hora : '';
  const clave = [residente_id, b.fecha, b.turno, b.momento];

  try {
    if (!db.prepare('SELECT id FROM residentes WHERE id = ?').get([residente_id])) {
      return res.status(404).json({ error: 'Residente no encontrado.' });
    }
    const vacia = CAMPOS_SIGNOS.every(c => valores[c] == null) && !notas;
    if (vacia) {
      db.prepare('DELETE FROM controles_signos WHERE residente_id = ? AND fecha = ? AND turno = ? AND momento = ?').run(clave);
      return res.json({ borrado: true });
    }
    db.prepare(`
      INSERT INTO controles_signos
        (residente_id, fecha, turno, momento, hora, ${CAMPOS_SIGNOS.join(', ')}, notas, usuario_id, usuario_nombre)
      VALUES (?, ?, ?, ?, ?, ${CAMPOS_SIGNOS.map(() => '?').join(', ')}, ?, ?, ?)
      ON CONFLICT (residente_id, fecha, turno, momento) DO UPDATE SET
        hora = excluded.hora,
        ${CAMPOS_SIGNOS.map(c => `${c} = excluded.${c}`).join(', ')},
        notas = excluded.notas,
        usuario_id = excluded.usuario_id,
        usuario_nombre = excluded.usuario_nombre,
        actualizado_en = datetime('now')
    `).run([...clave, hora, ...CAMPOS_SIGNOS.map(c => valores[c]), notas, req.usuario.id, req.usuario.nombre || '']);
    res.json(db.prepare('SELECT * FROM controles_signos WHERE residente_id = ? AND fecha = ? AND turno = ? AND momento = ?').get(clave));
  } catch (err) {
    console.error('Error guardando control:', err);
    res.status(500).json({ error: 'No se pudo guardar la toma.' });
  }
});

// ── Micciones y evacuaciones ─────────────────────────────────────────────────
// Cada evento es un registro (hora + características). Se suman solos al reporte del turno.
const TIPOS = ['miccion', 'evacuacion'];
const caracteristicas = (v) => (Array.isArray(v) ? [...new Set(v.map(x => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 12) : []);
const eventoPublico = (f) => f && ({ ...f, caracteristicas: (() => { try { return JSON.parse(f.caracteristicas || '[]') } catch { return [] } })() });

function eventosDelTurno(fecha, turno, residenteId) {
  const filas = residenteId
    ? db.prepare('SELECT * FROM controles_eliminacion WHERE fecha = ? AND turno = ? AND residente_id = ? ORDER BY hora, id').all([fecha, turno, residenteId])
    : db.prepare('SELECT * FROM controles_eliminacion WHERE fecha = ? AND turno = ? ORDER BY hora, id').all([fecha, turno]);
  return filas.map(eventoPublico);
}

// GET /api/gestion/controles/eliminacion/residente/:id?dias=14  → micciones y evacuaciones recientes de un residente
router.get('/eliminacion/residente/:id', requierePermiso('controles', 'ver'), (req, res) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 14, 1), 120);
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  try {
    res.json(db.prepare('SELECT * FROM controles_eliminacion WHERE residente_id = ? AND fecha >= ? ORDER BY fecha DESC, hora DESC, id DESC')
      .all([Number(req.params.id), desde]).map(eventoPublico));
  } catch (err) {
    console.error('Error en historial de micciones:', err);
    res.status(500).json({ error: 'No se pudo cargar el historial.' });
  }
});

// GET /api/gestion/controles/eliminacion?fecha&turno
router.get('/eliminacion', requierePermiso('controles', 'ver'), (req, res) => {
  const { fecha, turno } = req.query;
  if (!esFecha(fecha) || !TURNOS.includes(turno)) return res.status(400).json({ error: 'Fecha o turno no válidos.' });
  try {
    res.json(eventosDelTurno(fecha, turno));
  } catch (err) {
    console.error('Error listando micciones/evacuaciones:', err);
    res.status(500).json({ error: 'No se pudieron cargar las micciones y evacuaciones.' });
  }
});

// POST /api/gestion/controles/eliminacion  { residente_id, fecha, turno, tipo, hora, caracteristicas }
router.post('/eliminacion', requierePermiso('controles', 'crear'), (req, res) => {
  const b = req.body || {};
  const residente_id = Number(b.residente_id);
  if (!residente_id || !esFecha(b.fecha) || !TURNOS.includes(b.turno) || !TIPOS.includes(b.tipo)) {
    return res.status(400).json({ error: 'Faltan datos del registro (residente, fecha, turno o tipo).' });
  }
  try {
    if (!db.prepare('SELECT id FROM residentes WHERE id = ?').get([residente_id])) {
      return res.status(404).json({ error: 'Residente no encontrado.' });
    }
    const n = db.prepare('SELECT COUNT(*) AS n FROM controles_eliminacion WHERE residente_id = ? AND fecha = ? AND turno = ? AND tipo = ?')
      .get([residente_id, b.fecha, b.turno, b.tipo]).n;
    if (n >= 30) return res.status(400).json({ error: 'Ya hay 30 registros de este tipo en el turno.' });
    const r = db.prepare(`
      INSERT INTO controles_eliminacion (residente_id, fecha, turno, tipo, hora, caracteristicas, usuario_id, usuario_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run([residente_id, b.fecha, b.turno, b.tipo, esHora(b.hora) ? b.hora : '', JSON.stringify(caracteristicas(b.caracteristicas)),
      req.usuario.id, req.usuario.nombre || '']);
    res.status(201).json(eventoPublico(db.prepare('SELECT * FROM controles_eliminacion WHERE id = ?').get([Number(r.lastInsertRowid)])));
  } catch (err) {
    console.error('Error guardando micción/evacuación:', err);
    res.status(500).json({ error: 'No se pudo guardar el registro.' });
  }
});

// PUT /api/gestion/controles/eliminacion/:id  { hora, caracteristicas }
router.put('/eliminacion/:id', requierePermiso('controles', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  try {
    const previo = db.prepare('SELECT * FROM controles_eliminacion WHERE id = ?').get([id]);
    if (!previo) return res.status(404).json({ error: 'Registro no encontrado.' });
    db.prepare(`
      UPDATE controles_eliminacion SET hora = ?, caracteristicas = ?, usuario_id = ?, usuario_nombre = ?, actualizado_en = datetime('now')
      WHERE id = ?
    `).run([esHora(b.hora) ? b.hora : previo.hora, JSON.stringify(caracteristicas(b.caracteristicas)), req.usuario.id, req.usuario.nombre || '', id]);
    res.json(eventoPublico(db.prepare('SELECT * FROM controles_eliminacion WHERE id = ?').get([id])));
  } catch (err) {
    console.error('Error actualizando micción/evacuación:', err);
    res.status(500).json({ error: 'No se pudo guardar el registro.' });
  }
});

// DELETE /api/gestion/controles/eliminacion/:id
router.delete('/eliminacion/:id', requierePermiso('controles', 'eliminar'), (req, res) => {
  try {
    const r = db.prepare('DELETE FROM controles_eliminacion WHERE id = ?').run([Number(req.params.id)]);
    if (!r.changes) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error borrando micción/evacuación:', err);
    res.status(500).json({ error: 'No se pudo borrar el registro.' });
  }
});

module.exports = router;
module.exports.TURNOS = TURNOS;
module.exports.eventosDelTurno = eventosDelTurno;
