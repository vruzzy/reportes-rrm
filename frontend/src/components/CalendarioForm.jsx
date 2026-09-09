import { useState, useEffect, useCallback, useMemo } from 'react'
import logo from '../assets/logo.jpg'

// ── CONSTANTES ─────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const TIPOS = [
  { v: 'familiar', label: '👪 Familiar', color: 'var(--primary)' },
  { v: 'medico',   label: '🩺 Médico',   color: '#2563eb' },
  { v: 'terapia',  label: '🧑‍⚕️ Terapia', color: '#16a34a' },
  { v: 'otro',     label: '📌 Otro',     color: '#a16207' },
]
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t.v, t]))

const ESTADOS = [
  { v: 'pendiente',  label: 'Pendiente',  bg: '#fef3c7', fg: '#92400e' },
  { v: 'confirmada', label: 'Confirmada', bg: '#dbeafe', fg: '#1e40af' },
  { v: 'realizada',  label: 'Realizada',  bg: '#dcfce7', fg: '#166534' },
  { v: 'cancelada',  label: 'Cancelada',  bg: '#fee2e2', fg: '#991b1b' },
]
const ESTADO_MAP = Object.fromEntries(ESTADOS.map(e => [e.v, e]))

const RECURRENCIAS = [
  { v: 'ninguna',     label: 'No se repite' },
  { v: 'semanal',     label: 'Cada semana' },
  { v: 'quincenal',   label: 'Cada 2 semanas' },
  { v: 'mensual',     label: 'Cada mes' },
  { v: 'dias_semana', label: 'Días de la semana' },
]
const RECURRENCIA_MAP = Object.fromEntries(RECURRENCIAS.map(r => [r.v, r]))

// Lunes = 0 … Domingo = 6
const DOW = [
  { v: 0, corto: 'Lun' }, { v: 1, corto: 'Mar' }, { v: 2, corto: 'Mié' },
  { v: 3, corto: 'Jue' }, { v: 4, corto: 'Vie' }, { v: 5, corto: 'Sáb' }, { v: 6, corto: 'Dom' },
]

/** Texto corto para el badge de recurrencia de una visita */
function textoRecurrencia(v) {
  if (!v.recurrencia || v.recurrencia === 'ninguna') return ''
  if (v.recurrencia === 'dias_semana') {
    const dias = String(v.dias_semana || '').split(',').filter(s => s !== '').map(Number)
    return dias.map(d => DOW[d]?.corto).filter(Boolean).join(' · ')
  }
  return RECURRENCIA_MAP[v.recurrencia]?.label || ''
}

