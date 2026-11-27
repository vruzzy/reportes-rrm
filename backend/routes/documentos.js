// Documentos del expediente de cada residente (INE, CURP, estudios, contrato…).
// Los archivos se guardan en disco junto a la base (en Railway, en el volumen): <carpeta de la base>/documentos/<residente>/.
// En la base solo queda el registro (nombre, tipo, tamaño, quién lo subió).
// Permiso `documentos`: ver = ver y descargar, crear = subir, editar = cambiar tipo/nombre y los tipos (Configuración), eliminar = borrar.
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const db      = require('../database');
const { requireAuth } = require('./auth');
const { requierePermiso } = require('../permisos');

const CARPETA = path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, '..', 'rrm.db')), 'documentos');
const MAX_BYTES = 15 * 1024 * 1024;
// Tipos de archivo que se aceptan (lo que se usa en un expediente)
const PERMITIDOS = {
  'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic',
  'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

db.exec(`
  CREATE TABLE IF NOT EXISTS residente_documentos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id INTEGER NOT NULL,
    tipo         TEXT NOT NULL DEFAULT 'Otros',
    nombre       TEXT NOT NULL,
    archivo      TEXT NOT NULL,          -- nombre del archivo en disco
    mime         TEXT NOT NULL,
    tamano       INTEGER NOT NULL DEFAULT 0,
    nota         TEXT DEFAULT '',
    subido_por_nombre TEXT DEFAULT '',
    creado_en    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE CASCADE
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_resdoc_residente ON residente_documentos (residente_id)');
db.exec('CREATE TABLE IF NOT EXISTS act_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');

const TIPOS_INICIALES = ['Identificación (INE, CURP, acta)', 'Médicos (estudios, valoraciones, recetas)', 'Contrato y pagos', 'Seguro / mutualista', 'Fotos', 'Otros'];
function tipos() {
  const f = db.prepare("SELECT valor FROM act_config WHERE clave = 'doc_tipos'").get();
  try { const v = f ? JSON.parse(f.valor) : null; if (Array.isArray(v) && v.length) return v } catch {}
  return TIPOS_INICIALES;
}
const limpio = (s, max = 120) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const publico = (d) => ({ id: d.id, residente_id: d.residente_id, tipo: d.tipo, nombre: d.nombre, mime: d.mime, tamano: d.tamano, nota: d.nota, subido_por_nombre: d.subido_por_nombre, creado_en: d.creado_en });
const rutaDe = (d) => path.join(CARPETA, String(d.residente_id), d.archivo);

router.use(requireAuth);

// GET /api/gestion/documentos/tipos
router.get('/tipos', requierePermiso('documentos', 'ver'), (req, res) => res.json({ tipos: tipos() }));
// PUT /api/gestion/documentos/tipos  { tipos: [] }
router.put('/tipos', requierePermiso('documentos', 'editar'), (req, res) => {
  const lista = [...new Set((Array.isArray(req.body?.tipos) ? req.body.tipos : []).map(t => limpio(t, 60)).filter(Boolean))].slice(0, 40);
  if (!lista.length) return res.status(400).json({ error: 'Escribe al menos un tipo de documento.' });
  db.prepare("INSERT INTO act_config (clave, valor) VALUES ('doc_tipos', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run([JSON.stringify(lista)]);
  res.json({ tipos: lista });
});

// GET /api/gestion/documentos?residente_id=
router.get('/', requierePermiso('documentos', 'ver'), (req, res) => {
  const rid = Number(req.query.residente_id);
  if (!rid) return res.status(400).json({ error: 'Falta el residente.' });
  try {
    res.json({ tipos: tipos(), documentos: db.prepare('SELECT * FROM residente_documentos WHERE residente_id = ? ORDER BY creado_en DESC, id DESC').all([rid]).map(publico) });
  } catch (err) { console.error('Documentos', err); res.status(500).json({ error: 'No se pudieron cargar los documentos.' }) }
});

// POST /api/gestion/documentos?residente_id=&tipo=&nombre=   (el cuerpo es el archivo tal cual)
router.post('/', requierePermiso('documentos', 'crear'), express.raw({ type: () => true, limit: MAX_BYTES }), (req, res) => {
  try {
    const rid = Number(req.query.residente_id);
    if (!rid || !db.prepare('SELECT 1 FROM residentes WHERE id = ?').get([rid])) return res.status(404).json({ error: 'Ese residente no existe.' });
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!PERMITIDOS[mime]) return res.status(400).json({ error: 'Ese tipo de archivo no se acepta. Sube PDF, fotos (JPG, PNG) o documentos de Word/Excel.' });
    const datos = req.body;
    if (!Buffer.isBuffer(datos) || !datos.length) return res.status(400).json({ error: 'El archivo llegó vacío.' });
    const nombre = limpio(req.query.nombre) || `Documento${PERMITIDOS[mime]}`;
    const lista = tipos();
    const tipo = lista.includes(req.query.tipo) ? req.query.tipo : lista[lista.length - 1];
    const archivo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${PERMITIDOS[mime]}`;
    fs.mkdirSync(path.join(CARPETA, String(rid)), { recursive: true });
    fs.writeFileSync(path.join(CARPETA, String(rid), archivo), datos);
    const r = db.prepare('INSERT INTO residente_documentos (residente_id, tipo, nombre, archivo, mime, tamano, nota, subido_por_nombre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run([rid, tipo, nombre, archivo, mime, datos.length, limpio(req.query.nota, 200), req.usuario.nombre || '']);
    res.status(201).json(publico(db.prepare('SELECT * FROM residente_documentos WHERE id = ?').get([Number(r.lastInsertRowid)])));
  } catch (err) { console.error('Subir documento', err); res.status(500).json({ error: 'No se pudo subir el documento.' }) }
});

