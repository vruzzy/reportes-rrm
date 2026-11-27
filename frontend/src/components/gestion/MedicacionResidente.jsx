import { useCallback, useEffect, useMemo, useState } from 'react'
import { pedir, enviar, nivelDias, textoDias, num, unidad, fechaCorta, ESTADO_LABEL } from './medicacionUtil'
import { Dialogo } from './CatalogoMedicamentos'
import PrescripcionForm from './PrescripcionForm'
import {
  Plus, Pencil, PauseCircle, PlayCircle, History, ShieldAlert, Sparkles, Loader2, Check, X, Clock, ChevronDown,
  CalendarDays, Pill, StopCircle,
} from 'lucide-react'

// Panel de medicación de un residente: qué toma en el día, PRN, variables y lo suspendido.

export function DiasBadge({ dias, existencia, enUso = true }) {
  const n = nivelDias(dias, existencia, enUso)
  return <span className={`md-dias md-dias-${n}`}>{textoDias(dias, existencia, enUso)}</span>
}

function Etiquetas({ p }) {
  const t = []
  if (p.controlado) t.push(<span key="c" className="pt-tag ctl"><ShieldAlert size={12} /> Controlado</span>)
  if (p.es_nueva && p.reemplaza_a_id) t.push(<span key="v" className="pt-tag nuevo"><Sparkles size={12} /> Cambió</span>)
  else if (p.es_nueva) t.push(<span key="n" className="pt-tag nuevo"><Sparkles size={12} /> Nuevo</span>)
  if (!p.en_pastillero && p.tipo === 'fija') t.push(<span key="p" className="pt-tag">Registro individual</span>)
  if (p.dias_modo !== 'todos') t.push(<span key="d" className="pt-tag"><CalendarDays size={12} /> {p.texto.split(', ').find(x => /lunes|martes|miércoles|jueves|viernes|sábado|domingo|cada|un día/.test(x)) || 'Ciertos días'}</span>)
  if (p.fecha_fin) t.push(<span key="f" className="pt-tag">Hasta {fechaCorta(p.fecha_fin)}</span>)
  if (p.estado === 'activa' && !p.aplica_hoy) t.push(<span key="h" className="pt-tag gris">Hoy no toca</span>)
  return t.length ? <span className="pt-tags">{t}</span> : null
}

function Tarjeta({ p, opciones, hora, puedeEditar, onCambiar, onCerrar, onReanudar, onHistorial }) {
  const activa = p.estado === 'activa'
  const dosis = p.dosis ? `${num(p.dosis)} ${unidad(opciones, p.unidad_dosis, p.dosis)}` : 'Según escala'
  return (
    <li className={`pt-item${activa ? '' : ' off'}`}>
      <div className="pt-main">
        <div className="pt-linea">
          {hora !== undefined && <span className="pt-hora">{hora || '—'}</span>}
          <b>{p.nombre}</b>
          <span className="pt-dosis">{dosis}</span>
          <Etiquetas p={p} />
        </div>
        {(p.indicaciones || p.tipo !== 'fija' || !activa) && (
          <p className="pt-extra">
            {p.tipo === 'prn' && <span>Si hace falta: {p.prn_motivo}{p.prn_max_24h ? ` · máx. ${num(p.prn_max_24h)} en 24 h` : ''}{p.prn_intervalo_h ? ` · cada ${num(p.prn_intervalo_h)} h mínimo` : ''}</span>}
            {p.tipo === 'variable' && <span className="pt-escala">Escala: {p.escala}</span>}
            {p.indicaciones && <span>{p.indicaciones}</span>}
            {!activa && <span className="pt-cierre">{ESTADO_LABEL[p.estado]}{p.motivo_cierre ? `: ${p.motivo_cierre}` : ''}{p.cerrado_por_nombre ? ` · ${p.cerrado_por_nombre}` : ''}</span>}
          </p>
        )}
      </div>
      <div className="pt-stock">
        {p.tipo !== 'prn' && activa && <DiasBadge dias={p.dias_restantes} existencia={p.existencia} />}
        <small>{p.existencia_texto}{p.provee === 'centro' ? ' · residencia' : ''}</small>
      </div>
      <div className="pt-acc">
        <button className="md-icono" onClick={() => onHistorial(p)} title="Historial de cambios" aria-label={`Historial de ${p.nombre}`}><History /></button>
        {puedeEditar && activa && <>
          <button className="md-icono" onClick={() => onCambiar(p)} title="Cambiar dosis u horario" aria-label={`Cambiar ${p.nombre}`}><Pencil /></button>
          <button className="md-icono" onClick={() => onCerrar(p, 'suspender')} title="Suspender" aria-label={`Suspender ${p.nombre}`}><PauseCircle /></button>
          <button className="md-icono" onClick={() => onCerrar(p, 'terminar')} title="Terminar" aria-label={`Terminar ${p.nombre}`}><StopCircle /></button>
        </>}
        {puedeEditar && p.estado === 'suspendida' && (
          <button className="md-icono" onClick={() => onReanudar(p)} title="Reanudar" aria-label={`Reanudar ${p.nombre}`}><PlayCircle /></button>
        )}
      </div>
    </li>
  )
}

