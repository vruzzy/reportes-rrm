// Roles y sus permisos y notificaciones (Configuración → Permisos y notificaciones). Solo el administrador.
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const P = require('../permisos');

router.use(requireAuth, P.requiereAdmin);

const usoDe = () => Object.fromEntries(db.prepare('SELECT rol, COUNT(*) AS n FROM usuarios WHERE activo = 1 AND aprobado = 1 GROUP BY rol').all().map(r => [r.rol, r.n]));
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'rol';

// GET /api/gestion/roles → roles, catálogo de secciones y de avisos
router.get('/', (req, res) => {
  try {
    const uso = usoDe();
    res.json({
      roles: P.listaRoles().map(r => ({ ...r, personas: uso[r.id] || 0 })),
      modulos: P.MODULOS, acciones: P.ACCIONES, notificaciones: P.NOTIFICACIONES,
    });
  } catch (err) { console.error('Roles', err); res.status(500).json({ error: 'No se pudieron cargar los roles.' }) }
});

// POST /api/gestion/roles  { label, copiar_de }
router.post('/', (req, res) => {
  try {
    const label = String(req.body?.label || '').trim().slice(0, 60);
    if (label.length < 2) return res.status(400).json({ error: 'Escribe el nombre del rol.' });
    if (db.prepare('SELECT 1 FROM roles WHERE label = ? COLLATE NOCASE').get([label])) return res.status(409).json({ error: 'Ya existe un rol con ese nombre.' });
    const base = req.body?.copiar_de ? P.rolDe(req.body.copiar_de) : null;
    let id = slug(label), n = 2;
    while (db.prepare('SELECT 1 FROM roles WHERE id = ?').get([id])) id = `${slug(label)}_${n++}`;
    const orden = (db.prepare('SELECT MAX(orden) AS m FROM roles').get().m || 0) + 1;
    db.prepare('INSERT INTO roles (id, label, permisos, notificaciones, orden) VALUES (?, ?, ?, ?, ?)')
      .run([id, label, JSON.stringify(base && !base.sistema ? base.permisos : base ? {} : {}), JSON.stringify(base ? base.notificaciones : { horario: { campana: true, correo: false } }), orden]);
    if (base?.sistema) db.prepare('UPDATE roles SET permisos = ? WHERE id = ?').run([JSON.stringify(P.TODO), id]);
    res.status(201).json({ ...P.rolDe(id), personas: 0 });
  } catch (err) { console.error('Roles', err); res.status(500).json({ error: 'No se pudo crear el rol.' }) }
});

// PUT /api/gestion/roles/:id  { label?, permisos?, notificaciones? }
router.put('/:id', (req, res) => {
  try {
    const r = P.rolDe(req.params.id);
    if (!r) return res.status(404).json({ error: 'Ese rol no existe.' });
    const b = req.body || {};
    const label = b.label !== undefined ? String(b.label).trim().slice(0, 60) : r.label;
    if (label.length < 2) return res.status(400).json({ error: 'Escribe el nombre del rol.' });
    if (db.prepare('SELECT 1 FROM roles WHERE label = ? COLLATE NOCASE AND id <> ?').get([label, r.id])) return res.status(409).json({ error: 'Ya existe un rol con ese nombre.' });
    // El administrador siempre tiene todos los permisos; solo se le cambian los avisos
    const permisos = r.sistema ? P.TODO : b.permisos !== undefined ? P.normalizar(b.permisos) : r.permisos;
    const notificaciones = b.notificaciones !== undefined ? P.normalizarNotif(b.notificaciones) : r.notificaciones;
    db.prepare('UPDATE roles SET label = ?, permisos = ?, notificaciones = ? WHERE id = ?').run([label, JSON.stringify(permisos), JSON.stringify(notificaciones), r.id]);
    res.json({ ...P.rolDe(r.id), personas: usoDe()[r.id] || 0 });
  } catch (err) { console.error('Roles', err); res.status(500).json({ error: 'No se pudo guardar el rol.' }) }
});

// DELETE /api/gestion/roles/:id  → solo si nadie lo tiene
router.delete('/:id', (req, res) => {
  try {
    const r = P.rolDe(req.params.id);
    if (!r) return res.status(404).json({ error: 'Ese rol no existe.' });
    if (r.sistema) return res.status(400).json({ error: 'El rol de administrador no se puede borrar.' });
    const n = db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE rol = ?').get([r.id]).n;
    if (n) return res.status(409).json({ error: `${n} cuenta${n === 1 ? ' tiene' : 's tienen'} este rol. Cámbiales el rol antes de borrarlo.` });
    db.prepare('DELETE FROM roles WHERE id = ?').run([r.id]);
    res.json({ ok: true });
  } catch (err) { console.error('Roles', err); res.status(500).json({ error: 'No se pudo borrar el rol.' }) }
});

module.exports = router;