// GET /api/gestion/documentos/:id/archivo  → el archivo (para ver o descargar)
router.get('/:id(\\d+)/archivo', requierePermiso('documentos', 'ver'), (req, res) => {
  try {
    const d = db.prepare('SELECT * FROM residente_documentos WHERE id = ?').get([Number(req.params.id)]);
    if (!d) return res.status(404).json({ error: 'No se encontró el documento.' });
    const ruta = rutaDe(d);
    if (!fs.existsSync(ruta)) return res.status(410).json({ error: 'El archivo ya no está en el servidor.' });
    res.setHeader('Content-Type', d.mime);
    res.setHeader('Content-Disposition', `${req.query.descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(d.nombre)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(ruta).pipe(res);
  } catch (err) { console.error('Ver documento', err); res.status(500).json({ error: 'No se pudo abrir el documento.' }) }
});

// PUT /api/gestion/documentos/:id  { tipo, nombre, nota }
router.put('/:id(\\d+)', requierePermiso('documentos', 'editar'), (req, res) => {
  try {
    const d = db.prepare('SELECT * FROM residente_documentos WHERE id = ?').get([Number(req.params.id)]);
    if (!d) return res.status(404).json({ error: 'No se encontró el documento.' });
    const lista = tipos();
    const tipo = lista.includes(req.body?.tipo) ? req.body.tipo : d.tipo;
    const nombre = limpio(req.body?.nombre) || d.nombre;
    const nota = req.body?.nota !== undefined ? limpio(req.body.nota, 200) : d.nota;
    db.prepare('UPDATE residente_documentos SET tipo = ?, nombre = ?, nota = ? WHERE id = ?').run([tipo, nombre, nota, d.id]);
    res.json(publico(db.prepare('SELECT * FROM residente_documentos WHERE id = ?').get([d.id])));
  } catch (err) { console.error('Documento', err); res.status(500).json({ error: 'No se pudo guardar.' }) }
});

// DELETE /api/gestion/documentos/:id
router.delete('/:id(\\d+)', requierePermiso('documentos', 'eliminar'), (req, res) => {
  try {
    const d = db.prepare('SELECT * FROM residente_documentos WHERE id = ?').get([Number(req.params.id)]);
    if (!d) return res.status(404).json({ error: 'No se encontró el documento.' });
    db.prepare('DELETE FROM residente_documentos WHERE id = ?').run([d.id]);
    try { fs.unlinkSync(rutaDe(d)) } catch {}
    res.json({ ok: true });
  } catch (err) { console.error('Borrar documento', err); res.status(500).json({ error: 'No se pudo borrar.' }) }
});

module.exports = router;
