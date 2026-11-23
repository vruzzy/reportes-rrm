import { useCallback, useEffect, useMemo, useState } from 'react'
import { gestionFetch, leerJson } from './GestionApp'
import MedicacionResidente, { DiasBadge, MovimientoDialogo, HistorialDialogo } from './MedicacionResidente'
import {
  TOMAS, TOMA_LABEL, ESTADOS, DIAS_URGENTE, DIAS_POCO, nivelDias, dosisTexto, num, fechaAgota,
  fechaHoy, horaAhora, tomaSugerida, fechaLarga, moverFecha,
} from './medicacionUtil'
import {
  ChevronLeft, ChevronRight, Check, CheckCircle2, Clock, Loader2, Search, PackagePlus, ClipboardCheck,
  History, HandHeart, Undo2, AlertTriangle, Copy, Pill,
} from 'lucide-react'
import './medicacion.css'

// Medicación: dar la toma (confirmar la ronda completa), inventario y esquema por residente.

const API = '/api/gestion/medicacion'

async function pedir(url, opciones) {
  const res = await gestionFetch(url, opciones)
  const data = await leerJson(res)
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error.')
  return data
}

function Avatar({ r, size = 44 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  if (r?.foto) return <img className="rl-avatar" src={r.foto} alt="" style={style} />
  return <div className="rl-avatar rl-avatar-ini" style={style}>{r?.iniciales || '?'}</div>
}

const PESTANAS = [
  { id: 'toma',       label: 'Dar medicación' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'residentes', label: 'Por residente' },
]

export default function Medicacion({ puedeEditar }) {
  const [pestana, setPestana] = useState(() => {
    try { return sessionStorage.getItem('rrm_med_pestana') || 'toma' } catch { return 'toma' }
  })
  const [residentes, setResidentes] = useState([])
  const [inventario, setInventario] = useState(null)
  const [error, setError] = useState('')

  const cargarInventario = useCallback(async () => {
    try { setInventario(await pedir(`${API}/medicamentos`)) } catch (e) { setError(e.message) }
  }, [])

  useEffect(() => {
    pedir(`${API}/residentes`).then(setResidentes).catch(e => setError(e.message))
    cargarInventario()
  }, [cargarInventario])

  useEffect(() => {
    try { sessionStorage.setItem('rrm_med_pestana', pestana) } catch {}
  }, [pestana])

  const porAcabarse = (inventario || []).filter(m => !m.prn && m.dias_restantes != null && m.dias_restantes < DIAS_POCO).length
  const fotos = useMemo(() => Object.fromEntries(residentes.map(r => [r.id, r])), [residentes])

  return (
    <div className="md-root">
      <header className="gl-header">
        <div>
          <span className="gl-eyebrow">Residentes</span>
          <h1>Medicación</h1>
        </div>
      </header>

      <div className="rl-tabs" role="tablist">
        {PESTANAS.map(p => (
          <button key={p.id} role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? 'active' : ''} onClick={() => setPestana(p.id)}>
            {p.label}
            {p.id === 'inventario' && porAcabarse > 0 && <span className="md-tab-alerta">{porAcabarse} por acabarse</span>}
          </button>
        ))}
      </div>

      {error && <div className="rl-error" role="alert">{error}</div>}

      {pestana === 'toma' && <DarToma puedeEditar={puedeEditar} fotos={fotos} onCambio={cargarInventario} />}
      {pestana === 'inventario' && <Inventario meds={inventario} puedeEditar={puedeEditar} onCambio={cargarInventario} />}
      {pestana === 'residentes' && <PorResidente residentes={residentes} meds={inventario} puedeEditar={puedeEditar} onCambio={cargarInventario} />}
    </div>
  )
}

