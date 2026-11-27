// Reglas y cálculos de Medicación, sin base de datos (para poder probarlos solos).
// Todo lo que tenga fecha u hora se maneja en la zona horaria de México.

const ZONA = 'America/Mexico_City';

// ── Catálogo: formas y unidades de una lista fija ────────────────────────────
// unidad_dosis: en qué se da cada toma · unidad_stock: en qué llega · factor: cuántas dosis trae
const FORMAS = [
  { id: 'tableta',     label: 'Tableta',     unidad_dosis: 'tableta',    unidad_stock: 'tableta',    factor: 1,   pastillero: true,  fraccion: true },
  { id: 'capsula',     label: 'Cápsula',     unidad_dosis: 'capsula',    unidad_stock: 'capsula',    factor: 1,   pastillero: true,  fraccion: false },
  { id: 'gotas',       label: 'Gotas',       unidad_dosis: 'gota',       unidad_stock: 'frasco',     factor: 400, pastillero: false, fraccion: false },
  { id: 'jarabe',      label: 'Jarabe',      unidad_dosis: 'ml',         unidad_stock: 'frasco',     factor: 120, pastillero: false, fraccion: true },
  { id: 'inyectable',  label: 'Inyectable',  unidad_dosis: 'UI',         unidad_stock: 'pluma',      factor: 300, pastillero: false, fraccion: false },
  { id: 'inhalador',   label: 'Inhalador',   unidad_dosis: 'disparo',    unidad_stock: 'inhalador',  factor: 200, pastillero: false, fraccion: false },
  { id: 'parche',      label: 'Parche',      unidad_dosis: 'parche',     unidad_stock: 'parche',     factor: 1,   pastillero: false, fraccion: false },
  { id: 'crema',       label: 'Crema',       unidad_dosis: 'aplicacion', unidad_stock: 'tubo',       factor: 30,  pastillero: false, fraccion: false },
  { id: 'sobre',       label: 'Sobre',       unidad_dosis: 'sobre',      unidad_stock: 'sobre',      factor: 1,   pastillero: false, fraccion: false },
  { id: 'ovulo',       label: 'Óvulo',       unidad_dosis: 'pieza',      unidad_stock: 'pieza',      factor: 1,   pastillero: false, fraccion: false },
  { id: 'supositorio', label: 'Supositorio', unidad_dosis: 'pieza',      unidad_stock: 'pieza',      factor: 1,   pastillero: false, fraccion: false },
  { id: 'otro',        label: 'Otro',        unidad_dosis: 'pieza',      unidad_stock: 'pieza',      factor: 1,   pastillero: false, fraccion: false },
];
const FORMA = Object.fromEntries(FORMAS.map(f => [f.id, f]));

// [singular, plural]
const UNIDADES = {
  tableta: ['tableta', 'tabletas'], capsula: ['cápsula', 'cápsulas'], gota: ['gota', 'gotas'], ml: ['ml', 'ml'],
  UI: ['UI', 'UI'], disparo: ['disparo', 'disparos'], parche: ['parche', 'parches'], aplicacion: ['aplicación', 'aplicaciones'],
  sobre: ['sobre', 'sobres'], pieza: ['pieza', 'piezas'], frasco: ['frasco', 'frascos'], pluma: ['pluma', 'plumas'],
  inhalador: ['inhalador', 'inhaladores'], caja: ['caja', 'cajas'], tubo: ['tubo', 'tubos'], ampolleta: ['ampolleta', 'ampolletas'],
};
const UNIDADES_DOSIS = ['tableta', 'capsula', 'gota', 'ml', 'UI', 'disparo', 'parche', 'aplicacion', 'sobre', 'pieza'];
const UNIDADES_STOCK = ['tableta', 'capsula', 'frasco', 'pluma', 'ampolleta', 'inhalador', 'parche', 'caja', 'tubo', 'sobre', 'pieza'];

const VIAS = [
  ['oral', 'Oral'], ['sublingual', 'Sublingual'], ['subcutanea', 'Subcutánea'], ['intramuscular', 'Intramuscular'],
  ['oftalmica', 'Oftálmica'], ['otica', 'Ótica'], ['nasal', 'Nasal'], ['inhalada', 'Inhalada'], ['topica', 'Tópica'],
  ['rectal', 'Rectal'], ['transdermica', 'Transdérmica'],
].map(([id, label]) => ({ id, label }));
const VIA_DE_FORMA = {
  tableta: 'oral', capsula: 'oral', gotas: 'oral', jarabe: 'oral', inyectable: 'subcutanea', inhalador: 'inhalada',
  parche: 'transdermica', crema: 'topica', sobre: 'oral', ovulo: 'topica', supositorio: 'rectal', otro: 'oral',
};

