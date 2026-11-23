import { useCallback, useEffect, useState } from 'react'
import { gestionFetch, leerJson } from './GestionApp'
import {
  TOMAS, TOMA_LABEL, UNIDADES, TIPO_MOV, nivelDias, textoDias, fechaAgota, dosisTexto, num,
} from './medicacionUtil'
import { Plus, Pencil, PackagePlus, ClipboardCheck, History, Pause, Play, Trash2, X, Loader2, Pill, HandHeart } from 'lucide-react'
import './medicacion.css'

const API = '/api/gestion/medicacion'

async function pedir(url, opciones) {
  const res = await gestionFetch(url, opciones)
  const data = await leerJson(res)
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error.')
  return data
}

/** Etiqueta de días restantes con color según urgencia */
export function DiasBadge({ m }) {
  return (
    <span className={`md-dias md-dias-${m.prn ? 'na' : nivelDias(m.dias_restantes)}`} title={fechaAgota(m) ? `Se acaba aprox. el ${fechaAgota(m)}` : undefined}>
      {textoDias(m)}
    </span>
  )
}

// ── Formulario de medicamento ────────────────────────────────────────────────
const VACIO = { nombre: '', unidad: 'tableta', dosis: '1', tomas: [], prn: false, indicaciones: '', medico: '', fecha_inicio: '', fecha_fin: '', existencia: '' }

