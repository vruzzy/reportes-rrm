import { useEffect, useState } from 'react'
import { gestionFetch, leerJson } from './GestionApp'
import { ELIM, aVigilar, horaLocal, cuentaTexto } from './signosVitales'
import { Plus, Check, Trash2, Loader2, X, Droplet, Circle } from 'lucide-react'

// Micciones y evacuaciones: cada una es un registro con hora y características.
// Se usa en Controles diarios (tabla) y dentro del formulario del Reporte de turno.

const ICONO = { miccion: Droplet, evacuacion: Circle }

/** Lista de registros de un tipo, con botón para agregar. */
export function RegistrosTipo({ tipo, residente, fecha, turno, eventos, puedeEditar, onCambio }) {
  const [editando, setEditando] = useState(null)   // evento abierto en el diálogo
  const [agregando, setAgregando] = useState(false)
  const [error, setError] = useState('')
  const t = ELIM[tipo]
  const Icono = ICONO[tipo]

  async function agregar() {
    setAgregando(true); setError('')
    try {
      const res = await gestionFetch('/api/gestion/controles/eliminacion', {
        method: 'POST',
        body: JSON.stringify({ residente_id: residente.id, fecha, turno, tipo, hora: horaLocal(), caracteristicas: [] }),
      })
      const d = await leerJson(res)
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar.')
      onCambio(d)
      setEditando(d) // abre el diálogo para marcar características (opcional)
    } catch (e) {
      setError(e.message)
    } finally {
      setAgregando(false)
    }
  }

  return (
    <div className="el-tipo">
      <div className="el-lista">
        {eventos.map((e, i) => {
          const vig = aVigilar(e)
          return (
            <button key={e.id} type="button" className={`el-reg${vig.length ? ' vigilar' : ''}`} disabled={!puedeEditar}
              onClick={() => setEditando(e)}
              title={e.caracteristicas.length ? e.caracteristicas.join(', ') : 'Sin características'}
              aria-label={`${t.corto} ${i + 1}${e.hora ? ` a las ${e.hora}` : ''}: ${e.caracteristicas.join(', ') || 'sin características'}`}>
              <Icono aria-hidden="true" />
              <b>{e.hora || '—'}</b>
              {e.caracteristicas.length > 0 && <span>{e.caracteristicas[0].split(' / ')[0]}{e.caracteristicas.length > 1 ? ` +${e.caracteristicas.length - 1}` : ''}</span>}
            </button>
          )
        })}
        {puedeEditar && (
          <button type="button" className="el-add" onClick={agregar} disabled={agregando} aria-label={`Registrar ${t.uno}`}>
            {agregando ? <Loader2 className="cd-spin" /> : <Plus />} {t.corto}
          </button>
        )}
        {!eventos.length && !puedeEditar && <span className="el-vacio">Sin registrar</span>}
      </div>
      {error && <span className="rt-error">{error}</span>}
      {editando && (
        <DialogoRegistro evento={editando} numero={eventos.findIndex(e => e.id === editando.id) + 1} residente={residente}
          onCerrar={() => setEditando(null)}
          onGuardado={(ev, borrado) => { onCambio(ev, borrado); setEditando(null) }} />
      )}
    </div>
  )
}

/** Diálogo para marcar características, corregir la hora o borrar el registro. */
function DialogoRegistro({ evento, numero, residente, onCerrar, onGuardado }) {
  const t = ELIM[evento.tipo]
  const [carac, setCarac] = useState(evento.caracteristicas || [])
  const [hora, setHora] = useState(evento.hora || horaLocal())
  const [ocupado, setOcupado] = useState('')
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCerrar])

  const toggle = (o) => setCarac(c => (c.includes(o) ? c.filter(x => x !== o) : [...c, o]))

  async function guardar() {
    setOcupado('guardar'); setError('')
    try {
      const res = await gestionFetch(`/api/gestion/controles/eliminacion/${evento.id}`, {
        method: 'PUT', body: JSON.stringify({ hora, caracteristicas: carac }),
      })
      const d = await leerJson(res)
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar.')
      onGuardado(d, false)
    } catch (e) { setError(e.message); setOcupado('') }
  }

  async function borrar() {
    setOcupado('borrar'); setError('')
    try {
      const res = await gestionFetch(`/api/gestion/controles/eliminacion/${evento.id}`, { method: 'DELETE' })
      const d = await leerJson(res)
      if (!res.ok) throw new Error(d.error || 'No se pudo borrar.')
      onGuardado(evento, true)
    } catch (e) { setError(e.message); setOcupado('') }
  }

  return (
    <div className="rm-overlay el-overlay" onClick={onCerrar}>
      <div className="el-dialogo" role="dialog" aria-label={`${t.corto} ${numero} de ${residente.nombre}`} onClick={e => e.stopPropagation()}>
        <header>
          <div>
            <h3>{t.corto} {numero}</h3>
            <span>{residente.nombre}</span>
          </div>
          <button className="rm-close" onClick={onCerrar} aria-label="Cerrar (Esc)"><X size={18} strokeWidth={1.75} /></button>
        </header>
        <label className="el-hora">Hora
          <input className="rt-input" type="time" value={hora} onChange={e => setHora(e.target.value)} />
        </label>
        <p className="el-sub">Características <small>(opcional)</small></p>
        <div className="rt-chips">
          {t.opciones.map(o => (
            <button key={o} type="button" className={`rt-chip${carac.includes(o) ? ' on' : ''}${t.vigilar.includes(o) ? ' vig' : ''}`}
              onClick={() => toggle(o)} aria-pressed={carac.includes(o)}>
              {carac.includes(o) && <Check />}{o}
            </button>
          ))}
        </div>
        {error && <div className="rl-error" role="alert">{error}</div>}
        <footer>
          {confirmarBorrar ? (
            <span className="el-confirmar">¿Borrar este registro?
              <button className="rl-btn" onClick={() => setConfirmarBorrar(false)} disabled={!!ocupado}>No</button>
              <button className="rl-btn el-btn-borrar" onClick={borrar} disabled={!!ocupado}>
                {ocupado === 'borrar' ? <Loader2 className="cd-spin" /> : <Trash2 />} Sí, borrar
              </button>
            </span>
          ) : (
            <button className="rl-link el-link-borrar" onClick={() => setConfirmarBorrar(true)} disabled={!!ocupado}><Trash2 size={15} /> Borrar</button>
          )}
          <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={!!ocupado}>
            {ocupado === 'guardar' ? <Loader2 className="cd-spin" /> : <Check />} Listo
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Junta un evento nuevo, corregido o borrado en la lista del turno. */
export function aplicarCambio(lista, evento, borrado) {
  const sin = lista.filter(e => e.id !== evento.id)
  if (borrado) return sin
  return [...sin, evento].sort((a, b) => (a.hora || '').localeCompare(b.hora || '') || a.id - b.id)
}

/** "3 micciones · 1 evacuación" */
export function resumenEliminacion(eventos) {
  return ['miccion', 'evacuacion'].map(tipo => cuentaTexto(tipo, eventos.filter(e => e.tipo === tipo).length)).join(' · ')
}