const TIPOS = [
  { id: 'fija', label: 'Horario fijo', ayuda: 'Se da todos los días (o ciertos días) en sus rondas' },
  { id: 'prn', label: 'Si hace falta (PRN)', ayuda: 'Solo cuando se necesita: dolor, ansiedad, fiebre…' },
  { id: 'variable', label: 'Dosis variable', ayuda: 'La dosis depende de una medición, como la insulina según la glucosa' },
];
const PROVEE = [{ id: 'familia', label: 'La familia' }, { id: 'centro', label: 'La residencia' }];
const MEDICIONES = [{ id: 'glucosa', label: 'Glucosa' }, { id: 'presion', label: 'Presión arterial' }, { id: 'otro', label: 'Otra' }];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTO = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const RONDAS_INICIALES = [
  { nombre: 'Mañana', detalle: 'Desayuno', hora_inicio: '06:00', hora_fin: '11:00', orden: 1 },
  { nombre: 'Tarde', detalle: 'Comida', hora_inicio: '12:00', hora_fin: '17:00', orden: 2 },
  { nombre: 'Noche', detalle: 'Cena y al dormir', hora_inicio: '18:00', hora_fin: '23:00', orden: 3 },
];

// ── Utilidades ───────────────────────────────────────────────────────────────
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const esHora = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const texto = (v, max = 160) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const redondear = (n) => Math.round(n * 1000) / 1000;
const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b };

function errorUsuario(message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

/** Fecha y hora actuales en México: { fecha: 'AAAA-MM-DD', hora: 'HH:MM' } */
function ahoraMexico(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const hoyMexico = (d) => ahoraMexico(d).fecha;

/** 0 = domingo … 6 = sábado (la fecha es de calendario, sin zona) */
const diaSemana = (fecha) => new Date(fecha + 'T12:00:00Z').getUTCDay();
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** minúsculas, sin acentos, espacios colapsados; "100MG" → "100 mg" */
function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/(\d)\s*([a-z%])/g, '$1 $2').replace(/,/g, '.').replace(/\s+/g, ' ').trim();
}
const claveCatalogo = (m) => [normalizar(m.principio_activo), normalizar(m.concentracion), m.forma].join('|');

