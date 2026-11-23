import { useCallback, useEffect, useMemo, useState } from 'react'
import { gestionFetch, leerJson } from './GestionApp'
import TurnoBarra from './TurnoBarra'
import { generarReportePDF } from './reportePDF'
import {
  CAMPOS, CLAVES, MOMENTOS, TURNO_LABEL, alertaDe, alertasDe, tieneValores, resumenToma,
  turnoActual, residentesDelTurno, horaLocal, fechaLarga, ELIMINACION, cuentaTexto,
} from './signosVitales'
import { RegistrosTipo, aplicarCambio } from './Eliminacion'
import {
  Sparkles, Check, CircleDashed, Copy, Download, Pencil, Trash2, Plus, Minus, AlertTriangle,
  Loader2, FileText, HeartPulse, ArrowRight, Search, X, Save,
} from 'lucide-react'

// Opciones del formulario: las mismas del reporte original de la app
const OPT = {
  estadoAlRecibir: ['Activo/a con buen semblante', 'Tranquilo/a', 'Somnoliento/a', 'Dormido/a en su habitación',
    'Sentado/a en su silla', 'En reposo', 'Agitado/a', 'Confuso/a', 'Con dolor referido', 'Postrado/a'],
  actitudConducta: ['Accesible', 'Cooperador/a', 'Tranquilo/a', 'Comunicativo/a', 'Ansioso/a', 'Agitado/a',
    'Hiperactivo/a', 'Poco accesible', 'Desorientado/a', 'Llanto fácil', 'Renuente', 'Resistente a cuidados'],
  cuidadosRealizados: ['Baño completo', 'Baño parcial', 'Cambio de pañal', 'Aseo bucal', 'Cambio de ropa',
    'Movilizaciones posturales', 'Curaciones', 'Posición antiescara', 'Aplicación de insulina', 'Nebulización',
    'Cambio de parche', 'Sonda vesical atendida', 'Glicemia capilar'],
  alimentacion: ['Completa', 'Completa con asistencia', 'Parcial (>50%)', 'Parcial (<50%)', 'Rechazó alimentación',
    'Por sonda nasogástrica', 'Líquidos únicamente', 'Ayuno indicado'],
  medicamentos: ['Administrados en tiempo y forma', 'Administrados con resistencia', 'Dosis omitida (indicar motivo)',
    'Sin medicación programada'],
  actividadesDia: ['Curaciones de escaras', 'Fisioterapia', 'Clase recreativa', 'Activación física',
    'Eucaristía del día', 'No participó', 'N/A'],
  observacionesEspeciales: ['Sin novedades', 'Visita familiar', 'Revisión médica en turno', 'Análisis de laboratorio',
    'Glicemia capilar tomada', 'Salió de la residencia', 'Salida médica', 'Caída o incidente',
    'Cambio en estado general', 'Comunicación con familia', 'Traslado hospitalario'],
  sueno: ['Durmió bien toda la noche', 'Sueño intermitente', 'Se levantó al baño durante la noche',
    'Se intentó levantar, requirió asistencia', 'No logró conciliar el sueño', 'Se mantuvo bajo vigilancia',
    'Requirió asistencia para acostarse'],
}

const formVacio = () => ({
  estadoAlRecibir: [], actitudConducta: [], cuidadosRealizados: [], cambiosPanal: 0, alimentacion: '',
  medicamentos: '', actividadesDia: [], sueno: [], observacionesEspeciales: [],
  notasAdicionales: '',
})

