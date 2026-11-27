import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pedir, enviar, fechaLarga, fechaCorta, moverFecha } from './medicacionUtil'
import { Dialogo } from './CatalogoMedicamentos'
import { fechaLocal } from './signosVitales'
import { DiaBarra } from './Banos'
import {
  Plus, X, Copy, Bath, Highlighter, Loader2, Check, MessageCircle, Pencil, CalendarDays, Search, ListChecks, UserPlus,
  ChevronLeft, ChevronRight, CircleAlert,
} from 'lucide-react'

// Rol del día: la misma hoja que se hacía en Word (una columna por persona: horario, residentes y tareas),
// pero se arma en segundos: se copia el de ayer y solo se mueve lo que cambia. Se guarda sola.
// Cada persona ve su columna en "Mis actividades" y marca sus tareas.

const API = '/api/gestion/rol'
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('')
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || ''

export default function RolDia() {
  const [fecha, setFecha] = useState(fechaLocal())
  const [datos, setDatos] = useState(null)       // respuesta del servidor (personal, residentes, base…)
  const [cols, setCols] = useState([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [estado, setEstado] = useState('ok')     // ok | pendiente | guardando | error
  const [menu, setMenu] = useState(null)         // { tipo:'res'|'tarea', valor, x, y }
  const [copiarDe, setCopiarDe] = useState(false)
  const [agregar, setAgregar] = useState(false)

  const colsRef = useRef(cols); colsRef.current = cols
  const version = useRef(0)
  const sucio = useRef(false)
  const enVuelo = useRef(null)
  const otraVez = useRef(false)

  // ── Guardar (en orden, una petición a la vez) ──
  const guardarYa = useCallback(async (f) => {
    if (enVuelo.current) { otraVez.current = true; return enVuelo.current }
    sucio.current = false
    setEstado('guardando')
    const p = (async () => {
      try {
        const r = await enviar(`${API}/${f}`, 'PUT', { columnas: colsRef.current, version: version.current })
        version.current = r.rol.version
        setEstado('ok'); setError('')
      } catch (e) {
        if (e.status === 409 && e.data?.rol) {
          version.current = e.data.rol.version
          setCols(e.data.rol.columnas); setAviso(e.message); setEstado('ok')
          otraVez.current = false
        } else { setEstado('error'); setError(e.message); sucio.current = true }
      } finally { enVuelo.current = null }
      if (otraVez.current) { otraVez.current = false; await guardarYa(f) }
    })()
    enVuelo.current = p
    return p
  }, [])

  useEffect(() => {
    if (!sucio.current) return
    setEstado('pendiente')
    const t = setTimeout(() => guardarYa(fecha), 500)
    return () => clearTimeout(t)
  }, [cols, fecha, guardarYa])

  const cargar = useCallback(async (f) => {
    setError('')
    try {
      const d = await pedir(`${API}?fecha=${f}`)
      version.current = d.rol.version
      sucio.current = false
      setDatos(d); setCols(d.rol.columnas); setEstado('ok')
    } catch (e) { setError(e.message) }
  }, [])

  useEffect(() => {
    setDatos(null); setAviso('')
    cargar(fecha)
    // Si quedó algo sin guardar al cambiar de día, se guarda en el día que era
    return () => { if (sucio.current) guardarYa(fecha) }
  }, [fecha, cargar, guardarYa])

  const cambiar = (fn) => { sucio.current = true; setCols(c => fn(c.map(x => ({ ...x, residentes: [...x.residentes], tareas: [...x.tareas] })))) }

  // ── Datos derivados ──
  const personal = datos?.personal || []
  const porUsuario = useMemo(() => Object.fromEntries(personal.map(p => [p.id, p])), [personal])
  const residentes = datos?.residentes || []
  const porResidente = useMemo(() => Object.fromEntries(residentes.map(r => [r.id, r])), [residentes])
  const nombreCol = (c) => (c.usuario_id ? porUsuario[c.usuario_id]?.nombre || 'Persona desactivada' : c.nombre)
  const asignados = useMemo(() => {
    const m = {}
    cols.forEach((c, i) => c.residentes.forEach(r => { m[r.id] = i }))
    return m
  }, [cols])
  const tareasUsadas = useMemo(() => new Set(cols.flatMap(c => c.tareas.map(t => norm(t.titulo)))), [cols])
  const faltanRes = residentes.filter(r => r.ubicacion === 'residencia' && !(r.id in asignados))
  const faltanTareas = (datos?.base.tareas || []).filter(t => !tareasUsadas.has(norm(t)))
  const hechas = datos?.hechas || {}

  // ── Acciones ──
  // Mover un residente o una tarea a otra columna (destino null = quitar del rol)
  const ponerResidente = (id, destino) => cambiar(c => {
    if (destino != null && c[destino]?.residentes.some(r => r.id === id)) return c
    let previo = false
    c.forEach(x => { const r = x.residentes.find(y => y.id === id); if (r) previo = r.resaltado; x.residentes = x.residentes.filter(y => y.id !== id) })
    if (destino != null && c[destino]) c[destino].residentes.push({ id, resaltado: previo })
    return c
  })
  const ponerTarea = (tarea, destino) => cambiar(c => {
    if (destino != null && tarea.uid && c[destino]?.tareas.some(t => t.uid === tarea.uid)) return c
    c.forEach(x => { x.tareas = x.tareas.filter(t => t.uid !== tarea.uid) })
    if (destino != null && c[destino]) c[destino].tareas.push({ uid: tarea.uid || uid(), titulo: tarea.titulo, resaltada: !!tarea.resaltada })
    return c
  })
  const agregarTareas = (i, texto) => {
    const lista = texto.split(/\n/).map(t => t.replace(/^\s*[-•*·]+\s*/, '').trim()).filter(Boolean)
    if (lista.length) cambiar(c => { c[i].tareas.push(...lista.map(t => ({ uid: uid(), titulo: t.slice(0, 140), resaltada: false }))); return c })
  }
  const resaltar = (i, tipo, clave) => cambiar(c => {
    if (tipo === 'res') c[i].residentes = c[i].residentes.map(r => (r.id === clave ? { ...r, resaltado: !r.resaltado } : r))
    else c[i].tareas = c[i].tareas.map(t => (t.uid === clave ? { ...t, resaltada: !t.resaltada } : t))
    return c
  })
  const editarCol = (i, campos) => cambiar(c => { c[i] = { ...c[i], ...campos }; return c })
  const quitarCol = (i) => cambiar(c => c.filter((_, j) => j !== i))
  const moverCol = (i, d) => cambiar(c => { const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j], c[i]]; return c })
  async function traerDelHorario() {
    setError('')
    try {
      const r = await pedir(`/api/gestion/personal/dia?fecha=${fecha}`)
      const ya = new Set(colsRef.current.map(c => (c.usuario_id ? `u${c.usuario_id}` : `n${norm(c.nombre)}`)))
      const nuevas = r.personas.filter(p => !ya.has(p.usuario_id ? `u${p.usuario_id}` : `n${norm(p.nombre)}`))
        .map(p => ({ usuario_id: p.usuario_id || null, nombre: p.usuario_id ? '' : p.nombre, horario: p.etiqueta, residentes: [], tareas: [] }))
      if (!r.personas.length) return setAviso('El horario semanal no tiene a nadie trabajando este día.')
      if (!nuevas.length) return setAviso('Todos los que trabajan hoy según el horario ya están en el rol.')
      cambiar(c => [...c, ...nuevas])
      setAviso(`Se agregaron ${nuevas.length} ${nuevas.length === 1 ? 'persona' : 'personas'} del horario semanal, con su horario.`)
    } catch (e) { setError(e.message) }
  }
  const agregarCol = (col) => { cambiar(c => [...c, { horario: '', residentes: [], tareas: [], ...col }]); setAgregar(false) }

  async function copiar(de) {
    setError(''); setCopiarDe(false)
    if (enVuelo.current) await enVuelo.current
    try {
      const r = await enviar(`${API}/${fecha}/copiar`, 'POST', { de })
      version.current = r.rol.version; sucio.current = false
      setCols(r.rol.columnas); setDatos(d => ({ ...d, hechas: {} }))
      setAviso(`Se copió el rol del ${fechaLarga(de)}. Mueve solo lo que cambia hoy.`)
    } catch (e) { setError(e.message) }
  }

  function textoWhatsApp() {
    const lineas = [`*ROL DEL DÍA · ${fechaLarga(fecha).toUpperCase()}*`, '']
    for (const c of cols) {
      lineas.push(`*${nombreCol(c).toUpperCase()}*${c.horario ? `  (${c.horario})` : ''}`)
      if (c.residentes.length) lineas.push(`Residentes: ${c.residentes.map(r => { const n = porResidente[r.id]?.corto || ''; return r.resaltado ? `*${n}*` : n }).join(', ')}`)
      c.tareas.forEach(t => lineas.push(`• ${t.resaltada ? `*${t.titulo}*` : t.titulo}`))
      lineas.push('')
    }
    return lineas.join('\n').trim()
  }
  async function copiarWhatsApp() {
    try { await navigator.clipboard.writeText(textoWhatsApp()); setAviso('Se copió el rol. Pégalo en WhatsApp.') }
    catch { setError('No se pudo copiar. Intenta otra vez.') }
  }

  // ── Arrastrar y soltar (en computadora); en celular se usa el toque ──
  const arrastrar = (e, payload) => { e.dataTransfer.setData('text/plain', JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'move' }
  const soltar = (e, destino) => {
    e.preventDefault(); e.currentTarget.classList.remove('rd-sobre')
    let p; try { p = JSON.parse(e.dataTransfer.getData('text/plain')) } catch { return }
    if (p.tipo === 'res') ponerResidente(p.id, destino)
    if (p.tipo === 'tarea') ponerTarea(p, destino)
  }
  const zona = (destino) => ({
    onDragOver: (e) => { e.preventDefault(); e.currentTarget.classList.add('rd-sobre') },
    onDragLeave: (e) => e.currentTarget.classList.remove('rd-sobre'),
    onDrop: (e) => soltar(e, destino),
  })

  const abrirMenu = (e, tipo, valor) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ tipo, valor, x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 4 })
  }

  if (!datos) return (<>
    <DiaBarra fecha={fecha} onCambio={setFecha} hoy={fechaLocal()} />
    {error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>}
  </>)

  const usados = new Set(cols.map(c => c.usuario_id).filter(Boolean))

  return (
    <div className="rd-root">
      <div className="rd-barra">
        <DiaBarra fecha={fecha} onCambio={setFecha} hoy={datos.hoy} />
        {cols.length > 0 && (
          <div className="rd-acciones">
            <span className={`rd-estado ${estado}`} aria-live="polite">
              {estado === 'guardando' || estado === 'pendiente' ? <><Loader2 className="cd-spin" /> Guardando…</>
                : estado === 'error' ? <><CircleAlert /> Sin guardar</> : <><Check /> Guardado</>}
            </span>
            {estado === 'error' && <button className="rl-btn" onClick={() => guardarYa(fecha)}>Reintentar</button>}
            <button className="rl-btn" onClick={traerDelHorario}><UserPlus /> Traer del horario</button>
            <button className="rl-btn" onClick={() => setCopiarDe(true)}><CalendarDays /> Copiar de otro día</button>
            <button className="rl-btn" onClick={copiarWhatsApp}><MessageCircle /> Copiar para WhatsApp</button>
          </div>
        )}
      </div>
      {error && <div className="rl-error">{error}</div>}
      {aviso && <div className="rd-aviso"><Check /> {aviso}<button className="rl-icon-btn" onClick={() => setAviso('')} aria-label="Cerrar aviso"><X /></button></div>}

      {cols.length === 0 ? (
        <div className="ac-panel rd-inicio">
          <ListChecks />
          <strong>Todavía no hay rol para {fecha === datos.hoy ? 'hoy' : 'este día'}</strong>
          <span>Lo más rápido: copia el de otro día y solo mueve lo que cambia.</span>
          <div className="rd-inicio-btns">
            {datos.anterior && <button className="rl-btn rl-btn-primary" onClick={() => copiar(datos.anterior)}><Copy /> Copiar el del {fechaLarga(datos.anterior)}</button>}
            <button className="rl-btn" onClick={() => setCopiarDe(true)}><CalendarDays /> Copiar de otro día</button>
            <button className="rl-btn" onClick={traerDelHorario}><UserPlus /> Traer a quienes trabajan (horario)</button>
            <button className="rl-btn" onClick={() => setAgregar(true)}><UserPlus /> Empezar en blanco</button>
          </div>
        </div>
      ) : (<>
        {/* Lo que falta repartir */}
        <section className="ac-panel rd-falta" {...zona(null)}>
          <div className="rd-falta-head">
            <h2 className="ac-h2">Falta asignar</h2>
            <span className="ac-sutil">Toca uno para decir a quién va{window.matchMedia?.('(pointer: fine)').matches ? ', o arrástralo a su columna' : ''}.</span>
          </div>
          {!faltanRes.length && !faltanTareas.length ? <p className="rd-todo"><Check /> Todos los residentes y tareas de siempre ya tienen a alguien.</p> : (<>
            {faltanRes.length > 0 && <div className="rd-fila-chips">
              <span className="rd-etq">Residentes</span>
              {faltanRes.map(r => (
                <button key={r.id} className="rd-chip res" draggable onDragStart={e => arrastrar(e, { tipo: 'res', id: r.id })} onClick={e => abrirMenu(e, 'res', r.id)}>
                  {r.corto}{r.toca_bano && <Bath className="rd-bano" aria-label="le toca baño" />}
                </button>
              ))}
            </div>}
            {faltanTareas.length > 0 && <div className="rd-fila-chips">
              <span className="rd-etq">Tareas</span>
              {faltanTareas.map(t => (
                <button key={t} className="rd-chip tarea" draggable onDragStart={e => arrastrar(e, { tipo: 'tarea', titulo: t })} onClick={e => abrirMenu(e, 'tarea', { titulo: t })}>{t}</button>
              ))}
            </div>}
          </>)}
        </section>

        <div className="rd-grid">
          {cols.map((c, i) => (
            <Columna key={c.usuario_id ? `u${c.usuario_id}` : `n${i}${c.nombre}`} c={c} i={i} total={cols.length} nombre={nombreCol(c)}
              puesto={c.usuario_id ? porUsuario[c.usuario_id]?.rol_label : 'Sin cuenta en el sistema'}
              horarios={datos.base.horarios} tareasBase={datos.base.tareas} porResidente={porResidente} hechas={hechas} zona={zona(i)}
              arrastrar={arrastrar} abrirMenu={abrirMenu} editarCol={editarCol} quitarCol={quitarCol} moverCol={moverCol}
              ponerResidente={ponerResidente} ponerTarea={ponerTarea} agregarTareas={agregarTareas} resaltar={resaltar}
              faltanRes={faltanRes} asignados={asignados} nombreDe={(j) => primerNombre(nombreCol(cols[j]))} />
          ))}
          <button className="rd-col rd-col-nueva" onClick={() => setAgregar(true)}><UserPlus /> Agregar persona</button>
        </div>
      </>)}

      {menu && <MenuAsignar menu={menu} cols={cols} nombreCol={nombreCol} onCerrar={() => setMenu(null)}
        onElegir={(i) => { menu.tipo === 'res' ? ponerResidente(menu.valor, i) : ponerTarea(menu.valor, i); setMenu(null) }} />}
      {copiarDe && <DialogoCopiar fecha={fecha} anterior={datos.anterior} hayRol={cols.length > 0} onCerrar={() => setCopiarDe(false)} onCopiar={copiar} />}
      {agregar && <DialogoPersona personal={personal.filter(p => !usados.has(p.id))} onCerrar={() => setAgregar(false)} onAgregar={agregarCol} />}
    </div>
  )
}