function distancia(a, b) {
  if (a === b) return 0;
  const v = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = v[0]; v[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = v[j];
      v[j] = Math.min(v[j] + 1, v[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return v[b.length];
}

/** Medicamentos del catálogo que podrían ser el mismo (para avisar antes de crear uno nuevo) */
function similares(catalogo, propuesta, excluirId = null) {
  const p = normalizar(propuesta.principio_activo);
  if (p.length < 3) return [];
  const pal = p.split(' ')[0];
  return catalogo.filter(m => m.id !== excluirId).map(m => {
    const q = normalizar(m.principio_activo);
    const qpal = q.split(' ')[0];
    const tol = Math.max(1, Math.floor(Math.min(pal.length, qpal.length) / 4));
    let razon = null;
    if (q === p) razon = 'mismo nombre';
    else if (distancia(pal, qpal) <= tol) razon = 'nombre parecido';
    else if (q.startsWith(p) || p.startsWith(q)) razon = 'nombre parecido';
    else if (m.nombre_comercial && normalizar(m.nombre_comercial) === p) razon = 'es su nombre comercial';
    return razon && { ...m, razon };
  }).filter(Boolean).slice(0, 6);
}

function plural(unidad, n) {
  const u = UNIDADES[unidad] || [unidad, unidad];
  return Math.abs(n) === 1 ? u[0] : u[1];
}

/** 0.5 → "½", 1.5 → "1½", 0.25 → "¼" */
function numeroLegible(n) {
  const ent = Math.floor(n + 1e-9), frac = redondear(n - ent);
  const f = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[frac];
  if (f) return ent ? `${ent}${f}` : f;
  return String(redondear(n)).replace(/\.0+$/, '');
}
const dosisTexto = (dosis, unidad) => `${numeroLegible(dosis)} ${plural(unidad, dosis > 1 ? 2 : 1)}`;

/** "2 frascos y 150 gotas", "23 tabletas" */
function existenciaLegible(cantidad, med) {
  const n = redondear(cantidad || 0);
  if (n < 0) return `${numeroLegible(n)} ${plural(med.unidad_dosis, n)} (faltante)`;
  const f = Number(med.factor_conversion) || 1;
  if (f <= 1 || med.unidad_stock === med.unidad_dosis) return `${numeroLegible(n)} ${plural(med.unidad_dosis, n)}`;
  const enteros = Math.floor(n / f + 1e-9), resto = redondear(n - enteros * f);
  const partes = [];
  if (enteros) partes.push(`${enteros} ${plural(med.unidad_stock, enteros)}`);
  if (resto || !enteros) partes.push(`${numeroLegible(resto)} ${plural(med.unidad_dosis, resto)}`);
  return partes.join(' y ');
}

const nombreMedicamento = (m) => [m.principio_activo, m.concentracion].filter(Boolean).join(' ');

// ── Prescripciones ───────────────────────────────────────────────────────────
const horariosDe = (p) => (Array.isArray(p.horarios) ? p.horarios : (() => { try { return JSON.parse(p.horarios || '[]') } catch { return [] } })());
const diasSemanaDe = (p) => String(p.dias_semana || '').split(',').filter(x => x !== '').map(Number);

/** ¿Esta prescripción se da en esa fecha? (activa, dentro de fechas y en sus días) */
function aplicaEnFecha(p, fecha) {
  if (p.estado !== 'activa') return false;
  if (p.fecha_inicio && fecha < p.fecha_inicio) return false;
  if (p.fecha_fin && fecha > p.fecha_fin) return false;
  if (p.dias_modo === 'semana') return diasSemanaDe(p).includes(diaSemana(fecha));
  if (p.dias_modo === 'cada_n') {
    const n = Number(p.cada_n_dias) || 1;
    const d = diasEntre(p.fecha_ancla || p.fecha_inicio, fecha);
    return d >= 0 && d % n === 0;
  }
  return true;
}

/** Veces por día en promedio que aplica (para consumo y días restantes) */
function frecuencia(p) {
  if (p.dias_modo === 'semana') return diasSemanaDe(p).length / 7;
  if (p.dias_modo === 'cada_n') return 1 / (Number(p.cada_n_dias) || 1);
  return 1;
}

/** Consumo diario promedio, en unidad de dosis. Las PRN no cuentan. */
function consumoDiario(p) {
  if (p.tipo === 'prn' || !(p.dosis > 0)) return 0;
  return redondear(p.dosis * horariosDe(p).length * frecuencia(p));
}

function diasRestantes(existencia, consumo) {
  if (!(consumo > 0)) return null;
  return Math.max(0, Math.floor(redondear(existencia) / consumo + 1e-9));
}

function textoDias(p) {
  if (p.dias_modo === 'semana') {
    const d = diasSemanaDe(p).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // lunes primero
    const k = d.join(',');
    if (k === '1,2,3,4,5') return 'de lunes a viernes';
    if (k === '6,0') return 'sábados y domingos';
    if (d.length === 7) return 'todos los días';
    const n = d.map(x => (x === 0 ? 'domingos' : x === 6 ? 'sábados' : DIAS[x]));
    return n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n.at(-1)}` : `solo los ${n[0]}`;
  }
  if (p.dias_modo === 'cada_n') return Number(p.cada_n_dias) === 2 ? 'un día sí y otro no' : `cada ${p.cada_n_dias} días`;
  return 'todos los días';
}

function fechaCorta(f, hoy) {
  if (f === hoy) return 'hoy';
  if (f === sumarDias(hoy, 1)) return 'mañana';
  const [a, m, d] = f.split('-').map(Number);
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1];
  return `${d} ${mes}${a !== Number(hoy.slice(0, 4)) ? ` ${a}` : ''}`;
}

/** Vista previa en lenguaje natural */
function textoPrescripcion(p, med, rondas, hoy = hoyMexico()) {
  const nombre = nombreMedicamento(med);
  const ronda = Object.fromEntries(rondas.map(r => [r.id, r]));
  let que;
  if (p.tipo === 'prn') {
    que = `${p.dosis ? dosisTexto(p.dosis, med.unidad_dosis) + ' ' : ''}solo si hace falta${p.prn_motivo ? ` (${p.prn_motivo})` : ''}`;
    const lim = [p.prn_max_24h && `máximo ${numeroLegible(p.prn_max_24h)} al día`, p.prn_intervalo_h && `con al menos ${numeroLegible(p.prn_intervalo_h)} h entre dosis`].filter(Boolean);
    if (lim.length) que += `, ${lim.join(' y ')}`;
  } else {
    const hs = horariosDe(p).map(h => `${ronda[h.ronda_id]?.nombre || 'ronda'}${h.hora ? ` (${h.hora})` : ''}`);
    const enRondas = hs.length > 1 ? `${hs.slice(0, -1).join(', ')} y ${hs.at(-1)}` : hs[0] || 'sin ronda';
    que = p.tipo === 'variable'
      ? `dosis según ${MEDICIONES.find(m => m.id === p.medicion_requerida)?.label.toLowerCase() || 'medición'} en ${enRondas}`
      : `${dosisTexto(p.dosis, med.unidad_dosis)} en ${enRondas.replace(/^(Mañana|Tarde|Noche)/, 'la $1')}`;
    que += `, ${textoDias(p)}`;
  }
  const desde = p.fecha_inicio ? `desde ${fechaCorta(p.fecha_inicio, hoy)}` : '';
  const hasta = p.fecha_fin ? `hasta ${fechaCorta(p.fecha_fin, hoy)}` : 'sin fecha de fin';
  const provee = p.provee === 'centro' ? 'La provee la residencia.' : 'La provee la familia.';
  return `${nombre} — ${que}, ${[desde, hasta].filter(Boolean).join(', ')}. ${provee}`;
}

const CAMPOS_CLINICOS = ['medicamento_id', 'tipo', 'dosis', 'via', 'horarios', 'dias_modo', 'dias_semana', 'cada_n_dias',
  'fecha_ancla', 'fecha_inicio', 'fecha_fin', 'provee', 'prn_motivo', 'prn_max_24h', 'prn_intervalo_h', 'escala', 'medicion_requerida'];

/** Campos clínicos que cambian entre la versión actual y la propuesta */
function cambiosClinicos(actual, nueva) {
  const norm = (k, v) => (k === 'horarios' ? JSON.stringify(horariosDe({ horarios: v })) : v == null ? '' : String(v));
  return CAMPOS_CLINICOS.filter(k => norm(k, actual[k]) !== norm(k, nueva[k]));
}

/**
 * Valida y limpia una prescripción recibida del formulario.
 * rondas: rondas configuradas (activas) · hoy: fecha en México
 */
function validarPrescripcion(b, med, rondas, hoy = hoyMexico()) {
  if (!med) throw errorUsuario('Elige el medicamento del catálogo.');
  const tipo = TIPOS.some(t => t.id === b.tipo) ? b.tipo : null;
  if (!tipo) throw errorUsuario('Elige el tipo: horario fijo, si hace falta o dosis variable.');

  const num = (v, nombre, { min = 0, max = 10000, requerido = false } = {}) => {
    if (v === '' || v == null) { if (requerido) throw errorUsuario(`Falta ${nombre}.`); return null }
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < min || n > max) throw errorUsuario(`${nombre[0].toUpperCase() + nombre.slice(1)} no es válida.`);
    return redondear(n);
  };

  const dosis = num(b.dosis, 'la dosis', { min: 0.001, max: 5000, requerido: tipo !== 'variable' });
  if (dosis != null && !med.permite_fraccion && Math.abs(dosis - Math.round(dosis)) > 1e-9 && ['tableta', 'capsula'].includes(med.unidad_dosis)) {
    throw errorUsuario(`Este medicamento no se puede partir: la dosis debe ser entera.`);
  }

  const activas = new Map(rondas.filter(r => r.activa).map(r => [Number(r.id), r]));
  let horarios = [];
  if (tipo !== 'prn') {
    horarios = (Array.isArray(b.horarios) ? b.horarios : []).map(h => ({ ronda_id: Number(h.ronda_id), hora: esHora(h.hora) ? h.hora : '' }));
    if (!horarios.length) throw errorUsuario('Elige al menos una ronda (Mañana, Tarde o Noche).');
    const vistos = new Set();
    for (const h of horarios) {
      const r = activas.get(h.ronda_id);
      if (!r) throw errorUsuario('Una de las rondas elegidas no existe o está desactivada.');
      if (h.hora && (minutos(h.hora) < minutos(r.hora_inicio) || minutos(h.hora) > minutos(r.hora_fin))) {
        throw errorUsuario(`La hora ${h.hora} no cae dentro de la ronda de la ${r.nombre} (${r.hora_inicio}–${r.hora_fin}).`);
      }
      const k = `${h.ronda_id}|${h.hora}`;
      if (vistos.has(k)) throw errorUsuario(`La ronda de la ${r.nombre} está repetida con la misma hora.`);
      vistos.add(k);
    }
    const orden = Object.fromEntries([...activas.values()].map(r => [r.id, r.orden]));
    horarios.sort((x, y) => (orden[x.ronda_id] - orden[y.ronda_id]) || (x.hora || '').localeCompare(y.hora || ''));
  }

  let dias_modo = 'todos', dias_semana = '', cada_n_dias = null, fecha_ancla = '';
  if (tipo !== 'prn') {
    if (b.dias_modo === 'semana') {
      const d = [...new Set((Array.isArray(b.dias_semana) ? b.dias_semana : diasSemanaDe(b)).map(Number))].filter(x => x >= 0 && x <= 6);
      if (!d.length) throw errorUsuario('Elige al menos un día de la semana.');
      if (d.length === 7) dias_modo = 'todos';
      else { dias_modo = 'semana'; dias_semana = d.sort().join(',') }
    } else if (b.dias_modo === 'cada_n') {
      cada_n_dias = num(b.cada_n_dias, 'el número de días', { min: 2, max: 90, requerido: true });
      if (!Number.isInteger(cada_n_dias)) throw errorUsuario('"Cada N días" debe ser un número entero.');
      dias_modo = 'cada_n';
    }
  }

  const fecha_inicio = b.fecha_inicio ? String(b.fecha_inicio) : hoy;
  if (!esFecha(fecha_inicio)) throw errorUsuario('La fecha de inicio no es válida.');
  const fecha_fin = b.fecha_fin ? String(b.fecha_fin) : '';
  if (fecha_fin && !esFecha(fecha_fin)) throw errorUsuario('La fecha de fin no es válida.');
  if (fecha_fin && fecha_fin < fecha_inicio) throw errorUsuario('La fecha de fin es anterior a la de inicio.');
  if (dias_modo === 'cada_n') fecha_ancla = esFecha(b.fecha_ancla) ? b.fecha_ancla : fecha_inicio;
  const fecha_revision = b.fecha_revision ? String(b.fecha_revision) : '';
  if (fecha_revision && !esFecha(fecha_revision)) throw errorUsuario('La fecha de revisión no es válida.');

  const indicaciones = texto(b.indicaciones, 200);
  if (/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)s?\b/i.test(indicaciones) || /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(indicaciones)) {
    throw errorUsuario('Las indicaciones no deben llevar días ni fechas: usa los campos de días y fechas.');
  }

  const out = {
    medicamento_id: med.id, tipo, dosis, via: VIAS.some(v => v.id === b.via) ? b.via : (VIA_DE_FORMA[med.forma] || 'oral'),
    horarios: JSON.stringify(horarios), dias_modo, dias_semana, cada_n_dias, fecha_ancla,
    fecha_inicio, fecha_fin, fecha_revision, indicaciones,
    provee: b.provee === 'centro' ? 'centro' : 'familia',
    medico: texto(b.medico, 120),
    prn_motivo: '', prn_max_24h: null, prn_intervalo_h: null, escala: '', medicion_requerida: '',
  };
  if (tipo === 'prn') {
    out.prn_motivo = texto(b.prn_motivo, 120);
    if (!out.prn_motivo) throw errorUsuario('Escribe para qué se usa (por ejemplo: dolor, fiebre, ansiedad).');
    out.prn_max_24h = num(b.prn_max_24h, 'la dosis máxima en 24 h', { min: 0.001, max: 5000 });
    out.prn_intervalo_h = num(b.prn_intervalo_h, 'el intervalo mínimo', { min: 0.5, max: 168 });
  }
  if (tipo === 'variable') {
    out.medicion_requerida = MEDICIONES.some(m => m.id === b.medicion_requerida) ? b.medicion_requerida : 'glucosa';
    out.escala = texto(b.escala, 600);
    if (!out.escala) throw errorUsuario('Escribe la escala: qué dosis va según la medición.');
  }
  return out;
}

/** Valida un medicamento del catálogo */
function validarMedicamento(b) {
  const principio_activo = texto(b.principio_activo, 100);
  if (principio_activo.length < 2) throw errorUsuario('Escribe el principio activo (por ejemplo: Losartán).');
  const forma = FORMA[b.forma] ? b.forma : null;
  if (!forma) throw errorUsuario('Elige la forma (tableta, gotas, jarabe…).');
  const f = FORMA[forma];
  const unidad_dosis = UNIDADES_DOSIS.includes(b.unidad_dosis) ? b.unidad_dosis : f.unidad_dosis;
  const unidad_stock = UNIDADES_STOCK.includes(b.unidad_stock) ? b.unidad_stock : f.unidad_stock;
  let factor = b.factor_conversion === '' || b.factor_conversion == null ? f.factor : Number(String(b.factor_conversion).replace(',', '.'));
  if (unidad_stock === unidad_dosis) factor = 1;
  if (!Number.isFinite(factor) || factor <= 0 || factor > 100000) throw errorUsuario('La cantidad por presentación no es válida.');
  return {
    principio_activo,
    nombre_comercial: texto(b.nombre_comercial, 80),
    concentracion: texto(b.concentracion, 40).replace(/(\d)\s*([a-zA-Z%])/g, '$1 $2'),
    forma, unidad_dosis, unidad_stock, factor_conversion: redondear(factor),
    permite_fraccion: b.permite_fraccion == null ? (f.fraccion ? 1 : 0) : (b.permite_fraccion ? 1 : 0),
    controlado: b.controlado ? 1 : 0,
    en_pastillero: b.en_pastillero == null ? (f.pastillero ? 1 : 0) : (b.en_pastillero ? 1 : 0),
  };
}

/** Valida la configuración de rondas: horas correctas y sin traslaparse */
function validarRondas(lista) {
  if (!Array.isArray(lista) || !lista.length) throw errorUsuario('Debe haber al menos una ronda.');
  const out = lista.map((r, i) => {
    const nombre = texto(r.nombre, 30);
    if (!nombre) throw errorUsuario('Cada ronda necesita un nombre.');
    if (!esHora(r.hora_inicio) || !esHora(r.hora_fin)) throw errorUsuario(`Revisa las horas de la ronda "${nombre}".`);
    if (minutos(r.hora_fin) <= minutos(r.hora_inicio)) throw errorUsuario(`En la ronda "${nombre}" la hora de fin debe ser después del inicio.`);
    return { id: r.id ? Number(r.id) : null, nombre, detalle: texto(r.detalle, 40), hora_inicio: r.hora_inicio, hora_fin: r.hora_fin, activa: r.activa === false || r.activa === 0 ? 0 : 1, orden: i + 1 };
  });
  const act = out.filter(r => r.activa).sort((a, b) => minutos(a.hora_inicio) - minutos(b.hora_inicio));
  if (!act.length) throw errorUsuario('Debe quedar al menos una ronda activa.');
  for (let i = 1; i < act.length; i++) {
    if (minutos(act[i].hora_inicio) < minutos(act[i - 1].hora_fin)) {
      throw errorUsuario(`Las rondas "${act[i - 1].nombre}" y "${act[i].nombre}" se traslapan.`);
    }
  }
  const nombres = new Set();
  for (const r of out) { const k = normalizar(r.nombre); if (nombres.has(k)) throw errorUsuario(`Hay dos rondas llamadas "${r.nombre}".`); nombres.add(k) }
  return out;
}

/** Ronda que corresponde a una hora (o null si cae entre rondas) */
function rondaDeHora(rondas, hora) {
  const m = minutos(hora);
  return rondas.filter(r => r.activa).find(r => m >= minutos(r.hora_inicio) && m <= minutos(r.hora_fin)) || null;
}

module.exports = {
  ZONA, FORMAS, FORMA, UNIDADES, UNIDADES_DOSIS, UNIDADES_STOCK, VIAS, VIA_DE_FORMA, TIPOS, PROVEE, MEDICIONES, DIAS, DIAS_CORTO, RONDAS_INICIALES,
  esFecha, esHora, texto, redondear, minutos, errorUsuario, ahoraMexico, hoyMexico, diaSemana, diasEntre, sumarDias,
  normalizar, claveCatalogo, distancia, similares, plural, numeroLegible, dosisTexto, existenciaLegible, nombreMedicamento,
  horariosDe, diasSemanaDe, aplicaEnFecha, frecuencia, consumoDiario, diasRestantes, textoDias, textoPrescripcion,
  CAMPOS_CLINICOS, cambiosClinicos, validarPrescripcion, validarMedicamento, validarRondas, rondaDeHora,
};
