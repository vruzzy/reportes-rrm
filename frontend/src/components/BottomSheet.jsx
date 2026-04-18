import { useEffect, useState } from 'react'
import { generarPDF } from '../utils/pdfGenerator'

async function guardarAprendizaje(residenteId, notas, reporteFinal) {
  if (!residenteId) return;
  try {
    await fetch('/api/guardar-aprendizaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residente_id: residenteId, notas, reporte_final: reporteFinal }),
    });
  } catch {}
}

export default function BottomSheet({ reporte, formData, residenteId, notasAdicionales, onClose }) {
  const [toast, setToast]         = useState('')
  const [editing, setEditing]     = useState(false)
  const [texto, setTexto]         = useState(reporte)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => { setTexto(reporte) }, [reporte])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  async function handleCopy() {
    guardarAprendizaje(residenteId, notasAdicionales, texto);
    try {
      await navigator.clipboard.writeText(texto)
      showToast('✓ Mensaje copiado')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity  = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      showToast('✓ Mensaje copiado')
    }
  }

  async function handleDownloadPDF() {
    guardarAprendizaje(residenteId, notasAdicionales, texto);
    try {
      await generarPDF({
        reporte:       texto,
        residente:     formData.residente,
        turno:         formData.turno,
        fecha:         formData.fecha,
        horaReporte:   formData.horaReporte,
        enfermero:     formData.enfermero,
        signosVitales: formData.signosVitales,
      })
      showToast('✓ PDF descargado')
    } catch (err) {
      console.error(err)
      showToast('Error al generar PDF')
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />

      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Reporte generado">
        <div className="sheet-handle" />

        <div className="sheet-header">
          <div className="sheet-title">
            <div className="sheet-title-dot" />
            Reporte generado
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className={`btn-action secondary`}
              style={{ padding: '6px 12px', fontSize: 13 }}
              onClick={() => setEditing(e => !e)}
            >
              {editing ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Listo
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Editar
                </>
              )}
            </button>
            <button className="btn-close-sheet" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </div>

        <div className="sheet-divider" />

        <div className="sheet-body">
          {editing ? (
            <textarea
              className="reporte-textarea"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <div className="reporte-text">{texto}</div>
          )}
        </div>

        <div className="sheet-actions">
          <button className="btn-action secondary" onClick={handleDownloadPDF}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar PDF
          </button>

          <button className="btn-action primary" onClick={handleCopy}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copiar mensaje
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
