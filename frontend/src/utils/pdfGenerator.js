import { jsPDF } from 'jspdf'
import logoUrl from '../assets/logo.jpg'

const PINK      = [201, 56, 110]
const PINK_LIGHT = [253, 232, 241]
const GRAY      = [120, 80, 100]
const BLACK     = [30, 20, 25]
const WHITE     = [255, 255, 255]

function loadLogo(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      resolve(c.toDataURL('image/jpeg'))
    }
    img.onerror = reject
    img.src = url
  })
}

function stripJunk(text) {
  if (!text) return ''
  return text
    .replace(/\*+/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-–—•]\s*/gm, '')
    .replace(/\|[^\n]*/g, '')          // remove table rows
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function fmtFecha(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function folio() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `RRM-${d}-${Math.floor(1000 + Math.random() * 9000)}`
}

export async function generarPDF({ reporte, residente, turno, fecha, horaReporte, enfermero, signosVitales }) {
  const logo = await loadLogo(logoUrl)
  const doc  = new jsPDF({ unit: 'mm', format: 'a4' })
  const W    = 210
  const M    = 16          // margin
  const CW   = W - M * 2  // 178 mm
  let y      = M

  // ── LOGO ────────────────────────────────────────────────────────────────
  doc.addImage(logo, 'JPEG', M, y, 42, 16)

  // Name + tagline to the right of logo
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...PINK)
  doc.text('Residencia Refugio Mendoza', M + 46, y + 6)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAY)
  doc.text('Mérida, Yucatán  —  Cuidado integral para tus seres queridos', M + 46, y + 12)

  y += 22

  // ── PINK LINE ────────────────────────────────────────────────────────────
  doc.setDrawColor(...PINK).setLineWidth(0.8).line(M, y, W - M, y)
  y += 6

  // ── TITLE BAR ────────────────────────────────────────────────────────────
  doc.setFillColor(...PINK).roundedRect(M, y, CW, 9, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...WHITE)
  doc.text(`Reporte de Turno — ${turno || ''}`, M + 5, y + 6)
  doc.setFontSize(8)
  doc.text(`Folio: ${folio()}`, W - M - 4, y + 6, { align: 'right' })
  y += 14

  // ── INFO ROW ─────────────────────────────────────────────────────────────
  const info = [
    ['Fecha',      fmtFecha(fecha)],
    ['Hora',       horaReporte ? horaReporte + ' hrs.' : '—'],
    ['Residente',  residente?.nombre || '—'],
    ['Responsable', enfermero || '—'],
  ]

  doc.setFillColor(...PINK_LIGHT)
  doc.roundedRect(M, y, CW, 12, 2, 2, 'F')

  const colW = CW / 4
  info.forEach(([label, val], i) => {
    const x = M + colW * i + 3
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...GRAY)
    doc.text(label.toUpperCase(), x, y + 4.5)
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...BLACK)
    doc.text(val, x, y + 9.5)
  })

  y += 17

  // ── NARRATIVE BOX ────────────────────────────────────────────────────────
  // Title
  doc.setFillColor(...PINK).roundedRect(M, y, CW, 7, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...WHITE)
  doc.text('Informe del turno', M + 5, y + 4.8)
  y += 8

  // Text
  const text  = stripJunk(reporte)
  const lines = doc.setFontSize(9.5).splitTextToSize(text, CW - 8)
  const boxH  = lines.length * 5 + 8

  doc.setFillColor(...PINK_LIGHT).roundedRect(M, y, CW, boxH, 2, 2, 'F')
  doc.setFont('helvetica', 'normal').setTextColor(...BLACK)

  let ty = y + 6
  for (const line of lines) {
    if (ty > 270) { doc.addPage(); ty = M }
    doc.text(line, M + 4, ty)
    ty += 5
  }

  y = ty + 8

  // ── VITALS TABLE ─────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = M }

  doc.setFillColor(...PINK).roundedRect(M, y, CW, 7, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...WHITE)
  doc.text('Signos Vitales', M + 5, y + 4.8)
  y += 8

  const sv   = signosVitales || {}
  const cols = [
    ['T/A (mmHg)',  `${sv.ta_sistolica || '—'}/${sv.ta_diastolica || '—'}`],
    ['FC (lpm)',    sv.fc          || '—'],
    ['SpO₂ (%)',   sv.spo2        || '—'],
    ['FR (rpm)',   sv.fr          || '—'],
    ['Temp. (°C)', sv.temperatura || '—'],
  ]
  const cw = CW / 5

  // header
  doc.setFillColor(...PINK).rect(M, y, CW, 7, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...WHITE)
  cols.forEach(([h], i) => doc.text(h, M + cw * i + cw / 2, y + 4.8, { align: 'center' }))

  // values
  doc.setFillColor(...PINK_LIGHT).rect(M, y + 7, CW, 10, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BLACK)
  cols.forEach(([, v], i) => doc.text(String(v), M + cw * i + cw / 2, y + 14, { align: 'center' }))

  // borders
  doc.setDrawColor(220, 170, 195).setLineWidth(0.3)
  doc.rect(M, y, CW, 17)
  doc.line(M, y + 7, M + CW, y + 7)
  for (let i = 1; i < 5; i++) doc.line(M + cw * i, y, M + cw * i, y + 17)

  y += 22

  // ── SIGNATURE ────────────────────────────────────────────────────────────
  if (y > 260) { doc.addPage(); y = M }
  doc.setDrawColor(...PINK).setLineWidth(0.4).line(M, y, M + 65, y)
  y += 5
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BLACK)
  doc.text(enfermero || '—', M, y)
  y += 4
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAY)
  doc.text('Responsable del turno', M, y)

  // ── FOOTER ───────────────────────────────────────────────────────────────
  doc.setDrawColor(...PINK).setLineWidth(0.4).line(M, 282, W - M, 282)
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GRAY)
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, M, 287)
  doc.text('Residencia Refugio Mendoza  |  Mérida, Yucatán', W - M, 287, { align: 'right' })

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const name = (residente?.nombre || 'residente').split(' ')[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  doc.save(`reporte-${name}-${date}.pdf`)
}
