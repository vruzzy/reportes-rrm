import { useState } from 'react'
import ReporteForm from './components/ReporteForm'
import ResidentesAdmin from './components/ResidentesAdmin'
import RecibosForm from './components/RecibosForm'

export default function App() {
  const [activeTab, setActiveTab] = useState('recibos')

  return (
    <div className="app-wrapper">
      <div className="app-content">
        {activeTab === 'recibos'    && <RecibosForm />}
        {activeTab === 'reporte'    && <ReporteForm />}
        {activeTab === 'residentes' && <ResidentesAdmin />}
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
      </nav>
    </div>
  )
}
