import { useEffect, useMemo, useRef, useState } from 'react'
import { pedir, enviar } from './medicacionUtil'
import { Search, Plus, Pencil, X, Loader2, AlertTriangle, Check, ShieldAlert, Pill, Archive, ArchiveRestore } from 'lucide-react'

// Catálogo único de medicamentos: el medicamento es también el producto del inventario.

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function Dialogo({ titulo, sub, onCerrar, children, pie, ancho }) {
  const ref = useRef(null)
  useEffect(() => {
    // Esc cierra solo el diálogo de hasta arriba
    const k = (e) => {
      if (e.key !== 'Escape') return
      const todos = document.querySelectorAll('.md-overlay')
      if (todos[todos.length - 1] === ref.current) onCerrar()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCerrar])
  return (
    <div className="md-overlay" ref={ref} onMouseDown={e => e.target === e.currentTarget && onCerrar()}>
      <div className={`md-dialogo${ancho ? ' md-dialogo-lg' : ''}`} role="dialog" aria-label={titulo}>
        <div className="md-dialogo-head">
          <div><h2>{titulo}</h2>{sub && <span className="md-nota">{sub}</span>}</div>
          <button className="rm-close" onClick={onCerrar} aria-label="Cerrar (Esc)"><X size={18} strokeWidth={1.75} /></button>
        </div>
        <div className="md-dialogo-body">{children}</div>
        {pie && <div className="md-dialogo-pie">{pie}</div>}
      </div>
    </div>
  )
}

/** Alta o edición de un medicamento del catálogo, con aviso de posibles duplicados */
export function MedicamentoForm({ opciones, inicial, onGuardado, onCerrar, onUsarExistente }) {
  const editando = !!inicial?.id
  const [f, setF] = useState(() => ({
    principio_activo: '', nombre_comercial: '', concentracion: '', forma: 'tableta', unidad_dosis: '', unidad_stock: '',
    factor_conversion: '', permite_fraccion: null, controlado: false, en_pastillero: null, ...inicial,
  }))
  const [similares, setSimilares] = useState([])
  const [confirmarSimilar, setConfirmarSimilar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const forma = opciones.formas.find(x => x.id === f.forma) || opciones.formas[0]
  const ud = f.unidad_dosis || forma.unidad_dosis
  const us = f.unidad_stock || forma.unidad_stock
  const fraccion = f.permite_fraccion ?? forma.fraccion
  const pastillero = f.en_pastillero ?? forma.pastillero
  const set = (k) => (e) => { const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e; setF(x => ({ ...x, [k]: v })); setConfirmarSimilar(false) }

  function cambiarForma(id) {
    // al cambiar la forma se proponen sus unidades
    setF(x => ({ ...x, forma: id, unidad_dosis: '', unidad_stock: '', factor_conversion: '', permite_fraccion: null, en_pastillero: null }))
  }

  // Sugerencias de duplicados mientras se escribe
  useEffect(() => {
    if (normalizar(f.principio_activo).length < 3) { setSimilares([]); return }
    const t = setTimeout(() => {
      enviar('catalogo/similares', 'POST', { principio_activo: f.principio_activo, id: inicial?.id }).then(setSimilares).catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [f.principio_activo, inicial?.id])

  async function guardar() {
    setGuardando(true); setError('')
    try {
      const cuerpo = {
        ...f, unidad_dosis: ud, unidad_stock: us, factor_conversion: us === ud ? 1 : (f.factor_conversion || forma.factor),
        permite_fraccion: fraccion, en_pastillero: pastillero, confirmar_similar: confirmarSimilar || undefined,
      }
      if (similares.length && !confirmarSimilar) { setConfirmarSimilar(true); setGuardando(false); return }
      const m = await enviar(editando ? `catalogo/${inicial.id}` : 'catalogo', editando ? 'PUT' : 'POST', cuerpo)
      onGuardado(m)
    } catch (e) {
      if (e.data?.similares) { setSimilares(e.data.similares); setConfirmarSimilar(true) }
      setError(e.message)
    } finally { setGuardando(false) }
  }

  const factorLabel = `¿Cuántas ${opciones.unidades[ud]?.[1] || ud} trae ${['tableta', 'capsula'].includes(us) ? 'cada' : 'un/a'} ${opciones.unidades[us]?.[0] || us}?`

  return (
    <Dialogo titulo={editando ? 'Editar medicamento' : 'Nuevo medicamento en el catálogo'} onCerrar={onCerrar} ancho
      pie={<>
        <button className="rl-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button className="rl-btn rl-btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 className="md-spin" size={16} /> : <Check size={16} />}
          {confirmarSimilar ? ' Es distinto, guardarlo' : ' Guardar'}
        </button>
      </>}>
      <div className="md-grid">
        <label className="md-full">Principio activo
          <input className="md-input" value={f.principio_activo} onChange={set('principio_activo')} placeholder="Ej. Levotiroxina sódica" autoFocus />
        </label>
        {similares.length > 0 && (
          <div className={`md-full mc-similares${confirmarSimilar ? ' fuerte' : ''}`} role="status">
            <p><AlertTriangle size={16} /> {confirmarSimilar ? 'Revisa: ¿no es alguno de estos?' : 'Ya hay medicamentos parecidos:'}</p>
            <ul>
              {similares.map(s => (
                <li key={s.id}>
                  <span><b>{s.nombre}</b> · {opciones.formas.find(x => x.id === s.forma)?.label}{s.nombre_comercial ? ` · ${s.nombre_comercial}` : ''} <em>({s.razon})</em></span>
                  {onUsarExistente && <button className="rl-link" onClick={() => onUsarExistente(s)}>Usar este</button>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <label>Concentración <em>(opcional)</em>
          <input className="md-input" value={f.concentracion} onChange={set('concentracion')} placeholder="Ej. 100 mcg, 2 mg/ml" />
        </label>
        <label>Nombre comercial <em>(opcional)</em>
          <input className="md-input" value={f.nombre_comercial} onChange={set('nombre_comercial')} placeholder="Ej. Eutirox" />
        </label>
        <div className="md-full md-campo">
          <span className="md-campo-titulo">Forma</span>
          <div className="mc-formas">
            {opciones.formas.map(x => (
              <button key={x.id} type="button" className={f.forma === x.id ? 'on' : ''} onClick={() => cambiarForma(x.id)} aria-pressed={f.forma === x.id}>{x.label}</button>
            ))}
          </div>
        </div>
        <label>Cada dosis se cuenta en
          <select className="md-input" value={ud} onChange={set('unidad_dosis')}>
            {opciones.unidades_dosis.map(u => <option key={u} value={u}>{opciones.unidades[u]?.[1] || u}</option>)}
          </select>
        </label>
        <label>Llega en
          <select className="md-input" value={us} onChange={set('unidad_stock')}>
            {opciones.unidades_stock.map(u => <option key={u} value={u}>{opciones.unidades[u]?.[1] || u}</option>)}
          </select>
        </label>
        {us !== ud && (
          <label className="md-full">{factorLabel}
            <input className="md-input md-input-num" inputMode="decimal" value={f.factor_conversion === '' ? forma.factor : f.factor_conversion}
              onChange={e => set('factor_conversion')(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
            <small className="md-nota">Así el inventario se muestra como “2 {opciones.unidades[us]?.[1]} y 150 {opciones.unidades[ud]?.[1]}”.</small>
          </label>
        )}
        <div className="md-full mc-checks">
          <label className="md-check"><input type="checkbox" checked={!!fraccion} onChange={e => setF(x => ({ ...x, permite_fraccion: e.target.checked }))} /> Se puede partir (½, ¼)</label>
          <label className="md-check"><input type="checkbox" checked={!!pastillero} onChange={e => setF(x => ({ ...x, en_pastillero: e.target.checked }))} /> Va en el pastillero (se confirma en la ronda)</label>
          <label className="md-check"><input type="checkbox" checked={!!f.controlado} onChange={set('controlado')} /> Controlado (psicotrópico)</label>
        </div>
      </div>
      {error && <div className="rl-error" role="alert">{error}</div>}
    </Dialogo>
  )
}

/** Buscador del catálogo para el formulario de prescripción */
export function BuscadorMedicamento({ opciones, valor, onElegir, puedeCrear, autoFocus }) {
  const [catalogo, setCatalogo] = useState(null)
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const [crear, setCrear] = useState(null)
  const caja = useRef(null)

  useEffect(() => { pedir('catalogo').then(setCatalogo).catch(() => setCatalogo([])) }, [])
  useEffect(() => {
    const fuera = (e) => !caja.current?.contains(e.target) && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  const resultados = useMemo(() => {
    const n = normalizar(q)
    if (!catalogo) return []
    const lista = n ? catalogo.filter(c => normalizar(`${c.principio_activo} ${c.nombre_comercial} ${c.concentracion}`).includes(n)) : catalogo
    return lista.slice(0, 8)
  }, [catalogo, q])
  const opcionesLista = [...resultados.map(r => ({ tipo: 'med', r })), ...(puedeCrear && q.trim().length >= 2 ? [{ tipo: 'crear' }] : [])]

  function elegir(m) { onElegir(m); setQ(''); setAbierto(false) }
  function teclas(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo(a => Math.min(a + 1, opcionesLista.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && abierto && opcionesLista[activo]) {
      e.preventDefault()
      const o = opcionesLista[activo]
      if (o.tipo === 'med') elegir(o.r); else setCrear({ principio_activo: q.trim() })
    } else if (e.key === 'Escape') setAbierto(false)
  }

  if (valor) {
    return (
      <div className="mc-elegido">
        <Pill size={18} />
        <div>
          <b>{valor.nombre}</b>
          <span>{opciones.formas.find(x => x.id === valor.forma)?.label}{valor.nombre_comercial ? ` · ${valor.nombre_comercial}` : ''}
            {valor.controlado ? <em className="mc-tag-ctl"><ShieldAlert size={13} /> Controlado</em> : null}</span>
        </div>
        <button type="button" className="rl-link" onClick={() => onElegir(null)}>Cambiar</button>
      </div>
    )
  }

  return (
    <div className="mc-buscador" ref={caja}>
      <div className="rl-search">
        <Search />
        <input value={q} autoFocus={autoFocus} placeholder="Escribe el nombre: “levo”, “losartán”, “Eutirox”…"
          onChange={e => { setQ(e.target.value); setAbierto(true); setActivo(0) }} onFocus={() => setAbierto(true)} onKeyDown={teclas}
          role="combobox" aria-expanded={abierto} aria-controls="mc-lista" aria-label="Buscar medicamento" />
      </div>
      {abierto && (
        <ul className="mc-lista" id="mc-lista" role="listbox">
          {catalogo == null && <li className="mc-vacio"><Loader2 className="md-spin" size={16} /> Cargando catálogo…</li>}
          {catalogo && !opcionesLista.length && <li className="mc-vacio">{q ? 'No está en el catálogo.' : 'El catálogo está vacío.'}{!puedeCrear && ' Pide a la encargada que lo agregue.'}</li>}
          {opcionesLista.map((o, i) => o.tipo === 'med' ? (
            <li key={o.r.id} role="option" aria-selected={i === activo} className={i === activo ? 'activo' : ''}
              onMouseEnter={() => setActivo(i)} onMouseDown={e => { e.preventDefault(); elegir(o.r) }}>
              <b>{o.r.nombre}</b>
              <span>{opciones.formas.find(x => x.id === o.r.forma)?.label}{o.r.nombre_comercial ? ` · ${o.r.nombre_comercial}` : ''}</span>
            </li>
          ) : (
            <li key="crear" role="option" aria-selected={i === activo} className={`mc-crear${i === activo ? ' activo' : ''}`}
              onMouseEnter={() => setActivo(i)} onMouseDown={e => { e.preventDefault(); setCrear({ principio_activo: q.trim() }) }}>
              <Plus size={16} /> Agregar “{q.trim()}” al catálogo
            </li>
          ))}
        </ul>
      )}
      {crear && (
        <MedicamentoForm opciones={opciones} inicial={crear} onCerrar={() => setCrear(null)}
          onUsarExistente={(m) => { setCrear(null); elegir(m) }}
          onGuardado={(m) => { setCatalogo(c => [...(c || []), m]); setCrear(null); elegir(m) }} />
      )}
    </div>
  )
}

/** Pestaña Catálogo */
export default function Catalogo({ opciones }) {
  const puedeEditar = opciones.puede_prescribir
  const [lista, setLista] = useState(null)
  const [q, setQ] = useState('')
  const [verBajas, setVerBajas] = useState(false)
  const [editar, setEditar] = useState(null)
  const [error, setError] = useState('')

  const cargar = () => pedir('catalogo?todos=1').then(setLista).catch(e => setError(e.message))
  useEffect(() => { cargar() }, [])

  const visibles = useMemo(() => {
    const n = normalizar(q)
    return (lista || []).filter(c => (verBajas || c.activo) && (!n || normalizar(`${c.principio_activo} ${c.nombre_comercial} ${c.concentracion}`).includes(n)))
  }, [lista, q, verBajas])

  async function alternar(c) {
    setError('')
    try { const m = await enviar(`catalogo/${c.id}/activo`, 'PATCH', { activo: !c.activo }); setLista(l => l.map(x => (x.id === m.id ? { ...x, ...m } : x))) }
    catch (e) { setError(e.message) }
  }

  const forma = (id) => opciones.formas.find(x => x.id === id)?.label || id
  const u = (id, n = 2) => opciones.unidades[id]?.[n === 1 ? 0 : 1] || id

  return (
    <div className="rl-panel">
      <div className="rl-toolbar">
        <div className="rl-search" style={{ marginLeft: 0 }}>
          <Search />
          <input type="search" placeholder="Buscar en el catálogo…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar" />
        </div>
        <label className="md-check"><input type="checkbox" checked={verBajas} onChange={e => setVerBajas(e.target.checked)} /> Ver dados de baja</label>
        {puedeEditar && <button className="rl-btn rl-btn-primary md-ml-auto" onClick={() => setEditar({})}><Plus size={16} /> Nuevo medicamento</button>}
      </div>
      {error && <div className="rl-error" role="alert">{error}</div>}
      {lista == null ? <div className="md-skel" /> : !visibles.length ? (
        <div className="rl-vacio"><span className="rl-vacio-icon"><Pill /></span><p>{q ? 'Nada coincide con la búsqueda.' : 'Todavía no hay medicamentos en el catálogo.'}</p></div>
      ) : (
        <div className="md-scroll">
          <table className="md-tabla">
            <thead><tr><th>Medicamento</th><th>Forma</th><th>Inventario</th><th>En uso</th>{puedeEditar && <th />}</tr></thead>
            <tbody>
              {visibles.map(c => (
                <tr key={c.id} className={c.activo ? '' : 'mc-baja'}>
                  <td>
                    <b>{c.nombre}</b>
                    <small>{[c.nombre_comercial, c.controlado && 'Controlado', !c.en_pastillero && 'Fuera de pastillero', c.permite_fraccion && 'Se parte', !c.activo && 'Dado de baja'].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td>{forma(c.forma)}</td>
                  <td>{c.unidad_stock === c.unidad_dosis ? `Por ${u(c.unidad_dosis, 1)}` : `${u(c.unidad_stock, 1)} de ${c.factor_conversion} ${u(c.unidad_dosis)}`}</td>
                  <td>{c.en_uso ? `${c.en_uso} ${c.en_uso === 1 ? 'residente' : 'residentes'}` : <span className="md-nota">—</span>}</td>
                  {puedeEditar && (
                    <td className="md-acc">
                      <button className="md-icono" onClick={() => setEditar(c)} aria-label={`Editar ${c.nombre}`} title="Editar"><Pencil /></button>
                      <button className="md-icono" onClick={() => alternar(c)} aria-label={c.activo ? 'Dar de baja' : 'Reactivar'} title={c.activo ? 'Dar de baja' : 'Reactivar'}>
                        {c.activo ? <Archive /> : <ArchiveRestore />}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editar && (
        <MedicamentoForm opciones={opciones} inicial={editar.id ? editar : null} onCerrar={() => setEditar(null)}
          onGuardado={(m) => { setEditar(null); cargar() }} />
      )}
    </div>
  )
}
