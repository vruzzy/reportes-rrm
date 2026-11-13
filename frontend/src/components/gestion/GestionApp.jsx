import { useEffect, useState } from 'react'
import logo from '../../assets/logo_rrm.png'
import GestionLayout from './GestionLayout'

// Puerta de entrada a Gestión:
//  - setup:   crea el primer administrador (solo si no hay usuarios)
//  - login:   correo o usuario + contraseña
//  - registro: cualquiera solicita cuenta; queda sin acceso hasta que el admin la aprueba
//  - olvide:  pide un enlace de recuperación por correo
//  - enlace:  crea contraseña desde un enlace de invitación o recuperación (?gestion=...&token=...)
const TOKEN_KEY = 'rrm_gestion_token'

function leerToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}
function guardarToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch {}
}

/** fetch con el token de Gestión. Úsalo en los módulos nuevos. */
export async function gestionFetch(url, opciones = {}) {
  const token = leerToken()
  const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(url, { ...opciones, headers })
}

export async function leerJson(res) {
  try { return await res.json() } catch { return {} }
}

/** Lee ?gestion=invitacion|recuperacion&token=... y limpia la URL */
function leerEnlaceUrl() {
  try {
    const p = new URLSearchParams(window.location.search)
    const token = p.get('token')
    if (!p.has('gestion') || !token) return null
    window.history.replaceState(null, '', window.location.pathname)
    return token
  } catch { return null }
}

const VACIO = { nombre: '', usuario: '', password: '', confirmar: '', email: '' }

