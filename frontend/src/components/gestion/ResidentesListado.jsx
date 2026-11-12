import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gestionFetch } from './GestionApp'
import ResidenteExpedienteModal from './ResidenteExpedienteModal'
import {
  Plus, Search, Download, Columns3, Phone, MessageCircle, Pencil, BedDouble, DoorOpen, Cake, FileWarning, X,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ChevronsUpDown,
} from 'lucide-react'

// Columnas opcionales (Nombre, Ubicación y acciones siempre se muestran)
const COLUMNAS = [
  { id: 'nacimiento', label: 'Fecha de nacimiento' },
  { id: 'familiar',   label: 'Familiar' },
  { id: 'mutualista', label: 'Mutualista' },
  { id: 'emergencia', label: 'Emergencia' },
  { id: 'cliente',    label: 'Tipo de cliente' },
  { id: 'curp',       label: 'CURP' },
]
const COLS_DEFECTO = ['nacimiento', 'familiar', 'mutualista', 'curp', 'emergencia']
const COLS_KEY = 'rrm_gestion_columnas_v3'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const MUTUALISTA_LABEL = {
  no_posee: 'No posee', imss: 'IMSS', issste: 'ISSSTE', seguro_privado: 'Seguro privado', otro: 'Otro',
}
const TIPO_LABEL = { residencia_permanente: 'Permanente', centro_dia: 'Centro de día' }

// ── Utilidades ────────────────────────────────────────────────────────────────
function formatoFecha(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function edad(iso) {
  if (!iso) return null
  const n = new Date(iso + 'T00:00:00'), h = new Date()
  let e = h.getFullYear() - n.getFullYear()
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--
  return e
}
function cumpleEsteMes(iso) {
  return !!iso && Number(iso.slice(5, 7)) === new Date().getMonth() + 1
}
function quitarAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function telefonoFamiliar(r) {
  return r.familiar_tel || r.whatsapp || ''
}
function linkWhatsApp(tel) {
  const d = String(tel).replace(/\D/g, '')
  if (!d) return ''
  return `https://wa.me/${d.length === 10 ? '52' + d : d}`
}

/** Qué tan completo está el expediente (0–1) y qué falta */
export function completitud(r) {
  const checks = [
    ['Foto', r.foto],
    ['Fecha de nacimiento', r.fecha_nacimiento],
    ['CURP', r.curp],
    ['Familiar', r.familiar],
    ['Tel. familiar', telefonoFamiliar(r)],
    ['Emergencia', r.emergencia],
  ]
  const faltan = checks.filter(([, v]) => !v).map(([k]) => k)
  return { pct: (checks.length - faltan.length) / checks.length, faltan }
}

const PAG_KEY = 'rrm_gestion_por_pagina'
const OPCIONES_PAGINA = [10, 25, 50, 0] // 0 = todos
function leerPorPagina() {
  try {
    const v = Number(localStorage.getItem(PAG_KEY))
    if (OPCIONES_PAGINA.includes(v) && localStorage.getItem(PAG_KEY) !== null) return v
  } catch {}
  return 10
}

function leerCols() {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY))
    if (Array.isArray(v)) return v
  } catch {}
  return COLS_DEFECTO
}

/** Contador animado */
function useCountUp(valor, ms = 600) {
  const [n, setN] = useState(0)
  const desde = useRef(0)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setN(valor); desde.current = valor; return }
    const ini = desde.current, t0 = performance.now()
    let raf
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / ms)
      const v = Math.round(ini + (valor - ini) * (1 - Math.pow(1 - p, 3)))
      setN(v)
      if (p < 1) raf = requestAnimationFrame(paso)
      else desde.current = valor
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [valor, ms])
  return n
}

