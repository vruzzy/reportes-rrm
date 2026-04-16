import { useEffect, useState } from 'react'
import { generarPDF } from '../utils/pdfGenerator'

export default function BottomSheet({ reporte, formData, onClose }) {
  const [toast, setToast] = useState('')

  // Prevent body scroll when sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reporte)
      showToast('✓ Mensaje copiado')
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea')
      ta.value = reporte
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
    try {
      await generarPDF({
        reporte,
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
          <button className="btn-close-sheet" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="sheet-divider" />

        <div className="sheet-body">
          <div className="reporte-text">{reporte}</div>
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
