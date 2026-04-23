const express = require('express');
const router = express.Router();
const db = require('../database');

/** Genera iniciales desde un nombre completo */
function generarIniciales(nombre) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Limpia y valida los campos; lanza Error con mensaje legible */
function sanitizar(body) {
  const nombre        = (body.nombre        || '').trim();
  const fecha_ingreso = (body.fecha_ingreso || '').trim();
  const ciudad        = (body.ciudad        || 'Mérida, Yucatán').trim();
  const mensualidad   = parseFloat(body.mensualidad) || 0;
  const familiar      = (body.familiar      || '').trim();
  const dia_pago      = Math.min(31, Math.max(1, parseInt(body.dia_pago) || 1));

  let iniciales = (body.iniciales || '').trim().toUpperCase().slice(0, 2);
  if (!iniciales && nombre) iniciales = generarIniciales(nombre);

  if (!nombre)        throw new Error('El nombre es obligatorio.');
  if (!iniciales)     throw new Error('No se pudieron generar las iniciales.');
  if (!fecha_ingreso) throw new Error('La fecha de ingreso es obligatoria.');

  return { nombre, iniciales, fecha_ingreso, ciudad, mensualidad, familiar, dia_pago };
}

// GET /api/residentes
router.get('/', (req, res) => {
  try {
    const residentes = db.prepare('SELECT * FROM residentes ORDER BY nombre COLLATE NOCASE').all();
    res.json(residentes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/residentes
router.post('/', (req, res) => {
  let campos;
  try {
    campos = sanitizar(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const result = db.prepare(
      'INSERT INTO residentes (nombre, iniciales, habitacion, fecha_ingreso, ciudad, mensualidad, familiar, dia_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run([campos.nombre, campos.iniciales, '', campos.fecha_ingreso, campos.ciudad, campos.mensualidad, campos.familiar, campos.dia_pago]);

    const id = Number(result.lastInsertRowid);
    const nuevo = db.prepare('SELECT * FROM residentes WHERE id = ?').get([id]);
    res.status(201).json(nuevo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/residentes/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;

  let campos;
  try {
    campos = sanitizar(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    db.prepare(
      'UPDATE residentes SET nombre=?, iniciales=?, fecha_ingreso=?, ciudad=?, mensualidad=?, familiar=?, dia_pago=? WHERE id=?'
    ).run([campos.nombre, campos.iniciales, campos.fecha_ingreso, campos.ciudad, campos.mensualidad, campos.familiar, campos.dia_pago, Number(id)]);

    const updated = db.prepare('SELECT * FROM residentes WHERE id = ?').get([id]);
    if (!updated) return res.status(404).json({ error: 'Residente no encontrado' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/residentes/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM residentes WHERE id = ?').run([req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Residente no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