function Alergias({ residente, puedeEditar, onGuardado }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(residente.alergias || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setValor(residente.alergias || ''); setEditando(false) }, [residente.id, residente.alergias])

  async function guardar() {
    setGuardando(true); setError('')
    try { const r = await enviar(`residentes/${residente.id}/alergias`, 'PATCH', { alergias: valor }); onGuardado(r.alergias); setEditando(false) }
    catch (e) { setError(e.message) } finally { setGuardando(false) }
  }

  if (editando) {
    return (
      <div className="pt-alergias editando">
        <ShieldAlert size={17} />
        <input className="md-input" value={valor} onChange={e => setValor(e.target.value)} autoFocus placeholder="Ej. Penicilina, sulfas. Vacío si no tiene."
          onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }} />
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 className="md-spin" size={15} /> : <Check size={15} />} Guardar</button>
        <button className="rl-btn" onClick={() => setEditando(false)}>Cancelar</button>
        {error && <span className="rt-error">{error}</span>}
      </div>
    )
  }
  return (
    <div className={`pt-alergias${residente.alergias ? ' hay' : ''}`}>
      <ShieldAlert size={17} />
      <span>{residente.alergias ? <>Alergias: <b>{residente.alergias}</b></> : 'Sin alergias registradas'}</span>
      {puedeEditar && <button className="rl-link" onClick={() => setEditando(true)}>{residente.alergias ? 'Editar' : 'Registrar alergias'}</button>}
    </div>
  )
}

function DialogoCerrar({ p, accion, onCerrar, onHecho }) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const RAPIDOS = accion === 'suspender'
    ? ['Indicación médica', 'Hospitalización', 'Reacción adversa', 'Sin existencias']
    : ['Terminó el tratamiento', 'Indicación médica', 'Capturado por error']
  async function guardar() {
    setGuardando(true); setError('')
    try { onHecho(await enviar(`prescripciones/${p.id}/${accion}`, 'POST', { motivo })) }
    catch (e) { setError(e.message) } finally { setGuardando(false) }
  }
  return (
    <Dialogo titulo={`${accion === 'suspender' ? 'Suspender' : 'Terminar'} ${p.nombre}`} sub={p.residente_nombre} onCerrar={onCerrar}
      pie={<>
        <button className="rl-btn" onClick={onCerrar}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando || !motivo.trim()}>
          {guardando ? <Loader2 className="md-spin" size={16} /> : accion === 'suspender' ? <PauseCircle size={16} /> : <StopCircle size={16} />}
          {accion === 'suspender' ? ' Suspender' : ' Terminar'}
        </button>
      </>}>
      <p className="md-nota">{accion === 'suspender' ? 'Deja de aparecer en las rondas. Se puede reanudar después.' : 'Deja de aparecer en las rondas y queda en el historial.'}</p>
      <div className="rt-chips">
        {RAPIDOS.map(m => <button key={m} type="button" className={`rt-chip${motivo === m ? ' on' : ''}`} onClick={() => setMotivo(m)}>{motivo === m && <Check />}{m}</button>)}
      </div>
      <label className="md-label">Motivo
        <input className="md-input" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
      </label>
      {error && <div className="rl-error" role="alert">{error}</div>}
    </Dialogo>
  )
}

function DialogoHistorial({ p, onCerrar }) {
  const [versiones, setVersiones] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { pedir(`prescripciones/${p.id}/historial`).then(setVersiones).catch(e => setError(e.message)) }, [p.id])
  return (
    <Dialogo ancho titulo={`Historial de ${p.nombre}`} sub={p.residente_nombre} onCerrar={onCerrar}>
      {error && <div className="rl-error">{error}</div>}
      {!versiones && !error && <div className="md-skel" />}
      {versiones && (
        <ol className="pt-versiones">
          {versiones.map((v, i) => (
            <li key={v.id} className={v.estado === 'activa' ? 'actual' : ''}>
              <div className="pt-v-head">
                <b>{i === 0 ? 'Versión actual' : `Versión ${versiones.length - i}`}</b>
                <span className={`pt-estado e-${v.estado}`}>{ESTADO_LABEL[v.estado]}</span>
                <small>{fechaCorta(v.fecha_inicio)}{v.fecha_fin ? ` → ${fechaCorta(v.fecha_fin)}` : ''}</small>
              </div>
              <p>{v.texto}</p>
              <small className="md-nota">
                {v.motivo_cambio ? `Motivo: ${v.motivo_cambio} · ` : ''}Capturó {v.creado_por_nombre || '—'}
                {v.motivo_cierre && v.estado !== 'reemplazada' ? ` · ${ESTADO_LABEL[v.estado]}: ${v.motivo_cierre}` : ''}
              </small>
            </li>
          ))}
        </ol>
      )}
    </Dialogo>
  )
}

