// Autenticación para la sección Gestión.
// Contraseñas con scrypt (módulo crypto de Node, sin dependencias nuevas).
// Sesiones guardadas en la tabla `sesiones` como hash SHA-256 del token.
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../database');

const DURACION_SESION_DIAS = 7;
const MAX_INTENTOS = 5;
const BLOQUEO_MS   = 15 * 60 * 1000;

// ── Contraseñas ───────────────────────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarPassword(password, guardado) {
  const [salt, hash] = String(guardado).split(':');
  if (!salt || !hash) return false;
  const calculado = crypto.scryptSync(password, salt, 64);
  const esperado  = Buffer.from(hash, 'hex');
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

function sha256(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

// ── Sesiones ──────────────────────────────────────────────────────────────────
function crearSesion(usuarioId) {
  const token  = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + DURACION_SESION_DIAS * 86400000).toISOString();
  db.prepare('DELETE FROM sesiones WHERE expira_en < ?').run([new Date().toISOString()]);
  db.prepare('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)')
    .run([sha256(token), usuarioId, expira]);
  return token;
}

function leerToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

function usuarioDeToken(token) {
  if (!token) return null;
  const fila = db.prepare(`
    SELECT u.id, u.usuario, u.nombre, u.rol, s.expira_en
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND u.activo = 1
  `).get([sha256(token)]);
  if (!fila || fila.expira_en < new Date().toISOString()) return null;
  const { expira_en, ...usuario } = fila;
  return usuario;
}

/** Middleware para proteger las rutas de Gestión: router.use(requireAuth) */
function requireAuth(req, res, next) {
  try {
    const usuario = usuarioDeToken(leerToken(req));
    if (!usuario) return res.status(401).json({ error: 'Sesión no válida o expirada.' });
    req.usuario = usuario;
    next();
  } catch (err) {
    console.error('Error en requireAuth:', err);
    res.status(500).json({ error: 'Error al validar la sesión.' });
  }
}

// ── Límite de intentos por IP (en memoria) ────────────────────────────────────
const intentos = new Map();
function bloqueado(ip) {
  const r = intentos.get(ip);
  if (!r) return false;
  if (Date.now() - r.desde > BLOQUEO_MS) { intentos.delete(ip); return false; }
  return r.n >= MAX_INTENTOS;
}
function registrarFallo(ip) {
  const r = intentos.get(ip);
  if (!r || Date.now() - r.desde > BLOQUEO_MS) intentos.set(ip, { n: 1, desde: Date.now() });
  else r.n += 1;
}

// ── Validación ────────────────────────────────────────────────────────────────
function validarCredenciales({ usuario, password }) {
  const u = String(usuario || '').trim();
  const p = String(password || '');
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(u)) {
    throw new Error('El usuario debe tener de 3 a 30 caracteres (letras, números, punto, guion).');
  }
  if (p.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  return { usuario: u, password: p };
}

function contarUsuarios() {
  return db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

// ¿Ya existe al menos un usuario? Si no, el frontend muestra "crear administrador".
router.get('/estado', (req, res) => {
  try {
    res.json({ configurado: contarUsuarios() > 0 });
  } catch (err) {
    console.error('Error en /auth/estado:', err);
    res.status(500).json({ error: 'No se pudo consultar el estado.' });
  }
});

// Crea el primer usuario administrador. Solo funciona si no hay ningún usuario.
router.post('/setup', (req, res) => {
  try {
    if (contarUsuarios() > 0) return res.status(403).json({ error: 'Ya existe un administrador.' });
    const { usuario, password } = validarCredenciales(req.body || {});
    const nombre = String(req.body.nombre || '').trim() || usuario;
    const result = db.prepare('INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES (?, ?, ?, ?)')
      .run([usuario, nombre, hashPassword(password), 'admin']);
    const id = Number(result.lastInsertRowid);
    res.status(201).json({ token: crearSesion(id), usuario: { id, usuario, nombre, rol: 'admin' } });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo crear el usuario.' });
  }
});

router.post('/login', (req, res) => {
  const ip = req.ip;
  try {
    if (bloqueado(ip)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.' });
    }
    const usuario  = String(req.body?.usuario || '').trim();
    const password = String(req.body?.password || '');
    const fila = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get([usuario]);
    if (!fila || !verificarPassword(password, fila.password_hash)) {
      registrarFallo(ip);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    intentos.delete(ip);
    res.json({
      token: crearSesion(fila.id),
      usuario: { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol },
    });
  } catch (err) {
    console.error('Error en /auth/login:', err);
    res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ usuario: req.usuario }));

router.post('/logout', (req, res) => {
  try {
    const token = leerToken(req);
    if (token) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run([sha256(token)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en /auth/logout:', err);
    res.status(500).json({ error: 'No se pudo cerrar sesión.' });
  }
});

// ── Recuperación de acceso ────────────────────────────────────────────────────
// Si olvidas usuario/contraseña: define GESTION_RESET_PASSWORD (mín. 8 caracteres)
// en las variables de Railway. Al arrancar se restablece la contraseña del usuario
// indicado en GESTION_RESET_USER (o del primer administrador) y se cierran sus
// sesiones. El nombre de usuario aparece en los logs. Después BORRA la variable.
(function restablecerAcceso() {
  const nueva = process.env.GESTION_RESET_PASSWORD;
  if (!nueva) return;
  if (nueva.length < 8) {
    console.warn('[Gestión] GESTION_RESET_PASSWORD debe tener al menos 8 caracteres; no se cambió nada.');
    return;
  }
  const quien = (process.env.GESTION_RESET_USER || '').trim();
  const u = quien
    ? db.prepare('SELECT id, usuario FROM usuarios WHERE usuario = ? COLLATE NOCASE').get([quien])
    : db.prepare("SELECT id, usuario FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1").get();
  if (!u) {
    console.warn('[Gestión] No se encontró el usuario a restablecer.');
    return;
  }
  db.prepare('UPDATE usuarios SET password_hash = ?, activo = 1 WHERE id = ?').run([hashPassword(nueva), u.id]);
  db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run([u.id]);
  console.log(`[Gestión] Contraseña restablecida para el usuario "${u.usuario}". Borra GESTION_RESET_PASSWORD de las variables.`);
})();

module.exports = router;
module.exports.requireAuth = requireAuth;
