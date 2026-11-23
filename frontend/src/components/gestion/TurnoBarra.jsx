import { ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react'
import { TURNOS, fechaLarga, moverFecha, turnoActual } from './signosVitales'

// Barra común: día del turno (con flechas) + turno mañana / noche.
export default function TurnoBarra({ fecha, turno, onCambio, children }) {
  const actual = turnoActual()
  const esActual = actual.fecha === fecha && actual.turno === turno
  const idx = TURNOS.findIndex(t => t.id === turno)

  return (
    <div className="tb-barra">
      <div className="tb-fecha">
        <button className="rl-icon-btn" onClick={() => onCambio({ fecha: moverFecha(fecha, -1), turno })} aria-label="Día anterior">
          <ChevronLeft />
        </button>
        <label className="tb-fecha-input">
          <span>{fechaLarga(fecha)}</span>
          <input type="date" value={fecha} max={actual.fecha}
            onChange={e => e.target.value && onCambio({ fecha: e.target.value, turno })} aria-label="Fecha del turno" />
        </label>
        <button className="rl-icon-btn" onClick={() => onCambio({ fecha: moverFecha(fecha, 1), turno })}
          disabled={fecha >= actual.fecha} aria-label="Día siguiente">
          <ChevronRight />
        </button>
      </div>

      <div className="rl-segment tb-turno" role="group" aria-label="Turno" style={{ '--seg-i': idx, '--seg-n': TURNOS.length }}>
        <span className="rl-segment-pill" aria-hidden="true" />
        {TURNOS.map(t => (
          <button key={t.id} className={turno === t.id ? 'active' : ''} onClick={() => onCambio({ fecha, turno: t.id })}>
            {t.id === 'Nocturno' ? <Moon /> : <Sun />} {t.label}
          </button>
        ))}
      </div>

      {!esActual && (
        <button className="rl-link" onClick={() => onCambio(actual)}>Ir al turno actual</button>
      )}
      {children}
    </div>
  )
}