// ── Piezas visuales ───────────────────────────────────────────────────────────
export function Avatar({ r, size = 84 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  if (r.foto) return <img className="rl-avatar" src={r.foto} alt="" style={style} />
  return <div className="rl-avatar rl-avatar-ini" style={style}>{r.iniciales}</div>
}

export function Icono({ d: C, size = 18 }) {
  return <C size={size} strokeWidth={1.75} aria-hidden="true" />
}

const IC = {
  mas: Plus, buscar: Search, bajar: Download, columnas: Columns3, tel: Phone, chat: MessageCircle,
  editar: Pencil, casa: BedDouble, salida: DoorOpen, pastel: Cake, alerta: FileWarning, cerrar: X,
}

function Stat({ tono, etiqueta, detalle, valor, activo, onClick, i }) {
  const n = useCountUp(valor, 700)
  return (
    <button className={`rl-stat rl-stat-${tono}${activo ? ' active' : ''}`} onClick={onClick}
      aria-pressed={activo} style={{ '--i': i }}>
      <div className="rl-stat-text">
        <strong>{etiqueta}</strong>
        <span>{detalle}</span>
      </div>
      <div className="rl-stat-num" key={valor}>{n}</div>
    </button>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ResidentesListado() {
  const [pestana, setPestana] = useState('residentes')
  const [residentes, setResidentes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [ubic, setUbic] = useState('todos')         // todos | residencia | fuera
  const [especial, setEspecial] = useState(null)    // null | cumple | incompletos
  const [orden, setOrden] = useState(1)
  const [cols, setCols] = useState(leerCols)
  const [porPagina, setPorPagina] = useState(leerPorPagina)
  const [pagina, setPagina] = useState(1)
  const [menuCols, setMenuCols] = useState(false)
  const [editando, setEditando] = useState(null)    // residente | 'nuevo' | null
  const [toasts, setToasts] = useState([])
  const buscarRef = useRef(null)

  useEffect(() => { cargar() }, [])
  useEffect(() => { try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)) } catch {} }, [cols])

  // Atajos: "/" buscar, "n" nuevo residente
  useEffect(() => {
    function onKey(e) {
      const escribiendo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)
      if (escribiendo || editando || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); buscarRef.current?.focus() }
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); setEditando('nuevo') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editando])

  const avisar = useCallback((texto, accion) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t.slice(-2), { id, texto, accion }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }, [])
  const cerrarToast = (id) => setToasts(t => t.filter(x => x.id !== id))

  async function cargar() {
    setCargando(true)
    setError('')
    try {
      const res = await gestionFetch('/api/gestion/residentes')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los residentes.')
      setResidentes(data)
    } catch (err) {
      setError(err.message || 'Error de conexión.')
    } finally {
      setCargando(false)
    }
  }

  async function guardarUbicacion(r, ubicacion) {
    setResidentes(lista => lista.map(x => x.id === r.id ? { ...x, ubicacion } : x))
    try {
      const res = await gestionFetch(`/api/gestion/residentes/${r.id}/ubicacion`, {
        method: 'PATCH', body: JSON.stringify({ ubicacion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return true
    } catch (err) {
      setResidentes(lista => lista.map(x => x.id === r.id ? { ...x, ubicacion: r.ubicacion } : x))
      avisar(err.message || 'No se pudo cambiar la ubicación.')
      return false
    }
  }

  async function cambiarUbicacion(e, r) {
    e.stopPropagation()
    const nueva = r.ubicacion === 'fuera' ? 'residencia' : 'fuera'
    const ok = await guardarUbicacion(r, nueva)
    if (ok) {
      const nombre = r.nombre.split(' ')[0]
      avisar(
        nueva === 'fuera' ? `${nombre} marcado fuera del centro` : `${nombre} de regreso en la residencia`,
        { label: 'Deshacer', fn: () => guardarUbicacion({ ...r, ubicacion: nueva }, r.ubicacion) },
      )
    }
  }

  function guardado(r, esNuevo) {
    setResidentes(lista => lista.some(x => x.id === r.id) ? lista.map(x => x.id === r.id ? r : x) : [...lista, r])
    setEditando(null)
    avisar(esNuevo ? `${r.nombre} agregado` : 'Expediente guardado')
  }

  // ── Datos derivados ──
  const total = residentes.length
  const enResidencia = residentes.filter(r => r.ubicacion !== 'fuera').length
  const fuera = total - enResidencia

  const filas = useMemo(() => {
    const q = quitarAcentos(busqueda)
    return residentes
      .filter(r => ubic === 'todos' || (ubic === 'fuera' ? r.ubicacion === 'fuera' : r.ubicacion !== 'fuera'))
      .filter(r => especial !== 'cumple' || cumpleEsteMes(r.fecha_nacimiento))
      .filter(r => especial !== 'incompletos' || completitud(r).pct < 1)
      .filter(r => !q || quitarAcentos(r.nombre).includes(q) || quitarAcentos(r.familiar).includes(q))
      .sort((a, b) => orden * a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
  }, [residentes, busqueda, ubic, especial, orden])

  // ── Paginación ──
  const paginas = porPagina ? Math.max(1, Math.ceil(filas.length / porPagina)) : 1
  const pag = Math.min(pagina, paginas)
  const visibles = porPagina ? filas.slice((pag - 1) * porPagina, pag * porPagina) : filas
  useEffect(() => { setPagina(1) }, [busqueda, ubic, especial, orden, porPagina])
  function cambiarPorPagina(v) {
    setPorPagina(v)
    try { localStorage.setItem(PAG_KEY, String(v)) } catch {}
  }

  const ver = (id) => cols.includes(id)
  const SEGMENTOS = [
    { id: 'todos',      label: 'Todos',         n: total },
    { id: 'residencia', label: 'En residencia', n: enResidencia },
    { id: 'fuera',      label: 'Fuera',         n: fuera },
  ]
  const segIdx = SEGMENTOS.findIndex(s => s.id === ubic)
  const hayFiltros = ubic !== 'todos' || especial || busqueda

  function limpiarFiltros() {
    setUbic('todos'); setEspecial(null); setBusqueda('')
  }

  return (
    <>
      <header className="gl-header">
        <div>
          <p className="gl-eyebrow">Residentes</p>
          <h1>Listado de residentes</h1>
        </div>
        <button className="rl-btn rl-btn-primary" onClick={() => setEditando('nuevo')} title="Agregar residente (tecla N)">
          <Icono d={IC.mas} /> Agregar residente
        </button>
      </header>

      <div className="rl-tabs" role="tablist">
        <button role="tab" aria-selected={pestana === 'residentes'} className={pestana === 'residentes' ? 'active' : ''} onClick={() => setPestana('residentes')}>
          Residentes <span>{total}</span>
        </button>
        <button role="tab" aria-selected={pestana === 'preadmision'} className={pestana === 'preadmision' ? 'active' : ''} onClick={() => setPestana('preadmision')}>
          Pre-admisión
        </button>
      </div>

      {pestana === 'preadmision' ? (
        <div className="rl-panel rl-vacio">
          <span className="gp-pill">Próximamente</span>
          <p>Aquí podrás registrar prospectos antes de su ingreso.</p>
        </div>
      ) : (
        <>
          <section className="rl-stats">
            <Stat i={0} tono="dentro" etiqueta="En residencia" detalle="Residentes en el centro" valor={enResidencia}
              activo={ubic === 'residencia'} onClick={() => { setEspecial(null); setUbic(u => u === 'residencia' ? 'todos' : 'residencia') }} />
            <Stat i={1} tono="fuera" etiqueta="Fuera de la residencia" detalle="Residentes fuera del centro" valor={fuera}
              activo={ubic === 'fuera'} onClick={() => { setEspecial(null); setUbic(u => u === 'fuera' ? 'todos' : 'fuera') }} />
            <Stat i={2} tono="total" etiqueta="Total" detalle="Residentes registrados" valor={total}
              activo={ubic === 'todos' && !especial} onClick={() => { setEspecial(null); setUbic('todos') }} />
          </section>

          <div className="rl-panel">
            <div className="rl-toolbar">
              <div className="rl-search">
                <Icono d={IC.buscar} />
                <input ref={buscarRef} type="search" placeholder="Buscar residente o familiar…" value={busqueda}
                  onChange={e => setBusqueda(e.target.value)} aria-label="Buscar"
                  onKeyDown={e => e.key === 'Escape' && (setBusqueda(''), e.currentTarget.blur())} />
                {!busqueda && <kbd>/</kbd>}
              </div>

              <div className="rl-segment" role="group" aria-label="Filtrar por ubicación"
                style={{ '--seg-i': segIdx, '--seg-n': SEGMENTOS.length }}>
                <span className="rl-segment-pill" aria-hidden="true" />
                {SEGMENTOS.map(s => (
                  <button key={s.id} className={ubic === s.id ? 'active' : ''} onClick={() => setUbic(s.id)}>
                    {s.label} <span>{s.n}</span>
                  </button>
                ))}
              </div>

              <div className="rl-tools">
                <button className="rl-icon-btn" onClick={() => { exportarCSV(filas); avisar(`${filas.length} residentes exportados`) }}
                  disabled={!filas.length} data-tip="Exportar a Excel" aria-label="Exportar">
                  <Icono d={IC.bajar} />
                </button>
                <div className="rl-cols-wrap">
                  <button className={`rl-icon-btn${menuCols ? ' on' : ''}`} onClick={() => setMenuCols(m => !m)} data-tip="Columnas" aria-label="Columnas">
                    <Icono d={IC.columnas} />
                  </button>
                  {menuCols && (
                    <>
                      <div className="rl-cols-backdrop" onClick={() => setMenuCols(false)} />
                      <div className="rl-cols-menu">
                        <div className="rl-cols-title">Columnas visibles</div>
                        {COLUMNAS.map(c => (
                          <label key={c.id}>
                            <span className={`rl-switch${ver(c.id) ? ' on' : ''}`} />
                            <input type="checkbox" checked={ver(c.id)} hidden
                              onChange={() => setCols(v => v.includes(c.id) ? v.filter(x => x !== c.id) : [...v, c.id])} />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {hayFiltros && (
              <div className="rl-chips">
                <span>{filas.length} de {total}</span>
                {especial === 'cumple' && <button className="rl-chip" onClick={() => setEspecial(null)}>Cumpleaños del mes <Icono d={IC.cerrar} /></button>}
                {especial === 'incompletos' && <button className="rl-chip" onClick={() => setEspecial(null)}>Expedientes incompletos <Icono d={IC.cerrar} /></button>}
                {ubic !== 'todos' && <button className="rl-chip" onClick={() => setUbic('todos')}>{ubic === 'fuera' ? 'Fuera del centro' : 'En residencia'} <Icono d={IC.cerrar} /></button>}
                {busqueda && <button className="rl-chip" onClick={() => setBusqueda('')}>“{busqueda}” <Icono d={IC.cerrar} /></button>}
                <button className="rl-link" onClick={limpiarFiltros}>Limpiar todo</button>
              </div>
            )}

            {error && <div className="rl-error" role="alert">{error} <button className="rl-link" onClick={cargar}>Reintentar</button></div>}

            {cargando ? (
              <div className="rl-skeleton">{[0, 1, 2, 3, 4].map(i => <div key={i} style={{ animationDelay: `${i * 80}ms` }} />)}</div>
            ) : !filas.length ? (
              <div className="rl-vacio">
                <div className="rl-vacio-icon"><Icono d={total ? IC.buscar : IC.mas} /></div>
                <p>{total ? 'Ningún residente coincide con los filtros.' : 'Aún no hay residentes registrados.'}</p>
                {total
                  ? <button className="rl-btn" onClick={limpiarFiltros}>Limpiar filtros</button>
                  : <button className="rl-btn rl-btn-primary" onClick={() => setEditando('nuevo')}>Agregar el primero</button>}
              </div>
            ) : (
              <table className="rl-table">
                <thead>
                  <tr>
                    <th>
                      <button className="rl-th-sort" onClick={() => setOrden(o => -o)}>
                        Nombre <span className={orden === 1 ? '' : 'desc'}>↑</span>
                      </button>
                    </th>
                    {ver('nacimiento') && <th className="rl-c-nac">Nacimiento</th>}
                    {ver('familiar')   && <th>Familiar</th>}
                    {ver('mutualista') && <th>Mutualista</th>}
                    {ver('emergencia') && <th className="rl-c-emergencia">Emergencia</th>}
                    {ver('cliente')    && <th className="rl-c-cliente">Cliente</th>}
                    {ver('curp')       && <th className="rl-c-curp">CURP</th>}
                    <th>Ubicación</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody key={`${ubic}-${especial}-${orden}-${pag}-${porPagina}`}>
                  {visibles.map((r, i) => {
                    const tel = telefonoFamiliar(r)
                    const wa = linkWhatsApp(tel)
                    const comp = completitud(r)
                    const e = edad(r.fecha_nacimiento)
                    const cumple = cumpleEsteMes(r.fecha_nacimiento)
                    return (
                      <tr key={r.id} onClick={() => setEditando(r)} tabIndex={0}
                        onKeyDown={ev => ev.key === 'Enter' && setEditando(r)}
                        style={{ animationDelay: `${Math.min(i, 14) * 45}ms` }}>
                        <td>
                          <div className="rl-person">
                            <div className="rl-avatar-wrap">
                              <Avatar r={r} />
                              {comp.pct < 1 && <span className="rl-avatar-dot" title={`Falta: ${comp.faltan.join(', ')}`} />}
                            </div>
                            <div>
                              <strong>{r.nombre}</strong>
                              <span>
                                {[e != null ? `${e} años` : null, TIPO_LABEL[r.tipo_servicio]].filter(Boolean).join(' · ')}
                                {cumple && <em className="rl-tag-cumple">Cumple {Number(r.fecha_nacimiento.slice(8, 10))} {MESES[new Date().getMonth()]}</em>}
                              </span>
                            </div>
                          </div>
                        </td>
                        {ver('nacimiento') && (
                          <td className="rl-c-nac">
                            {r.fecha_nacimiento ? <b>{r.fecha_nacimiento.split('-').reverse().join('/')}</b> : <i>—</i>}
                          </td>
                        )}
                        {ver('familiar') && (
                          <td className="rl-c-familiar">
                            {r.familiar ? <><b>{r.familiar}</b>{tel && <span>{tel}</span>}</> : <i>Sin registrar</i>}
                          </td>
                        )}
                        {ver('mutualista') && (
                          <td className="rl-c-mutualista">
                            {r.mutualista && r.mutualista !== 'no_posee'
                              ? <><b>{MUTUALISTA_LABEL[r.mutualista]}</b>{r.mutualista_socio && <span>Socio {r.mutualista_socio}</span>}</>
                              : <i>No posee</i>}
                          </td>
                        )}
                        {ver('emergencia') && (
                          <td className="rl-c-emergencia">
                            {r.emergencia ? <><b>{r.emergencia}</b>{r.emergencia_tel && <span>{r.emergencia_tel}</span>}</> : <i>Sin registrar</i>}
                          </td>
                        )}
                        {ver('cliente') && <td className="rl-c-cliente"><b>{r.tipo_cliente === 'convenio' ? 'Convenio' : 'Privado'}</b></td>}
                        {ver('curp')    && <td className="rl-c-curp rl-mono">{r.curp || <i>—</i>}</td>}
                        <td className="rl-c-ubic">
                          <button key={r.ubicacion} className={`rl-status ${r.ubicacion === 'fuera' ? 'fuera' : 'dentro'}`}
                            onClick={ev => cambiarUbicacion(ev, r)} data-tip="Toca para cambiar">
                            {r.ubicacion === 'fuera' ? 'Fuera del centro' : 'En residencia'}
                          </button>
                        </td>
                        <td className="rl-c-acc">
                          <div className="rl-quick" onClick={ev => ev.stopPropagation()}>
                            {tel && <a className="rl-quick-btn" href={`tel:${tel}`} data-tip={`Llamar a ${r.familiar || 'familiar'}`} aria-label="Llamar"><Icono d={IC.tel} /></a>}
                            {wa && <a className="rl-quick-btn wa" href={wa} target="_blank" rel="noreferrer" data-tip="WhatsApp" aria-label="WhatsApp"><Icono d={IC.chat} /></a>}
                            <button className="rl-quick-btn" onClick={() => setEditando(r)} data-tip="Editar" aria-label="Editar"><Icono d={IC.editar} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {!cargando && filas.length > 0 && (
              <div className="rl-pager">
                <span className="rl-pager-info">
                  {porPagina
                    ? `${(pag - 1) * porPagina + 1}–${Math.min(pag * porPagina, filas.length)} de ${filas.length}`
                    : `${filas.length} residentes`}
                </span>
                <label className="rl-pager-size">Filas por página
                  <span className="rl-select">
                    <select value={porPagina} onChange={e => cambiarPorPagina(Number(e.target.value))}>
                      {OPCIONES_PAGINA.map(v => <option key={v} value={v}>{v || 'Todos'}</option>)}
                    </select>
                    <Icono d={ChevronsUpDown} size={14} />
                  </span>
                </label>
                <strong className="rl-pager-page">Página {pag} de {paginas}</strong>
                <div className="rl-pager-nav">
                  <button className="rl-icon-btn" onClick={() => setPagina(1)} disabled={pag === 1} aria-label="Primera página"><Icono d={ChevronsLeft} /></button>
                  <button className="rl-icon-btn" onClick={() => setPagina(pag - 1)} disabled={pag === 1} aria-label="Página anterior"><Icono d={ChevronLeft} /></button>
                  <button className="rl-icon-btn" onClick={() => setPagina(pag + 1)} disabled={pag === paginas} aria-label="Página siguiente"><Icono d={ChevronRight} /></button>
                  <button className="rl-icon-btn" onClick={() => setPagina(paginas)} disabled={pag === paginas} aria-label="Última página"><Icono d={ChevronsRight} /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {editando && (
        <ResidenteExpedienteModal
          residente={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
          onSaved={(r) => guardado(r, editando === 'nuevo')}
        />
      )}

      <div className="rl-toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="rl-toast">
            <span>{t.texto}</span>
            {t.accion && <button onClick={() => { t.accion.fn(); cerrarToast(t.id) }}>{t.accion.label}</button>}
            <button className="rl-toast-x" onClick={() => cerrarToast(t.id)} aria-label="Cerrar"><Icono d={IC.cerrar} /></button>
            <i className="rl-toast-timer" />
          </div>
        ))}
      </div>
    </>
  )
}

function exportarCSV(filas) {
  const enc = ['Nombre', 'Fecha nacimiento', 'Edad', 'Tipo de residente', 'Tipo de cliente', 'Mutualista',
    'No. socio', 'Tel. mutualista', 'CURP', 'Emergencia', 'Tel. emergencia', 'Familiar', 'Tel. familiar', 'Ubicación']
  const datos = filas.map(r => [
    r.nombre, formatoFecha(r.fecha_nacimiento), edad(r.fecha_nacimiento) ?? '', TIPO_LABEL[r.tipo_servicio] || '',
    r.tipo_cliente === 'convenio' ? 'Convenio' : 'Privado', MUTUALISTA_LABEL[r.mutualista] || '',
    r.mutualista_socio, r.mutualista_tel, r.curp, r.emergencia, r.emergencia_tel,
    r.familiar, telefonoFamiliar(r), r.ubicacion === 'fuera' ? 'Fuera del centro' : 'En residencia',
  ])
  const csv = [enc, ...datos]
    .map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), {
    href: url, download: `residentes_${new Date().toISOString().slice(0, 10)}.csv`,
  })
  a.click()
  URL.revokeObjectURL(url)
}
