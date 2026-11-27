import { useCallback, useEffect, useMemo, useState } from 'react'
import { pedir, enviar, fechaLarga, moverFecha, num, unidad } from './medicacionUtil'
import MedicacionResidente, { DiasBadge } from './MedicacionResidente'
import Catalogo, { Dialogo } from './CatalogoMedicamentos'
import {
  ChevronLeft, ChevronRight, Search, ShieldAlert, Clock, Loader2, Check, Plus, Trash2, PackagePlus, ClipboardCheck,
  History, AlertTriangle, Pill, Info, Sparkles, LogOut,
} from 'lucide-react'
import './medicacion.css'

// Medicación — Fase 1: catálogo único, prescripciones con versiones, rondas configurables,
// alergias y existencias. La confirmación de rondas llega en la Fase 2.

function Avatar({ r, size = 44 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  if (r?.foto) return <img className="rl-avatar" src={r.foto} alt="" style={style} />
  return <div className="rl-avatar rl-avatar-ini" style={style}>{r?.iniciales || '?'}</div>
}

const PESTANAS = [
  { id: 'ronda', label: 'Ronda' },
  { id: 'residentes', label: 'Por residente' },
  { id: 'existencias', label: 'Existencias' },
  { id: 'catalogo', label: 'Catálogo' },
]

export default function Medicacion() {
  const [pestana, setPestana] = useState(() => { try { return (PESTANAS.some(p => p.id === sessionStorage.getItem('rrm_med_pestana2')) && sessionStorage.getItem('rrm_med_pestana2')) || 'residentes' } catch { return 'residentes' } })
  const [opciones, setOpciones] = useState(null)
  const [rondas, setRondas] = useState([])
  const [residentes, setResidentes] = useState([])
  const [alertas, setAlertas] = useState(0)
  const [error, setError] = useState('')

  const cargarResidentes = useCallback(() => pedir('residentes').then(setResidentes).catch(e => setError(e.message)), [])
  const cargarAlertas = useCallback(() => pedir('existencias').then(l => setAlertas(l.filter(x => x.estado !== 'ok').length)).catch(() => {}), [])
  useEffect(() => {
    Promise.all([pedir('opciones'), pedir('rondas')])
      .then(([o, r]) => { setOpciones(o); setRondas(r.rondas) }).catch(e => setError(e.message))
    cargarResidentes(); cargarAlertas()
  }, [cargarResidentes, cargarAlertas])
  useEffect(() => { try { sessionStorage.setItem('rrm_med_pestana2', pestana) } catch {} }, [pestana])

  return (
    <div className="md-root">
      <header className="gl-header">
        <div><span className="gl-eyebrow">Residentes</span><h1>Medicación</h1></div>
        {opciones && !opciones.puede_prescribir && <span className="rl-solo-ver">Recetas: solo lectura</span>}
      </header>

      <div className="rl-tabs" role="tablist">
        {PESTANAS.map(p => (
          <button key={p.id} role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? 'active' : ''} onClick={() => setPestana(p.id)}>
            {p.label}
            {p.id === 'existencias' && alertas > 0 && <span className="md-tab-alerta">{alertas} por revisar</span>}
          </button>
        ))}
      </div>

      {error && <div className="rl-error" role="alert">{error}</div>}
      {!opciones ? <div className="rl-panel"><div className="md-skel" /></div> : (
        pestana === 'ronda' ? <VistaRonda rondas={rondas} opciones={opciones} />
        : pestana === 'residentes' ? <PorResidente residentes={residentes} opciones={opciones} rondas={rondas}
            onCambio={(r) => { if (r) setResidentes(l => l.map(x => (x.id === r.id ? { ...x, ...r } : x))); cargarResidentes(); cargarAlertas() }} />
        : pestana === 'existencias' ? <Existencias opciones={opciones} onCambio={cargarAlertas} />
        : <Catalogo opciones={opciones} />
      )}
    </div>
  )
}

