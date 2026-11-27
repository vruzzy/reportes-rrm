import { useEffect, useMemo, useState } from 'react'
import { pedir, DIAS_SEMANA, fechaLarga } from './medicacionUtil'
import { ChevronLeft, ChevronRight, Loader2, Clock, Moon, StickyNote, Maximize2, Minimize2 } from 'lucide-react'
import './personal.css'
import './calendario.css'

// Calendario del mes con el horario de una persona: cada día con su turno en color
// (7 a 7, 7 a 3, NT azul, D amarillo, horario especial punteado, falta en rosa).

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const moverMes = (mes, n) => { const [a, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.toISOString().slice(0, 7) }
const hora = (h) => { if (!h) return ''; const [a, b] = h.split(':').map(Number); const x = a % 12 || 12; return `${x}${b ? `:${String(b).padStart(2, '0')}` : ''} ${a < 12 ? 'am' : 'pm'}` }

function clase(d) {
  if (!d?.turno) return 'vacia'
  if (d.ausencia === 'falta' || d.ausencia === 'permiso') return 'ausente'
  if (d.ausencia === 'permiso_pagado') return 'permiso'
  if (d.tipo === 'descanso') return 'descanso'
  if (d.nocturno) return 'noche'
  return 'trabajo'
}

/** url: '/api/gestion/personal/mio/mes' o '/api/gestion/personal/ID/mes' */
const corto = (d) => (d.tipo === 'descanso' ? 'D' : String(d.etiqueta).replace(/ a /g, '-'))

export default function CalendarioHorario({ url, compacto = false, plegable = false, onTam }) {
  const [grande, setGrande] = useState(() => { try { return localStorage.getItem('rrm_cal_grande') === '1' } catch { return false } })
  const mini = plegable && !grande
  const cambiarTam = () => { const g = !grande; try { localStorage.setItem('rrm_cal_grande', g ? '1' : '0') } catch {} setGrande(g); onTam?.(g) }
  const [mes, setMes] = useState(mesActual())
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)

  useEffect(() => {
    setDatos(null); setError('')
    pedir(`${url}?mes=${mes}`).then(d => {
      setDatos(d)
      // Al abrir el mes actual se muestra el detalle de hoy
      setSel(d.hoy?.startsWith(mes) ? d.hoy : null)
    }).catch(e => setError(e.message))
  }, [url, mes])

  const porFecha = useMemo(() => Object.fromEntries((datos?.dias || []).map(d => [d.fecha, d])), [datos])

  // Cuadrícula de lunes a domingo
  const semanas = useMemo(() => {
    const [a, m] = mes.split('-').map(Number)
    const primero = new Date(Date.UTC(a, m - 1, 1))
    const total = new Date(Date.UTC(a, m, 0)).getUTCDate()
    const hueco = (primero.getUTCDay() + 6) % 7
    const celdas = [...Array(hueco).fill(null), ...Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)]
    while (celdas.length % 7) celdas.push(null)
    return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7))
  }, [mes])

  const resumen = useMemo(() => {
    const r = { turnos: 0, horas: 0, descansos: 0, faltas: 0, noches: 0 }
    for (const d of datos?.dias || []) {
      if (d.tipo === 'descanso') r.descansos++
      else if (d.tipo === 'trabajo') {
        if (d.ausencia === 'falta' || d.ausencia === 'permiso') r.faltas++
        else { r.turnos++; r.horas += d.horas + (d.horas_extra || 0); if (d.nocturno) r.noches++ }
      }
    }
    return r
  }, [datos])

  const [a, m] = mes.split('-').map(Number)
  const hoy = datos?.hoy
  const dsel = sel && porFecha[sel]

  return (
    <div className={`ca-root${compacto ? ' compacto' : ''}${mini ? ' mini' : ''}`}>
      <div className="ca-head">
        <button className="rl-icon-btn" onClick={() => setMes(x => moverMes(x, -1))} aria-label="Mes anterior"><ChevronLeft /></button>
        <strong>{MESES[m - 1]} {a}</strong>
        <button className="rl-icon-btn" onClick={() => setMes(x => moverMes(x, 1))} aria-label="Mes siguiente"><ChevronRight /></button>
        {mes !== mesActual() && <button className="rl-link" onClick={() => setMes(mesActual())}>Este mes</button>}
        {plegable && <button className="rl-btn ca-tam" onClick={cambiarTam} aria-pressed={grande}>{grande ? <><Minimize2 /> Reducir</> : <><Maximize2 /> Ampliar</>}</button>}
        {datos && (
          <span className="ca-resumen">
            <b>{resumen.turnos}</b> turnos · <b>{resumen.horas}</b> h{resumen.noches ? <> · <b>{resumen.noches}</b> nocturnos</> : null} · <b>{resumen.descansos}</b> descansos
            {resumen.faltas ? <> · <b className="ca-falta">{resumen.faltas}</b> faltas</> : null}
          </span>
        )}
      </div>
      {error && <div className="rl-error">{error}</div>}
      {!datos ? <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div> : (<>
        <div className="ca-grid" role="grid" aria-label={`Horario de ${MESES[m - 1]}`}>
          {DIAS_SEMANA.map(d => <span key={d.v} className="ca-dow" role="columnheader">{compacto || mini ? d.corto : d.largo.slice(0, 3)}</span>)}
          {semanas.flat().map((f, i) => {
            if (!f) return <span key={`v${i}`} className="ca-dia fuera" />
            const d = porFecha[f]
            return (
              <button key={f} role="gridcell" className={`ca-dia${f === hoy ? ' hoy' : ''}${f === sel ? ' sel' : ''}${f < hoy ? ' pasado' : ''}`} onClick={() => setSel(f)}
                aria-label={`${fechaLarga(f)}: ${d?.turno ? d.etiqueta : 'sin turno'}${d?.ausencia_txt ? `, ${d.ausencia_txt}` : ''}`}>
                <span className="ca-num">{Number(f.slice(8))}</span>
                {d?.turno
                  ? <span className={`pe-celda-chip ca-chip ${clase(d)}${d.especial ? ' especial' : ''}`}>{mini ? corto(d) : d.tipo === 'descanso' ? 'Descanso' : d.etiqueta}</span>
                  : <span className="ca-nada">{d ? '/' : ''}</span>}
                {d?.ausencia_txt && <span className="ca-aus">{d.ausencia_txt}</span>}
                {(d?.nota || d?.cubre_a) && <span className="ca-punto" aria-hidden="true" />}
              </button>
            )
          })}
        </div>

        {sel && (
          <div className="ca-detalle">
            <strong>{fechaLarga(sel).replace(/^./, c => c.toUpperCase())}{sel === hoy ? ' · hoy' : ''}</strong>
            {!dsel?.turno ? <span className="ac-sutil">{dsel ? 'No le toca trabajar.' : 'Todavía no hay horario para este día.'}</span>
              : dsel.tipo === 'descanso' ? <span>Día de descanso</span>
              : (
                <span className="ca-det-linea">
                  {dsel.nocturno ? <Moon /> : <Clock />}
                  <b>{dsel.etiqueta}</b>
                  {dsel.inicio && dsel.fin && <> · {hora(dsel.inicio)} a {hora(dsel.fin)}</>}
                  {' · '}{dsel.horas} h{dsel.horas_extra ? ` + ${dsel.horas_extra} h extra` : ''}
                  {dsel.especial && <em className="ca-tag">Horario especial</em>}
                  {dsel.ausencia_txt && <em className="ca-tag falta">{dsel.ausencia_txt}</em>}
                </span>
              )}
            {dsel?.cubre_a && <span>Cubre a {dsel.cubre_a}</span>}
            {dsel?.nota && !dsel.nota.startsWith('Cubre a') && <span className="ca-nota"><StickyNote /> {dsel.nota}</span>}
          </div>
        )}

        {!mini && <div className="pe-leyenda ca-leyenda">
          <span><i className="pe-celda-chip trabajo">7 a 3</i> Trabajas</span>
          <span><i className="pe-celda-chip noche">NT</i> Nocturno</span>
          <span><i className="pe-celda-chip descanso">D</i> Descanso</span>
          <span><i className="pe-celda-chip trabajo especial">7 a 1</i> Especial</span>
          <span><i className="pe-celda-chip ausente">7 a 3</i> Falta</span>
        </div>}
      </>)}
    </div>
  )
}
