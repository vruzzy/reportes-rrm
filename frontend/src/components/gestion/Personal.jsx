import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { pedir, enviar, fechaLarga, fechaCorta, moverFecha, DIAS_SEMANA } from './medicacionUtil'
import { Dialogo } from './CatalogoMedicamentos'
import { fechaLocal } from './signosVitales'
import {
  ChevronLeft, ChevronRight, Copy, Loader2, Check, Paintbrush, X, Plus, Pencil, Lock, Unlock, History, Download,
  ChevronDown, ChevronUp, UserPlus, Search, CircleAlert, Moon, CalendarDays, Save, Send, FileText,
} from 'lucide-react'
import './medicacion.css'
import './actividades.css'
import './personal.css'
import CalendarioHorario from './CalendarioHorario'

// Personal: horario semanal (como el Excel que se mandaba por WhatsApp), nómina calculada de ese horario,
// perfiles del personal y la lista de turnos.

const API = '/api/gestion/personal'
const dinero = (n) => (Number(n) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
const lunesDe = (f) => { const d = new Date(f + 'T12:00:00Z').getUTCDay(); return moverFecha(f, -((d + 6) % 7)) }
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const horasEntre = (a, b) => { if (!a || !b) return 0; const m = (x) => { const [h, mi] = x.split(':').map(Number); return h * 60 + mi }; let d = m(b) - m(a); if (d <= 0) d += 1440; return Math.round(d / 6) / 10 }
const rangoSemana = (lunes) => `${fechaCorta(lunes).replace(/ \d{4}$/, '')} – ${fechaCorta(moverFecha(lunes, 6))}`

export default function Personal({ permisos, acciones = {} }) {
  const puedeEditar = permisos.personal === 'editar'
  const verNomina = !!permisos.nomina
  const [vista, setVista] = useState('horario')
  const [lunes, setLunes] = useState(lunesDe(fechaLocal()))
  const tabs = [['horario', 'Horario semanal'], !!permisos.asistencia && ['laborados', 'Días laborados'], verNomina && ['nomina', 'Nómina'], ['perfiles', 'Perfiles']].filter(Boolean)
  return (
    <div className="pe-root">
      <header className="gl-header"><h1>{tabs.find(t => t[0] === vista)?.[1]}</h1></header>
      <div className="rl-tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={vista === id} className={vista === id ? 'active' : ''} onClick={() => setVista(id)}>{label}</button>)}
      </div>
      {vista === 'horario' ? <Horario lunes={lunes} setLunes={setLunes} puedeEditar={puedeEditar} verNomina={verNomina} puedeNomina={permisos.nomina === 'editar'} onIrPerfiles={() => setVista('perfiles')} />
        : vista === 'laborados' ? <Laborados />
        : vista === 'nomina' ? <Nomina lunes={lunes} setLunes={setLunes} puedeEditar={permisos.nomina === 'editar'} />
        : <Perfiles puedeEditar={puedeEditar} puedeCrear={(acciones.personal || []).includes('crear')} />}
    </div>
  )
}

function SemanaBarra({ lunes, setLunes }) {
  const actual = lunesDe(fechaLocal())
  return (
    <div className="tb-barra">
      <div className="tb-fecha">
        <button className="rl-icon-btn" onClick={() => setLunes(moverFecha(lunes, -7))} aria-label="Semana anterior"><ChevronLeft /></button>
        <label className="tb-fecha-input">
          <span>{lunes === actual ? 'Esta semana · ' : ''}{rangoSemana(lunes)}</span>
          <input type="date" value={lunes} onChange={e => e.target.value && setLunes(lunesDe(e.target.value))} aria-label="Semana" />
        </label>
        <button className="rl-icon-btn" onClick={() => setLunes(moverFecha(lunes, 7))} aria-label="Semana siguiente"><ChevronRight /></button>
      </div>
      {lunes !== actual && <button className="rl-link" onClick={() => setLunes(actual)}>Ir a esta semana</button>}
    </div>
  )
}

/** Cómo se ve una celda del horario. */
function claseCelda(celda, t) {
  if (!celda?.turno) return 'vacia'
  if (celda.ausencia === 'falta' || celda.ausencia === 'permiso') return 'ausente'
  if (celda.ausencia === 'permiso_pagado') return 'permiso'
  if (t?.tipo === 'descanso') return 'descanso'
  if (t?.nocturno) return 'noche'
  return 'trabajo'
}

// ── Horario semanal ──────────────────────────────────────────────────────────
function Horario({ lunes, setLunes, puedeEditar, verNomina, puedeNomina, onIrPerfiles }) {
  const [datos, setDatos] = useState(null)
  const [nomina, setNomina] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [pincel, setPincel] = useState(null)     // código del turno con que se pinta ('/' = no trabaja)
  const [editando, setEditando] = useState(null) // { persona, fecha }
  const [verCambios, setVerCambios] = useState(false)
  const [copiando, setCopiando] = useState(false)
  const [publicando, setPublicando] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [d, n] = await Promise.all([pedir(`${API}/horario?fecha=${lunes}`), verNomina ? pedir(`${API}/nomina?fecha=${lunes}`) : null])
      setDatos(d); setNomina(n)
    } catch (e) { setError(e.message) }
  }, [lunes, verNomina])
  useEffect(() => { setDatos(null); cargar() }, [cargar])

  const ts = useMemo(() => Object.fromEntries((datos?.turnos || []).map(t => [t.codigo, t])), [datos])
  const celdas = useMemo(() => {
    const m = {}
    for (const c of datos?.celdas || []) m[`${c.personal_id}|${c.fecha}`] = c
    return m
  }, [datos])
  const nombres = useMemo(() => Object.fromEntries((datos?.personal || []).map(p => [p.id, p.nombre])), [datos])
  const totalesNomina = useMemo(() => Object.fromEntries((nomina?.filas || []).map(f => [f.personal_id, f])), [nomina])
  const editable = puedeEditar && !datos?.cerrada
  const pendientes = useMemo(() => new Set((datos?.pendientes || []).map(x => `${x.personal_id}|${x.fecha}`)), [datos])

  async function publicar() {
    setError(''); setAviso(''); setPublicando(true)
    try {
      const r = await enviar(`${API}/horario/publicar`, 'POST', { lunes })
      setAviso(r.primera
        ? `Horario guardado. Ya lo ve el personal${r.avisados ? ` y se le avisó a ${r.avisados} persona${r.avisados === 1 ? '' : 's'}` : ''}.`
        : `Cambios guardados (${r.cambios}).${r.avisados ? ` Se le avisó a ${r.avisados} persona${r.avisados === 1 ? '' : 's'} de su cambio.` : ''}`)
      await cargar()
    } catch (e) { setError(e.message) } finally { setPublicando(false) }
  }

  async function guardar(lista, msg) {
    setError('')
    // Al instante en pantalla
    setDatos(d => {
      const resto = d.celdas.filter(c => !lista.some(n => n.personal_id === c.personal_id && n.fecha === c.fecha))
      return { ...d, celdas: [...resto, ...lista.map(n => ({ ausencia: '', horas_extra: 0, nota: '', cubre_a: null, ...n, turno: n.turno === '/' ? '' : n.turno }))] }
    })
    try {
      await enviar(`${API}/horario/celdas`, 'PUT', { celdas: lista })
      if (msg) setAviso(msg)
      await cargar()
    } catch (e) { setError(e.message); cargar() }
  }

  function tocarCelda(p, fecha) {
    if (!editable) return
    if (pincel) {
      const previa = celdas[`${p.id}|${fecha}`]
      if ((previa?.turno || '/') === pincel && !previa?.ausencia) return
      guardar([{ personal_id: p.id, fecha, turno: pincel, ausencia: '', horas_extra: 0, nota: '', especial_inicio: '', especial_fin: '' }])
    } else setEditando({ persona: p, fecha })
  }

  async function copiarSemana() {
    setCopiando(false); setError('')
    try {
      await enviar(`${API}/horario/copiar`, 'POST', { de: moverFecha(lunes, -7), a: lunes })
      setAviso('Se copió el horario de la semana pasada. Cambia solo lo que es distinto.')
      await cargar()
    } catch (e) { setError(e.message) }
  }

  if (!datos) return (<><SemanaBarra lunes={lunes} setLunes={setLunes} />{error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>}</>)

  const secciones = [['diurno', 'Diurno'], ['nocturno', 'Nocturno']].map(([id, label]) => ({ id, label, personas: datos.personal.filter(p => p.seccion === id) })).filter(s => s.personas.length)
  const vacia = datos.celdas.length === 0
  const activos = datos.turnos.filter(t => t.activo)

  // Totales por persona (días y horas trabajados)
  const resumen = (p) => {
    let dias = 0, horas = 0, faltas = 0
    for (const f of datos.dias) {
      const c = celdas[`${p.id}|${f}`], t = ts[c?.turno]
      if (!t || t.tipo !== 'trabajo') continue
      if (c.ausencia === 'falta' || c.ausencia === 'permiso') { faltas++; continue }
      dias++; horas += (c.especial?.horas ?? t.horas) + (datos.horas_extra_activas ? c.horas_extra || 0 : 0)
    }
    return { dias, horas, faltas, siete: dias === 7 }
  }
  // Cuántos trabajan cada día (para ver huecos)
  const porDia = datos.dias.map(f => datos.personal.filter(p => { const c = celdas[`${p.id}|${f}`]; return ts[c?.turno]?.tipo === 'trabajo' && !c.ausencia }).length)

  return (
    <div className="pe-horario">
      <div className="pe-barra">
        <SemanaBarra lunes={lunes} setLunes={setLunes} />
        {editable && (
          <div className="pe-acciones">
            <button className="rl-btn" onClick={() => (vacia ? copiarSemana() : setCopiando(true))} disabled={!datos.anterior_tiene}
              title={datos.anterior_tiene ? '' : 'La semana pasada no tiene horario'}><Copy /> Copiar semana pasada</button>
            <button className="rl-btn rl-btn-primary" onClick={publicar} disabled={publicando || vacia || (datos.publicacion && !pendientes.size)}>
              {publicando ? <Loader2 className="cd-spin" /> : <Save />} Guardar horario{datos.publicacion && pendientes.size ? ` (${pendientes.size})` : ''}
            </button>
          </div>
        )}
      </div>
      {error && <div className="rl-error">{error}</div>}
      {aviso && <div className="rd-aviso"><Check /> {aviso}<button className="rl-icon-btn" onClick={() => setAviso('')} aria-label="Cerrar aviso"><X /></button></div>}
      {!vacia && !datos.cerrada && (
        !datos.publicacion ? (
          <div className="pe-estado borrador"><FileText /> <span><b>Borrador.</b> El personal todavía no ve este horario. Cuando esté listo toca <b>Guardar horario</b> y a cada quien le llega un aviso.</span></div>
        ) : pendientes.size ? (
          <div className="pe-estado borrador"><FileText /> <span><b>{pendientes.size} cambio{pendientes.size === 1 ? '' : 's'} sin guardar</b> (marcados con un punto). El personal sigue viendo el horario anterior hasta que toques <b>Guardar horario</b>; solo se le avisa a quien le cambió.</span></div>
        ) : (
          <div className="pe-estado ok"><Send /> <span>Guardado{datos.publicacion.publicada_en ? ` el ${fechaCorta(datos.publicacion.publicada_en.slice(0, 10)).replace(/ \d{4}$/, '')}` : ''}{datos.publicacion.publicada_por_nombre ? ` por ${datos.publicacion.publicada_por_nombre}` : ''}. El personal ya lo ve en su cuenta.</span></div>
        )
      )}
      {datos.cerrada && (
        <div className="pe-cerrada"><Lock /> Semana cerrada para la nómina el {fechaCorta(datos.cerrada.cerrada_en.slice(0, 10))}{datos.cerrada.cerrada_por_nombre ? ` por ${datos.cerrada.cerrada_por_nombre}` : ''}. Ya no se puede cambiar{puedeNomina ? ' (se reabre en Nómina)' : ''}.</div>
      )}

      {!datos.personal.length ? (
        <div className="ac-panel ac-vacio-grande">
          <UserPlus /><strong>Todavía no hay personal registrado</strong>
          <span>Primero agrega a las personas en Perfiles (se pueden pegar todos los nombres de una vez).</span>
          <button className="rl-btn rl-btn-primary" onClick={onIrPerfiles}><UserPlus /> Ir a Perfiles</button>
        </div>
      ) : (<>
        {editable && (
          <div className="ac-panel pe-pinceles">
            <span className="pe-pinceles-tit"><Paintbrush /> {pincel ? <>Pintando con <b>{pincel === '/' ? '/' : ts[pincel]?.etiqueta}</b>: toca las celdas</> : 'Elige un turno y toca las celdas para llenarlas rápido'}</span>
            <div className="pe-pinceles-btns">
              {activos.map(t => (
                <button key={t.codigo} className={`pe-celda-chip ${claseCelda({ turno: t.codigo }, t)}${pincel === t.codigo ? ' activo' : ''}`} onClick={() => setPincel(p => (p === t.codigo ? null : t.codigo))}>{t.etiqueta}</button>
              ))}
              <button className={`pe-celda-chip vacia${pincel === '/' ? ' activo' : ''}`} onClick={() => setPincel(p => (p === '/' ? null : '/'))} title="No trabaja ese día">/</button>
              {pincel && <button className="rl-link" onClick={() => setPincel(null)}>Dejar de pintar</button>}
            </div>
            <span className="ac-sutil">Sin pincel, al tocar una celda puedes cambiar el turno o poner un <b>horario especial</b> (por ejemplo 7 a 1). Si a media semana alguien no viene y otra persona hace 12 horas, cámbialo aquí y toca <b>Guardar horario</b>.</span>
          </div>
        )}

        <div className="pe-tabla-wrap">
          <table className="pe-tabla">
            <thead>
              <tr>
                <th className="pe-th-nombre">Nombre</th>
                {datos.dias.map((f, i) => (
                  <th key={f} className={f === datos.hoy ? 'hoy' : ''}>
                    <span>{DIAS_SEMANA[i].largo}</span><em>{fechaCorta(f).replace(/ \d{4}$/, '')}</em>
                  </th>
                ))}
                <th className="pe-th-tot">Semana</th>
              </tr>
            </thead>
            {secciones.map(s => (
              <tbody key={s.id}>
                <tr className="pe-seccion"><td colSpan={9}>{s.id === 'nocturno' && <Moon />} {s.label}</td></tr>
                {s.personas.map(p => {
                  const r = resumen(p), n = totalesNomina[p.id]
                  return (
                    <tr key={p.id}>
                      <th className="pe-nombre" scope="row">{p.nombre}{!p.activo && <em> (baja)</em>}{p.puesto && <span>{p.puesto}</span>}</th>
                      {datos.dias.map(f => {
                        const c = celdas[`${p.id}|${f}`], t = ts[c?.turno]
                        const cls = claseCelda(c, t)
                        return (
                          <td key={f} className={f === datos.hoy ? 'hoy' : ''}>
                            <button className={`pe-celda ${cls}${c?.especial ? ' especial' : ''}${pincel ? ' pintando' : ''}${datos.publicacion && pendientes.has(`${p.id}|${f}`) ? ' pendiente' : ''}`} onClick={() => tocarCelda(p, f)} disabled={!editable}
                              title={[c?.ausencia && datos.ausencias[c.ausencia], c?.nota, c?.actualizado_por_nombre && `Cambió: ${c.actualizado_por_nombre}`].filter(Boolean).join(' · ')}>
                              <b>{c?.turno ? (c.especial?.etiqueta || t?.etiqueta || c.turno) : '/'}</b>
                              {c?.especial && <i>Especial · {c.especial.horas} h</i>}
                              {c?.ausencia && <i>{datos.ausencias[c.ausencia]}</i>}
                              {c?.cubre_a && <i>Cubre a {String(nombres[c.cubre_a] || '').split(' ')[0]}</i>}
                              {datos.horas_extra_activas && c?.horas_extra > 0 && <i>+{c.horas_extra} h</i>}
                              {c?.nota && !c.cubre_a && <i className="nota">{c.nota}</i>}
                            </button>
                          </td>
                        )
                      })}
                      <td className="pe-tot">
                        <b>{r.dias} {r.dias === 1 ? 'día' : 'días'}</b><span>{r.horas} h{r.faltas ? ` · ${r.faltas} falta${r.faltas > 1 ? 's' : ''}` : ''}</span>
                        {r.siete && <span className="pe-siete" title="Trabaja los 7 días: le falta su día de descanso">Sin descanso</span>}
                        {n && <span className="pe-costo">{dinero(n.total)}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <th>Trabajan</th>
                {porDia.map((n, i) => <td key={i} className={n === 0 ? 'cero' : ''}>{n} {n === 1 ? 'persona' : 'personas'}</td>)}
                <td className="pe-tot">{nomina && <><span>Nómina</span><b className="pe-costo">{dinero(nomina.total)}</b></>}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="pe-leyenda">
          <span><i className="pe-celda-chip trabajo">7 a 3</i> Trabaja</span>
          <span><i className="pe-celda-chip noche">NT</i> Nocturno</span>
          <span><i className="pe-celda-chip descanso">D</i> Descanso</span>
          <span><i className="pe-celda-chip trabajo especial">7 a 1</i> Horario especial</span>
          <span><i className="pe-celda-chip vacia">/</i> No le toca</span>
        </div>

        <button className="in-roadmap-btn" onClick={() => setVerCambios(v => !v)} aria-expanded={verCambios}>
          <History /> Cambios de esta semana ({datos.cambios.length}) {verCambios ? <ChevronUp /> : <ChevronDown />}
        </button>
        {verCambios && (
          <div className="ac-panel pe-cambios">
            {!datos.cambios.length ? <p className="ac-vacio">Sin cambios todavía.</p> : (
              <ul>{datos.cambios.map(c => <li key={c.id}><span>{c.descripcion}</span><em>{c.fecha ? `${fechaCorta(c.fecha).replace(/ \d{4}$/, '')} · ` : ''}{c.usuario_nombre} · {c.creado_en.slice(5, 16).replace('T', ' ')}</em></li>)}</ul>
            )}
          </div>
        )}
      </>)}

      {editando && (
        <DialogoCelda persona={editando.persona} fecha={editando.fecha} celda={celdas[`${editando.persona.id}|${editando.fecha}`]} turnos={activos} ts={ts}
          onCerrar={() => setEditando(null)}
          onGuardar={(c) => { setEditando(null); guardar([c]) }} />
      )}
      {copiando && (
        <Dialogo titulo="Copiar la semana pasada" sub={`Para la semana ${rangoSemana(lunes)}`} onCerrar={() => setCopiando(false)}
          pie={<><button className="rl-btn" onClick={() => setCopiando(false)}>Cancelar</button><button className="rl-btn rl-btn-primary" onClick={copiarSemana}><Copy /> Copiar y reemplazar</button></>}>
          <p>Esta semana ya tiene turnos. Se reemplazan por los de la semana pasada. El personal no lo ve hasta que toques Guardar horario.</p>
        </Dialogo>
      )}
    </div>
  )
}

function DialogoCelda({ persona, fecha, celda, turnos, ts, onCerrar, onGuardar }) {
  const [turno, setTurno] = useState(celda?.turno || '/')
  const [especial, setEspecial] = useState(!!celda?.especial_inicio)
  const [entra, setEntra] = useState(celda?.especial_inicio || '07:00')
  const [sale, setSale] = useState(celda?.especial_fin || '13:00')
  const trabaja = ts[turno]?.tipo === 'trabajo'

  function guardar() {
    const conEsp = trabaja && especial && entra && sale
    // Lo que ya tenía la celda de antes (faltas, horas extra, notas) se conserva
    onGuardar({ personal_id: persona.id, fecha, turno, ausencia: trabaja ? (celda?.ausencia || '') : '', horas_extra: trabaja ? (celda?.horas_extra || 0) : 0,
      nota: celda?.nota || '', cubre_a: celda?.cubre_a || null, especial_inicio: conEsp ? entra : '', especial_fin: conEsp ? sale : '' })
  }

  return (
    <Dialogo titulo={persona.nombre} sub={fechaLarga(fecha).replace(/^./, c => c.toUpperCase())} onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar}>Cancelar</button><button className="rl-btn rl-btn-primary" onClick={guardar}><Check /> Listo</button></>}>
      <div className="md-campo"><span className="md-campo-titulo">Turno</span>
        <div className="pe-pinceles-btns">
          {turnos.map(x => <button key={x.codigo} className={`pe-celda-chip ${claseCelda({ turno: x.codigo }, x)}${turno === x.codigo ? ' activo' : ''}`} onClick={() => setTurno(x.codigo)}>{x.etiqueta}</button>)}
          <button className={`pe-celda-chip vacia${turno === '/' ? ' activo' : ''}`} onClick={() => setTurno('/')}>/ No le toca</button>
        </div>
      </div>
      {trabaja && (
        <div className="md-campo pe-especial">
          <label className="pe-check"><input type="checkbox" checked={especial} onChange={e => setEspecial(e.target.checked)} /> Horario especial (por ejemplo 7 a 1, o una situación extraordinaria)</label>
          {especial && (
            <div className="pe-especial-horas">
              <label><span>Entra</span><input className="md-input" type="time" value={entra} onChange={e => setEntra(e.target.value)} /></label>
              <label><span>Sale</span><input className="md-input" type="time" value={sale} onChange={e => setSale(e.target.value)} /></label>
              <span className="ac-sutil">{horasEntre(entra, sale)} h · se paga proporcional al turno normal de 8 h</span>
            </div>
          )}
        </div>
      )}
      <p className="ac-sutil">El cambio queda en borrador hasta que toques <b>Guardar horario</b>.</p>
    </Dialogo>
  )
}

// ── Nómina ───────────────────────────────────────────────────────────────────
function Nomina({ lunes, setLunes, puedeEditar }) {
  const [datos, setDatos] = useState(null)
  const [historial, setHistorial] = useState([])
  const [error, setError] = useState('')
  const [ajuste, setAjuste] = useState(null)   // fila
  const [confirmar, setConfirmar] = useState(null) // 'cerrar' | 'reabrir'

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [d, h] = await Promise.all([pedir(`${API}/nomina?fecha=${lunes}`), pedir(`${API}/nomina/historial`)])
      setDatos(d); setHistorial(h)
    } catch (e) { setError(e.message) }
  }, [lunes])
  useEffect(() => { setDatos(null); cargar() }, [cargar])

  async function accion(tipo) {
    setConfirmar(null); setError('')
    try { await enviar(`${API}/nomina/${tipo}`, 'POST', { lunes }); await cargar() } catch (e) { setError(e.message) }
  }
  async function quitarAjuste(id) {
    try { await pedir(`${API}/nomina/ajustes/${id}`, { method: 'DELETE' }); await cargar() } catch (e) { setError(e.message) }
  }
  function csv() {
    const ex = datos.horas_extra_activas
    const enc = ['Nombre', 'Puesto', 'Sueldo normal (8 h)', 'Sueldo 12 h', 'Sueldo nocturno', 'Turnos normales', 'Turnos de 12 h', 'Turnos nocturnos', 'Faltas',
      'Pago por turnos', 'Séptimo día', ...(ex ? ['Horas extra', 'Pago horas extra'] : []), 'Bonos y descuentos', 'Total']
    const filas = datos.filas.map(f => [f.nombre, f.puesto, f.tarifa, f.tarifa_12, f.tarifa_noche, f.por_tipo?.normal.n, f.por_tipo?.doce.n, f.por_tipo?.noche.n, f.ausencias,
      f.base, f.septimo, ...(ex ? [f.horas_extra, f.monto_extra] : []), f.ajustes.reduce((s, a) => s + a.monto, 0), f.total])
    const texto = [enc, ...filas, [], ['Total', ...Array(enc.length - 2).fill(''), datos.total]]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }))
    a.download = `nomina_${lunes}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const cerrada = datos?.cerrada
  return (
    <div>
      <div className="pe-barra">
        <SemanaBarra lunes={lunes} setLunes={setLunes} />
        {datos && (
          <div className="pe-acciones">
            <button className="rl-btn" onClick={csv} disabled={!datos.filas.length}><Download /> Descargar (Excel)</button>
            {puedeEditar && (cerrada
              ? <button className="rl-btn" onClick={() => setConfirmar('reabrir')}><Unlock /> Reabrir semana</button>
              : <button className="rl-btn rl-btn-primary" onClick={() => setConfirmar('cerrar')} disabled={!datos.filas.length}><Lock /> Cerrar semana</button>)}
          </div>
        )}
      </div>
      {error && <div className="rl-error">{error}</div>}
      {!datos ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Calculando…</div> : (<>
        <section className="cd-resumen">
          <div className="cd-card cd-card-fija" style={{ '--i': 0 }}>
            <span className="cd-card-titulo">Nómina de la semana</span>
            <strong>{dinero(datos.total)}</strong>
            <span className="cd-card-pie">{cerrada ? `Cerrada el ${fechaCorta(cerrada.cerrada_en.slice(0, 10))}` : 'Se calcula sola del horario'}</span>
          </div>
          <div className="cd-card cd-card-fija" style={{ '--i': 1 }}>
            <span className="cd-card-titulo">Personas</span>
            <strong>{datos.filas.filter(f => f.dias).length}</strong>
            <span className="cd-card-pie">{datos.filas.reduce((s, f) => s + f.dias, 0)} turnos trabajados</span>
          </div>
          <div className={`cd-card cd-card-alerta${datos.filas.some(f => f.ausencias) ? ' hay' : ''}`} style={{ '--i': 2 }}>
            <span className="cd-card-titulo">Faltas</span>
            <strong>{datos.filas.reduce((s, f) => s + f.ausencias, 0)}</strong>
            <span className="cd-card-pie">No se pagan</span>
          </div>
        </section>
        {datos.sin_tarifa?.length > 0 && !cerrada && (
          <div className="pe-alerta"><CircleAlert /> Sin sueldo registrado: {datos.sin_tarifa.join(', ')}. Ponlo en Perfiles para que cuente en la nómina.</div>
        )}
        {cerrada && <div className="pe-cerrada"><Lock /> Esta nómina está cerrada: los números quedan guardados como estaban{cerrada.cerrada_por_nombre ? ` (la cerró ${cerrada.cerrada_por_nombre})` : ''}.</div>}

        <div className="pe-tabla-wrap">
          <table className="pe-tabla pe-nomina">
            <thead><tr><th className="pe-th-nombre">Nombre</th><th>Turnos trabajados</th><th>Faltas</th><th>Por turnos</th><th>Séptimo día</th><th>{datos.horas_extra_activas ? 'Extras y ajustes' : 'Bonos y descuentos'}</th><th>Total</th></tr></thead>
            <tbody>
              {datos.filas.map(f => (
                <tr key={f.personal_id}>
                  <th className="pe-nombre" scope="row">{f.nombre}{f.puesto && <span>{f.puesto}</span>}</th>
                  <td className="pe-turnos-det">
                    {f.por_tipo && Object.entries(f.por_tipo).filter(([, v]) => v.n).map(([k, v]) => (
                      <span key={k}>{v.n} × {(datos.pago_como[k] || 'horario especial').toLowerCase()} <em>{dinero(v.monto)}</em></span>
                    ))}
                    {!f.dias_pagados && <span className="pe-sub">—</span>}
                    {f.dias !== f.dias_pagados && <em className="pe-sub">{f.dias - f.dias_pagados} sin pago (prueba)</em>}
                  </td>
                  <td className={f.ausencias ? 'pe-falta' : ''}>{f.ausencias || '—'}</td>
                  <td>{dinero(f.base)}</td>
                  <td>{f.septimo ? dinero(f.septimo) : <em className="pe-sub">{f.dias_pagados >= 6 || !f.dias_pagados ? '—' : `${f.dias_pagados} de 6 días`}</em>}</td>
                  <td className="pe-ajustes">
                    {f.monto_extra > 0 && <span>{f.horas_extra} h extra {dinero(f.monto_extra)}</span>}
                    {f.ajustes.map(a => (
                      <span key={a.id} className={a.monto < 0 ? 'neg' : ''}>{a.concepto} {a.monto < 0 ? '−' : '+'}{dinero(Math.abs(a.monto))}
                        {puedeEditar && !cerrada && <button className="rd-chip-x" onClick={() => quitarAjuste(a.id)} aria-label={`Quitar ${a.concepto}`}><X /></button>}
                      </span>
                    ))}
                    {puedeEditar && !cerrada && <button className="rl-link" onClick={() => setAjuste(f)}><Plus /> Bono o descuento</button>}
                  </td>
                  <td className="pe-total">{dinero(f.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th colSpan={6}>Total de la semana</th><td className="pe-total">{dinero(datos.total)}</td></tr></tfoot>
          </table>
        </div>
        <p className="ac-sutil pe-explica">
          Cada turno se paga con el sueldo de la persona para ese tipo: normal (8 h), 12 horas o nocturno. Un horario especial se paga proporcional al normal
          (por ejemplo, 7 a 1 = 6 h = sueldo normal ÷ 8 × 6). Si trabaja 6 días, su séptimo día (descanso) se paga como un turno normal; con una falta ya no llega a 6.
          {' '}{datos.horas_extra_activas ? 'Las horas extra se pagan a su tarifa de hora extra (si no tiene, sueldo normal ÷ 8). ' : 'Las horas extra no se pagan (se activan en Configuración → Nómina). '}Las faltas y los turnos que no se pagan no cuentan.
        </p>

        {historial.length > 0 && (
          <section className="ac-panel">
            <h2 className="ac-h2"><History /> Semanas cerradas</h2>
            <ul className="pe-historial">
              {historial.map(h => (
                <li key={h.lunes}><button className="rl-link" onClick={() => setLunes(h.lunes)}>{rangoSemana(h.lunes)}</button><b>{dinero(h.total)}</b><em>{h.cerrada_por_nombre}</em></li>
              ))}
            </ul>
          </section>
        )}
      </>)}

      {ajuste && <DialogoAjuste fila={ajuste} lunes={lunes} onCerrar={() => setAjuste(null)} onGuardado={() => { setAjuste(null); cargar() }} />}
      {confirmar && (
        <Dialogo titulo={confirmar === 'cerrar' ? 'Cerrar la nómina de la semana' : 'Reabrir la semana'} sub={rangoSemana(lunes)} onCerrar={() => setConfirmar(null)}
          pie={<><button className="rl-btn" onClick={() => setConfirmar(null)}>Cancelar</button>
            <button className="rl-btn rl-btn-primary" onClick={() => accion(confirmar)}>{confirmar === 'cerrar' ? <><Lock /> Cerrar en {dinero(datos.total)}</> : <><Unlock /> Reabrir</>}</button></>}>
          <p>{confirmar === 'cerrar'
            ? 'Se guarda la nómina tal como está y el horario de esta semana ya no se puede cambiar. Queda en el historial.'
            : 'El horario se podrá cambiar otra vez y la nómina se volverá a calcular. El cambio queda anotado.'}</p>
        </Dialogo>
      )}
    </div>
  )
}

function DialogoAjuste({ fila, lunes, onCerrar, onGuardado }) {
  const [tipo, setTipo] = useState('bono')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  async function guardar() {
    setError('')
    try {
      await enviar(`${API}/nomina/ajustes`, 'POST', { lunes, personal_id: fila.personal_id, concepto, monto: (tipo === 'bono' ? 1 : -1) * Math.abs(Number(monto)) })
      onGuardado()
    } catch (e) { setError(e.message) }
  }
  return (
    <Dialogo titulo="Bono o descuento" sub={fila.nombre} onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar}>Cancelar</button><button className="rl-btn rl-btn-primary" onClick={guardar} disabled={!concepto.trim() || !Number(monto)}><Check /> Guardar</button></>}>
      <div className="pe-pinceles-btns pe-tipo">
        <button className={`rd-hora${tipo === 'bono' ? ' activo' : ''}`} onClick={() => setTipo('bono')}>Bono (suma)</button>
        <button className={`rd-hora${tipo === 'descuento' ? ' activo' : ''}`} onClick={() => setTipo('descuento')}>Descuento (resta)</button>
      </div>
      <label className="md-campo"><span>Concepto</span><input className="md-input" autoFocus value={concepto} maxLength={80} onChange={e => setConcepto(e.target.value)} placeholder={tipo === 'bono' ? 'Por ejemplo: bono de puntualidad' : 'Por ejemplo: adelanto, préstamo'} /></label>
      <label className="md-campo"><span>Monto</span><input className="md-input pe-input-corto" type="number" min="0" step="1" value={monto} onChange={e => setMonto(e.target.value)} placeholder="$" /></label>
      {error && <div className="rl-error">{error}</div>}
    </Dialogo>
  )
}

// ── Perfiles ─────────────────────────────────────────────────────────────────
function Perfiles({ puedeEditar, puedeCrear = puedeEditar }) {
  const [datos, setDatos] = useState(null)
  const [todos, setTodos] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)
  const [agregando, setAgregando] = useState(false)
  const [calendario, setCalendario] = useState(null)

  const cargar = useCallback(async () => {
    try { setDatos(await pedir(`${API}?todos=${todos ? 1 : 0}`)) } catch (e) { setError(e.message) }
  }, [todos])
  useEffect(() => { cargar() }, [cargar])

  async function vincular(s) {
    setError('')
    try { await enviar(`${API}/${s.personal_id}/vincular`, 'PUT', { usuario_id: s.usuario_id }); cargar() } catch (e) { setError(e.message) }
  }

  async function mover(lista, i, d) {
    const j = i + d
    if (j < 0 || j >= lista.length) return
    const ids = datos.personal.filter(p => p.activo).map(p => p.id)
    const a = ids.indexOf(lista[i].id), b = ids.indexOf(lista[j].id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    try { await enviar(`${API}/orden`, 'PUT', { ids }); cargar() } catch (e) { setError(e.message) }
  }

  if (!datos) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
  const lista = datos.personal.filter(p => !q || norm(p.nombre).includes(norm(q)) || norm(p.puesto).includes(norm(q)))

  return (
    <div>
      <div className="ac-panel-head pe-perf-head">
        <div className="ac-buscar"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar persona o puesto" /></div>
        <label className="pe-check"><input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} /> Ver también dados de baja</label>
        {puedeCrear && <button className="rl-btn rl-btn-primary" onClick={() => setAgregando(true)}><UserPlus /> Agregar personal</button>}
      </div>
      {error && <div className="rl-error">{error}</div>}
      {puedeEditar && datos.sugerencias?.length > 0 && (
        <div className="ac-panel pe-sugerencias">
          <strong>Perfiles que se pueden vincular con su cuenta</strong>
          <span className="ac-sutil">Al vincularlos, cada persona ve su horario al entrar al sistema.</span>
          {datos.sugerencias.map(s => (
            <div key={s.personal_id} className="pe-sug">
              <span><b>{s.nombre}</b> → cuenta de {s.usuario_nombre}</span>
              <button className="rl-btn" onClick={() => vincular(s)}><Check /> Vincular</button>
            </div>
          ))}
        </div>
      )}
      {!datos.personal.length ? (
        <div className="ac-panel ac-vacio-grande"><UserPlus /><strong>Todavía no hay personal</strong><span>Agrega a todos de una vez: pega la lista de nombres, uno por renglón.</span></div>
      ) : ['diurno', 'nocturno'].map(sec => {
        const grupo = lista.filter(p => p.seccion === sec)
        if (!grupo.length) return null
        return (
          <section key={sec} className="ac-panel pe-perfiles">
            <h2 className="ac-h2">{sec === 'nocturno' ? <><Moon /> Nocturno</> : 'Diurno'} <span>{grupo.length}</span></h2>
            {grupo.map((p, i) => (
              <div key={p.id} className={`pe-perfil${p.activo ? '' : ' baja'}`}>
                <div className="pe-perfil-main">
                  <strong>{p.nombre}{!p.activo && <em> · dado de baja</em>}</strong>
                  <span>{[p.puesto, p.telefono, p.usuario_id ? `Cuenta: ${p.usuario_nombre}` : 'Sin cuenta en el sistema'].filter(Boolean).join(' · ')}</span>
                </div>
                {datos.ver_pago && <span className="pe-perfil-pago">{p.tarifa ? <>{dinero(p.tarifa)}<em>normal{p.tarifa_12 ? ` · 12 h ${dinero(p.tarifa_12)}` : ''}{p.tarifa_noche ? ` · noche ${dinero(p.tarifa_noche)}` : ''}</em></> : <em>Sin sueldo</em>}</span>}
                <button className="rl-icon-btn" onClick={() => setCalendario(p)} aria-label={`Calendario de ${p.nombre}`} title="Ver su calendario"><CalendarDays /></button>
                {puedeEditar && (
                  <div className="pe-perfil-btns">
                    {p.activo && !q && <>
                      <button className="rl-icon-btn" onClick={() => mover(grupo, i, -1)} disabled={i === 0} aria-label="Subir en el horario"><ChevronUp /></button>
                      <button className="rl-icon-btn" onClick={() => mover(grupo, i, 1)} disabled={i === grupo.length - 1} aria-label="Bajar en el horario"><ChevronDown /></button>
                    </>}
                    <button className="rl-icon-btn" onClick={() => setEditando(p)} aria-label={`Editar a ${p.nombre}`}><Pencil /></button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )
      })}
      {calendario && (
        <Dialogo titulo={calendario.nombre} sub="Su horario del mes" ancho onCerrar={() => setCalendario(null)} pie={<button className="rl-btn" onClick={() => setCalendario(null)}>Cerrar</button>}>
          <CalendarioHorario url={`${API}/${calendario.id}/mes`} compacto />
        </Dialogo>
      )}
      {agregando && <DialogoAgregar cuentas={datos.cuentas_libres} onCerrar={() => setAgregando(false)} onGuardado={() => { setAgregando(false); cargar() }} />}
      {editando && <DialogoPerfil p={editando} datos={datos} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />}
    </div>
  )
}

function DialogoAgregar({ cuentas = [], onCerrar, onGuardado }) {
  const [modo, setModo] = useState(cuentas.length ? 'cuentas' : 'nombres')
  const [elegidas, setElegidas] = useState(() => new Set(cuentas.map(c => c.id)))
  const [texto, setTexto] = useState('')
  const [seccion, setSeccion] = useState('diurno')
  const [puesto, setPuesto] = useState('')
  const [error, setError] = useState('')
  const nombres = texto.split('\n').map(t => t.trim()).filter(Boolean)
  async function guardar() {
    setError('')
    try {
      if (modo === 'cuentas') await enviar(`${API}/desde-cuentas`, 'POST', { usuario_ids: [...elegidas], seccion })
      else await enviar(API, 'POST', { nombres, seccion, puesto })
      onGuardado()
    } catch (e) { setError(e.message) }
  }
  return (
    <Dialogo titulo="Agregar personal" sub="Puedes pegar todos los nombres de una vez" onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar}>Cancelar</button><button className="rl-btn rl-btn-primary" onClick={guardar} disabled={modo === 'cuentas' ? !elegidas.size : !nombres.length}><Check /> Agregar {(modo === 'cuentas' ? elegidas.size : nombres.length) || ''}</button></>}>
      {cuentas.length > 0 && (
        <div className="pe-pinceles-btns pe-tipo">
          <button className={`rd-hora${modo === 'cuentas' ? ' activo' : ''}`} onClick={() => setModo('cuentas')}>Desde sus cuentas del sistema ({cuentas.length})</button>
          <button className={`rd-hora${modo === 'nombres' ? ' activo' : ''}`} onClick={() => setModo('nombres')}>Escribir nombres (sin cuenta)</button>
        </div>
      )}
      {modo === 'cuentas' ? (
        <div className="md-campo"><span className="md-campo-titulo">Cuentas sin perfil · quedan vinculadas y ven su horario</span>
          <div className="pe-cuentas">
            {cuentas.map(c => (
              <label key={c.id} className="pe-check"><input type="checkbox" checked={elegidas.has(c.id)}
                onChange={e => setElegidas(x => { const n = new Set(x); e.target.checked ? n.add(c.id) : n.delete(c.id); return n })} /> {c.nombre}</label>
            ))}
          </div>
        </div>
      ) : (
        <label className="md-campo"><span>Nombres (uno por renglón)</span>
          <textarea className="md-input ac-textarea" rows={7} autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder={'Martha\nMagaly\nMonica'} /></label>
      )}
      <div className="md-campo"><span className="md-campo-titulo">Sección del horario</span>
        <div className="pe-pinceles-btns">
          <button className={`rd-hora${seccion === 'diurno' ? ' activo' : ''}`} onClick={() => setSeccion('diurno')}>Diurno</button>
          <button className={`rd-hora${seccion === 'nocturno' ? ' activo' : ''}`} onClick={() => setSeccion('nocturno')}>Nocturno</button>
        </div>
      </div>
      {modo === 'nombres' && <label className="md-campo"><span>Puesto (opcional)</span><input className="md-input" value={puesto} maxLength={60} onChange={e => setPuesto(e.target.value)} placeholder="Por ejemplo: Cuidadora" /></label>}
      <p className="ac-sutil">El sueldo y el teléfono se ponen después en cada perfil. Quien no tiene cuenta se puede vincular después, cuando la cree.</p>
      {error && <div className="rl-error">{error}</div>}
    </Dialogo>
  )
}

function DialogoPerfil({ p, datos, onCerrar, onGuardado }) {
  const [f, setF] = useState({ ...p, tarifa: p.tarifa || '', tarifa_12: p.tarifa_12 || '', tarifa_noche: p.tarifa_noche || '', tarifa_extra: p.tarifa_extra || '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const cuentas = [...(p.usuario_id ? [{ id: p.usuario_id, nombre: p.usuario_nombre }] : []), ...datos.cuentas_libres]
  async function guardar(activo = f.activo) {
    setError('')
    try { await enviar(`${API}/${p.id}`, 'PUT', { ...f, activo }); onGuardado() } catch (e) { setError(e.message) }
  }
  return (
    <Dialogo titulo={p.nombre} sub="Perfil" onCerrar={onCerrar}
      pie={<>
        <button className="rl-btn pe-baja" onClick={() => guardar(!p.activo)}>{p.activo ? 'Dar de baja' : 'Reactivar'}</button>
        <button className="rl-btn" onClick={onCerrar}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={() => guardar()}><Check /> Guardar</button></>}>
      <div className="pe-form">
        <label className="md-campo"><span>Nombre</span><input className="md-input" value={f.nombre} maxLength={80} onChange={set('nombre')} /></label>
        <label className="md-campo"><span>Puesto</span><input className="md-input" value={f.puesto} maxLength={60} onChange={set('puesto')} /></label>
        <label className="md-campo"><span>Sección del horario</span>
          <select className="md-input" value={f.seccion} onChange={set('seccion')}><option value="diurno">Diurno</option><option value="nocturno">Nocturno</option></select></label>
        <label className="md-campo"><span>Teléfono</span><input className="md-input" value={f.telefono} maxLength={30} onChange={set('telefono')} /></label>
        <label className="md-campo"><span>Fecha de ingreso</span><input className="md-input" type="date" value={f.fecha_ingreso} onChange={set('fecha_ingreso')} /></label>
        <label className="md-campo"><span>Cuenta en el sistema</span>
          <select className="md-input" value={f.usuario_id || ''} onChange={e => setF(x => ({ ...x, usuario_id: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">Sin cuenta</option>
            {cuentas.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <span className="ac-sutil">Con la cuenta vinculada, la persona ve su horario en Inicio.</span>
        </label>
        {datos.ver_pago && (<>
          <div className="pe-form-ancho pe-sueldos-tit">Sueldo por turno</div>
          <label className="md-campo"><span>Turno normal (8 h)</span>
            <input className="md-input" type="number" min="0" step="1" value={f.tarifa} onChange={set('tarifa')} placeholder="$" /></label>
          <label className="md-campo"><span>Turno de 12 h</span>
            <input className="md-input" type="number" min="0" step="1" value={f.tarifa_12} onChange={set('tarifa_12')} placeholder={f.tarifa ? `Si no: ${dinero(f.tarifa / 8 * 12)}` : '$'} /></label>
          <label className="md-campo"><span>Nocturno</span>
            <input className="md-input" type="number" min="0" step="1" value={f.tarifa_noche} onChange={set('tarifa_noche')} placeholder={f.tarifa_12 ? `Si no: ${dinero(f.tarifa_12)}` : '$'} /></label>
          {datos?.horas_extra_activas && <label className="md-campo"><span>Hora extra</span>
            <input className="md-input" type="number" min="0" step="1" value={f.tarifa_extra} onChange={set('tarifa_extra')} placeholder={f.tarifa ? `Si no: ${dinero(f.tarifa / 8)}` : '$'} /></label>}
          <p className="ac-sutil pe-form-ancho">Un turno más corto o más largo se paga proporcional al normal: {f.tarifa ? `por ejemplo, 7 horas = ${dinero(f.tarifa / 8 * 7)}` : 'sueldo normal ÷ 8 × horas'}.</p>
        </>)}
        <label className="md-campo pe-form-ancho"><span>Notas</span><input className="md-input" value={f.notas} maxLength={400} onChange={set('notas')} /></label>
      </div>
      {error && <div className="rl-error">{error}</div>}
    </Dialogo>
  )
}

// ── Turnos ───────────────────────────────────────────────────────────────────
/** Catálogo de turnos (se edita en Configuración → Horarios y turnos). */
export function Turnos() {
  const [lista, setLista] = useState(null)
  const [pagoComo, setPagoComo] = useState({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  useEffect(() => { pedir(`${API}/turnos`).then(d => { setLista(d.turnos.filter(t => t.activo)); setPagoComo(d.pago_como) }).catch(e => setError(e.message)) }, [])
  const set = (i, k, v) => { setOk(false); setLista(l => l.map((t, j) => (j === i ? { ...t, [k]: v } : t))) }
  async function guardar() {
    setError(''); setOk(false)
    try { const d = await enviar(`${API}/turnos`, 'PUT', { turnos: lista }); setLista(d.turnos.filter(t => t.activo)); setPagoComo(d.pago_como); setOk(true) } catch (e) { setError(e.message) }
  }
  if (!lista) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
  return (
    <div className="ac-panel">
      <p className="ac-ayuda">Los turnos que se usan en el horario. "Se paga como" dice con qué sueldo de la persona se paga: los nocturnos con el nocturno, los de 12 h con el de 12 h y los demás proporcional al normal de 8 h según sus horas. "/" siempre significa que no le toca ese día.</p>
      <div className="pe-tabla-wrap">
        <table className="pe-tabla pe-turnos">
          <thead><tr><th>Código</th><th>Se ve como</th><th>Tipo</th><th>Horas</th><th>Entra</th><th>Sale</th><th>Nocturno</th><th>Se paga</th><th>Se paga como</th><th></th></tr></thead>
          <tbody>
            {lista.map((t, i) => (
              <tr key={i}>
                <td><input className="md-input" value={t.codigo} maxLength={12} onChange={e => set(i, 'codigo', e.target.value)} /></td>
                <td><input className="md-input" value={t.etiqueta} maxLength={20} onChange={e => set(i, 'etiqueta', e.target.value)} /></td>
                <td><select className="md-input" value={t.tipo} onChange={e => set(i, 'tipo', e.target.value)}><option value="trabajo">Trabajo</option><option value="descanso">Descanso</option></select></td>
                <td><input className="md-input" type="number" min="0" max="24" step="0.5" value={t.horas} disabled={t.tipo === 'descanso'} onChange={e => set(i, 'horas', e.target.value)} /></td>
                <td><input className="md-input" type="time" value={t.inicio} disabled={t.tipo === 'descanso'} onChange={e => set(i, 'inicio', e.target.value)} /></td>
                <td><input className="md-input" type="time" value={t.fin} disabled={t.tipo === 'descanso'} onChange={e => set(i, 'fin', e.target.value)} /></td>
                <td><input type="checkbox" checked={t.nocturno} onChange={e => set(i, 'nocturno', e.target.checked)} aria-label="Nocturno" /></td>
                <td><input type="checkbox" checked={t.tipo !== 'descanso' && t.se_paga} disabled={t.tipo === 'descanso'} onChange={e => set(i, 'se_paga', e.target.checked)} aria-label="Se paga" /></td>
                <td><select className="md-input" value={t.pago_como || ''} disabled={t.tipo === 'descanso'} onChange={e => set(i, 'pago_como', e.target.value)}>
                  <option value="">Automático ({pagoComo[t.nocturno ? 'noche' : Number(t.horas) >= 12 ? 'doce' : 'normal']?.toLowerCase()})</option>
                  {Object.entries(pagoComo).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></td>
                <td><button className="rl-icon-btn" onClick={() => setLista(l => l.filter((_, j) => j !== i))} aria-label={`Quitar ${t.etiqueta}`}><X /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pe-turnos-pie">
        <button className="rl-btn" onClick={() => setLista(l => [...l, { codigo: '', etiqueta: '', tipo: 'trabajo', horas: 8, inicio: '', fin: '', nocturno: false, se_paga: true }])}><Plus /> Agregar turno</button>
        <button className="rl-btn rl-btn-primary" onClick={guardar}><Check /> Guardar turnos</button>
        {ok && <span className="rd-estado ok"><Check /> Guardado</span>}
      </div>
      {error && <div className="rl-error">{error}</div>}
    </div>
  )
}

// ── Días laborados ───────────────────────────────────────────────────────────
// Lo programado en el horario guardado contra las entradas y salidas: días trabajados, faltas, retardos y horas.
const ESTADO_LAB = {
  laboro: ['Trabajó', 'ok'], retardo: ['Retardo', 'warn'], extra: ['Vino sin turno', 'ok'], falta: ['No marcó', 'mal'], pendiente: ['Aún no', 'neutro'],
  segun_horario: ['Según horario', 'neutro'], descanso: ['Descanso', 'neutro'], permiso: ['Permiso', 'neutro'], no_toca: ['/', 'neutro'], sin_horario: ['—', 'neutro'],
}
const primeroDeMes = (f) => `${f.slice(0, 7)}-01`
const finDeMes = (f) => { const [a, m] = f.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) }
const hora12 = (h) => { if (!h) return ''; const [a, b] = h.split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a < 12 ? 'am' : 'pm'}` }

