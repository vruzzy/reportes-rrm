const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/recibos?mes=2026-04 — recibos de un mes específico (o todos)
router.get('/', (req, res) => {
  try {
    const { mes } = req.query
    let recibos
    if (mes) {
      recibos = db.prepare(`
        SELECT r.*, res.nombre AS residente_nombre
        FROM recibos r
        LEFT JOIN residentes res ON res.id = r.residente_id
        WHERE r.periodo_de LIKE ? OR r.fecha LIKE ?
        ORDER BY r.id DESC
      `).all([`${mes}%`, `${mes}%`])
    } else {
      recibos = db.prepare(`
        SELECT r.*, res.nombre AS residente_nombre
        FROM recibos r
        LEFT JOIN residentes res ON res.id = r.residente_id
        ORDER BY r.id DESC
      `).all()
    }
    res.json(recibos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recibos/proximo-numero — siguiente número de recibo
router.get('/proximo-numero', (req, res) => {
  try {
    const row = db.prepare('SELECT MAX(numero) as ultimo FROM recibos').get();
    res.json({ numero: (row?.ultimo || 0) + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recibos — crear nuevo recibo
router.post('/', (req, res) => {
  const { numero, residente_id, nombre, ciudad, fecha, periodo_de, periodo_hasta, valor, forma_pago, observaciones } = req.body;

  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (!fecha)          return res.status(400).json({ error: 'La fecha es obligatoria.' });
  if (!valor)          return res.status(400).json({ error: 'El valor es obligatorio.' });

  try {
    const result = db.prepare(`
      INSERT INTO recibos (numero, residente_id, nombre, ciudad, fecha, periodo_de, periodo_hasta, valor, forma_pago, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run([
      numero,
      residente_id || null,
      nombre.trim(),
      ciudad || 'Mérida, Yucatán',
      fecha,
      periodo_de,
      periodo_hasta,
      parseFloat(valor),
      forma_pago || 'efectivo',
      observaciones || '',
    ]);
    const nuevo = db.prepare('SELECT * FROM recibos WHERE id = ?').get([Number(result.lastInsertRowid)]);
    res.status(201).json(nuevo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recibos/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM recibos WHERE id = ?').run([req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Recibo no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
