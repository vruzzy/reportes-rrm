// Autenticación para la sección Gestión.
// Contraseñas con scrypt (módulo crypto de Node, sin dependencias nuevas).
// Sesiones guardadas en la tabla `sesiones` como hash SHA-256 del token.
// Invitaciones y recuperación de contraseña con enlaces de un solo uso (tabla enlaces_acceso).
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../database');
const { permisosDe, legado, etiquetasRoles, destinatariosDe } = require('../permisos');
const correo  = require('../correo');

const DURACION_SESION_DIAS = 7;
const MAX_INTENTOS = 5;
const BLOQUEO_MS   = 15 * 60 * 1000;
const VIGENCIA = { invitacion: 7 * 86400000, recuperacion: 60 * 60000 };

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

function validarPassword(p) {
  p = String(p || '');
  if (p.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  if (p.length > 200) throw new Error('La contraseña es demasiado larga.');
  return p;
}

function validarEmail(e) {
  e = String(e || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120) throw new Error('Escribe un correo electrónico válido.');
  return e;
}

// ── Usuario público (lo que ve el frontend) ───────────────────────────────────
function usuarioPublico(u) {
  const acciones = permisosDe(u);
  return {
    id: u.id, usuario: u.usuario, nombre: u.nombre, email: u.email || '',
    rol: u.rol, rol_label: u.aprobado === 0 ? 'Por aprobar' : (etiquetasRoles()[u.rol] || u.rol),
    aprobado: u.aprobado !== 0,
    permisos: legado(acciones),   // 'ver' | 'editar' por sección (pantallas que aún no usan el detalle)
    acciones,                     // { seccion: ['ver','crear','editar','eliminar'] }
  };
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
    SELECT u.*, s.expira_en AS sesion_expira
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND u.activo = 1
  `).get([sha256(token)]);
  if (!fila || fila.sesion_expira < new Date().toISOString()) return null;
  return usuarioPublico(fila);
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

// ── Enlaces de un solo uso (invitación / recuperación) ────────────────────────
function crearEnlace(usuarioId, tipo) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM enlaces_acceso WHERE usuario_id = ? AND tipo = ? AND usado = 0').run([usuarioId, tipo]);
  db.prepare('DELETE FROM enlaces_acceso WHERE expira_en < ?').run([new Date().toISOString()]);
  db.prepare('INSERT INTO enlaces_acceso (token_hash, usuario_id, tipo, expira_en) VALUES (?, ?, ?, ?)')
    .run([sha256(token), usuarioId, tipo, new Date(Date.now() + VIGENCIA[tipo]).toISOString()]);
  return token;
}

function buscarEnlace(token) {
  if (!token || String(token).length > 100) return null;
  const e = db.prepare(`
    SELECT e.*, u.nombre, u.email, u.activo
    FROM enlaces_acceso e JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.token_hash = ?
  `).get([sha256(String(token))]);
  if (!e || e.usado || !e.activo || e.expira_en < new Date().toISOString()) return null;
  return e;
}

/** URL pública de la app, para armar los enlaces de los correos */
function urlBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function enlaceUrl(req, tipo, token) {
  return `${urlBase(req)}/?gestion=${tipo}&token=${encodeURIComponent(token)}`;
}

// ── Límite de intentos por IP (en memoria) ────────────────────────────────────
const intentos = new Map();
function bloqueado(ip, clave = 'login') {
  const r = intentos.get(`${clave}:${ip}`);
  if (!r) return false;
  if (Date.now() - r.desde > BLOQUEO_MS) { intentos.delete(`${clave}:${ip}`); return false; }
  return r.n >= MAX_INTENTOS;
}
function registrarFallo(ip, clave = 'login') {
  const k = `${clave}:${ip}`;
  const r = intentos.get(k);
  if (!r || Date.now() - r.desde > BLOQUEO_MS) intentos.set(k, { n: 1, desde: Date.now() });
  else r.n += 1;
}

function contarUsuarios() {
  return db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

// ¿Ya existe al menos un usuario? Si no, el frontend muestra "crear administrador".
router.get('/estado', (req, res) => {
  try {
    res.json({ configurado: contarUsuarios() > 0, correo: correo.correoConfigurado() });
  } catch (err) {
    console.error('Error en /auth/estado:', err);
    res.status(500).json({ error: 'No se pudo consultar el estado.' });
  }
});

// Crea el primer usuario administrador. Solo funciona si no hay ningún usuario.
router.post('/setup', (req, res) => {
  try {
    if (contarUsuarios() > 0) return res.status(403).json({ error: 'Ya existe un administrador.' });
    const usuario = String(req.body?.usuario || '').trim();
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(usuario)) {
      throw new Error('El usuario debe tener de 3 a 30 caracteres (letras, números, punto, guion).');
    }
    const password = validarPassword(req.body?.password);
    const nombre = String(req.body.nombre || '').trim().slice(0, 80) || usuario;
    const result = db.prepare('INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES (?, ?, ?, ?)')
      .run([usuario, nombre, hashPassword(password), 'admin']);
    const fila = db.prepare('SELECT * FROM usuarios WHERE id = ?').get([Number(result.lastInsertRowid)]);
    res.status(201).json({ token: crearSesion(fila.id), usuario: usuarioPublico(fila) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo crear el usuario.' });
  }
});

// Entrar con usuario o correo
router.post('/login', (req, res) => {
  const ip = req.ip;
  try {
    if (bloqueado(ip)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.' });
    }
    const id       = String(req.body?.usuario || '').trim();
    const password = String(req.body?.password || '');
    const fila = id && db.prepare(
      'SELECT * FROM usuarios WHERE (usuario = ? COLLATE NOCASE OR email = ? COLLATE NOCASE) AND activo = 1'
    ).get([id, id]);
    if (!fila || !verificarPassword(password, fila.password_hash)) {
      registrarFallo(ip);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    intentos.delete(`login:${ip}`);
    res.json({ token: crearSesion(fila.id), usuario: usuarioPublico(fila) });
  } catch (err) {
    console.error('Error en /auth/login:', err);
    res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ usuario: req.usuario }));

// ── Solo para pruebas en tu computadora: entrar sin contraseña ───────────────
// Funciona únicamente si el servidor NO está en producción, NO corre en Railway y la
// petición llega desde la misma computadora (127.0.0.1). Entra como el primer admin.
const ACCESO_LOCAL = process.env.NODE_ENV !== 'production'
  && !process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_SERVICE_ID;

function vieneDeEstaComputadora(req) {
  // remoteAddress es la conexión real (no se puede falsear con cabeceras como X-Forwarded-For)
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress || '');
}

router.get('/acceso-local', (req, res) => {
  res.json({ disponible: ACCESO_LOCAL && vieneDeEstaComputadora(req) });
});

router.post('/acceso-local', (req, res) => {
  if (!ACCESO_LOCAL || !vieneDeEstaComputadora(req)) return res.status(404).json({ error: 'No disponible.' });
  try {
    const u = db.prepare("SELECT * FROM usuarios WHERE rol = 'admin' AND activo = 1 ORDER BY id LIMIT 1").get([]);
    if (!u) return res.status(404).json({ error: 'No hay un administrador en la base local.' });
    res.json({ token: crearSesion(u.id), usuario: usuarioPublico(u) });
  } catch (err) {
    console.error('Error en /auth/acceso-local:', err);
    res.status(500).json({ error: 'No se pudo entrar.' });
  }
});
if (ACCESO_LOCAL) console.log('[Gestión] Modo local: se puede entrar sin contraseña desde esta computadora.');

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

// Registro abierto: la cuenta queda "por aprobar" y sin permisos hasta que el admin la acepte.
router.post('/registro', async (req, res) => {
  const ip = req.ip;
  try {
    if (bloqueado(ip, 'registro')) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Espera 15 minutos e intenta de nuevo.' });
    }
    if (contarUsuarios() === 0) return res.status(400).json({ error: 'Primero hay que crear el administrador.' });
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().slice(0, 80);
    if (nombre.length < 3) throw new Error('Escribe tu nombre completo.');
    const email = validarEmail(b.email);
    const password = validarPassword(b.password);
    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ? COLLATE NOCASE OR usuario = ? COLLATE NOCASE').get([email, email]);
    if (existe) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo. Si olvidaste tu contraseña, usa "¿Olvidaste tu contraseña?".' });
    registrarFallo(ip, 'registro'); // cuenta cada registro exitoso por IP
    const r = db.prepare(`
      INSERT INTO usuarios (usuario, nombre, email, password_hash, rol, aprobado)
      VALUES (?, ?, ?, ?, 'enfermeria', 0)
    `).run([email, nombre, email, hashPassword(password)]);
    const fila = db.prepare('SELECT * FROM usuarios WHERE id = ?').get([Number(r.lastInsertRowid)]);
    // Avisar a quien tenga activado "Solicitud de cuenta nueva" en su rol (campanita y/o correo)
    try {
      const quienes = destinatariosDe('solicitud_cuenta');
      for (const a of quienes.filter(x => x.correo && x.email)) {
        correo.enviarAvisoRegistro({ para: a.email, nombre, email, enlace: urlBase(req) + '/?gestion=usuarios' }).catch(() => {});
      }
      require('./avisos').crearAvisos({
        usuarios: quienes.filter(x => x.campana).map(x => x.id), tipo: 'solicitud_cuenta', titulo: `${nombre} pidió una cuenta`,
        texto: `Con el correo ${email}. Apruébala o recházala en Configuración → Usuarios y permisos.`, vista: 'config', sub: 'usuarios', clave: `solicitud:${fila.id}`,
      });
    } catch (e) { console.error('Aviso de solicitud', e) }
    res.status(201).json({ token: crearSesion(fila.id), usuario: usuarioPublico(fila) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo crear la cuenta.' });
  }
});

// "Olvidé mi contraseña": siempre responde lo mismo para no revelar qué correos existen.
router.post('/olvide', async (req, res) => {
  const ip = req.ip;
  const respuesta = { ok: true, mensaje: 'Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.' };
  try {
    if (bloqueado(ip, 'olvide')) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Espera 15 minutos e intenta de nuevo.' });
    }
    registrarFallo(ip, 'olvide'); // cuenta cada solicitud
    let email;
    try { email = validarEmail(req.body?.email); } catch (e) { return res.status(400).json({ error: e.message }); }
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ? COLLATE NOCASE AND activo = 1').get([email]);
    if (u) {
      const enlace = enlaceUrl(req, 'recuperacion', crearEnlace(u.id, 'recuperacion'));
      // Se envía en segundo plano: la pantalla responde al instante y no revela si el correo existe
      correo.enviarRecuperacion({ para: u.email, nombre: u.nombre, enlace })
        .then(r => { if (!r.enviado) console.warn(`[Gestión] No se envió el correo de recuperación a ${u.email}. Enlace: ${enlace}`); })
        .catch(() => {});
    }
    res.json(respuesta);
  } catch (err) {
    console.error('Error en /auth/olvide:', err);
    res.json(respuesta);
  }
});

// Revisa un enlace (para mostrar el nombre en la pantalla de "crear contraseña")
router.get('/enlace/:token', (req, res) => {
  try {
    const e = buscarEnlace(req.params.token);
    if (!e) return res.status(410).json({ error: 'Este enlace ya no es válido. Pide uno nuevo.' });
    res.json({ tipo: e.tipo, nombre: e.nombre, email: e.email });
  } catch (err) {
    console.error('Error en /auth/enlace:', err);
    res.status(500).json({ error: 'No se pudo revisar el enlace.' });
  }
});

// Usa el enlace: guarda la contraseña nueva e inicia sesión
router.post('/enlace/:token', (req, res) => {
  try {
    const e = buscarEnlace(req.params.token);
    if (!e) return res.status(410).json({ error: 'Este enlace ya no es válido. Pide uno nuevo.' });
    const password = validarPassword(req.body?.password);
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run([hashPassword(password), e.usuario_id]);
    db.prepare('UPDATE enlaces_acceso SET usado = 1 WHERE usuario_id = ?').run([e.usuario_id]);
    db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run([e.usuario_id]);
    const fila = db.prepare('SELECT * FROM usuarios WHERE id = ?').get([e.usuario_id]);
    res.json({ token: crearSesion(fila.id), usuario: usuarioPublico(fila) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar la contraseña.' });
  }
});

// Mi cuenta: nombre, correo y cambio de contraseña (pide la contraseña actual)
router.put('/mi-cuenta', requireAuth, (req, res) => {
  try {
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get([req.usuario.id]);
    const b = req.body || {};
    if (!verificarPassword(String(b.password_actual || ''), u.password_hash)) {
      return res.status(400).json({ error: 'Tu contraseña actual no es correcta.' });
    }
    const nombre = String(b.nombre ?? u.nombre).trim().slice(0, 80) || u.nombre;
    const email  = b.email ? validarEmail(b.email) : null;
    if (email) {
      const otro = db.prepare('SELECT id FROM usuarios WHERE email = ? COLLATE NOCASE AND id <> ?').get([email, u.id]);
      if (otro) return res.status(409).json({ error: 'Ese correo ya lo usa otra cuenta.' });
    }
    let hash = u.password_hash;
    if (b.password_nueva) hash = hashPassword(validarPassword(b.password_nueva));
    db.prepare('UPDATE usuarios SET nombre = ?, email = ?, password_hash = ? WHERE id = ?').run([nombre, email, hash, u.id]);
    if (b.password_nueva) {
      // Cierra las demás sesiones, conserva la actual
      db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?').run([u.id, sha256(leerToken(req))]);
    }
    res.json({ usuario: usuarioPublico(db.prepare('SELECT * FROM usuarios WHERE id = ?').get([u.id])) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar.' });
  }
});

// ── Recuperación de acceso de emergencia ──────────────────────────────────────
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
module.exports.crearEnlace = crearEnlace;
module.exports.enlaceUrl   = enlaceUrl;
module.exports.validarEmail = validarEmail;
module.exports.usuarioPublico = usuarioPublico;
