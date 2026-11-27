import { useCallback, useEffect, useMemo, useState } from 'react'
import { pedir, enviar, DIAS_SEMANA, fechaCorta } from './medicacionUtil'
import { Dialogo } from './CatalogoMedicamentos'
import { fechaLocal } from './signosVitales'
import { Avatar, DiaBarra, DialogoBano, EstadoBano } from './Banos'
import {
  Check, Loader2, Plus, Pencil, Trash2, Users, User, Bath, Copy, StickyNote, Clock, ChevronDown, ListChecks,
} from 'lucide-react'
import './medicacion.css'
import './actividades.css'
import './rolDia.css'
import RolDia from './RolDia'

// Actividades del personal.
// · Mis actividades: lo que le toca hoy a quien entró, para marcarlo como hecho.
// · Monitoreo (permiso actividades: ver): avance de cada persona y puesto.
// · Asignar (permiso actividades: editar): se escriben una vez y se repiten solas.

const API = '/api/gestion/actividades'
const TURNO_CORTO = { 'Matutino-Vespertino': 'Mañana', Nocturno: 'Noche' }

// Ideas para no escribir todo desde cero (se pueden editar antes de guardar)
const SUGERENCIAS = {
  enfermeria: ['Cambio de pañal cada 2 horas', 'Cambios de posición', 'Ofrecer agua a los residentes', 'Acompañar en las comidas',
    'Revisar timbres y barandales', 'Ordenar el carro de curación', 'Entregar turno'],
  encargado_enfermeria: ['Revisar los reportes del turno', 'Revisar existencias de medicamentos', 'Supervisar los baños', 'Pasar ronda por las habitaciones'],
  limpieza: ['Barrer y trapear áreas comunes', 'Limpiar baños', 'Sacar la basura', 'Cambiar sábanas', 'Lavar ropa de residentes',
    'Desinfectar barandales y manijas', 'Limpiar comedor'],
  cocina: ['Preparar desayuno', 'Preparar comida', 'Preparar cena', 'Preparar colaciones', 'Lavar trastes',
    'Revisar caducidades del refrigerador', 'Limpiar la cocina'],
  administracion: ['Revisar pagos pendientes', 'Contestar mensajes de familiares', 'Revisar compras de la semana'],
}

function textoRepeticion(r) {
  if (r.repeticion === 'una_vez') return `Solo el ${fechaCorta(r.fecha)}`
  if (r.repeticion === 'semana') {
    const d = [...r.dias_semana].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    const k = d.join(',')
    if (k === '1,2,3,4,5') return 'De lunes a viernes'
    if (k === '6,0') return 'Fines de semana'
    if (d.length === 7) return 'Todos los días'
    return d.map(v => DIAS_SEMANA.find(x => x.v === v)?.largo.slice(0, 3)).join(', ')
  }
  return 'Todos los días'
}

/** Tareas del rol del día con la misma forma que las fijas (clave distinta para no chocar). */
const tareasDeRol = (rol) => (rol?.tareas || []).map(t => deRol(t))
const deRol = (t) => ({ id: `r${t.uid}`, uid: t.uid, fuente: 'rol', titulo: t.titulo, resaltada: t.resaltada, hecha: t.hecha })

const porcentaje = (h, t) => (t ? Math.round((h / t) * 100) : 0)

/** Barra de avance con "3 de 7" */
function Avance({ hechas, total, grande }) {
  const p = porcentaje(hechas, total)
  return (
    <div className={`ac-avance${grande ? ' grande' : ''}${total && hechas === total ? ' completo' : ''}`}>
      <div className="ac-avance-txt"><b>{hechas}</b> de {total} {grande ? (total === 1 ? 'hecha' : 'hechas') : ''}<span>{p}%</span></div>
      <span className="cd-barra"><i style={{ width: `${p}%` }} /></span>
    </div>
  )
}

