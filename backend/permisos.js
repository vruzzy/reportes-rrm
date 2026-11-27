// Roles, permisos y notificaciones de Gestión.
//
// Cada sección (módulo) tiene acciones: ver, crear, editar y eliminar (solo las que aplican a esa sección).
// Los roles viven en la tabla `roles` (se pueden agregar y cambiar desde Configuración → Permisos y notificaciones).
// A una persona se le pueden personalizar los permisos (usuarios.permisos, JSON); si no, usa los de su rol.
// El rol `admin` siempre tiene todo.
//
// Formato guardado: { listado: ['ver','crear','editar'], controles: ['ver'] … }
// Formato anterior (se sigue aceptando): { listado: 'editar', controles: 'ver' }
// Para el frontend se manda también `permisos` en el formato anterior ('ver' | 'editar') para no romper pantallas,
// y `acciones` con el detalle.

const db = require('./database');

const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'];

// acciones: qué hace cada permiso y dónde se usa (sale en el ícono ⓘ)
const MODULOS = [
  { id: 'listado', seccion: 'Residentes', label: 'Listado de residentes', acciones: {
    ver: 'Ver el listado de residentes y abrir su expediente.',
    crear: 'Agregar residentes nuevos (botón "Agregar residente").',
    editar: 'Cambiar los datos del expediente y la ubicación (En residencia / Fuera).' } },
  { id: 'controles', seccion: 'Residentes', label: 'Controles diarios', acciones: {
    ver: 'Ver signos vitales, micciones y evacuaciones.',
    crear: 'Capturar signos vitales, micciones y evacuaciones.',
    editar: 'Corregir lo que ya se capturó.',
    eliminar: 'Borrar registros de micciones y evacuaciones.' } },
  { id: 'reportes', seccion: 'Residentes', label: 'Reportes de turno', acciones: {
    ver: 'Ver los reportes de turno.',
    crear: 'Generar el reporte de turno con IA.',
    editar: 'Corregir el texto de un reporte ya generado.',
    eliminar: 'Borrar reportes.' } },
  { id: 'historial', seccion: 'Residentes', label: 'Historial', acciones: {
    ver: 'Ver el historial (próximamente).' } },
  { id: 'documentos', seccion: 'Residentes', label: 'Documentos del expediente', acciones: {
    ver: 'Ver y descargar los documentos del expediente de cada residente (perfil → Documentos).',
    crear: 'Subir documentos al expediente.',
    editar: 'Cambiar el tipo o el nombre de un documento, y los tipos de documento (Configuración → Tipos de documento).',
    eliminar: 'Borrar documentos del expediente.' } },
  { id: 'medicacion', seccion: 'Residentes', label: 'Medicación', acciones: {
    ver: 'Ver qué toma cada residente, la ronda y las existencias.',
    editar: 'Registrar llegadas y conteos de medicamentos (Existencias).' } },
  { id: 'prescripciones', seccion: 'Residentes', label: 'Recetas y catálogo de medicamentos', acciones: {
    ver: 'Ver las recetas de cada residente.',
    crear: 'Agregar recetas nuevas y medicamentos al catálogo.',
    editar: 'Cambiar, suspender o terminar recetas; alergias; las rondas (Configuración → Medicación).' } },
  { id: 'banos', seccion: 'Actividades', label: 'Baños', acciones: {
    ver: 'Ver los baños del día.',
    editar: 'Registrar baños de todos y hacer el programa (Configuración → Baños). Quien tiene al residente en su rol del día puede registrar su baño aunque no tenga este permiso.' } },
  { id: 'actividades', seccion: 'Actividades', label: 'Actividades del personal', acciones: {
    ver: 'Ver el monitoreo: cuánto lleva cada persona. (Sus propias actividades las ve cualquiera.)',
    editar: 'Armar el Rol del día y las actividades fijas (Configuración → Actividades).' } },
  { id: 'asistencia', seccion: 'Actividades', label: 'Entradas y salidas', acciones: {
    ver: 'Ver el registro del día y los días laborados de todos. (Marcar su propia entrada lo puede hacer cualquiera.)',
    crear: 'Poner a mano una entrada o salida (cuando alguien no pudo marcar).',
    editar: 'Configurar la ubicación de la residencia y la tolerancia (Configuración → Entradas y salidas).',
    eliminar: 'Quitar marcas de entrada o salida.' } },
  { id: 'personal', seccion: 'Centro', label: 'Personal y horarios', acciones: {
    ver: 'Ver el horario semanal y los perfiles del personal.',
    crear: 'Agregar personas al personal (Perfiles).',
    editar: 'Hacer y guardar el horario; cambiar perfiles y vincular cuentas.' } },
  { id: 'nomina', seccion: 'Centro', label: 'Nómina', acciones: {
    ver: 'Ver los sueldos y el costo de la nómina.',
    editar: 'Cambiar sueldos y turnos (Configuración → Turnos), bonos y descuentos; cerrar y reabrir semanas.' } },
  { id: 'centro', seccion: 'Centro', label: 'Instalaciones', acciones: {
    ver: 'Ver Instalaciones (próximamente).',
    editar: 'Cambiar Instalaciones (próximamente).' } },
];
const IDS = MODULOS.map(m => m.id);
const ACC_DE = Object.fromEntries(MODULOS.map(m => [m.id, ACCIONES.filter(a => m.acciones[a])]));