export default function MedicacionResidente({ residente, opciones, rondas, onCambio }) {
  const puedeEditar = opciones.puede_prescribir
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)          // { editar?, prellenar? }
  const [cerrar, setCerrar] = useState(null)      // { p, accion }
  const [historial, setHistorial] = useState(null)
  const [verCerradas, setVerCerradas] = useState(false)

  const cargar = useCallback(() => {
    setError('')
    return pedir(`prescripciones?residente_id=${residente.id}&estado=todas`).then(setLista).catch(e => setError(e.message))
  }, [residente.id])
  useEffect(() => { setLista(null); cargar() }, [cargar])

  const activas = useMemo(() => (lista || []).filter(p => p.estado === 'activa'), [lista])
  const cerradas = useMemo(() => (lista || []).filter(p => p.estado !== 'activa' && p.estado !== 'reemplazada'), [lista])
  const porRonda = useMemo(() => rondas.filter(r => r.activa).map(r => ({
    ronda: r,
    items: activas.filter(p => p.tipo !== 'prn').flatMap(p => p.horarios.filter(h => h.ronda_id === r.id).map(h => ({ p, hora: h.hora })))
      .sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99') || a.p.nombre.localeCompare(b.p.nombre)),
  })), [rondas, activas])
  const prn = activas.filter(p => p.tipo === 'prn')

  async function reanudar(p) {
    setError('')
    try { await enviar(`prescripciones/${p.id}/reanudar`, 'POST'); await cargar(); onCambio?.() } catch (e) { setError(e.message) }
  }
  const acciones = { opciones, puedeEditar, onCambiar: (p) => setForm({ editar: p }), onCerrar: (p, accion) => setCerrar({ p, accion }), onReanudar: reanudar, onHistorial: setHistorial }

  return (
    <div className="pt-panel">
      <Alergias residente={residente} puedeEditar={puedeEditar} onGuardado={(a) => onCambio?.({ ...residente, alergias: a })} />

      <div className="pt-barra">
        <h3>Qué toma en el día <span>{activas.length} {activas.length === 1 ? 'medicamento activo' : 'medicamentos activos'}</span></h3>
        {puedeEditar && <button className="rl-btn rl-btn-primary" onClick={() => setForm({})}><Plus size={16} /> Agregar medicamento</button>}
      </div>

      {error && <div className="rl-error" role="alert">{error}</div>}
      {lista == null ? <div className="md-skel" /> : !activas.length && !cerradas.length ? (
        <div className="rl-vacio"><span className="rl-vacio-icon"><Pill /></span><p>No tiene medicamentos registrados.</p></div>
      ) : (
        <>
          {porRonda.map(({ ronda, items }) => (
            <section key={ronda.id} className="pt-ronda">
              <h4><Clock size={15} /> {ronda.nombre} <small>{ronda.detalle} · {ronda.hora_inicio}–{ronda.hora_fin}</small></h4>
              {items.length ? (
                <ul className="pt-lista">{items.map(({ p, hora }, i) => <Tarjeta key={`${p.id}-${i}`} p={p} hora={hora} {...acciones} />)}</ul>
              ) : <p className="pt-vacia">Nada en esta ronda.</p>}
            </section>
          ))}
          {prn.length > 0 && (
            <section className="pt-ronda">
              <h4>Si hace falta (PRN)</h4>
              <ul className="pt-lista">{prn.map(p => <Tarjeta key={p.id} p={p} {...acciones} />)}</ul>
            </section>
          )}
          {cerradas.length > 0 && (
            <section className="pt-ronda">
              <button className="rl-link pt-ver" onClick={() => setVerCerradas(v => !v)} aria-expanded={verCerradas}>
                <ChevronDown size={16} style={{ transform: verCerradas ? 'rotate(180deg)' : undefined }} /> Suspendidos y terminados ({cerradas.length})
              </button>
              {verCerradas && <ul className="pt-lista">{cerradas.map(p => <Tarjeta key={p.id} p={p} {...acciones} />)}</ul>}
            </section>
          )}
        </>
      )}

      {form && (
        <PrescripcionForm opciones={opciones} rondas={rondas} residente={residente} editar={form.editar} prellenar={form.prellenar}
          onCerrar={() => setForm(null)}
          onGuardado={(p, { cerrar: c }) => { cargar(); onCambio?.(); if (c) setForm(null) }} />
      )}
      {cerrar && (
        <DialogoCerrar p={cerrar.p} accion={cerrar.accion} onCerrar={() => setCerrar(null)}
          onHecho={() => { setCerrar(null); cargar(); onCambio?.() }} />
      )}
      {historial && <DialogoHistorial p={historial} onCerrar={() => setHistorial(null)} />}
    </div>
  )
}
