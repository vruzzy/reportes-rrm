import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gestionFetch } from './GestionApp'
import { pedir, enviar, fechaCorta, unidad, num } from './medicacionUtil'
import { DialogoMovimientos } from './Medicacion'
import MedicacionResidente, { DiasBadge } from './MedicacionResidente'
import { generarMedicacionPDF } from './medicacionPDF'
import { generarReportePDF } from './reportePDF'
import { CAMPOS, alertasDe, TURNO_LABEL, ELIM } from './signosVitales'
import {
  ArrowLeft, Info, Pill, Package, HeartPulse, ClipboardList, FolderOpen, Pencil, Download, Loader2, Upload, FileText, Image as ImageIcon,
  File, Trash2, ExternalLink, User, Phone, ShieldPlus, Home, CalendarDays, AlertTriangle, Check, ChevronDown, ChevronUp, Search, ArrowUpDown, ArrowDownToLine, ArrowUpFromLine, Save, History,
} from 'lucide-react'
import './medicacion.css'
import './actividades.css'
import './personal.css'
import './perfil.css'

// Perfil completo de un residente: tarjeta con sus datos a la izquierda y pestañas con todo lo suyo
// (información, medicación con PDF, stock, controles diarios, reportes y documentos del expediente).

const TIPO_SERVICIO = { residencia_permanente: 'Residencia permanente', centro_dia: 'Centro de día' }
const MUTUALISTA = { no_posee: 'No posee', imss: 'IMSS', issste: 'ISSSTE', seguro_privado: 'Seguro privado', otro: 'Otro' }
const fecha = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '')
function edad(iso) {
  if (!iso) return null
  const n = new Date(iso + 'T00:00:00'), h = new Date()
  let e = h.getFullYear() - n.getFullYear()
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--
  return e
}
const iniciales = (n = '') => { const p = n.trim().split(/\s+/).filter(Boolean); return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : (p[0] || '').slice(0, 2)).toUpperCase() }
const tamano = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export default function ResidentePerfil({ residente: r, permisos = {}, acciones = {}, onVolver, onEditar }) {
  const tiene = (mod, acc) => (acciones[mod] || []).includes(acc)
  const tabs = [
    { id: 'info', label: 'Información', icon: Info },
    permisos.medicacion && { id: 'medicacion', label: 'Medicación', icon: Pill },
    permisos.medicacion && { id: 'stock', label: 'Stock', icon: Package },
    permisos.controles && { id: 'controles', label: 'Controles diarios', icon: HeartPulse },
    permisos.reportes && { id: 'reportes', label: 'Reportes', icon: ClipboardList },
    permisos.documentos && { id: 'documentos', label: 'Documentos', icon: FolderOpen },
  ].filter(Boolean)
  const [tab, setTab] = useState(() => { try { const t = sessionStorage.getItem('rrm_perfil_tab'); return tabs.some(x => x.id === t) ? t : 'info' } catch { return 'info' } })
  useEffect(() => { try { sessionStorage.setItem('rrm_perfil_tab', tab) } catch {} }, [tab])
  useEffect(() => { window.scrollTo?.(0, 0) }, [r.id])
  const e = edad(r.fecha_nacimiento)
  const alergias = String(r.alergias || '').trim()
  const actual = tabs.find(t => t.id === tab)

  return (
    <div className="rp-root">
      <button className="rl-link rp-volver" onClick={onVolver}><ArrowLeft size={16} /> Listado de residentes</button>
      <div className="rp-layout">
        <aside className="rp-card">
          <div className="rp-foto">{r.foto ? <img src={r.foto} alt="" /> : <span>{iniciales(r.nombre)}</span>}</div>
          <h1 className="rp-nombre">{r.nombre}</h1>
          <span className={`rl-status ${r.ubicacion === 'fuera' ? 'fuera' : 'dentro'} rp-ubic`}>{r.ubicacion === 'fuera' ? 'Fuera del centro' : 'En residencia'}</span>
          <dl className="rp-datos">
            {e != null && <><dt>Edad</dt><dd>{e} años</dd></>}
            {r.fecha_nacimiento && <><dt>Nacimiento</dt><dd>{fecha(r.fecha_nacimiento)}</dd></>}
            {r.fecha_ingreso && <><dt>Ingreso</dt><dd>{fecha(r.fecha_ingreso)}</dd></>}
            {r.habitacion && <><dt>Habitación</dt><dd>{r.habitacion}</dd></>}
            <dt>Servicio</dt><dd>{TIPO_SERVICIO[r.tipo_servicio] || 'Residencia permanente'}</dd>
          </dl>
          <div className={`rp-alergias${alergias ? ' hay' : ''}`}><AlertTriangle size={16} /> {alergias ? <span><b>Alergias:</b> {alergias}</span> : 'Sin alergias registradas'}</div>
          {tiene('listado', 'editar') && <button className="rl-btn rp-editar" onClick={onEditar}><Pencil size={16} /> Editar datos y foto</button>}
        </aside>

        <section className="rp-main">
          <nav className="rp-tabs" role="tablist">
            {tabs.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                <t.icon size={17} strokeWidth={1.75} aria-hidden="true" /> {t.label}
              </button>
            ))}
          </nav>
          <h2 className="rp-titulo">{actual?.label}</h2>
          <div key={tab}>
            {tab === 'info' ? <Informacion r={r} verDinero={tiene('listado', 'editar')} />
              : tab === 'medicacion' ? <Medicacion r={r} />
              : tab === 'stock' ? <Stock r={r} puedeMover={tiene('medicacion', 'editar')} />
              : tab === 'controles' ? <Controles r={r} />
              : tab === 'reportes' ? <Reportes r={r} />
              : <Documentos r={r} puedeSubir={tiene('documentos', 'crear')} puedeEditar={tiene('documentos', 'editar')} puedeBorrar={tiene('documentos', 'eliminar')} />}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Información ──────────────────────────────────────────────────────────────
