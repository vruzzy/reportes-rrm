import { useEffect, useState } from 'react'
import logo from '../../assets/logo_rrm.png'
import GestionLayout from './GestionLayout'

// Puerta de entrada a Gestión: crea el primer administrador o pide usuario/contraseña.
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

async function leerJson(res) {
  try { return await res.json() } catch { return {} }
}

export default function GestionApp({ onSalir }) {
  const [fase, setFase] = useState('cargando') // cargando | setup | login | dentro | error
  const [usuario, setUsuario] = useState(null)
  const [form, setForm] = useState({ nombre: '', usuario: '', password: '', confirmar: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { verificar() }, [])

  async function verificar() {
    setError('')
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

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (fase === 'setup' && form.password !== form.confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setEnviando(true)
    try {
      const res = await fetch(fase === 'setup' ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: form.nombre, usuario: form.usuario, password: form.password }),
      })
      const data = await leerJson(res)
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión.')
      guardarToken(data.token)
      setUsuario(data.usuario)
      setForm({ nombre: '', usuario: '', password: '', confirmar: '' })
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

  if (fase === 'dentro') {
    return <GestionLayout usuario={usuario} onLogout={cerrarSesion} onSalir={onSalir} />
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
            <button className="btn-generate gp-btn" onClick={verificar}>Reintentar</button>
          </div>
        )}

        {(fase === 'login' || fase === 'setup') && (
          <form className="gp-hero gp-login" onSubmit={enviar}>
            <span className="gp-pill">{fase === 'setup' ? 'Primera vez' : 'Iniciar sesión'}</span>
            <h2>{fase === 'setup' ? 'Crea el usuario administrador' : 'Ingresa a Gestión'}</h2>
            {fase === 'setup' && (
              <p>Este será el usuario principal para entrar a esta sección. Guarda bien la contraseña.</p>
            )}

            {error && <div className="error-banner" role="alert">{error}</div>}

            {fase === 'setup' && (
              <div className="field-group">
                <label htmlFor="gp-nombre">Nombre</label>
                <input id="gp-nombre" className="input" type="text" placeholder="Ej. Emiliano Gómez"
                  value={form.nombre} onChange={cambiar('nombre')} autoComplete="name" />
              </div>
            )}

            <div className="field-group">
              <label htmlFor="gp-usuario">Usuario</label>
              <input id="gp-usuario" className="input" type="text" autoCapitalize="none"
                value={form.usuario} onChange={cambiar('usuario')} autoComplete="username" required autoFocus />
            </div>

            <div className="field-group">
              <label htmlFor="gp-password">Contraseña</label>
              <input id="gp-password" className="input" type="password"
                value={form.password} onChange={cambiar('password')}
                autoComplete={fase === 'setup' ? 'new-password' : 'current-password'} required />
              {fase === 'setup' && <span className="input-hint">Mínimo 8 caracteres</span>}
            </div>

            {fase === 'setup' && (
              <div className="field-group">
                <label htmlFor="gp-confirmar">Confirmar contraseña</label>
                <input id="gp-confirmar" className="input" type="password"
                  value={form.confirmar} onChange={cambiar('confirmar')} autoComplete="new-password" required />
              </div>
            )}

            <button type="submit" className="btn-generate gp-btn" disabled={enviando}>
              {enviando ? 'Un momento…' : fase === 'setup' ? 'Crear y entrar' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
