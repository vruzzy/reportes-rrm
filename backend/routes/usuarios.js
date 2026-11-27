// Administración de usuarios de Gestión (solo administrador).
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth, crearEnlace, enlaceUrl, validarEmail, usuarioPublico } = require('./auth');
const { ROLES, MODULOS, ACCIONES, listaRoles, rolDe, normalizar, requiereAdmin } = require('../permisos');
const correo  = require('../correo');

router.use(requireAuth, requiereAdmin);

function fila(id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get([id]);
}

function vista(u) {
  return {
    ...usuarioPublico(u),
    activo: !!u.activo,
    pendiente: !String(u.password_hash || '').includes(':'),
    por_aprobar: u.aprobado === 0,
    personalizado: !!u.permisos && u.rol !== 'admin',
    creado_en: u.creado_en,
  };
}

function validarRol(rol) {
  if (!rolDe(rol)) throw new Error('Rol no válido.');
  return rol;
}

/** Cuántos administradores activos quedarían; evita quedarse sin ninguno */
function adminsActivos(excepto) {
  return db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?").get([excepto]).n;
}

// Catálogo para el frontend
router.get('/catalogo', (req, res) => {
  res.json({
    roles: listaRoles().map(r => ({ id: r.id, label: r.label, permisos: r.permisos })),
    modulos: MODULOS, acciones: ACCIONES,
    correo: correo.correoConfigurado(),
  });
});

router.get('/', (req, res) => {
  try {
    const filas = db.prepare('SELECT * FROM usuarios ORDER BY aprobado ASC, activo DESC, nombre COLLATE NOCASE').all();
    res.json(filas.map(vista));
  } catch (err) {
    console.error('Error en GET /usuarios:', err);
    res.status(500).json({ error: 'No se pudieron cargar los usuarios.' });
  }
});

async function mandarInvitacion(req, u) {
  const enlace = enlaceUrl(req, 'invitacion', crearEnlace(u.id, 'invitacion'));
  const r = await correo.enviarInvitacion({ para: u.email, nombre: u.nombre, enlace, invitadoPor: req.usuario.nombre });
  return { enlace, correoEnviado: r.enviado };
}

// Invitar a un empleado: crea la cuenta sin contraseña y manda el enlace
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().slice(0, 80);
    if (!nombre) throw new Error('Escribe el nombre del empleado.');
    const email = validarEmail(b.email);
    const rol = validarRol(b.rol || 'enfermeria');
    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ? COLLATE NOCASE OR usuario = ? COLLATE NOCASE').get([email, email]);
    if (existe) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    const permisos = b.permisos && rol !== 'admin' ? JSON.stringify(normalizar(b.permisos)) : null;
    const r = db.prepare(`
      INSERT INTO usuarios (usuario, nombre, email, password_hash, rol, permisos, invitado_por)
      VALUES (?, ?, ?, '', ?, ?, ?)
    `).run([email, nombre, email, rol, permisos, req.usuario.id]);
    const u = fila(Number(r.lastInsertRowid));
    const inv = await mandarInvitacion(req, u);
    res.status(201).json({ usuario: vista(u), ...inv });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo invitar.' });
  }
});

// Reenviar invitación (o mandar un enlace para que cree contraseña nueva)
router.post('/:id/enlace', async (req, res) => {
  try {
    const u = fila(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (!u.email) return res.status(400).json({ error: 'Esta cuenta no tiene correo.' });
    if (!u.activo) return res.status(400).json({ error: 'Activa la cuenta antes de enviar el enlace.' });
    res.json(await mandarInvitacion(req, u));
  } catch (err) {
    console.error('Error en POST /usuarios/:id/enlace:', err);
    res.status(500).json({ error: 'No se pudo generar el enlace.' });
  }
});

// Cambiar rol, permisos, nombre o activar/desactivar
router.patch('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const u = fila(id);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const b = req.body || {};

    const rol = b.rol !== undefined ? validarRol(b.rol) : u.rol;
    const activo = b.activo !== undefined ? (b.activo ? 1 : 0) : u.activo;
    const nombre = b.nombre !== undefined ? (String(b.nombre).trim().slice(0, 80) || u.nombre) : u.nombre;
    const aprobado = b.aprobado ? 1 : u.aprobado;

    const pierdeAdmin = u.rol === 'admin' && u.activo && (rol !== 'admin' || !activo);
    if (pierdeAdmin && adminsActivos(id) === 0) {
      return res.status(400).json({ error: 'Debe quedar al menos un administrador activo.' });
    }
    if (id === req.usuario.id && !activo) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }

    let permisos = u.permisos;
    if (b.permisos !== undefined) permisos = b.permisos === null ? null : JSON.stringify(normalizar(b.permisos));
    if (rol === 'admin') permisos = null;
    else if (b.rol !== undefined && b.rol !== u.rol && b.permisos === undefined) permisos = null; // nuevo rol → permisos del rol

    db.prepare('UPDATE usuarios SET rol = ?, activo = ?, nombre = ?, permisos = ?, aprobado = ? WHERE id = ?')
      .run([rol, activo, nombre, permisos, aprobado, id]);
    if (!activo) db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run([id]);
    res.json(vista(fila(id)));
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar.' });
  }
});

// Eliminar una invitación que nunca se usó o rechazar una solicitud (cuentas en uso solo se desactivan)
router.delete('/:id', (req, res) => {
  try {
    const u = fila(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (String(u.password_hash || '').includes(':') && u.aprobado !== 0) {
      return res.status(400).json({ error: 'Esta cuenta ya está en uso; desactívala en lugar de eliminarla.' });
    }
    db.prepare('DELETE FROM usuarios WHERE id = ?').run([u.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /usuarios/:id:', err);
    res.status(500).json({ error: 'No se pudo eliminar.' });
  }
});

module.exports = router;