function Columna({ c, i, total, nombre, puesto, horarios, tareasBase, porResidente, hechas, zona, arrastrar, abrirMenu, editarCol, quitarCol, moverCol,
  ponerResidente, ponerTarea, agregarTareas, resaltar, faltanRes, asignados, nombreDe }) {
  const [texto, setTexto] = useState('')
  const [elegirRes, setElegirRes] = useState(false)
  const [otroHorario, setOtroHorario] = useState(false)
  const hechasCol = c.tareas.filter(t => hechas[t.uid]).length

  function enviarTexto() { if (texto.trim()) { agregarTareas(i, texto); setTexto('') } }

  return (
    <div className="rd-col" {...zona}>
      <div className="rd-col-head">
        <div className="rd-col-nombre"><strong>{nombre}</strong><span>{puesto}</span></div>
        <div className="rd-col-btns">
          <button className="rl-icon-btn" onClick={() => moverCol(i, -1)} disabled={i === 0} aria-label="Mover a la izquierda"><ChevronLeft /></button>
          <button className="rl-icon-btn" onClick={() => moverCol(i, 1)} disabled={i === total - 1} aria-label="Mover a la derecha"><ChevronRight /></button>
          <button className="rl-icon-btn" onClick={() => quitarCol(i)} aria-label={`Quitar a ${nombre} del rol`} title="Quitar del rol de este día"><X /></button>
        </div>
      </div>

      <div className="rd-horarios">
        {horarios.map(h => (
          <button key={h} className={`rd-hora${c.horario === h ? ' activo' : ''}`} onClick={() => editarCol(i, { horario: c.horario === h ? '' : h })}>{h}</button>
        ))}
        {c.horario && !horarios.includes(c.horario) && <button className="rd-hora activo" onClick={() => editarCol(i, { horario: '' })}>{c.horario}</button>}
        {otroHorario
          ? <input className="md-input rd-hora-input" autoFocus placeholder="Ej. 9 - 5" maxLength={30}
              onKeyDown={e => { if (e.key === 'Enter') { editarCol(i, { horario: e.target.value.trim() }); setOtroHorario(false) } if (e.key === 'Escape') setOtroHorario(false) }}
              onBlur={e => { if (e.target.value.trim()) editarCol(i, { horario: e.target.value.trim() }); setOtroHorario(false) }} />
          : <button className="rd-hora otro" onClick={() => setOtroHorario(true)}>Otro</button>}
      </div>

      <div className="rd-sec">
        <span className="rd-sec-tit">Residentes <em>{c.residentes.length}</em></span>
        <div className="rd-chips">
          {c.residentes.map(r => {
            const x = porResidente[r.id]
            if (!x) return null
            return (
              <span key={r.id} className={`rd-chip res puesto${r.resaltado ? ' resaltado' : ''}`} draggable onDragStart={e => arrastrar(e, { tipo: 'res', id: r.id })}>
                <button className="rd-chip-txt" onClick={e => abrirMenu(e, 'res', r.id)} title={x.nombre}>{x.corto}{x.toca_bano && <Bath className="rd-bano" aria-label="le toca baño" />}</button>
                <button className="rd-chip-x" onClick={() => resaltar(i, 'res', r.id)} aria-label={r.resaltado ? 'Quitar resaltado' : 'Resaltar'} title={r.resaltado ? 'Quitar resaltado' : 'Resaltar'}><Highlighter /></button>
                <button className="rd-chip-x" onClick={() => ponerResidente(r.id, null)} aria-label={`Quitar a ${x.corto}`}><X /></button>
              </span>
            )
          })}
          <button className="rd-chip agregar" onClick={() => setElegirRes(v => !v)}><Plus /> Residente</button>
        </div>
        {elegirRes && <ElegirResidente faltan={faltanRes} todos={Object.values(porResidente)} asignados={asignados} nombreDe={nombreDe} propio={i}
          onElegir={(id) => ponerResidente(id, i)} onCerrar={() => setElegirRes(false)} />}
      </div>

      <div className="rd-sec rd-sec-tareas">
        <span className="rd-sec-tit">Tareas <em>{c.tareas.length}{hechasCol ? ` · ${hechasCol} hechas` : ''}</em></span>
        <ul className="rd-tareas">
          {c.tareas.map(t => (
            <li key={t.uid} className={`${t.resaltada ? 'resaltada' : ''}${hechas[t.uid] ? ' hecha' : ''}`} draggable onDragStart={e => arrastrar(e, { tipo: 'tarea', ...t })}>
              <span className="rd-t-check" title={hechas[t.uid] ? `Hecha · ${hechas[t.uid].hecha_en}` : 'Pendiente'}>{hechas[t.uid] && <Check />}</span>
              <button className="rd-t-txt" onClick={e => abrirMenu(e, 'tarea', t)} title="Pasar a otra persona">{t.titulo}</button>
              <button className="rd-chip-x" onClick={() => resaltar(i, 'tarea', t.uid)} aria-label={t.resaltada ? 'Quitar resaltado' : 'Resaltar'} title={t.resaltada ? 'Quitar resaltado' : 'Resaltar'}><Highlighter /></button>
              <button className="rd-chip-x" onClick={() => ponerTarea(t, null)} aria-label={`Quitar ${t.titulo}`}><X /></button>
            </li>
          ))}
        </ul>
        <div className="rd-nueva">
          <textarea className="md-input" rows={1} value={texto} placeholder="Escribe una tarea y Enter" title="También puedes pegar varias, una por renglón"
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto() } }}
            onPaste={e => { const t = e.clipboardData.getData('text'); if (t.includes('\n')) { e.preventDefault(); agregarTareas(i, t) } }} />
          {texto.trim().length >= 2 && (
            <SugerenciasTarea texto={texto} base={tareasBase} usadas={c.tareas} onElegir={(t) => { agregarTareas(i, t); setTexto('') }} />
          )}
        </div>
      </div>
    </div>
  )
}