// Avisos de la campanita (y por correo) que puede recibir cada rol
const NOTIFICACIONES = [
  { id: 'retardo', label: 'Alguien llegó tarde', descripcion: 'Cuando alguien marca su entrada después de la tolerancia.' },
  { id: 'sin_marcar', label: 'Alguien no ha marcado su entrada', descripcion: 'Ya empezó su turno, pasó la tolerancia y no ha marcado.' },
  { id: 'solicitud_cuenta', label: 'Solicitud de cuenta nueva', descripcion: 'Alguien pidió una cuenta desde "Crear cuenta". Se aprueba en Usuarios y permisos.' },
  { id: 'horario', label: 'Su horario se guardó o cambió', descripcion: 'Cuando administración guarda el horario de la semana, a la persona le llega el suyo.' },
];
const NOTIF_IDS = NOTIFICACIONES.map(n => n.id);

const TODO = Object.fromEntries(IDS.map(id => [id, [...ACC_DE[id]]]));

/**
 * Limpia permisos recibidos (formato nuevo o anterior).
 * - 'editar' (anterior) = todas las acciones de esa sección; 'ver' = solo ver.
 * - Cualquier acción implica poder ver.
 * - Entradas y salidas antes iba con Personal: si no viene, se toma de Personal.
 */
function normalizar(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  const viejo = Object.values(p).some(v => typeof v === 'string');
  for (const id of IDS) {
    let v = p[id];
    if (v === undefined && id === 'asistencia' && viejo) v = p.personal;
    let lista = v === 'editar' ? [...ACC_DE[id]] : v === 'ver' ? ['ver'] : Array.isArray(v) ? v.filter(a => ACC_DE[id].includes(a)) : [];
    if (lista.length && !lista.includes('ver')) lista.unshift('ver');
    lista = ACCIONES.filter(a => lista.includes(a));
    if (lista.length) out[id] = lista;
  }
  return out;
}

function normalizarNotif(n) {
  const out = {};
  if (!n || typeof n !== 'object') return out;
  for (const id of NOTIF_IDS) {
    const v = n[id];
    if (v && (v.campana || v.correo)) out[id] = { campana: !!v.campana, correo: !!v.correo };
  }
  return out;
}

// ── Tabla de roles ───────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id             TEXT PRIMARY KEY,
    label          TEXT NOT NULL,
    permisos       TEXT NOT NULL DEFAULT '{}',
    notificaciones TEXT NOT NULL DEFAULT '{}',
    sistema        INTEGER NOT NULL DEFAULT 0,     -- 1 = el administrador (no se borra ni se le quitan permisos)
    orden          INTEGER NOT NULL DEFAULT 0,
    creado_en      TEXT DEFAULT (datetime('now'))
  )
