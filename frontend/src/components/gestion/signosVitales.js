// Signos vitales y turnos: lo comparten Controles diarios y Reportes de turno.
// Los rangos coinciden con backend/signos.js (adultos mayores 65+).

export const CAMPOS = [
  { id: 'ta',          label: 'T/A',     unidad: 'mmHg' }, // sistólica / diastólica
  { id: 'fc',          label: 'FC',      unidad: 'lpm',   ph: '72',   min: 20, max: 250 },
  { id: 'spo2',        label: 'SpO₂',    unidad: '%',     ph: '96',   min: 50, max: 100 },
  { id: 'fr',          label: 'FR',      unidad: 'rpm',   ph: '16',   min: 4,  max: 60 },
  { id: 'temperatura', label: 'Temp.',   unidad: '°C',    ph: '36.5', min: 30, max: 43, decimal: true },
  { id: 'glucosa',     label: 'Glucosa', unidad: 'mg/dL', ph: '—',    min: 20, max: 600 },
]
export const CLAVES = ['ta_sistolica', 'ta_diastolica', 'fc', 'spo2', 'fr', 'temperatura', 'glucosa']

const NOMBRE = {
  ta_sistolica: 'T/A sistólica', ta_diastolica: 'T/A diastólica', fc: 'FC', spo2: 'SpO₂',
  fr: 'FR', temperatura: 'Temperatura', glucosa: 'Glucosa',
}

export function alertaDe(campo, v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  switch (campo) {
    case 'ta_sistolica':  return n < 90 ? 'Hipotensión' : n > 160 ? 'Hipertensión' : null
    case 'ta_diastolica': return n < 60 ? 'Hipotensión' : n > 100 ? 'Hipertensión' : null
    case 'fc':            return n < 50 ? 'Bradicardia' : n > 110 ? 'Taquicardia' : null
    case 'spo2':          return n < 92 ? 'Hipoxemia' : null
    case 'fr':            return n < 10 ? 'Bradipnea' : n > 25 ? 'Taquipnea' : null
    case 'glucosa':       return n < 70 ? 'Hipoglucemia' : n > 180 ? 'Hiperglucemia' : null
    case 'temperatura':
      if (n < 35) return 'Hipotermia'
      if (n < 36.1) return 'Temperatura baja'
      if (n <= 37.2) return null
      if (n <= 37.9) return 'Febrícula'
      if (n <= 39) return 'Fiebre'
      if (n <= 40) return 'Fiebre alta'
      return 'Hiperpirexia'
    default: return null
  }
}

/** [{ campo, nombre, alerta }] de una toma */
export function alertasDe(toma) {
  if (!toma) return []
  return CLAVES.flatMap(c => {
    const a = alertaDe(c, toma[c])
    return a ? [{ campo: c, nombre: NOMBRE[c], alerta: a }] : []
  })
}

export function tieneValores(toma) {
  return !!toma && CLAVES.some(c => toma[c] !== null && toma[c] !== undefined && toma[c] !== '')
}

/** "T/A 120/80 · FC 72 · SpO₂ 96 % · ..." */
export function resumenToma(toma) {
  if (!tieneValores(toma)) return ''
  const p = []
  if (toma.ta_sistolica != null || toma.ta_diastolica != null) p.push(`T/A ${toma.ta_sistolica ?? '—'}/${toma.ta_diastolica ?? '—'}`)
  if (toma.fc != null)          p.push(`FC ${toma.fc}`)
  if (toma.spo2 != null)        p.push(`SpO₂ ${toma.spo2} %`)
  if (toma.fr != null)          p.push(`FR ${toma.fr}`)
  if (toma.temperatura != null) p.push(`Temp. ${toma.temperatura} °C`)
  if (toma.glucosa != null)     p.push(`Glucosa ${toma.glucosa} mg/dL`)
  return p.join(' · ')
}

// ── Turnos ────────────────────────────────────────────────────────────────────
// Turno de la mañana 07:00–19:00, de la noche 19:00–07:00. La fecha de un turno es
// el día en que empieza: a las 3 a. m. seguimos en el turno nocturno del día anterior.
export const TURNOS = [
  { id: 'Matutino-Vespertino', label: 'Mañana', largo: 'Turno de la mañana' },
  { id: 'Nocturno',            label: 'Noche',  largo: 'Turno de la noche' },
]
export const MOMENTOS = [
  { id: 'recibir',  label: 'Al recibir' },
  { id: 'entregar', label: 'Al entregar' },
]
export const TURNO_LABEL = Object.fromEntries(TURNOS.map(t => [t.id, t.label]))

export function fechaLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function horaLocal(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function turnoActual(ahora = new Date()) {
  const h = ahora.getHours()
  if (h >= 7 && h < 19) return { fecha: fechaLocal(ahora), turno: 'Matutino-Vespertino' }
  const d = new Date(ahora)
  if (h < 7) d.setDate(d.getDate() - 1)
  return { fecha: fechaLocal(d), turno: 'Nocturno' }
}
/** Momento sugerido: la primera mitad del turno es "al recibir" */
export function momentoSugerido(turno, ahora = new Date()) {
  const h = ahora.getHours()
  if (turno === 'Matutino-Vespertino') return h >= 7 && h < 13 ? 'recibir' : 'entregar'
  return h >= 19 || h < 1 ? 'recibir' : 'entregar'
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function fechaLarga(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}
export function moverFecha(iso, dias) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return fechaLocal(d)
}

/** Residentes que deben tener control en un turno: en la residencia; los de
 *  centro de día no están de noche. */
export function residentesDelTurno(residentes, turno) {
  return residentes.filter(r =>
    (r.ubicacion || 'residencia') === 'residencia' &&
    !(turno === 'Nocturno' && r.tipo_servicio === 'centro_dia'))
}

// ── Micciones y evacuaciones ─────────────────────────────────────────────────
// Las mismas características del reporte original. Las marcadas como "a vigilar" se ven en naranja.
export const ELIMINACION = [
  {
    id: 'miccion', label: 'Micciones', uno: 'micción', varios: 'micciones', corto: 'Micción',
    opciones: ['Clara / Normal', 'Amarillo oscuro / Concentrada', 'Turbia', 'Con sedimento', 'Rojiza / Hematúrica',
      'Anaranjada', 'Con mal olor', 'Escasa (oliguria)', 'Abundante (poliuria)', 'Incontinencia'],
    vigilar: ['Turbia', 'Con sedimento', 'Rojiza / Hematúrica', 'Con mal olor', 'Escasa (oliguria)', 'Abundante (poliuria)'],
  },
  {
    id: 'evacuacion', label: 'Evacuaciones', uno: 'evacuación', varios: 'evacuaciones', corto: 'Evacuación',
    opciones: ['Formada / Normal', 'Blanda', 'Pastosa', 'Líquida / Diarrea', 'Dura / Estreñimiento', 'Con sangre',
      'Con moco', 'Melénica (negra)', 'Fétida', 'Incontinencia fecal'],
    vigilar: ['Líquida / Diarrea', 'Dura / Estreñimiento', 'Con sangre', 'Con moco', 'Melénica (negra)'],
  },
]
export const ELIM = Object.fromEntries(ELIMINACION.map(t => [t.id, t]))

/** Características de un registro que conviene vigilar */
export const aVigilar = (evento) => (evento?.caracteristicas || []).filter(c => ELIM[evento.tipo]?.vigilar.includes(c))

export const cuentaTexto = (tipo, n) => `${n} ${n === 1 ? ELIM[tipo].uno : ELIM[tipo].varios}`