/** Mientras escribe, sugiere tareas de la lista de siempre. */
function SugerenciasTarea({ texto, base, usadas, onElegir }) {
  const n = norm(texto)
  const ya = new Set(usadas.map(t => norm(t.titulo)))
  const lista = base.filter(t => norm(t).includes(n) && !ya.has(norm(t)) && norm(t) !== n).slice(0, 5)
  if (!lista.length) return null
  return <div className="rd-sugeridas">{lista.map(t => <button key={t} onMouseDown={e => { e.preventDefault(); onElegir(t) }}>{t}</button>)}</div>
}

function ElegirResidente({ faltan, todos, asignados, nombreDe, propio, onElegir, onCerrar }) {
  const [q, setQ] = useState('')
  const n = norm(q)
  const coincide = (r) => !n || norm(r.nombre).includes(n)
  const otros = todos.filter(r => r.id in asignados && asignados[r.id] !== propio && coincide(r))
  const libres = faltan.filter(coincide)
  return (
    <div className="rd-elegir">
      <div className="ac-buscar"><Search /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar residente" onKeyDown={e => e.key === 'Escape' && onCerrar()} /></div>
      <div className="rd-elegir-lista">
        {libres.map(r => <button key={r.id} onClick={() => onElegir(r.id)}>{r.corto}{r.toca_bano && <Bath className="rd-bano" />}<em>Sin asignar</em></button>)}
        {otros.map(r => <button key={r.id} onClick={() => onElegir(r.id)}>{r.corto}<em>Con {nombreDe(asignados[r.id])} · se pasa aquí</em></button>)}
        {!libres.length && !otros.length && <p className="ac-vacio">Nadie coincide.</p>}
      </div>
      <button className="rl-link" onClick={onCerrar}>Listo</button>
    </div>
  )
}