// ── Dar medicación ───────────────────────────────────────────────────────────
function DarToma({ puedeEditar, fotos, onCambio }) {
  const [fecha, setFecha] = useState(fechaHoy)
  const [dia, setDia] = useState(null)
  const [toma, setToma] = useState(null)
  const [datos, setDatos] = useState(null)       // { residentes, ronda }
  const [excepciones, setExcepciones] = useState({}) // residente_id → { estado, nota }
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false)
  const [error, setError] = useState('')

  const cargarDia = useCallback(async () => {
    try {
      const d = await pedir(`${API}/dia?fecha=${fecha}`)
      setDia(d)
      setToma(t => t && d.some(x => x.toma === t) ? t : tomaSugerida(d))
    } catch (e) { setError(e.message) }
  }, [fecha])

  useEffect(() => { setDia(null); cargarDia() }, [cargarDia])

  const cargarToma = useCallback(async () => {
    if (!toma) return
    setCargando(true); setError(''); setConfirmarDeshacer(false)
    try {
      const d = await pedir(`${API}/ronda?fecha=${fecha}&toma=${toma}`)
      setDatos(d)
      // Los que están "Fuera" de la residencia empiezan como "No estaba"
      setExcepciones(Object.fromEntries(d.residentes.filter(r => r.ubicacion === 'fuera').map(r => [r.residente_id, { estado: 'fuera', nota: 'Fuera de la residencia' }])))
    } catch (e) { setError(e.message) }
    finally { setCargando(false) }
  }, [fecha, toma])

  useEffect(() => { cargarToma() }, [cargarToma])

  const ronda = datos?.ronda
  const lista = datos?.residentes || []
  const estadoDe = (rid) => (ronda ? ronda.residentes.find(x => x.residente_id === rid) : excepciones[rid]) || { estado: 'dada', nota: '' }
  const cuenta = (est) => lista.filter(r => estadoDe(r.residente_id).estado === est).length

  function marcar(rid, estado) {
    setExcepciones(x => {
      const n = { ...x }
      if (estado === 'dada') delete n[rid]
      else n[rid] = { estado, nota: x[rid]?.estado === estado ? x[rid].nota : '' }
      return n
    })
  }

  async function confirmar() {
    setGuardando(true); setError('')
    try {
      await pedir(`${API}/ronda`, { method: 'POST', body: JSON.stringify({ fecha, toma, hora: horaAhora(), excepciones }) })
      await Promise.all([cargarToma(), cargarDia()])
      onCambio()
    } catch (e) {
      setError(e.message)
      cargarToma(); cargarDia()
    } finally { setGuardando(false) }
  }

  async function deshacer() {
    setGuardando(true); setError('')
    try {
      await pedir(`${API}/ronda/${ronda.id}`, { method: 'DELETE' })
      await Promise.all([cargarToma(), cargarDia()])
      onCambio()
    } catch (e) { setError(e.message) }
    finally { setGuardando(false) }
  }

  const esHoy = fecha === fechaHoy()
  const futuro = fecha > fechaHoy()

  return (
    <div className="md-toma">
      <div className="md-fecha">
        <button className="md-icono" onClick={() => setFecha(f => moverFecha(f, -1))} aria-label="Día anterior"><ChevronLeft size={18} /></button>
        <label className="md-fecha-texto">
          <span>{esHoy ? 'Hoy · ' : ''}{fechaLarga(fecha)}</span>
          <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} aria-label="Elegir fecha" />
        </label>
        <button className="md-icono" onClick={() => setFecha(f => moverFecha(f, 1))} aria-label="Día siguiente"><ChevronRight size={18} /></button>
        {!esHoy && <button className="rl-btn" onClick={() => setFecha(fechaHoy())}>Hoy</button>}
      </div>

      <div className="md-tomas">
        {(dia || TOMAS.map(t => ({ toma: t.id }))).map(d => {
          const t = TOMAS.find(x => x.id === d.toma)
          const vacia = dia && !d.residentes
          return (
            <button key={d.toma} className={`md-toma-card${toma === d.toma ? ' active' : ''}${d.ronda ? ' hecha' : ''}${vacia ? ' vacia' : ''}`}
              onClick={() => setToma(d.toma)} disabled={!dia}>
              <span className="md-toma-hora">{t.hora}</span>
              <strong>{t.label}</strong>
              <span className="md-toma-estado">
                {!dia ? '…'
                  : d.ronda ? <><CheckCircle2 size={15} /> {d.ronda.hora || 'Hecha'}</>
                  : vacia ? 'Sin medicamentos'
                  : <><Clock size={15} /> {d.residentes} residente{d.residentes === 1 ? '' : 's'}</>}
              </span>
            </button>
          )
        })}
      </div>

      {error && <div className="rl-error" role="alert">{error}</div>}

      <section className="rl-panel md-ronda">
        {cargando && !datos && <div className="md-skel" />}

        {datos && !lista.length && (
          <div className="rl-vacio">
            <div className="rl-vacio-icon"><Pill size={22} /></div>
            <p>No hay medicamentos programados en la toma de {TOMA_LABEL[toma]?.toLowerCase()}.</p>
          </div>
        )}

        {datos && lista.length > 0 && (
          <>
            {ronda ? (
              <div className="md-ronda-hecha">
                <CheckCircle2 size={22} />
                <div>
                  <strong>Toma de {TOMA_LABEL[toma].toLowerCase()} confirmada</strong>
                  <span>Por {ronda.usuario_nombre || 'alguien'}{ronda.hora ? ` a las ${ronda.hora}` : ''} · se descontó del inventario</span>
                </div>
                {puedeEditar && (confirmarDeshacer ? (
                  <div className="md-deshacer">
                    <span>¿Deshacer? Regresa el inventario.</span>
                    <button className="rl-btn" onClick={() => setConfirmarDeshacer(false)}>No</button>
                    <button className="rl-btn md-btn-peligro" onClick={deshacer} disabled={guardando}>Sí, deshacer</button>
                  </div>
                ) : (
                  <button className="rl-btn" onClick={() => setConfirmarDeshacer(true)}><Undo2 size={16} /> Deshacer</button>
                ))}
              </div>
            ) : (
              <div className="md-ronda-ayuda">
                Todos quedan como <b>Tomó</b>. Marca solo a quien rechazó o no estaba, y confirma al terminar de repartir.
              </div>
            )}

            <ul className="md-lista">
              {lista.map(r => {
                const est = estadoDe(r.residente_id)
                return (
                  <li key={r.residente_id} className={`md-fila md-fila-${est.estado}`}>
                    <Avatar r={fotos[r.residente_id] || r} />
                    <div className="md-fila-main">
                      <b>{r.nombre}</b>
                      <ul className="md-fila-meds">
                        {r.medicamentos.map(m => (
                          <li key={m.id}>
                            <span>{m.nombre}</span>
                            <em>{dosisTexto(m.dosis, m.unidad)}</em>
                            {m.existencia < m.dosis
                              ? <span className="md-dias md-dias-urgente">No alcanza</span>
                              : nivelDias(m.dias_restantes) !== 'ok' && <DiasBadge m={m} />}
                            {m.indicaciones && <small>{m.indicaciones}</small>}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="md-fila-estado">
                      {ronda || !puedeEditar ? (
                        <span className={`md-estado md-estado-${est.estado}`}>{ESTADOS.find(e => e.id === est.estado).label}</span>
                      ) : (
                        <div className="md-seg" role="group" aria-label={`Estado de ${r.nombre}`}>
                          {ESTADOS.map(e => (
                            <button key={e.id} className={est.estado === e.id ? `on md-seg-${e.id}` : ''} title={e.ayuda}
                              aria-pressed={est.estado === e.id} onClick={() => marcar(r.residente_id, e.id)}>
                              {e.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {!ronda && est.estado !== 'dada' && puedeEditar && (
                        <input className="md-input md-input-nota" placeholder="Nota (opcional)" value={est.nota}
                          onChange={e => setExcepciones(x => ({ ...x, [r.residente_id]: { ...x[r.residente_id], nota: e.target.value } }))} />
                      )}
                      {ronda && est.nota && <small className="md-fila-nota">{est.nota}</small>}
                    </div>
                  </li>
                )
              })}
            </ul>

            {!ronda && puedeEditar && (
              <div className="md-confirmar">
                <div className="md-confirmar-resumen">
                  <span><b>{cuenta('dada')}</b> tomaron</span>
                  {cuenta('rechazo') > 0 && <span><b>{cuenta('rechazo')}</b> rechazó</span>}
                  {cuenta('fuera') > 0 && <span><b>{cuenta('fuera')}</b> no estaba</span>}
                </div>
                {futuro && <span className="md-aviso"><AlertTriangle size={15} /> Es una fecha futura</span>}
                <button className="rl-btn rl-btn-primary md-btn-grande" onClick={confirmar} disabled={guardando || futuro}>
                  {guardando ? <Loader2 className="md-spin" size={18} /> : <Check size={18} />}
                  {cuenta('rechazo') + cuenta('fuera') === 0 ? 'Todos tomaron su medicación' : 'Confirmar toma'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// ── Inventario ───────────────────────────────────────────────────────────────
function Inventario({ meds, puedeEditar, onCambio }) {
  const [filtro, setFiltro] = useState('todos') // todos | urgente | poco
  const [busqueda, setBusqueda] = useState('')
  const [dialogo, setDialogo] = useState(null)
  const [copiado, setCopiado] = useState(false)

  const lista = meds || []
  const nivel = (m) => (m.prn ? 'na' : nivelDias(m.dias_restantes))
  const n = {
    urgente: lista.filter(m => nivel(m) === 'urgente').length,
    poco: lista.filter(m => nivel(m) === 'poco').length,
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return lista
      .filter(m => filtro === 'todos' || nivel(m) === filtro)
      .filter(m => !q || m.nombre.toLowerCase().includes(q) || m.residente_nombre.toLowerCase().includes(q))
      .sort((a, b) => (a.prn - b.prn) || ((a.dias_restantes ?? 1e9) - (b.dias_restantes ?? 1e9)) || a.residente_nombre.localeCompare(b.residente_nombre))
  }, [lista, filtro, busqueda])

  async function copiarFaltantes() {
    const faltan = lista.filter(m => ['urgente', 'poco'].includes(nivel(m)))
    const porRes = {}
    for (const m of faltan) (porRes[m.residente_nombre] ||= []).push(m)
    const texto = ['Medicamentos por acabarse:', ...Object.entries(porRes).map(([nombre, ms]) =>
      `\n${nombre}\n` + ms.map(m => `• ${m.nombre}: quedan ${num(m.existencia)} ${m.unidad} (${m.dias_restantes} días)`).join('\n'))].join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {}
  }

  function listo() { setDialogo(null); onCambio() }

  return (
    <>
      <div className="md-stats">
        <button className={`md-stat md-stat-urgente${filtro === 'urgente' ? ' active' : ''}`} onClick={() => setFiltro(f => f === 'urgente' ? 'todos' : 'urgente')}>
          <strong>{n.urgente}</strong><span>Se acaban en menos de {DIAS_URGENTE} días</span>
        </button>
        <button className={`md-stat md-stat-poco${filtro === 'poco' ? ' active' : ''}`} onClick={() => setFiltro(f => f === 'poco' ? 'todos' : 'poco')}>
          <strong>{n.poco}</strong><span>Entre {DIAS_URGENTE} y {DIAS_POCO} días</span>
        </button>
        <button className={`md-stat${filtro === 'todos' ? ' active' : ''}`} onClick={() => setFiltro('todos')}>
          <strong>{lista.length}</strong><span>Medicamentos activos</span>
        </button>
      </div>

      <section className="rl-panel">
        <div className="rl-toolbar">
          <label className="rl-search">
            <Search size={16} />
            <input placeholder="Buscar residente o medicamento" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </label>
          {n.urgente + n.poco > 0 && (
            <button className="rl-btn md-ml-auto" onClick={copiarFaltantes} title="Copia la lista para mandarla por WhatsApp">
              {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar lista de faltantes'}
            </button>
          )}
        </div>

        {!meds && <div className="md-skel" />}
        {meds && !visibles.length && (
          <div className="rl-vacio"><div className="rl-vacio-icon"><Pill size={22} /></div>
            <p>{lista.length ? 'Nada coincide con el filtro.' : 'Todavía no hay medicamentos. Agrégalos en la pestaña "Por residente".'}</p>
          </div>
        )}

        {visibles.length > 0 && (
          <div className="md-scroll">
            <table className="md-tabla">
              <thead>
                <tr>
                  <th>Residente</th><th>Medicamento</th><th className="md-r">Existencia</th>
                  <th className="md-r">Al día</th><th>Alcanza para</th><th />
                </tr>
              </thead>
              <tbody>
                {visibles.map(m => (
                  <tr key={m.id}>
                    <td><b>{m.residente_nombre}</b></td>
                    <td>
                      {m.nombre}
                      <small>{dosisTexto(m.dosis, m.unidad)} · {m.prn ? 'solo si hace falta' : m.tomas.map(t => TOMA_LABEL[t]).join(', ')}</small>
                    </td>
                    <td className="md-r"><b>{num(m.existencia)}</b> <small className="md-inline">{m.unidad}</small></td>
                    <td className="md-r">{m.prn ? '—' : num(m.consumo_diario)}</td>
                    <td><DiasBadge m={m} />{fechaAgota(m) && <small>hasta el {fechaAgota(m)}</small>}</td>
                    <td className="md-acc">
                      {puedeEditar && (
                        <>
                          {m.prn && <button className="rl-btn" onClick={() => setDialogo({ tipo: 'prn', med: m })}><HandHeart size={16} /> Dar</button>}
                          <button className="rl-btn" onClick={() => setDialogo({ tipo: 'entrada', med: m })}><PackagePlus size={16} /> Llegó</button>
                          <button className="md-icono" onClick={() => setDialogo({ tipo: 'ajuste', med: m })} title="Contar existencia" aria-label="Contar existencia"><ClipboardCheck size={17} /></button>
                        </>
                      )}
                      <button className="md-icono" onClick={() => setDialogo({ tipo: 'historial', med: m })} title="Movimientos" aria-label="Movimientos"><History size={17} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {['entrada', 'ajuste', 'prn'].includes(dialogo?.tipo) && (
        <MovimientoDialogo medicamento={dialogo.med} tipo={dialogo.tipo} onClose={() => setDialogo(null)} onSaved={listo} />
      )}
      {dialogo?.tipo === 'historial' && <HistorialDialogo medicamento={dialogo.med} onClose={() => setDialogo(null)} />}
    </>
  )
}

// ── Por residente ────────────────────────────────────────────────────────────
function PorResidente({ residentes, meds, puedeEditar, onCambio }) {
  const [sel, setSel] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  const conteo = useMemo(() => {
    const c = {}
    for (const m of meds || []) {
      const x = (c[m.residente_id] ||= { n: 0, alerta: false })
      x.n++
      if (!m.prn && nivelDias(m.dias_restantes) === 'urgente') x.alerta = true
    }
    return c
  }, [meds])

  const visibles = residentes.filter(r => r.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
  const actual = residentes.find(r => r.id === sel) || null

  return (
    <div className="md-porres">
      <aside className="rl-panel md-porres-lista">
        <label className="rl-search md-porres-buscar">
          <Search size={16} />
          <input placeholder="Buscar residente" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </label>
        <ul>
          {visibles.map(r => (
            <li key={r.id}>
              <button className={sel === r.id ? 'active' : ''} onClick={() => setSel(r.id)}>
                <Avatar r={r} size={40} />
                <span className="md-porres-nombre">
                  {r.nombre}
                  <small>{conteo[r.id] ? `${conteo[r.id].n} medicamento${conteo[r.id].n === 1 ? '' : 's'}` : 'Sin medicamentos'}</small>
                </span>
                {conteo[r.id]?.alerta && <AlertTriangle size={16} className="md-alerta-ico" aria-label="Algo se acaba pronto" />}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="rl-panel md-porres-detalle">
        {actual ? (
          <>
            <div className="md-porres-head">
              <Avatar r={actual} size={64} />
              <div>
                <h2>{actual.nombre}</h2>
                <span>{actual.ubicacion === 'fuera' ? 'Fuera de la residencia' : 'En residencia'}</span>
              </div>
            </div>
            <MedicacionResidente key={actual.id} residente={actual} puedeEditar={puedeEditar} onCambio={onCambio} />
          </>
        ) : (
          <div className="rl-vacio"><div className="rl-vacio-icon"><Pill size={22} /></div><p>Elige un residente para ver y editar su medicación.</p></div>
        )}
      </section>
    </div>
  )
}
