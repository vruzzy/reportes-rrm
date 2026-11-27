import { useEffect, useMemo, useRef, useState } from 'react'
import { enviar, DIAS_SEMANA, num, unidad } from './medicacionUtil'
import { Dialogo, BuscadorMedicamento } from './CatalogoMedicamentos'
import { Check, Loader2, AlertTriangle, ShieldAlert, Plus, X, Info, CalendarPlus } from 'lucide-react'

// Formulario para agregar o cambiar un medicamento de un residente.
// Al cambiar dosis, horario o días de una prescripción con historial se crea una versión nueva (pide motivo).

const vacio = (hoy) => ({
  medicamento: null, tipo: 'fija', dosis: '', horarios: [], dias_modo: 'todos', dias_semana: [], cada_n_dias: 2,
  fecha_inicio: hoy, fecha_fin: '', provee: 'familia', via: '', indicaciones: '', medico: '',
  prn_motivo: '', prn_max_24h: '', prn_intervalo_h: '', escala: '', medicion_requerida: 'glucosa', motivo_cambio: '',
})

function desdePrescripcion(p) {
  return {
    medicamento: { id: p.medicamento_id, nombre: p.nombre, principio_activo: p.principio_activo, concentracion: p.concentracion, forma: p.forma,
      unidad_dosis: p.unidad_dosis, permite_fraccion: p.permite_fraccion, controlado: p.controlado, nombre_comercial: p.nombre_comercial },
    tipo: p.tipo, dosis: p.dosis ?? '', horarios: p.horarios || [], dias_modo: p.dias_modo || 'todos', dias_semana: p.dias_semana || [],
    cada_n_dias: p.cada_n_dias || 2, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin || '', provee: p.provee, via: p.via || '',
    indicaciones: p.indicaciones || '', medico: p.medico || '', prn_motivo: p.prn_motivo || '', prn_max_24h: p.prn_max_24h ?? '',
    prn_intervalo_h: p.prn_intervalo_h ?? '', escala: p.escala || '', medicion_requerida: p.medicion_requerida || 'glucosa', motivo_cambio: '',
  }
}

const soloNumero = (v) => String(v).replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 7)

