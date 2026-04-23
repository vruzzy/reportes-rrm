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

db.exec(`
  CREATE TABLE IF NOT EXISTS recibos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    numero       INTEGER NOT NULL,
    residente_id INTEGER,
    nombre       TEXT NOT NULL,
    ciudad       TEXT NOT NULL DEFAULT 'Mérida, Yucatán',
    fecha        TEXT NOT NULL,
    periodo_de   TEXT NOT NULL,
    periodo_hasta TEXT NOT NULL,
    valor        REAL NOT NULL,
    forma_pago   TEXT NOT NULL DEFAULT 'efectivo',
    observaciones TEXT DEFAULT '',
    creado_en    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE SET NULL
  )
`);

// Migraciones: agregar columnas nuevas si no existen
try { db.exec(`ALTER TABLE aprendizaje ADD COLUMN reporte_original TEXT DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE aprendizaje ADD COLUMN reporte_editado TEXT DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE aprendizaje DROP COLUMN ultimo_reporte`) } catch {}
try { db.exec(`ALTER TABLE residentes ADD COLUMN mensualidad REAL DEFAULT 0`) } catch {}
try { db.exec(`ALTER TABLE residentes ADD COLUMN ciudad TEXT DEFAULT 'Mérida, Yucatán'`) } catch {}
try { db.exec(`ALTER TABLE residentes ADD COLUMN familiar TEXT DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE residentes ADD COLUMN dia_pago INTEGER DEFAULT 1`) } catch {}

module.exports = db;
