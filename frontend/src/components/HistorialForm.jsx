import { useState, useEffect, useCallback } from 'react'
import logo from '../assets/logo.jpg'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fechaCorta(str) {
  if (!str) return ''
  const [, m, d] = str.split('-')
  return `${parseInt(d)} ${MESES[parseInt(m)-1]}`
}

function hoy() { return new Date().toISOString().slice(0, 10) }
function primerDiaMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

export default function HistorialForm() {
  const [residentes,    setResidentes]    = useState([])
  const [selectedRes,   setSelectedRes]   = useState(null)
  const [desde,         setDesde]         = useState(primerDiaMes())
  const [hasta,         setHasta]         = useState(hoy())
  const [reportes,      setReportes]      = useState([])
  const [loading,       setLoading]       = useState(false)
  const [generando,     setGenerando]     = useState(false)
  const [evolucion,     setEvolucion]     = useState('')
  const [showSheet,     setShowSheet]     = useState(false)
  const [error,         setError]         = useState('')
  const [destinatario,  setDestinatario]  = useState('medico')
  const [expandido,     setExpandido]     = useState(null)

  useEffect(() => {
    fetch('/api/residentes')
      .then(r => r.json())
      .then(setResidentes)
      .catch(() => {})
  }, [])

  const buscarReportes = useCallback(async () => {
    if (!selectedRes) return
    setLoading(true)
    setError('')
    setReportes([])
    try {
      const res = await fetch(`/api/historial?residente_id=${selectedRes.id}&desde=${desde}&hasta=${hasta}`)
      const data = await res.json()
      setReportes(data)
    } catch {
      setError('Error al cargar el historial.')
    } finally {
      setLoading(false)
    }
  }, [selectedRes, desde, hasta])

  useEffect(() => {
    if (selectedRes) buscarReportes()
  }, [buscarReportes])

  async function handleEvolucion() {
    if (!reportes.length) return setError('No hay reportes en el período seleccionado.')
    setGenerando(true)
    setError('')
    try {
      const res = await fetch('/api/historial/evolucion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residente: selectedRes, reportes, desde, hasta, destinatario }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvolucion(data.evolucion)
      setShowSheet(true)
    } catch (err) {
      setError(err.message || 'Error al generar evolución.')
    } finally {
      setGenerando(false)
    }
  }

  async function handleEliminar(id) {
    if (!window.confirm('¿Eliminar este reporte del historial?')) return
    try {
      await fetch(`/api/historial/${id}`, { method: 'DELETE' })
      setReportes(prev => prev.filter(r => r.id !== id))
    } catch {}
  }

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <img src={logo} alt="RRM" className="page-header-logo-img" />
        <div className="page-header-info">
          <h1>Historial</h1>
          <p>Evolución del residente</p>
        </div>
      </div>

      {/* Selector de residente */}
      <div className="form-card" style={{ marginTop: 12 }}>
        <div className="section-label">Residente</div>
        <div className="resident-grid">
          {residentes.map(r => (
            <button
              key={r.id}
              type="button"
              className={`resident-card${selectedRes?.id === r.id ? ' selected' : ''}`}
              onClick={() => setSelectedRes(selectedRes?.id === r.id ? null : r)}
            >
              <div className="resident-avatar">{r.iniciales}</div>
              <div className="resident-name">{r.nombre}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Rango de fechas */}
      <div className="form-card">
        <div className="section-label">Período</div>
        <div className="date-row">
          <div className="input-group">
            <label>Desde</label>
            <input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} max={hasta} />
          </div>
          <div className="input-group">
            <label>Hasta</label>
            <input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} min={desde} max={hoy()} />
          </div>
        </div>
        {/* Accesos rápidos */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Esta semana', fn: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); setDesde(d.toISOString().slice(0,10)); setHasta(hoy()) } },
            { label: 'Este mes',    fn: () => { setDesde(primerDiaMes()); setHasta(hoy()) } },
            { label: 'Último mes',  fn: () => { const d = new Date(); d.setMonth(d.getMonth()-1); setDesde(d.toISOString().slice(0,10)); setHasta(hoy()) } },
            { label: '3 meses',     fn: () => { const d = new Date(); d.setMonth(d.getMonth()-3); setDesde(d.toISOString().slice(0,10)); setHasta(hoy()) } },
          ].map(({ label, fn }) => (
            <button key={label} type="button" onClick={fn} style={{
              padding: '5px 12px', borderRadius: 999, border: '1.5px solid var(--border)',
              background: 'var(--bg)', fontSize: 12, fontWeight: 600,
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Resultados */}
      {selectedRes && (
        <>
          {loading ? (
            <div style={{ padding: '16px 16px 0' }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12, marginBottom: 8 }} />)}
            </div>
          ) : reportes.length === 0 ? (
            <div className="empty-state" style={{ paddingTop: 32 }}>
              <div className="empty-state-icon">📋</div>
              <h3>Sin reportes</h3>
              <p>No hay reportes de {selectedRes.nombre} en este período.</p>
            </div>
          ) : (
            <>
              {/* Contador + botón IA */}
              <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {reportes.length} {reportes.length === 1 ? 'reporte' : 'reportes'} encontrados
                </span>
              </div>

              {/* Destinatario */}
              <div style={{ padding: '10px 16px 0' }}>
                <div className="turn-toggle">
                  {[['medico','Para médico/a'],['familiar','Para familiar']].map(([v,l]) => (
                    <button key={v} type="button"
                      className={`turn-btn${destinatario === v ? ' active' : ''}`}
                      onClick={() => setDestinatario(v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista de reportes */}
              <div style={{ padding: '12px 16px 0' }}>
                {reportes.map(r => (
                  <div key={r.id} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 12, marginBottom: 8, overflow: 'hidden',
                  }}>
                    {/* Cabecera del reporte */}
                    <div
                      style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                      onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                    >
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--primary-100)', color: 'var(--primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800,
                      }}>
                        {fechaCorta(r.fecha)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                          {r.turno === 'Nocturno' ? '🌙' : '☀️'} Turno {r.turno}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.texto_reporte?.slice(0, 70)}…
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleEliminar(r.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 15, padding: 4 }}
                          title="Eliminar"
                        >🗑</button>
                        <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>
                          {expandido === r.id ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {/* Contenido expandido */}
                    {expandido === r.id && (
                      <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', marginTop: 10, whiteSpace: 'pre-wrap' }}>
                          {r.texto_reporte}
                        </p>
                        {r.notas_adicionales && (
                          <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                            <strong>Notas:</strong> {r.notas_adicionales}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {error && <div className="error-banner">{error}</div>}

      {/* Botón generar evolución */}
      {selectedRes && reportes.length > 0 && (
        <button className="btn-generate" onClick={handleEvolucion} disabled={generando} type="button">
          {generando ? (
            <><div className="spinner" />Generando evolución…</>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2a10 10 0 110 20 10 10 0 010-20z" opacity=".3"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              Generar resumen de evolución
            </>
          )}
        </button>
      )}

      <div style={{ height: 20 }} />

      {/* Bottom sheet con el resultado */}
      {showSheet && evolucion && (
        <div className="sheet-backdrop" onClick={() => setShowSheet(false)}>
          <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div className="sheet-title">
                <div className="sheet-title-dot" />
                Evolución · {selectedRes?.nombre?.split(' ')[0]}
              </div>
              <button className="btn-close-sheet" onClick={() => setShowSheet(false)}>✕</button>
            </div>
            <div className="sheet-divider" />
            <div className="sheet-body">
              <div style={{
                fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
              }}>
                Período: {fechaCorta(desde)} — {fechaCorta(hasta)} · {reportes.length} reportes · {destinatario === 'medico' ? 'Para médico/a' : 'Para familiar'}
              </div>
              <div className="reporte-text">{evolucion}</div>
            </div>
            <div className="sheet-actions">
              <button className="btn-action secondary" onClick={() => {
                navigator.clipboard?.writeText(evolucion)
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                Copiar
              </button>
              <button className="btn-action primary" onClick={() => setShowSheet(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
