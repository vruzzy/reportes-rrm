import { useState, useEffect, useCallback } from 'react'
import logo from '../assets/logo.jpg'
import {
  generarReciboPDF,
  cantidadEnLetras,
  formatPesos,
  sumarUnMes,
  sumarDias,
  getSemanasDelMes,
} from '../utils/reciboPDF'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES_NOMBRE = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

function mesISO(year, month) {
  return `${year}-${String(month).padStart(2,'0')}`
}

function fechaConDia(year, month, dia) {
  const diasEnMes = new Date(year, month, 0).getDate()
  const d = Math.min(dia, diasEnMes)
  return `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

// ── Subcomponente: vista calendario (lista de pagos del mes) ──────────────────

function CalendarioView({ onGenerar }) {
  const hoy      = new Date()
  const [year, setYear]   = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth() + 1)
  const [residentes, setResidentes] = useState([])
  const [recibos,    setRecibos]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  const mesStr = mesISO(year, month)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, recRes] = await Promise.all([
        fetch('/api/residentes'),
        fetch(`/api/recibos?mes=${mesStr}`),
      ])
      setResidentes(await rRes.json())
      setRecibos(await recRes.json())
    } catch { /* silencioso */ } finally {
      setLoading(false)
    }
  }, [mesStr])

  useEffect(() => { loadData() }, [loadData])

  function prevMes() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMes() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  async function handleEliminar(reciboId) {
    if (!window.confirm('¿Eliminar este recibo? Esta acción no se puede deshacer.')) return
    setDeletingId(reciboId)
    try {
      await fetch(`/api/recibos/${reciboId}`, { method: 'DELETE' })
      setRecibos(prev => prev.filter(r => r.id !== reciboId))
    } catch { /* silencioso */ } finally {
      setDeletingId(null)
    }
  }

  const DIAS_NOMBRE = ['','Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

  function labelSemana(desde, hasta) {
    const [,dm,dd] = desde.split('-').map(Number)
    const [,hm,hd] = hasta.split('-').map(Number)
    const M = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    return dm === hm ? `${dd} - ${hd} ${M[dm]}` : `${dd} ${M[dm]} - ${hd} ${M[hm]}`
  }

  // Generar items para el calendario
  const items = []
  residentes.forEach(res => {
    if (res.frecuencia === 'semanal') {
      const semanas = getSemanasDelMes(year, month, res.dia_pago || 1)
      semanas.forEach(({ desde, hasta }) => {
        const recibo = recibos.find(r => r.residente_id === res.id && r.periodo_de === desde)
        items.push({
          res, recibo, pagado: Boolean(recibo),
          tipo: 'semanal', desde, hasta,
          label: labelSemana(desde, hasta),
        })
      })
    } else {
      const recibo = recibos.find(r => r.residente_id === res.id)
      items.push({ res, recibo, pagado: Boolean(recibo), tipo: 'mensual' })
    }
  })

  items.sort((a, b) => {
    if (a.pagado !== b.pagado) return a.pagado ? 1 : -1
    return (a.res.dia_pago || 1) - (b.res.dia_pago || 1)
  })

  const pendientes = items.filter(i => !i.pagado)
  const pagados    = items.filter(i => i.pagado)

  return (
    <>
      {/* Navegador de mes */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 0',
      }}>
        <button onClick={prevMes} style={navBtnStyle}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>
          {MESES_NOMBRE[month-1]} {year}
        </span>
        <button onClick={nextMes} style={navBtnStyle}>›</button>
      </div>

      {loading ? (
        <div style={{ padding: 24 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 12, marginBottom: 10 }} />)}
        </div>
      ) : (
        <>
          {/* PENDIENTES */}
          {pendientes.length > 0 && (
            <div style={{ padding: '12px 16px 0' }}>
              <div style={sectionTitle('#e65c00')}>
                Pendientes · {pendientes.length}
              </div>
              {pendientes.map((item, i) => (
                <ResidenteRow
                  key={`${item.res.id}-${item.desde || 'mensual'}-${i}`}
                  res={item.res}
                  pagado={false}
                  semanaLabel={item.label}
                  onGenerar={() => onGenerar(item.res, year, month, item.desde, item.hasta)}
                />
              ))}
            </div>
          )}

          {/* PAGADOS */}
          {pagados.length > 0 && (
            <div style={{ padding: '12px 16px 0' }}>
              <div style={sectionTitle('#2e7d32')}>
                Pagados · {pagados.length}
              </div>
              {pagados.map((item, i) => (
                <ResidenteRow
                  key={`${item.res.id}-${item.desde || 'mensual'}-paid-${i}`}
                  res={item.res}
                  pagado
                  recibo={item.recibo}
                  semanaLabel={item.label}
                  deleting={deletingId === item.recibo?.id}
                  onEliminar={() => handleEliminar(item.recibo.id)}
                />
              ))}
            </div>
          )}

          {residentes.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>Sin residentes</h3>
              <p>Agrégalos en la pestaña "Residentes"</p>
            </div>
          )}
        </>
      )}
      <div style={{ height: 20 }} />
    </>
  )
}

const navBtnStyle = {
  background: 'var(--primary-100)', border: 'none', borderRadius: 8,
  width: 36, height: 36, fontSize: 20, cursor: 'pointer',
  color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

function sectionTitle(color) {
  return {
    fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: 8,
  }
}

function ResidenteRow({ res, pagado, recibo, deleting, onGenerar, onEliminar, semanaLabel }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${pagado ? '#c8e6c9' : 'var(--border)'}`,
      borderRadius: 12,
      padding: '12px 14px',
      marginBottom: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: pagado ? '#e8f5e9' : 'var(--primary-100)',
        color: pagado ? '#2e7d32' : 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 14,
      }}>
        {pagado ? '✓' : res.iniciales}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {res.nombre}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          {res.familiar && <span>{res.familiar} · </span>}
          {semanaLabel ? semanaLabel : `Día ${res.dia_pago || 1}`}
          {pagado && recibo && <span> · {formatPesos(recibo.valor)}</span>}
        </div>
      </div>

      {/* Acción */}
      {pagado ? (
        <button
          onClick={onEliminar}
          disabled={deleting}
          style={{
            background: 'none', border: '1px solid #ffcdd2', borderRadius: 8,
            padding: '6px 10px', cursor: 'pointer', color: 'var(--danger)',
            fontSize: 16, flexShrink: 0,
          }}
          title="Eliminar recibo"
        >
          {deleting ? '…' : '🗑'}
        </button>
      ) : (
        <button
          onClick={onGenerar}
          style={{
            background: 'var(--primary)', color: 'white', border: 'none',
            borderRadius: 8, padding: '7px 13px', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          Generar
        </button>
      )}
    </div>
  )
}

