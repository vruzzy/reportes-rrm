// PDF del reporte de turno hecho desde Gestión. Mismo formato que el de la app,
// pero la tabla de signos vitales trae las dos tomas: al recibir y al entregar.
import { jsPDF } from 'jspdf'
import logoUrl from '../../assets/logo.jpg'
import { TURNOS } from './signosVitales'

const PINK = [201, 56, 110]
const PINK_LIGHT = [253, 232, 241]
const GRAY = [120, 80, 100]
const BLACK = [30, 20, 25]
const WHITE = [255, 255, 255]
const ROJO = [180, 30, 60]

function cargarLogo(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      resolve(c.toDataURL('image/jpeg'))
    }
    img.onerror = reject
    img.src = url
  })
}

function limpiarTexto(t) {
  return String(t || '')
    .replace(/\*+/g, '').replace(/^#+\s*/gm, '').replace(/^[-–—•]\s*/gm, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\n{3,}/g, '\n\n').trim()
}
const fmtFecha = (s) => (s ? s.split('-').reverse().join('/') : '—')
const v = (x) => (x === null || x === undefined || x === '' ? '—' : String(x))

export async function generarReportePDF({ reporte, alertas }) {
  const logo = await cargarLogo(logoUrl)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 16, CW = W - M * 2
  let y = M
  const turnoLargo = TURNOS.find(t => t.id === reporte.turno)?.largo || reporte.turno

  doc.addImage(logo, 'JPEG', M, y, 42, 16)
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...PINK)
  doc.text('Residencia Refugio Mendoza', M + 46, y + 6)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAY)
  doc.text('Mérida, Yucatán  —  Cuidado integral para tus seres queridos', M + 46, y + 12)
  y += 22
  doc.setDrawColor(...PINK).setLineWidth(0.8).line(M, y, W - M, y)
  y += 6

  doc.setFillColor(...PINK).roundedRect(M, y, CW, 9, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...WHITE)
  doc.text(`Reporte de Turno — ${turnoLargo}`, M + 5, y + 6)
  doc.setFontSize(8)
  doc.text(`Folio: RRM-${reporte.fecha.replace(/-/g, '')}-${String(reporte.id).padStart(4, '0')}`, W - M - 4, y + 6, { align: 'right' })
  y += 14

  const info = [
    ['Fecha', fmtFecha(reporte.fecha)],
    ['Hora', reporte.hora ? `${reporte.hora} hrs.` : '—'],
    ['Residente', reporte.residente_nombre || '—'],
    ['Responsable', reporte.enfermero || '—'],
  ]
  doc.setFillColor(...PINK_LIGHT).roundedRect(M, y, CW, 12, 2, 2, 'F')
  info.forEach(([label, val], i) => {
    const x = M + (CW / 4) * i + 3
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...GRAY)
    doc.text(label.toUpperCase(), x, y + 4.5)
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...BLACK)
    doc.text(doc.splitTextToSize(val, CW / 4 - 5)[0], x, y + 9.5)
  })
  y += 17

  // Informe
  doc.setFillColor(...PINK).roundedRect(M, y, CW, 7, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...WHITE)
  doc.text('Informe del turno', M + 5, y + 4.8)
  y += 8
  const lineas = doc.setFont('helvetica', 'normal').setFontSize(9.5).splitTextToSize(limpiarTexto(reporte.texto), CW - 8)
  doc.setFillColor(...PINK_LIGHT).roundedRect(M, y, CW, lineas.length * 5 + 8, 2, 2, 'F')
  doc.setTextColor(...BLACK)
  let ty = y + 6
  for (const l of lineas) {
    if (ty > 270) { doc.addPage(); ty = M }
    doc.text(l, M + 4, ty)
    ty += 5
  }
  y = ty + 8

  // Signos vitales: dos filas
  if (y > 225) { doc.addPage(); y = M }
  doc.setFillColor(...PINK).roundedRect(M, y, CW, 7, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...WHITE)
  doc.text('Signos Vitales', M + 5, y + 4.8)
  y += 8

  const cols = [
    ['Toma', 30], ['Hora', 16], ['T/A (mmHg)', 24], ['FC (lpm)', 18], ['SpO2 (%)', 18],
    ['FR (rpm)', 18], ['Temp. (°C)', 20], ['Glucosa (mg/dL)', CW - 144],
  ]
  const filas = [['Al recibir', reporte.signos?.recibir], ['Al entregar', reporte.signos?.entregar]]
  const fueraDe = (momento, campo) => alertas?.[momento]?.some(a => a.campo === campo)

  doc.setFillColor(...PINK).rect(M, y, CW, 7, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...WHITE)
  let x = M
  cols.forEach(([h, w]) => { doc.text(h, x + w / 2, y + 4.8, { align: 'center' }); x += w })
  y += 7

  filas.forEach(([nombre, t], i) => {
    const momento = i === 0 ? 'recibir' : 'entregar'
    doc.setFillColor(...(i % 2 ? WHITE : PINK_LIGHT)).rect(M, y, CW, 9, 'F')
    const celdas = t ? [
      [nombre], [v(t.hora)],
      [`${v(t.ta_sistolica)}/${v(t.ta_diastolica)}`, fueraDe(momento, 'ta_sistolica') || fueraDe(momento, 'ta_diastolica')],
      [v(t.fc), fueraDe(momento, 'fc')], [v(t.spo2), fueraDe(momento, 'spo2')], [v(t.fr), fueraDe(momento, 'fr')],
      [v(t.temperatura), fueraDe(momento, 'temperatura')], [v(t.glucosa), fueraDe(momento, 'glucosa')],
    ] : [[nombre], ['—'], ['Sin registrar'], [''], [''], [''], [''], ['']]
    x = M
    celdas.forEach(([val, alerta], j) => {
      const w = cols[j][1]
      doc.setFont('helvetica', j === 0 ? 'bold' : 'normal').setFontSize(j < 2 ? 8 : 10).setTextColor(...(alerta ? ROJO : BLACK))
      doc.text(String(val), x + w / 2, y + 6, { align: 'center' })
      x += w
    })
    y += 9
  })
  doc.setDrawColor(220, 170, 195).setLineWidth(0.3).rect(M, y - 25, CW, 25)
  y += 4
  const hayAlertas = filas.some((_, i) => alertas?.[i === 0 ? 'recibir' : 'entregar']?.length)
  if (hayAlertas) {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...ROJO)
    doc.text('Valores en rojo: fuera del rango esperado para adulto mayor.', M, y)
    y += 5
  }

  // Micciones y evacuaciones (de Controles diarios)
  const elim = [['Micciones', reporte.datos?.micciones], ['Evacuaciones', reporte.datos?.evacuaciones]]
  if (elim.some(([, l]) => Array.isArray(l))) {
    y += 2
    elim.forEach(([nombre, lista]) => {
      const regs = (Array.isArray(lista) ? lista : []).filter(e => e && typeof e === 'object' && !Array.isArray(e))
      const detalle = regs.length
        ? regs.map(e => `${e.hora || '—'}${e.caracteristicas?.length ? ` ${e.caracteristicas.join(', ')}` : ''}`).join(' · ')
        : 'Sin registrar'
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...BLACK)
      doc.text(`${nombre} (${regs.length}):`, M, y)
      doc.setFont('helvetica', 'normal')
      const lineas = doc.splitTextToSize(detalle, CW - 32)
      doc.text(lineas, M + 32, y)
      y += 4.5 * lineas.length + 1
    })
  }
  y += 6

  if (y > 260) { doc.addPage(); y = M }
  doc.setDrawColor(...PINK).setLineWidth(0.4).line(M, y, M + 65, y)
  y += 5
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BLACK)
  doc.text(reporte.enfermero || '—', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAY)
  doc.text('Responsable del turno', M, y + 4)

  doc.setDrawColor(...PINK).setLineWidth(0.4).line(M, 282, W - M, 282)
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRAY)
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, M, 287)
  doc.text('Residencia Refugio Mendoza  |  Mérida, Yucatán', W - M, 287, { align: 'right' })

  const nombre = (reporte.residente_nombre || 'residente').split(' ')[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '')
  const turnoSlug = reporte.turno === 'Nocturno' ? 'noche' : 'manana'
  doc.save(`reporte-${nombre}-${turnoSlug}-${reporte.fecha.replace(/-/g, '')}.pdf`)
}