`);
const H = { campana: true, correo: false };
const ROLES_INICIALES = [
  ['admin', 'Administrador', TODO, { retardo: H, sin_marcar: H, solicitud_cuenta: { campana: true, correo: true }, horario: H }, 1],
  ['administracion', 'Administración', { listado: 'editar', reportes: 'ver', historial: 'ver', personal: 'editar', nomina: 'editar', centro: 'editar', actividades: 'editar' },
    { retardo: H, sin_marcar: H, horario: H }, 0],
  ['encargado_enfermeria', 'Encargado de enfermería', { listado: 'editar', controles: 'editar', reportes: 'editar', historial: 'editar', medicacion: 'editar', prescripciones: 'editar', banos: 'editar', personal: 'ver', actividades: 'editar' },
    { retardo: H, sin_marcar: H, horario: H }, 0],
  ['enfermeria', 'Enfermería', { listado: 'ver', controles: 'editar', reportes: 'editar', historial: 'ver', medicacion: 'editar', prescripciones: 'ver', banos: 'editar' }, { horario: H }, 0],
  ['cocina', 'Cocina', { listado: 'ver' }, { horario: H }, 0],
  ['limpieza', 'Limpieza', { centro: 'ver' }, { horario: H }, 0],
];
{
  const ins = db.prepare('INSERT OR IGNORE INTO roles (id, label, permisos, notificaciones, sistema, orden) VALUES (?, ?, ?, ?, ?, ?)');
  ROLES_INICIALES.forEach(([id, label, p, n, sis], i) => ins.run([id, label, JSON.stringify(normalizar(p)), JSON.stringify(n), sis, i]));
}

const leer = (txt, def) => { try { return JSON.parse(txt) } catch { return def } };

// Secciones nuevas: se agregan una sola vez a los roles que ya existían (con lo que le toca a cada uno)
const NUEVAS = {
  documentos: { administracion: ['ver', 'crear', 'editar', 'eliminar'], encargado_enfermeria: ['ver', 'crear', 'editar', 'eliminar'], enfermeria: ['ver', 'crear'] },
};
try {
  db.exec('CREATE TABLE IF NOT EXISTS act_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  for (const [mod, porRol] of Object.entries(NUEVAS)) {
    const clave = `roles_mod_${mod}`;
    if (db.prepare('SELECT 1 FROM act_config WHERE clave = ?').get([clave])) continue;
    for (const [rid, acc] of Object.entries(porRol)) {
      const r = db.prepare('SELECT permisos FROM roles WHERE id = ?').get([rid]);
      if (!r) continue;
      const p = leer(r.permisos, {});
      if (!p[mod]) { p[mod] = acc; db.prepare('UPDATE roles SET permisos = ? WHERE id = ?').run([JSON.stringify(p), rid]) }
    }
    db.prepare('INSERT INTO act_config (clave, valor) VALUES (?, ?)').run([clave, '1']);
  }
} catch (e) { console.error('Permisos de secciones nuevas', e) }
function filaRol(r) {
  return { id: r.id, label: r.label, sistema: !!r.sistema, orden: r.orden,
    permisos: r.id === 'admin' ? { ...TODO } : normalizar(leer(r.permisos, {})), notificaciones: normalizarNotif(leer(r.notificaciones, {})) };
}
/** Todos los roles en orden. */
function listaRoles() {
  return db.prepare('SELECT * FROM roles ORDER BY orden, label COLLATE NOCASE').all().map(filaRol);
}
function rolDe(id) {
  const r = db.prepare('SELECT * FROM roles WHERE id = ?').get([id]);
  return r ? filaRol(r) : null;
}
/** { id: label } para mostrar el nombre del puesto */
function etiquetasRoles() {
  return Object.fromEntries(db.prepare('SELECT id, label FROM roles').all().map(r => [r.id, r.label]));
}

/** Acciones efectivas de un usuario (fila de la tabla usuarios): { modulo: ['ver', …] } */
function permisosDe(u) {
  if (!u || u.aprobado === 0) return {};
  if (u.rol === 'admin') return { ...TODO };
  if (u.permisos) {
    const p = leer(u.permisos, null);
    if (p) return normalizar(p);
  }
  return rolDe(u.rol)?.permisos || {};
}

/** Formato anterior para el frontend: 'editar' si puede crear o editar; 'ver' si solo ve. */
function legado(acc) {
  return Object.fromEntries(Object.entries(acc).map(([id, l]) => [id, l.includes('editar') || l.includes('crear') ? 'editar' : 'ver']));
}

/** ¿Puede? nivel = 'ver' | 'crear' | 'editar' | 'eliminar' o una lista (basta una). */
function puede(usuario, modulo, nivel = 'ver') {
  const l = usuario?.acciones?.[modulo];
  if (!l || !l.length) return false;
  if (Array.isArray(nivel)) return nivel.some(n => n === 'ver' || l.includes(n));
  return nivel === 'ver' ? true : l.includes(nivel);
}

/** Middleware: exige permiso sobre un módulo */
function requierePermiso(modulo, nivel = 'ver') {
  return (req, res, next) => {
    if (puede(req.usuario, modulo, nivel)) return next();
    res.status(403).json({ error: 'No tienes permiso para esta acción.' });
  };
}

function requiereAdmin(req, res, next) {
  if (req.usuario?.rol === 'admin') return next();
  res.status(403).json({ error: 'Solo el administrador puede hacer esto.' });
}

/**
 * A quién le llega un tipo de aviso: usuarios activos cuyo rol lo tiene activado.
 * Devuelve [{ id, email, nombre, correo }]
 */
function destinatariosDe(tipo) {
  const roles = Object.fromEntries(listaRoles().map(r => [r.id, r.notificaciones[tipo]]));
  return db.prepare('SELECT id, nombre, email, rol FROM usuarios WHERE activo = 1 AND aprobado = 1').all()
    .filter(u => roles[u.rol]?.campana || roles[u.rol]?.correo)
    .map(u => ({ id: u.id, nombre: u.nombre, email: u.email || '', campana: !!roles[u.rol].campana, correo: !!roles[u.rol].correo }));
}

// Compatibilidad: ROLES como objeto { id: { label, permisos } } (se lee de la tabla cada vez)
const ROLES = new Proxy({}, {
  get: (_, id) => (typeof id === 'string' ? rolDe(id) || undefined : undefined),
  has: (_, id) => !!rolDe(id),
  ownKeys: () => listaRoles().map(r => r.id),
  getOwnPropertyDescriptor: (_, id) => { const r = rolDe(id); return r ? { value: r, enumerable: true, configurable: true } : undefined },
});

module.exports = {
  ACCIONES, MODULOS, NOTIFICACIONES, ROLES, TODO, normalizar, normalizarNotif, permisosDe, legado, puede, requierePermiso, requiereAdmin,
  listaRoles, rolDe, etiquetasRoles, destinatariosDe,
};
