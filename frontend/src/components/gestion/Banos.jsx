import { useCallback, useEffect, useMemo, useState } from 'react'
import { pedir, enviar, DIAS_SEMANA, fechaLarga, moverFecha } from './medicacionUtil'
import { Dialogo } from './CatalogoMedicamentos'
import { fechaLocal, horaLocal } from './signosVitales'
import { Bath, Check, X, Loader2, ChevronLeft, ChevronRight, Search, CircleDashed, Undo2, ChevronDown } from 'lucide-react'
import './medicacion.css'
import './actividades.css'

// Baños: a quién le toca hoy, quién lo baña y cómo estuvo (piel, tipo de baño).
// Lo que le toca a cada persona aparece también en su "Mis actividades".

const TURNO_CORTO = { 'Matutino-Vespertino': 'Mañana', Nocturno: 'Noche' }

export function Avatar({ r, size = 44 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  if (r?.foto) return <img className="rl-avatar" src={r.foto} alt="" style={style} />
  return <div className="rl-avatar rl-avatar-ini" style={style}>{r?.iniciales || '?'}</div>
}

/** Barra de día: ← fecha → y "Ir a hoy". */
export function DiaBarra({ fecha, onCambio, hoy = fechaLocal(), maxHoy = false }) {
  return (
    <div className="tb-barra">
      <div className="tb-fecha">
        <button className="rl-icon-btn" onClick={() => onCambio(moverFecha(fecha, -1))} aria-label="Día anterior"><ChevronLeft /></button>
        <label className="tb-fecha-input">
          <span>{fecha === hoy ? `Hoy, ${fechaLarga(fecha)}` : fechaLarga(fecha)}</span>
          <input type="date" value={fecha} max={maxHoy ? hoy : undefined} onChange={e => e.target.value && onCambio(e.target.value)} aria-label="Fecha" />
        </label>
        <button className="rl-icon-btn" onClick={() => onCambio(moverFecha(fecha, 1))} disabled={maxHoy && fecha >= hoy} aria-label="Día siguiente"><ChevronRight /></button>
      </div>
      {fecha !== hoy && <button className="rl-link" onClick={() => onCambio(hoy)}>Ir a hoy</button>}
    </div>
  )
}

const diasDesde = (desde, hasta) => Math.round((Date.parse(hasta + 'T12:00:00') - Date.parse(desde + 'T12:00:00')) / 86400000)

export function textoUltimoBano(ultimo, fecha) {
  if (!ultimo) return 'Sin baños registrados'
  const n = diasDesde(ultimo, fecha)
  return n <= 0 ? 'Se bañó hoy' : n === 1 ? 'Último baño: ayer' : `Último baño: hace ${n} días`
}

/** Estado del baño como etiqueta. */
export function EstadoBano({ registro }) {
  if (!registro) return <span className="ac-estado pend"><CircleDashed /> Pendiente</span>
  if (registro.estado === 'hecho') return <span className="ac-estado ok"><Check /> Bañado{registro.hora ? ` · ${registro.hora}` : ''}</span>
  return <span className="ac-estado no"><X /> No se bañó · {registro.motivo}</span>
}

let opcionesCache = null
async function opcionesBano() {
  if (!opcionesCache) opcionesCache = await pedir('/api/gestion/banos/opciones')
  return opcionesCache
}

/** Registrar o corregir un baño. */
export function DialogoBano({ residente, fecha, registro, onGuardado, onCerrar }) {
  const [op, setOp] = useState(opcionesCache)
  const [estado, setEstado] = useState(registro?.estado || 'hecho')
  const [tipo, setTipo] = useState(registro?.tipo || '')
  const [obs, setObs] = useState(registro?.observaciones || [])
  const [motivo, setMotivo] = useState(registro?.motivo || '')
  const [nota, setNota] = useState(registro?.nota || '')
  const [hora, setHora] = useState(registro?.hora || horaLocal())
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { opcionesBano().then(setOp).catch(e => setError(e.message)) }, [])
  useEffect(() => { if (op && !tipo && !registro) setTipo(op.tipos[0]) }, [op]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (o) => setObs(l => (l.includes(o) ? l.filter(x => x !== o) : [...l, o]))

  async function guardar() {
    if (estado === 'no_hecho' && !motivo) return setError('Elige por qué no se bañó.')
    setOcupado('guardar'); setError('')
    try {
      const r = await enviar('/api/gestion/banos/registro', 'PUT', { residente_id: residente.id, fecha, estado, tipo, observaciones: obs, motivo, nota, hora })
      onGuardado(r)
    } catch (e) { setError(e.message); setOcupado('') }
  }
  async function deshacer() {
    setOcupado('deshacer'); setError('')
    try {
      await pedir(`/api/gestion/banos/registro/${registro.id}`, { method: 'DELETE' })
      onGuardado(null)
    } catch (e) { setError(e.message); setOcupado('') }
  }

  return (
    <Dialogo titulo={`Baño de ${residente.nombre}`} sub={fechaLarga(fecha).replace(/^./, c => c.toUpperCase())} onCerrar={onCerrar}
      pie={<>
        {registro && <button className="rl-link ac-link-gris" onClick={deshacer} disabled={!!ocupado}><Undo2 size={15} /> Dejar pendiente</button>}
        <button className="rl-btn" onClick={onCerrar} disabled={!!ocupado}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={!!ocupado || !op}>
          {ocupado === 'guardar' ? <Loader2 className="cd-spin" /> : <Check />} Guardar
        </button>
      </>}>
      {!op ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div> : (
        <div className="ac-form">
          <div className="md-seg ac-seg-grande" role="group" aria-label="¿Se bañó?">
            <button className={estado === 'hecho' ? 'on md-seg-dada' : ''} onClick={() => setEstado('hecho')}><Check size={16} /> Se bañó</button>
            <button className={estado === 'no_hecho' ? 'on md-seg-rechazo' : ''} onClick={() => setEstado('no_hecho')}><X size={16} /> No se bañó</button>
          </div>

          {estado === 'hecho' ? (<>
            <div className="ac-campo">
              <span className="ac-campo-titulo">Tipo de baño</span>
              <div className="rt-chips">
                {op.tipos.map(t => <button key={t} type="button" className={`rt-chip${tipo === t ? ' on' : ''}`} onClick={() => setTipo(t)} aria-pressed={tipo === t}>{tipo === t && <Check />}{t}</button>)}
              </div>
            </div>
            <div className="ac-campo">
              <span className="ac-campo-titulo">Cómo se vio la piel <small>(opcional)</small></span>
              <div className="rt-chips">
                {op.observaciones.map(o => (
                  <button key={o} type="button" className={`rt-chip${obs.includes(o) ? ' on' : ''}${op.vigilar.includes(o) ? ' vig' : ''}`}
                    onClick={() => toggle(o)} aria-pressed={obs.includes(o)}>{obs.includes(o) && <Check />}{o}</button>
                ))}
              </div>
            </div>
          </>) : (
            <div className="ac-campo">
              <span className="ac-campo-titulo">¿Por qué no se bañó?</span>
              <div className="rt-chips">
                {op.motivos.map(m => <button key={m} type="button" className={`rt-chip${motivo === m ? ' on' : ''}`} onClick={() => setMotivo(m)} aria-pressed={motivo === m}>{motivo === m && <Check />}{m}</button>)}
              </div>
            </div>
          )}

          <div className="ac-fila-campos">
            <label className="ac-campo ac-campo-hora"><span className="ac-campo-titulo">Hora</span>
              <input className="md-input" type="time" value={hora} onChange={e => setHora(e.target.value)} />
            </label>
            <label className="ac-campo ac-crece"><span className="ac-campo-titulo">Nota <small>(opcional)</small></span>
              <input className="md-input" value={nota} maxLength={400} onChange={e => setNota(e.target.value)}
                placeholder={estado === 'hecho' ? 'Algo que deba saber el siguiente turno' : 'Se intentará de nuevo en la tarde…'} />
            </label>
          </div>
          {error && <div className="rl-error ac-error" role="alert">{error}</div>}
        </div>
      )}
    </Dialogo>
  )
}

export default function Banos({ puedeEditar }) {
  const [fecha, setFecha] = useState(fechaLocal())
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)  // residente con el diálogo abierto
  const [buscar, setBuscar] = useState('')
  const [verOtros, setVerOtros] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try { setDatos(await pedir(`/api/gestion/banos?fecha=${fecha}`)) } catch (e) { setError(e.message) }
  }, [fecha])
  useEffect(() => { cargar() }, [cargar])

  const presentes = useMemo(() => (datos?.residentes || []).filter(r => r.ubicacion === 'residencia'), [datos])
  const coincide = (r) => !buscar || r.nombre.toLowerCase().includes(buscar.toLowerCase())
  const tocan = presentes.filter(r => r.toca || r.registro)
  const otros = presentes.filter(r => !r.toca && !r.registro)
  const banados = tocan.filter(r => r.registro?.estado === 'hecho').length
  const noBanados = tocan.filter(r => r.registro?.estado === 'no_hecho').length
  const sinPrograma = presentes.filter(r => !r.programa?.dias_semana?.length).length

  function actualizar(id, cambios) {
    setDatos(d => ({ ...d, residentes: d.residentes.map(r => (r.id === id ? { ...r, ...cambios } : r)) }))
  }

  const fila = (r) => (
    <div key={r.id} className={`ac-bano-fila${r.registro ? ` ${r.registro.estado}` : ''}`}>
      <Avatar r={r} />
      <div className="ac-bano-info">
        <strong>{r.nombre}</strong>
        <span>{[r.habitacion && `Hab. ${r.habitacion}`, r.programa?.turno && TURNO_CORTO[r.programa.turno], r.encargado_nombre || (r.toca ? 'Sin encargado' : '')].filter(Boolean).join(' · ')}</span>
        <span className="ac-sutil">{textoUltimoBano(r.ultimo_bano, fecha)}</span>
      </div>
      <div className="ac-bano-estado">
        <EstadoBano registro={r.registro} />
        {r.registro?.observaciones?.length > 0 && (
          <span className="ac-obs">{r.registro.observaciones.map(o => <i key={o} className={datos.vigilar?.includes(o) ? 'vig' : ''}>{o}</i>)}</span>
        )}
      </div>
      {puedeEditar && (
        <button className={`rl-btn${r.registro ? '' : ' rl-btn-primary'}`} onClick={() => setAbierto(r)}>
          {r.registro ? 'Cambiar' : <><Bath /> Registrar</>}
        </button>
      )}
    </div>
  )

  return (
    <div className="ac-root">
      <header className="gl-header"><h1>Baños</h1></header>

      {sinPrograma > 0 && datos && <p className="ac-sutil">{sinPrograma} residente{sinPrograma === 1 ? '' : 's'} sin días de baño. Los días y quién los baña se ponen en Configuración → Baños.</p>}

      {error && <div className="rl-error">{error}</div>}

      {(<>
        <DiaBarra fecha={fecha} onCambio={setFecha} maxHoy />
        <section className="cd-resumen">
          <div className="cd-card cd-card-fija" style={{ '--i': 0 }}>
            <span className="cd-card-titulo">Les toca hoy</span>
            <strong className="cd-card-num">{tocan.length}</strong>
            <span className="cd-card-pie">{tocan.length - banados - noBanados} pendientes</span>
          </div>
          <div className="cd-card cd-card-fija" style={{ '--i': 1 }}>
            <span className="cd-card-titulo">Bañados</span>
            <strong className="cd-card-num">{banados}</strong>
            <span className="cd-barra"><i style={{ width: tocan.length ? `${(banados / tocan.length) * 100}%` : 0 }} /></span>
          </div>
          <div className={`cd-card cd-card-alerta${noBanados ? ' hay' : ''}`} style={{ '--i': 2 }}>
            <span className="cd-card-titulo">No se bañaron</span>
            <strong className="cd-card-num">{noBanados}</strong>
            <span className="cd-card-pie">{noBanados ? 'Revisa el motivo de cada uno' : 'Nadie se quedó sin baño'}</span>
          </div>
        </section>

        <div className="ac-panel">
          <div className="ac-panel-head">
            <label className="ac-buscar"><Search /><input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar residente…" /></label>
          </div>
          {!datos ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
            : tocan.filter(coincide).length === 0
              ? <p className="ac-vacio">{tocan.length ? 'Nadie coincide con la búsqueda.' : 'A nadie le toca baño este día. Los días de baño se ponen en Configuración → Baños.'}</p>
              : tocan.filter(coincide).map(fila)}
          {otros.length > 0 && (
            <div className="ac-otros">
              <button className="rl-link ac-otros-btn" onClick={() => setVerOtros(v => !v)} aria-expanded={verOtros}>
                <ChevronDown className={verOtros ? 'girado' : ''} /> Otros residentes ({otros.length}) · no les toca hoy
              </button>
              {verOtros && otros.filter(coincide).map(fila)}
            </div>
          )}
        </div>
      </>)}

      {abierto && (
        <DialogoBano residente={abierto} fecha={fecha} registro={abierto.registro} onCerrar={() => setAbierto(null)}
          onGuardado={(reg) => {
            actualizar(abierto.id, { registro: reg, ...(reg?.estado === 'hecho' ? { ultimo_bano: fecha } : {}) })
            setAbierto(null)
            if (!reg) cargar()
          }} />
      )}
    </div>
  )
}

