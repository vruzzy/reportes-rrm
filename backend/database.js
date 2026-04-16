const { Database } = require('node-sqlite3-wasm');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rrm.db');

const db = new Database(DB_PATH);

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

module.exports = db;
