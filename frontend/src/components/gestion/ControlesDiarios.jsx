import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gestionFetch, leerJson } from './GestionApp'
import TurnoBarra from './TurnoBarra'
import {
  CAMPOS, CLAVES, MOMENTOS, TURNO_LABEL, alertaDe, alertasDe, tieneValores, resumenToma,
  turnoActual, momentoSugerido, residentesDelTurno, horaLocal, fechaLarga, ELIMINACION, aVigilar,
} from './signosVitales'
import { RegistrosTipo, aplicarCambio } from './Eliminacion'
import { Check, AlertTriangle, Loader2, Search, X, History, HeartPulse, CircleDashed, Droplet } from 'lucide-react'

// Controles diarios: signos vitales al recibir y al entregar cada turno.
// Cada fila se guarda sola al salir de ella (o con Enter).

const vacio = () => Object.fromEntries(CLAVES.map(c => [c, '']))
const aTexto = (toma) => Object.fromEntries(CLAVES.map(c => [c, toma?.[c] ?? '']))
const clave = (rid, momento) => `${rid}|${momento}`

function Avatar({ r, size = 48 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  if (r.foto) return <img className="rl-avatar" src={r.foto} alt="" style={style} />
  return <div className="rl-avatar rl-avatar-ini" style={style}>{r.iniciales}</div>
}

/** Acepta solo números (con un punto decimal) mientras se escribe */
function limpiar(v, decimal) {
  let s = String(v).replace(',', '.').replace(decimal ? /[^\d.]/g : /\D/g, '')
  if (decimal) { const [a, ...b] = s.split('.'); s = b.length ? `${a}.${b.join('').slice(0, 1)}` : a }
  return s.slice(0, 5)
}

export default function ControlesDiarios({ puedeEditar, puedeEliminar = true }) {
  const inicial = turnoActual()
  const [fecha, setFecha] = useState(inicial.fecha)
  const [turno, setTurno] = useState(inicial.turno)
  const [momento, setMomento] = useState(() => momentoSugerido(inicial.turno))
  const [residentes, setResidentes] = useState([])
  const [tomas, setTomas] = useState({})          // clave(rid, momento) → fila guardada
  const [borradores, setBorradores] = useState({}) // rid → valores en edición (momento actual)
  const [estado, setEstado] = useState({})         // rid → 'guardando' | 'ok' | { error }
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [historial, setHistorial] = useState(null) // residente
  const [vista, setVista] = useState('signos')     // 'signos' | 'eliminacion'
  const [eventos, setEventos] = useState([])       // micciones y evacuaciones del turno
  const tablaRef = useRef(null)
  const sucios = useRef(new Set())

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const q = `fecha=${fecha}&turno=${encodeURIComponent(turno)}`
      const [rr, rc, re] = await Promise.all([
        gestionFetch('/api/gestion/residentes'),
        gestionFetch(`/api/gestion/controles?${q}`),
        gestionFetch(`/api/gestion/controles/eliminacion?${q}`),
      ])
      const [res, ctl, elim] = [await leerJson(rr), await leerJson(rc), await leerJson(re)]
      if (!rr.ok) throw new Error(res.error || 'No se pudieron cargar los residentes.')
      if (!rc.ok) throw new Error(ctl.error || 'No se pudieron cargar los controles.')
      if (!re.ok) throw new Error(elim.error || 'No se pudieron cargar las micciones y evacuaciones.')
      setResidentes(res)
      setEventos(elim)
      setTomas(Object.fromEntries(ctl.map(t => [clave(t.residente_id, t.momento), t])))
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [fecha, turno])

  useEffect(() => { cargar() }, [cargar])

  // Al cambiar de turno o momento, los borradores se rellenan con lo guardado
  useEffect(() => {
    sucios.current.clear()
    setEstado({})
    setBorradores(Object.fromEntries(residentes.map(r => [r.id, aTexto(tomas[clave(r.id, momento)])])))
  }, [residentes, momento, fecha, turno]) // eslint-disable-line react-hooks/exhaustive-deps

  const delTurno = useMemo(() => residentesDelTurno(residentes, turno), [residentes, turno])
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? delTurno.filter(r => r.nombre.toLowerCase().includes(q)) : delTurno
  }, [delTurno, busqueda])

  const conteo = (m) => delTurno.filter(r => tieneValores(tomas[clave(r.id, m)])).length
  const alertasTurno = delTurno.reduce((n, r) =>
    n + MOMENTOS.filter(m => alertasDe(tomas[clave(r.id, m.id)]).length).length, 0)

  function cambiarTurno({ fecha: f, turno: t }) {
    setFecha(f); setTurno(t)
    if (t !== turno) setMomento(momentoSugerido(t))
  }

  function editar(rid, campo, valor, decimal) {
    sucios.current.add(rid)
    setBorradores(b => ({ ...b, [rid]: { ...(b[rid] || vacio()), [campo]: limpiar(valor, decimal) } }))
    setEstado(s => (s[rid] ? { ...s, [rid]: undefined } : s))
  }

  async function guardar(r) {
    if (!sucios.current.has(r.id) || !puedeEditar) return
    sucios.current.delete(r.id)
    const previa = tomas[clave(r.id, momento)]
    const valores = borradores[r.id] || vacio()
    setEstado(s => ({ ...s, [r.id]: 'guardando' }))
    try {
      const res = await gestionFetch('/api/gestion/controles', {
        method: 'PUT',
        body: JSON.stringify({ residente_id: r.id, fecha, turno, momento, hora: previa?.hora || horaLocal(), notas: previa?.notas || '', ...valores }),
      })
      const data = await leerJson(res)
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
      setTomas(t => {
        const n = { ...t }
        if (data.borrado) delete n[clave(r.id, momento)]
        else n[clave(r.id, momento)] = data
        return n
      })
      setEstado(s => ({ ...s, [r.id]: data.borrado ? undefined : 'ok' }))
    } catch (e) {
      sucios.current.add(r.id)
      setEstado(s => ({ ...s, [r.id]: { error: e.message } }))
    }
  }

  function alSalirDeFila(e, r) {
    if (!e.currentTarget.contains(e.relatedTarget)) guardar(r)
  }

  // Enter: guarda y baja a la misma columna del siguiente residente
  function teclas(e, fila, col) {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const destino = fila + (e.key === 'ArrowUp' ? -1 : 1)
    const el = tablaRef.current?.querySelector(`[data-f="${destino}"][data-c="${col}"]`)
    if (el) { el.focus(); el.select() } else e.currentTarget.blur()
  }

  const momentoIdx = MOMENTOS.findIndex(m => m.id === momento)

  return (
    <>
      <header className="gl-header">
        <div>
          <p className="gl-eyebrow">Residentes</p>
          <h1>Controles diarios</h1>
        </div>
        {!puedeEditar && <span className="rl-solo-ver">Solo lectura</span>}
      </header>

      <TurnoBarra fecha={fecha} turno={turno} onCambio={cambiarTurno} />

      <div className="rl-tabs" role="tablist">
        <button role="tab" aria-selected={vista === 'signos'} className={vista === 'signos' ? 'active' : ''} onClick={() => setVista('signos')}>
          Signos vitales
        </button>
        <button role="tab" aria-selected={vista === 'eliminacion'} className={vista === 'eliminacion' ? 'active' : ''} onClick={() => setVista('eliminacion')}>
          Micciones y evacuaciones <span>{eventos.length}</span>
        </button>
      </div>

      {vista === 'eliminacion' ? (
        <TablaEliminacion residentes={delTurno} eventos={eventos} fecha={fecha} turno={turno} puedeEditar={puedeEditar} puedeEliminar={puedeEliminar}
          cargando={cargando} error={error} onReintentar={cargar} onHistorial={setHistorial}
          onCambio={(ev, borrado) => setEventos(l => aplicarCambio(l, ev, borrado))} />
      ) : (<>
      <section className="cd-resumen">
        {MOMENTOS.map((m, i) => {
          const n = conteo(m.id), total = delTurno.length
          return (
            <button key={m.id} className={`cd-card${momento === m.id ? ' active' : ''}`} onClick={() => setMomento(m.id)}
              style={{ '--i': i }}>
              <span className="cd-card-titulo">{m.label}</span>
              <strong>{n}<small> / {total}</small></strong>
              <span className="cd-barra"><i style={{ width: total ? `${(n / total) * 100}%` : 0 }} /></span>
              <span className="cd-card-pie">{n === total && total ? 'Completo' : `${total - n} pendientes`}</span>
            </button>
          )
        })}
        <div className={`cd-card cd-card-alerta${alertasTurno ? ' hay' : ''}`} style={{ '--i': 2 }}>
          <span className="cd-card-titulo">Fuera de rango</span>
          <strong>{alertasTurno}</strong>
          <span className="cd-card-pie">{alertasTurno ? 'Tomas con valores a vigilar' : 'Sin alertas en este turno'}</span>
        </div>
      </section>

      <div className="rl-panel">
        <div className="rl-toolbar">
          <div className="rl-segment" role="tablist" aria-label="Momento de la toma"
            style={{ '--seg-i': momentoIdx, '--seg-n': MOMENTOS.length, marginLeft: 0 }}>
            <span className="rl-segment-pill" aria-hidden="true" />
            {MOMENTOS.map(m => (
              <button key={m.id} role="tab" aria-selected={momento === m.id} className={momento === m.id ? 'active' : ''} onClick={() => setMomento(m.id)}>
                {m.label} <span>{conteo(m.id)}/{delTurno.length}</span>
              </button>
            ))}
          </div>
          <div className="rl-search cd-search">
            <Search />
            <input type="search" placeholder="Buscar residente…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar" />
            {busqueda && <button className="rl-link" onClick={() => setBusqueda('')} aria-label="Limpiar"><X size={14} /></button>}
          </div>
          <span className="cd-ayuda">{puedeEditar ? <>Se guarda solo al pasar a otra fila · <kbd>Enter</kbd> baja al siguiente</> : 'Consulta de tomas'}</span>
        </div>

        {error && <div className="rl-error" role="alert">{error} <button className="rl-link" onClick={cargar}>Reintentar</button></div>}

        {cargando ? (
          <div className="rl-skeleton">{[0, 1, 2, 3].map(i => <div key={i} className="cd-skel" />)}</div>
        ) : !delTurno.length ? (
          <div className="rl-vacio">
            <span className="rl-vacio-icon"><HeartPulse /></span>
            <p>No hay residentes en la residencia para este turno.</p>
          </div>
        ) : (
          <div className="cd-scroll">
            <table className="rl-table cd-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th>Residente</th>
                  {CAMPOS.map(c => <th key={c.id} className={`cd-th-${c.id}`}>{c.label} <small>{c.unidad}</small></th>)}
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r, fila) => {
                  const b = borradores[r.id] || vacio()
                  const guardada = tomas[clave(r.id, momento)]
                  const st = estado[r.id]
                  const alertas = alertasDe(b)
                  let col = 0
                  const input = (campo, ph, decimal, extra = '') => {
                    const c = col++
                    const al = alertaDe(campo, b[campo])
                    return (
                      <input className={`cd-in${al ? ' alerta' : ''}${extra}`} value={b[campo]} placeholder={ph}
                        inputMode={decimal ? 'decimal' : 'numeric'} disabled={!puedeEditar}
                        data-f={fila} data-c={c} title={al || undefined} aria-label={`${campo} de ${r.nombre}`}
                        onChange={e => editar(r.id, campo, e.target.value, decimal)}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => teclas(e, fila, c)} />
                    )
                  }
                  return (
                    <tr key={r.id} className={`cd-fila${alertas.length ? ' con-alerta' : ''}`} onBlur={e => alSalirDeFila(e, r)}
                      style={{ animationDelay: `${Math.min(fila, 14) * 35}ms` }}>
                      <td>
                        <button className="cd-persona" onClick={() => setHistorial(r)} title="Ver historial de signos">
                          <Avatar r={r} />
                          <span>
                            <strong>{r.nombre}</strong>
                            <em>{r.habitacion ? `Hab. ${r.habitacion}` : r.tipo_servicio === 'centro_dia' ? 'Centro de día' : 'Permanente'}</em>
                          </span>
                        </button>
                      </td>
                      <td className="cd-ta">
                        <div>{input('ta_sistolica', '')}<span>/</span>{input('ta_diastolica', '')}</div>
                      </td>
                      {CAMPOS.slice(1).map(c => <td key={c.id}>{input(c.id, '', c.decimal)}</td>)}
                      <td className="cd-estado">
                        {st === 'guardando' ? <span className="cd-st"><Loader2 className="cd-spin" /> Guardando…</span>
                          : st?.error ? <span className="cd-st err" title={st.error}><AlertTriangle /> {st.error}</span>
                          : tieneValores(guardada) ? (
                            <span className={`cd-st ok${st === 'ok' ? ' recien' : ''}`}>
                              <Check /> {guardada.hora || 'Guardado'}
                              <small>{guardada.usuario_nombre?.split(' ')[0]}</small>
                            </span>
                          ) : <span className="cd-st pend"><CircleDashed /> Pendiente</span>}
                        {alertas.length > 0 && <span className="cd-tags">{alertas.map(a => <i key={a.campo}>{a.alerta}</i>)}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>)}

      {historial && <HistorialSignos residente={historial} onCerrar={() => setHistorial(null)} />}
    </>
  )
}

// ── Micciones y evacuaciones del turno ────────────────────────────────────────
function TablaEliminacion({ residentes, eventos, fecha, turno, puedeEditar, puedeEliminar, cargando, error, onReintentar, onHistorial, onCambio }) {
  const [busqueda, setBusqueda] = useState('')
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? residentes.filter(r => r.nombre.toLowerCase().includes(q)) : residentes
  }, [residentes, busqueda])
  const ids = new Set(residentes.map(r => r.id))
  const delTurno = eventos.filter(e => ids.has(e.residente_id))
  const deTipo = (rid, tipo) => delTurno.filter(e => e.residente_id === rid && e.tipo === tipo)
  const vigilar = delTurno.filter(e => aVigilar(e).length).length
  const sinEvacuar = residentes.filter(r => !deTipo(r.id, 'evacuacion').length).length

  return (
    <>
      <section className="cd-resumen">
        {ELIMINACION.map((t, i) => {
          const n = delTurno.filter(e => e.tipo === t.id).length
          const conAlguna = residentes.filter(r => deTipo(r.id, t.id).length).length
          return (
            <div key={t.id} className="cd-card cd-card-fija" style={{ '--i': i }}>
              <span className="cd-card-titulo">{t.label}</span>
              <strong>{n}</strong>
              <span className="cd-card-pie">
                {conAlguna} de {residentes.length} residentes{t.id === 'evacuacion' && sinEvacuar ? ` · ${sinEvacuar} sin evacuar` : ''}
              </span>
            </div>
          )
        })}
        <div className={`cd-card cd-card-alerta${vigilar ? ' hay' : ''}`} style={{ '--i': 2 }}>
          <span className="cd-card-titulo">A vigilar</span>
          <strong>{vigilar}</strong>
          <span className="cd-card-pie">{vigilar ? 'Registros con características a revisar' : 'Sin características a vigilar'}</span>
        </div>
      </section>

      <div className="rl-panel">
        <div className="rl-toolbar">
          <div className="rl-search cd-search" style={{ marginLeft: 0 }}>
            <Search />
            <input type="search" placeholder="Buscar residente…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar" />
            {busqueda && <button className="rl-link" onClick={() => setBusqueda('')} aria-label="Limpiar"><X size={14} /></button>}
          </div>
          <span className="cd-ayuda">
            {puedeEditar ? 'Toca + para registrar a la hora actual · toca un registro para marcar cómo fue, corregir o borrar' : 'Consulta de registros'}
          </span>
        </div>

        {error && <div className="rl-error" role="alert">{error} <button className="rl-link" onClick={onReintentar}>Reintentar</button></div>}

        {cargando ? (
          <div className="rl-skeleton">{[0, 1, 2, 3].map(i => <div key={i} className="cd-skel" />)}</div>
        ) : !residentes.length ? (
          <div className="rl-vacio">
            <span className="rl-vacio-icon"><Droplet /></span>
            <p>No hay residentes en la residencia para este turno.</p>
          </div>
        ) : (
          <div className="cd-scroll">
            <table className="rl-table cd-table el-table">
              <thead>
                <tr>
                  <th>Residente</th>
                  {ELIMINACION.map(t => <th key={t.id}>{t.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibles.map((r, fila) => {
                  const hayVigilar = delTurno.some(e => e.residente_id === r.id && aVigilar(e).length)
                  return (
                    <tr key={r.id} className={`cd-fila${hayVigilar ? ' con-alerta' : ''}`} style={{ animationDelay: `${Math.min(fila, 14) * 35}ms` }}>
                      <td>
                        <button className="cd-persona" onClick={() => onHistorial(r)} title="Ver historial">
                          <Avatar r={r} />
                          <span>
                            <strong>{r.nombre}</strong>
                            <em>{r.habitacion ? `Hab. ${r.habitacion}` : r.tipo_servicio === 'centro_dia' ? 'Centro de día' : 'Permanente'}</em>
                          </span>
                        </button>
                      </td>
                      {ELIMINACION.map(t => (
                        <td key={t.id} className="el-celda">
                          <RegistrosTipo tipo={t.id} residente={r} fecha={fecha} turno={turno} eventos={deTipo(r.id, t.id)}
                            puedeEditar={puedeEditar} puedeEliminar={puedeEliminar} onCambio={onCambio} />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ── Panel lateral: historial de signos de un residente ───────────────────────
function HistorialSignos({ residente, onCerrar }) {
  const [filas, setFilas] = useState(null)
  const [dias, setDias] = useState(14)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setFilas(null); setError('')
    gestionFetch(`/api/gestion/controles/residente/${residente.id}?dias=${dias}`)
      .then(async r => { const d = await leerJson(r); if (!r.ok) throw new Error(d.error); if (vivo) setFilas(d) })
      .catch(e => vivo && setError(e.message || 'No se pudo cargar el historial.'))
    return () => { vivo = false }
  }, [residente.id, dias])

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCerrar])

  // Agrupa por día
  const porDia = useMemo(() => {
    const m = new Map()
    for (const f of filas || []) { if (!m.has(f.fecha)) m.set(f.fecha, []); m.get(f.fecha).push(f) }
    return [...m.entries()]
  }, [filas])

  return (
    <div className="rm-overlay" onClick={onCerrar}>
      <div className="rm-modal cd-hist" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Historial de ${residente.nombre}`}>
        <div className="rm-head">
          <Avatar r={residente} size={52} />
          <div className="rm-head-text">
            <h2>{residente.nombre}</h2>
            <p className="cd-hist-sub"><History size={14} /> Signos vitales de los últimos {dias} días</p>
          </div>
          <button className="rm-close" onClick={onCerrar} aria-label="Cerrar (Esc)"><X size={18} strokeWidth={1.75} /></button>
        </div>
        <div className="rm-body">
          <div className="cd-hist-dias">
            {[7, 14, 30].map(d => <button key={d} className={`rl-btn${dias === d ? ' on' : ''}`} onClick={() => setDias(d)}>{d} días</button>)}
          </div>
          {error && <div className="rl-error">{error}</div>}
          {!filas && !error && <div className="cd-skel" />}
          {filas && !filas.length && <p className="cd-hist-vacio">Sin tomas registradas en este periodo.</p>}
          {porDia.map(([dia, tomas]) => (
            <section key={dia} className="cd-hist-dia">
              <h3>{fechaLarga(dia)}</h3>
              {tomas.map(t => {
                const al = alertasDe(t)
                return (
                  <div key={t.id} className={`cd-hist-toma${al.length ? ' con-alerta' : ''}`}>
                    <span className="cd-hist-cuando">
                      <b>{TURNO_LABEL[t.turno]}</b> · {t.momento === 'recibir' ? 'al recibir' : 'al entregar'}
                      {t.hora && <> · {t.hora}</>}
                    </span>
                    <span className="cd-hist-valores">{resumenToma(t) || '—'}</span>
                    {al.length > 0 && <span className="cd-tags">{al.map(a => <i key={a.campo}>{a.nombre}: {a.alerta}</i>)}</span>}
                    {t.usuario_nombre && <small>Registró {t.usuario_nombre}</small>}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
