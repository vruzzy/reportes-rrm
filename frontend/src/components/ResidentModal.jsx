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
    nombre:        residente?.nombre        || '',
    iniciales:     residente?.iniciales     || '',
    fecha_ingreso: residente?.fecha_ingreso || new Date().toISOString().slice(0,10),
    ciudad:        residente?.ciudad        || 'Mérida, Yucatán',
    mensualidad:   residente?.mensualidad   != null ? String(residente.mensualidad) : '',
    familiar:      residente?.familiar      || '',
    dia_pago:      residente?.dia_pago      != null ? String(residente.dia_pago) : '1',
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

    if (!form.nombre.trim())    return setError('El nombre es obligatorio.')
    if (!form.iniciales.trim()) return setError('Las iniciales son obligatorias.')
    if (!form.familiar.trim())  return setError('El nombre del familiar es obligatorio.')

    setSaving(true)
    try {
      await onSave({
        ...form,
        nombre:      form.nombre.trim(),
        iniciales:   form.iniciales.trim().toUpperCase(),
        ciudad:      form.ciudad.trim() || 'Mérida, Yucatán',
        mensualidad: parseFloat(form.mensualidad) || 0,
        familiar:    form.familiar.trim(),
        dia_pago:    Math.min(31, Math.max(1, parseInt(form.dia_pago) || 1)),
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
            {error && <div className="error-banner" role="alert">{error}</div>}

            {/* Nombre del residente */}
            <div className="field-group">
              <label htmlFor="nombre">Nombre del residente *</label>
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
                <span className="input-hint">Auto-generadas</span>
              </div>
            </div>

            {/* Familiar */}
            <div className="field-group">
              <label htmlFor="familiar">Nombre del familiar *</label>
              <input
                id="familiar"
                className="input"
                type="text"
                placeholder="Ej. Juan González López"
                value={form.familiar}
                onChange={handleChange('familiar')}
                autoComplete="off"
              />
              <span className="input-hint">Aparece en el campo "Recibí" del recibo</span>
            </div>

            {/* Día de pago */}
            <div className="field-row">
              <div className="field-group" style={{ flex: 1 }}>
                <label htmlFor="dia_pago">Día de pago</label>
                <input
                  id="dia_pago"
                  className="input"
                  type="number"
                  min="1"
                  max="31"
                  value={form.dia_pago}
                  onChange={handleChange('dia_pago')}
                  inputMode="numeric"
                  style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }}
                />
                <span className="input-hint">Del 1 al 31</span>
              </div>
              <div className="field-group" style={{ flex: 2 }}>
                <label htmlFor="mensualidad">Mensualidad ($)</label>
                <input
                  id="mensualidad"
                  className="input"
                  type="number"
                  placeholder="0"
                  min="0"
                  step="any"
                  value={form.mensualidad}
                  onChange={handleChange('mensualidad')}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="ciudad">Ciudad</label>
              <input
                id="ciudad"
                className="input"
                type="text"
                placeholder="Mérida, Yucatán"
                value={form.ciudad}
                onChange={handleChange('ciudad')}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-modal-save" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar residente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
