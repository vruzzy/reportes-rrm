import { useState, useEffect, useCallback } from 'react'
import ResidentModal from './ResidentModal'
import logo from '../assets/logo.jpg'

function ConfirmDialog({ nombre, onConfirm, onCancel }) {
  return (
    <div className="confirm-backdrop">
      <div className="confirm-dialog" role="alertdialog">
        <div className="confirm-icon">
          <svg viewBox="0 0 24 24" fill="none">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </div>
        <h3>Eliminar residente</h3>
        <p>
          ¿Estás seguro de que deseas eliminar a <strong>{nombre}</strong>?<br />
          Esta acción no se puede deshacer.
        </p>
        <div className="confirm-actions">
          <button className="btn-confirm-cancel" onClick={onCancel}>Cancelar</button>
          <button className="btn-confirm-delete" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function ResidentesAdmin() {
  const [residentes, setResidentes] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState(null)
  const [confirmId, setConfirmId]   = useState(null)

  const loadResidentes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/residentes')
      if (!res.ok) throw new Error('Error al cargar residentes')
      const data = await res.json()
      setResidentes(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadResidentes() }, [loadResidentes])

  function handleAdd() {
    setEditing(null)
    setShowModal(true)
  }

  function handleEdit(r) {
    setEditing(r)
    setShowModal(true)
  }

  function handleDeleteRequest(id) {
    setConfirmId(id)
  }

  async function handleDeleteConfirm() {
    const id = confirmId
    setConfirmId(null)
    try {
      const res = await fetch(`/api/residentes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      setResidentes(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSave(data) {
    if (editing) {
      const res  = await fetch(`/api/residentes/${editing.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Error al actualizar')
      }
      const updated = await res.json()
      setResidentes(prev => prev.map(r => r.id === updated.id ? updated : r))
    } else {
      const res  = await fetch('/api/residentes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Error al crear residente')
      }
      const nuevo = await res.json()
      setResidentes(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    }
    setShowModal(false)
  }

  function formatFecha(dateStr) {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  const confirmResidente = residentes.find(r => r.id === confirmId)

  return (
    <>
      <div className="page-header">
        <img src={logo} alt="Residencia Refugio Mendoza" className="page-header-logo-img" />
        <div className="page-header-info">
          <h1>Residentes</h1>
          <p>Gestión de residentes activos</p>
        </div>
      </div>

      <button className="admin-add-btn" onClick={handleAdd}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8"  y1="12" x2="16" y2="12"/>
        </svg>
        Agregar residente
      </button>

      {error && (
        <div className="error-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 0 0 12px', color: 'inherit' }}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="admin-list">
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 72, borderRadius: 12 }} className="skeleton" />
          ))}
        </div>
      ) : residentes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏥</div>
          <h3>Sin residentes registrados</h3>
          <p>Agrega el primer residente usando el botón de arriba</p>
        </div>
      ) : (
        <div className="admin-list">
          {residentes.map(r => (
            <div key={r.id} className="residente-row">
              <div className="residente-row-avatar">{r.iniciales}</div>

              <div className="residente-row-info">
                <div className="residente-row-name">{r.nombre}</div>
                <div className="residente-row-meta">
                  <span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8"  y1="2" x2="8"  y2="6"/>
                      <line x1="3"  y1="10" x2="21" y2="10"/>
                    </svg>
                    Ingreso: {formatFecha(r.fecha_ingreso)}
                  </span>
                </div>
              </div>

              <div className="residente-row-actions">
                <button
                  className="icon-btn"
                  onClick={() => handleEdit(r)}
                  aria-label={`Editar a ${r.nombre}`}
                  title="Editar"
                >
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => handleDeleteRequest(r.id)}
                  aria-label={`Eliminar a ${r.nombre}`}
                  title="Eliminar"
                >
                  <svg viewBox="0 0 24 24" fill="none">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ResidentModal
          residente={editing}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {confirmId && (
        <ConfirmDialog
          nombre={confirmResidente?.nombre || ''}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </>
  )
}