// ── Ronda (vista previa: la confirmación llega en la Fase 2) ─────────────────
function VistaRonda({ rondas, opciones }) {
  const [fecha, setFecha] = useState(opciones.hoy)
  const [rondaId, setRondaId] = useState(null)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    pedir(`dia?fecha=${fecha}${rondaId ? `&ronda_id=${rondaId}` : ''}`)
      .then(d => { setDatos(d); if (!rondaId) setRondaId(d.ronda.id) }).catch(e => setError(e.message))
  }, [fecha, rondaId])

  const presentes = (datos?.residentes || []).filter(r => r.ubicacion !== 'fuera')
  const fuera = (datos?.residentes || []).filter(r => r.ubicacion === 'fuera')
  const tomas = presentes.reduce((n, r) => n + r.tomas.length, 0)

  return (
    <>
      <div className="md-fecha">
        <button className="md-icono" onClick={() => setFecha(f => moverFecha(f, -1))} aria-label="Día anterior"><ChevronLeft /></button>
        <label className="md-fecha-texto">{fechaLarga(fecha)}{fecha === opciones.hoy ? ' · hoy' : ''}
          <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} aria-label="Elegir fecha" />
        </label>
        <button className="md-icono" onClick={() => setFecha(f => moverFecha(f, 1))} aria-label="Día siguiente"><ChevronRight /></button>
        {fecha !== opciones.hoy && <button className="rl-link" onClick={() => setFecha(opciones.hoy)}>Hoy</button>}
      </div>

      <div className="md-tomas mr-rondas" style={{ gridTemplateColumns: `repeat(${Math.max(rondas.filter(r => r.activa).length, 1)}, 1fr)` }}>
        {rondas.filter(r => r.activa).map(r => (
          <button key={r.id} className={`md-toma-card${r.id === rondaId ? ' active' : ''}`} onClick={() => setRondaId(r.id)}>
            <strong>{r.nombre}</strong>
            <span className="md-toma-hora">{r.detalle} · {r.hora_inicio}–{r.hora_fin}</span>
          </button>
        ))}
      </div>

      <div className="mr-aviso"><Info size={17} />
        <span>Vista previa de lo que toca en esta ronda según las prescripciones. El botón para <b>confirmar la ronda</b> y marcar excepciones llega en la siguiente fase.</span>
      </div>

      {error && <div className="rl-error" role="alert">{error}</div>}
      <div className="rl-panel md-ronda">
        {!datos ? <div className="md-skel" /> : !datos.residentes.length ? (
          <div className="rl-vacio"><span className="rl-vacio-icon"><Pill /></span><p>No hay medicamentos programados en esta ronda.</p></div>
        ) : (<>
          <div className="md-ronda-ayuda"><b>{presentes.length}</b> {presentes.length === 1 ? 'residente' : 'residentes'} · <b>{tomas}</b> {tomas === 1 ? 'toma' : 'tomas'}
            {fuera.length > 0 && <> · {fuera.length} fuera de la residencia</>}</div>
          <ul className="md-lista">
            {[...presentes, ...fuera].map(r => (
              <li key={r.id} className={`md-fila mr-fila${r.ubicacion === 'fuera' ? ' mr-fuera' : ''}`}>
                <Avatar r={r} size={48} />
                <div className="md-fila-main">
                  <b>{r.nombre}</b>{r.habitacion && <span className="mr-hab"> · Hab. {r.habitacion}</span>}
                  {r.alergias && <span className="mr-alergia" title={`Alergias: ${r.alergias}`}><ShieldAlert size={14} /> {r.alergias}</span>}
                  {r.ubicacion === 'fuera' && <span className="mr-fuera-txt"><LogOut size={14} /> Fuera de la residencia: no entra en la ronda</span>}
                  <ul className="md-fila-meds">
                    {r.tomas.map((t, i) => (
                      <li key={`${t.id}-${i}`}>
                        <span>{t.hora && <em className="mr-h">{t.hora}</em>} {t.nombre}</span>
                        <em>{t.dosis ? `${num(t.dosis)} ${unidad(opciones, t.unidad_dosis, t.dosis)}` : 'según escala'}</em>
                        {t.controlado ? <span className="pt-tag ctl"><ShieldAlert size={12} /> Controlado</span> : null}
                        {t.es_nueva ? <span className="pt-tag nuevo"><Sparkles size={12} /> {t.reemplaza_a_id ? 'Cambió' : 'Nuevo'}</span> : null}
                        {!t.en_pastillero || t.tipo === 'variable' ? <span className="pt-tag">Registro individual</span> : null}
                        {t.indicaciones && <small>{t.indicaciones}</small>}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </>)}
      </div>
    </>
  )
}

// ── Por residente ────────────────────────────────────────────────────────────
function PorResidente({ residentes, opciones, rondas, onCambio }) {
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState('')
  const lista = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? residentes.filter(r => r.nombre.toLowerCase().includes(n)) : residentes
  }, [residentes, q])
  const actual = residentes.find(r => r.id === sel) || null

  return (
    <div className="md-porres">
      <div className="rl-panel md-porres-lista">
        <div className="rl-search md-porres-buscar">
          <Search />
          <input type="search" placeholder="Buscar residente…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar residente" />
        </div>
        <ul>
          {lista.map(r => (
            <li key={r.id}>
              <button className={r.id === sel ? 'active' : ''} onClick={() => setSel(r.id)}>
                <Avatar r={r} size={40} />
                <span className="md-porres-nombre">{r.nombre}
                  <small>{r.activas ? `${r.activas} ${r.activas === 1 ? 'medicamento' : 'medicamentos'}` : 'Sin medicamentos'}{r.ubicacion === 'fuera' ? ' · Fuera' : ''}</small>
                </span>
                {r.alergias && <ShieldAlert size={16} className="md-alerta-ico" aria-label="Tiene alergias" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rl-panel md-porres-detalle">
        {!actual ? (
          <div className="rl-vacio"><span className="rl-vacio-icon"><Pill /></span><p>Elige un residente para ver y cargar sus medicamentos.</p></div>
        ) : (<>
          <div className="md-porres-head">
            <Avatar r={actual} size={64} />
            <div><h2>{actual.nombre}</h2><span>{actual.habitacion ? `Hab. ${actual.habitacion}` : ''}{actual.ubicacion === 'fuera' ? ' · Fuera de la residencia' : ''}</span></div>
          </div>
          <MedicacionResidente key={actual.id} residente={actual} opciones={opciones} rondas={rondas} onCambio={onCambio} />
        </>)}
      </div>
    </div>
  )
}

// ── Existencias ──────────────────────────────────────────────────────────────
const FILTROS = [
  { id: 'todas', label: 'Todas' }, { id: 'alerta', label: 'Por agotarse o sin existencia' }, { id: 'centro', label: 'De la residencia' },
]

function Existencias({ opciones, onCambio }) {
  const [filas, setFilas] = useState(null)
  const [filtro, setFiltro] = useState('todas')
  const [q, setQ] = useState('')
  const [mov, setMov] = useState(null)      // { fila, tipo }
  const [hist, setHist] = useState(null)
  const [error, setError] = useState('')
  const cargar = useCallback(() => pedir('existencias').then(setFilas).catch(e => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (filas || []).filter(f => (filtro === 'todas' || (filtro === 'alerta' ? f.estado !== 'ok' : !f.residente_id))
      && (!n || `${f.medicamento.nombre} ${f.residente?.nombre || 'residencia'}`.toLowerCase().includes(n)))
  }, [filas, filtro, q])
  const sinStock = (filas || []).filter(f => f.estado === 'sin_stock').length
  const porAgotarse = (filas || []).filter(f => f.estado === 'por_agotarse').length

  return (
    <>
      <div className="md-stats">
        <button className={`md-stat md-stat-urgente${filtro === 'alerta' ? ' active' : ''}`} onClick={() => setFiltro('alerta')}><strong>{sinStock}</strong> sin existencia con prescripción activa</button>
        <button className={`md-stat md-stat-poco${filtro === 'alerta' ? ' active' : ''}`} onClick={() => setFiltro('alerta')}><strong>{porAgotarse}</strong> se acaban en 7 días o menos</button>
        <button className={`md-stat${filtro === 'todas' ? ' active' : ''}`} onClick={() => setFiltro('todas')}><strong>{(filas || []).length}</strong> medicamentos en inventario</button>
      </div>
      <div className="rl-panel">
        <div className="rl-toolbar">
          <div className="rl-search" style={{ marginLeft: 0 }}>
            <Search />
            <input type="search" placeholder="Buscar medicamento o residente…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar" />
          </div>
          <div className="md-seg">
            {FILTROS.map(f => <button key={f.id} className={filtro === f.id ? 'on' : ''} onClick={() => setFiltro(f.id)}>{f.label}</button>)}
          </div>
        </div>
        {error && <div className="rl-error" role="alert">{error}</div>}
        {filas == null ? <div className="md-skel" /> : !visibles.length ? (
          <div className="rl-vacio"><span className="rl-vacio-icon"><PackagePlus /></span><p>{filas.length ? 'Nada coincide con el filtro.' : 'Aún no hay medicamentos con existencias. Se agregan al cargar prescripciones.'}</p></div>
        ) : (
          <div className="md-scroll">
            <table className="md-tabla">
              <thead><tr><th>Medicamento</th><th>De quién</th><th>Hay</th><th>Consumo</th><th>Alcanza</th><th /></tr></thead>
              <tbody>
                {visibles.map(f => (
                  <tr key={`${f.medicamento_id}-${f.residente_id}`}>
                    <td><b>{f.medicamento.nombre}</b><small>{f.usan.length > 1 || !f.residente_id ? f.usan.join(', ') : ''}</small></td>
                    <td>{f.residente ? f.residente.nombre : 'Residencia'}</td>
                    <td className={f.existencia < 0 ? 'md-neg' : ''}>{f.existencia_texto}</td>
                    <td>{f.consumo_texto}</td>
                    <td><DiasBadge dias={f.dias_restantes} existencia={f.existencia} enUso={f.en_uso > 0} /></td>
                    <td className="md-acc">
                      {opciones.puede_operar && <button className="rl-btn" onClick={() => setMov({ fila: f, tipo: 'entrada' })}><PackagePlus size={15} /> Llegó</button>}
                      {opciones.puede_prescribir && <button className="rl-btn" onClick={() => setMov({ fila: f, tipo: 'ajuste_inventario' })}><ClipboardCheck size={15} /> Contar</button>}
                      <button className="md-icono" onClick={() => setHist(f)} title="Movimientos" aria-label="Ver movimientos"><History /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {mov && <DialogoMovimiento opciones={opciones} fila={mov.fila} tipo={mov.tipo} onCerrar={() => setMov(null)} onHecho={() => { setMov(null); cargar(); onCambio() }} />}
      {hist && <DialogoMovimientos opciones={opciones} fila={hist} onCerrar={() => setHist(null)} />}
    </>
  )
}

function DialogoMovimiento({ opciones, fila, tipo, onCerrar, onHecho }) {
  const med = fila.medicamento
  const conPresentacion = med.unidad_stock !== med.unidad_dosis
  const [en, setEn] = useState(tipo === 'entrada' && conPresentacion ? 'stock' : 'dosis')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState(tipo === 'ajuste_inventario' ? 'Conteo físico' : '')
  const [caducidad, setCaducidad] = useState('')
  const [lote, setLote] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const u = (x, n) => unidad(opciones, x, n)
  const n = Number(String(cantidad).replace(',', '.')) || 0
  const enDosis = en === 'stock' ? n * med.factor_conversion : n

  async function guardar() {
    setGuardando(true); setError('')
    try {
      await enviar('existencias/movimiento', 'POST', { medicamento_id: fila.medicamento_id, residente_id: fila.residente_id, tipo, cantidad, en, motivo, caducidad, lote })
      onHecho()
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }
  const titulo = tipo === 'entrada' ? `Llegó ${med.nombre}` : `Contar ${med.nombre}`
  return (
    <Dialogo titulo={titulo} sub={fila.residente ? `De ${fila.residente.nombre} (familia)` : 'De la residencia'} onCerrar={onCerrar}
      pie={<>
        <button className="rl-btn" onClick={onCerrar}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando || cantidad === ''}>
          {guardando ? <Loader2 className="md-spin" size={16} /> : <Check size={16} />} {tipo === 'entrada' ? 'Registrar entrada' : 'Guardar conteo'}
        </button>
      </>}>
      <p className="md-nota">Hay ahora: <b>{fila.existencia_texto}</b></p>
      {conPresentacion && (
        <div className="md-seg">
          <button className={en === 'stock' ? 'on' : ''} onClick={() => setEn('stock')}>En {u(med.unidad_stock, 2)}</button>
          <button className={en === 'dosis' ? 'on' : ''} onClick={() => setEn('dosis')}>En {u(med.unidad_dosis, 2)}</button>
        </div>
      )}
      <label className="md-label">{tipo === 'entrada' ? '¿Cuánto llegó?' : '¿Cuánto hay al contar?'}
        <input className="md-input md-input-num" inputMode="decimal" autoFocus value={cantidad}
          onChange={e => setCantidad(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
        {en === 'stock' && n > 0 && <small className="md-nota">= {num(enDosis)} {u(med.unidad_dosis, enDosis)}</small>}
      </label>
      {tipo === 'entrada' && (
        <div className="md-grid">
          <label>Caducidad <em>(recomendado)</em><input className="md-input" type="date" value={caducidad} onChange={e => setCaducidad(e.target.value)} /></label>
          <label>Lote <em>(opcional)</em><input className="md-input" value={lote} onChange={e => setLote(e.target.value)} /></label>
        </div>
      )}
      {tipo === 'ajuste_inventario' && (
        <>
          {cantidad !== '' && <p className="md-nota">Diferencia con el sistema: <b>{num(Math.round((enDosis - fila.existencia) * 1000) / 1000)} {u(med.unidad_dosis, 2)}</b></p>}
          <label className="md-label">Motivo<input className="md-input" value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        </>
      )}
      {error && <div className="rl-error" role="alert">{error}</div>}
    </Dialogo>
  )
}

const TIPO_MOV = { entrada: 'Entrada', salida_toma: 'Toma', devolucion: 'Devolución', desecho: 'Salida', ajuste_inventario: 'Conteo', prestamo_salida: 'Préstamo (salida)', prestamo_entrada: 'Préstamo (entrada)' }

export function DialogoMovimientos({ fila, onCerrar }) {
  const [movs, setMovs] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    pedir(`existencias/movimientos?medicamento_id=${fila.medicamento_id}${fila.residente_id ? `&residente_id=${fila.residente_id}` : ''}`).then(setMovs).catch(e => setError(e.message))
  }, [fila])
  return (
    <Dialogo ancho titulo={`Movimientos de ${fila.medicamento.nombre}`} sub={fila.residente ? fila.residente.nombre : 'Residencia'} onCerrar={onCerrar}>
      {error && <div className="rl-error">{error}</div>}
      {!movs && !error && <div className="md-skel" />}
      {movs && !movs.length && <p className="md-nota">Sin movimientos.</p>}
      {movs && movs.length > 0 && (
        <table className="md-tabla md-tabla-mov">
          <thead><tr><th>Fecha</th><th>Movimiento</th><th className="md-r">Cantidad</th><th>Quién</th></tr></thead>
          <tbody>
            {movs.map(m => (
              <tr key={m.id}>
                <td>{new Date(m.creado_en.replace(' ', 'T') + 'Z').toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{TIPO_MOV[m.tipo] || m.tipo}{m.motivo && <small>{m.motivo}</small>}{m.caducidad && <small>Caduca {m.caducidad}</small>}</td>
                <td className={`md-r ${m.cantidad < 0 ? 'md-neg' : 'md-pos'}`}>{m.cantidad < 0 ? '−' : '+'}{m.cantidad_texto}</td>
                <td>{m.usuario_nombre || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialogo>
  )
}

// ── Configuración de rondas ──────────────────────────────────────────────────
/** Rondas de medicación (se editan en Configuración → Medicación). */
export function ConfigRondas({ rondas, puedeEditar, onGuardado }) {
  const [lista, setLista] = useState(() => rondas.filter(r => r.activa).map(r => ({ ...r })))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const set = (i, k, v) => { setOk(false); setLista(l => l.map((r, j) => (j === i ? { ...r, [k]: v } : r))) }

  async function guardar() {
    setGuardando(true); setError(''); setOk(false)
    try { const r = await enviar('rondas', 'PUT', { rondas: lista }); onGuardado(r.rondas); setLista(r.rondas.filter(x => x.activa).map(x => ({ ...x }))); setOk(true) }
    catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  return (
    <div className="rl-panel mr-config">
      <p className="md-nota">Las rondas son los momentos en que se reparte la medicación. No deben traslaparse. Cada toma con hora debe caer dentro de su ronda.</p>
      <table className="md-tabla">
        <thead><tr><th>Ronda</th><th>Detalle</th><th>Desde</th><th>Hasta</th>{puedeEditar && <th />}</tr></thead>
        <tbody>
          {lista.map((r, i) => (
            <tr key={r.id || `n${i}`}>
              <td><input className="md-input" value={r.nombre} disabled={!puedeEditar} onChange={e => set(i, 'nombre', e.target.value)} aria-label="Nombre" /></td>
              <td><input className="md-input" value={r.detalle} disabled={!puedeEditar} onChange={e => set(i, 'detalle', e.target.value)} aria-label="Detalle" placeholder="Ej. Desayuno" /></td>
              <td><input className="md-input" type="time" value={r.hora_inicio} disabled={!puedeEditar} onChange={e => set(i, 'hora_inicio', e.target.value)} aria-label="Desde" /></td>
              <td><input className="md-input" type="time" value={r.hora_fin} disabled={!puedeEditar} onChange={e => set(i, 'hora_fin', e.target.value)} aria-label="Hasta" /></td>
              {puedeEditar && <td className="md-acc">{lista.length > 1 && <button className="md-icono" onClick={() => setLista(l => l.filter((_, j) => j !== i))} aria-label="Quitar ronda" title="Quitar"><Trash2 /></button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="rl-error" role="alert"><AlertTriangle size={16} /> {error}</div>}
      {puedeEditar && (
        <div className="mr-config-acc">
          <button className="rl-btn" onClick={() => setLista(l => [...l, { nombre: '', detalle: '', hora_inicio: '', hora_fin: '', activa: 1 }])}><Plus size={15} /> Agregar ronda</button>
          {ok && <span className="md-nota"><Check size={15} /> Guardado</span>}
          <button className="rl-btn rl-btn-primary md-ml-auto" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 className="md-spin" size={16} /> : <Check size={16} />} Guardar rondas</button>
        </div>
      )}
    </div>
  )
}
