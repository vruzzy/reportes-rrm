import { jsPDF } from 'jspdf'
import logoUrl from '../assets/logo_rrm.png'

// ── Helpers de fecha ──────────────────────────────────────────────────────────

const MESES = [
  'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
]
const MESES_MIN = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

export function fechaISO() {
  return new Date().toISOString().slice(0, 10)
}

export function sumarUnMes(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number)
  let nm = m + 1, ny = y
  if (nm > 12) { nm = 1; ny++ }
  const nd = Math.min(d, new Date(ny, nm, 0).getDate())
  return `${ny}-${String(nm).padStart(2,'0')}-${String(nd).padStart(2,'0')}`
}

export function sumarDias(fechaStr, dias) {
  const d = new Date(fechaStr + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Devuelve todas las semanas (Lun-Dom) que tienen días en el mes indicado
// diaSemana: 1=Lunes...7=Domingo
export function getSemanasDelMes(year, month, diaSemana = 1) {
  const jsDay = diaSemana === 7 ? 0 : diaSemana  // 1=Mon...6=Sat, 7->0=Sun
  const primerDia  = new Date(year, month - 1, 1)
  const ultimoDia  = new Date(year, month, 0)
  const semanas    = []

  // Buscar el primer jsDay en o antes del primer día del mes
  const inicio = new Date(primerDia)
  const diff   = (inicio.getDay() - jsDay + 7) % 7
  inicio.setDate(inicio.getDate() - diff)

  let cur = new Date(inicio)
  while (cur <= ultimoDia) {
    const desde = cur.toISOString().slice(0, 10)
    const hasta = sumarDias(desde, 6)
    semanas.push({ desde, hasta })
    cur.setDate(cur.getDate() + 7)
  }
  return semanas
}

export function formatFechaLarga(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${String(d).padStart(2,'0')} DE ${MESES[m-1]} DE ${y}`
}

export function formatPesos(n) {
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ── Número a letras en español ────────────────────────────────────────────────

function enLetras(n) {
  if (n === 0) return 'cero'
  const TEENS   = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve']
  const DECENAS = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa']
  const CIENTS  = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos']

  function u(n, masc) {
    const s = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve']
    return (n === 1 && masc) ? 'un' : s[n]
  }
  function lt100(n, masc) {
    if (!n) return ''
    if (n < 10) return u(n, masc)
    if (n < 20) return TEENS[n-10]
    if (n < 30) {
      if (n === 20) return 'veinte'
      const un = n - 20
      if (un === 1) return masc ? 'veintiún' : 'veintiuno'
      return ['','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco',
        'veintiséis','veintisiete','veintiocho','veintinueve'][un]
    }
    const d = Math.floor(n/10), r = n%10
    return r ? DECENAS[d]+' y '+u(r, masc) : DECENAS[d]
  }
  function lt1000(n, masc) {
    if (!n) return ''
    if (n === 100) return 'cien'
    let s = ''
    if (n >= 100) { s = CIENTS[Math.floor(n/100)]; n %= 100; if (n) s += ' ' }
    if (n) s += lt100(n, masc)
    return s
  }
  if (n >= 1000) {
    const miles = Math.floor(n/1000), resto = n%1000
    const milStr = miles === 1 ? 'mil' : lt1000(miles, true)+' mil'
    return milStr + (resto ? ' '+lt1000(resto, false) : '')
  }
  return lt1000(n, false)
}

export function cantidadEnLetras(monto) {
  const entero   = Math.floor(monto)
  const centavos = Math.round((monto - entero) * 100)
  const p = enLetras(entero)
  return `Son ${p.charAt(0).toUpperCase()+p.slice(1)} pesos ${String(centavos).padStart(2,'0')}/100`
}

// ── Generación del PDF ────────────────────────────────────────────────────────

export async function generarReciboPDF(datos) {
  const { numero, nombre, ciudad, fecha, periodo_de, periodo_hasta, valor, forma_pago, observaciones, concepto, mostrarPeriodo } = datos

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  // Dimensiones página carta: 215.9 x 279.4 mm
  const PW = 215.9
  const ML = 14          // margen izquierdo
  const MR = PW - 14    // margen derecho = 201.9
  const W  = MR - ML    // ancho útil = 187.9

  // Cargar logo
  let logoImg = null
  try {
    logoImg = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload  = () => resolve(img)
      img.onerror = reject
      img.src = logoUrl
    })
  } catch { /* continúa sin logo */ }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ENCABEZADO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Logo — derecha, cuadrado 48×48 mm, alineado al margen derecho
  const LOGO_W = 48, LOGO_H = 48
  const LOGO_X = MR - LOGO_W
  const LOGO_Y = 6
  if (logoImg) {
    pdf.addImage(logoImg, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_H)
  }

  // "RECIBO" — izquierda, grande y negrita
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(22)
  pdf.text('RECIBO', ML, 22)

  // Dirección — izquierda, debajo del título
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  const dir = [
    'María Inés de la Cruz Góngora',
    'Carrillo Calle 45 x 12 No. 249 Col.',
    'Leandro Valle C.P 97143 Mérida, Yucatán',
    'Tel. 9992-12-06-26',
  ]
  let dy = 29
  dir.forEach((line, i) => {
    pdf.text(line, ML, dy)
    dy += i === 0 ? 5 : 4.5
  })

  // "RECIBO ORIGINAL" — derecha, debajo del logo
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('RECIBO ORIGINAL', MR, LOGO_Y + LOGO_H + 6, { align: 'right' })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TABLA DE DATOS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const TABLE_Y  = 62    // inicio de tabla (debajo del logo 48mm + margen)
  const ROW_H    = 9     // altura de cada fila
  const LABEL_W  = 22   // ancho columna etiqueta
  const VAL_X    = ML + LABEL_W + 1

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)

  // Fila 1: FECHA
  pdf.rect(ML, TABLE_Y, W, ROW_H)
  pdf.setFont('helvetica', 'bold');  pdf.setFontSize(9)
  pdf.text('FECHA:', ML + 2, TABLE_Y + 6)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  pdf.text(formatFechaLarga(fecha), VAL_X + 2, TABLE_Y + 6)

  // Fila 2: RECIBÍ
  const ROW2_Y = TABLE_Y + ROW_H
  pdf.rect(ML, ROW2_Y, W, ROW_H)
  pdf.setFont('helvetica', 'bold');  pdf.setFontSize(9)
  pdf.text('RECIBÍ:', ML + 2, ROW2_Y + 6)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  pdf.text(nombre, VAL_X + 2, ROW2_Y + 6)

  // Fila 3: CIUDAD + VALOR (split al 58%)
  const ROW3_Y   = TABLE_Y + ROW_H * 2
  const SPLIT_X  = ML + W * 0.58
  pdf.rect(ML, ROW3_Y, W, ROW_H)
  pdf.line(SPLIT_X, ROW3_Y, SPLIT_X, ROW3_Y + ROW_H)  // divisor vertical

  pdf.setFont('helvetica', 'bold');  pdf.setFontSize(9)
  pdf.text('CIUDAD:', ML + 2, ROW3_Y + 6)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  pdf.text(ciudad, VAL_X + 2, ROW3_Y + 6)

  pdf.setFont('helvetica', 'bold');  pdf.setFontSize(9)
  pdf.text('VALOR:', SPLIT_X + 2, ROW3_Y + 6)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  pdf.text(formatPesos(valor), SPLIT_X + 18, ROW3_Y + 6)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FORMA DE PAGO (checkboxes)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const CHECK_Y = TABLE_Y + ROW_H * 3 + 5
  const BOX_S   = 4.5
  const formas  = ['efectivo', 'transferencia', 'otros']
  const labels  = ['EFECTIVO', 'TRANSFERENCIA', 'OTROS']
  let fx = ML

  formas.forEach((f, i) => {
    pdf.setDrawColor(0, 0, 0)
    pdf.setLineWidth(0.35)
    pdf.rect(fx, CHECK_Y, BOX_S, BOX_S)

    if (forma_pago === f) {
      // Relleno gris claro
      pdf.setFillColor(60, 60, 60)
      pdf.rect(fx + 0.7, CHECK_Y + 0.7, BOX_S - 1.4, BOX_S - 1.4, 'F')
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text(labels[i], fx + BOX_S + 2, CHECK_Y + 3.5)
    fx += BOX_S + pdf.getTextWidth(labels[i]) + 8
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CAJA DE HOSPEDAJE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const BOX_Y = CHECK_Y + BOX_S + 6
  const BOX_H = 32

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.rect(ML, BOX_Y, W, BOX_H)

  const [dy1, dm1, dd1] = periodo_de.split('-').map(Number)
  const [dy2, dm2, dd2] = periodo_hasta.split('-').map(Number)
  const desdeStr = `${String(dd1).padStart(2,'0')} DE ${MESES[dm1-1]}`
  const hastaStr = `${String(dd2).padStart(2,'0')} DE ${MESES[dm2-1]} DE ${dy2}`

  const tituloPago = concepto === 'centro_dia'
    ? 'PAGO DE CENTRO DE DÍA CORRESPONDIENTE'
    : concepto && concepto !== 'hospedaje'
      ? `PAGO DE ${concepto.toUpperCase()} CORRESPONDIENTE`
      : 'PAGO DE HOSPEDAJE CORRESPONDIENTE'
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  const tituloY = mostrarPeriodo === false ? BOX_Y + BOX_H / 2 + 2 : BOX_Y + 11
  pdf.text(tituloPago, PW / 2, tituloY, { align: 'center' })
  if (mostrarPeriodo !== false) {
    pdf.text(`DEL ${desdeStr} AL ${hastaStr}.`, PW / 2, BOX_Y + 20, { align: 'center' })
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PIE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let footY = BOX_Y + BOX_H + 7

  // OBSERVACIONES
  pdf.setFont('helvetica', 'bold');  pdf.setFontSize(9)
  pdf.text('OBSERVACIONES:', ML, footY)
  pdf.setFont('helvetica', 'normal')
  pdf.text('  ' + (observaciones || ''), ML + 33, footY)

  footY += 8

  // CANTIDAD EN LETRAS
  pdf.setFont('helvetica', 'bold');  pdf.setFontSize(9)
  pdf.text('CANTIDAD EN LETRAS:', ML, footY)
  pdf.setFont('helvetica', 'normal')
  pdf.text('  ' + cantidadEnLetras(valor), ML + 39, footY)

  footY += 8

  // M.N
  pdf.setFont('helvetica', 'bold');  pdf.setFontSize(10)
  pdf.text('M.N', PW / 2, footY, { align: 'center' })


  return pdf
}