// ── HELPERS DE FECHA ───────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10) }
function ymKey(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}` }
function dateISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function fechaLarga(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

/** Matriz de semanas (lunes a domingo) para el mes dado */
function buildMatrix(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // 0 = lunes
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// ── MODAL DE VISITA ────────────────────────────────────────────────────────────

function VisitaModal({ visita, fechaDefault, residentes, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    residente_id: visita?.residente_id ? String(visita.residente_id) : '',
    tipo:         visita?.tipo       || 'familiar',
    visitante:    visita?.visitante  || '',
    parentesco:   visita?.parentesco || '',
    fecha:        visita?.anchor_fecha || visita?.fecha || fechaDefault || todayISO(),
    hora:         visita?.hora       || '',
    estado:       visita?.estado     || 'pendiente',
    notas:        visita?.notas      || '',
    recurrencia:  visita?.recurrencia || 'ninguna',
    dias_semana:  String(visita?.dias_semana || '').split(',').filter(s => s !== '').map(Number),
  }))
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  function toggleDia(d) {
    setForm(f => ({
      ...f,
      dias_semana: f.dias_semana.includes(d)
        ? f.dias_semana.filter(x => x !== d)
        : [...f.dias_semana, d].sort((a, b) => a - b),
    }))
  }

  async function handleSubmit() {
    setError('')
    if (!form.fecha) return setError('La fecha es obligatoria.')
    if (form.recurrencia === 'dias_semana' && form.dias_semana.length === 0) {
      return setError('Elige al menos un día de la semana para la visita fija.')
    }
    const res = residentes.find(r => String(r.id) === form.residente_id)
    if (form.tipo === 'familiar' && !form.visitante.trim() && !res) {
      return setError('Indica el residente o el nombre del visitante.')
    }
    setSaving(true)
    try {
      await onSave({
        ...form,
        residente_id:     form.residente_id || null,
        residente_nombre: res?.nombre || '',
        dias_semana:      form.recurrencia === 'dias_semana' ? form.dias_semana : [],
      })
    } catch (err) {
      setError(err.message || 'Error al guardar.')
      setSaving(false)
    }
  }

  const esFija = form.recurrencia !== 'ninguna'

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-title">
            <div className="sheet-title-dot" />
            {visita ? 'Editar visita' : 'Nueva visita'}
          </div>
          <button className="btn-close-sheet" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-divider" />

        <div className="sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tipo */}
          <div>
            <div className="section-label">Tipo de visita</div>
            <div className="chip-grid">
              {TIPOS.map(t => (
                <button
                  key={t.v}
                  type="button"
                  className={`chip${form.tipo === t.v ? ' selected' : ''}`}
                  onClick={() => set('tipo', t.v)}
                >
                  {form.tipo === t.v && <span className="chip-check">✓</span>}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha y hora */}
          <div className="date-row">
            <div className="input-group">
              <label>{esFija ? 'A partir del' : 'Fecha'}</label>
              <input className="input" type="date" value={form.fecha}
                onChange={e => set('fecha', e.target.value)} />
            </div>
            <div className="input-group">
              <label>Hora (opcional)</label>
              <input className="input" type="time" value={form.hora}
                onChange={e => set('hora', e.target.value)} />
            </div>
          </div>

          {/* Repetir (días fijos) */}
          <div>
            <div className="section-label">Repetir</div>
            <div className="chip-grid">
              {RECURRENCIAS.map(r => (
                <button
                  key={r.v}
                  type="button"
                  className={`chip${form.recurrencia === r.v ? ' selected' : ''}`}
                  onClick={() => set('recurrencia', r.v)}
                >
                  {form.recurrencia === r.v && <span className="chip-check">✓</span>}
                  {r.label}
                </button>
              ))}
            </div>

            {form.recurrencia === 'dias_semana' && (
              <div className="chip-grid" style={{ marginTop: 10 }}>
                {DOW.map(d => (
                  <button
                    key={d.v}
                    type="button"
                    className={`chip${form.dias_semana.includes(d.v) ? ' selected' : ''}`}
                    onClick={() => toggleDia(d.v)}
                  >
                    {form.dias_semana.includes(d.v) && <span className="chip-check">✓</span>}
                    {d.corto}
                  </button>
                ))}
              </div>
            )}

            {esFija && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                Aparecerá automáticamente en el calendario en cada fecha que corresponda.
              </div>
            )}
          </div>

          {/* Residente */}
          <div className="input-group">
            <label>Residente</label>
            <select className="input" value={form.residente_id}
              onChange={e => set('residente_id', e.target.value)}>
              <option value="">— Sin residente asignado —</option>
              {residentes.map(r => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </div>

          {/* Visitante */}
          <div className="input-group">
            <label>{form.tipo === 'familiar' ? 'Nombre del visitante' : 'Responsable / lugar'}</label>
            <input className="input" type="text" value={form.visitante}
              onChange={e => set('visitante', e.target.value)}
              placeholder={form.tipo === 'familiar' ? 'Ej. Ana Martínez' : 'Ej. Dr. López / Clínica Mérida'} />
          </div>

          {form.tipo === 'familiar' && (
            <div className="input-group">
              <label>Parentesco (opcional)</label>
              <input className="input" type="text" value={form.parentesco}
                onChange={e => set('parentesco', e.target.value)}
                placeholder="Ej. Hija, sobrino, nuera…" />
            </div>
          )}

          {/* Estado */}
          <div>
            <div className="section-label">Estado</div>
            <div className="chip-grid">
              {ESTADOS.map(s => (
                <button
                  key={s.v}
                  type="button"
                  className={`chip${form.estado === s.v ? ' selected' : ''}`}
                  onClick={() => set('estado', s.v)}
                >
                  {form.estado === s.v && <span className="chip-check">✓</span>}
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div className="input-group">
            <label>Notas (opcional)</label>
            <textarea className="input" rows={3} value={form.notas}
              onChange={e => set('notas', e.target.value)}
              placeholder="Detalles: motivo de la cita, indicaciones, quién acompaña…"
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 15 }} />
          </div>

          {error && <div className="error-banner" role="alert">{error}</div>}
        </div>

        <div className="sheet-actions">
          <button className="btn-action secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-action primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar visita'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────────

export default function CalendarioForm() {
  const now = new Date()
  const [year, setYear]           = useState(now.getFullYear())
  const [month, setMonth]         = useState(now.getMonth())
  const [selected, setSelected]   = useState(todayISO())
  const [visitas, setVisitas]     = useState([])
  const [residentes, setResidentes] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [modal, setModal]         = useState(null) // null | { visita } | { nueva: true }
  const [confirmDel, setConfirmDel] = useState(null)

  const cargarVisitas = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/visitas?mes=${ymKey(year, month)}`)
      if (!res.ok) throw new Error()
      setVisitas(await res.json())
    } catch {
      setError('No se pudo cargar la agenda.')
      setVisitas([])
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { cargarVisitas() }, [cargarVisitas])

  useEffect(() => {
    fetch('/api/residentes').then(r => r.json()).then(setResidentes).catch(() => {})
  }, [])

  // Mapa fecha -> visitas del día
  const porDia = useMemo(() => {
    const map = {}
    for (const v of visitas) (map[v.fecha] ||= []).push(v)
    return map
  }, [visitas])

  const matrix = useMemo(() => buildMatrix(year, month), [year, month])
  const visitasDelDia = porDia[selected] || []

  function cambiarMes(delta) {
    let m = month + delta, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  async function guardar(data) {
    const editando = modal?.visita
    const url    = editando ? `/api/visitas/${editando.id}` : '/api/visitas'
    const method = editando ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Error al guardar')

    const esFija = data.recurrencia && data.recurrencia !== 'ninguna'
    const [ny, nm] = data.fecha.split('-').map(Number)

    // Para una visita puntual nueva/movida, saltar al mes donde quedó.
    // Para una visita fija, quedarse en el mes que se está viendo.
    if (!esFija && (ny !== year || nm - 1 !== month)) {
      setYear(ny); setMonth(nm - 1)
      setSelected(data.fecha)
    } else {
      cargarVisitas()
      if (!esFija) setSelected(data.fecha)
    }
    setModal(null)
  }

  async function eliminar(id) {
    setConfirmDel(null)
    try {
      await fetch(`/api/visitas/${id}`, { method: 'DELETE' })
      setVisitas(prev => prev.filter(v => v.id !== id))
    } catch {
      setError('No se pudo eliminar la visita.')
    }
  }

  const esHoy = (iso) => iso === todayISO()

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <img src={logo} alt="RRM" className="page-header-logo-img" />
        <div className="page-header-info">
          <h1>Calendario</h1>
          <p>Agenda de visitas</p>
        </div>
      </div>

      {/* Navegación de mes */}
      <div className="cal-monthbar">
        <button className="cal-navbtn" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">‹</button>
        <div className="cal-monthlabel">{MESES[month]} {year}</div>
        <button className="cal-navbtn" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">›</button>
      </div>

      {/* Cuadrícula del mes */}
      <div className="cal-grid-wrap">
        <div className="cal-weekhead">
          {DIAS_SEMANA.map((d, i) => <div key={i} className="cal-weekhead-cell">{d}</div>)}
        </div>

        {matrix.map((week, wi) => (
          <div key={wi} className="cal-week">
            {week.map((d, di) => {
              if (d === null) return <div key={di} className="cal-day empty" />
              const iso = dateISO(year, month, d)
              const dayVisitas = porDia[iso] || []
              const tipos = [...new Set(dayVisitas.map(v => v.tipo))]
              return (
                <button
                  key={di}
                  type="button"
                  className={`cal-day${iso === selected ? ' selected' : ''}${esHoy(iso) ? ' today' : ''}`}
                  onClick={() => setSelected(iso)}
                >
                  <span className="cal-daynum">{d}</span>
                  {dayVisitas.length > 0 && (
                    <span className="cal-dots">
                      {tipos.slice(0, 3).map(t => (
                        <span key={t} className="cal-dot" style={{ background: TIPO_MAP[t]?.color || '#999' }} />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Lista del día seleccionado */}
      <div className="form-card" style={{ marginTop: 4 }}>
        <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{fechaLarga(selected)}</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            {visitasDelDia.length} {visitasDelDia.length === 1 ? 'visita' : 'visitas'}
          </span>
        </div>

        {loading ? (
          [1, 2].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12, marginBottom: 8 }} />)
        ) : visitasDelDia.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, padding: '18px 0' }}>
            Sin visitas agendadas este día.
          </div>
        ) : (
          visitasDelDia.map(v => {
            const tipo   = TIPO_MAP[v.tipo] || TIPO_MAP.otro
            const estado = ESTADO_MAP[v.estado] || ESTADO_MAP.pendiente
            const titulo = v.visitante || v.residente_nombre || tipo.label.replace(/^\S+\s/, '')
            const recur  = textoRecurrencia(v)
            return (
              <div key={v.occ_id || v.id} className="cal-visita">
                <div className="cal-visita-time" style={{ borderColor: tipo.color, color: tipo.color }}>
                  {v.hora || '—'}
                </div>
                <div className="cal-visita-body">
                  <div className="cal-visita-title">{titulo}</div>
                  <div className="cal-visita-meta">
                    <span style={{ color: tipo.color, fontWeight: 700 }}>{tipo.label}</span>
                    {v.residente_nombre && v.visitante && <span>· {v.residente_nombre}</span>}
                    {v.parentesco && <span>· {v.parentesco}</span>}
                  </div>
                  {v.notas && <div className="cal-visita-notas">{v.notas}</div>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="cal-badge" style={{ background: estado.bg, color: estado.fg }}>
                      {estado.label}
                    </span>
                    {recur && (
                      <span className="cal-badge" style={{ background: 'var(--primary-100)', color: 'var(--primary-dark)' }}>
                        🔁 {recur}
                      </span>
                    )}
                  </div>
                </div>
                <div className="cal-visita-actions">
                  <button className="icon-btn" onClick={() => setModal({ visita: v })} title="Editar">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button className="icon-btn danger" onClick={() => setConfirmDel(v)} title="Eliminar">
                    <svg viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <button className="btn-generate" type="button" onClick={() => setModal({ nueva: true })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        Agendar visita
      </button>

      <div style={{ height: 20 }} />

      {modal && (
        <VisitaModal
          visita={modal.visita}
          fechaDefault={selected}
          residentes={residentes}
          onSave={guardar}
          onClose={() => setModal(null)}
        />
      )}

      {confirmDel && (
        <div className="confirm-backdrop" onClick={() => setConfirmDel(null)}>
          <div className="confirm-dialog" role="alertdialog" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <h3>Eliminar visita</h3>
            <p>
              {confirmDel.es_recurrente
                ? <>Se eliminará la <strong>visita fija</strong> y dejará de aparecer en todas sus fechas.<br />Esta acción no se puede deshacer.</>
                : <>¿Eliminar esta visita de la agenda?<br />Esta acción no se puede deshacer.</>}
            </p>
            <div className="confirm-actions">
              <button className="btn-confirm-cancel" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn-confirm-delete" onClick={() => eliminar(confirmDel.id)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
