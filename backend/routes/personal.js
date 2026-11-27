// Personal, horario semanal y nómina.
// · Perfiles del personal (con o sin cuenta en el sistema), con sus sueldos por turno normal, de 12 h y nocturno.
// · Horario semanal igual al Excel que se mandaba por WhatsApp: una fila por persona, una columna por día,
//   y en cada celda un turno (7 a 7, 7 a 3, NT, D…). Si alguien no llega se marca la falta y se elige quién cubre.
// · Nómina de la semana calculada del horario; al cerrarla se guarda tal cual y ya no cambia.
// Permisos: `personal` (ver = ver horario y perfiles; editar = hacer el horario y los perfiles) y
// `nomina` (ver = ver costos y sueldos; editar = cambiar sueldos, ajustes y cerrar semanas).
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const { puede, requierePermiso, destinatariosDe } = require('../permisos');
const L = require('../medicacion/logica');

db.exec(`
  CREATE TABLE IF NOT EXISTS personal (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT NOT NULL,
    puesto        TEXT DEFAULT '',
    seccion       TEXT NOT NULL DEFAULT 'diurno' CHECK (seccion IN ('diurno','nocturno')),
    telefono      TEXT DEFAULT '',
    fecha_ingreso TEXT DEFAULT '',
    usuario_id    INTEGER UNIQUE,
    pago_tipo     TEXT NOT NULL DEFAULT 'dia' CHECK (pago_tipo IN ('hora','dia','semana')),
    tarifa        REAL NOT NULL DEFAULT 0,
    tarifa_extra  REAL NOT NULL DEFAULT 0,
    activo        INTEGER NOT NULL DEFAULT 1,
    orden         INTEGER NOT NULL DEFAULT 0,
    notas         TEXT DEFAULT '',
    creado_en     TEXT DEFAULT (datetime('now')),
    actualizado_en TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS hor_turnos (
    codigo   TEXT PRIMARY KEY,
    etiqueta TEXT NOT NULL,
    horas    REAL NOT NULL DEFAULT 0,
    inicio   TEXT DEFAULT '',
    fin      TEXT DEFAULT '',
    tipo     TEXT NOT NULL DEFAULT 'trabajo' CHECK (tipo IN ('trabajo','descanso')),
    nocturno INTEGER NOT NULL DEFAULT 0,
    se_paga  INTEGER NOT NULL DEFAULT 1,
    orden    INTEGER NOT NULL DEFAULT 0,
    activo   INTEGER NOT NULL DEFAULT 1
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS hor_celdas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL,
    fecha       TEXT NOT NULL,
    turno       TEXT NOT NULL DEFAULT '',          -- '' = no trabaja ese día ("/")
    ausencia    TEXT NOT NULL DEFAULT '',          -- '' | falta | permiso | permiso_pagado
    cubre_a     INTEGER,                           -- personal_id de a quién cubre
    horas_extra REAL NOT NULL DEFAULT 0,
    nota        TEXT DEFAULT '',
    actualizado_por_nombre TEXT DEFAULT '',
    actualizado_en TEXT DEFAULT (datetime('now')),
    UNIQUE (personal_id, fecha),
    FOREIGN KEY (personal_id) REFERENCES personal(id) ON DELETE CASCADE
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_hor_celdas_fecha ON hor_celdas (fecha)');
try { db.exec('ALTER TABLE personal ADD COLUMN tarifa_12 REAL NOT NULL DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE personal ADD COLUMN tarifa_noche REAL NOT NULL DEFAULT 0') } catch {}
try { db.exec("ALTER TABLE hor_turnos ADD COLUMN pago_como TEXT NOT NULL DEFAULT ''") } catch {}
db.exec(`
  CREATE TABLE IF NOT EXISTS hor_ajustes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lunes       TEXT NOT NULL,
    personal_id INTEGER NOT NULL,
    concepto    TEXT NOT NULL,
    monto       REAL NOT NULL,                     -- positivo = bono, negativo = descuento
    creado_por_nombre TEXT DEFAULT '',
    creado_en   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (personal_id) REFERENCES personal(id) ON DELETE CASCADE
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS hor_semanas (
    lunes       TEXT PRIMARY KEY,
    cerrada_en  TEXT,
    cerrada_por_nombre TEXT DEFAULT '',
    nomina      TEXT,                              -- foto de la nómina al cerrar (JSON)
    total       REAL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS hor_cambios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lunes       TEXT NOT NULL,
    fecha       TEXT,
    personal_id INTEGER,
    descripcion TEXT NOT NULL,
    usuario_nombre TEXT DEFAULT '',
    creado_en   TEXT DEFAULT (datetime('now'))
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_hor_cambios_lunes ON hor_cambios (lunes)');

// Turnos de la hoja de Excel. Se pueden cambiar y agregar desde la pantalla.
if (!db.prepare('SELECT COUNT(*) AS n FROM hor_turnos').get().n) {
  const ins = db.prepare('INSERT INTO hor_turnos (codigo, etiqueta, horas, inicio, fin, tipo, nocturno, se_paga, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  [
    ['7a7', '7 a 7', 12, '07:00', '19:00', 'trabajo', 0, 1],
    ['7a3', '7 a 3', 8, '07:00', '15:00', 'trabajo', 0, 1],
    ['NT', 'NT', 12, '19:00', '07:00', 'trabajo', 1, 1],
    ['D', 'D', 0, '', '', 'descanso', 0, 0],
  ].forEach((t, i) => ins.run([...t, i]));
}
// Los turnos fijos son solo 7 a 7, 7 a 3 y NT; lo demás (7 a 1, etc.) se pone como horario especial en la celda
try {
  db.exec('CREATE TABLE IF NOT EXISTS act_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  if (!db.prepare("SELECT 1 FROM act_config WHERE clave = 'turnos_v2'").get()) {
    db.exec("UPDATE hor_turnos SET activo = 0 WHERE codigo IN ('11a7','7a1','8a4','PRUEBA')");
    db.exec("INSERT INTO act_config (clave, valor) VALUES ('turnos_v2', '1')");
  }
} catch {}
try { db.exec("ALTER TABLE hor_celdas ADD COLUMN especial_inicio TEXT NOT NULL DEFAULT ''") } catch {}
try { db.exec("ALTER TABLE hor_celdas ADD COLUMN especial_fin TEXT NOT NULL DEFAULT ''") } catch {}

// Horario publicado: lo que ve el personal. hor_celdas es el borrador de administración;
// al tocar "Guardar horario" se copia aquí la semana y se avisa a cada persona.
db.exec(`
  CREATE TABLE IF NOT EXISTS hor_publicado (
    personal_id INTEGER NOT NULL,
    fecha       TEXT NOT NULL,
    turno       TEXT NOT NULL DEFAULT '',
    ausencia    TEXT NOT NULL DEFAULT '',
    cubre_a     INTEGER,
    horas_extra REAL NOT NULL DEFAULT 0,
    nota        TEXT DEFAULT '',
    especial_inicio TEXT NOT NULL DEFAULT '',
    especial_fin    TEXT NOT NULL DEFAULT '',
    UNIQUE (personal_id, fecha)
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_hor_publicado_fecha ON hor_publicado (fecha)');
try { db.exec('ALTER TABLE hor_semanas ADD COLUMN publicada_en TEXT') } catch {}
try { db.exec("ALTER TABLE hor_semanas ADD COLUMN publicada_por_nombre TEXT DEFAULT ''") } catch {}
try { db.exec('ALTER TABLE hor_semanas ADD COLUMN publicaciones INTEGER NOT NULL DEFAULT 0') } catch {}
const COLS_PUB = 'personal_id, fecha, turno, ausencia, cubre_a, horas_extra, nota, especial_inicio, especial_fin';
// Una sola vez: lo que ya existía se toma como publicado (para que nadie deje de ver su horario)
try {
  if (!db.prepare("SELECT 1 FROM act_config WHERE clave = 'horario_publicado_v1'").get()) {
    db.exec('BEGIN');
    db.exec(`INSERT OR REPLACE INTO hor_publicado (${COLS_PUB}) SELECT ${COLS_PUB} FROM hor_celdas`);
    const lunesL = [...new Set(db.prepare('SELECT DISTINCT fecha FROM hor_celdas').all().map(r => L.sumarDias(r.fecha, -((L.diaSemana(r.fecha) + 6) % 7))))];
    for (const l of lunesL) {
      db.prepare(`INSERT INTO hor_semanas (lunes, publicada_en, publicaciones) VALUES (?, datetime('now'), 1)
        ON CONFLICT(lunes) DO UPDATE SET publicada_en = COALESCE(publicada_en, datetime('now')), publicaciones = MAX(publicaciones, 1)`).run([l]);
    }
    db.exec("INSERT INTO act_config (clave, valor) VALUES ('horario_publicado_v1', '1')");
    db.exec('COMMIT');
  }
} catch (e) { try { db.exec('ROLLBACK') } catch {} console.error('Migración horario publicado', e) }

/** Horario especial de una celda (por ejemplo 07:00–13:00 → "7 a 1", 6 h). */
const minutosDe = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b };
const horaCorta = (h) => { const [a, b] = h.split(':').map(Number); const x = a % 12 || 12; return b ? `${x}:${String(b).padStart(2, '0')}` : String(x) };
function especialDe(c) {
  if (!c?.especial_inicio || !c?.especial_fin) return null;
  let m = minutosDe(c.especial_fin) - minutosDe(c.especial_inicio);
  if (m <= 0) m += 24 * 60;
  return { horas: Math.round(m / 6) / 10, etiqueta: `${horaCorta(c.especial_inicio)} a ${horaCorta(c.especial_fin)}` };
}
const horasDe = (c, t) => especialDe(c)?.horas ?? t.horas;
const etiquetaCeldaDe = (c, t) => especialDe(c)?.etiqueta || t?.etiqueta || c?.turno || '';

const AUSENCIAS = { falta: 'No llegó', permiso: 'Permiso sin goce', permiso_pagado: 'Permiso con goce' };
// Cada persona tiene tres sueldos: turno normal (8 h), turno de 12 h y nocturno.
// Un turno de otra duración se paga proporcional al normal de 8 h (7 h = normal ÷ 8 × 7).
const PAGO = { normal: 'Normal (8 h)', doce: '12 horas', noche: 'Nocturno' };
/** Cómo se paga un turno: lo elegido en el catálogo o, si no, nocturno / 12 h / normal según el turno. */
const pagoComo = (t) => (PAGO[t.pago_como] ? t.pago_como : t.nocturno ? 'noche' : t.horas >= 12 ? 'doce' : 'normal');
/** Lo que se le paga a una persona por un turno. */
function pagoTurno(p, t) {
  const hora = (p.tarifa || 0) / 8;
  const como = pagoComo(t);
  if (como === 'noche') return { como, monto: p.tarifa_noche || p.tarifa_12 || hora * t.horas };
  if (como === 'doce') return { como, monto: p.tarifa_12 || hora * t.horas };
  return { como, monto: t.horas === 8 ? (p.tarifa || 0) : hora * t.horas };
}

const lunesDe = (f) => L.sumarDias(f, -((L.diaSemana(f) + 6) % 7));
const diasDe = (lunes) => Array.from({ length: 7 }, (_, i) => L.sumarDias(lunes, i));
const dinero = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v, max = 100000) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? n : 0 };

function turnos() {
  return db.prepare('SELECT * FROM hor_turnos ORDER BY orden, etiqueta').all()
    .map(t => ({ ...t, nocturno: !!t.nocturno, se_paga: !!t.se_paga, activo: !!t.activo, pago_efectivo: pagoComo(t) }));
}

/** Quita sueldos a quien no ve la nómina. */
function personaPublica(p, verPago, usuarios) {
  const base = {
    id: p.id, nombre: p.nombre, puesto: p.puesto, seccion: p.seccion, telefono: p.telefono, fecha_ingreso: p.fecha_ingreso,
    usuario_id: p.usuario_id, usuario_nombre: p.usuario_id ? (usuarios?.[p.usuario_id] || '') : '', activo: !!p.activo, orden: p.orden, notas: p.notas,
  };
  return verPago ? { ...base, tarifa: p.tarifa, tarifa_12: p.tarifa_12, tarifa_noche: p.tarifa_noche, tarifa_extra: p.tarifa_extra } : base;
}

const nombresUsuarios = () => Object.fromEntries(db.prepare('SELECT id, nombre FROM usuarios').all().map(u => [u.id, u.nombre]));
const listaPersonal = (soloActivos = true) =>
  db.prepare(`SELECT * FROM personal ${soloActivos ? 'WHERE activo = 1' : ''} ORDER BY seccion = 'nocturno', orden, nombre COLLATE NOCASE`).all();

function celdasDe(lunes) {
  const dias = diasDe(lunes);
  return db.prepare('SELECT * FROM hor_celdas WHERE fecha >= ? AND fecha <= ?').all([dias[0], dias[6]]);
}

const semanaCerrada = (lunes) => db.prepare('SELECT * FROM hor_semanas WHERE lunes = ? AND cerrada_en IS NOT NULL').get([lunes]);

function registrar(lunes, fecha, personalId, descripcion, usuario) {
  db.prepare('INSERT INTO hor_cambios (lunes, fecha, personal_id, descripcion, usuario_nombre) VALUES (?, ?, ?, ?, ?)')
    .run([lunes, fecha, personalId, descripcion, usuario?.nombre || '']);
}

// Configuración de la nómina (Configuración → Nómina). Por ahora no se pagan horas extra.
function configNomina() {
  const f = db.prepare("SELECT valor FROM act_config WHERE clave = 'nomina_config'").get();
  let v = {}; try { v = f ? JSON.parse(f.valor) : {} } catch {}
  return { horas_extra: !!v.horas_extra };
}

/** Nómina de una semana, calculada del horario. */
function calcularNomina(lunes) {
  const pagaExtra = configNomina().horas_extra;
  const ts = Object.fromEntries(turnos().map(t => [t.codigo, t]));
  const celdas = celdasDe(lunes);
  const ajustes = db.prepare('SELECT * FROM hor_ajustes WHERE lunes = ? ORDER BY id').all([lunes]);
  // Entra quien está activo o quien tuvo algo esa semana aunque ya esté dado de baja
  const ids = new Set([...listaPersonal().map(p => p.id), ...celdas.map(c => c.personal_id), ...ajustes.map(a => a.personal_id)]);
  const personas = db.prepare(`SELECT * FROM personal ORDER BY seccion = 'nocturno', orden, nombre COLLATE NOCASE`).all().filter(p => ids.has(p.id));
  const filas = personas.map(p => {
    const mias = celdas.filter(c => c.personal_id === p.id);
    let dias = 0, horas = 0, diasPagados = 0, extra = 0, ausencias = 0, base = 0;
    const porTipo = { normal: { n: 0, monto: 0 }, doce: { n: 0, monto: 0 }, noche: { n: 0, monto: 0 }, especial: { n: 0, monto: 0 } };
    for (const c of mias) {
      const t = ts[c.turno];
      if (!t || t.tipo !== 'trabajo') continue;
      if (c.ausencia === 'falta' || c.ausencia === 'permiso') { ausencias++; continue }
      dias++; horas += horasDe(c, t); if (pagaExtra) extra += c.horas_extra || 0;
      if (!t.se_paga) continue;
      const esp = especialDe(c);
      const { como, monto } = esp ? { como: 'especial', monto: (p.tarifa || 0) / 8 * esp.horas } : pagoTurno(p, t);
      diasPagados++; base += monto; porTipo[como].n++; porTipo[como].monto += monto;
    }
    // Si trabajó los 6 días, el séptimo (su descanso) se le paga como un turno normal
    const septimo = diasPagados >= 6 ? (p.tarifa || 0) : 0;
    const tarifaExtra = p.tarifa_extra || (p.tarifa || 0) / 8;
    const montoExtra = extra * tarifaExtra;
    const aj = ajustes.filter(a => a.personal_id === p.id);
    const total = base + septimo + montoExtra + aj.reduce((s, a) => s + a.monto, 0);
    return {
      personal_id: p.id, nombre: p.nombre, puesto: p.puesto, seccion: p.seccion, activo: !!p.activo,
      tarifa: p.tarifa, tarifa_12: p.tarifa_12, tarifa_noche: p.tarifa_noche, tarifa_extra: dinero(tarifaExtra),
      dias, horas, dias_pagados: diasPagados, horas_extra: extra, ausencias,
      por_tipo: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, { n: v.n, monto: dinero(v.monto) }])),
      base: dinero(base), septimo: dinero(septimo), monto_extra: dinero(montoExtra),
      ajustes: aj.map(a => ({ id: a.id, concepto: a.concepto, monto: a.monto, creado_por_nombre: a.creado_por_nombre })),
      total: dinero(total),
    };
  }).filter(f => f.activo || f.dias || f.ausencias || f.ajustes.length);
  return { lunes, horas_extra_activas: pagaExtra, filas, total: dinero(filas.reduce((s, f) => s + f.total, 0)), sin_tarifa: filas.filter(f => !f.tarifa && f.dias).map(f => f.nombre) };
}

/** Turno de una persona con cuenta en una fecha (para Inicio y el Rol del día). */
function turnoDeUsuario(usuarioId, fecha) {
  try {
    const p = db.prepare('SELECT id FROM personal WHERE usuario_id = ? AND activo = 1').get([usuarioId]);
    if (!p) return null;
    const c = db.prepare('SELECT c.*, t.etiqueta, t.tipo FROM hor_publicado c LEFT JOIN hor_turnos t ON t.codigo = c.turno WHERE c.personal_id = ? AND c.fecha = ?').get([p.id, fecha]);
    return { programado: !!c, turno: c?.turno || '', etiqueta: c ? etiquetaCeldaDe(c, { etiqueta: c.etiqueta }) : '', tipo: c?.tipo || '', ausencia: c?.ausencia || '',
      especial: !!especialDe(c), nota: c?.nota || '' };
  } catch { return null }
}

/** Quién trabaja un día según el horario (para armar el Rol del día). */
function quienesTrabajan(fecha) {
  return db.prepare(`
    SELECT p.id, p.nombre, p.usuario_id, p.puesto, t.etiqueta, t.codigo, c.especial_inicio, c.especial_fin FROM hor_celdas c
    JOIN personal p ON p.id = c.personal_id JOIN hor_turnos t ON t.codigo = c.turno
    WHERE c.fecha = ? AND t.tipo = 'trabajo' AND c.ausencia NOT IN ('falta','permiso','permiso_pagado') AND p.activo = 1
    ORDER BY p.seccion = 'nocturno', p.orden, p.nombre COLLATE NOCASE
  `).all([fecha]).map(x => ({ id: x.id, nombre: x.nombre, usuario_id: x.usuario_id, puesto: x.puesto, codigo: x.codigo, etiqueta: etiquetaCeldaDe(x, x) }));
}

const enviarError = (res, err, msg) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(msg, err);
  res.status(500).json({ error: msg });
};

router.use(requireAuth);

// ── Mi horario (todos) ───────────────────────────────────────────────────────
// GET /api/gestion/personal/mio?fecha=  → mi semana según el horario
router.get('/mio', (req, res) => {
  const lunes = lunesDe(L.esFecha(req.query.fecha) ? req.query.fecha : L.hoyMexico());
  try {
    const dias = diasDe(lunes).map(f => ({ fecha: f, ...(turnoDeUsuario(req.usuario.id, f) || {}) }));
    res.json({ lunes, vinculado: !!db.prepare('SELECT 1 FROM personal WHERE usuario_id = ? AND activo = 1').get([req.usuario.id]), dias });
  } catch (err) { enviarError(res, err, 'No se pudo cargar tu horario.') }
});

/** El horario de una persona en un mes (para verlo como calendario). */
function horarioDelMes(personalId, mes, publicado = false) {
  const [a, m] = mes.split('-').map(Number);
  const desde = `${mes}-01`;
  const hasta = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const ts = Object.fromEntries(turnos().map(t => [t.codigo, t]));
  const nombres = Object.fromEntries(db.prepare('SELECT id, nombre FROM personal').all().map(x => [x.id, x.nombre]));
  const celdas = db.prepare(`SELECT * FROM ${publicado ? 'hor_publicado' : 'hor_celdas'} WHERE personal_id = ? AND fecha >= ? AND fecha <= ? ORDER BY fecha`).all([personalId, desde, hasta]);
  return {
    mes, desde, hasta, hoy: L.hoyMexico(),
    dias: celdas.map(c => {
      const t = ts[c.turno];
      const esp = especialDe(c);
      return {
        fecha: c.fecha, turno: c.turno, etiqueta: c.turno ? etiquetaCeldaDe(c, t) : '', tipo: t?.tipo || '', nocturno: !!t?.nocturno,
        ausencia: c.ausencia, ausencia_txt: AUSENCIAS[c.ausencia] || '', especial: esp, horas: t?.tipo === 'trabajo' ? (esp?.horas ?? t.horas) : 0,
        inicio: c.especial_inicio || t?.inicio || '', fin: c.especial_fin || t?.fin || '',
        horas_extra: configNomina().horas_extra ? c.horas_extra : 0, nota: c.nota, cubre_a: c.cubre_a ? (nombres[c.cubre_a] || '') : '',
      };
    }),
  };
}
const mesDe = (q) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(q || '') ? q : L.hoyMexico().slice(0, 7));

// GET /api/gestion/personal/mio/mes?mes=AAAA-MM  → mi horario del mes
router.get('/mio/mes', (req, res) => {
  try {
    const p = db.prepare('SELECT id, nombre FROM personal WHERE usuario_id = ? AND activo = 1').get([req.usuario.id]);
    if (!p) return res.json({ vinculado: false, mes: mesDe(req.query.mes), dias: [], hoy: L.hoyMexico() });
    res.json({ vinculado: true, nombre: p.nombre, ...horarioDelMes(p.id, mesDe(req.query.mes), true) });
  } catch (err) { enviarError(res, err, 'No se pudo cargar tu calendario.') }
});

// GET /api/gestion/personal/:id/mes?mes=  → el calendario de una persona (para administración)
router.get('/:id(\\d+)/mes', requierePermiso('personal', 'ver'), (req, res) => {
  try {
    const p = db.prepare('SELECT id, nombre FROM personal WHERE id = ?').get([Number(req.params.id)]);
    if (!p) return res.status(404).json({ error: 'No se encontró a esa persona.' });
    res.json({ vinculado: true, nombre: p.nombre, ...horarioDelMes(p.id, mesDe(req.query.mes)) });
  } catch (err) { enviarError(res, err, 'No se pudo cargar el calendario.') }
});

// ── Perfiles ─────────────────────────────────────────────────────────────────
// GET /api/gestion/personal?todos=1
router.get('/', requierePermiso('personal', 'ver'), (req, res) => {
  try {
    const verPago = puede(req.usuario, 'nomina', 'ver');
    const usuarios = nombresUsuarios();
    const ligados = new Set(db.prepare('SELECT usuario_id FROM personal WHERE usuario_id IS NOT NULL').all().map(p => p.usuario_id));
    res.json({ horas_extra_activas: configNomina().horas_extra,
      personal: listaPersonal(req.query.todos !== '1').map(p => personaPublica(p, verPago, usuarios)),
      // Cuentas del sistema que todavía no tienen perfil (para vincular)
      cuentas_libres: db.prepare('SELECT id, nombre, rol FROM usuarios WHERE activo = 1 AND aprobado = 1 ORDER BY nombre COLLATE NOCASE').all().filter(u => !ligados.has(u.id)),
      sugerencias: sugerenciasVinculo(),
      ver_pago: verPago,
    });
  } catch (err) { enviarError(res, err, 'No se pudo cargar el personal.') }
});

/** Perfiles sin cuenta que se llaman como una cuenta sin perfil (nombre completo igual, o primer nombre único). */
function sugerenciasVinculo() {
  const sinCuenta = db.prepare('SELECT id, nombre FROM personal WHERE activo = 1 AND usuario_id IS NULL').all();
  const ligados = new Set(db.prepare('SELECT usuario_id FROM personal WHERE usuario_id IS NOT NULL').all().map(x => x.usuario_id));
  const cuentas = db.prepare('SELECT id, nombre FROM usuarios WHERE activo = 1 AND aprobado = 1').all().filter(u => !ligados.has(u.id));
  const primero = (n) => L.normalizar(String(n).trim().split(/\s+/)[0]);
  const out = [], usadas = new Set();
  for (const p of sinCuenta) {
    const exacta = cuentas.filter(u => L.normalizar(u.nombre) === L.normalizar(p.nombre));
    const porPrimer = cuentas.filter(u => primero(u.nombre) === primero(p.nombre));
    const otrosPerfiles = sinCuenta.filter(x => primero(x.nombre) === primero(p.nombre)).length;
    const u = exacta.length === 1 ? exacta[0] : (porPrimer.length === 1 && otrosPerfiles === 1 ? porPrimer[0] : null);
    if (u && !usadas.has(u.id)) { usadas.add(u.id); out.push({ personal_id: p.id, nombre: p.nombre, usuario_id: u.id, usuario_nombre: u.nombre }) }
  }
  return out;
}

function leerPersona(b, req, previa) {
  const nombre = L.texto(b.nombre, 80);
  if (!nombre) throw L.errorUsuario('Escribe el nombre.');
  let usuario_id = b.usuario_id ? Number(b.usuario_id) : null;
  if (usuario_id) {
    if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get([usuario_id])) throw L.errorUsuario('Esa cuenta no existe.');
    const otro = db.prepare('SELECT nombre FROM personal WHERE usuario_id = ? AND id != ?').get([usuario_id, previa?.id || 0]);
    if (otro) throw L.errorUsuario(`Esa cuenta ya está vinculada con ${otro.nombre}.`);
  }
  const d = {
    nombre, puesto: L.texto(b.puesto, 60), seccion: b.seccion === 'nocturno' ? 'nocturno' : 'diurno',
    telefono: L.texto(b.telefono, 30), fecha_ingreso: L.esFecha(b.fecha_ingreso) ? b.fecha_ingreso : '', usuario_id, notas: L.texto(b.notas, 400),
  };
  // Los sueldos solo los cambia quien edita la nómina; si no, se quedan como estaban
  if (puede(req.usuario, 'nomina', 'editar')) {
    d.tarifa = num(b.tarifa); d.tarifa_12 = num(b.tarifa_12); d.tarifa_noche = num(b.tarifa_noche); d.tarifa_extra = num(b.tarifa_extra);
  } else {
    d.tarifa = previa?.tarifa || 0; d.tarifa_12 = previa?.tarifa_12 || 0; d.tarifa_noche = previa?.tarifa_noche || 0; d.tarifa_extra = previa?.tarifa_extra || 0;
  }
  return d;
}

// POST /api/gestion/personal  { nombre… } | { nombres: [...], seccion }  (varios a la vez, uno por renglón)
router.post('/', requierePermiso('personal', 'crear'), (req, res) => {
  const b = req.body || {};
  try {
    const lista = Array.isArray(b.nombres) ? [...new Set(b.nombres.map(n => L.texto(String(n || '').replace(/^\s*[-•*·\d.)]+\s*/, ''), 80)).filter(Boolean))] : null;
    const datos = lista ? lista.map(nombre => leerPersona({ ...b, nombre }, req)) : [leerPersona(b, req)];
    if (!datos.length) throw L.errorUsuario('Escribe al menos un nombre.');
    if (datos.length > 80) throw L.errorUsuario('Son demasiados a la vez.');
    let orden = (db.prepare('SELECT MAX(orden) AS m FROM personal').get().m || 0);
    const ins = db.prepare(`INSERT INTO personal (nombre, puesto, seccion, telefono, fecha_ingreso, usuario_id, tarifa, tarifa_12, tarifa_noche, tarifa_extra, notas, orden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    db.exec('BEGIN');
    try {
      for (const d of datos) ins.run([d.nombre, d.puesto, d.seccion, d.telefono, d.fecha_ingreso, d.usuario_id, d.tarifa, d.tarifa_12, d.tarifa_noche, d.tarifa_extra, d.notas, ++orden]);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e }
    res.status(201).json({ creados: datos.length });
  } catch (err) { enviarError(res, err, 'No se pudo guardar.') }
});

// PUT /api/gestion/personal/:id
router.put('/:id(\\d+)', requierePermiso('personal', 'editar'), (req, res) => {
  try {
    const previa = db.prepare('SELECT * FROM personal WHERE id = ?').get([Number(req.params.id)]);
    if (!previa) return res.status(404).json({ error: 'No se encontró a esa persona.' });
    const d = leerPersona(req.body || {}, req, previa);
    const activo = req.body?.activo === false ? 0 : 1;
    db.prepare(`UPDATE personal SET nombre = ?, puesto = ?, seccion = ?, telefono = ?, fecha_ingreso = ?, usuario_id = ?, tarifa = ?, tarifa_12 = ?,
      tarifa_noche = ?, tarifa_extra = ?, notas = ?, activo = ?, actualizado_en = datetime('now') WHERE id = ?`)
      .run([d.nombre, d.puesto, d.seccion, d.telefono, d.fecha_ingreso, d.usuario_id, d.tarifa, d.tarifa_12, d.tarifa_noche, d.tarifa_extra, d.notas, activo, previa.id]);
    const sueldos = (x) => `normal $${x.tarifa || 0}, 12 h $${x.tarifa_12 || 0}, nocturno $${x.tarifa_noche || 0}, extra $${x.tarifa_extra || 0}`;
    if (sueldos(previa) !== sueldos(d)) {
      registrar(lunesDe(L.hoyMexico()), null, previa.id, `Cambió el sueldo de ${d.nombre}: ${sueldos(previa)} → ${sueldos(d)}`, req.usuario);
    }
    if (!!previa.activo !== !!activo) registrar(lunesDe(L.hoyMexico()), null, previa.id, `${activo ? 'Reactivó' : 'Dio de baja'} a ${d.nombre}`, req.usuario);
    res.json(personaPublica(db.prepare('SELECT * FROM personal WHERE id = ?').get([previa.id]), puede(req.usuario, 'nomina', 'ver'), nombresUsuarios()));
  } catch (err) { enviarError(res, err, 'No se pudo guardar.') }
});

// PUT /api/gestion/personal/:id/vincular  { usuario_id }  → vincula (o desvincula con null) sin tocar lo demás
router.put('/:id(\\d+)/vincular', requierePermiso('personal', 'editar'), (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM personal WHERE id = ?').get([Number(req.params.id)]);
    if (!p) return res.status(404).json({ error: 'No se encontró a esa persona.' });
    const uid = req.body?.usuario_id ? Number(req.body.usuario_id) : null;
    if (uid) {
      const u = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get([uid]);
      if (!u) throw L.errorUsuario('Esa cuenta no existe.');
      const otro = db.prepare('SELECT nombre FROM personal WHERE usuario_id = ? AND id != ?').get([uid, p.id]);
      if (otro) throw L.errorUsuario(`Esa cuenta ya está vinculada con ${otro.nombre}.`);
    }
    db.prepare("UPDATE personal SET usuario_id = ?, actualizado_en = datetime('now') WHERE id = ?").run([uid, p.id]);
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo vincular.') }
});

// POST /api/gestion/personal/desde-cuentas  { usuario_ids: [...], seccion }  → crea perfiles ya vinculados
router.post('/desde-cuentas', requierePermiso('personal', 'crear'), (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.usuario_ids) ? req.body.usuario_ids : []).map(Number).filter(Boolean))];
  try {
    if (!ids.length) throw L.errorUsuario('Elige al menos una cuenta.');
    const ligados = new Set(db.prepare('SELECT usuario_id FROM personal WHERE usuario_id IS NOT NULL').all().map(x => x.usuario_id));
    const seccion = req.body?.seccion === 'nocturno' ? 'nocturno' : 'diurno';
    let orden = (db.prepare('SELECT MAX(orden) AS m FROM personal').get().m || 0), creados = 0;
    db.exec('BEGIN');
    try {
      for (const id of ids) {
        const u = db.prepare('SELECT id, nombre FROM usuarios WHERE id = ? AND activo = 1').get([id]);
        if (!u || ligados.has(u.id)) continue;
        db.prepare('INSERT INTO personal (nombre, seccion, usuario_id, orden) VALUES (?, ?, ?, ?)').run([u.nombre, seccion, u.id, ++orden]);
        creados++;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e }
    res.status(201).json({ creados });
  } catch (err) { enviarError(res, err, 'No se pudieron crear los perfiles.') }
});