function Laborados() {
  const hoy = fechaLocal()
  const [desde, setDesde] = useState(primeroDeMes(hoy))
  const [hasta, setHasta] = useState(hoy)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
  useEffect(() => {
    setDatos(null); setError('')
    pedir(`/api/gestion/asistencia/laborados?desde=${desde}&hasta=${hasta}`).then(setDatos).catch(e => setError(e.message))
  }, [desde, hasta])

  const mesPasado = moverFecha(primeroDeMes(hoy), -1)
  const atajos = [
    ['Esta semana', lunesDe(hoy), hoy],
    ['Semana pasada', moverFecha(lunesDe(hoy), -7), moverFecha(lunesDe(hoy), -1)],
    ['Este mes', primeroDeMes(hoy), hoy],
    ['Mes pasado', primeroDeMes(mesPasado), finDeMes(mesPasado)],
  ]
  const filas = (datos?.filas || []).filter(f => f.programados || f.laborados || f.activo)

  function csv() {
    const enc = ['Nombre', 'Puesto', 'Días programados', 'Días laborados', 'Faltas (no marcó)', 'Retardos', 'Vino sin turno', 'Descansos', 'Horas programadas', 'Horas trabajadas', 'Cuenta']
    const lineas = filas.map(f => [f.nombre, f.puesto || '', f.programados, f.laborados, f.faltas, f.retardos, f.extra, f.descansos, f.horas_programadas, f.horas, f.vinculado ? 'Marca entradas' : 'Sin cuenta (según horario)'])
    const texto = [enc, ...lineas].map(l => l.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + texto], { type: 'text/csv;charset=utf-8' }))
    a.download = `dias_laborados_${desde}_a_${hasta}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="pe-lab">
      <div className="ac-panel pe-lab-filtro">
        <label className="md-campo"><span>Desde</span><input className="md-input" type="date" value={desde} max={hasta} onChange={e => e.target.value && setDesde(e.target.value)} /></label>
        <label className="md-campo"><span>Hasta</span><input className="md-input" type="date" value={hasta} min={desde} onChange={e => e.target.value && setHasta(e.target.value)} /></label>
        <div className="pe-pinceles-btns">
          {atajos.map(([l, d, h]) => <button key={l} className={`rd-hora${desde === d && hasta === h ? ' activo' : ''}`} onClick={() => { setDesde(d); setHasta(h) }}>{l}</button>)}
        </div>
        <button className="rl-btn pe-lab-csv" onClick={csv} disabled={!filas.length}><Download /> Descargar (Excel)</button>
      </div>
      <p className="ac-ayuda">Se compara el <b>horario guardado</b> con las <b>entradas y salidas</b>. "No marcó" = tenía turno y no marcó su entrada. Quien no tiene cuenta no puede marcar: sus días se cuentan según el horario. Toca a una persona para ver día por día.</p>
      {error && <div className="rl-error">{error}</div>}
      {!datos ? (!error && <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>) : !filas.length ? <p className="ac-vacio">No hay horario ni entradas en estas fechas.</p> : (
        <div className="pe-tabla-wrap">
          <table className="pe-tabla pe-lab-tabla">
            <thead><tr><th className="pe-th-nombre">Nombre</th><th>Programados</th><th>Laborados</th><th>No marcó</th><th>Retardos</th><th>Descansos</th><th>Horas</th></tr></thead>
            <tbody>
              {filas.map(f => (<Fragment key={f.personal_id}>
                <tr className={`pe-lab-fila${abierta === f.personal_id ? ' abierta' : ''}`} onClick={() => setAbierta(a => (a === f.personal_id ? null : f.personal_id))}>
                  <th className="pe-nombre" scope="row">
                    <span className="pe-lab-nom">{abierta === f.personal_id ? <ChevronUp /> : <ChevronDown />} {f.nombre}{!f.activo && <em> (baja)</em>}</span>
                    <span>{[f.puesto, !f.vinculado && 'sin cuenta · según horario'].filter(Boolean).join(' · ')}</span>
                  </th>
                  <td>{f.programados}</td>
                  <td><b>{f.laborados}</b>{f.extra ? <span className="pe-lab-extra">+{f.extra} sin turno</span> : null}</td>
                  <td className={f.faltas ? 'pe-lab-mal' : ''}>{f.vinculado ? f.faltas : '—'}</td>
                  <td className={f.retardos ? 'pe-lab-warn' : ''}>{f.vinculado ? f.retardos : '—'}</td>
                  <td>{f.descansos}</td>
                  <td>{f.horas} h<span className="ac-sutil"> de {f.horas_programadas}</span></td>
                </tr>
                {abierta === f.personal_id && (
                  <tr key={`d${f.personal_id}`} className="pe-lab-detalle"><td colSpan={7}>
                    <div className="pe-lab-dias">
                      {f.dias.filter(d => d.estado !== 'sin_horario' || d.entrada).map(d => {
                        const [txt, cls] = ESTADO_LAB[d.estado] || ['', 'neutro']
                        return (
                          <div key={d.fecha} className={`pe-lab-dia ${cls}`}>
                            <span className="pe-lab-fecha">{fechaCorta(d.fecha).replace(/ \d{4}$/, '')}</span>
                            <span className="pe-lab-turno">{d.turno || '/'}</span>
                            <span className="pe-lab-est">{txt}{d.estado === 'retardo' ? ` · ${d.retardo_min} min` : ''}</span>
                            {d.entrada && <span className="pe-lab-horas">{hora12(d.entrada)} – {d.salida ? hora12(d.salida) : '¿?'}{d.horas != null ? ` · ${d.horas} h` : ''}{d.manual ? ' · a mano' : ''}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </td></tr>
                )}
              </Fragment>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Configuración → Nómina: qué se paga. */
export function ConfigNomina() {
  const [cfg, setCfg] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  useEffect(() => { pedir(`${API}/config`).then(setCfg).catch(e => setError(e.message)) }, [])
  async function cambiar(horas_extra) {
    setError(''); setOk(false)
    const antes = cfg; setCfg({ ...cfg, horas_extra })
    try { setCfg(await enviar(`${API}/config`, 'PUT', { horas_extra })); setOk(true) } catch (e) { setCfg(antes); setError(e.message) }
  }
  if (!cfg) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
  return (
    <section className="ac-panel pe-config-nom">
      <label className="pe-interruptor">
        <input type="checkbox" checked={cfg.horas_extra} onChange={e => cambiar(e.target.checked)} />
        <span><strong>Pagar horas extra</strong>
          <em>{cfg.horas_extra
            ? 'Activado: en la nómina se suman las horas extra a la tarifa de hora extra de cada persona (si no tiene, sueldo normal ÷ 8).'
            : 'Desactivado: las horas extra no se pagan ni aparecen en la nómina, el horario ni los perfiles.'}</em></span>
      </label>
      {ok && <span className="rd-estado ok"><Check /> Guardado</span>}
      {error && <div className="rl-error">{error}</div>}
    </section>
  )
}
