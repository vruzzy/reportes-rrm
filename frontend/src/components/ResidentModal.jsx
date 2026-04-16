import { useState, useEffect } from 'react'

function initials(nombre) {
  if (!nombre) return ''
  const parts = nombre.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ResidentModal({ residente, onSave, onClose }) {
  const editing = Boolean(residente)

  const [form, setForm] = useState({
    nombre:       residente?.nombre       || '',
    iniciales:    residente?.iniciales    || '',
    habitacion:   residente?.habitacion   || '',
    fecha_ingreso: residente?.fecha_ingreso || '',
  })

  const [autoInitials, setAutoInitials] = useState(!editing)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function handleNombreChange(e) {
    const nombre = e.target.value
    setForm(f => ({
      ...f,
      nombre,
      ...(autoInitials ? { iniciales: initials(nombre) } : {}),
    }))
  }

  function handleInicialesChange(e) {
    setAutoInitials(false)
    setForm(f => ({ ...f, iniciales: e.target.value.toUpperCase().slice(0, 2) }))
  }

  function handleChange(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.nombre.trim())         return setError('El nombre es obligatorio.')
    if (!form.iniciales.trim())      return setError('Las iniciales son obligatorias.')
    if (!form.habitacion.trim())     return setError('El número de habitación es obligatorio.')
    if (!form.fecha_ingreso)         return setError('La fecha de ingreso es obligatoria.')

    setSaving(true)
    try {
      await onSave({
        ...form,
        nombre:    form.nombre.trim(),
        iniciales: form.iniciales.trim().toUpperCase(),
        habitacion: form.habitacion.trim(),
      })
    } catch (err) {
      setError(err.message || 'Error al guardar. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={editing ? 'Editar residente' : 'Agregar residente'}>
        <div className="modal-header">
          <h2 className="modal-title">{editing ? 'Editar residente' : 'Agregar residente'}</h2>
          <button className="btn-close-sheet" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="error-banner" role="alert">{error}</div>
            )}

            <div className="field-group">
              <label htmlFor="nombre">Nombre completo *</label>
              <input
                id="nombre"
                className="input"
                type="text"
                placeholder="Ej. María González Pérez"
                value={form.nombre}
                onChange={handleNombreChange}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="field-row">
              <div className="field-group">
                <label htmlFor="iniciales">Iniciales *</label>
                <input
                  id="iniciales"
                  className="input"
                  type="text"
                  placeholder="MG"
                  value={form.iniciales}
                  onChange={handleInicialesChange}
                  maxLength={2}
                  style={{ textTransform: 'uppercase', textAlign: 'center', fontWeight: 700, fontSize: 18 }}
                />
                <span className="input-hint">2 letras, auto-generadas</span>
              </div>

              <div className="field-group">
                <label htmlFor="habitacion">Habitación *</label>
                <input
                  id="habitacion"
                  className="input"
                  type="text"
                  placeholder="Ej. 12A"
                  value={form.habitacion}
                  onChange={handleChange('habitacion')}
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="fecha_ingreso">Fecha de ingreso *</label>
              <input
                id="fecha_ingreso"
                className="input"
                type="date"
                value={form.fecha_ingreso}
                onChange={handleChange('fecha_ingreso')}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-modal-save" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar residente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
