// PDF con la medicación actual de un residente (para el médico, la familia o un traslado).
import { jsPDF } from 'jspdf'
import logoUrl from '../../assets/logo.jpg'

const PINK = [201, 56, 110]
const PINK_LIGHT = [253, 232, 241]
const GRAY = [120, 80, 100]
const BLACK = [30, 20, 25]
const WHITE = [255, 255, 255]

function cargarLogo(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      resolve(c.toDataURL('image/jpeg'))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
const fmt = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '')
const nombreArchivo = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')

/**
 * residente: { nombre, fecha_nacimiento, habitacion, alergias }
 * prescripciones: lista de /medicacion/prescripciones (se usan las activas)
 * rondas: lista de rondas (para nombrar los horarios)
 */
export async function generarMedicacionPDF({ residente, prescripciones, rondas }) {
  const activas = prescripciones.filter(p => p.estado === 'activa')
  const rondaNombre = Object.fromEntries((rondas || []).map(r => [r.id, r.nombre]))
  const logo = await cargarLogo(logoUrl)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, H = 297, M = 16, CW = W - M * 2
  let y = M

  function encabezado() {
    if (logo) doc.addImage(logo, 'JPEG', M, y, 42, 16)
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...PINK)
    doc.text('Residencia Refugio Mendoza', M + 46, y + 6)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAY)
    doc.text('Mérida, Yucatán', M + 46, y + 12)
    y += 22
    doc.setDrawColor(...PINK).setLineWidth(0.8).line(M, y, W - M, y)
    y += 6
  }
  function saltoSiHaceFalta(alto) {
    if (y + alto <= H - 18) return
    doc.addPage(); y = M; encabezado()
  }

  encabezado()
  doc.setFillColor(...PINK).roundedRect(M, y, CW, 9, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...WHITE)
  doc.text('Medicación actual', M + 5, y + 6)
  doc.setFontSize(8).text(`Impreso el ${new Date().toLocaleDateString('es-MX')}`, W - M - 4, y + 6, { align: 'right' })
  y += 14

  // Datos del residente
  doc.setTextColor(...BLACK).setFont('helvetica', 'bold').setFontSize(12).text(residente.nombre, M, y)
  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRAY)
  const datos = [residente.fecha_nacimiento && `Nacimiento: ${fmt(residente.fecha_nacimiento)}`, residente.habitacion && `Habitación: ${residente.habitacion}`].filter(Boolean).join('   ·   ')
  if (datos) { doc.text(datos, M, y); y += 6 }
  const alergias = String(residente.alergias || '').trim()
  doc.setFillColor(...PINK_LIGHT).roundedRect(M, y, CW, 9, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...PINK)
  doc.text(`Alergias: ${alergias || 'Ninguna registrada'}`, M + 4, y + 6, { maxWidth: CW - 8 })
  y += 14

  if (!activas.length) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...BLACK).text('No tiene medicamentos activos.', M, y)
  }

  // Un bloque por medicamento
  const fijos = activas.filter(p => p.tipo !== 'prn'), prn = activas.filter(p => p.tipo === 'prn')
  const bloque = (p) => {
    const horarios = (p.horarios || []).map(h => [rondaNombre[h.ronda_id], h.hora].filter(Boolean).join(' ')).filter(Boolean).join(', ')
    const lineas = [
      p.texto,
      horarios && `Horario: ${horarios}`,
      p.indicaciones && `Indicaciones: ${p.indicaciones}`,
      [p.fecha_inicio && `Desde ${fmt(p.fecha_inicio)}`, p.fecha_fin && `hasta ${fmt(p.fecha_fin)}`, p.provee === 'familia' ? 'Lo trae la familia' : p.provee === 'centro' ? 'Lo da la residencia' : ''].filter(Boolean).join(' · '),
    ].filter(Boolean)
    doc.setFont('helvetica', 'normal').setFontSize(9)
    const partidas = lineas.flatMap(l => doc.splitTextToSize(String(l), CW - 8))
    const alto = 8 + partidas.length * 4.6 + 3
    saltoSiHaceFalta(alto)
    doc.setDrawColor(230, 200, 215).setLineWidth(0.3).roundedRect(M, y, CW, alto, 1.5, 1.5)
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...BLACK).text(p.nombre, M + 4, y + 6)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRAY)
    let yy = y + 11
    for (const l of partidas) { doc.text(l, M + 4, yy); yy += 4.6 }
    y += alto + 3
  }
  const titulo = (t) => { saltoSiHaceFalta(12); doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...PINK).text(t, M, y + 4); y += 8 }
  if (fijos.length) { titulo(`Todos los días / programados (${fijos.length})`); fijos.forEach(bloque) }
  if (prn.length) { titulo(`Solo si hace falta (${prn.length})`); prn.forEach(bloque) }

  // Pie
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRAY)
    doc.text('Documento informativo de la Residencia Refugio Mendoza. Cualquier cambio lo indica el médico.', M, H - 10)
    doc.text(`Página ${i} de ${paginas}`, W - M, H - 10, { align: 'right' })
  }
  doc.save(`Medicacion_${nombreArchivo(residente.nombre)}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