function Dato({ icon: I, label, children }) {
  return <div className="rp-dato"><I size={16} aria-hidden="true" /><b>{label}:</b> <span>{children || <i>—</i>}</span></div>
}
function Informacion({ r, verDinero }) {
  return (
    <div className="rp-secciones">
      <section className="rp-sec">
        <h3>Datos personales</h3>
        <Dato icon={User} label="Nombre completo">{r.nombre}</Dato>
        <Dato icon={CalendarDays} label="Fecha de nacimiento">{r.fecha_nacimiento && `${fecha(r.fecha_nacimiento)} (${edad(r.fecha_nacimiento)} años)`}</Dato>
        <Dato icon={FileText} label="CURP"><span className="rl-mono">{r.curp}</span></Dato>
      </section>
      <section className="rp-sec">
        <h3>Estancia</h3>
        <Dato icon={Home} label="Servicio">{TIPO_SERVICIO[r.tipo_servicio] || 'Residencia permanente'}</Dato>
        <Dato icon={CalendarDays} label="Fecha de ingreso">{fecha(r.fecha_ingreso)}</Dato>
        <Dato icon={Home} label="Habitación">{r.habitacion}</Dato>
        <Dato icon={User} label="Tipo de cliente">{r.tipo_cliente === 'convenio' ? 'Convenio' : 'Privado'}</Dato>
        {verDinero && <Dato icon={FileText} label="Mensualidad">{r.mensualidad ? Number(r.mensualidad).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : ''}{r.dia_pago ? ` · paga el día ${r.dia_pago}` : ''}</Dato>}
      </section>
      <section className="rp-sec">
        <h3>Contactos</h3>
        <Dato icon={User} label="Familiar responsable">{r.familiar}</Dato>
        <Dato icon={Phone} label="Teléfono del familiar">{(r.familiar_tel || r.whatsapp) && <a href={`tel:${r.familiar_tel || r.whatsapp}`}>{r.familiar_tel || r.whatsapp}</a>}</Dato>
        <Dato icon={User} label="Contacto de emergencia">{r.emergencia}</Dato>
        <Dato icon={Phone} label="Teléfono de emergencia">{r.emergencia_tel && <a href={`tel:${r.emergencia_tel}`}>{r.emergencia_tel}</a>}</Dato>
      </section>
      <section className="rp-sec">
        <h3>Mutualista o seguro</h3>
        <Dato icon={ShieldPlus} label="Mutualista">{MUTUALISTA[r.mutualista] || 'No posee'}</Dato>
        {r.mutualista && r.mutualista !== 'no_posee' && <>
          <Dato icon={FileText} label="N.º de socio">{r.mutualista_socio}</Dato>
          <Dato icon={Phone} label="Teléfono">{r.mutualista_tel}</Dato>
        </>}
      </section>
    </div>
  )
}

