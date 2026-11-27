import { useCallback, useEffect, useState } from 'react'
import { pedir, enviar, fechaLarga, fechaCorta } from './medicacionUtil'
import { Dialogo } from './CatalogoMedicamentos'
import { fechaLocal } from './signosVitales'
import { DiaBarra } from './Banos'
import { MapPin, LogIn, LogOut, Loader2, Check, X, Clock, CircleAlert, Pencil, Moon, Crosshair, Coffee } from 'lucide-react'
import './medicacion.css'
import './actividades.css'
import './personal.css'
import './asistencia.css'

// Entradas y salidas: se marca desde el teléfono solo dentro de la residencia.
// · Marcar (todos): botón grande de entrada / salida y mis últimos días.
// · Registro del día (personal: ver): quién llegó, retardos, quién no ha llegado.
// La ubicación, la tolerancia y los avisos de retardo se configuran en Configuración → Entradas y salidas
// (componentes Ubicacion y AvisosAsistencia, exportados aquí).

const API = '/api/gestion/asistencia'
const ESTADOS = {
  completo: ['A tiempo', 'ok'], retardo: ['Retardo', 'warn'], trabajando: ['Trabajando', 'ok'], retardo_trabajando: ['Trabajando · retardo', 'warn'],
  sin_entrada: ['No ha marcado', 'mal'], pendiente: ['Aún no empieza', 'neutro'], descanso: ['Descanso', 'neutro'], ausencia: ['Falta / permiso', 'neutro'], sin_turno: ['Sin turno', 'neutro'],
}
const hora12 = (h) => { if (!h) return ''; const [a, b] = h.split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a < 12 ? 'am' : 'pm'}` }
const duracion = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}` : `${min} min`)

