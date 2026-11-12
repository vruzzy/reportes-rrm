import { useEffect, useRef, useState } from 'react'
import { gestionFetch } from './GestionApp'
import { Avatar, MUTUALISTA_LABEL, completitud } from './ResidentesListado'
import { Camera, X } from 'lucide-react'

const VACIO = {
  nombre: '', tipo_servicio: 'residencia_permanente', foto: '', fecha_nacimiento: '', curp: '',
  tipo_cliente: 'privado', mutualista: 'no_posee', mutualista_socio: '', mutualista_tel: '',
  emergencia: '', emergencia_tel: '', familiar: '', familiar_tel: '', ubicacion: 'residencia',
}

/** Reduce la foto a 256px JPEG para no inflar la base de datos */
function procesarFoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const lado = 256
      const escala = Math.max(lado / img.width, lado / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = lado
      const w = img.width * escala, h = img.height * escala
      canvas.getContext('2d').drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')) }
    img.src = url
  })
}

export default function ResidenteExpedienteModal({ residente, onClose, onSaved }) {
  const nuevo = !residente
  const [form, setForm] = useState(() => {
    const base = { ...VACIO }
    if (residente) for (const k of Object.keys(VACIO)) base[k] = residente[k] ?? VACIO[k]
    if (residente && !residente.familiar_tel && residente.whatsapp) base.familiar_tel = residente.whatsapp
    return base
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const inicial = useRef(JSON.stringify(form))
  const formRef = useRef(null)
  const sucio = JSON.stringify(form) !== inicial.current
  const comp = completitud({ ...form, whatsapp: '' })
  const [cerrando, setCerrando] = useState(false)

  function cerrarAnimado(fn) {
    setCerrando(true)
    setTimeout(fn, 220)
  }

  function intentarCerrar() {
    if (sucio && !window.confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) return
    cerrarAnimado(onClose)
  }

  // Esc cierra · Ctrl/Cmd+S guarda
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); intentarCerrar() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); formRef.current?.requestSubmit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  async function elegirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const foto = await procesarFoto(file)
      setForm(f => ({ ...f, foto }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      const res = await gestionFetch(nuevo ? '/api/gestion/residentes' : `/api/gestion/residentes/${residente.id}`, {
        method: nuevo ? 'POST' : 'PUT',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
      cerrarAnimado(() => onSaved(data))
    } catch (err) {
      setError(err.message || 'Error de conexión.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={`rm-overlay${cerrando ? ' closing' : ''}`} onClick={intentarCerrar}>
      <form ref={formRef} className="rm-modal" onClick={e => e.stopPropagation()} onSubmit={guardar}>
        <div className="rm-head">
          <label className="rm-avatar" title="Cambiar foto">
            <Avatar r={{ foto: form.foto, iniciales: (form.nombre || residente?.nombre || '?').slice(0, 2).toUpperCase() }} size={56} />
            <span className="rm-avatar-cam" aria-hidden="true">
              <Camera size={12} strokeWidth={2} />
            </span>
            <input type="file" accept="image/*" hidden onChange={elegirFoto} />
          </label>
          <div className="rm-head-text">
            <span className="gl-eyebrow">{nuevo ? 'Nuevo residente' : 'Expediente'}</span>
            <h2>{nuevo ? (form.nombre || 'Agregar residente') : residente.nombre}</h2>
            <div className="rm-progress" title={comp.faltan.length ? `Falta: ${comp.faltan.join(', ')}` : 'Expediente completo'}>
              <div className="rm-progress-bar"><i style={{ width: `${Math.round(comp.pct * 100)}%` }} /></div>
              <span>{comp.pct === 1 ? 'Completo' : `${Math.round(comp.pct * 100)}% completo`}</span>
            </div>
          </div>
          <button type="button" className="rm-close" onClick={intentarCerrar} aria-label="Cerrar (Esc)"><X size={18} strokeWidth={1.75} /></button>
        </div>

        <div className="rm-body">
          {error && <div className="rl-error" role="alert">{error}</div>}

          {form.foto && (
            <button type="button" className="rl-link rm-quitar" onClick={() => setForm(f => ({ ...f, foto: '' }))}>Quitar foto</button>
          )}

          {nuevo ? (
            <div className="rm-grid">
              <label className="rm-full">Nombre completo *
                <input className="input" value={form.nombre} onChange={set('nombre')} required autoFocus />
              </label>
              <label>Tipo de residente
                <select className="input" value={form.tipo_servicio} onChange={set('tipo_servicio')}>
                  <option value="residencia_permanente">Permanente</option>
                  <option value="centro_dia">Centro de día</option>
                </select>
              </label>
            </div>
          ) : null}

          <h3>Datos personales</h3>
          <div className="rm-grid">
            <label>Fecha de nacimiento
              <input className="input" type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
            </label>
            <label>CURP
              <input className="input rl-mono" maxLength={18} value={form.curp}
                onChange={e => setForm(f => ({ ...f, curp: e.target.value.toUpperCase() }))} />
            </label>
            <label>Tipo de cliente
              <select className="input" value={form.tipo_cliente} onChange={set('tipo_cliente')}>
                <option value="privado">Privado</option>
                <option value="convenio">Convenio</option>
              </select>
            </label>
            <label>Ubicación
              <select className="input" value={form.ubicacion} onChange={set('ubicacion')}>
                <option value="residencia">En residencia</option>
                <option value="fuera">Fuera del centro</option>
              </select>
            </label>
          </div>

          <h3>Mutualista / seguro</h3>
          <div className="rm-grid">
            <label>Mutualista
              <select className="input" value={form.mutualista} onChange={set('mutualista')}>
                {Object.entries(MUTUALISTA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>No. de socio / afiliación
              <input className="input" value={form.mutualista_socio} onChange={set('mutualista_socio')} disabled={form.mutualista === 'no_posee'} />
            </label>
            <label>Teléfono
              <input className="input" type="tel" value={form.mutualista_tel} onChange={set('mutualista_tel')} disabled={form.mutualista === 'no_posee'} />
            </label>
          </div>

          <h3>Contactos</h3>
          <div className="rm-grid">
            <label>Servicio de emergencia
              <input className="input" placeholder="Ej. Cruz Roja, ambulancia privada" value={form.emergencia} onChange={set('emergencia')} />
            </label>
            <label>Tel. emergencia
              <input className="input" type="tel" value={form.emergencia_tel} onChange={set('emergencia_tel')} />
            </label>
            <label>Familiar responsable
              <input className="input" value={form.familiar} onChange={set('familiar')} />
            </label>
            <label>Tel. familiar
              <input className="input" type="tel" value={form.familiar_tel} onChange={set('familiar_tel')} />
            </label>
          </div>
        </div>

        <div className="rm-foot">
          <span className="rm-hint"><kbd>Esc</kbd> cerrar · <kbd>Ctrl</kbd>+<kbd>S</kbd> guardar</span>
          <button type="button" className="rl-btn" onClick={intentarCerrar}>Cancelar</button>
          <button type="submit" className="rl-btn rl-btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
