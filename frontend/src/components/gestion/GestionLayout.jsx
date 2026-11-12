import { useEffect, useRef, useState } from 'react'
import logo from '../../assets/logo_rrm.png'
import GestionProximamente from './GestionProximamente'
import ResidentesListado from './ResidentesListado'
import {
  LayoutDashboard, Users, HeartPulse, History, Pill, Bath, Contact, Building2, Settings,
  ArrowLeft, LogOut, Menu, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import './gestion.css'

// Pantalla completa de Gestión: menú lateral claro (en móvil, desplegable).
const I = {
  inicio: LayoutDashboard, residentes: Users, controles: HeartPulse, historial: History,
  medicacion: Pill, banos: Bath, personal: Contact, centro: Building2, config: Settings,
}

const SECCIONES = [
  { items: [{ id: 'inicio', label: 'Inicio', icon: I.inicio }] },
  {
    titulo: 'Residentes',
    items: [
      { id: 'listado',    label: 'Listado',            icon: I.residentes },
      { id: 'controles',  label: 'Controles diarios',  icon: I.controles },
      { id: 'historial',  label: 'Historial',          icon: I.historial },
      { id: 'medicacion', label: 'Medicación',         icon: I.medicacion },
      { id: 'banos',      label: 'Baños',              icon: I.banos },
    ],
  },
  {
    titulo: 'Centro',
    items: [
      { id: 'personal', label: 'Personal',      icon: I.personal },
      { id: 'centro',   label: 'Instalaciones', icon: I.centro },
      { id: 'config',   label: 'Configuración', icon: I.config },
    ],
  },
]
const LISTOS = new Set(['listado'])
const TITULOS = Object.fromEntries(SECCIONES.flatMap(s => s.items.map(i => [i.id, i.label])))

function Icono({ icon: C }) {
  return <C className="gl-icon" size={20} strokeWidth={1.75} aria-hidden="true" />
}

function iniciales(nombre = '') {
  const p = nombre.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

export default function GestionLayout({ usuario, onLogout, onSalir }) {
  const [vista, setVista] = useState('listado')
  const [menuMovil, setMenuMovil] = useState(false)
  const rootRef = useRef(null)
  const [colapsado, setColapsado] = useState(() => {
    try { return localStorage.getItem('rrm_gestion_sidebar') === 'colapsado' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('rrm_gestion_sidebar', colapsado ? 'colapsado' : 'abierto') } catch {}
  }, [colapsado])

  // Atajo: [ para mostrar/ocultar la barra lateral
  useEffect(() => {
    function onKey(e) {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || e.ctrlKey || e.metaKey) return
      if (e.key === '[') setColapsado(c => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])


  function ir(id) {
    setVista(id)
    setMenuMovil(false)
  }

  return (
    <div className={`gl-root${colapsado ? " colapsado" : ""}`} ref={rootRef}>
      <aside className={`gl-sidebar${menuMovil ? ' open' : ''}`}>
        <div className="gl-brand">
          <img src={logo} alt="" />
          <div>
            <strong>Refugio Mendoza</strong>
            <span>Gestión</span>
          </div>
        </div>

        <button className="gl-toggle" onClick={() => setColapsado(c => !c)}
          aria-label={colapsado ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
          title={(colapsado ? 'Mostrar' : 'Ocultar') + ' barra  ·  tecla ['}>
          <Icono icon={colapsado ? PanelLeftOpen : PanelLeftClose} />
        </button>

        <nav className="gl-menu">
          {SECCIONES.map((s, i) => (
            <div key={i} className="gl-section" style={{ '--sec': i }}>
              {s.titulo && <div className="gl-section-title">{s.titulo}</div>}
              {s.items.map((item, j) => (
                <button key={item.id} style={{ '--i': i * 3 + j }} className={`gl-item${vista === item.id ? ' active' : ''}`} onClick={() => ir(item.id)} data-side={item.label}>
                  <Icono icon={item.icon} />
                  <span>{item.label}</span>
                  {!LISTOS.has(item.id) && item.id !== 'inicio' && <em className="gl-soon">Pronto</em>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <button className="gl-item gl-back" onClick={onSalir} data-side="Volver a la app">
          <Icono icon={ArrowLeft} /><span>Volver a la app</span>
        </button>

        <div className="gl-user">
          <div className="gl-user-avatar">{iniciales(usuario?.nombre)}</div>
          <div className="gl-user-text">
            <strong>{usuario?.nombre}</strong>
            <span>{usuario?.rol === 'admin' ? 'Administrador' : usuario?.rol}</span>
          </div>
          <button className="gl-icon-btn" onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <Icono icon={LogOut} />
          </button>
        </div>
      </aside>

      {menuMovil && <div className="gl-backdrop" onClick={() => setMenuMovil(false)} />}

      <main className="gl-main">
        <div className="gl-topbar">
          <button className="gl-icon-btn" onClick={() => setMenuMovil(true)} aria-label="Abrir menú">
            <Icono icon={Menu} />
          </button>
          <strong>{TITULOS[vista]}</strong>
        </div>

        <div className="gl-page" key={vista}>
          {vista === 'listado'
            ? <ResidentesListado />
            : (
              <>
                <header className="gl-header"><h1>{TITULOS[vista]}</h1></header>
                <GestionProximamente embebido />
              </>
            )}
        </div>
      </main>
    </div>
  )
}