export default function Actividades({ usuario, permisos, inicial }) {
  const puedeVer = !!permisos.actividades
  const puedeAsignar = permisos.actividades === 'editar'
  const [vista, setVista] = useState(() => (inicial === 'rol' && permisos.actividades === 'editar') || (inicial === 'monitoreo' && permisos.actividades) ? inicial : 'mias')

  return (
    <div className="ac-root">
      <header className="gl-header"><h1>{{ mias: 'Mis actividades', rol: 'Rol del día', monitoreo: 'Monitoreo de actividades' }[vista]}</h1></header>
      {puedeVer && (
        <div className="rl-tabs" role="tablist">
          <button role="tab" aria-selected={vista === 'mias'} className={vista === 'mias' ? 'active' : ''} onClick={() => setVista('mias')}>Mis actividades</button>
          {puedeAsignar && <button role="tab" aria-selected={vista === 'rol'} className={vista === 'rol' ? 'active' : ''} onClick={() => setVista('rol')}>Rol del día</button>}
          <button role="tab" aria-selected={vista === 'monitoreo'} className={vista === 'monitoreo' ? 'active' : ''} onClick={() => setVista('monitoreo')}>Monitoreo</button>
        </div>
      )}
      {vista === 'mias' ? <MisActividades usuario={usuario} />
        : vista === 'rol' ? <RolDia />
        : <Monitoreo />}
    </div>
  )
}