export default function GestionApp({ onSalir }) {
  const [fase, setFase] = useState('cargando') // cargando | setup | login | registro | olvide | enlace | dentro | error
  const [usuario, setUsuario] = useState(null)
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enlace, setEnlace] = useState(null) // { token, tipo, nombre, email }

  useEffect(() => {
    const token = leerEnlaceUrl()
    if (token) abrirEnlace(token)
    else verificar()
  }, [])

  async function abrirEnlace(token) {
    try {
      const res = await fetch(`/api/auth/enlace/${encodeURIComponent(token)}`)
      const data = await leerJson(res)
      if (!res.ok) {
        setError(data.error || 'Este enlace ya no es válido.')
        await verificar(true)
        return
      }
      guardarToken('')
      setEnlace({ token, ...data })
      setFase('enlace')
    } catch {
      setFase('error')
    }
  }

  async function verificar(conservarError = false) {
    if (!conservarError) setError('')
    try {
      if (leerToken()) {
        const me = await gestionFetch('/api/auth/me')
        if (me.ok) {
          setUsuario((await leerJson(me)).usuario)
          setFase('dentro')
          return
        }
        guardarToken('')
      }
      const res = await fetch('/api/auth/estado')
      if (!res.ok) throw new Error()
      const { configurado } = await leerJson(res)
      setFase(configurado ? 'login' : 'setup')
    } catch {
      setFase('error')
    }
  }

  const cambiar = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  function irA(f) {
    setError('')
    setAviso('')
    setFase(f)
  }

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setAviso('')
    if ((fase === 'setup' || fase === 'enlace' || fase === 'registro') && form.password !== form.confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setEnviando(true)
    try {
      let url, body
      if (fase === 'olvide') {
        url = '/api/auth/olvide'; body = { email: form.email }
      } else if (fase === 'registro') {
        url = '/api/auth/registro'; body = { nombre: form.nombre, email: form.email, password: form.password }
      } else if (fase === 'enlace') {
        url = `/api/auth/enlace/${encodeURIComponent(enlace.token)}`; body = { password: form.password }
      } else {
        url = fase === 'setup' ? '/api/auth/setup' : '/api/auth/login'
        body = { nombre: form.nombre, usuario: form.usuario, password: form.password }
      }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await leerJson(res)
      if (!res.ok) throw new Error(data.error || 'No se pudo completar.')
      if (fase === 'olvide') {
        setAviso(data.mensaje)
        return
      }
      guardarToken(data.token)
      setUsuario(data.usuario)
      setForm(VACIO)
      setEnlace(null)
      setFase('dentro')
    } catch (err) {
      setError(err.message || 'Error de conexión.')
    } finally {
      setEnviando(false)
    }
  }

  async function cerrarSesion() {
    try { await gestionFetch('/api/auth/logout', { method: 'POST' }) } catch {}
    guardarToken('')
    setUsuario(null)
    setFase('login')
  }

  async function revisarAprobacion() {
    try {
      const me = await gestionFetch('/api/auth/me')
      if (me.ok) setUsuario((await leerJson(me)).usuario)
      else cerrarSesion()
    } catch {}
  }

  if (fase === 'dentro' && usuario && usuario.aprobado === false) {
    return (
      <>
        <div className="page-header">
          <img src={logo} alt="RRM" className="page-header-logo-img" />
          <div className="page-header-info">
            <h1>Gestión</h1>
            <p>Cuenta en revisión</p>
          </div>
        </div>
        <div className="gp-wrap">
          <div className="gp-hero gp-login">
            <span className="gp-pill">En revisión</span>
            <h2>Gracias, {usuario.nombre.split(' ')[0]}</h2>
            <p>Tu cuenta (<strong>{usuario.email}</strong>) se creó correctamente. El administrador debe aprobarla y asignarte tu puesto antes de que puedas entrar.</p>
            <p>Cuando te aprueben, vuelve a esta pantalla y toca el botón de abajo.</p>
            <button className="btn-generate gp-btn" onClick={revisarAprobacion}>Ya me aprobaron, entrar</button>
            <button type="button" className="gp-link" onClick={cerrarSesion}>Cerrar sesión</button>
          </div>
        </div>
      </>
    )
  }

  if (fase === 'dentro') {
    return <GestionLayout usuario={usuario} onUsuario={setUsuario} onLogout={cerrarSesion} onSalir={onSalir} />
  }

  const titulos = {
    setup:  ['Primera vez', 'Crea el usuario administrador'],
    login:  ['Iniciar sesión', 'Ingresa a Gestión'],
    registro: ['Crear cuenta', 'Solicita tu acceso'],
    olvide: ['Recuperar acceso', '¿Olvidaste tu contraseña?'],
    enlace: [enlace?.tipo === 'invitacion' ? 'Bienvenido(a)' : 'Nueva contraseña',
             enlace?.tipo === 'invitacion' ? `Hola, ${enlace?.nombre?.split(' ')[0] || ''}` : 'Crea una nueva contraseña'],
  }

  return (
    <>
      <div className="page-header">
        <img src={logo} alt="RRM" className="page-header-logo-img" />
        <div className="page-header-info">
          <h1>Gestión</h1>
          <p>Acceso restringido</p>
        </div>
      </div>

      <div className="gp-wrap">
        {fase === 'cargando' && <div className="gp-hero"><p>Cargando…</p></div>}

        {fase === 'error' && (
          <div className="gp-hero">
            <p>No se pudo conectar con el servidor.</p>
            <button className="btn-generate gp-btn" onClick={() => verificar()}>Reintentar</button>
          </div>
        )}

        {titulos[fase] && (
          <form className="gp-hero gp-login" onSubmit={enviar} key={fase}>
            <span className="gp-pill">{titulos[fase][0]}</span>
            <h2>{titulos[fase][1]}</h2>

            {fase === 'setup' && <p>Este será el usuario principal para entrar a esta sección. Guarda bien la contraseña.</p>}
            {fase === 'registro' && <p>Crea tu cuenta con tu correo. El administrador la revisará y te dará acceso según tu puesto.</p>}
            {fase === 'olvide' && <p>Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva contraseña.</p>}
            {fase === 'enlace' && (
              <p>
                {enlace.tipo === 'invitacion' ? 'Crea tu contraseña para entrar a Gestión. ' : ''}
                Tu usuario es <strong>{enlace.email}</strong>.
              </p>
            )}

            {error && <div className="error-banner" role="alert">{error}</div>}
            {aviso && <div className="gp-ok" role="status">{aviso}</div>}

            {(fase === 'setup' || fase === 'registro') && (
              <div className="field-group">
                <label htmlFor="gp-nombre">{fase === 'registro' ? 'Nombre completo' : 'Nombre'}</label>
                <input id="gp-nombre" className="input" type="text" placeholder="Ej. Emiliano Gómez"
                  value={form.nombre} onChange={cambiar('nombre')} autoComplete="name"
                  required={fase === 'registro'} autoFocus={fase === 'registro'} />
              </div>
            )}

            {(fase === 'login' || fase === 'setup') && (
              <div className="field-group">
                <label htmlFor="gp-usuario">{fase === 'login' ? 'Correo o usuario' : 'Usuario'}</label>
                <input id="gp-usuario" className="input" type="text" autoCapitalize="none"
                  value={form.usuario} onChange={cambiar('usuario')} autoComplete="username" required autoFocus />
              </div>
            )}

            {((fase === 'olvide' && !aviso) || fase === 'registro') && (
              <div className="field-group">
                <label htmlFor="gp-email">Correo electrónico</label>
                <input id="gp-email" className="input" type="email" autoCapitalize="none"
                  value={form.email} onChange={cambiar('email')} autoComplete="email" required autoFocus={fase === 'olvide'} />
              </div>
            )}

            {fase !== 'olvide' && (
              <div className="field-group">
                <label htmlFor="gp-password">{fase === 'login' ? 'Contraseña' : 'Nueva contraseña'}</label>
                <input id="gp-password" className="input" type="password"
                  value={form.password} onChange={cambiar('password')}
                  autoComplete={fase === 'login' ? 'current-password' : 'new-password'} required autoFocus={fase === 'enlace'} />
                {fase !== 'login' && <span className="input-hint">Mínimo 8 caracteres</span>}
              </div>
            )}

            {(fase === 'setup' || fase === 'enlace' || fase === 'registro') && (
              <div className="field-group">
                <label htmlFor="gp-confirmar">Confirmar contraseña</label>
                <input id="gp-confirmar" className="input" type="password"
                  value={form.confirmar} onChange={cambiar('confirmar')} autoComplete="new-password" required />
              </div>
            )}

            {!(fase === 'olvide' && aviso) && (
              <button type="submit" className="btn-generate gp-btn" disabled={enviando}>
                {enviando ? 'Un momento…'
                  : fase === 'setup' ? 'Crear y entrar'
                  : fase === 'olvide' ? 'Enviar enlace'
                  : fase === 'enlace' ? 'Guardar y entrar'
                  : fase === 'registro' ? 'Crear cuenta'
                  : 'Entrar'}
              </button>
            )}

            {fase === 'login' && (
              <div className="gp-links">
                <button type="button" className="gp-link" onClick={() => irA('olvide')}>¿Olvidaste tu contraseña?</button>
                <button type="button" className="gp-link" onClick={() => irA('registro')}>¿Eres nuevo? Crea tu cuenta</button>
              </div>
            )}
            {(fase === 'olvide' || fase === 'enlace' || fase === 'registro') && (
              <button type="button" className="gp-link" onClick={() => irA('login')}>Volver a iniciar sesión</button>
            )}
          </form>
        )}
      </div>
    </>
  )
}
