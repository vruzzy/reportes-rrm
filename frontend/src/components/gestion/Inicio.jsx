import { useCallback, useEffect, useState } from 'react'
import { pedir, enviar, fechaLarga, fechaCorta, moverFecha, DIAS_SEMANA } from './medicacionUtil'
import { fechaLocal } from './signosVitales'
import GestionProximamente from './GestionProximamente'
import CalendarioHorario from './CalendarioHorario'
import {
  LogIn, Check, Loader2, Clock, Bath, ChevronLeft, ChevronRight, ChevronDown, ListChecks, Users, HeartPulse, ClipboardList, Pill,
  ArrowRight, CalendarDays,
} from 'lucide-react'
import './medicacion.css'
import './actividades.css'
import './rolDia.css'
import './inicio.css'

// Inicio: lo que le importa a quien entra. Su semana (horario de cada día según el rol), lo que le toca hoy,
// sus residentes y baños; y para quien supervisa, cómo va el equipo hoy.

const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches' }
const porcentaje = (h, t) => (t ? Math.round((h / t) * 100) : 0)

export default function Inicio({ usuario, permisos, onIr }) {
  const [hoyDatos, setHoyDatos] = useState(null)
  const [semana, setSemana] = useState(null)
  const [refFecha, setRefFecha] = useState(fechaLocal())
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState({})
  const [verRoadmap, setVerRoadmap] = useState(false)
  // Pequeño: va en la columna derecha; ampliado: ocupa todo el ancho
  const [calGrande, setCalGrande] = useState(() => { try { return localStorage.getItem('rrm_cal_grande') === '1' } catch { return false } })

  const hoy = semana?.hoy || fechaLocal()
  const cargarHoy = useCallback(() => pedir(`/api/gestion/actividades/mias?fecha=${fechaLocal()}`).then(setHoyDatos).catch(e => setError(e.message)), [])
  useEffect(() => { cargarHoy() }, [cargarHoy])
  useEffect(() => {
    pedir(`/api/gestion/actividades/semana?fecha=${refFecha}`).then(setSemana).catch(e => setError(e.message))
  }, [refFecha])

  // Tareas de hoy: las del rol y las fijas juntas
  const tareas = hoyDatos ? [
    ...(hoyDatos.rol?.tareas || []).map(t => ({ clave: `r${t.uid}`, fuente: 'rol', uid: t.uid, titulo: t.titulo, resaltada: t.resaltada, hecha: t.hecha })),
    ...hoyDatos.actividades.map(a => ({ clave: `f${a.id}`, fuente: 'fija', id: a.id, titulo: a.titulo, hora: a.hora, hecha: a.hecha })),
  ] : []
  const pendientes = tareas.filter(t => !t.hecha)
  const banos = hoyDatos?.banos || []
  const miRol = hoyDatos?.rol

  async function marcar(t) {
    setOcupado(o => ({ ...o, [t.clave]: true })); setError('')
    try {
      if (t.fuente === 'rol') await enviar(`/api/gestion/rol/${hoyDatos.fecha}/tarea/${t.uid}/hecha`, 'POST', {})
      else await enviar(`/api/gestion/actividades/${t.id}/hecha`, 'POST', { fecha: hoyDatos.fecha })
      await cargarHoy()
      // Actualiza el avance de hoy en la semana sin recargar todo
      setSemana(s => s && ({ ...s, dias: s.dias.map(d => (d.fecha === hoyDatos.fecha ? { ...d, hechas: d.hechas + 1 } : d)) }))
    } catch (e) { setError(e.message) }
    finally { setOcupado(o => ({ ...o, [t.clave]: false })) }
  }

  const accesos = [
    { id: 'controles', label: 'Controles diarios', icon: HeartPulse },
    { id: 'reportes', label: 'Reporte de turno', icon: ClipboardList },
    { id: 'medicacion', label: 'Medicación', icon: Pill },
    { id: 'banos', label: 'Baños', icon: Bath },
    { id: 'listado', label: 'Residentes', icon: Users },
  ].filter(a => permisos[a.id])

  const total = tareas.length + banos.length
  const hechas = tareas.length - pendientes.length + banos.filter(b => b.registro).length

  return (
    <div className="in-root">
      <header className="in-head">
        <h1>{saludo()}, {String(usuario?.nombre || '').split(' ')[0]}</h1>
        {semana?.vinculado && <button className="rl-btn rl-btn-primary in-marcar" onClick={() => onIr('asistencia')}><LogIn /> Marcar entrada o salida</button>}
        <span>{fechaLarga(hoy).replace(/^./, c => c.toUpperCase())}{(() => { const t = semana?.dias.find(d => d.fecha === hoy)?.turno; const h = t?.programado && t.tipo === 'trabajo' && !t.ausencia ? t.etiqueta : miRol?.horario; return h ? ` · Hoy entras ${h}` : '' })()}</span>
      </header>
      {error && <div className="rl-error">{error}</div>}

      {/* Mi semana */}
      <section className="ac-panel">
        <div className="in-sec-head">
          <h2 className="ac-h2"><CalendarDays /> Mi semana</h2>
          {semana && <div className="in-semana-nav">
            <button className="rl-icon-btn" onClick={() => setRefFecha(moverFecha(semana.lunes, -7))} aria-label="Semana anterior"><ChevronLeft /></button>
            <span>{fechaCorta(semana.lunes).replace(/ \d{4}$/, '')} – {fechaCorta(moverFecha(semana.lunes, 6)).replace(/ \d{4}$/, '')}</span>
            <button className="rl-icon-btn" onClick={() => setRefFecha(moverFecha(semana.lunes, 7))} aria-label="Semana siguiente"><ChevronRight /></button>
            {!semana.dias.some(d => d.fecha === hoy) && <button className="rl-link" onClick={() => setRefFecha(hoy)}>Esta semana</button>}
          </div>}
        </div>
        {!semana ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div> : (
          <div className="in-semana">
            {semana.dias.map((d, i) => {
              const dia = DIAS_SEMANA[i]
              const esHoy = d.fecha === hoy, pasado = d.fecha < hoy
              const t = d.turno
              const estado = t?.programado
                ? (t.ausencia ? 'Falta' : t.tipo === 'descanso' ? 'Descanso' : t.turno ? t.etiqueta : 'No te toca')
                : d.en_rol ? (d.horario || 'Trabajas') : d.hay_rol ? 'Descanso' : 'Sin horario aún'
              const trabaja = t?.programado ? t.tipo === 'trabajo' && !t.ausencia : d.en_rol
              const descansa = t?.programado ? !trabaja : d.hay_rol && !d.en_rol
              return (
                <div key={d.fecha} className={`in-dia${esHoy ? ' hoy' : ''}${pasado ? ' pasado' : ''}${trabaja ? ' trabaja' : descansa ? ' descansa' : ''}${t?.ausencia ? ' falta' : ''}`}>
                  <span className="in-dia-nom">{esHoy ? 'Hoy' : dia.largo.slice(0, 3)}</span>
                  <span className="in-dia-num">{Number(d.fecha.slice(8))}</span>
                  <strong className="in-dia-hora">{estado}</strong>
                  {d.total > 0 && (
                    <span className={`in-dia-avance${d.hechas === d.total ? ' completo' : ''}`}>
                      {d.fecha > hoy ? `${d.total} ${d.total === 1 ? 'tarea' : 'tareas'}` : `${d.hechas}/${d.total}`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {semana && !semana.vinculado
          ? <p className="ac-sutil in-nota">Tu cuenta todavía no está vinculada con tu perfil del horario. Pídele a administración que la vincule (Personal y horarios → Perfiles) para ver aquí tus turnos.</p>
          : <p className="ac-sutil in-nota">Tu horario sale del Horario semanal que hace administración. Si dice "Sin horario aún", todavía no lo hacen.</p>}
      </section>

      {semana?.vinculado && calGrande && (
        <section className="ac-panel">
          <h2 className="ac-h2"><CalendarDays /> Mi calendario</h2>
          <CalendarioHorario url="/api/gestion/personal/mio/mes" plegable onTam={setCalGrande} />
        </section>
      )}

      <div className="in-grid">
        {/* Hoy */}
        <section className="ac-panel in-hoy">
          <div className="in-sec-head">
            <h2 className="ac-h2"><ListChecks /> Lo que te toca hoy</h2>
            <button className="rl-link in-ver" onClick={() => onIr('actividades')}>Ver todo <ArrowRight /></button>
          </div>
          {!hoyDatos ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div> : total === 0 ? (
            <p className="ac-vacio">Hoy no tienes tareas asignadas.</p>
          ) : (<>
            <div className={`ac-avance${hechas === total ? ' completo' : ''}`}>
              <div className="ac-avance-txt"><b>{hechas}</b> de {total} hechas<span>{porcentaje(hechas, total)}%</span></div>
              <span className="cd-barra"><i style={{ width: `${porcentaje(hechas, total)}%` }} /></span>
            </div>
            {pendientes.length === 0 && banos.every(b => b.registro)
              ? <p className="ac-felicita in-felicita"><Check /> Terminaste todo lo de hoy.</p>
              : (
                <ul className="in-tareas">
                  {pendientes.slice(0, 8).map(t => (
                    <li key={t.clave} className={t.resaltada ? 'resaltada' : ''}>
                      <button className="ac-check" onClick={() => marcar(t)} disabled={ocupado[t.clave]} aria-label={`Marcar ${t.titulo} como hecha`}>
                        {ocupado[t.clave] && <Loader2 className="cd-spin" />}
                      </button>
                      <span>{t.titulo}{t.hora && <em><Clock /> {t.hora}</em>}</span>
                    </li>
                  ))}
                  {pendientes.length > 8 && <li className="in-mas"><button className="rl-link" onClick={() => onIr('actividades')}>y {pendientes.length - 8} más…</button></li>}
                  {banos.filter(b => !b.registro).map(b => (
                    <li key={`b${b.residente.id}`} className="in-bano">
                      <span className="in-bano-ico"><Bath /></span>
                      <span>Baño de {b.residente.nombre}</span>
                      <button className="rl-link" onClick={() => onIr('actividades')}>Registrar</button>
                    </li>
                  ))}
                </ul>
              )}
          </>)}
        </section>

        <div className="in-col">
          {semana?.vinculado && !calGrande && (
            <section className="ac-panel">
              <h2 className="ac-h2"><CalendarDays /> Mi calendario</h2>
              <CalendarioHorario url="/api/gestion/personal/mio/mes" plegable onTam={setCalGrande} />
            </section>
          )}
          {/* Mis residentes */}
          {miRol?.residentes?.length > 0 && (
            <section className="ac-panel">
              <h2 className="ac-h2"><Users /> Tus residentes hoy <span>{miRol.residentes.length}</span></h2>
              <div className="rd-chips">
                {miRol.residentes.map(r => (
                  <span key={r.id} className={`rd-chip in-chip${r.resaltado ? ' resaltado' : ''}`} title={r.nombre}>
                    {r.corto}{r.toca_bano && <Bath className="rd-bano" aria-label="le toca baño" />}
                  </span>
                ))}
              </div>
              {miRol.residentes.some(r => r.toca_bano) && <p className="ac-sutil in-nota"><Bath className="rd-bano" /> = le toca baño hoy</p>}
            </section>
          )}

          {/* Equipo de hoy */}
          {semana?.equipo && (
            <section className="ac-panel">
              <div className="in-sec-head">
                <h2 className="ac-h2"><Users /> Equipo de hoy</h2>
                <button className="rl-link in-ver" onClick={() => onIr('actividades', semana.equipo.length ? 'monitoreo' : 'rol')}>{semana.equipo.length ? 'Monitoreo' : 'Armar el rol'} <ArrowRight /></button>
              </div>
              {!semana.equipo.length ? <p className="ac-vacio">Todavía no hay rol para hoy.</p> : (
                <ul className="in-equipo">
                  {[...semana.equipo].sort((a, b) => porcentaje(a.hechas, a.total) - porcentaje(b.hechas, b.total)).map((p, i) => (
                    <li key={i}>
                      <div className="in-eq-nom"><strong>{p.nombre}</strong><span>{[p.horario, p.residentes && `${p.residentes} residentes`].filter(Boolean).join(' · ')}</span></div>
                      {p.total > 0 ? (
                        <div className={`in-eq-av${p.hechas === p.total ? ' completo' : ''}`}>
                          <span>{p.hechas}/{p.total}</span>
                          <span className="cd-barra"><i style={{ width: `${porcentaje(p.hechas, p.total)}%` }} /></span>
                        </div>
                      ) : <span className="ac-sutil">Sin tareas</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {accesos.length > 0 && (
            <section className="ac-panel">
              <h2 className="ac-h2">Ir a</h2>
              <div className="in-accesos">
                {accesos.map(a => { const Ic = a.icon; return <button key={a.id} className="rl-btn" onClick={() => onIr(a.id)}><Ic /> {a.label}</button> })}
              </div>
            </section>
          )}
        </div>
      </div>

      <button className="in-roadmap-btn" onClick={() => setVerRoadmap(v => !v)} aria-expanded={verRoadmap}>
        <ChevronDown className={verRoadmap ? 'girado' : ''} /> Lo que viene en Gestión
      </button>
      {verRoadmap && <GestionProximamente embebido />}
    </div>
  )
}
