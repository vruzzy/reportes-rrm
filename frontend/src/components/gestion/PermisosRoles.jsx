import { Fragment, useEffect, useMemo, useState } from 'react'
import { pedir, enviar } from './medicacionUtil'
import { Dialogo } from './CatalogoMedicamentos'
import { Info, Plus, Check, Loader2, Pencil, Trash2, Bell, Mail, Search, Users } from 'lucide-react'
import './permisos.css'

// Configuración → Permisos y notificaciones: qué puede ver, crear, editar y eliminar cada rol en cada sección,
// y qué avisos le llegan (campanita y/o correo). Solo el administrador.

const API = '/api/gestion/roles'
export const ACCION_LABEL = { ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar' }

// Lo que tiene cualquier persona con cuenta, sin importar su rol (no se puede quitar)
const PARA_TODOS = [
  { label: 'Inicio', desc: 'Su semana, su horario, su calendario y lo que le toca hoy.' },
  { label: 'Mis actividades', desc: 'Solo ve y marca SUS actividades (y los baños de los residentes que tiene en su rol). Ver las de los demás es "Actividades del personal".' },
  { label: 'Entradas y salidas: marcar', desc: 'Marcar su propia entrada y salida y ver sus días. Ver a todos es "Entradas y salidas".' },
  { label: 'Mi cuenta y avisos', desc: 'Cambiar su nombre, correo y contraseña, y recibir sus avisos en la campanita.' },
]

/**
 * Tabla de permisos: filas = secciones (agrupadas), columnas = Ver / Crear / Editar / Eliminar.
 * valor: { seccion: ['ver', …] }. Marcar crear/editar/eliminar marca ver; quitar ver quita todo.
 */
export function MatrizPermisos({ modulos, acciones, valor, onChange, bloqueado = false }) {
  const [info, setInfo] = useState(null)   // `${modulo}|${accion}`
  const grupos = useMemo(() => {
    const g = []
    for (const m of modulos) { const x = g.find(y => y.seccion === m.seccion); if (x) x.items.push(m); else g.push({ seccion: m.seccion, items: [m] }) }
    return g
  }, [modulos])
  function cambiar(mod, acc, on) {
    const actual = new Set(valor[mod] || [])
    if (acc === 'ver' && !on) actual.clear()
    else if (on) { actual.add(acc); actual.add('ver') } else actual.delete(acc)
    const lista = acciones.filter(a => actual.has(a))
    const nuevo = { ...valor }
    if (lista.length) nuevo[mod] = lista; else delete nuevo[mod]
    onChange(nuevo)
  }
  const infoTexto = info && (() => { const [m, a] = info.split('|'); const mod = modulos.find(x => x.id === m); return { mod, a, txt: mod?.acciones[a] } })()
  return (
    <div className="pm-wrap">
      <table className="pm-tabla">
        <thead>
          <tr><th className="pm-th-sec">Sección</th>{acciones.map(a => <th key={a}>{ACCION_LABEL[a]}</th>)}</tr>
        </thead>
        <tbody className="pm-todos">
          <tr className="pm-grupo"><td colSpan={acciones.length + 1}>Para todos · no se puede quitar</td></tr>
          {PARA_TODOS.map(x => (
            <tr key={x.label}>
              <th scope="row" className="pm-sec">{x.label}<span>{x.desc}</span></th>
              {acciones.map(a => <td key={a} className={a === 'ver' ? '' : 'pm-na'}>{a === 'ver' ? <input type="checkbox" checked disabled aria-label={x.label + ': siempre'} /> : '—'}</td>)}
            </tr>
          ))}
        </tbody>
        {grupos.map(g => (
          <tbody key={g.seccion}>
            <tr className="pm-grupo"><td colSpan={acciones.length + 1}>{g.seccion}</td></tr>
            {g.items.map(m => (
              <Fragment key={m.id}>
                <tr>
                  <th scope="row" className="pm-sec">{m.label}</th>
                  {acciones.map(a => {
                    if (!m.acciones[a]) return <td key={a} className="pm-na" aria-label="No aplica">—</td>
                    const on = (valor[m.id] || []).includes(a)
                    const k = `${m.id}|${a}`
                    return (
                      <td key={a}>
                        <span className="pm-celda">
                          <input type="checkbox" checked={on} disabled={bloqueado} onChange={e => cambiar(m.id, a, e.target.checked)}
                            aria-label={`${m.label}: ${ACCION_LABEL[a]}`} />
                          <button type="button" className={`pm-info${info === k ? ' on' : ''}`} onClick={() => setInfo(i => (i === k ? null : k))}
                            aria-label={`Qué permite ${ACCION_LABEL[a]} en ${m.label}`} title={m.acciones[a]}><Info /></button>
                        </span>
                      </td>
                    )
                  })}
                </tr>
                {infoTexto?.mod?.id === m.id && (
                  <tr className="pm-info-fila"><td colSpan={acciones.length + 1}><b>{ACCION_LABEL[infoTexto.a]}:</b> {infoTexto.txt}</td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

/** Tabla de avisos: filas = tipos de aviso, columnas = Campanita / Correo. */
export function MatrizAvisos({ notificaciones, valor, onChange }) {
  function cambiar(id, canal, on) {
    const x = { campana: false, correo: false, ...(valor[id] || {}), [canal]: on }
    const nuevo = { ...valor }
    if (x.campana || x.correo) nuevo[id] = x; else delete nuevo[id]
    onChange(nuevo)
  }
  return (
    <div className="pm-wrap">
      <table className="pm-tabla pm-avisos">
        <thead><tr><th className="pm-th-sec">Aviso</th><th><Bell /> Campanita</th><th><Mail /> Correo</th></tr></thead>
        <tbody>
          {notificaciones.map(n => (
            <tr key={n.id}>
              <th scope="row" className="pm-sec">{n.label}<span>{n.descripcion}</span></th>
              {['campana', 'correo'].map(c => (
                <td key={c}><input type="checkbox" checked={!!valor[n.id]?.[c]} onChange={e => cambiar(n.id, c, e.target.checked)} aria-label={`${n.label}: ${c === 'campana' ? 'campanita' : 'correo'}`} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PermisosRoles() {
  const [datos, setDatos] = useState(null)
  const [sel, setSel] = useState(null)
  const [borrador, setBorrador] = useState(null)   // { permisos, notificaciones }
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [dialogo, setDialogo] = useState(null)      // 'nuevo' | 'nombre'

  useEffect(() => { pedir(API).then(d => { setDatos(d); setSel(d.roles.find(r => r.id !== 'admin')?.id || d.roles[0]?.id) }).catch(e => setError(e.message)) }, [])
  const rol = datos?.roles.find(r => r.id === sel)
  useEffect(() => { if (rol) setBorrador({ permisos: rol.permisos, notificaciones: rol.notificaciones }); setOk('') }, [sel, datos]) // eslint-disable-line react-hooks/exhaustive-deps
  const sucio = rol && borrador && (JSON.stringify(borrador.permisos) !== JSON.stringify(rol.permisos) || JSON.stringify(borrador.notificaciones) !== JSON.stringify(rol.notificaciones))

  function elegir(id) {
    if (sucio && !window.confirm('Tienes cambios sin guardar en este rol. ¿Cambiar de rol de todos modos?')) return
    setSel(id)
  }
  const reemplazar = (r) => setDatos(d => ({ ...d, roles: d.roles.some(x => x.id === r.id) ? d.roles.map(x => (x.id === r.id ? r : x)) : [...d.roles, r] }))

  async function guardar() {
    setError(''); setOk(''); setGuardando(true)
    try { const r = await enviar(`${API}/${rol.id}`, 'PUT', borrador); reemplazar(r); setOk('Guardado. Los cambios aplican la próxima vez que cada persona abra Gestión.') }
    catch (e) { setError(e.message) } finally { setGuardando(false) }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar el rol "${rol.label}"?`)) return
    setError('')
    try { await pedir(`${API}/${rol.id}`, { method: 'DELETE' }); setDatos(d => ({ ...d, roles: d.roles.filter(x => x.id !== rol.id) })); setSel(datos.roles.find(x => x.id !== rol.id && x.id !== 'admin')?.id) }
    catch (e) { setError(e.message) }
  }

  if (!datos) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
  const visibles = datos.roles.filter(r => !filtro || r.label.toLowerCase().includes(filtro.toLowerCase()))

  return (
    <div className="pm-root">
      <p className="ac-ayuda">Elige un rol y marca qué puede hacer en cada sección. Toca <Info className="pm-ico-inline" /> para ver dónde se usa cada permiso. A una persona en particular también se le pueden personalizar desde <b>Usuarios y permisos</b>.</p>

      <div className="pm-layout">
        <aside className="pm-roles">
          <div className="pm-roles-head">
            <label className="pm-filtro"><Search /><input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar rol…" aria-label="Buscar rol" /></label>
            <button className="rl-btn rl-btn-primary" onClick={() => setDialogo('nuevo')}><Plus /> Agregar rol</button>
          </div>
          <ul>
            {visibles.map(r => (
              <li key={r.id}>
                <button className={`pm-rol${r.id === sel ? ' active' : ''}`} onClick={() => elegir(r.id)} aria-current={r.id === sel}>
                  <strong>{r.label}</strong>
                  <span><Users /> {r.personas} {r.personas === 1 ? 'persona' : 'personas'}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {rol && borrador && (
          <section className="pm-detalle">
            <div className="pm-detalle-head">
              <h3>{rol.label}</h3>
              {!rol.sistema && <button className="rl-link" onClick={() => setDialogo('nombre')}><Pencil /> Cambiar nombre</button>}
              {!rol.sistema && <button className="rl-link pm-borrar" onClick={borrar}><Trash2 /> Borrar rol</button>}
              <span className="pm-guardar">
                {ok && <span className="rd-estado ok"><Check /> {ok}</span>}
                <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={!sucio || guardando}>{guardando ? <Loader2 className="cd-spin" /> : <Check />} Guardar cambios</button>
              </span>
            </div>
            {error && <div className="rl-error">{error}</div>}

            <h4 className="pm-h4">Permisos</h4>
            {rol.sistema && <p className="ac-sutil">El administrador siempre puede todo, incluida la administración de usuarios y de estos permisos.</p>}
            <MatrizPermisos modulos={datos.modulos} acciones={datos.acciones} valor={borrador.permisos} bloqueado={rol.sistema}
              onChange={p => { setOk(''); setBorrador(b => ({ ...b, permisos: p })) }} />

            <h4 className="pm-h4">Notificaciones</h4>
            <p className="ac-sutil">Qué avisos le llegan a las personas con este rol. Para que llegue por correo, la persona necesita tener correo en su cuenta.</p>
            <MatrizAvisos notificaciones={datos.notificaciones} valor={borrador.notificaciones}
              onChange={n => { setOk(''); setBorrador(b => ({ ...b, notificaciones: n })) }} />
          </section>
        )}
      </div>

      {dialogo && (
        <DialogoRol rol={dialogo === 'nombre' ? rol : null} roles={datos.roles} onCerrar={() => setDialogo(null)}
          onListo={(r) => { reemplazar(r); setSel(r.id); setDialogo(null) }} />
      )}
    </div>
  )
}

function DialogoRol({ rol, roles, onCerrar, onListo }) {
  const [label, setLabel] = useState(rol?.label || '')
  const [copiar, setCopiar] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    setError(''); setGuardando(true)
    try { onListo(rol ? await enviar(`${API}/${rol.id}`, 'PUT', { label }) : await enviar(API, 'POST', { label, copiar_de: copiar || null })) }
    catch (e) { setError(e.message); setGuardando(false) }
  }
  return (
    <Dialogo titulo={rol ? 'Cambiar nombre del rol' : 'Agregar rol'} onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando || label.trim().length < 2}>{guardando ? <Loader2 className="cd-spin" /> : <Check />} {rol ? 'Guardar' : 'Agregar'}</button></>}>
      <label className="md-campo"><span>Nombre del rol</span>
        <input className="md-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Por ejemplo: Cuidador/a, Mantenimiento, Director técnico" autoFocus maxLength={60} /></label>
      {!rol && (
        <label className="md-campo"><span>Empezar con los permisos de</span>
          <select className="md-input" value={copiar} onChange={e => setCopiar(e.target.value)}>
            <option value="">Ninguno (sin permisos)</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select></label>
      )}
      {error && <div className="rl-error">{error}</div>}
    </Dialogo>
  )
}