/** Pide la ubicación del teléfono con la mayor precisión posible. */
function ubicacion() {
  return new Promise((ok, mal) => {
    if (!navigator.geolocation) return mal(new Error('Este teléfono o navegador no permite usar la ubicación.'))
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      e => mal(new Error(e.code === 1
        ? 'No diste permiso de ubicación. En tu navegador permite la ubicación para este sitio y vuelve a intentar.'
        : e.code === 3 ? 'Tardó mucho en encontrar tu ubicación. Revisa que el GPS esté encendido e intenta otra vez.'
        : 'No se pudo obtener tu ubicación. Revisa que el GPS esté encendido.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  })
}

export default function Asistencia({ permisos, acciones = {}, inicial }) {
  const verTodos = !!permisos.asistencia
  const acc = acciones.asistencia || []
  const [vista, setVista] = useState(inicial === 'dia' && verTodos ? 'dia' : 'marcar')
  const tabs = [['marcar', 'Marcar'], verTodos && ['dia', 'Registro del día']].filter(Boolean)
  return (
    <div className="as-root">
      <header className="gl-header"><h1>Entradas y salidas</h1></header>
      {tabs.length > 1 && (
        <div className="rl-tabs" role="tablist">
          {tabs.map(([id, l]) => <button key={id} role="tab" aria-selected={vista === id} className={vista === id ? 'active' : ''} onClick={() => setVista(id)}>{l}</button>)}
        </div>
      )}
      {vista === 'marcar' ? <Marcar /> : <RegistroDia puedeCrear={acc.includes('crear')} puedeEliminar={acc.includes('eliminar')} />}
    </div>
  )
}

// ── Marcar ───────────────────────────────────────────────────────────────────
function Marcar() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [marcando, setMarcando] = useState(false)
  const [reloj, setReloj] = useState(new Date())
  const [aunAsi, setAunAsi] = useState(false)   // día de descanso, pero sí vino (cubre a alguien)

  const cargar = useCallback(() => pedir(`${API}/mio`).then(setDatos).catch(e => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const t = setInterval(() => setReloj(new Date()), 15000); return () => clearInterval(t) }, [])

  async function marcar() {
    setError(''); setOk(''); setMarcando(true)
    try {
      const u = await ubicacion()
      const r = await enviar(`${API}/marcar`, 'POST', { tipo: datos.siguiente, ...u, aun_asi: aunAsi })
      setAunAsi(false)
      setOk(`${r.tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada a las ${hora12(r.hora)}.`)
      await cargar()
    } catch (e) { setError(e.message) }
    finally { setMarcando(false) }
  }

  if (!datos) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
  if (!datos.vinculado) return (
    <div className="ac-panel ac-vacio-grande"><MapPin /><strong>Tu cuenta no está vinculada con tu perfil del personal</strong>
      <span>Pídele a administración que la vincule en Personal y horarios → Perfiles. Después podrás marcar tus entradas y salidas aquí.</span></div>
  )

  const hoy = datos.hoy
  const t = hoy?.turno
  const esEntrada = datos.siguiente === 'entrada'
  const libre = esEntrada && datos.libre && !aunAsi
  return (
    <>
      <section className="ac-panel as-marcar">
        <span className="as-reloj">{reloj.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}</span>
        <span className="as-fecha">{fechaLarga(datos.ahora.fecha).replace(/^./, c => c.toUpperCase())}</span>
        <span className="as-turno">
          {t?.tipo === 'trabajo' ? <>{t.nocturno ? <Moon /> : <Clock />} Hoy te toca <b>{t.etiqueta}</b>{t.inicio && t.fin ? ` · ${hora12(t.inicio)} a ${hora12(t.fin)}` : ''}</>
            : t?.tipo === 'descanso' ? 'Hoy es tu día de descanso' : 'Hoy no tienes turno en el horario'}
        </span>
        {datos.abierta && <span className="as-abierta"><LogIn /> Entraste a las {hora12(datos.abierta.hora)}{datos.abierta.fecha !== datos.ahora.fecha ? ' (ayer)' : ''}</span>}
        {libre ? (
          <div className="as-libre">
            <Coffee />
            <strong>No tienes que marcar hoy</strong>
            <span>{datos.libre.texto}</span>
            <button className="rl-link" onClick={() => { setAunAsi(true); setOk(''); setError('') }}>¿Vas a trabajar de todos modos (cubres a alguien)? Marcar entrada</button>
          </div>
        ) : !datos.configurado ? (
          <div className="pe-alerta"><CircleAlert /> Administración todavía no configura la ubicación de la residencia.</div>
        ) : (
          <button className={`as-boton ${esEntrada ? 'entrada' : 'salida'}`} onClick={marcar} disabled={marcando}>
            {marcando ? <><Loader2 className="cd-spin" /> Buscando tu ubicación…</> : esEntrada ? <><LogIn /> Marcar entrada</> : <><LogOut /> Marcar salida</>}
          </button>
        )}
        {aunAsi && esEntrada && <span className="ac-sutil">Hoy no te tocaba trabajar; tu entrada quedará registrada igual. <button className="rl-link" onClick={() => setAunAsi(false)}>Cancelar</button></span>}
        {!libre && <span className="ac-sutil as-ayuda"><MapPin /> Solo funciona dentro de la residencia (a menos de {datos.radio} m). El teléfono te pedirá permiso de ubicación.</span>}
        {ok && <div className="rd-aviso as-ok"><Check /> {ok}</div>}
        {error && <div className="rl-error as-error">{error}</div>}
      </section>

      <section className="ac-panel">
        <h2 className="ac-h2"><Clock /> Mis últimos días</h2>
        {!datos.dias.some(d => d.entrada) ? <p className="ac-vacio">Todavía no tienes marcas.</p> : (
          <div className="pe-tabla-wrap">
            <table className="pe-tabla as-tabla">
              <thead><tr><th>Día</th><th>Turno</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Estado</th></tr></thead>
              <tbody>
                {datos.dias.filter(d => d.entrada || d.fecha === datos.ahora.fecha).map(d => <FilaDia key={d.fecha} d={d} mostrarFecha />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function Estado({ d }) {
  const [txt, cls] = ESTADOS[d.estado] || ['', 'neutro']
  return (
    <span className={`as-estado ${cls}`}>{txt}{d.retardo_min > 0 && (d.estado === 'retardo' || d.estado === 'retardo_trabajando') ? ` ${duracion(d.retardo_min)}` : ''}
      {d.salida_temprano_min > 15 && <em> · salió {duracion(d.salida_temprano_min)} antes</em>}
    </span>
  )
}

function FilaDia({ d, nombre, mostrarFecha, acciones }) {
  return (
    <tr>
      <th className="pe-nombre" scope="row">{mostrarFecha ? fechaCorta(d.fecha).replace(/ \d{4}$/, '') : nombre}{!mostrarFecha && d.puesto && <span>{d.puesto}</span>}</th>
      <td>{d.turno ? <span className={`pe-celda-chip ${d.turno.tipo === 'descanso' ? 'descanso' : d.turno.nocturno ? 'noche' : 'trabajo'}`}>{d.turno.tipo === 'descanso' ? 'D' : d.turno.etiqueta}</span> : '—'}</td>
      <td>{d.entrada ? <span className="as-hora">{hora12(d.entrada.hora)}{d.entrada.manual && <em title={d.entrada.nota}>a mano</em>}{acciones?.quitar(d.entrada)}</span> : '—'}</td>
      <td>{d.salida ? <span className="as-hora">{hora12(d.salida.hora)}{d.salida.manual && <em title={d.salida.nota}>a mano</em>}{acciones?.quitar(d.salida)}</span> : '—'}</td>
      <td>{d.horas != null ? `${d.horas} h` : '—'}</td>
      <td><Estado d={d} />{acciones?.poner(d)}</td>
    </tr>
  )
}

// ── Registro del día ─────────────────────────────────────────────────────────
function RegistroDia({ puedeCrear, puedeEliminar }) {
  const [fecha, setFecha] = useState(fechaLocal())
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [manual, setManual] = useState(null)

  const cargar = useCallback(() => pedir(`${API}/dia?fecha=${fecha}`).then(setDatos).catch(e => setError(e.message)), [fecha])
  useEffect(() => { setDatos(null); setError(''); cargar() }, [cargar])

  async function quitar(m) {
    setError('')
    try { await pedir(`${API}/${m.id}`, { method: 'DELETE' }); cargar() } catch (e) { setError(e.message) }
  }

  const acciones = puedeCrear || puedeEliminar ? {
    quitar: (m) => !puedeEliminar ? null : <button className="rd-chip-x" onClick={() => quitar(m)} aria-label="Quitar esta marca" title="Quitar esta marca"><X /></button>,
    poner: (d) => puedeCrear && (!d.entrada || !d.salida) && d.estado !== 'descanso' && d.estado !== 'pendiente'
      ? <button className="rl-link as-mano" onClick={() => setManual(d)}><Pencil /> Poner a mano</button> : null,
  } : null

  return (
    <>
      <DiaBarra fecha={fecha} onCambio={setFecha} hoy={datos?.hoy || fechaLocal()} maxHoy />
      {error && <div className="rl-error">{error}</div>}
      {!datos ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div> : (<>
        {!datos.configurado && <div className="pe-alerta"><CircleAlert /> Falta configurar la ubicación de la residencia (pestaña Ubicación). Mientras, nadie puede marcar.</div>}
        <section className="cd-resumen">
          <div className="cd-card cd-card-fija" style={{ '--i': 0 }}><span className="cd-card-titulo">Les toca trabajar</span><strong>{datos.resumen.programados}</strong><span className="cd-card-pie">Según el horario</span></div>
          <div className="cd-card cd-card-fija" style={{ '--i': 1 }}><span className="cd-card-titulo">Llegaron</span><strong>{datos.resumen.llegaron}</strong><span className="cd-card-pie">{datos.resumen.trabajando} trabajando ahora</span></div>
          <div className={`cd-card cd-card-alerta${datos.resumen.retardos ? ' hay' : ''}`} style={{ '--i': 2 }}><span className="cd-card-titulo">Retardos</span><strong>{datos.resumen.retardos}</strong><span className="cd-card-pie">Más de {datos.tolerancia} min tarde</span></div>
          <div className={`cd-card cd-card-alerta${datos.resumen.sin_entrada ? ' hay' : ''}`} style={{ '--i': 3 }}><span className="cd-card-titulo">No han marcado</span><strong>{datos.resumen.sin_entrada}</strong><span className="cd-card-pie">Ya empezó su turno</span></div>
        </section>
        {!datos.filas.length ? <div className="ac-panel ac-vacio-grande"><Clock /><strong>Nadie tiene turno este día</strong><span>Haz el horario en Personal y horarios.</span></div> : (
          <div className="pe-tabla-wrap">
            <table className="pe-tabla as-tabla">
              <thead><tr><th className="pe-th-nombre">Nombre</th><th>Turno</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Estado</th></tr></thead>
              <tbody>
                {[...datos.filas].sort((a, b) => (a.estado === 'sin_entrada' ? -1 : 0) - (b.estado === 'sin_entrada' ? -1 : 0)).map(f => (
                  <FilaDia key={f.personal_id} d={f} nombre={<>{f.nombre}{!f.vinculado && <em className="as-sincuenta"> · sin cuenta</em>}</>} acciones={acciones} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ac-sutil">"Sin cuenta" = su perfil no está vinculado con una cuenta, así que no puede marcar desde el teléfono; se le pueden poner las horas a mano.</p>
      </>)}
      {manual && <DialogoManual d={manual} onCerrar={() => setManual(null)} onGuardado={() => { setManual(null); cargar() }} />}
    </>
  )
}

function DialogoManual({ d, onCerrar, onGuardado }) {
  const tipo = d.entrada ? 'salida' : 'entrada'
  const [hora, setHora] = useState((tipo === 'entrada' ? d.turno?.inicio : d.turno?.fin) || '')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  async function guardar() {
    setError('')
    try { await enviar(`${API}/manual`, 'POST', { personal_id: d.personal_id, fecha: d.fecha, tipo, hora, nota }); onGuardado() } catch (e) { setError(e.message) }
  }
  return (
    <Dialogo titulo={`Poner ${tipo} a mano`} sub={`${d.nombre} · ${fechaLarga(d.fecha)}`} onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar}>Cancelar</button><button className="rl-btn rl-btn-primary" onClick={guardar} disabled={!hora || !nota.trim()}><Check /> Guardar</button></>}>
      <label className="md-campo"><span>Hora de {tipo}</span><input className="md-input pe-input-corto" type="time" value={hora} onChange={e => setHora(e.target.value)} /></label>
      <label className="md-campo"><span>¿Por qué se pone a mano?</span><input className="md-input" autoFocus value={nota} maxLength={200} onChange={e => setNota(e.target.value)} placeholder="Por ejemplo: se le acabó la pila al teléfono" /></label>
      <p className="ac-sutil">Queda marcada como "a mano" con tu nombre.</p>
      {error && <div className="rl-error">{error}</div>}
    </Dialogo>
  )
}

// ── Ubicación ────────────────────────────────────────────────────────────────
export function Ubicacion() {
  const [cfg, setCfg] = useState(null)
  const [nueva, setNueva] = useState(null)
  const [radio, setRadio] = useState('')
  const [precision, setPrecision] = useState('')
  const [tolerancia, setTolerancia] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    pedir(`${API}/config`).then(c => { setCfg(c); setRadio(String(c.radio)); setPrecision(String(c.precision_max)); setTolerancia(String(c.tolerancia)) }).catch(e => setError(e.message))
  }, [])

  async function usarAqui() {
    setError(''); setBuscando(true)
    try { setNueva(await ubicacion()) } catch (e) { setError(e.message) } finally { setBuscando(false) }
  }
  async function guardar() {
    setError(''); setOk(false)
    const punto = nueva || cfg
    try {
      const c = await enviar(`${API}/config`, 'PUT', { lat: punto.lat, lng: punto.lng, radio: Number(radio), precision_max: Number(precision), tolerancia: Number(tolerancia) })
      setCfg({ ...cfg, ...c }); setNueva(null); setOk(true)
    } catch (e) { setError(e.message) }
  }

  if (!cfg) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
  const punto = nueva || (cfg.configurado ? cfg : null)
  return (
    <section className="ac-panel as-ubic">
      <p className="ac-ayuda">Para guardar la ubicación, abre esta pantalla <b>estando dentro de la residencia</b> y toca "Usar mi ubicación actual". Desde ahí se mide qué tan cerca debe estar cada persona para poder marcar.</p>
      <div className="as-ubic-punto">
        <MapPin />
        {punto ? <span><b>{punto.lat.toFixed(6)}, {punto.lng.toFixed(6)}</b>{nueva && <em> · nueva, precisión ±{Math.round(nueva.precision)} m (sin guardar)</em>}
          {' '}<a className="rl-link" href={`https://www.google.com/maps?q=${punto.lat},${punto.lng}`} target="_blank" rel="noreferrer">Ver en el mapa</a></span>
          : <span>Todavía no hay ubicación guardada.</span>}
      </div>
      <button className="rl-btn" onClick={usarAqui} disabled={buscando}>{buscando ? <Loader2 className="cd-spin" /> : <Crosshair />} Usar mi ubicación actual</button>
      {nueva && nueva.precision > 50 && <div className="pe-alerta"><CircleAlert /> La precisión es baja (±{Math.round(nueva.precision)} m). Sal a un lugar abierto o espera unos segundos y vuelve a tomarla.</div>}
      <div className="pe-form as-ubic-form">
        <label className="md-campo"><span>Distancia permitida (metros)</span><input className="md-input" type="number" min="30" max="1000" value={radio} onChange={e => setRadio(e.target.value)} />
          <span className="ac-sutil">Qué tan lejos del punto se puede marcar. 150 m cubre la residencia y la banqueta.</span></label>
        <label className="md-campo"><span>Precisión mínima del teléfono (metros)</span><input className="md-input" type="number" min="20" max="500" value={precision} onChange={e => setPrecision(e.target.value)} />
          <span className="ac-sutil">Si el teléfono no sabe bien dónde está (más de esto), no deja marcar.</span></label>
        <label className="md-campo"><span>Tolerancia de retardo (minutos)</span><input className="md-input" type="number" min="0" max="60" value={tolerancia} onChange={e => setTolerancia(e.target.value)} /></label>
      </div>
      <div className="pe-turnos-pie">
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={!punto}><Check /> Guardar</button>
        {ok && <span className="rd-estado ok"><Check /> Guardado</span>}
      </div>
      {error && <div className="rl-error">{error}</div>}
    </section>
  )
}

