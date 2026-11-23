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

// Gestión: correo, permisos personalizados y enlaces de un solo uso
try { db.exec(`ALTER TABLE usuarios ADD COLUMN email TEXT COLLATE NOCASE`) } catch {}
try { db.exec(`ALTER TABLE usuarios ADD COLUMN permisos TEXT`) } catch {}
try { db.exec(`ALTER TABLE usuarios ADD COLUMN invitado_por INTEGER`) } catch {}
try { db.exec(`ALTER TABLE usuarios ADD COLUMN aprobado INTEGER NOT NULL DEFAULT 1`) } catch {} // 0 = se registró solo y espera aprobación
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email) WHERE email IS NOT NULL AND email <> ''`);
db.exec(`
  CREATE TABLE IF NOT EXISTS enlaces_acceso (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    tipo       TEXT NOT NULL,              -- 'invitacion' | 'recuperacion'
    expira_en  TEXT NOT NULL,
    usado      INTEGER NOT NULL DEFAULT 0,
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

// ── Gestión: controles diarios (signos vitales por turno) ────────────────────
// Una toma por residente + fecha del turno + turno + momento (al recibir / al entregar).
// La "fecha" es el día en que EMPIEZA el turno (el nocturno que termina de madrugada
// sigue perteneciendo al día anterior).
db.exec(`
  CREATE TABLE IF NOT EXISTS controles_signos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id   INTEGER NOT NULL,
    fecha          TEXT NOT NULL,
    turno          TEXT NOT NULL,              -- Matutino-Vespertino | Nocturno
    momento        TEXT NOT NULL,              -- recibir | entregar
    hora           TEXT DEFAULT '',
    ta_sistolica   REAL,
    ta_diastolica  REAL,
    fc             REAL,
    spo2           REAL,
    fr             REAL,
    temperatura    REAL,
    glucosa        REAL,
    notas          TEXT DEFAULT '',
    usuario_id     INTEGER,
    usuario_nombre TEXT DEFAULT '',
    creado_en      TEXT DEFAULT (datetime('now')),
    actualizado_en TEXT DEFAULT (datetime('now')),
    UNIQUE (residente_id, fecha, turno, momento),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE CASCADE
  )
`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_controles_fecha ON controles_signos (fecha, turno)`) } catch {}

// Micciones y evacuaciones: un registro por evento, dentro de un turno
db.exec(`
  CREATE TABLE IF NOT EXISTS controles_eliminacion (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id    INTEGER NOT NULL,
    fecha           TEXT NOT NULL,
    turno           TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('miccion', 'evacuacion')),
    hora            TEXT DEFAULT '',
    caracteristicas TEXT DEFAULT '[]',
    usuario_id      INTEGER,
    usuario_nombre  TEXT DEFAULT '',
    creado_en       TEXT DEFAULT (datetime('now')),
    actualizado_en  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE CASCADE
  )
`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_eliminacion_fecha ON controles_eliminacion (fecha, turno)`) } catch {}

// Reportes hechos desde Gestión: ambas tomas del turno, quién lo hizo y la hora
try { db.exec(`ALTER TABLE reportes ADD COLUMN signos_turno TEXT DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE reportes ADD COLUMN enfermero TEXT DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE reportes ADD COLUMN hora TEXT DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE reportes ADD COLUMN usuario_id INTEGER`) } catch {}
try { db.exec(`ALTER TABLE reportes ADD COLUMN datos_turno TEXT DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE reportes ADD COLUMN origen TEXT DEFAULT 'app'`) } catch {}
try { db.exec(`ALTER TABLE reportes ADD COLUMN texto_original TEXT DEFAULT ''`) } catch {}

module.exports = db;
