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

db.exec(`
  CREATE TABLE IF NOT EXISTS reportes (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id            INTEGER,
    fecha                   TEXT NOT NULL,
    turno                   TEXT NOT NULL,
    texto_reporte           TEXT NOT NULL,
    notas_adicionales       TEXT DEFAULT '',
    signos_vitales          TEXT DEFAULT '{}',
    alimentacion            TEXT DEFAULT '',
    medicamentos            TEXT DEFAULT '',
    observaciones_especiales TEXT DEFAULT '',
    micciones               TEXT DEFAULT '[]',
    evacuaciones            TEXT DEFAULT '[]',
    creado_en               TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE SET NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS visitas (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id     INTEGER,
    residente_nombre TEXT DEFAULT '',
    tipo             TEXT NOT NULL DEFAULT 'familiar',
    visitante        TEXT DEFAULT '',
    parentesco       TEXT DEFAULT '',
    fecha            TEXT NOT NULL,
    hora             TEXT DEFAULT '',
    notas            TEXT DEFAULT '',
    estado           TEXT NOT NULL DEFAULT 'pendiente',
    recurrencia      TEXT NOT NULL DEFAULT 'ninguna',
    dias_semana      TEXT DEFAULT '',
    creado_en        TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE SET NULL
  )
`);

// ── Gestión: usuarios y sesiones ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nombre        TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol           TEXT NOT NULL DEFAULT 'admin',
    activo        INTEGER NOT NULL DEFAULT 1,
    creado_en     TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sesiones (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    expira_en  TEXT NOT NULL,
    creado_en  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
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
try { db.exec(`ALTER TABLE residentes ADD COLUMN frecuencia TEXT DEFAULT 'mensual'`) } catch {}
try { db.exec(`ALTER TABLE residentes ADD COLUMN tipo_servicio TEXT DEFAULT 'residencia_permanente'`) } catch {}
try { db.exec(`ALTER TABLE residentes ADD COLUMN dias_asistencia INTEGER DEFAULT 5`) } catch {}
try { db.exec(`ALTER TABLE residentes ADD COLUMN horario_horas INTEGER DEFAULT 8`) } catch {}
try { db.exec(`ALTER TABLE recibos ADD COLUMN dias_asistencia INTEGER`) } catch {}
try { db.exec(`ALTER TABLE recibos ADD COLUMN horario_horas INTEGER`) } catch {}
try { db.exec(`ALTER TABLE visitas ADD COLUMN recurrencia TEXT DEFAULT 'ninguna'`) } catch {}
try { db.exec(`ALTER TABLE visitas ADD COLUMN dias_semana TEXT DEFAULT ''`) } catch {}

// Gestión: campos extendidos del expediente del residente
for (const col of [
  `foto TEXT DEFAULT ''`,
  `fecha_nacimiento TEXT DEFAULT ''`,
  `curp TEXT DEFAULT ''`,
  `tipo_cliente TEXT DEFAULT 'privado'`,
  `mutualista TEXT DEFAULT 'no_posee'`,
  `mutualista_socio TEXT DEFAULT ''`,
  `mutualista_tel TEXT DEFAULT ''`,
  `emergencia TEXT DEFAULT ''`,
  `emergencia_tel TEXT DEFAULT ''`,
  `familiar_tel TEXT DEFAULT ''`,
  `ubicacion TEXT DEFAULT 'residencia'`,
]) {
  try { db.exec(`ALTER TABLE residentes ADD COLUMN ${col}`) } catch {}
}

module.exports = db;