function Avatar({ r, size = 44 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  if (r?.foto) return <img className="rl-avatar" src={r.foto} alt="" style={style} />
  return <div className="rl-avatar rl-avatar-ini" style={style}>{r?.iniciales || '?'}</div>
}

function Chips({ opciones, valor, onChange, multiple = true }) {
  const activo = (o) => (multiple ? valor.includes(o) : valor === o)
  function toggle(o) {
    if (!multiple) return onChange(valor === o ? '' : o)
    onChange(valor.includes(o) ? valor.filter(x => x !== o) : [...valor, o])
  }
  return (
    <div className="rt-chips">
      {opciones.map(o => (
        <button key={o} type="button" className={`rt-chip${activo(o) ? ' on' : ''}`} onClick={() => toggle(o)} aria-pressed={activo(o)}>
          {activo(o) && <Check />}{o}
        </button>
      ))}
    </div>
  )
}

function Seccion({ titulo, ayuda, children, id }) {
  return (
    <section className="rt-sec" id={id}>
      <header><h3>{titulo}</h3>{ayuda && <span>{ayuda}</span>}</header>
      {children}
    </section>
  )
}

function Contador({ valor, onChange, min = 0, etiqueta }) {
  return (
    <div className="rt-contador">
      <button type="button" className="rl-icon-btn" onClick={() => onChange(Math.max(min, valor - 1))} disabled={valor <= min} aria-label="Restar"><Minus /></button>
      <b>{valor}</b>
      <button type="button" className="rl-icon-btn" onClick={() => onChange(valor + 1)} aria-label="Sumar"><Plus /></button>
      <span>{etiqueta}</span>
    </div>
  )
}

/** Texto para WhatsApp: reporte + signos del turno */
function textoParaCopiar(rep) {
  const filas = MOMENTOS.map(m => {
    const t = rep.signos?.[m.id]
    return tieneValores(t) ? `${m.label}${t.hora ? ` (${t.hora})` : ''}: ${resumenToma(t)}` : null
  }).filter(Boolean)
  return filas.length ? `${rep.texto}\n\nSignos vitales\n${filas.join('\n')}` : rep.texto
}

export default function ReportesTurno({ usuario, puedeEditar, puedeCapturarSignos, onIr }) {
  const inicial = turnoActual()
  const [fecha, setFecha] = useState(inicial.fecha)
  const [turno, setTurno] = useState(inicial.turno)
  const [pestana, setPestana] = useState(puedeEditar ? 'nuevo' : 'lista')
  const [residentes, setResidentes] = useState([])
  const [reportes, setReportes] = useState([])
  const [controles, setControles] = useState([])
  const [eventos, setEventos] = useState([])      // micciones y evacuaciones del turno
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)            // residente seleccionado
  const [abierto, setAbierto] = useState(null)    // reporte mostrado
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const q = `fecha=${fecha}&turno=${encodeURIComponent(turno)}`
      const resps = await Promise.all([
        gestionFetch('/api/gestion/residentes'),
        gestionFetch(`/api/gestion/reportes?${q}`),
        gestionFetch(`/api/gestion/reportes/controles?${q}`),
        gestionFetch(`/api/gestion/reportes/eliminacion?${q}`),
      ])
      const datos = await Promise.all(resps.map(leerJson))
      resps.forEach((r, i) => { if (!r.ok) throw new Error(datos[i].error || 'No se pudo cargar.') })
      setResidentes(datos[0]); setReportes(datos[1]); setControles(datos[2]); setEventos(datos[3])
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [fecha, turno])

  useEffect(() => { cargar() }, [cargar])

  const delTurno = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = residentesDelTurno(residentes, turno)
    return q ? lista.filter(r => r.nombre.toLowerCase().includes(q)) : lista
  }, [residentes, turno, busqueda])
  const reportePor = useMemo(() => Object.fromEntries([...reportes].reverse().map(r => [r.residente_id, r])), [reportes])
  const tomaDe = (rid, m) => controles.find(c => c.residente_id === rid && c.momento === m)

  function cambiarTurno({ fecha: f, turno: t }) { setFecha(f); setTurno(t); setSel(null); setAbierto(null) }

  function alGenerar(rep) {
    setReportes(rs => [rep, ...rs])
    setAbierto(rep)
  }
  function alActualizar(rep) {
    setReportes(rs => rs.map(r => (r.id === rep.id ? rep : r)))
    setAbierto(rep)
  }
  function alBorrar(id) {
    setReportes(rs => rs.filter(r => r.id !== id))
    setAbierto(null)
  }
  const residenteDe = (rep) => residentes.find(r => r.id === rep.residente_id)

  return (
    <>
      <header className="gl-header">
        <div>
          <p className="gl-eyebrow">Residentes</p>
          <h1>Reportes de turno</h1>
        </div>
        {!puedeEditar && <span className="rl-solo-ver">Solo lectura</span>}
      </header>

      <TurnoBarra fecha={fecha} turno={turno} onCambio={cambiarTurno} />

      <div className="rl-tabs" role="tablist">
        {puedeEditar && (
          <button role="tab" aria-selected={pestana === 'nuevo'} className={pestana === 'nuevo' ? 'active' : ''}
            onClick={() => { setPestana('nuevo'); setAbierto(null) }}>
            Nuevo reporte
          </button>
        )}
        <button role="tab" aria-selected={pestana === 'lista'} className={pestana === 'lista' ? 'active' : ''}
          onClick={() => { setPestana('lista'); setAbierto(null) }}>
          Reportes del turno <span>{reportes.length}</span>
        </button>
      </div>

      {error && <div className="rl-error" role="alert">{error} <button className="rl-link" onClick={cargar}>Reintentar</button></div>}

      {pestana === 'lista' ? (
        abierto ? (
          <ReporteVista reporte={abierto} residente={residenteDe(abierto)} puedeEditar={puedeEditar}
            onVolver={() => setAbierto(null)} onActualizar={alActualizar} onBorrar={alBorrar} />
        ) : (
          <ListaReportes reportes={reportes} residentes={residentes} cargando={cargando} turno={turno} fecha={fecha} onAbrir={setAbierto} />
        )
      ) : (
        <div className="rt-layout">
          <aside className="rl-panel rt-lista">
            <div className="rl-search rt-buscar">
              <Search />
              <input type="search" placeholder="Buscar residente…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar" />
            </div>
            {cargando ? <div className="cd-skel" /> : !delTurno.length ? (
              <p className="rt-lista-vacia">No hay residentes para este turno.</p>
            ) : delTurno.map(r => {
              const rep = reportePor[r.id]
              return (
                <button key={r.id} className={`rt-res${sel?.id === r.id ? ' active' : ''}`}
                  onClick={() => { setSel(r); setAbierto(null) }}>
                  <Avatar r={r} />
                  <span className="rt-res-text">
                    <strong>{r.nombre}</strong>
                    <span className="rt-res-marcas">
                      {MOMENTOS.map(m => {
                        const t = tomaDe(r.id, m.id)
                        const ok = tieneValores(t)
                        return <i key={m.id} className={ok ? (alertasDe(t).length ? 'alerta' : 'ok') : ''}
                          title={`${m.label}: ${ok ? 'registrado' : 'pendiente'}`}>{m.id === 'recibir' ? 'R' : 'E'}</i>
                      })}
                      {rep ? <em className="hecho"><Check /> Reporte</em> : <em>Sin reporte</em>}
                    </span>
                  </span>
                </button>
              )
            })}
          </aside>

          <div className="rt-detalle">
            {!sel ? (
              <div className="rl-panel rl-vacio">
                <span className="rl-vacio-icon"><FileText /></span>
                <p>Elige un residente para hacer su reporte del {TURNO_LABEL[turno] === 'Noche' ? 'turno de la noche' : 'turno de la mañana'}.</p>
              </div>
            ) : abierto && abierto.residente_id === sel.id ? (
              <ReporteVista reporte={abierto} residente={sel} puedeEditar={puedeEditar}
                onVolver={() => setAbierto(null)} onActualizar={alActualizar} onBorrar={alBorrar} nuevoTexto="Hacer otro reporte" />
            ) : (
              <FormularioReporte key={`${sel.id}-${fecha}-${turno}`} residente={sel} fecha={fecha} turno={turno} usuario={usuario}
                existente={reportePor[sel.id]} onVerExistente={setAbierto}
                tomas={{ recibir: tomaDe(sel.id, 'recibir'), entregar: tomaDe(sel.id, 'entregar') }}
                puedeCapturarSignos={!!puedeCapturarSignos} onIr={onIr}
                eventos={eventos.filter(e => e.residente_id === sel.id)}
                onEventoCambio={(ev, borrado) => setEventos(l => aplicarCambio(l, ev, borrado))}
                onTomaGuardada={(t, borrada) => setControles(cs => {
                  const resto = cs.filter(c => !(c.residente_id === sel.id && c.momento === t.momento))
                  return borrada ? resto : [...resto, t]
                })}
                onGenerado={alGenerar} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Lista de reportes del turno ───────────────────────────────────────────────
function ListaReportes({ reportes, residentes, cargando, turno, fecha, onAbrir }) {
  if (cargando) return <div className="rl-panel"><div className="rl-skeleton"><div className="cd-skel" /><div className="cd-skel" /></div></div>
  if (!reportes.length) {
    return (
      <div className="rl-panel rl-vacio">
        <span className="rl-vacio-icon"><FileText /></span>
        <p>No hay reportes del turno de la {TURNO_LABEL[turno] === 'Noche' ? 'noche' : 'mañana'} del {fechaLarga(fecha)}.</p>
      </div>
    )
  }
  return (
    <div className="rt-tarjetas">
      {reportes.map((rep, i) => {
        const r = residentes.find(x => x.id === rep.residente_id)
        return (
          <button key={rep.id} className="rl-panel rt-tarjeta" onClick={() => onAbrir(rep)} style={{ '--i': Math.min(i, 10) }}>
            <div className="rt-tarjeta-head">
              <Avatar r={r || { iniciales: '?' }} size={40} />
              <div>
                <strong>{rep.residente_nombre || 'Residente'}</strong>
                <span>{[rep.hora && `${rep.hora} h`, rep.enfermero].filter(Boolean).join(' · ')}</span>
              </div>
              {rep.origen !== 'gestion' && <em className="rt-origen">Desde la app</em>}
            </div>
            <p>{rep.texto}</p>
          </button>
        )
      })}
    </div>
  )
}

// ── Signos del turno dentro del formulario ────────────────────────────────────
function SignosTurno({ residente, fecha, turno, tomas, puedeCapturar, onGuardada, onIr }) {
  const [editando, setEditando] = useState(null) // momento
  const [valores, setValores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function abrir(m) {
    setEditando(m); setError('')
    setValores(Object.fromEntries(CLAVES.map(c => [c, tomas[m]?.[c] ?? ''])))
  }
  async function guardar() {
    setGuardando(true); setError('')
    try {
      const previa = tomas[editando]
      const res = await gestionFetch('/api/gestion/controles', {
        method: 'PUT',
        body: JSON.stringify({ residente_id: residente.id, fecha, turno, momento: editando, hora: previa?.hora || horaLocal(), notas: previa?.notas || '', ...valores }),
      })
      const d = await leerJson(res)
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar.')
      onGuardada(d.borrado ? { momento: editando } : d, !!d.borrado)
      setEditando(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Seccion id="rt-signos" titulo="Signos vitales del turno" ayuda="Se toman de Controles diarios y se agregan solos al reporte">
      <div className="rt-signos">
        {MOMENTOS.map(m => {
          const t = tomas[m.id]
          const al = alertasDe(t)
          if (editando === m.id) {
            return (
              <div key={m.id} className="rt-toma editando">
                <b>{m.label}</b>
                <div className="rt-toma-form">
                  {CAMPOS.map(c => c.id === 'ta' ? (
                    <label key="ta" className="rt-ta">T/A
                      <span>
                        <input className={`cd-in${alertaDe('ta_sistolica', valores.ta_sistolica) ? ' alerta' : ''}`} inputMode="numeric" placeholder="120" value={valores.ta_sistolica}
                          onChange={e => setValores(v => ({ ...v, ta_sistolica: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
                        /
                        <input className={`cd-in${alertaDe('ta_diastolica', valores.ta_diastolica) ? ' alerta' : ''}`} inputMode="numeric" placeholder="80" value={valores.ta_diastolica}
                          onChange={e => setValores(v => ({ ...v, ta_diastolica: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
                      </span>
                    </label>
                  ) : (
                    <label key={c.id}>{c.label}
                      <input className={`cd-in${alertaDe(c.id, valores[c.id]) ? ' alerta' : ''}`} inputMode={c.decimal ? 'decimal' : 'numeric'} placeholder={c.ph} value={valores[c.id]}
                        onChange={e => setValores(v => ({ ...v, [c.id]: e.target.value.replace(',', '.').replace(c.decimal ? /[^\d.]/g : /\D/g, '').slice(0, 5) }))} />
                    </label>
                  ))}
                </div>
                {error && <span className="rt-error">{error}</span>}
                <div className="rt-toma-acc">
                  <button className="rl-btn" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
                  <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando}>
                    {guardando ? <Loader2 className="cd-spin" /> : <Check />} Guardar toma
                  </button>
                </div>
              </div>
            )
          }
          return (
            <div key={m.id} className={`rt-toma${al.length ? ' con-alerta' : ''}${tieneValores(t) ? '' : ' vacia'}`}>
              <div className="rt-toma-head">
                <b>{m.label}</b>
                {tieneValores(t) && <span>{[t.hora, t.usuario_nombre?.split(' ')[0]].filter(Boolean).join(' · ')}</span>}
                {puedeCapturar && (
                  <button className="rl-link" onClick={() => abrir(m.id)}>{tieneValores(t) ? <><Pencil size={14} /> Corregir</> : <><Plus size={14} /> Capturar</>}</button>
                )}
              </div>
              {tieneValores(t) ? (
                <>
                  <p className="rt-toma-valores">{resumenToma(t)}</p>
                  {al.length > 0 && <span className="cd-tags">{al.map(a => <i key={a.campo}>{a.nombre}: {a.alerta}</i>)}</span>}
                </>
              ) : (
                <p className="rt-toma-pend"><CircleDashed size={15} /> Sin registrar
                  {!puedeCapturar && onIr && <button className="rl-link" onClick={() => onIr('controles')}>Ir a controles <ArrowRight size={14} /></button>}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Seccion>
  )
}

// ── Formulario del reporte ────────────────────────────────────────────────────
function FormularioReporte({ residente, fecha, turno, usuario, tomas, eventos, existente, onVerExistente, puedeCapturarSignos, onIr, onTomaGuardada, onEventoCambio, onGenerado }) {
  const [f, setF] = useState(formVacio)
  const [enfermero, setEnfermero] = useState(usuario?.nombre || '')
  const [hora, setHora] = useState(horaLocal())
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [confirmarFaltantes, setConfirmarFaltantes] = useState(false)
  const set = (campo) => (valor) => setF(x => ({ ...x, [campo]: valor }))
  const noche = turno === 'Nocturno'

  function toggleCuidados(v) {
    setF(x => ({ ...x, cuidadosRealizados: v, cambiosPanal: v.includes('Cambio de pañal') ? (x.cambiosPanal || 1) : 0 }))
  }

  const faltantes = MOMENTOS.filter(m => !tieneValores(tomas[m.id])).map(m => m.label.toLowerCase())

  async function generar(forzar = false) {
    setError('')
    if (!enfermero.trim()) return setError('Escribe el nombre del responsable del turno.')
    if (!f.notasAdicionales.trim()) return setError('Las notas adicionales son obligatorias: describe algo específico del turno.')
    if (faltantes.length && !forzar) { setConfirmarFaltantes(true); return }
    setConfirmarFaltantes(false)
    setGenerando(true)
    try {
      const res = await gestionFetch('/api/gestion/reportes/generar', {
        method: 'POST',
        body: JSON.stringify({
          residente_id: residente.id, fecha, turno, hora, enfermero,
          datos: { ...f, actividadesDia: noche ? [] : f.actividadesDia, sueno: noche ? f.sueno : [] },
        }),
      })
      const d = await leerJson(res)
      if (!res.ok) throw new Error(d.error || 'No se pudo generar el reporte.')
      onGenerado(d)
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="rl-panel rt-form">
      <div className="rt-form-head">
        <Avatar r={residente} size={56} />
        <div>
          <h2>{residente.nombre}</h2>
          <span>{noche ? 'Turno de la noche' : 'Turno de la mañana'} · {fechaLarga(fecha)}</span>
        </div>
      </div>

      {existente && (
        <div className="rt-aviso">
          <FileText size={16} /> Este residente ya tiene un reporte en este turno ({existente.hora || 'sin hora'}).
          <button className="rl-link" onClick={() => onVerExistente(existente)}>Ver reporte</button>
        </div>
      )}

      <SignosTurno residente={residente} fecha={fecha} turno={turno} tomas={tomas}
        puedeCapturar={puedeCapturarSignos} onGuardada={onTomaGuardada} onIr={onIr} />

      {noche && (
        <Seccion titulo="¿Cómo durmió?"><Chips opciones={OPT.sueno} valor={f.sueno} onChange={set('sueno')} /></Seccion>
      )}
      <Seccion titulo="Estado al recibir"><Chips opciones={OPT.estadoAlRecibir} valor={f.estadoAlRecibir} onChange={set('estadoAlRecibir')} /></Seccion>
      <Seccion titulo="Actitud y conducta"><Chips opciones={OPT.actitudConducta} valor={f.actitudConducta} onChange={set('actitudConducta')} /></Seccion>
      <Seccion titulo="Cuidados realizados">
        <Chips opciones={OPT.cuidadosRealizados} valor={f.cuidadosRealizados} onChange={toggleCuidados} />
        {f.cuidadosRealizados.includes('Cambio de pañal') && (
          <Contador valor={f.cambiosPanal} min={1} onChange={set('cambiosPanal')}
            etiqueta={f.cambiosPanal === 1 ? 'cambio de pañal' : 'cambios de pañal'} />
        )}
      </Seccion>
      <Seccion titulo="Alimentación"><Chips multiple={false} opciones={OPT.alimentacion} valor={f.alimentacion} onChange={set('alimentacion')} /></Seccion>
      <Seccion titulo="Medicamentos"><Chips multiple={false} opciones={OPT.medicamentos} valor={f.medicamentos} onChange={set('medicamentos')} /></Seccion>
      {!noche && (
        <Seccion titulo="Actividades del día"><Chips opciones={OPT.actividadesDia} valor={f.actividadesDia} onChange={set('actividadesDia')} /></Seccion>
      )}
      <Seccion titulo="Observaciones especiales"><Chips opciones={OPT.observacionesEspeciales} valor={f.observacionesEspeciales} onChange={set('observacionesEspeciales')} /></Seccion>

      <Seccion titulo="Micciones y evacuaciones" ayuda="Se toman de Controles diarios y se agregan solas al reporte">
        <div className="rt-elim">
          {ELIMINACION.map(t => {
            const lista = eventos.filter(e => e.tipo === t.id)
            return (
              <div key={t.id} className="rt-elim-tipo">
                <b>{t.label} <span>{lista.length ? cuentaTexto(t.id, lista.length) : 'Sin registrar'}</span></b>
                <RegistrosTipo tipo={t.id} residente={residente} fecha={fecha} turno={turno} eventos={lista}
                  puedeEditar={!!puedeCapturarSignos} onCambio={onEventoCambio} />
              </div>
            )
          })}
        </div>
        {!puedeCapturarSignos && onIr && !eventos.length && (
          <button className="rl-link" onClick={() => onIr('controles')}>Ir a controles <ArrowRight size={14} /></button>
        )}
      </Seccion>

      <Seccion titulo="Responsable del turno">
        <div className="rt-campos">
          <label>Nombre del enfermero/a
            <input className="rt-input" value={enfermero} onChange={e => setEnfermero(e.target.value)} placeholder="Nombre completo" />
          </label>
          <label>Hora del reporte
            <input className="rt-input" type="time" value={hora} onChange={e => setHora(e.target.value)} />
          </label>
        </div>
      </Seccion>

      <Seccion titulo="Notas adicionales" ayuda="Obligatorio: lo más importante del reporte">
        <textarea className={`rt-input rt-notas${f.notasAdicionales.trim() ? '' : ' requerido'}`} rows={4} value={f.notasAdicionales}
          onChange={e => set('notasAdicionales')(e.target.value)}
          placeholder="Describe algo específico del turno: comportamiento, un evento, un cambio en su estado, una visita…" />
      </Seccion>

      {error && <div className="rl-error" role="alert">{error}</div>}

      {confirmarFaltantes && (
        <div className="rt-confirmar" role="alert">
          <AlertTriangle />
          <div>
            <strong>Falta la toma de signos {faltantes.join(' y ')}.</strong>
            <span>El reporte saldrá sin esas cifras. Puedes capturarlas arriba o generarlo así.</span>
          </div>
          <button className="rl-btn" onClick={() => { setConfirmarFaltantes(false); document.getElementById('rt-signos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>Capturar primero</button>
          <button className="rl-btn rl-btn-primary" onClick={() => generar(true)}>Generar así</button>
        </div>
      )}

      <div className="rt-acciones">
        <button className="rl-btn rl-btn-primary rt-generar" onClick={() => generar()} disabled={generando}>
          {generando ? <><Loader2 className="cd-spin" /> Generando reporte…</> : <><Sparkles /> Generar reporte con IA</>}
        </button>
      </div>
    </div>
  )
}

// ── Reporte generado / guardado ───────────────────────────────────────────────
function ReporteVista({ reporte, residente, puedeEditar, onVolver, onActualizar, onBorrar, nuevoTexto = 'Volver' }) {
  const [texto, setTexto] = useState(reporte.texto)
  const [editando, setEditando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const cambiado = texto.trim() !== reporte.texto.trim()
  const alertas = { recibir: alertasDe(reporte.signos?.recibir), entregar: alertasDe(reporte.signos?.entregar) }

  useEffect(() => { setTexto(reporte.texto); setEditando(false) }, [reporte.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 2400); return () => clearTimeout(t) }, [aviso])

  /** Guarda el texto (y que la IA aprenda el estilo). Devuelve el reporte vigente. */
  async function guardar(silencioso = false) {
    if (!puedeEditar) return { ...reporte, texto }
    setOcupado(true)
    try {
      const res = await gestionFetch(`/api/gestion/reportes/${reporte.id}`, { method: 'PUT', body: JSON.stringify({ texto }) })
      const d = await leerJson(res)
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar.')
      onActualizar(d)
      if (!silencioso) setAviso('Cambios guardados')
      setEditando(false)
      return d
    } catch (e) {
      setAviso(e.message)
      return { ...reporte, texto }
    } finally {
      setOcupado(false)
    }
  }

  async function copiar() {
    const rep = await guardar(true)
    const t = textoParaCopiar(rep)
    try { await navigator.clipboard.writeText(t) } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: t })
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
    }
    setAviso('Mensaje copiado, con signos vitales')
  }

  async function pdf() {
    const rep = await guardar(true)
    try { await generarReportePDF({ reporte: rep, alertas }); setAviso('PDF descargado') } catch { setAviso('No se pudo generar el PDF') }
  }

  async function borrar() {
    setOcupado(true)
    try {
      const res = await gestionFetch(`/api/gestion/reportes/${reporte.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await leerJson(res)).error || 'No se pudo borrar.')
      onBorrar(reporte.id)
    } catch (e) {
      setAviso(e.message); setOcupado(false)
    }
  }

  return (
    <div className="rl-panel rt-vista">
      <div className="rt-form-head">
        <Avatar r={residente || { iniciales: '?' }} size={56} />
        <div>
          <h2>{reporte.residente_nombre}</h2>
          <span>{TURNO_LABEL[reporte.turno] === 'Noche' ? 'Turno de la noche' : 'Turno de la mañana'} · {fechaLarga(reporte.fecha)}
            {reporte.hora && ` · ${reporte.hora} h`}{reporte.enfermero && ` · ${reporte.enfermero}`}</span>
        </div>
        {puedeEditar && !editando && (
          <button className="rl-btn rt-editar" onClick={() => setEditando(true)}><Pencil /> Editar</button>
        )}
      </div>

      <section className="rt-sec">
        <header><h3>Informe del turno</h3>{editando && <span>Tus correcciones ayudan a la IA a escribir mejor los siguientes reportes</span>}</header>
        {editando
          ? <textarea className="rt-input rt-texto-edit" value={texto} onChange={e => setTexto(e.target.value)} rows={9} autoFocus />
          : <p className="rt-texto">{texto}</p>}
      </section>

      <section className="rt-sec">
        <header><h3>Signos vitales</h3></header>
        {reporte.signos ? (
          <table className="rt-tabla-signos">
            <thead>
              <tr><th>Toma</th><th>Hora</th>{CAMPOS.map(c => <th key={c.id}>{c.label} <small>{c.unidad}</small></th>)}</tr>
            </thead>
            <tbody>
              {MOMENTOS.map(m => {
                const t = reporte.signos[m.id]
                const rojo = (c) => (alertas[m.id].some(a => a.campo === c) ? 'alerta' : '')
                return (
                  <tr key={m.id}>
                    <th>{m.label}</th>
                    {t ? <>
                      <td>{t.hora || '—'}</td>
                      <td className={rojo('ta_sistolica') || rojo('ta_diastolica')}>{t.ta_sistolica ?? '—'}/{t.ta_diastolica ?? '—'}</td>
                      {['fc', 'spo2', 'fr', 'temperatura', 'glucosa'].map(c => <td key={c} className={rojo(c)}>{t[c] ?? '—'}</td>)}
                    </> : <td colSpan={7} className="rt-sin">Sin registrar</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <p className="rt-toma-pend">Este reporte se hizo desde la app; sus signos están en el Historial de la app.</p>}
        {(alertas.recibir.length > 0 || alertas.entregar.length > 0) && (
          <span className="cd-tags">{[...alertas.recibir.map(a => ['Al recibir', a]), ...alertas.entregar.map(a => ['Al entregar', a])]
            .map(([m, a]) => <i key={m + a.campo}>{m} · {a.nombre}: {a.alerta}</i>)}</span>
        )}
      </section>

      <div className="rt-acciones">
        <button className="rl-btn" onClick={onVolver}>{nuevoTexto}</button>
        {puedeEditar && !confirmarBorrar && (
          <button className="rl-btn rt-borrar" onClick={() => setConfirmarBorrar(true)} disabled={ocupado}><Trash2 /> Borrar</button>
        )}
        {confirmarBorrar && (
          <span className="rt-borrar-conf">¿Borrar este reporte?
            <button className="rl-btn" onClick={() => setConfirmarBorrar(false)}>No</button>
            <button className="rl-btn rt-borrar" onClick={borrar} disabled={ocupado}>Sí, borrar</button>
          </span>
        )}
        <span className="rt-espacio" />
        {editando && cambiado && (
          <button className="rl-btn" onClick={() => guardar()} disabled={ocupado}><Save /> Guardar cambios</button>
        )}
        <button className="rl-btn" onClick={pdf} disabled={ocupado}><Download /> Descargar PDF</button>
        <button className="rl-btn rl-btn-primary" onClick={copiar} disabled={ocupado}><Copy /> Copiar mensaje</button>
      </div>

      {aviso && <div className="rl-toasts" aria-live="polite"><div className="rl-toast">{aviso}</div></div>}
    </div>
  )
}