// ── Subcomponente: formulario de recibo ───────────────────────────────────────

function ReciboFormView({ residente, year, month, desdeOverride, hastaOverride, onBack, onSuccess }) {
  const [nextNum, setNextNum] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // Calcular fechas según frecuencia
  const esSemanal  = residente.frecuencia === 'semanal'
  const diasEnMes  = new Date(year, month, 0).getDate()
  const diaReal    = Math.min(residente.dia_pago || 1, diasEnMes)
  const fechaBase  = desdeOverride || `${year}-${String(month).padStart(2,'0')}-${String(diaReal).padStart(2,'0')}`
  const fechaHasta = hastaOverride || (esSemanal ? sumarDias(fechaBase, 6) : sumarUnMes(fechaBase))

  const [form, setForm] = useState({
    fecha:         fechaBase,
    periodo_de:    fechaBase,
    periodo_hasta: fechaHasta,
    valor:         residente.mensualidad ? String(residente.mensualidad) : '',
    forma_pago:    'efectivo',
    observaciones: `Mensualidad ${residente.nombre.trim().split(/\s+/)[0]}`,
  })

  useEffect(() => {
    fetch('/api/recibos/proximo-numero')
      .then(r => r.json())
      .then(d => setNextNum(d.numero))
      .catch(() => setNextNum(1))
  }, [])

  function setField(f) { return (e) => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleGenerar() {
    setError('')
    if (!form.valor || parseFloat(form.valor) <= 0) return setError('Ingresa un valor válido.')
    setGenerating(true)
    try {
      const datos = {
        numero:        nextNum,
        nombre:        residente.familiar || residente.nombre,
        ciudad:        residente.ciudad || 'Mérida, Yucatán',
        fecha:         form.fecha,
        periodo_de:    form.periodo_de,
        periodo_hasta: form.periodo_hasta,
        valor:         parseFloat(form.valor),
        forma_pago:    form.forma_pago,
        observaciones: form.observaciones,
        frecuencia:    residente.frecuencia || 'mensual',
      }

      const res = await fetch('/api/recibos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...datos, residente_id: residente.id }),
      })
      if (!res.ok) { const j = await res.json().catch(()=>({})); throw new Error(j.error || 'Error al guardar') }

      const pdf = await generarReciboPDF(datos)
      pdf.save(`Recibo_${residente.nombre.split(' ')[0]}_${form.fecha}.pdf`)
      onSuccess()
    } catch (err) {
      setError(err.message || 'Error al generar el recibo.')
    } finally {
      setGenerating(false)
    }
  }

  const valorNum = parseFloat(form.valor) || 0

  return (
    <>
      {/* Botón volver */}
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        color: 'var(--primary)', fontWeight: 600, fontSize: 14,
        padding: '12px 16px 4px',
      }}>
        ‹ Volver al calendario
      </button>

      {/* Info del residente */}
      <div className="form-card" style={{ marginTop: 8 }}>
        <div className="section-label">Residente</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--primary-100)', color: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 15, flexShrink: 0,
          }}>
            {residente.iniciales}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{residente.nombre}</div>
            {residente.familiar && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Familiar: {residente.familiar}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fecha */}
      <div className="form-card">
        <div className="section-label">Datos del recibo</div>
        <div className="input-group">
          <label>Fecha</label>
          <input className="input" type="date" value={form.fecha} onChange={setField('fecha')} />
        </div>
      </div>

      {/* Período */}
      <div className="form-card">
        <div className="section-label">Período de hospedaje</div>
        <div className="date-row">
          <div className="input-group">
            <label>Del</label>
            <input className="input" type="date" value={form.periodo_de} onChange={setField('periodo_de')} />
          </div>
          <div className="input-group">
            <label>Al</label>
            <input className="input" type="date" value={form.periodo_hasta} onChange={setField('periodo_hasta')} />
          </div>
        </div>
      </div>

      {/* Valor */}
      <div className="form-card">
        <div className="section-label">Pago</div>
        <div className="input-group">
          <label>Valor ($)</label>
          <input className="input" type="number" min="0" step="any"
            value={form.valor} onChange={setField('valor')}
            inputMode="numeric" style={{ fontWeight: 700, fontSize: 18 }} />
        </div>
        {valorNum > 0 && (
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'var(--primary-100)', borderRadius: 8,
            fontSize: 12, color: 'var(--primary-dark)', fontStyle: 'italic',
          }}>
            {cantidadEnLetras(valorNum)}
          </div>
        )}
      </div>

      {/* Forma de pago */}
      <div className="form-card">
        <div className="section-label">Forma de pago</div>
        <div className="turn-toggle">
          {[['efectivo','Efectivo'],['cheque','Cheque'],['otros','Otros']].map(([v,l]) => (
            <button key={v} type="button"
              className={`turn-btn${form.forma_pago === v ? ' active' : ''}`}
              onClick={() => setForm(f => ({ ...f, forma_pago: v }))}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Observaciones */}
      <div className="form-card">
        <div className="section-label">Observaciones</div>
        <input className="input" type="text"
          value={form.observaciones} onChange={setField('observaciones')} />
      </div>

      {error && <div className="error-banner" style={{ margin: '0 16px' }}>{error}</div>}

      <button className="btn-generate" onClick={handleGenerar} disabled={generating} type="button">
        {generating ? (
          <><div className="spinner" />Generando…</>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Generar y descargar PDF
          </>
        )}
      </button>
      <div style={{ height: 20 }} />
    </>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function RecibosForm() {
  const [view, setView]           = useState('calendar') // 'calendar' | 'form'
  const [selectedRes,   setSelectedRes]   = useState(null)
  const [selectedYear,  setSelectedYear]  = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [selectedDesde, setSelectedDesde] = useState(null)
  const [selectedHasta, setSelectedHasta] = useState(null)
  const [calendarKey,   setCalendarKey]   = useState(0)

  function handleGenerar(res, year, month, desde, hasta) {
    setSelectedRes(res)
    setSelectedYear(year)
    setSelectedMonth(month)
    setSelectedDesde(desde || null)
    setSelectedHasta(hasta || null)
    setView('form')
  }

  function handleBack() {
    setView('calendar')
    setSelectedRes(null)
  }

  function handleSuccess() {
    setView('calendar')
    setSelectedRes(null)
    setCalendarKey(k => k + 1) // fuerza reload del calendario
  }

  return (
    <>
      {/* ENCABEZADO */}
      <div className="page-header">
        <img src={logo} alt="Residencia Refugio Mendoza" className="page-header-logo-img" />
        <div className="page-header-info">
          <h1>Recibos</h1>
          <p>Residencia Refugio Mendoza</p>
        </div>
      </div>

      {view === 'calendar' && (
        <CalendarioView key={calendarKey} onGenerar={handleGenerar} />
      )}

      {view === 'form' && selectedRes && (
        <ReciboFormView
          residente={selectedRes}
          year={selectedYear}
          month={selectedMonth}
          desdeOverride={selectedDesde}
          hastaOverride={selectedHasta}
          onBack={handleBack}
          onSuccess={handleSuccess}
        />
      )}
    </>
  )
}
