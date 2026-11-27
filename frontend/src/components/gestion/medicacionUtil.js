// Utilidades del módulo de Medicación. Las listas (formas, unidades, vías…) vienen del servidor (/opciones).
import { gestionFetch, leerJson } from './GestionApp'

export const API = '/api/gestion/medicacion'

export async function pedir(url, opciones) {
  const res = await gestionFetch(url.startsWith('/') ? url : `${API}/${url}`, opciones)
  const data = await leerJson(res)
  if (!res.ok) throw Object.assign(new Error(data.error || 'Ocurrió un error.'), { status: res.status, data })
  return data
}
export const enviar = (url, metodo, cuerpo) => pedir(url, { method: metodo, body: JSON.stringify(cuerpo || {}) })

export const DIAS_SEMANA = [ // lunes primero; valor 0 = domingo
  { v: 1, corto: 'L', largo: 'Lunes' }, { v: 2, corto: 'M', largo: 'Martes' }, { v: 3, corto: 'M', largo: 'Miércoles' },
  { v: 4, corto: 'J', largo: 'Jueves' }, { v: 5, corto: 'V', largo: 'Viernes' }, { v: 6, corto: 'S', largo: 'Sábado' },
  { v: 0, corto: 'D', largo: 'Domingo' },
]

// Días restantes: rojo ≤ 3, naranja ≤ 7
export function nivelDias(dias, existencia, enUso = true) {
  if (!enUso) return 'na'
  if (existencia != null && existencia <= 0) return 'urgente'
  if (dias == null) return 'na'
  if (dias <= 3) return 'urgente'
  if (dias <= 7) return 'poco'
  return 'ok'
}
export function textoDias(dias, existencia, enUso = true) {
  if (!enUso) return 'Sin uso'
  if (existencia != null && existencia <= 0) return 'Sin existencia'
  if (dias == null) return 'Si hace falta'
  return dias === 1 ? '1 día' : `${dias} días`
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function fechaLarga(f) {
  if (!f) return ''
  const [a, m, d] = f.split('-').map(Number)
  const dia = new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-MX', { weekday: 'long', timeZone: 'UTC' })
  return `${dia} ${d} de ${MESES[m - 1]}`
}
export function fechaCorta(f) {
  if (!f) return ''
  const [a, m, d] = f.split('-').map(Number)
  return `${d} ${MESES[m - 1].slice(0, 3)} ${a}`
}
export function moverFecha(f, n) {
  const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 0.5 → "½", 1.5 → "1½" */
export function num(n) {
  if (n == null || n === '') return ''
  const ent = Math.floor(n + 1e-9), frac = Math.round((n - ent) * 1000) / 1000
  const f = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[frac]
  if (f) return ent ? `${ent}${f}` : f
  return String(Math.round(n * 1000) / 1000)
}

export function unidad(opciones, u, n) {
  const par = opciones?.unidades?.[u] || [u, u]
  return Math.abs(n) === 1 || (n > 0 && n < 1) ? par[0] : par[1]
}
export const dosisTexto = (opciones, dosis, u) => (dosis ? `${num(dosis)} ${unidad(opciones, u, dosis)}` : '')

export const TIPO_LABEL = { fija: 'Horario fijo', prn: 'Si hace falta', variable: 'Dosis variable' }
export const ESTADO_LABEL = { activa: 'Activa', suspendida: 'Suspendida', terminada: 'Terminada', reemplazada: 'Reemplazada' }
