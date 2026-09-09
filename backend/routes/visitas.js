const express = require('express');
const router  = express.Router();
const db      = require('../database');

const TIPOS        = ['familiar', 'medico', 'terapia', 'otro'];
const ESTADOS      = ['pendiente', 'confirmada', 'realizada', 'cancelada'];
const RECURRENCIAS = ['ninguna', 'semanal', 'quincenal', 'mensual', 'dias_semana'];

// ── Helpers de fecha (UTC para evitar desfases de zona horaria) ────────────────
const MS_DIA = 86400000;
function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function isoUTC(ts) { return new Date(ts).toISOString().slice(0, 10); }
function diffDias(a, b) { return Math.round((a - b) / MS_DIA); }
function weekdayLunes0(ts) { return (new Date(ts).getUTCDay() + 6) % 7; } // 0 = lunes

/** Limpia y valida el cuerpo; lanza Error con mensaje legible */
function sanitizar(body) {
  const residente_id     = body.residente_id ? Number(body.residente_id) : null;
  const residente_nombre = (body.residente_nombre || '').trim();
  const tipo        = TIPOS.includes(body.tipo)               ? body.tipo        : 'familiar';
  const estado      = ESTADOS.includes(body.estado)           ? body.estado      : 'pendiente';
  const recurrencia = RECURRENCIAS.includes(body.recurrencia) ? body.recurrencia : 'ninguna';
  const visitante  = (body.visitante  || '').trim();
  const parentesco = (body.parentesco || '').trim();
  const fecha      = (body.fecha || '').trim();
  const hora       = (body.hora  || '').trim();
  const notas      = (body.notas || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha es obligatoria (formato AAAA-MM-DD).');
  if (hora && !/^\d{2}:\d{2}$/.test(hora)) throw new Error('La hora debe tener formato HH:MM.');
  if (tipo === 'familiar' && !visitante && !residente_nombre) {
    throw new Error('Indica el residente o el nombre del visitante.');
  }

  let dias_semana = '';
  if (recurrencia === 'dias_semana') {
    const bruto = Array.isArray(body.dias_semana)
      ? body.dias_semana
      : String(body.dias_semana || '').split(',');
    const dias = [...new Set(bruto.map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6))]
      .sort((a, b) => a - b);
    if (!dias.length) throw new Error('Elige al menos un día de la semana para la visita fija.');
    dias_semana = dias.join(',');
  }

  return { residente_id, residente_nombre, tipo, estado, recurrencia, dias_semana,
           visitante, parentesco, fecha, hora, notas };
}

/** Devuelve las fechas ISO en las que la visita cae dentro del mes AAAA-MM */
function ocurrenciasEnMes(row, mes) {
  const [y, m] = mes.split('-').map(Number);
  const diasEnMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const anchor = toUTC(row.fecha);
  const anchorDay = new Date(anchor).getUTCDate();
  const finMes = Date.UTC(y, m - 1, diasEnMes);

  if (row.recurrencia === 'ninguna') {
    return row.fecha.startsWith(mes) ? [row.fecha] : [];
  }
  if (anchor > finMes) return [];

  const set = row.recurrencia === 'dias_semana'
    ? new Set(String(row.dias_semana || '').split(',').map(Number))
    : null;

  const fechas = [];
  for (let d = 1; d <= diasEnMes; d++) {
    const cur = Date.UTC(y, m - 1, d);
    if (cur < anchor) continue;
    let cae = false;
    switch (row.recurrencia) {
      case 'semanal':     cae = diffDias(cur, anchor) % 7 === 0; break;
      case 'quincenal':   cae = diffDias(cur, anchor) % 14 === 0; break;
      case 'mensual':     cae = d === Math.min(anchorDay, diasEnMes); break;
      case 'dias_semana': cae = set.has(weekdayLunes0(cur)); break;
    }
    if (cae) fechas.push(isoUTC(cur));
  }
  return fechas;
}

// GET /api/visitas?mes=AAAA-MM  |  ?desde=&hasta=  |  (sin filtro = todas)
router.get('/', (req, res) => {
  try {
    const { mes, desde, hasta } = req.query;
    const rows = db.prepare(`
      SELECT v.*, res.nombre AS residente_nombre_actual, res.iniciales AS residente_iniciales
      FROM visitas v
      LEFT JOIN residentes res ON res.id = v.residente_id
    `).all().map(v => ({
      ...v,
      residente_nombre: v.residente_nombre_actual || v.residente_nombre,
    }));

    // Vista de calendario: expande las visitas fijas en ocurrencias concretas del mes
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const ocurrencias = [];
      for (const row of rows) {
        for (const fecha of ocurrenciasEnMes(row, mes)) {
          ocurrencias.push({
            ...row,
            fecha,
            anchor_fecha: row.fecha,
            es_recurrente: row.recurrencia !== 'ninguna',
            occ_id: `${row.id}:${fecha}`,
          });
        }
      }
      ocurrencias.sort((a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.hora === '') - (b.hora === '') ||
        a.hora.localeCompare(b.hora) ||
        a.id - b.id
      );
      return res.json(ocurrencias);
    }

    // Listado plano (sin expandir)
    let lista = rows;
    if (desde) lista = lista.filter(v => v.fecha >= desde);
    if (hasta) lista = lista.filter(v => v.fecha <= hasta);
    lista.sort((a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      (a.hora === '') - (b.hora === '') ||
      a.hora.localeCompare(b.hora) ||
      a.id - b.id
    );
    res.json(lista);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/visitas
router.post('/', (req, res) => {
  let c;
  try { c = sanitizar(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  try {
    const result = db.prepare(`
      INSERT INTO visitas (residente_id, residente_nombre, tipo, visitante, parentesco, fecha, hora, notas, estado, recurrencia, dias_semana)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run([
      c.residente_id, c.residente_nombre, c.tipo, c.visitante, c.parentesco,
      c.fecha, c.hora, c.notas, c.estado, c.recurrencia, c.dias_semana,
    ]);
    const nueva = db.prepare('SELECT * FROM visitas WHERE id = ?').get([Number(result.lastInsertRowid)]);
    res.status(201).json(nueva);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/visitas/:id
router.put('/:id', (req, res) => {
  let c;
  try { c = sanitizar(req.body); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  try {
    db.prepare(`
      UPDATE visitas
      SET residente_id=?, residente_nombre=?, tipo=?, visitante=?, parentesco=?, fecha=?, hora=?, notas=?, estado=?, recurrencia=?, dias_semana=?
      WHERE id=?
    `).run([
      c.residente_id, c.residente_nombre, c.tipo, c.visitante, c.parentesco,
      c.fecha, c.hora, c.notas, c.estado, c.recurrencia, c.dias_semana, Number(req.params.id),
    ]);
    const updated = db.prepare('SELECT * FROM visitas WHERE id = ?').get([Number(req.params.id)]);
    if (!updated) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/visitas/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM visitas WHERE id = ?').run([Number(req.params.id)]);
    if (result.changes === 0) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