function MenuAsignar({ menu, cols, nombreCol, onElegir, onCerrar }) {
  const ref = useRef(null)
  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) onCerrar() }
    const esc = (e) => e.key === 'Escape' && onCerrar()
    setTimeout(() => document.addEventListener('mousedown', fuera), 0)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [onCerrar])
  const actual = cols.findIndex(c => (menu.tipo === 'res' ? c.residentes.some(r => r.id === menu.valor) : c.tareas.some(t => t.uid && t.uid === menu.valor.uid)))
  return (
    <div className="rd-menu" ref={ref} style={{ left: Math.max(8, menu.x), top: menu.y }} role="menu">
      <span className="rd-menu-tit">{actual >= 0 ? 'Pasar a…' : 'Asignar a…'}</span>
      {cols.map((c, i) => (
        <button key={i} role="menuitem" disabled={i === actual} onClick={() => onElegir(i)}>
          {nombreCol(c)}{c.horario && <em>{c.horario}</em>}{i === actual && <em>(aquí está)</em>}
        </button>
      ))}
      {actual >= 0 && <button role="menuitem" className="quitar" onClick={() => onElegir(null)}><X /> Quitar</button>}
    </div>
  )
}

function DialogoCopiar({ fecha, anterior, hayRol, onCerrar, onCopiar }) {
  const [de, setDe] = useState(anterior || moverFecha(fecha, -1))
  const opciones = [...new Set([anterior, moverFecha(fecha, -1), moverFecha(fecha, -7)].filter(Boolean))]
  return (
    <Dialogo titulo="Copiar el rol de otro día" sub={`Para el ${fechaLarga(fecha)}`} onCerrar={onCerrar}
      pie={<><button className="rl-btn" onClick={onCerrar}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={() => onCopiar(de)} disabled={!de || de === fecha}><Copy /> Copiar</button></>}>
      <div className="rd-copiar-ops">
        {opciones.map(f => (
          <button key={f} className={`rd-hora${de === f ? ' activo' : ''}`} onClick={() => setDe(f)}>
            {f === moverFecha(fecha, -1) ? 'Ayer' : f === moverFecha(fecha, -7) ? 'Hace una semana' : 'El último'} · {fechaCorta(f)}
          </button>
        ))}
      </div>
      <label className="md-campo"><span>U otro día</span><input type="date" className="md-input" value={de} onChange={e => setDe(e.target.value)} /></label>
      <p className="ac-sutil">Se copian las personas, sus horarios, residentes y tareas.{hayRol ? ' Lo que ya pusiste en este día se reemplaza.' : ''}</p>
    </Dialogo>
  )
}

