import { useEffect, useMemo, useState } from 'react'
import { gestionFetch, leerJson } from './GestionApp'
import { UserPlus, Pencil, Send, Copy, Check, X, MessageCircle, MailWarning } from 'lucide-react'

// Configuración de Gestión:
//  - Usuarios y permisos (solo administrador): invitar, asignar rol/permisos, desactivar
//  - Mi cuenta (todos): nombre, correo y contraseña

const NIVEL_LABEL = { '': 'Sin acceso', ver: 'Ver', editar: 'Editar' }

function Ico({ c: C, size = 18 }) {
  return <C size={size} strokeWidth={1.75} aria-hidden="true" />
}

function iniciales(nombre = '') {
  const p = nombre.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

function estadoDe(u) {
  if (u.por_aprobar) return { id: 'aprobar', label: 'Por aprobar' }
  if (!u.activo) return { id: 'off', label: 'Desactivado' }
  if (u.pendiente) return { id: 'pend', label: 'Invitación pendiente' }
  return { id: 'on', label: 'Activo' }
}

export default function GestionConfig({ usuario, onUsuario }) {
  const esAdmin = usuario?.rol === 'admin'
  const [pestana, setPestana] = useState(esAdmin ? 'usuarios' : 'cuenta')

  return (
    <>
      <header className="gl-header">
        <div>
          <p className="gl-eyebrow">Centro</p>
          <h1>Configuración</h1>
        </div>
      </header>

      <nav className="rl-tabs" role="tablist">
        {esAdmin && (
          <button role="tab" aria-selected={pestana === 'usuarios'} className={pestana === 'usuarios' ? 'active' : ''} onClick={() => setPestana('usuarios')}>
            Usuarios y permisos
          </button>
        )}
        <button role="tab" aria-selected={pestana === 'cuenta'} className={pestana === 'cuenta' ? 'active' : ''} onClick={() => setPestana('cuenta')}>
          Mi cuenta
        </button>
      </nav>

      {pestana === 'usuarios' && esAdmin
        ? <Usuarios yo={usuario} />
        : <MiCuenta usuario={usuario} onUsuario={onUsuario} />}
    </>
  )
}

// ── Usuarios ──────────────────────────────────────────────────────────────────
function Usuarios({ yo }) {
  const [lista, setLista] = useState([])
  const [catalogo, setCatalogo] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState(null) // 'nuevo' | usuario
  const [enlace, setEnlace] = useState(null) // { nombre, email, enlace, correoEnviado }

  async function cargar() {
    setError('')
    try {
      const [r1, r2] = await Promise.all([gestionFetch('/api/gestion/usuarios'), gestionFetch('/api/gestion/usuarios/catalogo')])
      const [d1, d2] = await Promise.all([leerJson(r1), leerJson(r2)])
      if (!r1.ok) throw new Error(d1.error)
      if (!r2.ok) throw new Error(d2.error)
      setLista(d1)
      setCatalogo(d2)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los usuarios.')
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { cargar() }, [])

  const porAprobar = lista.filter(u => u.por_aprobar).length
  const rolLabel = useMemo(() => Object.fromEntries((catalogo?.roles || []).map(r => [r.id, r.label])), [catalogo])

  function guardado(u, inv) {
    setLista(l => {
      const i = l.findIndex(x => x.id === u.id)
      return i === -1 ? [...l, u] : l.map(x => (x.id === u.id ? u : x))
    })
    setPanel(null)
    if (inv) setEnlace({ nombre: u.nombre, email: u.email, ...inv })
  }

  function eliminado(id) {
    setLista(l => l.filter(x => x.id !== id))
    setPanel(null)
  }

  return (
    <>
      {catalogo && !catalogo.correo && (
        <div className="cf-aviso">
          <Ico c={MailWarning} />
          <div>
            <strong>El envío de correos aún no está configurado.</strong>
            <span>Puedes invitar igual: al crear la invitación te mostraremos el enlace para que se lo mandes por WhatsApp.</span>
          </div>
        </div>
      )}

      <div className="rl-panel">
        <div className="rl-toolbar">
          <div className="cf-toolbar-text">
            <strong>{lista.length} {lista.length === 1 ? 'usuario' : 'usuarios'}</strong>
            <span>{porAprobar
              ? <em className="cf-pendientes">{porAprobar} {porAprobar === 1 ? 'solicitud espera' : 'solicitudes esperan'} tu aprobación</em>
              : 'Tu personal puede crear su cuenta desde la pantalla de entrada; tú decides qué puede ver o editar.'}</span>
          </div>
          <button className="rl-btn rl-btn-primary" onClick={() => setPanel('nuevo')} disabled={!catalogo}>
            <Ico c={UserPlus} /> Invitar empleado
          </button>
        </div>

        {error && <div className="rl-error" role="alert">{error}</div>}

        {cargando ? (
          <div className="rl-skeleton">{[0, 1, 2].map(i => <div key={i} />)}</div>
        ) : (
          <table className="rl-table cf-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Puesto</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {lista.map(u => {
                const est = estadoDe(u)
                return (
                  <tr key={u.id} onClick={() => setPanel(u)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setPanel(u)}>
                    <td>
                      <div className="rl-person">
                        <div className="rl-avatar rl-avatar-ini cf-avatar">{iniciales(u.nombre)}</div>
                        <div>
                          <strong>{u.nombre}{u.id === yo.id && <em className="cf-tu">Tú</em>}</strong>
                          <span>{u.email || u.usuario}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <b>{u.por_aprobar ? 'Sin asignar' : (rolLabel[u.rol] || u.rol)}</b>
                      {u.personalizado && <span>Permisos personalizados</span>}
                    </td>
                    <td><span className={`cf-estado cf-${est.id}`}>{est.label}</span></td>
                    <td className="rl-c-acc">
                      <div className="rl-quick" onClick={e => e.stopPropagation()}>
                        {u.por_aprobar
                          ? <button className="rl-btn rl-btn-primary cf-revisar" onClick={() => setPanel(u)}>Revisar</button>
                          : <button className="rl-quick-btn" onClick={() => setPanel(u)} data-tip="Editar" aria-label="Editar"><Ico c={Pencil} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {panel && catalogo && (
        <PanelUsuario
          u={panel === 'nuevo' ? null : panel}
          yo={yo}
          catalogo={catalogo}
          onClose={() => setPanel(null)}
          onSaved={guardado}
          onDeleted={eliminado}
        />
      )}

      {enlace && <EnlaceListo info={enlace} onClose={() => setEnlace(null)} />}
    </>
  )
}

function PanelUsuario({ u, yo, catalogo, onClose, onSaved, onDeleted }) {
  const nuevo = !u
  const rolesPorId = Object.fromEntries(catalogo.roles.map(r => [r.id, r]))
  const [nombre, setNombre] = useState(u?.nombre || '')
  const [email, setEmail] = useState(u?.email || '')
  const [rol, setRol] = useState(u?.rol || 'enfermeria')
  // Una solicitud sin aprobar no tiene permisos todavía: arranca con los del puesto
  const [permisos, setPermisos] = useState(() => (u && !u.por_aprobar ? u.permisos : { ...rolesPorId[u?.rol || 'enfermeria'].permisos }))
  const [activo, setActivo] = useState(u ? u.activo : true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const esAdminRol = rol === 'admin'

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function elegirRol(r) {
    setRol(r)
    setPermisos({ ...rolesPorId[r].permisos })
  }

  const igualAlRol = JSON.stringify(Object.entries(permisos).sort()) === JSON.stringify(Object.entries(rolesPorId[rol].permisos).sort())

  async function pedir(url, opciones) {
    setError('')
    setGuardando(true)
    try {
      const res = await gestionFetch(url, opciones)
      const data = await leerJson(res)
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
      return data
    } catch (err) {
      setError(err.message || 'Error de conexión.')
      return null
    } finally {
      setGuardando(false)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    const body = { nombre, rol, permisos: esAdminRol || igualAlRol ? null : permisos }
    if (nuevo) {
      const d = await pedir('/api/gestion/usuarios', { method: 'POST', body: JSON.stringify({ ...body, email }) })
      if (d) onSaved(d.usuario, { enlace: d.enlace, correoEnviado: d.correoEnviado })
    } else {
      const d = await pedir(`/api/gestion/usuarios/${u.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, activo, aprobado: true }) })
      if (d) onSaved(d)
    }
  }

  async function reenviar() {
    const d = await pedir(`/api/gestion/usuarios/${u.id}/enlace`, { method: 'POST' })
    if (d) onSaved(u, d)
  }

  async function eliminar() {
    if (!window.confirm(u.por_aprobar ? `¿Rechazar la solicitud de ${u.nombre}? Se borrará su cuenta.` : `¿Eliminar la invitación de ${u.nombre}?`)) return
    const d = await pedir(`/api/gestion/usuarios/${u.id}`, { method: 'DELETE' })
    if (d) onDeleted(u.id)
  }

  return (
    <div className="rm-overlay" onClick={onClose}>
      <form className="rm-modal" onClick={e => e.stopPropagation()} onSubmit={guardar}>
        <div className="rm-head">
          <div className="rl-avatar rl-avatar-ini cf-avatar cf-avatar-lg">{iniciales(nombre || email)}</div>
          <div className="rm-head-text">
            <span className="gl-eyebrow">{nuevo ? 'Invitar empleado' : u.por_aprobar ? 'Solicitud de cuenta' : 'Usuario'}</span>
            <h2>{nombre || (nuevo ? 'Nuevo usuario' : u.nombre)}</h2>
            {!nuevo && <span className={`cf-estado cf-${estadoDe({ ...u, activo }).id}`}>{estadoDe({ ...u, activo }).label}</span>}
          </div>
          <button type="button" className="rm-close" onClick={onClose} aria-label="Cerrar (Esc)"><X size={18} strokeWidth={1.75} /></button>
        </div>

        <div className="rm-body">
          {error && <div className="rl-error" role="alert">{error}</div>}
          {!nuevo && u.por_aprobar && (
            <div className="cf-aviso"><div>
              <strong>{u.nombre} pidió acceso con {u.email}.</strong>
              <span>Elige su puesto, revisa los permisos y toca “Aprobar y dar acceso”. Si no la conoces, recházala.</span>
            </div></div>
          )}

          <h3>Datos</h3>
          <div className="rm-grid">
            <label className="rm-full">Nombre completo *
              <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus={nuevo} />
            </label>
            <label className="rm-full">Correo electrónico {nuevo && '*'}
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                required={nuevo} disabled={!nuevo} placeholder="nombre@correo.com" />
              {nuevo && <small className="cf-hint">Le llegará un enlace a este correo para crear su contraseña. Será su usuario.</small>}
            </label>
          </div>

          <h3>Puesto</h3>
          <div className="cf-roles">
            {catalogo.roles.map(r => (
              <button type="button" key={r.id} className={`cf-rol${rol === r.id ? ' active' : ''}`} onClick={() => elegirRol(r.id)}
                disabled={!nuevo && u.id === yo.id && r.id !== 'admin'}>
                {r.label}
              </button>
            ))}
          </div>

          <h3>Permisos {!esAdminRol && !igualAlRol && <em className="cf-tu">Personalizados</em>}</h3>
          {esAdminRol ? (
            <p className="cf-hint">El administrador tiene acceso completo a todo, incluida la administración de usuarios.</p>
          ) : (
            <div className="cf-permisos">
              {catalogo.modulos.map(m => (
                <div key={m.id} className="cf-permiso">
                  <span>{m.label}</span>
                  <div className="cf-niveles" role="radiogroup" aria-label={m.label}>
                    {['', 'ver', 'editar'].map(n => (
                      <button type="button" key={n} role="radio" aria-checked={(permisos[m.id] || '') === n}
                        className={`cf-nivel cf-nivel-${n || 'no'}${(permisos[m.id] || '') === n ? ' active' : ''}`}
                        onClick={() => setPermisos(p => { const c = { ...p }; if (n) c[m.id] = n; else delete c[m.id]; return c })}>
                        {NIVEL_LABEL[n]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!igualAlRol && (
                <button type="button" className="rl-link cf-reset" onClick={() => setPermisos({ ...rolesPorId[rol].permisos })}>
                  Volver a los permisos del puesto
                </button>
              )}
            </div>
          )}

          {!nuevo && !u.por_aprobar && (
            <>
              <h3>Acceso</h3>
              <div className="cf-acciones">
                {u.id !== yo.id && (
                  <label className="cf-switch">
                    <span className={`rl-switch${activo ? ' on' : ''}`} />
                    <input type="checkbox" hidden checked={activo} onChange={e => setActivo(e.target.checked)} />
                    <span>{activo ? 'Cuenta activa' : 'Cuenta desactivada (no puede entrar)'}</span>
                  </label>
                )}
                {u.email && u.activo && (
                  <button type="button" className="rl-btn" onClick={reenviar} disabled={guardando}>
                    <Ico c={Send} /> {u.pendiente ? 'Reenviar invitación' : 'Enviar enlace para nueva contraseña'}
                  </button>
                )}
                {u.pendiente && (
                  <button type="button" className="rl-btn cf-peligro" onClick={eliminar} disabled={guardando}>Eliminar invitación</button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rm-foot">
          {!nuevo && u.por_aprobar && (
            <button type="button" className="rl-btn cf-peligro cf-izq" onClick={eliminar} disabled={guardando}>Rechazar</button>
          )}
          <button type="button" className="rl-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rl-btn rl-btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : nuevo ? 'Enviar invitación' : u.por_aprobar ? 'Aprobar y dar acceso' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EnlaceListo({ info, onClose }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try { await navigator.clipboard.writeText(info.enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch {}
  }
  const texto = `Hola ${info.nombre.split(' ')[0]}, este es tu acceso a Gestión de Refugio Mendoza. Crea tu contraseña aquí (tu usuario es ${info.email}): ${info.enlace}`
  return (
    <div className="rm-overlay cf-centro" onClick={onClose}>
      <div className="cf-dialogo" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`cf-dialogo-icono${info.correoEnviado ? ' ok' : ''}`}><Ico c={info.correoEnviado ? Check : Send} size={24} /></div>
        <h2>{info.correoEnviado ? 'Invitación enviada' : 'Enlace listo'}</h2>
        <p>
          {info.correoEnviado
            ? <>Le enviamos un correo a <strong>{info.email}</strong> con el enlace para crear su contraseña.</>
            : <>No se envió correo. Comparte este enlace con <strong>{info.nombre}</strong>; con él crea su contraseña.</>}
          {' '}El enlace sirve una sola vez.
        </p>
        <div className="cf-enlace">
          <input readOnly value={info.enlace} onFocus={e => e.target.select()} />
          <button className="rl-btn" onClick={copiar}><Ico c={copiado ? Check : Copy} /> {copiado ? 'Copiado' : 'Copiar'}</button>
        </div>
        <div className="cf-dialogo-pie">
          <a className="rl-btn" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
            <Ico c={MessageCircle} /> Mandar por WhatsApp
          </a>
          <button className="rl-btn rl-btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  )
}

// ── Mi cuenta ─────────────────────────────────────────────────────────────────
function MiCuenta({ usuario, onUsuario }) {
  const [form, setForm] = useState({ nombre: usuario.nombre, email: usuario.email || '', password_actual: '', password_nueva: '', confirmar: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function guardar(e) {
    e.preventDefault()
    setError(''); setOk('')
    if (form.password_nueva && form.password_nueva !== form.confirmar) { setError('Las contraseñas nuevas no coinciden.'); return }
    setGuardando(true)
    try {
      const res = await gestionFetch('/api/auth/mi-cuenta', {
        method: 'PUT',
        body: JSON.stringify({ nombre: form.nombre, email: form.email, password_actual: form.password_actual, password_nueva: form.password_nueva }),
      })
      const data = await leerJson(res)
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
      onUsuario?.(data.usuario)
      setForm(f => ({ ...f, password_actual: '', password_nueva: '', confirmar: '' }))
      setOk(form.password_nueva ? 'Listo. Tu contraseña se cambió y cerramos tus otras sesiones.' : 'Cambios guardados.')
    } catch (err) {
      setError(err.message || 'Error de conexión.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className="rl-panel cf-cuenta" onSubmit={guardar}>
      {!usuario.email && (
        <div className="cf-aviso">
          <Ico c={MailWarning} />
          <div>
            <strong>Agrega tu correo.</strong>
            <span>Sin correo no podrás recuperar tu contraseña si la olvidas.</span>
          </div>
        </div>
      )}
      {error && <div className="rl-error" role="alert">{error}</div>}
      {ok && <div className="cf-ok" role="status">{ok}</div>}

      <h3>Datos</h3>
      <div className="rm-grid">
        <label>Nombre
          <input className="input" value={form.nombre} onChange={set('nombre')} required />
        </label>
        <label>Correo electrónico
          <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="nombre@correo.com" />
        </label>
        <label>Usuario
          <input className="input" value={usuario.usuario} disabled />
        </label>
        <label>Puesto
          <input className="input" value={usuario.rol_label || usuario.rol} disabled />
        </label>
      </div>

      <h3>Cambiar contraseña <em className="cf-opcional">opcional</em></h3>
      <div className="rm-grid">
        <label>Nueva contraseña
          <input className="input" type="password" value={form.password_nueva} onChange={set('password_nueva')} autoComplete="new-password" minLength={8} />
        </label>
        <label>Confirmar nueva contraseña
          <input className="input" type="password" value={form.confirmar} onChange={set('confirmar')} autoComplete="new-password" />
        </label>
      </div>

      <div className="cf-confirmar">
        <label>Contraseña actual * <small className="cf-hint">Para confirmar que eres tú</small>
          <input className="input" type="password" value={form.password_actual} onChange={set('password_actual')} autoComplete="current-password" required />
        </label>
        <button type="submit" className="rl-btn rl-btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </form>
  )
}
