// Avisos dentro de Gestión (la campanita): por ahora, retardos y quién no ha marcado su entrada.
// Cada aviso es para una persona (usuario). `clave` evita mandar el mismo aviso dos veces.
// Si se pide, también se manda por correo (Brevo / Gmail, ver correo.js).
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const L = require('../medicacion/logica');
const correo = require('../correo');

db.exec(`
  CREATE TABLE IF NOT EXISTS avisos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER NOT NULL,
    tipo        TEXT NOT NULL,
    titulo      TEXT NOT NULL,
    texto       TEXT DEFAULT '',
    vista       TEXT DEFAULT '',      -- a qué pantalla lleva (ej. 'asistencia')
    sub         TEXT DEFAULT '',      -- pestaña dentro de esa pantalla
    clave       TEXT NOT NULL,
    momento     TEXT NOT NULL,        -- 'AAAA-MM-DD HH:MM' hora de México
    leido_en    TEXT,
    UNIQUE (usuario_id, clave)
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_avisos_usuario ON avisos (usuario_id, id)');

/**
 * Crea un aviso para cada usuario (activo) de la lista. No repite si ya existe la misma clave.
 * usuarios: [id] o [{ id, correo }] (correo = también por correo a esa persona).
 * correo: { activo, url } → por correo a todos los de la lista (si no se indica por persona).
 * Devuelve cuántos avisos nuevos se crearon.
 */
function crearAvisos({ usuarios, tipo, titulo, texto = '', vista = '', sub = '', clave, correo: porCorreo }) {
  const porId = new Map();
  for (const x of usuarios || []) { const id = Number(typeof x === 'object' ? x.id : x); if (id) porId.set(id, typeof x === 'object' ? !!x.correo : !!porCorreo?.activo) }
  const ids = [...porId.keys()];
  if (!ids.length) return 0;
  const a = L.ahoraMexico();
  const momento = `${a.fecha} ${a.hora}`;
  let nuevos = 0;
  for (const id of ids) {
    const u = db.prepare('SELECT id, nombre, email, activo, aprobado FROM usuarios WHERE id = ?').get([id]);
    if (!u || !u.activo || u.aprobado === 0) continue;
    const r = db.prepare(`INSERT OR IGNORE INTO avisos (usuario_id, tipo, titulo, texto, vista, sub, clave, momento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run([id, tipo, titulo, texto, vista, sub, clave, momento]);
    if (!r.changes) continue;
    nuevos++;
    if (porId.get(id) && u.email) {
      correo.enviarAviso({ para: u.email, titulo, texto, enlace: `${porCorreo?.url || process.env.APP_URL || ''}/?gestion=1` }).catch(() => {});
    }
  }
  return nuevos;
}

router.use(requireAuth);

// GET /api/gestion/avisos  → los últimos 40 y cuántos sin leer
router.get('/', (req, res) => {
  try {
    const avisos = db.prepare('SELECT id, tipo, titulo, texto, vista, sub, momento, leido_en FROM avisos WHERE usuario_id = ? ORDER BY id DESC LIMIT 40').all([req.usuario.id]);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM avisos WHERE usuario_id = ? AND leido_en IS NULL').get([req.usuario.id]);
    res.json({ avisos: avisos.map(x => ({ ...x, leido: !!x.leido_en })), no_leidos: n });
  } catch (err) {
    console.error('Avisos', err);
    res.status(500).json({ error: 'No se pudieron cargar los avisos.' });
  }
});

// POST /api/gestion/avisos/leer  { id? }  → sin id marca todos
router.post('/leer', (req, res) => {
  try {
    const id = Number(req.body?.id);
    if (id) db.prepare("UPDATE avisos SET leido_en = datetime('now') WHERE id = ? AND usuario_id = ? AND leido_en IS NULL").run([id, req.usuario.id]);
    else db.prepare("UPDATE avisos SET leido_en = datetime('now') WHERE usuario_id = ? AND leido_en IS NULL").run([req.usuario.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Avisos', err);
    res.status(500).json({ error: 'No se pudo marcar como leído.' });
  }
});

module.exports = router;
module.exports.crearAvisos = crearAvisos;
