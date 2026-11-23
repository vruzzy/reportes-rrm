import logo from '../../assets/logo_rrm.png'

// Sección en construcción: sistema de gestión integral de residentes.
// Todo lo nuevo vive en components/gestion/ para no tocar los módulos actuales.
// Actualiza `estado` conforme avance cada módulo: 'pendiente' | 'en_progreso' | 'listo'
const MODULOS = [
  { nombre: 'Listado de residentes',  detalle: 'Foto, CURP, mutualista, familiar, ubicación (en residencia / fuera)', estado: 'en_progreso' },
  { nombre: 'Ficha del residente',    detalle: 'Expediente completo, contactos de emergencia y datos médicos',       estado: 'pendiente' },
  { nombre: 'Pre-admisión',           detalle: 'Prospectos e ingresos en proceso',                                  estado: 'pendiente' },
  { nombre: 'Controles diarios',      detalle: 'Signos vitales al recibir y al entregar cada turno, con historial', estado: 'listo' },
  { nombre: 'Reportes de turno',      detalle: 'Reporte con IA dentro de Gestión, con los signos del turno incluidos', estado: 'listo' },
  { nombre: 'Medicación',             detalle: 'Esquema de medicamentos y registro de administración',              estado: 'en_progreso' },
  { nombre: 'Gestión de baños',       detalle: 'Programación y registro de baños',                                  estado: 'pendiente' },
  { nombre: 'Personal',               detalle: 'Funcionarios, roles y turnos',                                      estado: 'pendiente' },
]

const ETIQUETA = { pendiente: 'Pendiente', en_progreso: 'En progreso', listo: 'Listo' }

export default function GestionProximamente({ usuario, onLogout, embebido = false }) {
  const listos = MODULOS.filter(m => m.estado === 'listo').length
  const pct = Math.round((listos / MODULOS.length) * 100)

  return (
    <>
      {!embebido && <div className="page-header">
        <img src={logo} alt="RRM" className="page-header-logo-img" />
        <div className="page-header-info">
          <h1>Gestión</h1>
          <p>{usuario ? `Hola, ${usuario.nombre}` : 'Próximamente'}</p>
        </div>
        {onLogout && (
          <button className="gp-logout" onClick={onLogout}>Salir</button>
        )}
      </div>}

      <div className={embebido ? 'gp-wrap gp-embebido' : 'gp-wrap'}>
        <div className="gp-hero">
          <span className="gp-pill">Próximamente</span>
          <h2>Sistema de gestión de residentes</h2>
          <p>Estamos construyendo esta sección. Aquí podrás ir viendo los avances; el resto de la app sigue funcionando igual.</p>
          <div className="gp-progress" aria-label={`Avance ${pct}%`}>
            <div className="gp-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="gp-progress-label">{listos} de {MODULOS.length} módulos listos · {pct}%</div>
        </div>

        <ul className="gp-list">
          {MODULOS.map(m => (
            <li key={m.nombre} className="gp-item">
              <div className="gp-item-text">
                <strong>{m.nombre}</strong>
                <span>{m.detalle}</span>
              </div>
              <span className={`gp-estado gp-${m.estado}`}>{ETIQUETA[m.estado]}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