// PUT /api/gestion/personal/orden  { ids: [...] }  → orden de las filas en el horario
router.put('/orden', requierePermiso('personal', 'editar'), (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
  try {
    const up = db.prepare('UPDATE personal SET orden = ? WHERE id = ?');
    db.exec('BEGIN');
    try { ids.forEach((id, i) => up.run([i + 1, id])); db.exec('COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e }
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo cambiar el orden.') }
});

// ── Turnos (catálogo) ────────────────────────────────────────────────────────
router.get('/turnos', requierePermiso('personal', 'ver'), (req, res) => res.json({ turnos: turnos(), ausencias: AUSENCIAS, pago_como: PAGO }));

// PUT /api/gestion/personal/turnos  { turnos: [...] }  → reemplaza el catálogo (los que se quitan quedan inactivos)
router.put('/turnos', requierePermiso('nomina', 'editar'), (req, res) => {
  const lista = Array.isArray(req.body?.turnos) ? req.body.turnos : [];
  try {
    const vistos = new Set();
    const limpios = lista.map((t, i) => {
      const codigo = L.texto(t.codigo, 12).replace(/\s+/g, '');
      const etiqueta = L.texto(t.etiqueta, 20);
      if (!codigo || !etiqueta) throw L.errorUsuario('Cada turno necesita un código y un nombre.');
      if (codigo === '/') throw L.errorUsuario('"/" ya significa que no trabaja ese día.');
      if (vistos.has(codigo.toLowerCase())) throw L.errorUsuario(`El código ${codigo} está repetido.`);
      vistos.add(codigo.toLowerCase());
      const tipo = t.tipo === 'descanso' ? 'descanso' : 'trabajo';
      return { codigo, etiqueta, horas: tipo === 'descanso' ? 0 : num(t.horas, 24), inicio: L.esHora(t.inicio) ? t.inicio : '', fin: L.esHora(t.fin) ? t.fin : '',
        tipo, nocturno: t.nocturno ? 1 : 0, se_paga: tipo === 'descanso' ? 0 : (t.se_paga === false ? 0 : 1), orden: i, pago_como: PAGO[t.pago_como] ? t.pago_como : '' };
    });
    if (!limpios.length) throw L.errorUsuario('Debe haber al menos un turno.');
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE hor_turnos SET activo = 0').run();
      const up = db.prepare(`INSERT INTO hor_turnos (codigo, etiqueta, horas, inicio, fin, tipo, nocturno, se_paga, orden, pago_como, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(codigo) DO UPDATE SET etiqueta = excluded.etiqueta, horas = excluded.horas, inicio = excluded.inicio, fin = excluded.fin,
        tipo = excluded.tipo, nocturno = excluded.nocturno, se_paga = excluded.se_paga, orden = excluded.orden, pago_como = excluded.pago_como, activo = 1`);
      for (const t of limpios) up.run([t.codigo, t.etiqueta, t.horas, t.inicio, t.fin, t.tipo, t.nocturno, t.se_paga, t.orden, t.pago_como]);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e }
    registrar(lunesDe(L.hoyMexico()), null, null, 'Cambió la lista de turnos', req.usuario);
    res.json({ turnos: turnos(), ausencias: AUSENCIAS, pago_como: PAGO });
  } catch (err) { enviarError(res, err, 'No se pudieron guardar los turnos.') }
});

// ── Horario semanal ──────────────────────────────────────────────────────────
// GET /api/gestion/personal/horario?fecha=  → la semana (lunes a domingo) que contiene esa fecha
router.get('/horario', requierePermiso('personal', 'ver'), (req, res) => {
  const lunes = lunesDe(L.esFecha(req.query.fecha) ? req.query.fecha : L.hoyMexico());
  try {
    const celdas = celdasDe(lunes);
    const conCeldas = new Set(celdas.map(c => c.personal_id));
    // Quien se dio de baja sigue saliendo en las semanas donde tuvo turnos
    const personas = db.prepare(`SELECT * FROM personal ORDER BY seccion = 'nocturno', orden, nombre COLLATE NOCASE`).all()
      .filter(p => p.activo || conCeldas.has(p.id));
    const cerrada = semanaCerrada(lunes);
    const anterior = L.sumarDias(lunes, -7);
    const sem = db.prepare('SELECT * FROM hor_semanas WHERE lunes = ?').get([lunes]);
    const pend = pendientesDe(lunes);
    res.json({
      horas_extra_activas: configNomina().horas_extra,
      publicacion: sem?.publicaciones ? { publicada_en: sem.publicada_en, publicada_por_nombre: sem.publicada_por_nombre || '', veces: sem.publicaciones } : null,
      pendientes: pend.map(x => ({ personal_id: x.personal_id, fecha: x.fecha })),
      lunes, dias: diasDe(lunes), hoy: L.hoyMexico(), turnos: turnos(), ausencias: AUSENCIAS,
      personal: personas.map(p => personaPublica(p, false)),
      celdas: celdas.map(c => ({ personal_id: c.personal_id, fecha: c.fecha, turno: c.turno, ausencia: c.ausencia, cubre_a: c.cubre_a,
        horas_extra: c.horas_extra, nota: c.nota, actualizado_por_nombre: c.actualizado_por_nombre,
        especial_inicio: c.especial_inicio, especial_fin: c.especial_fin, especial: especialDe(c) })),
      cerrada: cerrada ? { cerrada_en: cerrada.cerrada_en, cerrada_por_nombre: cerrada.cerrada_por_nombre } : null,
      anterior_tiene: !!db.prepare('SELECT 1 FROM hor_celdas WHERE fecha >= ? AND fecha < ? LIMIT 1').get([anterior, lunes]),
      cambios: db.prepare('SELECT * FROM hor_cambios WHERE lunes = ? ORDER BY id DESC LIMIT 80').all([lunes]),
    });
  } catch (err) { enviarError(res, err, 'No se pudo cargar el horario.') }
});

const etiquetaDe = (codigo, ts) => (codigo ? (ts[codigo]?.etiqueta || codigo) : '/');

/** Guarda una celda y anota el cambio. */
function guardarCelda(c, ts, usuario, personas) {
  const previa = db.prepare('SELECT * FROM hor_celdas WHERE personal_id = ? AND fecha = ?').get([c.personal_id, c.fecha]);
  const antes = previa || { turno: '', ausencia: '', horas_extra: 0, nota: '', cubre_a: null, especial_inicio: '', especial_fin: '' };
  c.especial_inicio = c.especial_inicio || ''; c.especial_fin = c.especial_fin || '';
  if (antes.turno === c.turno && antes.ausencia === c.ausencia && (antes.horas_extra || 0) === c.horas_extra && (antes.nota || '') === c.nota
    && (antes.cubre_a || null) === c.cubre_a && (antes.especial_inicio || '') === c.especial_inicio && (antes.especial_fin || '') === c.especial_fin) return false;
  db.prepare(`
    INSERT INTO hor_celdas (personal_id, fecha, turno, ausencia, cubre_a, horas_extra, nota, especial_inicio, especial_fin, actualizado_por_nombre, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(personal_id, fecha) DO UPDATE SET turno = excluded.turno, ausencia = excluded.ausencia, cubre_a = excluded.cubre_a,
      horas_extra = excluded.horas_extra, nota = excluded.nota, especial_inicio = excluded.especial_inicio, especial_fin = excluded.especial_fin,
      actualizado_por_nombre = excluded.actualizado_por_nombre, actualizado_en = excluded.actualizado_en
  `).run([c.personal_id, c.fecha, c.turno, c.ausencia, c.cubre_a, c.horas_extra, c.nota, c.especial_inicio, c.especial_fin, usuario.nombre || '']);
  const nombre = personas[c.personal_id] || '';
  const partes = [];
  const txt = (x) => (x.turno ? etiquetaCeldaDe(x, ts[x.turno]) : '/');
  if (txt(antes) !== txt(c)) partes.push(`${txt(antes)} → ${txt(c)}${especialDe(c) ? ' (horario especial)' : ''}`);
  if (antes.ausencia !== c.ausencia) partes.push(c.ausencia ? AUSENCIAS[c.ausencia] : `ya no tiene ${AUSENCIAS[antes.ausencia]?.toLowerCase() || 'ausencia'}`);
  if ((antes.horas_extra || 0) !== c.horas_extra) partes.push(`${c.horas_extra} h extra`);
  if ((antes.cubre_a || null) !== c.cubre_a && c.cubre_a) partes.push(`cubre a ${personas[c.cubre_a] || 'otra persona'}`);
  if (!partes.length && (antes.nota || '') !== c.nota) partes.push('cambió la nota');
  registrar(lunesDe(c.fecha), c.fecha, c.personal_id, `${nombre} · ${partes.join(', ')}`, usuario);
  return true;
}

/** Horario especial (entra / sale) para un turno de trabajo; se valida que tenga sentido. */
function leerEspecial(b, turno, ts) {
  if (!b.especial_inicio && !b.especial_fin) return { especial_inicio: '', especial_fin: '' };
  if (!turno || ts[turno]?.tipo !== 'trabajo') throw L.errorUsuario('El horario especial es para un día de trabajo.');
  if (!L.esHora(b.especial_inicio) || !L.esHora(b.especial_fin)) throw L.errorUsuario('Pon la hora de entrada y de salida del horario especial.');
  if (b.especial_inicio === b.especial_fin) throw L.errorUsuario('La entrada y la salida no pueden ser la misma hora.');
  return { especial_inicio: b.especial_inicio, especial_fin: b.especial_fin };
}

// PUT /api/gestion/personal/horario/celdas  { celdas: [{ personal_id, fecha, turno, ausencia, horas_extra, nota, cubre_por }] }
// cubre_por: si la persona no llegó, quién la cubre (se le pone el mismo turno con la nota "Cubre a…").
router.put('/horario/celdas', requierePermiso('personal', 'editar'), (req, res) => {
  const lista = Array.isArray(req.body?.celdas) ? req.body.celdas.slice(0, 400) : [];
  try {
    if (!lista.length) throw L.errorUsuario('No hay cambios.');
    const ts = Object.fromEntries(turnos().map(t => [t.codigo, t]));
    const personas = Object.fromEntries(db.prepare('SELECT id, nombre FROM personal').all().map(p => [p.id, p.nombre]));
    const limpias = lista.map(b => {
      const personal_id = Number(b.personal_id);
      if (!personas[personal_id]) throw L.errorUsuario('Esa persona no existe.');
      if (!L.esFecha(b.fecha)) throw L.errorUsuario('Fecha no válida.');
      const lunes = lunesDe(b.fecha);
      if (semanaCerrada(lunes)) throw L.errorUsuario('Esa semana ya se cerró para la nómina. Para cambiarla hay que reabrirla.', 409);
      const turno = b.turno && b.turno !== '/' ? String(b.turno) : '';
      if (turno && (!ts[turno] || !ts[turno].activo)) throw L.errorUsuario(`No existe el turno "${b.turno}".`);
      const ausencia = AUSENCIAS[b.ausencia] && turno && ts[turno].tipo === 'trabajo' ? b.ausencia : '';
      return {
        personal_id, fecha: b.fecha, turno, ausencia,
        horas_extra: ausencia === 'falta' || ausencia === 'permiso' ? 0 : num(b.horas_extra, 24),
        nota: L.texto(b.nota, 200), cubre_a: b.cubre_a && personas[Number(b.cubre_a)] ? Number(b.cubre_a) : null,
        cubre_por: b.cubre_por ? Number(b.cubre_por) : null,
        ...leerEspecial(b, turno, ts),
      };
    });
    db.exec('BEGIN');
    let cambiadas = 0;
    try {
      for (const c of limpias) {
        if (guardarCelda(c, ts, req.usuario, personas)) cambiadas++;
        if (c.cubre_por && c.ausencia) {
          if (!personas[c.cubre_por] || c.cubre_por === c.personal_id) throw L.errorUsuario('Elige a otra persona para cubrir.');
          const suya = db.prepare('SELECT turno FROM hor_celdas WHERE personal_id = ? AND fecha = ?').get([c.cubre_por, c.fecha]);
          if (suya?.turno && ts[suya.turno]?.tipo === 'trabajo') {
            throw L.errorUsuario(`${personas[c.cubre_por]} ya trabaja ese día (${etiquetaDe(suya.turno, ts)}). Si hace doble turno, ponle horas extra en su día.`);
          }
          guardarCelda({ personal_id: c.cubre_por, fecha: c.fecha, turno: c.turno, ausencia: '', horas_extra: 0,
            nota: `Cubre a ${personas[c.personal_id]}`, cubre_a: c.personal_id, especial_inicio: c.especial_inicio, especial_fin: c.especial_fin }, ts, req.usuario, personas);
          cambiadas++;
        }
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e }
    res.json({ cambiadas });
  } catch (err) { enviarError(res, err, 'No se pudo guardar el horario.') }
});

// POST /api/gestion/personal/horario/copiar  { de, a }  (lunes de cada semana) → copia los turnos, sin faltas ni notas
router.post('/horario/copiar', requierePermiso('personal', 'editar'), (req, res) => {
  const de = L.esFecha(req.body?.de) ? lunesDe(req.body.de) : null, a = L.esFecha(req.body?.a) ? lunesDe(req.body.a) : null;
  if (!de || !a || de === a) return res.status(400).json({ error: 'Elige dos semanas distintas.' });
  try {
    if (semanaCerrada(a)) throw L.errorUsuario('Esa semana ya se cerró para la nómina.', 409);
    const activos = new Set(listaPersonal().map(p => p.id));
    const ts = Object.fromEntries(turnos().filter(t => t.activo).map(t => [t.codigo, t]));
    const origen = celdasDe(de).filter(c => activos.has(c.personal_id));
    if (!origen.length) throw L.errorUsuario('Esa semana no tiene horario para copiar.');
    const desp = L.diasEntre(de, a);
    db.exec('BEGIN');
    try {
      const diasA = diasDe(a);
      db.prepare('DELETE FROM hor_celdas WHERE fecha >= ? AND fecha <= ?').run([diasA[0], diasA[6]]);
      const ins = db.prepare(`INSERT INTO hor_celdas (personal_id, fecha, turno, actualizado_por_nombre) VALUES (?, ?, ?, ?)`);
      for (const c of origen) if (!c.turno || ts[c.turno]) ins.run([c.personal_id, L.sumarDias(c.fecha, desp), c.turno, req.usuario.nombre || '']);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e }
    registrar(a, null, null, `Copió el horario de la semana del ${de}`, req.usuario);
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo copiar la semana.') }
});

const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_L = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const fechaC = (f) => `${Number(f.slice(8))} ${MESES_C[Number(f.slice(5, 7)) - 1]}`;
const diaC = (f) => `${DIAS_L[L.diaSemana(f)]} ${Number(f.slice(8))}`;
const MISMO = (a, b) => (a?.turno || '') === (b?.turno || '') && (a?.especial_inicio || '') === (b?.especial_inicio || '') && (a?.especial_fin || '') === (b?.especial_fin || '')
  && (a?.ausencia || '') === (b?.ausencia || '') && (a?.horas_extra || 0) === (b?.horas_extra || 0);

/** Celdas del borrador que no coinciden con lo publicado (cambios sin guardar). */
function pendientesDe(lunes) {
  const dias = diasDe(lunes);
  const bor = db.prepare('SELECT * FROM hor_celdas WHERE fecha >= ? AND fecha <= ?').all([dias[0], dias[6]]);
  const pub = db.prepare('SELECT * FROM hor_publicado WHERE fecha >= ? AND fecha <= ?').all([dias[0], dias[6]]);
  const k = (c) => `${c.personal_id}|${c.fecha}`;
  const mb = Object.fromEntries(bor.map(c => [k(c), c])), mp = Object.fromEntries(pub.map(c => [k(c), c]));
  return [...new Set([...Object.keys(mb), ...Object.keys(mp)])]
    .filter(x => !MISMO(mb[x], mp[x]))
    .map(x => { const [pid, fecha] = x.split('|'); return { personal_id: Number(pid), fecha, antes: mp[x] || null, despues: mb[x] || null } });
}

// POST /api/gestion/personal/horario/publicar  { lunes }  → "Guardar horario": el personal lo ve y le llega un aviso
router.post('/horario/publicar', requierePermiso('personal', 'editar'), (req, res) => {
  const lunes = L.esFecha(req.body?.lunes) ? lunesDe(req.body.lunes) : null;
  if (!lunes) return res.status(400).json({ error: 'Semana no válida.' });
  try {
    const dias = diasDe(lunes);
    const sem = db.prepare('SELECT * FROM hor_semanas WHERE lunes = ?').get([lunes]);
    const primera = !sem?.publicaciones;
    const cambios = pendientesDe(lunes);
    const hay = db.prepare('SELECT 1 FROM hor_celdas WHERE fecha >= ? AND fecha <= ? LIMIT 1').get([dias[0], dias[6]]);
    if (primera && !hay) throw L.errorUsuario('Esta semana todavía no tiene horario.');
    if (!primera && !cambios.length) throw L.errorUsuario('No hay cambios por guardar: el personal ya ve este horario.', 409);
    const veces = (sem?.publicaciones || 0) + 1;
    // Quién ya tenía algo guardado esa semana (antes de guardar)
    const pubAntes = new Set(db.prepare(`SELECT DISTINCT personal_id FROM hor_publicado WHERE fecha >= ? AND fecha <= ? AND turno != ''`).all([dias[0], dias[6]]).map(r => r.personal_id));
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM hor_publicado WHERE fecha >= ? AND fecha <= ?').run([dias[0], dias[6]]);
      db.prepare(`INSERT INTO hor_publicado (${COLS_PUB}) SELECT ${COLS_PUB} FROM hor_celdas WHERE fecha >= ? AND fecha <= ?`).run([dias[0], dias[6]]);
      db.prepare(`INSERT INTO hor_semanas (lunes, publicada_en, publicada_por_nombre, publicaciones) VALUES (?, datetime('now'), ?, ?)
        ON CONFLICT(lunes) DO UPDATE SET publicada_en = excluded.publicada_en, publicada_por_nombre = excluded.publicada_por_nombre, publicaciones = excluded.publicaciones`)
        .run([lunes, req.usuario.nombre || '', veces]);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e }
    const personasCambio = new Set(cambios.map(c => c.personal_id));
    registrar(lunes, null, null, primera ? 'Guardó y publicó el horario de la semana' : `Guardó el horario con ${cambios.length} cambio${cambios.length === 1 ? '' : 's'} (${personasCambio.size} persona${personasCambio.size === 1 ? '' : 's'})`, req.usuario);

    // Avisos: la primera vez a todos los que tienen turno esa semana; después, solo a quien le cambió algo
    const ts = Object.fromEntries(turnos().map(t => [t.codigo, t]));
    const txt = (c) => (c?.turno ? (ts[c.turno]?.tipo === 'descanso' ? 'Descanso' : etiquetaCeldaDe(c, ts[c.turno])) : '/');
    const rango = `${fechaC(dias[0])} – ${fechaC(dias[6])}`;
    const conCuenta = db.prepare('SELECT id, nombre, usuario_id FROM personal WHERE activo = 1 AND usuario_id IS NOT NULL').all();
    const pub = db.prepare('SELECT * FROM hor_publicado WHERE fecha >= ? AND fecha <= ?').all([dias[0], dias[6]]);
    let avisados = 0;
    try {
      const { crearAvisos } = require('./avisos');
      const reciben = new Map(destinatariosDe('horario').map(u => [u.id, u]));
      for (const p of conCuenta) {
        if (!reciben.has(p.usuario_id)) continue;
        const mias = pub.filter(c => c.personal_id === p.id);
        let titulo, texto;
        const suyos = cambios.filter(c => c.personal_id === p.id);
        // Primera vez de la semana, o antes no tenía nada guardado esa semana: se le manda su semana completa
        if (primera || (suyos.length && mias.some(c => c.turno) && !pubAntes.has(p.id))) {
          if (!mias.length) continue;
          titulo = `Ya está tu horario de la semana ${rango}`;
          texto = dias.map(f => { const c = mias.find(x => x.fecha === f); return `${DIAS_L[L.diaSemana(f)].slice(0, 3)} ${txt(c)}` }).join(' · ');
        } else {
          if (!suyos.length) continue;
          titulo = `Cambió tu horario (semana ${rango})`;
          texto = suyos.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(c => `${diaC(c.fecha)}: ${txt(c.antes)} → ${txt(c.despues)}`).join(' · ');
        }
        avisados += crearAvisos({ usuarios: [{ id: p.usuario_id, correo: reciben.get(p.usuario_id).correo }], tipo: 'horario', titulo, texto, vista: 'inicio', clave: `horario:${lunes}:${veces}` });
      }
    } catch (e) { console.error('Avisos del horario', e) }
    res.json({ ok: true, primera, cambios: cambios.length, avisados });
  } catch (err) { enviarError(res, err, 'No se pudo guardar el horario.') }
});

// GET /api/gestion/personal/dia?fecha=  → quién trabaja ese día (para el Rol del día)
router.get('/dia', requierePermiso('actividades', 'ver'), (req, res) => {
  const fecha = L.esFecha(req.query.fecha) ? req.query.fecha : L.hoyMexico();
  try { res.json({ fecha, personas: quienesTrabajan(fecha) }) } catch (err) { enviarError(res, err, 'No se pudo cargar quién trabaja.') }
});

// GET /api/gestion/personal/config  → { horas_extra }
router.get('/config', requierePermiso('personal', 'ver'), (req, res) => res.json(configNomina()));
// PUT /api/gestion/personal/config  { horas_extra }
router.put('/config', requierePermiso('nomina', 'editar'), (req, res) => {
  try {
    const antes = configNomina();
    const nueva = { ...antes, horas_extra: !!req.body?.horas_extra };
    db.prepare("INSERT INTO act_config (clave, valor) VALUES ('nomina_config', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run([JSON.stringify(nueva)]);
    if (antes.horas_extra !== nueva.horas_extra) registrar(lunesDe(L.hoyMexico()), null, null, nueva.horas_extra ? 'Activó el pago de horas extra' : 'Desactivó el pago de horas extra', req.usuario);
    res.json(nueva);
  } catch (err) { enviarError(res, err, 'No se pudo guardar.') }
});

// ── Nómina ───────────────────────────────────────────────────────────────────
// GET /api/gestion/personal/nomina?fecha=
router.get('/nomina', requierePermiso('nomina', 'ver'), (req, res) => {
  const lunes = lunesDe(L.esFecha(req.query.fecha) ? req.query.fecha : L.hoyMexico());
  try {
    const cerrada = semanaCerrada(lunes);
    if (cerrada) {
      const foto = JSON.parse(cerrada.nomina || '{}');
      return res.json({ ...foto, lunes, cerrada: { cerrada_en: cerrada.cerrada_en, cerrada_por_nombre: cerrada.cerrada_por_nombre }, pago_como: PAGO });
    }
    res.json({ ...calcularNomina(lunes), cerrada: null, pago_como: PAGO });
  } catch (err) { enviarError(res, err, 'No se pudo calcular la nómina.') }
});

// GET /api/gestion/personal/nomina/historial  → semanas cerradas con su total
router.get('/nomina/historial', requierePermiso('nomina', 'ver'), (req, res) => {
  try {
    res.json(db.prepare('SELECT lunes, cerrada_en, cerrada_por_nombre, total FROM hor_semanas WHERE cerrada_en IS NOT NULL ORDER BY lunes DESC LIMIT 104').all());
  } catch (err) { enviarError(res, err, 'No se pudo cargar el historial.') }
});

// POST /api/gestion/personal/nomina/ajustes  { lunes, personal_id, concepto, monto }
router.post('/nomina/ajustes', requierePermiso('nomina', 'editar'), (req, res) => {
  const b = req.body || {};
  try {
    const lunes = L.esFecha(b.lunes) ? lunesDe(b.lunes) : null;
    if (!lunes) throw L.errorUsuario('Semana no válida.');
    if (semanaCerrada(lunes)) throw L.errorUsuario('Esa semana ya se cerró.', 409);
    const p = db.prepare('SELECT * FROM personal WHERE id = ?').get([Number(b.personal_id)]);
    if (!p) throw L.errorUsuario('Esa persona no existe.');
    const concepto = L.texto(b.concepto, 80);
    const monto = Number(b.monto);
    if (!concepto) throw L.errorUsuario('Escribe el concepto (por ejemplo: bono, préstamo, adelanto).');
    if (!Number.isFinite(monto) || !monto || Math.abs(monto) > 1000000) throw L.errorUsuario('Escribe un monto válido (negativo si es descuento).');
    db.prepare('INSERT INTO hor_ajustes (lunes, personal_id, concepto, monto, creado_por_nombre) VALUES (?, ?, ?, ?, ?)')
      .run([lunes, p.id, concepto, dinero(monto), req.usuario.nombre || '']);
    registrar(lunes, null, p.id, `${p.nombre} · ${monto > 0 ? 'bono' : 'descuento'} "${concepto}" $${Math.abs(dinero(monto))}`, req.usuario);
    res.status(201).json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo guardar el ajuste.') }
});

// DELETE /api/gestion/personal/nomina/ajustes/:id
router.delete('/nomina/ajustes/:id', requierePermiso('nomina', 'editar'), (req, res) => {
  try {
    const a = db.prepare('SELECT a.*, p.nombre FROM hor_ajustes a JOIN personal p ON p.id = a.personal_id WHERE a.id = ?').get([Number(req.params.id)]);
    if (!a) return res.status(404).json({ error: 'No se encontró el ajuste.' });
    if (semanaCerrada(a.lunes)) throw L.errorUsuario('Esa semana ya se cerró.', 409);
    db.prepare('DELETE FROM hor_ajustes WHERE id = ?').run([a.id]);
    registrar(a.lunes, null, a.personal_id, `${a.nombre} · quitó "${a.concepto}" $${Math.abs(a.monto)}`, req.usuario);
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo quitar el ajuste.') }
});

// POST /api/gestion/personal/nomina/cerrar  { lunes }  → guarda la nómina tal cual y bloquea el horario de esa semana
router.post('/nomina/cerrar', requierePermiso('nomina', 'editar'), (req, res) => {
  const lunes = L.esFecha(req.body?.lunes) ? lunesDe(req.body.lunes) : null;
  if (!lunes) return res.status(400).json({ error: 'Semana no válida.' });
  try {
    if (semanaCerrada(lunes)) throw L.errorUsuario('Esa semana ya estaba cerrada.', 409);
    if (pendientesDe(lunes).length) throw L.errorUsuario('El horario de esa semana tiene cambios sin guardar. Primero toca "Guardar horario".', 409);
    const n = calcularNomina(lunes);
    db.prepare(`INSERT INTO hor_semanas (lunes, cerrada_en, cerrada_por_nombre, nomina, total) VALUES (?, datetime('now'), ?, ?, ?)
      ON CONFLICT(lunes) DO UPDATE SET cerrada_en = excluded.cerrada_en, cerrada_por_nombre = excluded.cerrada_por_nombre, nomina = excluded.nomina, total = excluded.total`)
      .run([lunes, req.usuario.nombre || '', JSON.stringify(n), n.total]);
    registrar(lunes, null, null, `Cerró la nómina: $${n.total}`, req.usuario);
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo cerrar la semana.') }
});

// POST /api/gestion/personal/nomina/reabrir  { lunes }
router.post('/nomina/reabrir', requierePermiso('nomina', 'editar'), (req, res) => {
  const lunes = L.esFecha(req.body?.lunes) ? lunesDe(req.body.lunes) : null;
  if (!lunes) return res.status(400).json({ error: 'Semana no válida.' });
  try {
    const c = semanaCerrada(lunes);
    if (!c) throw L.errorUsuario('Esa semana no está cerrada.');
    db.prepare('UPDATE hor_semanas SET cerrada_en = NULL WHERE lunes = ?').run([lunes]);
    registrar(lunes, null, null, `Reabrió la nómina (estaba cerrada en $${c.total})`, req.usuario);
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo reabrir la semana.') }
});

module.exports = router;
module.exports.turnoDeUsuario = turnoDeUsuario;
module.exports.quienesTrabajan = quienesTrabajan;
/** El turno programado de una persona en una fecha, con su hora de entrada y salida (para Entradas y salidas). */
module.exports.turnoDePersonal = function turnoDePersonal(personalId, fecha) {
  // Lo publicado: es lo que el personal ve y con lo que se revisan las entradas
  const c = db.prepare('SELECT c.*, t.etiqueta, t.tipo, t.inicio, t.fin, t.nocturno, t.horas FROM hor_publicado c LEFT JOIN hor_turnos t ON t.codigo = c.turno WHERE c.personal_id = ? AND c.fecha = ?').get([personalId, fecha]);
  if (!c || !c.turno) return null;
  return { turno: c.turno, etiqueta: etiquetaCeldaDe(c, { etiqueta: c.etiqueta }), tipo: c.tipo, nocturno: !!c.nocturno, ausencia: c.ausencia,
    inicio: c.especial_inicio || c.inicio || '', fin: c.especial_fin || c.fin || '', horas: c.tipo === 'trabajo' ? (especialDe(c)?.horas ?? c.horas ?? 0) : 0 };
};