// ── Medicación (con PDF) ─────────────────────────────────────────────────────
function Medicacion({ r }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [haciendo, setHaciendo] = useState(false)
  const cargar = useCallback(() => Promise.all([pedir('opciones'), pedir('rondas'), pedir('residentes')])
    .then(([opciones, rondas, residentes]) => setDatos({ opciones, rondas: rondas.rondas, res: residentes.find(x => x.id === r.id) || r }))
    .catch(e => setError(e.message)), [r])
  useEffect(() => { cargar() }, [cargar])
  async function pdf() {
    setHaciendo(true); setError('')
    try {
      const lista = await pedir(`prescripciones?residente_id=${r.id}&estado=todas`)
      await generarMedicacionPDF({ residente: { ...r, ...datos.res }, prescripciones: lista, rondas: datos.rondas })
    } catch (e) { setError(e.message || 'No se pudo hacer el PDF.') } finally { setHaciendo(false) }
  }
  if (!datos) return error ? <div className="rl-error">{error}</div> : <div className="md-skel" />
  return (
    <>
      <div className="rp-barra">
        <span className="ac-sutil">Lo que toma cada día por ronda y lo que se da solo si hace falta.</span>
        <button className="rl-btn rl-btn-primary" onClick={pdf} disabled={haciendo}>{haciendo ? <Loader2 className="cd-spin" size={16} /> : <Download size={16} />} Descargar PDF</button>
      </div>
      {error && <div className="rl-error">{error}</div>}
      <MedicacionResidente residente={datos.res} opciones={datos.opciones} rondas={datos.rondas} onCambio={(x) => x && setDatos(d => ({ ...d, res: { ...d.res, ...x } }))} />
    </>
  )
}

// ── Stock ────────────────────────────────────────────────────────────────────
// Tabla de sus medicamentos: cuánto hay, para cuántos días alcanza y un campo para cargar o descontar
// (uno por uno o todos de una vez con "Guardar todo").
const MOTIVOS_SALIDA = ['Se tiró o caducó', 'Se cayó o se perdió', 'Se devolvió a la familia', 'Se llevó a un traslado', 'Otro']

function FinBadge({ f }) {
  if (f.existencia <= 0) return <span className="rp-fin agotado">Agotado</span>
  if (!f.consumo_diario) return <span className="rp-fin nada">{f.en_uso ? 'Solo si hace falta' : 'Sin uso'}</span>
  const d = Math.floor(f.dias_restantes ?? 0)
  return <span className={`rp-fin ${d <= 3 ? 'agotado' : d <= 7 ? 'pronto' : 'ok'}`}>{d <= 0 ? 'Se acaba hoy' : `Quedan ${d} ${d === 1 ? 'día' : 'días'}`}</span>
}