// ── Mis actividades ──────────────────────────────────────────────────────────
function MisActividades({ usuario }) {
  const [fecha, setFecha] = useState(fechaLocal())
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState({})   // id → true
  const [nota, setNota] = useState(null)       // actividad con el diálogo de nota
  const [bano, setBano] = useState(null)

  const cargar = useCallback(async () => {
    setError('')
    try { setDatos(await pedir(`${API}/mias?fecha=${fecha}`)) } catch (e) { setError(e.message) }
  }, [fecha])
  useEffect(() => { setDatos(null); cargar() }, [cargar])

  const hoy = datos?.hoy || fechaLocal()
  const futuro = fecha > hoy
  const acts = useMemo(() => [...tareasDeRol(datos?.rol), ...(datos?.actividades || [])], [datos])
  const banos = datos?.banos || []
  const miRol = datos?.rol
  const total = acts.length + banos.length
  const hechas = acts.filter(a => a.hecha).length + banos.filter(b => b.registro).length
  const conRol = miRol && (miRol.horario || miRol.residentes.length)

  const reemplazar = (a) => setDatos(d => (a.fuente === 'rol'
    ? { ...d, rol: { ...d.rol, tareas: d.rol.tareas.map(t => (t.uid === a.uid ? { ...t, hecha: a.hecha } : t)) } }
    : { ...d, actividades: d.actividades.map(x => (x.id === a.id ? a : x)) }))

  async function alternar(a, textoNota) {
    if (futuro) return
    setOcupado(o => ({ ...o, [a.id]: true })); setError('')
    // Al instante en pantalla; si falla, se regresa
    const previa = a
    reemplazar({ ...a, hecha: a.hecha && textoNota === undefined ? null : { usuario_id: usuario.id, usuario_nombre: usuario.nombre, hecha_en: a.hecha?.hecha_en || '…', nota: textoNota ?? a.hecha?.nota ?? '' } })
    try {
      const quitar = a.hecha && textoNota === undefined
      const nota = textoNota ?? a.hecha?.nota ?? ''
      if (a.fuente === 'rol') {
        const url = `/api/gestion/rol/${fecha}/tarea/${a.uid}/hecha`
        reemplazar(deRol(quitar ? await pedir(url, { method: 'DELETE' }) : await enviar(url, 'POST', { nota })))
      } else {
        reemplazar(quitar
          ? await pedir(`${API}/${a.id}/hecha?fecha=${fecha}`, { method: 'DELETE' })
          : await enviar(`${API}/${a.id}/hecha`, 'POST', { fecha, nota }))
      }
    } catch (e) { reemplazar(previa); setError(e.message) }
    finally { setOcupado(o => ({ ...o, [a.id]: false })) }
  }

  const pendientes = acts.filter(a => !a.hecha)
  const listas = acts.filter(a => a.hecha)

  const filaAct = (a) => {
    const deOtro = a.hecha && a.hecha.usuario_id !== usuario.id
    return (
      <div key={a.id} className={`ac-act${a.hecha ? ' hecha' : ''}${a.resaltada ? ' resaltada' : ''}`}>
        <button className="ac-check" onClick={() => alternar(a)} disabled={futuro || ocupado[a.id]} aria-pressed={!!a.hecha}
          aria-label={a.hecha ? `Desmarcar ${a.titulo}` : `Marcar ${a.titulo} como hecha`}>
          {ocupado[a.id] ? <Loader2 className="cd-spin" /> : a.hecha ? <Check /> : null}
        </button>
        <button className="ac-act-main" onClick={() => alternar(a)} disabled={futuro || ocupado[a.id]}>
          <strong>{a.titulo}</strong>
          {a.detalle && <span className="ac-act-detalle">{a.detalle}</span>}
          <span className="ac-act-meta">
            {a.hora && <i><Clock /> {a.hora}</i>}
            {a.turno && <i>{TURNO_CORTO[a.turno]}</i>}
            {a.compartida && <i title="Le toca a todo tu puesto; la primera persona que la marca la cierra"><Users /> De todo el puesto</i>}
            {a.hecha && <i className="ok">{deOtro ? `La hizo ${a.hecha.usuario_nombre.split(' ')[0]}` : 'Hecha'} · {a.hecha.hecha_en}</i>}
            {a.hecha?.nota && <i className="nota"><StickyNote /> {a.hecha.nota}</i>}
          </span>
        </button>
        {!futuro && <button className="rl-icon-btn ac-nota-btn" onClick={() => setNota(a)} title="Agregar una nota" aria-label={`Nota para ${a.titulo}`}><StickyNote /></button>}
      </div>
    )
  }

  return (
    <>
      <DiaBarra fecha={fecha} onCambio={setFecha} hoy={hoy} />
      {error && <div className="rl-error">{error}</div>}
      {!datos ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div> : total === 0 && !conRol ? (
        <div className="ac-panel ac-vacio-grande">
          <ListChecks />
          <strong>No tienes actividades {fecha === hoy ? 'hoy' : 'este día'}</strong>
          <span>Cuando la encargada te asigne actividades, aquí las vas a ver para marcarlas.</span>
        </div>
      ) : (<>
        {conRol && (
          <section className="ac-panel ac-mirol">
            <div className="ac-mirol-head">
              <h2 className="ac-h2"><Users /> Tu rol {fecha === hoy ? 'de hoy' : 'de este día'}</h2>
              {miRol.horario && <span className="ac-horario"><Clock /> {miRol.horario}</span>}
            </div>
            {miRol.residentes.length > 0 && (
              <div className="rd-chips">
                {miRol.residentes.map(r => (
                  <span key={r.id} className={`rd-chip${r.resaltado ? ' resaltado' : ''}`} title={r.nombre}>
                    {r.corto}{r.toca_bano && <Bath className="rd-bano" aria-label="le toca baño" />}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}
        {total > 0 && <div className="ac-panel ac-resumen">
          <Avance hechas={hechas} total={total} grande />
          {futuro && <span className="ac-sutil">Es un día que no ha llegado: puedes ver lo que te toca, pero no marcarlo.</span>}
          {!futuro && hechas === total && <span className="ac-felicita"><Check /> Terminaste todo lo de {fecha === hoy ? 'hoy' : 'este día'}.</span>}
        </div>}

        {banos.length > 0 && (
          <section className="ac-panel">
            <h2 className="ac-h2"><Bath /> Baños que te tocan <span>{banos.filter(b => b.registro).length} de {banos.length}</span></h2>
            {banos.map(b => (
              <button key={b.residente.id} className={`ac-bano-fila ac-bano-btn${b.registro ? ` ${b.registro.estado}` : ''}`} disabled={futuro} onClick={() => setBano(b)}>
                <Avatar r={b.residente} />
                <div className="ac-bano-info">
                  <strong>{b.residente.nombre}</strong>
                  <span>{[b.residente.habitacion && `Hab. ${b.residente.habitacion}`, b.turno && TURNO_CORTO[b.turno], b.notas].filter(Boolean).join(' · ')}</span>
                </div>
                <EstadoBano registro={b.registro} />
              </button>
            ))}
          </section>
        )}

        {acts.length > 0 && (
          <section className="ac-panel">
            <h2 className="ac-h2"><ListChecks /> Pendientes <span>{pendientes.length}</span></h2>
            {pendientes.length ? pendientes.map(filaAct) : <p className="ac-vacio">No te queda nada pendiente.</p>}
            {listas.length > 0 && <>
              <h2 className="ac-h2 ac-h2-sep"><Check /> Hechas <span>{listas.length}</span></h2>
              {listas.map(filaAct)}
            </>}
          </section>
        )}
      </>)}

      {nota && <DialogoNota actividad={nota} onCerrar={() => setNota(null)} onGuardar={(t) => { alternar(nota, t); setNota(null) }} />}
      {bano && (
        <DialogoBano residente={bano.residente} fecha={fecha} registro={bano.registro} onCerrar={() => setBano(null)}
          onGuardado={(reg) => {
            setDatos(d => ({ ...d, banos: d.banos.map(x => (x.residente.id === bano.residente.id ? { ...x, registro: reg } : x)) }))
            setBano(null)
          }} />
      )}
    </>
  )
}

function DialogoNota({ actividad, onCerrar, onGuardar }) {
  const [t, setT] = useState(actividad.hecha?.nota || '')
  return (
    <Dialogo titulo="Nota" sub={actividad.titulo} onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={() => onGuardar(t.trim())}><Check /> {actividad.hecha ? 'Guardar nota' : 'Guardar y marcar como hecha'}</button></>}>
      <textarea className="md-input ac-textarea" rows={3} maxLength={300} autoFocus value={t} onChange={e => setT(e.target.value)}
        placeholder="Por ejemplo: faltó cloro, se avisó a la encargada" />
    </Dialogo>
  )
}

// ── Monitoreo ────────────────────────────────────────────────────────────────
function Monitoreo() {
  const [fecha, setFecha] = useState(fechaLocal())
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState({})

  useEffect(() => {
    setDatos(null); setError('')
    pedir(`${API}/monitoreo?fecha=${fecha}`).then(setDatos).catch(e => setError(e.message))
  }, [fecha])

  const tarjetas = useMemo(() => {
    if (!datos) return []
    const personas = datos.personas.map(p => ({
      clave: `u${p.usuario.id}`, titulo: p.usuario.nombre, sub: [p.usuario.rol_label, p.rol?.horario].filter(Boolean).join(' · '), icono: User,
      actividades: [...tareasDeRol(p.rol), ...p.actividades], banos: p.banos,
    })).map(t => ({
      ...t, total: t.actividades.length + t.banos.length,
      hechas: t.actividades.filter(a => a.hecha).length + t.banos.filter(b => b.registro).length,
    }))
    const puestos = datos.puestos.map(p => ({
      clave: `r${p.rol}`, titulo: `Puesto: ${p.rol_label}`, sub: p.personas.length ? p.personas.join(', ') : 'Nadie tiene este puesto', icono: Users,
      actividades: p.actividades, banos: [], total: p.actividades.length, hechas: p.actividades.filter(a => a.hecha).length,
    }))
    // Primero quien va más atrasado
    return [...personas, ...puestos].sort((a, b) => porcentaje(a.hechas, a.total) - porcentaje(b.hechas, b.total))
  }, [datos])

  const total = tarjetas.reduce((s, t) => s + t.total, 0)
  const hechas = tarjetas.reduce((s, t) => s + t.hechas, 0)

  return (
    <>
      <DiaBarra fecha={fecha} onCambio={setFecha} hoy={datos?.hoy || fechaLocal()} />
      {error && <div className="rl-error">{error}</div>}
      {!datos ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div> : !tarjetas.length ? (
        <div className="ac-panel ac-vacio-grande"><ListChecks /><strong>No hay actividades asignadas para este día</strong><span>Arma el rol en la pestaña Rol del día.</span></div>
      ) : (<>
        <section className="cd-resumen">
          <div className="cd-card cd-card-fija" style={{ '--i': 0 }}>
            <span className="cd-card-titulo">Avance del día</span>
            <strong>{porcentaje(hechas, total)}%</strong>
            <span className="cd-barra"><i style={{ width: `${porcentaje(hechas, total)}%` }} /></span>
          </div>
          <div className="cd-card cd-card-fija" style={{ '--i': 1 }}>
            <span className="cd-card-titulo">Hechas</span>
            <strong>{hechas}<small> / {total}</small></strong>
            <span className="cd-card-pie">{total - hechas} pendientes</span>
          </div>
          <div className={`cd-card cd-card-alerta${tarjetas.some(t => t.total && t.hechas === 0) ? ' hay' : ''}`} style={{ '--i': 2 }}>
            <span className="cd-card-titulo">Sin empezar</span>
            <strong>{tarjetas.filter(t => t.total && t.hechas === 0).length}</strong>
            <span className="cd-card-pie">Personas o puestos sin nada marcado</span>
          </div>
        </section>

        <div className="ac-mon-grid">
          {tarjetas.map(t => {
            const Icono = t.icono
            const ver = abierto[t.clave]
            return (
              <div key={t.clave} className="ac-panel ac-mon">
                <button className="ac-mon-head" onClick={() => setAbierto(a => ({ ...a, [t.clave]: !a[t.clave] }))} aria-expanded={!!ver}>
                  <span className="ac-mon-ico"><Icono /></span>
                  <span className="ac-mon-tit"><strong>{t.titulo}</strong><span>{t.sub}</span></span>
                  <ChevronDown className={ver ? 'girado' : ''} />
                </button>
                <Avance hechas={t.hechas} total={t.total} />
                {ver && (
                  <ul className="ac-mon-lista">
                    {t.banos.map(b => (
                      <li key={`b${b.residente.id}`} className={b.registro ? 'hecha' : ''}>
                        <span className="ac-mini-check">{b.registro && <Check />}</span>
                        <span>Baño de {b.residente.nombre}</span>
                        <EstadoBano registro={b.registro} />
                      </li>
                    ))}
                    {t.actividades.map(a => (
                      <li key={a.id} className={a.hecha ? 'hecha' : ''}>
                        <span className="ac-mini-check">{a.hecha && <Check />}</span>
                        <span>{a.titulo}{a.hora && <em> · {a.hora}</em>}</span>
                        {a.hecha
                          ? <em className="ac-quien">{a.compartida ? `${a.hecha.usuario_nombre.split(' ')[0]} · ` : ''}{a.hecha.hecha_en}{a.hecha.nota ? ` · “${a.hecha.nota}”` : ''}</em>
                          : <em className="ac-quien pend">Pendiente</em>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </>)}
    </>
  )
}

// ── Asignar ──────────────────────────────────────────────────────────────────
/** Actividades fijas (se editan en Configuración → Actividades). */
export function Asignar() {
  const [gente, setGente] = useState(null)
  const [rutinas, setRutinas] = useState([])
  const [sel, setSel] = useState(null)          // { tipo: 'usuario'|'rol', id, nombre, rol }
  const [error, setError] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [editando, setEditando] = useState(null)
  const [copiar, setCopiar] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [g, r] = await Promise.all([pedir(`${API}/personal`), pedir(`${API}/rutinas`)])
      setGente(g); setRutinas(r)
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const deSel = (r, s = sel) => s && (s.tipo === 'usuario' ? r.asignado_tipo === 'usuario' && r.usuario_id === s.id : r.asignado_tipo === 'rol' && r.rol === s.id)
  const cuenta = (s) => rutinas.filter(r => deSel(r, s)).length
  const lista = rutinas.filter(r => deSel(r))

  useEffect(() => {
    if (gente && !sel) {
      const p = gente.personal.find(x => x.rol !== 'admin') || gente.personal[0]
      if (p) setSel({ tipo: 'usuario', id: p.id, nombre: p.nombre, rol: p.rol })
    }
  }, [gente, sel])

  async function quitar(r) {
    setError('')
    try {
      await enviar(`${API}/rutinas/${r.id}/quitar`, 'POST')
      setRutinas(l => l.filter(x => x.id !== r.id))
    } catch (e) { setError(e.message) }
  }

  if (!gente) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>

  const opciones = [
    ...gente.personal.map(p => ({ tipo: 'usuario', id: p.id, nombre: p.nombre, rol: p.rol, sub: p.rol_label })),
    ...gente.puestos.map(p => ({ tipo: 'rol', id: p.id, nombre: p.label, rol: p.id, sub: 'Todo el puesto' })),
  ]

  return (<>
    <p className="ac-ayuda">Aquí va lo que se repite igual siempre (por ejemplo, cada lunes o todos los días). Lo que cambia de un día a otro se reparte en <b>Rol del día</b>.</p>
    <div className="ac-asignar">
      <aside className="ac-panel ac-quienes">
        <h3>Personas</h3>
        {gente.personal.map(p => {
          const s = { tipo: 'usuario', id: p.id, nombre: p.nombre, rol: p.rol }
          const on = sel?.tipo === 'usuario' && sel.id === p.id
          return (
            <button key={`u${p.id}`} className={`ac-quien-btn${on ? ' on' : ''}`} onClick={() => { setSel(s); setAgregando(false); setAviso('') }}>
              <User /><span><strong>{p.nombre}</strong><em>{p.rol_label}</em></span><b>{cuenta(s) || ''}</b>
            </button>
          )
        })}
        <h3>Puestos completos</h3>
        <p className="ac-sutil ac-quienes-ayuda">Lo que asignes a un puesto lo ve todo ese puesto, aunque entre alguien nuevo.</p>
        {gente.puestos.map(p => {
          const s = { tipo: 'rol', id: p.id, nombre: p.label, rol: p.id }
          const on = sel?.tipo === 'rol' && sel.id === p.id
          return (
            <button key={`r${p.id}`} className={`ac-quien-btn${on ? ' on' : ''}`} onClick={() => { setSel(s); setAgregando(false); setAviso('') }}>
              <Users /><span><strong>{p.label}</strong></span><b>{cuenta(s) || ''}</b>
            </button>
          )
        })}
      </aside>

      <section className="ac-panel ac-rutinas">
        {sel && (<>
          <div className="ac-rutinas-head">
            <div>
              <h2>{sel.tipo === 'rol' ? `Puesto: ${sel.nombre}` : sel.nombre}</h2>
              <span className="ac-sutil">{lista.length ? `${lista.length} ${lista.length === 1 ? 'actividad' : 'actividades'} · se repiten solas` : 'Sin actividades todavía'}</span>
            </div>
            <div className="ac-rutinas-acc">
              <button className="rl-btn" onClick={() => setCopiar(true)}><Copy /> Copiar de otra persona</button>
              {!agregando && <button className="rl-btn rl-btn-primary" onClick={() => { setAgregando(true); setAviso('') }}><Plus /> Agregar actividades</button>}
            </div>
          </div>
          {error && <div className="rl-error">{error}</div>}
          {aviso && <div className="ac-aviso-ok"><Check /> {aviso}</div>}

          {agregando && (
            <FormRutinas destino={sel} onCerrar={() => setAgregando(false)}
              onGuardadas={(nuevas) => { setRutinas(l => [...l, ...nuevas]); setAgregando(false); setAviso(`Se ${nuevas.length === 1 ? 'agregó 1 actividad' : `agregaron ${nuevas.length} actividades`}.`) }} />
          )}

          {lista.length === 0 && !agregando ? (
            <p className="ac-vacio">Toca <b>Agregar actividades</b> y escribe una por renglón: se guardan todas juntas y se repiten solas.</p>
          ) : (
            <ul className="ac-rut-lista">
              {lista.map(r => <FilaRutina key={r.id} r={r} onEditar={() => setEditando(r)} onQuitar={() => quitar(r)} />)}
            </ul>
          )}
        </>)}
      </section>

      {editando && (
        <DialogoEditar rutina={editando} opciones={opciones} onCerrar={() => setEditando(null)}
          onGuardada={(r) => { setRutinas(l => l.map(x => (x.id === r.id ? r : x))); setEditando(null) }} />
      )}
      {copiar && (
        <DialogoCopiar destino={sel} opciones={opciones.filter(o => !(o.tipo === sel.tipo && o.id === sel.id))} rutinas={rutinas}
          onCerrar={() => setCopiar(false)}
          onCopiado={async (n, omitidas) => { setCopiar(false); await cargar(); setAviso(`Se copiaron ${n} ${n === 1 ? 'actividad' : 'actividades'}${omitidas ? ` (${omitidas} ya las tenía)` : ''}.`) }} />
      )}
    </div>
  </>)
}

function FilaRutina({ r, onEditar, onQuitar }) {
  const [confirmar, setConfirmar] = useState(false)
  return (
    <li className="ac-rut">
      <div className="ac-rut-main">
        <strong>{r.titulo}</strong>
        {r.detalle && <span className="ac-act-detalle">{r.detalle}</span>}
        <span className="ac-act-meta">
          <i>{textoRepeticion(r)}</i>
          {r.turno && <i>{TURNO_CORTO[r.turno]}</i>}
          {r.hora && <i><Clock /> {r.hora}</i>}
        </span>
      </div>
      {confirmar ? (
        <span className="ac-confirmar">¿Quitarla? Ya no saldrá desde hoy.
          <button className="rl-btn" onClick={() => setConfirmar(false)}>No</button>
          <button className="rl-btn md-btn-peligro" onClick={onQuitar}>Sí, quitar</button>
        </span>
      ) : (<>
        <button className="rl-icon-btn" onClick={onEditar} aria-label={`Editar ${r.titulo}`} title="Editar"><Pencil /></button>
        <button className="rl-icon-btn" onClick={() => setConfirmar(true)} aria-label={`Quitar ${r.titulo}`} title="Quitar"><Trash2 /></button>
      </>)}
    </li>
  )
}

/** Repetición, turno y hora (compartido por agregar y editar). */
function CamposRepeticion({ f, set }) {
  const toggleDia = (v) => set({ dias_semana: f.dias_semana.includes(v) ? f.dias_semana.filter(x => x !== v) : [...f.dias_semana, v] })
  return (<>
    <div className="ac-campo">
      <span className="ac-campo-titulo">¿Cuándo?</span>
      <div className="md-seg" role="group">
        {[['diaria', 'Todos los días'], ['semana', 'Ciertos días'], ['una_vez', 'Un solo día']].map(([v, l]) => (
          <button key={v} type="button" className={f.repeticion === v ? 'on' : ''} onClick={() => set({ repeticion: v })}>{l}</button>
        ))}
      </div>
      {f.repeticion === 'semana' && (
        <div className="ac-dias ac-dias-grandes">
          {DIAS_SEMANA.map(d => (
            <button key={d.v} type="button" className={f.dias_semana.includes(d.v) ? 'on' : ''} onClick={() => toggleDia(d.v)} aria-pressed={f.dias_semana.includes(d.v)} title={d.largo}>{d.largo.slice(0, 2)}</button>
          ))}
          <button type="button" className="ac-atajo" onClick={() => set({ dias_semana: [1, 2, 3, 4, 5] })}>L a V</button>
          <button type="button" className="ac-atajo" onClick={() => set({ dias_semana: [6, 0] })}>Fin de semana</button>
        </div>
      )}
      {f.repeticion === 'una_vez' && (
        <input className="md-input ac-fecha" type="date" min={fechaLocal()} value={f.fecha} onChange={e => set({ fecha: e.target.value })} />
      )}
    </div>
    <div className="ac-fila-campos">
      <div className="ac-campo">
        <span className="ac-campo-titulo">Turno</span>
        <div className="md-seg" role="group">
          {[['', 'Cualquiera'], ['Matutino-Vespertino', 'Mañana'], ['Nocturno', 'Noche']].map(([v, l]) => (
            <button key={v || 'x'} type="button" className={(f.turno || '') === v ? 'on' : ''} onClick={() => set({ turno: v || null })}>{l}</button>
          ))}
        </div>
      </div>
      <label className="ac-campo ac-campo-hora"><span className="ac-campo-titulo">Hora <small>(opcional)</small></span>
        <input className="md-input" type="time" value={f.hora} onChange={e => set({ hora: e.target.value })} />
      </label>
    </div>
  </>)
}

const asignacion = (d) => (d.tipo === 'rol' ? { asignado_tipo: 'rol', rol: d.id } : { asignado_tipo: 'usuario', usuario_id: d.id })

function FormRutinas({ destino, onCerrar, onGuardadas }) {
  const [texto, setTexto] = useState('')
  const [f, setF] = useState({ repeticion: 'diaria', dias_semana: [1, 2, 3, 4, 5], fecha: fechaLocal(), turno: null, hora: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const set = (c) => setF(x => ({ ...x, ...c }))
  const titulos = texto.split('\n').map(t => t.trim()).filter(Boolean)
  const sugerencias = (SUGERENCIAS[destino.rol] || []).filter(s => !titulos.some(t => t.toLowerCase() === s.toLowerCase()))

  async function guardar() {
    if (!titulos.length) return setError('Escribe al menos una actividad.')
    setGuardando(true); setError('')
    try {
      onGuardadas(await enviar(`${API}/rutinas`, 'POST', { titulos, ...asignacion(destino), ...f }))
    } catch (e) { setError(e.message); setGuardando(false) }
  }

  return (
    <div className="ac-form ac-form-caja">
      <label className="ac-campo">
        <span className="ac-campo-titulo">Actividades <small>— una por renglón; puedes pegar una lista</small></span>
        <textarea className="md-input ac-textarea" rows={5} autoFocus value={texto} onChange={e => setTexto(e.target.value)}
          placeholder={'Barrer y trapear la sala\nLimpiar baños de planta baja\nSacar la basura'} />
      </label>
      {sugerencias.length > 0 && (
        <div className="ac-campo">
          <span className="ac-campo-titulo">Ideas <small>(toca para agregar)</small></span>
          <div className="rt-chips">
            {sugerencias.map(s => <button key={s} type="button" className="rt-chip" onClick={() => setTexto(t => (t.trim() ? `${t.replace(/\s+$/, '')}\n${s}` : s))}><Plus />{s}</button>)}
          </div>
        </div>
      )}
      <CamposRepeticion f={f} set={set} />
      {error && <div className="rl-error ac-error">{error}</div>}
      <div className="ac-form-pie">
        <button className="rl-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando || !titulos.length}>
          {guardando ? <Loader2 className="cd-spin" /> : <Check />} {titulos.length > 1 ? `Guardar ${titulos.length} actividades` : 'Guardar actividad'}
        </button>
      </div>
    </div>
  )
}

function DialogoEditar({ rutina, opciones, onCerrar, onGuardada }) {
  const [f, setF] = useState({
    titulo: rutina.titulo, detalle: rutina.detalle || '', repeticion: rutina.repeticion,
    dias_semana: rutina.dias_semana.length ? rutina.dias_semana : [1, 2, 3, 4, 5], fecha: rutina.fecha || fechaLocal(), turno: rutina.turno, hora: rutina.hora || '',
    destino: rutina.asignado_tipo === 'rol' ? `rol:${rutina.rol}` : `usuario:${rutina.usuario_id}`,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const set = (c) => setF(x => ({ ...x, ...c }))

  async function guardar() {
    setGuardando(true); setError('')
    const [tipo, id] = f.destino.split(':')
    try {
      onGuardada(await enviar(`${API}/rutinas/${rutina.id}`, 'PUT', { ...f, ...asignacion({ tipo, id: tipo === 'rol' ? id : Number(id) }) }))
    } catch (e) { setError(e.message); setGuardando(false) }
  }

  return (
    <Dialogo titulo="Editar actividad" onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando || !f.titulo.trim()}>{guardando ? <Loader2 className="cd-spin" /> : <Check />} Guardar</button></>}>
      <div className="ac-form">
        <label className="ac-campo"><span className="ac-campo-titulo">Actividad</span>
          <input className="md-input" value={f.titulo} maxLength={140} onChange={e => set({ titulo: e.target.value })} /></label>
        <label className="ac-campo"><span className="ac-campo-titulo">Indicaciones <small>(opcional)</small></span>
          <input className="md-input" value={f.detalle} maxLength={400} onChange={e => set({ detalle: e.target.value })} placeholder="Cómo hacerla, qué usar…" /></label>
        <label className="ac-campo"><span className="ac-campo-titulo">Para</span>
          <select className="md-input" value={f.destino} onChange={e => set({ destino: e.target.value })}>
            {opciones.map(o => <option key={`${o.tipo}:${o.id}`} value={`${o.tipo}:${o.id}`}>{o.tipo === 'rol' ? `Puesto: ${o.nombre}` : `${o.nombre} (${o.sub})`}</option>)}
          </select></label>
        <CamposRepeticion f={f} set={set} />
        {error && <div className="rl-error ac-error">{error}</div>}
      </div>
    </Dialogo>
  )
}

function DialogoCopiar({ destino, opciones, rutinas, onCerrar, onCopiado }) {
  const conRutinas = opciones.filter(o => rutinas.some(r => (o.tipo === 'rol' ? r.asignado_tipo === 'rol' && r.rol === o.id : r.asignado_tipo === 'usuario' && r.usuario_id === o.id)))
  const [de, setDe] = useState(conRutinas[0] ? `${conRutinas[0].tipo}:${conRutinas[0].id}` : '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function copiar() {
    const [tipo, id] = de.split(':')
    setOcupado(true); setError('')
    try {
      const r = await enviar(`${API}/rutinas/copiar`, 'POST', { de: { tipo, id: tipo === 'rol' ? id : Number(id) }, a: { tipo: destino.tipo, id: destino.id } })
      onCopiado(r.copiadas, r.omitidas)
    } catch (e) { setError(e.message); setOcupado(false) }
  }

  return (
    <Dialogo titulo="Copiar actividades" sub={`Para ${destino.tipo === 'rol' ? `el puesto ${destino.nombre}` : destino.nombre}`} onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={copiar} disabled={ocupado || !de}>{ocupado ? <Loader2 className="cd-spin" /> : <Copy />} Copiar</button></>}>
      {conRutinas.length === 0 ? <p className="ac-vacio">Nadie más tiene actividades para copiar todavía.</p> : (
        <div className="ac-form">
          <label className="ac-campo"><span className="ac-campo-titulo">Copiar las actividades de</span>
            <select className="md-input" value={de} onChange={e => setDe(e.target.value)}>
              {conRutinas.map(o => <option key={`${o.tipo}:${o.id}`} value={`${o.tipo}:${o.id}`}>{o.tipo === 'rol' ? `Puesto: ${o.nombre}` : o.nombre}</option>)}
            </select></label>
          <p className="ac-sutil">Se copian con los mismos días, turno y hora. Las que ya tenga con el mismo nombre no se repiten. Útil cuando entra alguien nuevo al mismo puesto.</p>
          {error && <div className="rl-error ac-error">{error}</div>}
        </div>
      )}
    </Dialogo>
  )
}