/** Programa de baños para Configuración: carga sus propios datos. */
export function ProgramaBanos({ puedeEditar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { pedir(`/api/gestion/banos?fecha=${fechaLocal()}`).then(setDatos).catch(e => setError(e.message)) }, [])
  const presentes = useMemo(() => (datos?.residentes || []).filter(r => r.ubicacion === 'residencia'), [datos])
  const actualizar = (id, cambios) => setDatos(d => ({ ...d, residentes: d.residentes.map(r => (r.id === id ? { ...r, ...cambios } : r)) }))
  if (error) return <div className="rl-error">{error}</div>
  return <Programa datos={datos} residentes={presentes} puedeEditar={puedeEditar} onCambio={actualizar} />
}

/** Programa semanal: días de baño, turno y quién lo baña. Se guarda solo. */
function Programa({ datos, residentes, puedeEditar, onCambio }) {
  const [estado, setEstado] = useState({}) // id → 'guardando' | 'ok' | {error}
  if (!datos) return <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>

  async function guardar(r, cambios) {
    const prog = { dias_semana: [], turno: null, encargado_id: null, notas: '', ...(r.programa || {}), ...cambios }
    const encargado = datos.personal.find(p => p.id === Number(prog.encargado_id))
    onCambio(r.id, { programa: prog, encargado_nombre: encargado?.nombre || '' })
    setEstado(s => ({ ...s, [r.id]: 'guardando' }))
    try {
      const guardado = await enviar(`/api/gestion/banos/programa/${r.id}`, 'PUT', prog)
      onCambio(r.id, { programa: guardado, toca: guardado.dias_semana.includes(new Date(datos.fecha + 'T12:00:00').getDay()) })
      setEstado(s => ({ ...s, [r.id]: 'ok' }))
    } catch (e) { setEstado(s => ({ ...s, [r.id]: { error: e.message } })) }
  }

  const ATAJOS = [
    { label: 'L-Mi-V', dias: [1, 3, 5] }, { label: 'Ma-J-S', dias: [2, 4, 6] }, { label: 'Diario', dias: [0, 1, 2, 3, 4, 5, 6] },
  ]

  return (
    <div className="ac-panel">
      <p className="ac-ayuda">Marca los días que le toca bañarse a cada residente y quién lo baña. A esa persona le aparece en <b>Mis actividades</b>. Se guarda solo.</p>
      <div className="cd-scroll">
        <table className="ac-tabla">
          <thead><tr><th>Residente</th><th>Días de baño</th><th>Turno</th><th>Lo baña</th><th aria-label="Estado" /></tr></thead>
          <tbody>
            {residentes.map(r => {
              const dias = r.programa?.dias_semana || []
              const st = estado[r.id]
              return (
                <tr key={r.id}>
                  <td><div className="ac-persona"><Avatar r={r} size={36} /><div><strong>{r.nombre}</strong>{r.habitacion && <span>Hab. {r.habitacion}</span>}</div></div></td>
                  <td>
                    <div className="ac-dias">
                      {DIAS_SEMANA.map(d => (
                        <button key={d.v} type="button" disabled={!puedeEditar} className={dias.includes(d.v) ? 'on' : ''} title={d.largo} aria-label={d.largo} aria-pressed={dias.includes(d.v)}
                          onClick={() => guardar(r, { dias_semana: dias.includes(d.v) ? dias.filter(x => x !== d.v) : [...dias, d.v] })}>{d.corto}</button>
                      ))}
                      {puedeEditar && ATAJOS.map(a => <button key={a.label} type="button" className="ac-atajo" onClick={() => guardar(r, { dias_semana: a.dias })}>{a.label}</button>)}
                    </div>
                  </td>
                  <td>
                    <select className="md-input ac-select" disabled={!puedeEditar} value={r.programa?.turno || ''} onChange={e => guardar(r, { turno: e.target.value || null })}>
                      <option value="">Cualquiera</option><option value="Matutino-Vespertino">Mañana</option><option value="Nocturno">Noche</option>
                    </select>
                  </td>
                  <td>
                    <select className="md-input ac-select" disabled={!puedeEditar} value={r.programa?.encargado_id || ''} onChange={e => guardar(r, { encargado_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Sin encargado</option>
                      {datos.personal.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </td>
                  <td className="ac-st">
                    {st === 'guardando' ? <Loader2 className="cd-spin" /> : st === 'ok' ? <Check className="ok" /> : st?.error ? <span className="ac-st-err" title={st.error}>{st.error}</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