/** Tareas y horarios de siempre del Rol del día (se editan en Configuración → Actividades). */
export function ListaBase() {
  const [tareas, setTareas] = useState(null)
  const [horarios, setHorarios] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { pedir(API).then(d => { setTareas(d.base.tareas.join('\n')); setHorarios(d.base.horarios.join('\n')) }).catch(e => setError(e.message)) }, [])
  async function guardar() {
    setGuardando(true); setError(''); setOk(false)
    try {
      const b = await enviar(`${API}/base/lista`, 'PUT', { tareas: tareas.split('\n'), horarios: horarios.split('\n') })
      setTareas(b.tareas.join('\n')); setHorarios(b.horarios.join('\n')); setOk(true)
    } catch (e) { setError(e.message) } finally { setGuardando(false) }
  }
  if (tareas === null) return error ? <div className="rl-error">{error}</div> : <div className="ac-cargando"><Loader2 className="cd-spin" /> Cargando…</div>
  return (
    <section className="ac-panel cf-lista-base">
      <p className="ac-ayuda">De aquí salen las tareas que faltan por asignar en el <b>Rol del día</b> y las sugerencias al escribir.</p>
      <div className="cf-dos">
        <label className="md-campo"><span>Tareas de siempre (una por renglón)</span>
          <textarea className="md-input ac-textarea" rows={12} value={tareas} onChange={e => { setOk(false); setTareas(e.target.value) }} /></label>
        <label className="md-campo"><span>Horarios (uno por renglón)</span>
          <textarea className="md-input ac-textarea" rows={12} value={horarios} onChange={e => { setOk(false); setHorarios(e.target.value) }} /></label>
      </div>
      <div className="pe-turnos-pie">
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 className="cd-spin" /> : <Check />} Guardar</button>
        {ok && <span className="rd-estado ok"><Check /> Guardado</span>}
      </div>
      {error && <div className="rl-error">{error}</div>}
    </section>
  )
}

