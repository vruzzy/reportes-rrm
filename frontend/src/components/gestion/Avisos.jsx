import { useCallback, useEffect, useRef, useState } from 'react'
import { pedir, enviar } from './medicacionUtil'
import { Dialogo } from './CatalogoMedicamentos'
import { Bell, Check, Clock, UserX, BellRing } from 'lucide-react'
import './avisos.css'

// Campanita de avisos (retardos, quién no ha marcado…). Se revisa cada minuto.
// Si la persona lo permite, también sale una notificación del navegador mientras Gestión está abierta.

const API = '/api/gestion/avisos'
const ICONOS = { retardo: Clock, sin_marcar: UserX }
const cuando = (m) => {
  const hoy = new Date(); const f = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const [d, h] = m.split(' '); const [x, y] = h.split(':').map(Number)
  const hora = `${x % 12 || 12}:${String(y).padStart(2, '0')} ${x < 12 ? 'am' : 'pm'}`
  return d === f ? hora : `${Number(d.slice(8))}/${Number(d.slice(5, 7))} · ${hora}`
}
const puedeNotificar = () => typeof window !== 'undefined' && 'Notification' in window

export default function CampanaAvisos({ onIr, className = '' }) {
  const [datos, setDatos] = useState({ avisos: [], no_leidos: 0 })
  const [abierto, setAbierto] = useState(false)
  const [permiso, setPermiso] = useState(() => (puedeNotificar() ? Notification.permission : 'no'))
  const ultimo = useRef(null)   // id más alto ya visto (para no repetir notificaciones del navegador)

  const cargar = useCallback(async () => {
    try {
      const d = await pedir(API)
      setDatos(d)
      const max = d.avisos.reduce((m, a) => Math.max(m, a.id), 0)
      if (ultimo.current !== null && puedeNotificar() && Notification.permission === 'granted') {
        for (const a of d.avisos.filter(x => x.id > ultimo.current && !x.leido).slice(0, 3)) {
          try { new Notification(a.titulo, { body: a.texto, tag: `rrm-aviso-${a.id}` }) } catch {}
        }
      }
      ultimo.current = Math.max(ultimo.current || 0, max)
    } catch {}
  }, [])
  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (!document.hidden || permiso === 'granted') cargar() }, 60 * 1000)
    return () => clearInterval(t)
  }, [cargar, permiso])

  async function abrir(a) {
    if (!a.leido) {
      setDatos(d => ({ avisos: d.avisos.map(x => (x.id === a.id ? { ...x, leido: true } : x)), no_leidos: Math.max(0, d.no_leidos - 1) }))
      enviar(`${API}/leer`, 'POST', { id: a.id }).catch(() => {})
    }
    if (a.vista) { setAbierto(false); onIr?.(a.vista, a.sub || null) }
  }
  async function leerTodo() {
    setDatos(d => ({ avisos: d.avisos.map(x => ({ ...x, leido: true })), no_leidos: 0 }))
    enviar(`${API}/leer`, 'POST', {}).catch(() => {})
  }
  async function activarNotificaciones() {
    try { setPermiso(await Notification.requestPermission()) } catch {}
  }

  const n = datos.no_leidos
  return (<>
    <button className={`gl-icon-btn av-campana ${className}`} onClick={() => setAbierto(true)} aria-label={n ? `Avisos: ${n} sin leer` : 'Avisos'} title="Avisos">
      <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
      {n > 0 && <span className="av-num">{n > 9 ? '9+' : n}</span>}
    </button>
    {abierto && (
      <Dialogo titulo="Avisos" sub={n ? `${n} sin leer` : 'Todo leído'} onCerrar={() => setAbierto(false)}
        pie={<>
          {n > 0 && <button className="rl-btn" onClick={leerTodo}><Check /> Marcar todo como leído</button>}
          <button className="rl-btn rl-btn-primary" onClick={() => setAbierto(false)}>Cerrar</button>
        </>}>
        {permiso === 'default' && (
          <div className="av-permiso">
            <BellRing />
            <span>¿Quieres que también te salga una notificación en este teléfono o computadora mientras Gestión esté abierta?</span>
            <button className="rl-btn" onClick={activarNotificaciones}>Activar</button>
          </div>
        )}
        {!datos.avisos.length ? <p className="ac-vacio">No tienes avisos.</p> : (
          <ul className="av-lista">
            {datos.avisos.map(a => {
              const Ico = ICONOS[a.tipo] || Bell
              return (
                <li key={a.id}>
                  <button className={`av-item${a.leido ? '' : ' nuevo'}`} onClick={() => abrir(a)}>
                    <span className={`av-ico ${a.tipo}`}><Ico /></span>
                    <span className="av-txt"><strong>{a.titulo}</strong>{a.texto && <span>{a.texto}</span>}</span>
                    <em>{cuando(a.momento)}</em>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Dialogo>
    )}
  </>)
}
