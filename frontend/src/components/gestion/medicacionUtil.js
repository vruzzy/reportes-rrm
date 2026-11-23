// Constantes y utilidades del módulo de Medicación.

export const TOMAS = [
  { id: 'ayunas',   label: 'En ayunas', hora: '06:30' },
  { id: 'desayuno', label: 'Desayuno',  hora: '08:00' },
  { id: 'comida',   label: 'Comida',    hora: '14:00' },
  { id: 'cena',     label: 'Cena',      hora: '19:00' },
  { id: 'dormir',   label: 'Al dormir', hora: '21:00' },
]
export const TOMA_LABEL = Object.fromEntries(TOMAS.map(t => [t.id, t.label]))

export const UNIDADES = ['tableta', 'cápsula', 'ml', 'gotas', 'sobre', 'parche', 'inyección', 'disparo', 'pieza']

export const ESTADOS = [
  { id: 'dada',    label: 'Tomó',      ayuda: 'Se descuenta' },
  { id: 'rechazo', label: 'Rechazó',   ayuda: 'La dosis se desecha: sí se descuenta' },
  { id: 'fuera',   label: 'No estaba', ayuda: 'Hospital o salida: no se descuenta' },
]

// Umbrales de días restantes
export const DIAS_URGENTE = 5
export const DIAS_POCO = 10

export function nivelDias(dias) {
  if (dias == null) return 'na'
  if (dias < DIAS_URGENTE) return 'urgente'
  if (dias < DIAS_POCO) return 'poco'
  return 'ok'
}

export function textoDias(m) {
  if (m.prn) return 'Si hace falta'
  if (m.dias_restantes == null) return '—'
  if (m.existencia <= 0) return 'Sin existencia'
  return m.dias_restantes === 1 ? '1 día' : `${m.dias_restantes} días`
}

/** Fecha en que se acaba (aprox.) a partir de hoy */
export function fechaAgota(m) {
  if (m.prn || m.dias_restantes == null) return ''
  const d = new Date()
  d.setDate(d.getDate() + m.dias_restantes)
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

/** Número sin ceros de más: 1, 0.5, 2.25 */
export function num(n) {
  return Number(n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

/** "1 tableta", "½ tableta", "2 tabletas", "10 ml" */
export function dosisTexto(dosis, unidad) {
  const d = Number(dosis)
  const cantidad = d === 0.5 ? '½' : d === 0.25 ? '¼' : num(d)
  if (['ml', 'gotas'].includes(unidad) || d <= 1) return `${cantidad} ${unidad}`
  const plural = unidad.endsWith('n') ? unidad.replace(/ón$/, 'ones') : unidad + 's'
  return `${cantidad} ${plural}`
}

export function fechaHoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function horaAhora() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** La toma más cercana a la hora actual que todavía no se confirma */
export function tomaSugerida(dia) {
  const ahora = horaAhora()
  const conMeds = dia.filter(d => d.residentes > 0)
  const pendiente = conMeds.filter(d => !d.ronda)
  // la primera pendiente cuya hora ya pasó o está a menos de 1 h; si no, la siguiente pendiente
  const enHora = pendiente.filter(d => TOMAS.find(t => t.id === d.toma).hora <= sumarHora(ahora, 60))
  return (enHora[0] || pendiente[0] || conMeds[conMeds.length - 1] || dia[1] || {}).toma
}

function sumarHora(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number)
  const t = Math.min(h * 60 + m + min, 23 * 60 + 59)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function fechaLarga(f) {
  const [a, m, d] = f.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function moverFecha(f, dias) {
  const [a, m, d] = f.split('-').map(Number)
  const x = new Date(a, m - 1, d + dias)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const TIPO_MOV = {
  entrada: 'Llegó medicamento', toma: 'Toma', prn: 'Dosis si hace falta', ajuste: 'Conteo / ajuste', reverso: 'Toma deshecha',
}
