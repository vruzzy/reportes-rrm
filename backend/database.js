const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rrm.db');

// Remove stale lock left by a crashed process
const lockPath = `${DB_PATH}.lock`;
try { fs.rmSync(lockPath, { recursive: true, force: true }) } catch {}

const db = new Database(DB_PATH);

db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA busy_timeout=5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS residentes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre     TEXT NOT NULL,
    iniciales  TEXT NOT NULL,
    habitacion TEXT NOT NULL,
    whatsapp   TEXT DEFAULT '',
    fecha_ingreso TEXT NOT NULL,
    creado_en  TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS aprendizaje (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id      INTEGER NOT NULL UNIQUE,
    notas_acumuladas  TEXT DEFAULT '',
    reporte_original  TEXT DEFAULT '',
    reporte_editado   TEXT DEFAULT '',
    actualizado_en    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (residente_id) REFERENCES residentes(id)
  )
`);

module.exports = db;
