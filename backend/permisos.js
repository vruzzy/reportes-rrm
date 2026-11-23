// Roles y permisos de Gestión.
// Cada módulo tiene un nivel: 'editar' > 'ver' > (sin acceso).
// El rol define los permisos por defecto; el administrador puede ajustarlos por persona
// (se guardan en usuarios.permisos como JSON).

const MODULOS = [
  { id: 'listado',    label: 'Listado de residentes' },
  { id: 'controles',  label: 'Controles diarios' },
  { id: 'reportes',   label: 'Reportes de turno' },
  { id: 'historial',  label: 'Historial' },
  { id: 'medicacion', label: 'Medicación' },
  { id: 'banos',      label: 'Baños' },
  { id: 'personal',   label: 'Personal' },
  { id: 'centro',     label: 'Instalaciones' },
];
const IDS = MODULOS.map(m => m.id);
const NIVELES = ['ver', 'editar'];

const TODO = Object.fromEntries(IDS.map(id => [id, 'editar']));

const ROLES = {
  admin: { label: 'Administrador', permisos: TODO },
  administracion: {
    label: 'Administración',
    permisos: { listado: 'editar', reportes: 'ver', historial: 'ver', personal: 'editar', centro: 'editar' },
  },
  encargado_enfermeria: {
    label: 'Encargado de enfermería',
    permisos: { listado: 'editar', controles: 'editar', reportes: 'editar', historial: 'editar', medicacion: 'editar', banos: 'editar', personal: 'ver' },
  },
  enfermeria: {
    label: 'Enfermería',
    permisos: { listado: 'ver', controles: 'editar', reportes: 'editar', historial: 'ver', medicacion: 'editar', banos: 'editar' },
  },
  cocina:   { label: 'Cocina',   permisos: { listado: 'ver' } },
  limpieza: { label: 'Limpieza', permisos: { centro: 'ver' } },
};

/** Limpia un objeto de permisos recibido del cliente */
function normalizar(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const id of IDS) if (NIVELES.includes(p[id])) out[id] = p[id];
  return out;
}

/** Permisos efectivos de un usuario (fila de la tabla usuarios) */
function permisosDe(u) {
  if (!u || u.aprobado === 0) return {};
  if (u.rol === 'admin') return { ...TODO };
  if (u.permisos) {
    try { return normalizar(JSON.parse(u.permisos)); } catch {}
  }
  return { ...(ROLES[u.rol]?.permisos || {}) };
}

function puede(usuario, modulo, nivel = 'ver') {
  const p = usuario?.permisos?.[modulo];
  return nivel === 'ver' ? !!p : p === 'editar';
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

module.exports = { MODULOS, ROLES, normalizar, permisosDe, puede, requierePermiso, requiereAdmin };