function Stock({ r, puedeMover }) {
  const [filas, setFilas] = useState(null)
  const [opciones, setOpciones] = useState(null)
  const [presc, setPresc] = useState([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modo, setModo] = useState('entrada')        // entrada | salida
  const [motivo, setMotivo] = useState(MOTIVOS_SALIDA[0])
  const [cant, setCant] = useState({})               // clave → texto
  const [en, setEn] = useState({})                   // clave → 'dosis' | 'stock'
  const [guardando, setGuardando] = useState({})     // clave → true
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState('todos')      // todos | bajos | agotados
  const [orden, setOrden] = useState({ col: 'nombre', asc: true })
  const [historial, setHistorial] = useState(null)

  const cargar = useCallback(() => Promise.all([pedir('existencias'), pedir('opciones'), pedir(`prescripciones?residente_id=${r.id}&estado=todas`)])
    .then(([l, o, p]) => {
      setOpciones(o); setPresc(p)
      setFilas(l.filter(f => f.residente_id === r.id || (!f.residente_id && (f.usan || []).includes(r.nombre))))
    }).catch(e => setError(e.message)), [r.id, r.nombre])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 3000); return () => clearTimeout(t) }, [aviso])

  const clave = (f) => `${f.medicamento_id}|${f.residente_id || 'c'}`
  const u = (x, n) => unidad(opciones, x, n)
  // Estado de su receta de ese medicamento (para marcar "Suspendida")
  const estadoReceta = useMemo(() => {
    const m = {}
    for (const p of presc) {
      const prev = m[p.medicamento_id]
      if (p.estado === 'activa') m[p.medicamento_id] = { activa: true, prn: (prev?.prn ?? true) && p.tipo === 'prn' }
      else if (!prev?.activa && (p.estado === 'suspendida' || p.estado === 'terminada')) m[p.medicamento_id] = { ...prev, estado: prev?.estado === 'suspendida' ? 'suspendida' : p.estado }
    }
    return m
  }, [presc])

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    let l = (filas || []).filter(f => !q || f.medicamento.nombre.toLowerCase().includes(q))
    if (filtro === 'agotados') l = l.filter(f => f.existencia <= 0)
    if (filtro === 'bajos') l = l.filter(f => f.existencia <= 0 || (f.consumo_diario && (f.dias_restantes ?? 0) <= 7))
    const val = (f) => orden.col === 'cantidad' ? f.existencia : orden.col === 'fin' ? (f.existencia <= 0 ? -1 : f.consumo_diario ? f.dias_restantes : 99999) : f.medicamento.nombre.toLowerCase()
    return [...l].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (orden.asc ? 1 : -1))
  }, [filas, buscar, filtro, orden])
  const pendientes = visibles.filter(f => Number(cant[clave(f)]) > 0)

  async function mover(f) {
    const k = clave(f), n = cant[k]
    if (!(Number(n) > 0)) return true
    setGuardando(g => ({ ...g, [k]: true })); setError('')
    try {
      const x = await enviar('existencias/movimiento', 'POST', {
        medicamento_id: f.medicamento_id, residente_id: f.residente_id, tipo: modo === 'entrada' ? 'entrada' : 'desecho',
        cantidad: n, en: en[k] || 'dosis', motivo: modo === 'salida' ? motivo : '',
      })
      setFilas(l => l.map(y => (clave(y) === k ? { ...y, existencia: x.existencia, existencia_texto: x.existencia_texto,
        dias_restantes: y.consumo_diario ? Math.round((x.existencia / y.consumo_diario) * 10) / 10 : y.dias_restantes } : y)))
      setCant(c => ({ ...c, [k]: '' }))
      return true
    } catch (e) { setError(`${f.medicamento.nombre}: ${e.message}`); return false }
    finally { setGuardando(g => ({ ...g, [k]: false })) }
  }
  async function guardarTodo() {
    let n = 0
    for (const f of pendientes) if (await mover(f)) n++
    if (n) setAviso(`${modo === 'entrada' ? 'Se cargaron' : 'Se descontaron'} ${n} ${n === 1 ? 'medicamento' : 'medicamentos'}.`)
    cargar()
  }
  function exportar() {
    const enc = ['Medicamento', 'Es de', 'Cantidad actual', 'Consumo', 'Alcanza para (días)', 'Receta']
    const lin = visibles.map(f => [f.medicamento.nombre, f.residente_id ? 'Familia (suyo)' : 'Residencia', f.existencia_texto, f.consumo_texto,
      f.existencia <= 0 ? 'Agotado' : f.consumo_diario ? Math.floor(f.dias_restantes ?? 0) : '', estadoReceta[f.medicamento_id]?.activa ? 'Activa' : (estadoReceta[f.medicamento_id]?.estado || '')])
    const texto = [enc, ...lin].map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }))
    a.download = `stock_${r.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_')}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  const ordenar = (col) => setOrden(o => ({ col, asc: o.col === col ? !o.asc : true }))
  const Th = ({ col, children }) => (
    <th className="rp-th-orden"><button onClick={() => ordenar(col)}>{children} <ArrowUpDown size={13} className={orden.col === col ? 'on' : ''} /></button></th>
  )

  if (!filas) return error ? <div className="rl-error">{error}</div> : <div className="md-skel" />
  if (!filas.length) return <p className="ac-vacio">No tiene medicamentos en existencia ni en uso. Cuando se le agregue una receta, aquí aparece.</p>
  return (
    <>
      <div className="rp-stock-barra">
        <label className="pm-filtro rp-buscar"><Search size={16} /><input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar medicamento…" aria-label="Buscar medicamento" /></label>
        <div className="md-seg rp-seg">
          {[['todos', 'Ver todo'], ['bajos', 'Por acabarse'], ['agotados', 'Agotados']].map(([id, l]) => <button key={id} className={filtro === id ? 'on' : ''} onClick={() => setFiltro(id)}>{l}</button>)}
        </div>
        {puedeMover && (
          <div className="rp-modo" role="radiogroup" aria-label="Qué vas a hacer">
            <button role="radio" aria-checked={modo === 'entrada'} className={`entrada${modo === 'entrada' ? ' on' : ''}`} onClick={() => setModo('entrada')}><ArrowDownToLine size={16} /> Cargar (entrada)</button>
            <button role="radio" aria-checked={modo === 'salida'} className={`salida${modo === 'salida' ? ' on' : ''}`} onClick={() => setModo('salida')}><ArrowUpFromLine size={16} /> Descontar (salida)</button>
          </div>
        )}
        {puedeMover && <button className="rl-btn rl-btn-primary" onClick={guardarTodo} disabled={!pendientes.length || Object.values(guardando).some(Boolean)}><Save size={16} /> Guardar todo{pendientes.length ? ` (${pendientes.length})` : ''}</button>}
        <button className="rl-btn" onClick={exportar}><Download size={16} /> Exportar</button>
      </div>
      {puedeMover && modo === 'salida' && (
        <div className="rp-motivo"><span>Motivo de la salida:</span>
          <select className="md-input" value={motivo} onChange={e => setMotivo(e.target.value)}>{MOTIVOS_SALIDA.map(m => <option key={m}>{m}</option>)}</select>
          <span className="ac-sutil">Las tomas de la ronda se descuentan solas; esto es para lo que sale por otro motivo.</span>
        </div>
      )}
      {aviso && <div className="rd-aviso"><Check size={16} /> {aviso}</div>}
      {error && <div className="rl-error">{error}</div>}
      <div className="pe-tabla-wrap">
        <table className="pe-tabla rp-tabla rp-stock">
          <thead>
            <tr>
              <Th col="nombre">Medicamento</Th><th>Forma</th><th>Es de</th><Th col="cantidad">Cantidad actual</Th>
              {puedeMover && <th>{modo === 'entrada' ? 'Agregar cantidad' : 'Descontar cantidad'}</th>}
              <Th col="fin">Se acaba</Th><th>Solo si hace falta</th><th>Historial</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(f => {
              const k = clave(f), m = f.medicamento, rec = estadoReceta[f.medicamento_id]
              const dos = m.unidad_stock !== m.unidad_dosis
              const unidadIn = (en[k] || 'dosis') === 'stock' ? m.unidad_stock : m.unidad_dosis
              return (
                <tr key={k} className={!rec?.activa && rec?.estado ? 'rp-inactiva' : ''}>
                  <th className="pe-nombre" scope="row">{m.nombre}
                    {!rec?.activa && rec?.estado && <span className={`rp-receta ${rec.estado}`}>{rec.estado === 'suspendida' ? 'Suspendida' : 'Terminada'}</span>}
                  </th>
                  <td>{opciones?.formas?.find(x => x.id === m.forma)?.label || m.forma || 'Medicamento'}</td>
                  <td>{f.residente_id ? 'Familia (suyo)' : 'Residencia'}</td>
                  <td><b className="rp-cant">{num(Math.round(f.existencia * 10) / 10)}</b><em className="rp-unidad">{u(m.unidad_dosis, f.existencia)}</em></td>
                  {puedeMover && (
                    <td>
                      <div className="rp-agregar">
                        <input className="md-input" inputMode="decimal" value={cant[k] || ''} placeholder="0" aria-label={`Cantidad de ${m.nombre}`}
                          onChange={e => setCant(c => ({ ...c, [k]: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') }))}
                          onKeyDown={e => e.key === 'Enter' && mover(f).then(ok => ok && cargar())} />
                        <button className={`rl-icon-btn rp-guardar-fila ${modo}`} onClick={() => mover(f).then(ok => ok && cargar())} disabled={!(Number(cant[k]) > 0) || guardando[k]}
                          title={modo === 'entrada' ? 'Cargar' : 'Descontar'} aria-label={`${modo === 'entrada' ? 'Cargar' : 'Descontar'} ${m.nombre}`}>
                          {guardando[k] ? <Loader2 className="cd-spin" size={16} /> : <Save size={16} />}
                        </button>
                      </div>
                      {dos ? (
                        <select className="rp-en" value={en[k] || 'dosis'} onChange={e => setEn(x => ({ ...x, [k]: e.target.value }))} aria-label="En qué unidad">
                          <option value="dosis">en {u(m.unidad_dosis, 2)}</option>
                          <option value="stock">en {u(m.unidad_stock, 2)} (de {num(m.factor_conversion)} {u(m.unidad_dosis, 2)})</option>
                        </select>
                      ) : <em className="rp-unidad">{u(unidadIn, 2)}</em>}
                    </td>
                  )}
                  <td><FinBadge f={f} /></td>
                  <td>{rec?.activa && rec.prn ? 'Sí' : 'No'}</td>
                  <td><button className="rl-icon-btn" onClick={() => setHistorial(f)} title="Ver movimientos" aria-label={`Movimientos de ${m.nombre}`}><History size={17} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="ac-sutil rp-nota">Lo que trae la familia es solo suyo; lo de la residencia se comparte con otros residentes que lo usan. "Se acaba" se calcula con lo que toma al día según sus recetas activas.</p>
      {historial && <DialogoMovimientos fila={historial} onCerrar={() => setHistorial(null)} />}
    </>
  )
}

// ── Controles diarios ────────────────────────────────────────────────────────
function Controles({ r }) {
  const [dias, setDias] = useState(14)
  const [signos, setSignos] = useState(null)
  const [elim, setElim] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setSignos(null); setElim(null); setError('')
    Promise.all([pedir(`/api/gestion/controles/residente/${r.id}?dias=${dias}`), pedir(`/api/gestion/controles/eliminacion/residente/${r.id}?dias=${dias}`)])
      .then(([s, e]) => { setSignos(s); setElim(e) }).catch(e => setError(e.message))
  }, [r.id, dias])
  const valor = (t, c) => (c.id === 'ta' ? (t.ta_sistolica && t.ta_diastolica ? `${t.ta_sistolica}/${t.ta_diastolica}` : '') : t[c.id] ?? '')
  const elimPorDia = useMemo(() => {
    const m = new Map()
    for (const x of elim || []) { if (!m.has(x.fecha)) m.set(x.fecha, []); m.get(x.fecha).push(x) }
    return [...m.entries()]
  }, [elim])
  return (
    <>
      <div className="rp-barra">
        <div className="pe-pinceles-btns">{[7, 14, 30].map(d => <button key={d} className={`rd-hora${dias === d ? ' activo' : ''}`} onClick={() => setDias(d)}>Últimos {d} días</button>)}</div>
      </div>
      {error && <div className="rl-error">{error}</div>}
      <h3 className="rp-sub">Signos vitales</h3>
      {!signos ? <div className="md-skel" /> : !signos.length ? <p className="ac-vacio">Sin tomas en estos días.</p> : (
        <div className="pe-tabla-wrap">
          <table className="pe-tabla rp-tabla">
            <thead><tr><th className="pe-th-nombre">Día</th><th>Turno</th>{CAMPOS.map(c => <th key={c.id}>{c.label}<em>{c.unidad}</em></th>)}</tr></thead>
            <tbody>
              {signos.map(t => {
                const al = new Set(alertasDe(t).map(a => a.campo === 'ta_sistolica' || a.campo === 'ta_diastolica' ? 'ta' : a.campo))
                return (
                  <tr key={t.id}>
                    <th className="pe-nombre" scope="row">{fechaCorta(t.fecha).replace(/ \d{4}$/, '')}</th>
                    <td>{TURNO_LABEL[t.turno] || t.turno}<em className="rp-momento">{t.momento === 'entregar' ? 'al entregar' : 'al recibir'}</em></td>
                    {CAMPOS.map(c => <td key={c.id} className={al.has(c.id) ? 'rp-fuera' : ''}>{valor(t, c) || '—'}</td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <h3 className="rp-sub">Micciones y evacuaciones</h3>
      {!elim ? <div className="md-skel" /> : !elim.length ? <p className="ac-vacio">Sin registros en estos días.</p> : (
        <div className="rp-elim">
          {elimPorDia.map(([f, lista]) => (
            <div key={f} className="rp-elim-dia">
              <strong>{fechaCorta(f).replace(/ \d{4}$/, '')}</strong>
              <div>{lista.map(x => (
                <span key={x.id} className={`rp-elim-item${(x.caracteristicas || []).some(c => ELIM[x.tipo]?.vigilar.includes(c)) ? ' vigilar' : ''}`}>
                  {ELIM[x.tipo]?.corto || x.tipo} {x.hora}{x.caracteristicas?.length ? ` · ${x.caracteristicas.join(', ')}` : ''}
                </span>
              ))}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Reportes ─────────────────────────────────────────────────────────────────
function Reportes({ r }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [pdf, setPdf] = useState(null)
  useEffect(() => { pedir(`/api/gestion/reportes?residente_id=${r.id}`).then(setLista).catch(e => setError(e.message)) }, [r.id])
  async function descargar(rep) {
    setPdf(rep.id)
    try { await generarReportePDF({ reporte: rep, alertas: { recibir: alertasDe(rep.signos?.recibir), entregar: alertasDe(rep.signos?.entregar) } }) }
    catch { setError('No se pudo hacer el PDF.') } finally { setPdf(null) }
  }
  if (!lista) return error ? <div className="rl-error">{error}</div> : <div className="md-skel" />
  if (!lista.length) return <p className="ac-vacio">Todavía no hay reportes de turno de {r.nombre.split(' ')[0]}.</p>
  return (
    <div className="rp-reportes">
      {error && <div className="rl-error">{error}</div>}
      {lista.map(rep => (
        <article key={rep.id} className={`rp-reporte${abierto === rep.id ? ' abierto' : ''}`}>
          <button className="rp-reporte-head" onClick={() => setAbierto(a => (a === rep.id ? null : rep.id))} aria-expanded={abierto === rep.id}>
            <span><b>{fechaCorta(rep.fecha)}</b> · {TURNO_LABEL[rep.turno] || rep.turno}{rep.enfermero ? ` · ${rep.enfermero}` : ''}</span>
            {abierto === rep.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {abierto !== rep.id ? <p className="rp-reporte-prev">{String(rep.texto || '').replace(/[*#]/g, '').slice(0, 180)}…</p> : (<>
            <div className="rp-reporte-texto">{String(rep.texto || '').replace(/\*\*/g, '')}</div>
            <button className="rl-btn" onClick={() => descargar(rep)} disabled={pdf === rep.id}>{pdf === rep.id ? <Loader2 className="cd-spin" size={16} /> : <Download size={16} />} Descargar PDF</button>
          </>)}
        </article>
      ))}
    </div>
  )
}

// ── Documentos del expediente ────────────────────────────────────────────────
const DOC_API = '/api/gestion/documentos'
const icono = (mime) => (mime.startsWith('image/') ? ImageIcon : mime === 'application/pdf' ? FileText : File)

async function abrirArchivo(d, descargar) {
  // La ventana se abre antes de pedir el archivo (si no, el navegador la bloquea)
  const w = descargar ? null : window.open('', '_blank')
  const res = await gestionFetch(`${DOC_API}/${d.id}/archivo`)
  if (!res.ok) { w?.close(); throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo abrir.') }
  const url = URL.createObjectURL(await res.blob())
  if (descargar) { const a = Object.assign(document.createElement('a'), { href: url, download: d.nombre }); a.click() }
  else if (w) w.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function Documentos({ r, puedeSubir, puedeEditar, puedeBorrar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [tipo, setTipo] = useState('')
  const [subiendo, setSubiendo] = useState(null)   // { hechos, total }
  const [filtro, setFiltro] = useState('')
  const input = useRef(null)
  const cargar = useCallback(() => pedir(`${DOC_API}?residente_id=${r.id}`).then(d => { setDatos(d); setTipo(t => t || d.tipos[0]) }).catch(e => setError(e.message)), [r.id])
  useEffect(() => { cargar() }, [cargar])

  async function subir(archivos) {
    const lista = [...archivos]
    if (!lista.length) return
    setError(''); setSubiendo({ hechos: 0, total: lista.length })
    const fallas = []
    for (const f of lista) {
      if (f.size > 15 * 1024 * 1024) { fallas.push(`${f.name}: pesa más de 15 MB`); continue }
      try {
        const res = await gestionFetch(`${DOC_API}?residente_id=${r.id}&tipo=${encodeURIComponent(tipo)}&nombre=${encodeURIComponent(f.name)}`,
          { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream' } })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo subir.')
      } catch (e) { fallas.push(`${f.name}: ${e.message}`) }
      setSubiendo(s => ({ ...s, hechos: s.hechos + 1 }))
    }
    setSubiendo(null)
    if (input.current) input.current.value = ''
    if (fallas.length) setError(fallas.join(' · '))
    cargar()
  }
  async function cambiarTipo(d, t) {
    try { const x = await enviar(`${DOC_API}/${d.id}`, 'PUT', { tipo: t }); setDatos(v => ({ ...v, documentos: v.documentos.map(y => (y.id === d.id ? x : y)) })) } catch (e) { setError(e.message) }
  }
  async function borrar(d) {
    if (!window.confirm(`¿Borrar "${d.nombre}" del expediente? No se puede deshacer.`)) return
    try { await pedir(`${DOC_API}/${d.id}`, { method: 'DELETE' }); setDatos(v => ({ ...v, documentos: v.documentos.filter(y => y.id !== d.id) })) } catch (e) { setError(e.message) }
  }
  const abrir = (d, desc) => abrirArchivo(d, desc).catch(e => setError(e.message))

  if (!datos) return error ? <div className="rl-error">{error}</div> : <div className="md-skel" />
  const visibles = datos.documentos.filter(d => !filtro || d.tipo === filtro)
  const grupos = datos.tipos.map(t => ({ tipo: t, docs: visibles.filter(d => d.tipo === t) }))
    .concat([{ tipo: 'Otro tipo', docs: visibles.filter(d => !datos.tipos.includes(d.tipo)) }]).filter(g => g.docs.length)
  return (
    <>
      {puedeSubir && (
        <div className="rp-subir" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); subir(e.dataTransfer.files) }}>
          <Upload size={22} aria-hidden="true" />
          <div className="rp-subir-txt">
            <strong>Subir al expediente</strong>
            <span>PDF, fotos o documentos de Word/Excel, hasta 15 MB cada uno. Puedes elegir varios o arrastrarlos aquí.</span>
          </div>
          <label className="md-campo rp-subir-tipo"><span>Tipo</span>
            <select className="md-input" value={tipo} onChange={e => setTipo(e.target.value)}>{datos.tipos.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <input ref={input} type="file" multiple hidden accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={e => subir(e.target.files)} />
          <button className="rl-btn rl-btn-primary" onClick={() => input.current?.click()} disabled={!!subiendo}>
            {subiendo ? <><Loader2 className="cd-spin" size={16} /> Subiendo {subiendo.hechos + 1} de {subiendo.total}…</> : <><Upload size={16} /> Elegir archivos</>}
          </button>
        </div>
      )}
      {error && <div className="rl-error">{error}</div>}
      {!datos.documentos.length ? <p className="ac-vacio">Todavía no hay documentos en su expediente.</p> : (<>
        <div className="pe-pinceles-btns rp-filtro">
          <button className={`rd-hora${!filtro ? ' activo' : ''}`} onClick={() => setFiltro('')}>Todos ({datos.documentos.length})</button>
          {datos.tipos.filter(t => datos.documentos.some(d => d.tipo === t)).map(t => (
            <button key={t} className={`rd-hora${filtro === t ? ' activo' : ''}`} onClick={() => setFiltro(t)}>{t} ({datos.documentos.filter(d => d.tipo === t).length})</button>
          ))}
        </div>
        {grupos.map(g => (
          <section key={g.tipo} className="rp-doc-grupo">
            <h3 className="rp-sub">{g.tipo}</h3>
            <ul className="rp-docs">
              {g.docs.map(d => {
                const I = icono(d.mime)
                return (
                  <li key={d.id} className="rp-doc">
                    <span className="rp-doc-ico"><I size={20} /></span>
                    <span className="rp-doc-txt">
                      <button className="rp-doc-nombre" onClick={() => abrir(d)}>{d.nombre}</button>
                      <em>{tamano(d.tamano)} · {fecha(d.creado_en)}{d.subido_por_nombre ? ` · subió ${d.subido_por_nombre}` : ''}</em>
                    </span>
                    {puedeEditar && (
                      <select className="md-input rp-doc-tipo" value={d.tipo} onChange={e => cambiarTipo(d, e.target.value)} aria-label="Tipo de documento">
                        {[...new Set([...datos.tipos, d.tipo])].map(t => <option key={t}>{t}</option>)}
                      </select>
                    )}
                    <button className="rl-icon-btn" onClick={() => abrir(d)} title="Ver" aria-label={`Ver ${d.nombre}`}><ExternalLink size={17} /></button>
                    <button className="rl-icon-btn" onClick={() => abrir(d, true)} title="Descargar" aria-label={`Descargar ${d.nombre}`}><Download size={17} /></button>
                    {puedeBorrar && <button className="rl-icon-btn rp-doc-borrar" onClick={() => borrar(d)} title="Borrar" aria-label={`Borrar ${d.nombre}`}><Trash2 size={17} /></button>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </>)}
    </>
  )
}

/** Configuración → Tipos de documento */
export function TiposDocumento() {
  const [txt, setTxt] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  useEffect(() => { pedir(`${DOC_API}/tipos`).then(d => setTxt(d.tipos.join('\n'))).catch(e => setError(e.message)) }, [])
  async function guardar() {
    setError(''); setOk(false)
    try { const d = await enviar(`${DOC_API}/tipos`, 'PUT', { tipos: txt.split('\n') }); setTxt(d.tipos.join('\n')); setOk(true) } catch (e) { setError(e.message) }
  }
  if (txt === null) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
  return (
    <section className="ac-panel cf-lista-base">
      <p className="ac-ayuda">Los tipos con los que se ordenan los documentos del expediente de cada residente. Uno por renglón. Si quitas uno, los documentos que ya lo tienen no se borran.</p>
      <label className="md-campo"><span>Tipos de documento</span>
        <textarea className="md-input ac-textarea" rows={9} value={txt} onChange={e => { setOk(false); setTxt(e.target.value) }} /></label>
      <div className="pe-turnos-pie">
        <button className="rl-btn rl-btn-primary" onClick={guardar}><Check size={16} /> Guardar</button>
        {ok && <span className="rd-estado ok"><Check /> Guardado</span>}
      </div>
      {error && <div className="rl-error">{error}</div>}
    </section>
  )
}
