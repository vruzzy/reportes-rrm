import { useState } from 'react'
import ReporteForm from './components/ReporteForm'
import ResidentesAdmin from './components/ResidentesAdmin'
import RecibosForm from './components/RecibosForm'
import HistorialForm from './components/HistorialForm'
import CalendarioForm from './components/CalendarioForm'
import GestionApp from './components/gestion/GestionApp'

export default function App() {
  const [activeTab, setActiveTab] = useState('recibos')

  return (
    <div className="app-wrapper">
      <div className="app-content">
        {activeTab === 'recibos'    && <RecibosForm />}
        {activeTab === 'reporte'    && <ReporteForm />}
        {activeTab === 'historial'  && <HistorialForm />}
        {activeTab === 'calendario' && <CalendarioForm />}
        {activeTab === 'residentes' && <ResidentesAdmin />}
        {activeTab === 'gestion'    && <GestionApp onSalir={() => setActiveTab('recibos')} />}
      </div>

      <nav className="bottom-nav">
        <button
          className={`nav-tab${activeTab === 'recibos' ? ' active' : ''}`}
          onClick={() => setActiveTab('recibos')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          <span>Recibos</span>
        </button>

        <button
          className={`nav-tab${activeTab === 'reporte' ? ' active' : ''}`}
          onClick={() => setActiveTab('reporte')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/>
            <line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
          <span>Reportes</span>
        </button>

        <button
          className={`nav-tab${activeTab === 'historial' ? ' active' : ''}`}
          onClick={() => setActiveTab('historial')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Historial</span>
        </button>

        <button
          className={`nav-tab${activeTab === 'calendario' ? ' active' : ''}`}
          onClick={() => setActiveTab('calendario')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
          </svg>
          <span>Calendario</span>
        </button>

        <button
          className={`nav-tab${activeTab === 'residentes' ? ' active' : ''}`}
          onClick={() => setActiveTab('residentes')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <span>Residentes</span>
        </button>

        <button
          className={`nav-tab${activeTab === 'gestion' ? ' active' : ''}`}
          onClick={() => setActiveTab('gestion')}
        >
          <span className="nav-badge" aria-hidden="true" />
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>Gestión</span>
        </button>
      </nav>
    </div>
  )
}