export function MedicamentoForm({ residente, medicamento, onClose, onSaved }) {
  const nuevo = !medicamento
  const [f, setF] = useState(() => nuevo ? { ...VACIO } : {
    ...VACIO, ...medicamento, dosis: String(medicamento.dosis), prn: !!medicamento.prn,
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const alternarToma = (id) => setF(x => ({ ...x, tomas: x.tomas.includes(id) ? x.tomas.filter(t => t !== id) : [...x.tomas, id] }))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const consumo = f.prn ? 0 : (Number(String(f.dosis).replace(',', '.')) || 0) * f.tomas.length

  async function guardar(e) {
    e.preventDefault()
    setError(''); setGuardando(true)
    try {
      const body = JSON.stringify({ ...f, residente_id: residente.id })
      const data = await pedir(nuevo ? `${API}/medicamentos` : `${API}/medicamentos/${medicamento.id}`, { method: nuevo ? 'POST' : 'PUT', body })
      onSaved(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="md-overlay" onClick={onClose}>
      <form className="md-dialogo md-dialogo-lg" onClick={e => e.stopPropagation()} onSubmit={guardar}>
        <div className="md-dialogo-head">
          <div>
            <span className="gl-eyebrow">{residente.nombre}</span>
            <h2>{nuevo ? 'Agregar medicamento' : 'Editar medicamento'}</h2>
          </div>
          <button type="button" className="rm-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="md-dialogo-body">
          {error && <div className="rl-error" role="alert">{error}</div>}
          <div className="md-grid">
            <label className="md-full">Medicamento y concentración *
              <input className="md-input" value={f.nombre} onChange={set('nombre')} placeholder="Ej. Losartán 50 mg" required autoFocus />
            </label>
            <label>Dosis por toma *
              <input className="md-input" inputMode="decimal" value={f.dosis} onChange={set('dosis')} placeholder="1, 0.5, 2…" required />
            </label>
            <label>Presentación
              <select className="md-input" value={f.unidad} onChange={set('unidad')}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>

          <div className="md-campo">
            <span className="md-campo-titulo">¿En qué tomas?</span>
            <label className="md-check">
              <input type="checkbox" checked={f.prn} onChange={e => setF(x => ({ ...x, prn: e.target.checked }))} />
              Solo si hace falta (sin horario fijo)
            </label>
            {!f.prn && (
              <div className="md-tomas-sel">
                {TOMAS.map(t => (
                  <button type="button" key={t.id} className={f.tomas.includes(t.id) ? 'on' : ''} onClick={() => alternarToma(t.id)} aria-pressed={f.tomas.includes(t.id)}>
                    {t.label}<span>{t.hora}</span>
                  </button>
                ))}
              </div>
            )}
            {!f.prn && consumo > 0 && (
              <p className="md-nota">Consumo: {num(consumo)} {f.unidad} al día.</p>
            )}
          </div>

          <div className="md-grid">
            {nuevo && (
              <label>Existencia actual
                <input className="md-input" inputMode="decimal" value={f.existencia} onChange={set('existencia')} placeholder={`Cuántas ${f.unidad} hay`} />
              </label>
            )}
            <label>Médico que lo indica
              <input className="md-input" value={f.medico} onChange={set('medico')} />
            </label>
            <label>Desde
              <input className="md-input" type="date" value={f.fecha_inicio} onChange={set('fecha_inicio')} />
            </label>
            <label>Hasta <em>(si es por tiempo limitado)</em>
              <input className="md-input" type="date" value={f.fecha_fin} onChange={set('fecha_fin')} />
            </label>
            <label className="md-full">Indicaciones
              <input className="md-input" value={f.indicaciones} onChange={set('indicaciones')} placeholder="Ej. Con alimentos, triturada, tomar presión antes" />
            </label>
          </div>
        </div>

        <div className="md-dialogo-pie">
          <button type="button" className="rl-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rl-btn rl-btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}

// ── Entrada / conteo / dosis PRN ─────────────────────────────────────────────
const TEXTOS_MOV = {
  entrada: { titulo: 'Llegó medicamento', campo: '¿Cuántas llegaron?', boton: 'Sumar al inventario', nota: 'Ej. Lo trajo la familia, compra farmacia' },
  ajuste:  { titulo: 'Contar existencia', campo: '¿Cuántas hay en realidad?', boton: 'Guardar conteo', nota: 'Ej. Conteo semanal' },
  prn:     { titulo: 'Dar dosis', campo: 'Cantidad que se dio', boton: 'Registrar y descontar', nota: 'Motivo (obligatorio). Ej. Dolor de cabeza' },
}

export function MovimientoDialogo({ medicamento: m, tipo, onClose, onSaved }) {
  const t = TEXTOS_MOV[tipo]
  const [cantidad, setCantidad] = useState(tipo === 'prn' ? String(m.dosis) : '')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const n = Number(String(cantidad).replace(',', '.'))
  const resultado = !Number.isFinite(n) || cantidad === '' ? null
    : tipo === 'entrada' ? m.existencia + n : tipo === 'prn' ? m.existencia - n : n

  async function guardar(e) {
    e.preventDefault()
    setError(''); setGuardando(true)
    try {
      onSaved(await pedir(`${API}/medicamentos/${m.id}/movimiento`, { method: 'POST', body: JSON.stringify({ tipo, cantidad, nota }) }))
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="md-overlay" onClick={onClose}>
      <form className="md-dialogo" onClick={e => e.stopPropagation()} onSubmit={guardar}>
        <div className="md-dialogo-head">
          <div>
            <span className="gl-eyebrow">{m.residente_nombre} · {m.nombre}</span>
            <h2>{t.titulo}</h2>
          </div>
          <button type="button" className="rm-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="md-dialogo-body">
          {error && <div className="rl-error" role="alert">{error}</div>}
          <p className="md-nota">Hay <b>{num(m.existencia)} {m.unidad}</b> registradas.</p>
          <label className="md-label">{t.campo}
            <input className="md-input md-input-num" inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} autoFocus required />
          </label>
          <label className="md-label">Nota
            <input className="md-input" value={nota} onChange={e => setNota(e.target.value)} placeholder={t.nota} required={tipo === 'prn'} />
          </label>
          {resultado != null && <p className="md-nota">Quedarán <b>{num(resultado)} {m.unidad}</b>.</p>}
        </div>
        <div className="md-dialogo-pie">
          <button type="button" className="rl-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rl-btn rl-btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : t.boton}</button>
        </div>
      </form>
    </div>
  )
}

// ── Historial de movimientos de un medicamento ───────────────────────────────
export function HistorialDialogo({ medicamento: m, onClose }) {
  const [movs, setMovs] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    pedir(`${API}/medicamentos/${m.id}/movimientos`).then(setMovs).catch(e => setError(e.message))
  }, [m.id])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="md-overlay" onClick={onClose}>
      <div className="md-dialogo md-dialogo-lg" onClick={e => e.stopPropagation()}>
        <div className="md-dialogo-head">
          <div>
            <span className="gl-eyebrow">{m.residente_nombre}</span>
            <h2>{m.nombre} · movimientos</h2>
          </div>
          <button type="button" className="rm-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="md-dialogo-body">
          {error && <div className="rl-error">{error}</div>}
          {!movs && !error && <p className="md-nota"><Loader2 className="md-spin" size={16} /> Cargando…</p>}
          {movs && !movs.length && <p className="md-nota">Todavía no hay movimientos.</p>}
          {movs && movs.length > 0 && (
            <table className="md-tabla md-tabla-mov">
              <thead><tr><th>Fecha</th><th>Movimiento</th><th className="md-r">Cantidad</th><th className="md-r">Quedan</th><th>Quién</th></tr></thead>
              <tbody>
                {movs.map(v => (
                  <tr key={v.id}>
                    <td>{new Date(v.creado_en.replace(' ', 'T') + 'Z').toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      {TIPO_MOV[v.tipo] || v.tipo}{v.ronda_toma ? ` · ${TOMA_LABEL[v.ronda_toma]}` : ''}
                      {v.nota && <small>{v.nota}</small>}
                    </td>
                    <td className={`md-r ${v.cantidad < 0 ? 'md-neg' : 'md-pos'}`}>{v.cantidad > 0 ? '+' : ''}{num(v.cantidad)}</td>
                    <td className="md-r">{num(v.existencia)}</td>
                    <td>{v.usuario_nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Panel de medicación de un residente ──────────────────────────────────────
// Se usa en la pestaña "Por residente" y puede incrustarse en el expediente.
export default function MedicacionResidente({ residente, puedeEditar, onCambio }) {
  const [meds, setMeds] = useState(null)
  const [error, setError] = useState('')
  const [dialogo, setDialogo] = useState(null) // { tipo: 'form'|'entrada'|'ajuste'|'prn'|'historial', med }
  const [verSuspendidos, setVerSuspendidos] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try { setMeds(await pedir(`${API}/medicamentos?residente_id=${residente.id}&todos=1`)) }
    catch (e) { setError(e.message) }
  }, [residente.id])

  useEffect(() => { setMeds(null); cargar() }, [cargar])

  function listo() {
    setDialogo(null)
    cargar()
    onCambio?.()
  }

  async function alternarActivo(m) {
    try {
      await pedir(`${API}/medicamentos/${m.id}/activo`, { method: 'PATCH', body: JSON.stringify({ activo: !m.activo }) })
      listo()
    } catch (e) { setError(e.message) }
  }

  async function borrar(m) {
    if (!window.confirm(`¿Borrar ${m.nombre}? Úsalo solo si se capturó por error.`)) return
    try {
      await pedir(`${API}/medicamentos/${m.id}`, { method: 'DELETE' })
      listo()
    } catch (e) { setError(e.message) }
  }

  const activos = (meds || []).filter(m => m.activo)
  const suspendidos = (meds || []).filter(m => !m.activo)
  const conResidente = (m) => ({ ...m, residente_nombre: residente.nombre })

  function Tarjeta({ m }) {
    return (
      <div className={`md-med${m.activo ? '' : ' md-med-off'}`}>
        <div className="md-med-main">
          <div className="md-med-nombre">
            <b>{m.nombre}</b>
            <span>{dosisTexto(m.dosis, m.unidad)}{m.prn ? ' · solo si hace falta' : ''}</span>
          </div>
          {!m.prn && (
            <div className="md-med-tomas">
              {TOMAS.map(t => <span key={t.id} className={m.tomas.includes(t.id) ? 'on' : ''}>{t.label}</span>)}
            </div>
          )}
          {(m.indicaciones || m.medico || m.fecha_fin) && (
            <p className="md-med-extra">
              {m.indicaciones}
              {m.medico && <span>Indica: {m.medico}</span>}
              {m.fecha_fin && <span>Hasta el {m.fecha_fin.split('-').reverse().join('/')}</span>}
            </p>
          )}
        </div>
        <div className="md-med-stock">
          <strong>{num(m.existencia)}</strong>
          <span>{m.unidad} en existencia</span>
          {m.activo ? <DiasBadge m={m} /> : <span className="md-dias md-dias-na">Suspendido</span>}
        </div>
        <div className="md-med-acc">
          {puedeEditar && m.activo && (
            <>
              {m.prn
                ? <button className="rl-btn" onClick={() => setDialogo({ tipo: 'prn', med: m })}><HandHeart size={16} /> Dar</button>
                : null}
              <button className="rl-btn" onClick={() => setDialogo({ tipo: 'entrada', med: m })}><PackagePlus size={16} /> Llegó</button>
              <button className="rl-btn" onClick={() => setDialogo({ tipo: 'ajuste', med: m })} title="Contar lo que hay y corregir"><ClipboardCheck size={16} /> Contar</button>
            </>
          )}
          <button className="md-icono" onClick={() => setDialogo({ tipo: 'historial', med: m })} title="Movimientos" aria-label="Movimientos"><History size={17} /></button>
          {puedeEditar && (
            <>
              <button className="md-icono" onClick={() => setDialogo({ tipo: 'form', med: m })} title="Editar" aria-label="Editar"><Pencil size={17} /></button>
              <button className="md-icono" onClick={() => alternarActivo(m)} title={m.activo ? 'Suspender' : 'Reactivar'} aria-label={m.activo ? 'Suspender' : 'Reactivar'}>
                {m.activo ? <Pause size={17} /> : <Play size={17} />}
              </button>
              {!m.activo && <button className="md-icono" onClick={() => borrar(m)} title="Borrar (captura por error)" aria-label="Borrar"><Trash2 size={17} /></button>}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="md-residente">
      <div className="md-residente-head">
        <div>
          <h3>Medicación</h3>
          {meds && <span>{activos.length ? `${activos.length} activo${activos.length === 1 ? '' : 's'}` : 'Sin medicamentos'}</span>}
        </div>
        {puedeEditar && (
          <button className="rl-btn rl-btn-primary" onClick={() => setDialogo({ tipo: 'form', med: null })}><Plus size={16} /> Agregar medicamento</button>
        )}
      </div>

      {error && <div className="rl-error" role="alert">{error}</div>}
      {!meds && !error && <div className="md-skel" />}

      {meds && !activos.length && !suspendidos.length && (
        <div className="rl-vacio">
          <div className="rl-vacio-icon"><Pill size={22} /></div>
          <p>{residente.nombre} no tiene medicamentos registrados.</p>
        </div>
      )}

      <div className="md-meds">
        {activos.map(m => <Tarjeta key={m.id} m={m} />)}
      </div>

      {suspendidos.length > 0 && (
        <>
          <button className="rl-link md-ver-susp" onClick={() => setVerSuspendidos(v => !v)}>
            {verSuspendidos ? 'Ocultar' : 'Ver'} suspendidos ({suspendidos.length})
          </button>
          {verSuspendidos && <div className="md-meds">{suspendidos.map(m => <Tarjeta key={m.id} m={m} />)}</div>}
        </>
      )}

      {dialogo?.tipo === 'form' && (
        <MedicamentoForm residente={residente} medicamento={dialogo.med} onClose={() => setDialogo(null)} onSaved={listo} />
      )}
      {['entrada', 'ajuste', 'prn'].includes(dialogo?.tipo) && (
        <MovimientoDialogo medicamento={conResidente(dialogo.med)} tipo={dialogo.tipo} onClose={() => setDialogo(null)} onSaved={listo} />
      )}
      {dialogo?.tipo === 'historial' && (
        <HistorialDialogo medicamento={conResidente(dialogo.med)} onClose={() => setDialogo(null)} />
      )}
    </div>
  )
}