export default function PrescripcionForm({ opciones, rondas, residente, editar, prellenar, onGuardado, onCerrar }) {
  const hoy = opciones.hoy
  const [f, setF] = useState(() => (editar ? desdePrescripcion(editar) : { ...vacio(hoy), ...(prellenar || {}) }))
  const [revision, setRevision] = useState(null)   // { texto, avisos } | { error }
  const [revisando, setRevisando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [confirmarAvisos, setConfirmarAvisos] = useState(null)
  const [guardada, setGuardada] = useState(null)
  const [deOferta, setDeOferta] = useState(false) // la segunda dosis ya no vuelve a ofrecer "otros días"
  const motivoRef = useRef(null)
  const set = (k) => (v) => { setF(x => ({ ...x, [k]: v?.target ? v.target.value : v })); setConfirmarAvisos(null) }
  const med = f.medicamento
  const ud = med?.unidad_dosis || 'tableta'
  const activas = rondas.filter(r => r.activa)

  const cuerpo = useMemo(() => ({
    residente_id: residente.id, medicamento_id: med?.id, tipo: f.tipo, dosis: f.dosis, horarios: f.tipo === 'prn' ? [] : f.horarios,
    dias_modo: f.dias_modo, dias_semana: f.dias_semana, cada_n_dias: f.cada_n_dias, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin,
    provee: f.provee, via: f.via, indicaciones: f.indicaciones, medico: f.medico, prn_motivo: f.prn_motivo, prn_max_24h: f.prn_max_24h,
    prn_intervalo_h: f.prn_intervalo_h, escala: f.escala, medicion_requerida: f.medicion_requerida, id: editar?.id,
  }), [f, med, residente.id, editar?.id])

  // Vista previa en lenguaje natural + avisos (alergia, duplicado, existencias)
  useEffect(() => {
    if (!med) { setRevision(null); return }
    setRevisando(true)
    const t = setTimeout(() => {
      enviar('prescripciones/revisar', 'POST', cuerpo)
        .then(r => setRevision(r)).catch(e => setRevision({ error: e.message })).finally(() => setRevisando(false))
    }, 400)
    return () => clearTimeout(t)
  }, [cuerpo, med])

  // Rondas y horas
  const enRonda = (id) => f.horarios.filter(h => h.ronda_id === id)
  function alternarRonda(r) {
    setF(x => ({ ...x, horarios: enRonda(r.id).length ? x.horarios.filter(h => h.ronda_id !== r.id) : [...x.horarios, { ronda_id: r.id, hora: '' }] }))
  }
  function cambiarHora(r, i, hora) {
    setF(x => {
      let n = -1
      return { ...x, horarios: x.horarios.map(h => (h.ronda_id === r.id && ++n === i ? { ...h, hora } : h)) }
    })
  }
  function otraHora(r) { setF(x => ({ ...x, horarios: [...x.horarios, { ronda_id: r.id, hora: '' }] })) }
  function quitarHora(r, i) {
    setF(x => { let n = -1; return { ...x, horarios: x.horarios.filter(h => !(h.ronda_id === r.id && ++n === i)) } })
  }
  const alternarDia = (v) => setF(x => ({ ...x, dias_semana: x.dias_semana.includes(v) ? x.dias_semana.filter(d => d !== v) : [...x.dias_semana, v] }))

  async function guardar(confirmar = false) {
    setGuardando(true); setError('')
    try {
      const datos = { ...cuerpo, confirmar, motivo_cambio: f.motivo_cambio }
      const p = editar ? await enviar(`prescripciones/${editar.id}`, 'PUT', datos) : await enviar('prescripciones', 'POST', datos)
      setGuardada(p)
      if (editar || deOferta || f.tipo !== 'fija' || f.dias_modo !== 'semana') onGuardado(p, { cerrar: true })
      else onGuardado(p, { cerrar: false })
    } catch (e) {
      if (e.status === 409 && e.data?.avisos) setConfirmarAvisos(e.data.avisos.filter(a => a.grave))
      else if (e.data?.pide_motivo) { setError(e.message); motivoRef.current?.focus() }
      else setError(e.message)
    } finally { setGuardando(false) }
  }

  // Tras guardar una prescripción de ciertos días: ofrecer la dosis de los otros días
  if (guardada && !editar) {
    const resto = DIAS_SEMANA.map(d => d.v).filter(v => !f.dias_semana.includes(v))
    return (
      <Dialogo titulo="Medicamento agregado" onCerrar={onCerrar}
        pie={<>
          <button className="rl-btn" onClick={onCerrar}>Listo</button>
          <button className="rl-btn rl-btn-primary" onClick={() => {
            setGuardada(null); setRevision(null); setDeOferta(true)
            setF(x => ({ ...x, dias_semana: resto, dosis: '', motivo_cambio: '' }))
          }}><CalendarPlus size={16} /> Agregar otra dosis para los otros días</button>
        </>}>
        <p className="pf-ok"><Check size={18} /> {guardada.texto}</p>
        <p className="md-nota">¿Los otros días ({resto.map(v => DIAS_SEMANA.find(d => d.v === v).largo.toLowerCase()).join(', ')}) toma una dosis distinta? Puedes agregarla ahora.</p>
      </Dialogo>
    )
  }

  const avisos = revision?.avisos || []
  const rapidas = med?.permite_fraccion ? [0.5, 1, 1.5, 2] : [1, 2, 3]
  const versionara = !!editar

  return (
    <Dialogo ancho titulo={editar ? `Cambiar ${editar.nombre}` : 'Agregar medicamento'} sub={residente.nombre} onCerrar={onCerrar}
      pie={<>
        <button className="rl-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={() => guardar(false)} disabled={guardando || !med}>
          {guardando ? <Loader2 className="md-spin" size={16} /> : <Check size={16} />} {editar ? 'Guardar cambio' : 'Guardar'}
        </button>
      </>}>

      {residente.alergias && (
        <p className="pf-alergia"><ShieldAlert size={17} /> Alergias: <b>{residente.alergias}</b></p>
      )}

      <div className="md-campo">
        <span className="md-campo-titulo">Medicamento</span>
        <BuscadorMedicamento opciones={opciones} valor={med} puedeCrear={opciones.puede_prescribir} autoFocus={!med}
          onElegir={m => setF(x => ({ ...x, medicamento: m, dosis: m && x.dosis === '' && x.tipo !== 'variable' ? 1 : x.dosis }))} />
      </div>

      {med && (<>
        <div className="md-campo">
          <span className="md-campo-titulo">Tipo</span>
          <div className="pf-seg" role="radiogroup" aria-label="Tipo">
            {opciones.tipos.map(t => (
              <button key={t.id} type="button" role="radio" aria-checked={f.tipo === t.id} className={f.tipo === t.id ? 'on' : ''} onClick={() => set('tipo')(t.id)}>
                <b>{t.label}</b><span>{t.ayuda}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="md-campo">
          <span className="md-campo-titulo">{f.tipo === 'variable' ? 'Dosis habitual (opcional, para calcular el inventario)' : 'Dosis'}</span>
          <div className="pf-dosis">
            {rapidas.map(d => (
              <button key={d} type="button" className={Number(f.dosis) === d ? 'on' : ''} onClick={() => set('dosis')(d)}>{num(d)}</button>
            ))}
            <input className="md-input pf-dosis-in" inputMode="decimal" value={f.dosis} onChange={e => set('dosis')(soloNumero(e.target.value))} aria-label="Dosis" />
            <span className="pf-unidad">{unidad(opciones, ud, Number(f.dosis) || 2)}</span>
          </div>
        </div>

        {f.tipo !== 'prn' && (<>
          <div className="md-campo">
            <span className="md-campo-titulo">¿En qué rondas? <em>La hora es opcional; si la pones, debe caer dentro de la ronda.</em></span>
            <div className="pf-rondas">
              {activas.map(r => {
                const hs = enRonda(r.id)
                return (
                  <div key={r.id} className={`pf-ronda${hs.length ? ' on' : ''}`}>
                    <button type="button" className="pf-ronda-btn" onClick={() => alternarRonda(r)} aria-pressed={!!hs.length}>
                      <span className="pf-check">{hs.length ? <Check size={15} /> : null}</span>
                      <b>{r.nombre}</b><small>{r.detalle} · {r.hora_inicio}–{r.hora_fin}</small>
                    </button>
                    {hs.length > 0 && (
                      <div className="pf-horas">
                        {hs.map((h, i) => (
                          <span key={i} className="pf-hora">
                            <input type="time" className="md-input" value={h.hora} min={r.hora_inicio} max={r.hora_fin}
                              onChange={e => cambiarHora(r, i, e.target.value)} aria-label={`Hora en la ronda ${r.nombre}`} />
                            {hs.length > 1 && <button type="button" className="md-icono" onClick={() => quitarHora(r, i)} aria-label="Quitar hora"><X /></button>}
                          </span>
                        ))}
                        <button type="button" className="rl-link" onClick={() => otraHora(r)}><Plus size={14} /> Otra hora</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="md-campo">
            <span className="md-campo-titulo">¿Qué días?</span>
            <div className="md-seg pf-modo">
              {[['todos', 'Todos los días'], ['semana', 'Ciertos días'], ['cada_n', 'Cada N días']].map(([id, l]) => (
                <button key={id} type="button" className={f.dias_modo === id ? 'on' : ''} onClick={() => set('dias_modo')(id)}>{l}</button>
              ))}
            </div>
            {f.dias_modo === 'semana' && (
              <div className="pf-dias">
                {DIAS_SEMANA.map(d => (
                  <button key={d.v} type="button" className={f.dias_semana.includes(d.v) ? 'on' : ''} onClick={() => alternarDia(d.v)}
                    aria-pressed={f.dias_semana.includes(d.v)} title={d.largo} aria-label={d.largo}>{d.corto}</button>
                ))}
                <span className="pf-atajos">
                  <button type="button" className="rl-link" onClick={() => set('dias_semana')([1, 2, 3, 4, 5])}>L a V</button>
                  <button type="button" className="rl-link" onClick={() => set('dias_semana')([6, 0])}>Fin de semana</button>
                  <button type="button" className="rl-link" onClick={() => set('dias_semana')([1, 3, 5])}>L, Mi, V</button>
                </span>
              </div>
            )}
            {f.dias_modo === 'cada_n' && (
              <label className="pf-cada">Cada
                <input className="md-input" inputMode="numeric" value={f.cada_n_dias} onChange={e => set('cada_n_dias')(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                días, contando desde la fecha de inicio
              </label>
            )}
          </div>
        </>)}

        {f.tipo === 'prn' && (
          <div className="md-grid">
            <label className="md-full">¿Para qué se usa?
              <input className="md-input" value={f.prn_motivo} onChange={set('prn_motivo')} placeholder="Ej. dolor, fiebre, ansiedad" />
            </label>
            <label>Máximo en 24 horas <em>(opcional)</em>
              <input className="md-input" inputMode="decimal" value={f.prn_max_24h} onChange={e => set('prn_max_24h')(soloNumero(e.target.value))} placeholder={`Ej. 3 ${unidad(opciones, ud, 3)}`} />
            </label>
            <label>Horas mínimas entre dosis <em>(opcional)</em>
              <input className="md-input" inputMode="decimal" value={f.prn_intervalo_h} onChange={e => set('prn_intervalo_h')(soloNumero(e.target.value))} placeholder="Ej. 8" />
            </label>
          </div>
        )}

        {f.tipo === 'variable' && (
          <div className="md-grid">
            <label>Se mide
              <select className="md-input" value={f.medicion_requerida} onChange={set('medicion_requerida')}>
                {opciones.mediciones.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="md-full">Escala: qué dosis va según la medición
              <textarea className="md-input" rows={3} value={f.escala} onChange={set('escala')}
                placeholder={'Ej.\n150–200: 2 UI\n201–250: 4 UI\nMás de 250: 6 UI y avisar al médico'} />
            </label>
          </div>
        )}

        <div className="md-grid">
          <label>Desde
            <input className="md-input" type="date" value={f.fecha_inicio} onChange={set('fecha_inicio')} />
          </label>
          <label>Hasta <em>(vacío = sin fecha de fin)</em>
            <span className="pf-fin">
              <input className="md-input" type="date" value={f.fecha_fin} min={f.fecha_inicio} onChange={set('fecha_fin')} />
              {f.fecha_fin && <button type="button" className="md-icono" onClick={() => set('fecha_fin')('')} aria-label="Quitar fecha de fin"><X /></button>}
            </span>
          </label>
          <div className="md-campo">
            <span className="md-campo-titulo">¿Quién la provee?</span>
            <div className="md-seg">
              {opciones.provee.map(p => (
                <button key={p.id} type="button" className={f.provee === p.id ? 'on' : ''} onClick={() => set('provee')(p.id)}>{p.label}</button>
              ))}
            </div>
          </div>
          <label>Vía
            <select className="md-input" value={f.via || ''} onChange={set('via')}>
              <option value="">Según la forma</option>
              {opciones.vias.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <label>Indicaciones <em>(sin días ni fechas)</em>
            <input className="md-input" value={f.indicaciones} onChange={set('indicaciones')} placeholder="Ej. en ayunas, con alimento" />
          </label>
          <label>Médico que lo indica <em>(opcional)</em>
            <input className="md-input" value={f.medico} onChange={set('medico')} />
          </label>
        </div>

        {versionara && (
          <label className="md-label pf-motivo">Motivo del cambio <em>(si cambias dosis, rondas, días o fechas)</em>
            <input ref={motivoRef} className="md-input" value={f.motivo_cambio} onChange={set('motivo_cambio')} placeholder="Ej. el médico bajó la dosis" />
            <small className="md-nota"><Info size={14} /> La versión anterior se guarda en el historial; no se pierde.</small>
          </label>
        )}

        <div className={`pf-previa${revision?.error ? ' con-error' : ''}`} aria-live="polite">
          <span className="pf-previa-titulo">Así queda {revisando && <Loader2 className="md-spin" size={14} />}</span>
          {revision?.error ? <p className="pf-previa-error"><AlertTriangle size={16} /> {revision.error}</p>
            : revision ? <p>{revision.texto}</p> : <p className="md-nota">Completa los datos para ver el resumen.</p>}
          {avisos.length > 0 && (
            <ul className="pf-avisos">
              {avisos.map((a, i) => (
                <li key={i} className={a.grave ? 'grave' : a.tipo === 'stock' ? 'stock' : ''}>
                  {a.tipo === 'alergia' ? <ShieldAlert size={16} /> : a.grave ? <AlertTriangle size={16} /> : <Info size={16} />} {a.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      </>)}

      {confirmarAvisos && (
        <div className="pf-confirmar" role="alert">
          <AlertTriangle />
          <div>
            <strong>Antes de guardar, revisa:</strong>
            <ul>{confirmarAvisos.map((a, i) => <li key={i}>{a.texto}</li>)}</ul>
          </div>
          <button className="rl-btn" onClick={() => setConfirmarAvisos(null)}>Revisar</button>
          <button className="rl-btn rl-btn-primary" onClick={() => guardar(true)} disabled={guardando}>Guardar de todos modos</button>
        </div>
      )}
      {error && <div className="rl-error" role="alert">{error}</div>}
    </Dialogo>
  )
}
