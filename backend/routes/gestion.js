// Rutas de la sección Gestión. Todas requieren sesión iniciada.
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const { requierePermiso } = require('../permisos');

router.use(requireAuth);

const MUTUALISTAS   = ['no_posee', 'imss', 'issste', 'seguro_privado', 'otro'];
const TIPOS_CLIENTE = ['privado', 'convenio'];
const UBICACIONES   = ['residencia', 'fuera'];
const MAX_FOTO      = 400 * 1024; // ~400 KB en base64

function texto(v, max = 120) {
  return String(v ?? '').trim().slice(0, max);
}

function generarIniciales(nombre) {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Valida los campos de gestión; lanza Error con mensaje legible */
function sanitizar(body) {
  const fecha_nacimiento = texto(body.fecha_nacimiento, 10);
  if (fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento)) {
    throw new Error('La fecha de nacimiento debe tener formato AAAA-MM-DD.');
  }
  const curp = texto(body.curp, 18).toUpperCase();
  if (curp && !/^[A-Z0-9]{18}$/.test(curp)) throw new Error('La CURP debe tener 18 caracteres.');

  const foto = String(body.foto ?? '');
  if (foto && (!/^data:image\/(jpeg|png|webp);base64,/.test(foto) || foto.length > MAX_FOTO)) {
    throw new Error('La foto no es válida o es demasiado grande.');
  }

  return {
    foto,
    fecha_nacimiento,
    curp,
    tipo_cliente:     TIPOS_CLIENTE.includes(body.tipo_cliente) ? body.tipo_cliente : 'privado',
    mutualista:       MUTUALISTAS.includes(body.mutualista) ? body.mutualista : 'no_posee',
    mutualista_socio: texto(body.mutualista_socio, 40),
    mutualista_tel:   texto(body.mutualista_tel, 20),
    emergencia:       texto(body.emergencia),
    emergencia_tel:   texto(body.emergencia_tel, 20),
    familiar:         texto(body.familiar),
    familiar_tel:     texto(body.familiar_tel, 20),
    ubicacion:        UBICACIONES.includes(body.ubicacion) ? body.ubicacion : 'residencia',
  };
}

const CAMPOS = ['foto', 'fecha_nacimiento', 'curp', 'tipo_cliente', 'mutualista', 'mutualista_socio',
  'mutualista_tel', 'emergencia', 'emergencia_tel', 'familiar', 'familiar_tel', 'ubicacion'];

// GET /api/gestion/residentes
router.get('/residentes', requierePermiso('listado', 'ver'), (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM residentes ORDER BY nombre COLLATE NOCASE').all());
  } catch (err) {
    console.error('Error listando residentes (gestión):', err);
    res.status(500).json({ error: 'No se pudieron cargar los residentes.' });
  }
});

// POST /api/gestion/residentes — alta rápida desde Gestión
router.post('/residentes', requierePermiso('listado', 'editar'), (req, res) => {
  let campos;
  try {
    const nombre = texto(req.body?.nombre);
    if (!nombre) throw new Error('El nombre es obligatorio.');
    const tipo_servicio = req.body.tipo_servicio === 'centro_dia' ? 'centro_dia' : 'residencia_permanente';
    const fecha_ingreso = texto(req.body.fecha_ingreso, 10) || new Date().toISOString().slice(0, 10);
    campos = { nombre, tipo_servicio, fecha_ingreso, iniciales: generarIniciales(nombre), ...sanitizar(req.body) };
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const cols = ['nombre', 'iniciales', 'habitacion', 'fecha_ingreso', 'tipo_servicio', ...CAMPOS];
    const vals = [campos.nombre, campos.iniciales, '', campos.fecha_ingreso, campos.tipo_servicio, ...CAMPOS.map(c => campos[c])];
    const r = db.prepare(`INSERT INTO residentes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(vals);
    res.status(201).json(db.prepare('SELECT * FROM residentes WHERE id = ?').get([Number(r.lastInsertRowid)]));
  } catch (err) {
    console.error('Error creando residente (gestión):', err);
    res.status(500).json({ error: 'No se pudo guardar el residente.' });
  }
});

// PUT /api/gestion/residentes/:id — solo actualiza los campos del expediente
router.put('/residentes/:id', requierePermiso('listado', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  let campos;
  try {
    campos = sanitizar(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const r = db.prepare(`UPDATE residentes SET ${CAMPOS.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run([...CAMPOS.map(c => campos[c]), id]);
    if (!r.changes) return res.status(404).json({ error: 'Residente no encontrado.' });
    res.json(db.prepare('SELECT * FROM residentes WHERE id = ?').get([id]));
  } catch (err) {
    console.error('Error actualizando residente (gestión):', err);
    res.status(500).json({ error: 'No se pudo guardar el residente.' });
  }
});

// PATCH /api/gestion/residentes/:id/ubicacion — cambio rápido en residencia / fuera
router.patch('/residentes/:id/ubicacion', requierePermiso('listado', 'editar'), (req, res) => {
  try {
    const ubicacion = UBICACIONES.includes(req.body?.ubicacion) ? req.body.ubicacion : null;
    if (!ubicacion) return res.status(400).json({ error: 'Ubicación no válida.' });
    const r = db.prepare('UPDATE residentes SET ubicacion = ? WHERE id = ?').run([ubicacion, Number(req.params.id)]);
    if (!r.changes) return res.status(404).json({ error: 'Residente no encontrado.' });
    res.json({ ok: true, ubicacion });
  } catch (err) {
    console.error('Error cambiando ubicación:', err);
    res.status(500).json({ error: 'No se pudo cambiar la ubicación.' });
  }
});

module.exports = router;