function DialogoPersona({ personal, onCerrar, onAgregar }) {
  const [otro, setOtro] = useState('')
  const [q, setQ] = useState('')
  const lista = personal.filter(p => !q || norm(p.nombre).includes(norm(q)))
  return (
    <Dialogo titulo="Agregar persona al rol" sub="Quien trabaja este día" onCerrar={onCerrar}
      pie={<button className="rl-btn" onClick={onCerrar}>Cerrar</button>}>
      {personal.length > 6 && <div className="ac-buscar rd-buscar-dlg"><Search /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar" /></div>}
      <div className="rd-elegir-lista grande">
        {lista.map(p => <button key={p.id} onClick={() => onAgregar({ usuario_id: p.id })}>{p.nombre}<em>{p.rol_label}</em></button>)}
        {!personal.length && <p className="ac-vacio">Todo el personal con cuenta ya está en el rol.</p>}
      </div>
      <label className="md-campo"><span>¿No tiene cuenta en el sistema? Escribe su nombre</span>
        <div className="rd-otro">
          <input className="md-input" value={otro} maxLength={60} onChange={e => setOtro(e.target.value)} placeholder="Nombre"
            onKeyDown={e => e.key === 'Enter' && otro.trim() && onAgregar({ usuario_id: null, nombre: otro.trim() })} />
          <button className="rl-btn" disabled={!otro.trim()} onClick={() => onAgregar({ usuario_id: null, nombre: otro.trim() })}><Plus /> Agregar</button>
        </div>
      </label>
      <p className="ac-sutil">Quien no tiene cuenta sale en el rol y en el mensaje de WhatsApp, pero no puede marcar sus tareas.</p>
    </Dialogo>
  )
}
