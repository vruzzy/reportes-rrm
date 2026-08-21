import { useState, useEffect, useCallback } from 'react'
import BottomSheet from './BottomSheet'
import logo from '../assets/logo.jpg'

// ── CHIP OPTIONS ────────────────────────────────────────────────────────────────

const OPT = {
  estadoAlRecibir: [
    'Activo/a con buen semblante', 'Tranquilo/a', 'Somnoliento/a',
    'Dormido/a en su habitación', 'Sentado/a en su silla',
    'En reposo', 'Agitado/a', 'Confuso/a',
    'Con dolor referido', 'Postrado/a',
  ],
  actitudConducta: [
    'Accesible', 'Cooperador/a', 'Tranquilo/a', 'Comunicativo/a',
    'Ansioso/a', 'Agitado/a', 'Hiperactivo/a', 'Poco accesible',
    'Desorientado/a', 'Llanto fácil', 'Renuente', 'Resistente a cuidados',
  ],
  cuidadosRealizados: [
    'Baño completo', 'Baño parcial', 'Cambio de pañal',
    'Aseo bucal', 'Cambio de ropa', 'Movilizaciones posturales',
    'Curaciones', 'Posición antiescara', 'Aplicación de insulina',
    'Nebulización', 'Cambio de parche', 'Sonda vesical atendida',
    'Glicemia capilar',
  ],
  alimentacion: [
    'Completa', 'Completa con asistencia', 'Parcial (>50%)', 'Parcial (<50%)',
    'Rechazó alimentación', 'Por sonda nasogástrica',
    'Líquidos únicamente', 'Ayuno indicado',
  ],
  medicamentos: [
    'Administrados en tiempo y forma', 'Administrados con resistencia',
    'Dosis omitida (indicar motivo)', 'Sin medicación programada',
  ],
  actividadesDia: [
    'Curaciones de escaras', 'Fisioterapia',
    'Clase recreativa', 'Activación física',
    'Eucaristía del día', 'No participó', 'N/A',
  ],
  observacionesEspeciales: [
    'Sin novedades', 'Visita familiar', 'Revisión médica en turno',
    'Análisis de laboratorio', 'Glicemia capilar tomada',
    'Salió de la residencia', 'Salida médica',
    'Caída o incidente', 'Cambio en estado general',
    'Comunicación con familia', 'Traslado hospitalario',
  ],
  sueño: [
    'Durmió bien toda la noche',
    'Sueño intermitente',
    'Se levantó al baño durante la noche',
    'Se intentó levantar, requirió asistencia',
    'No logró conciliar el sueño',
    'Se mantuvo bajo vigilancia',
    'Requirió asistencia para acostarse',
  ],
}

// ── VITAL RANGES (adultos mayores 65+) ─────────────────────────────────────────

const VITAL_RANGES = {
  ta_sistolica:  { min: 90,  max: 160, label: 'T/A Sistólica',     unit: 'mmHg', low: 'Hipotensión', high: 'Hipertensión' },
  ta_diastolica: { min: 60,  max: 100, label: 'T/A Diastólica',    unit: 'mmHg', low: 'Hipotensión', high: 'Hipertensión' },
  fc:            { min: 50,  max: 110, label: 'Frec. cardíaca',     unit: 'lpm',  low: 'Bradicardia', high: 'Taquicardia'  },
  spo2:          { min: 92,  max: 100, label: 'SpO₂',               unit: '%',    low: 'Hipoxemia',   high: null           },
  fr:            { min: 10,  max: 25,  label: 'Frec. respiratoria', unit: 'rpm',  low: 'Bradipnea',   high: 'Taquipnea'    },
  temperatura: {
    label: 'Temperatura', unit: '°C',
    classify: (n) => {
      if (n < 35.0)  return 'Hipotermia'
      if (n < 36.1)  return 'Temperatura baja'
      if (n <= 37.2) return null               // normal
      if (n <= 37.9) return 'Febrícula'
      if (n <= 39.0) return 'Fiebre'
      if (n <= 40.0) return 'Fiebre alta'
      return 'Hiperpirexia'
    },
  },
}

function getVitalAlerts(sv) {
  return Object.entries(VITAL_RANGES).reduce((acc, [key, r]) => {
    const val = sv[key]
    if (val === '' || val === null || val === undefined) return acc
    const num = parseFloat(val)
    if (isNaN(num)) return acc

    if (r.classify) {
      const tag = r.classify(num)
      if (tag) acc.push({ key, label: r.label, value: `${num} ${r.unit}`, tag })
    } else {
      if (num < r.min)
        acc.push({ key, label: r.label, value: `${num} ${r.unit}`, tag: r.low })
      else if (r.max !== null && num > r.max)
        acc.push({ key, label: r.label, value: `${num} ${r.unit}`, tag: r.high })
    }
    return acc
  }, [])
}

// ── HELPER COMPONENTS ───────────────────────────────────────────────────────────

function ChipSingle({ options, selected, onSelect }) {
  return (
    <div className="chip-grid">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          className={`chip${selected === opt ? ' selected' : ''}`}
          onClick={() => onSelect(selected === opt ? '' : opt)}
        >
          {selected === opt && <span className="chip-check">✓</span>}
          {opt}
        </button>
      ))}
    </div>
  )
}

function ChipMulti({ options, selected, onSelect }) {
  function toggle(opt) {
    if (selected.includes(opt)) onSelect(selected.filter(o => o !== opt))
    else onSelect([...selected, opt])
  }
  return (
    <div className="chip-grid">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          className={`chip${selected.includes(opt) ? ' selected' : ''}`}
          onClick={() => toggle(opt)}
        >
          {selected.includes(opt) && <span className="chip-check">✓</span>}
          {opt}
        </button>
      ))}
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div className="form-card">
      <div className="section-label">{title}</div>
      {children}
    </div>
  )
}

function VitalInput({ label, name, value, onChange, placeholder, unit, min, max, hasAlert }) {
  return (
    <div className="vital-group">
      <div className={`vital-label${hasAlert ? ' vital-label-alert' : ''}`}>
        {label}{' '}
        {unit && <span style={{ fontWeight: 400, textTransform: 'none' }}>({unit})</span>}
        {hasAlert && <span className="vital-alert-icon"> ⚠</span>}
      </div>
      <input
        className={`input${hasAlert ? ' input-alert' : ''}`}
        type="number"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        max={max}
        inputMode="numeric"
      />
    </div>
  )
}

function VitalAlertModal({ alerts, onConfirm, onCancel }) {
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-dialog vital-alert-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3>Signos vitales fuera de rango</h3>
        <p>Los siguientes valores están fuera del rango normal para adultos mayores:</p>
        <ul className="vital-alert-list">
          {alerts.map((a, i) => (
            <li key={i}>
              <span className="vital-alert-row">
                <strong>{a.label}:</strong> {a.value}
                <span className="vital-alert-tag">{a.tag}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="vital-alert-question">¿Los valores registrados son correctos?</p>
        <div className="confirm-actions">
          <button className="btn-confirm-cancel" onClick={onCancel}>Corregir</button>
          <button className="btn-confirm-vital" onClick={onConfirm}>Sí, continuar</button>
        </div>
      </div>
    </div>
  )
}

// ── DEFAULT STATE ───────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10) }
function nowHHMM()  {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function emptyForm() {
  return {
    estadoAlRecibir:       [],
    actitudConducta:       [],
    cuidadosRealizados:    [],
    cambiosPañal:          0,
    alimentacion:          '',
    medicamentos:          '',
    actividadesDia:        [],
    sueño:                 [],
    observacionesEspeciales: [],
    signosVitales: {
      ta_sistolica:  '',
      ta_diastolica: '',
      fc:            '',
      spo2:          '',
      fr:            '',
      temperatura:   '',
    },
    micciones:        0,
    caracMiccion:     [],
    evacuaciones:     0,
    caracEvacuacion:  [],
    enfermero:        '',
    horaReporte:      nowHHMM(),
    fecha:            todayISO(),
    notasAdicionales: '',
  }
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────────

export default function ReporteForm() {
  const [residentes, setResidentes]         = useState([])
  const [loadingRes, setLoadingRes]         = useState(true)
  const [selectedRes, setSelectedRes]       = useState(null)
  const [vistaRes, setVistaRes]             = useState('residencia_permanente')
  const [turno, setTurno]                   = useState('Matutino-Vespertino')
  const [form, setForm]                     = useState(emptyForm)
  const [generating, setGenerating]         = useState(false)
  const [reporteTexto, setReporteTexto]     = useState('')
  const [showSheet, setShowSheet]           = useState(false)
  const [error, setError]                   = useState('')
  const [showVitalConfirm, setShowVitalConfirm] = useState(false)

  const loadResidentes = useCallback(async () => {
    setLoadingRes(true)
    try {
      const res  = await fetch('/api/residentes')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setResidentes(data)
    } catch {
      setResidentes([])
    } finally {
      setLoadingRes(false)
    }
  }, [])

  useEffect(() => { loadResidentes() }, [loadResidentes])

  useEffect(() => {
    setForm(f => ({ ...f, horaReporte: nowHHMM(), fecha: todayISO() }))
  }, [])

  function handleVital(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, signosVitales: { ...f.signosVitales, [name]: value } }))
  }

  function setField(field) {
    return (value) => setForm(f => ({ ...f, [field]: value }))
  }

  function handleTextInput(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  function toggleCuidado(opt) {
    const current = form.cuidadosRealizados
    const next    = current.includes(opt)
      ? current.filter(o => o !== opt)
      : [...current, opt]
    setForm(f => ({
      ...f,
      cuidadosRealizados: next,
      cambiosPañal: next.includes('Cambio de pañal') ? (f.cambiosPañal || 1) : 0,
    }))
  }

  function isPañalSelected() { return form.cuidadosRealizados.includes('Cambio de pañal') }

  async function doGenerate() {
    setShowVitalConfirm(false)
    setError('')
    setGenerating(true)
    try {
      const res = await fetch('/api/generar-reporte', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          residente:               selectedRes,
          turno,
          fecha:                   form.fecha,
          estadoAlRecibir:         form.estadoAlRecibir,
          actitudConducta:         form.actitudConducta,
          cuidadosRealizados:      form.cuidadosRealizados,
          cambiosPañal:            form.cambiosPañal,
          alimentacion:            form.alimentacion,
          medicamentos:            form.medicamentos,
          actividadesDia:          turno !== 'Nocturno' ? form.actividadesDia : [],
          sueño:                   turno === 'Nocturno' ? form.sueño : [],
          observacionesEspeciales: form.observacionesEspeciales,
          signosVitales:           form.signosVitales,
          micciones:               form.micciones,
          caracMiccion:            form.caracMiccion,
          evacuaciones:            form.evacuaciones,
          caracEvacuacion:         form.caracEvacuacion,
          enfermero:               form.enfermero,
          horaReporte:             form.horaReporte,
          notasAdicionales:        form.notasAdicionales,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error del servidor')
      setReporteTexto(json.reporte)
      setShowSheet(true)
    } catch (err) {
      setError(err.message || 'Error al generar el reporte. Verifica la conexión.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleGenerate() {
    if (!selectedRes) return setError('Selecciona un residente antes de generar el reporte.')
    if (!form.enfermero.trim()) return setError('Ingresa el nombre del enfermero/a responsable.')
    if (!form.notasAdicionales.trim()) return setError('Las notas adicionales son obligatorias. Describe algo específico del turno antes de generar.')

    const alerts = getVitalAlerts(form.signosVitales)
    if (alerts.length > 0) {
      setError('')
      setShowVitalConfirm(true)
      return
    }

    doGenerate()
  }

  const vitalAlerts    = getVitalAlerts(form.signosVitales)
  const alertKeys      = new Set(vitalAlerts.map(a => a.key))

  const formDataForPDF = {
    residente:    selectedRes,
    turno,
    fecha:        form.fecha,
    horaReporte:  form.horaReporte,
    enfermero:    form.enfermero,
    signosVitales: form.signosVitales,
  }

  return (
    <>
      {/* ── HEADER ── */}
      <div className="page-header">
        <img src={logo} alt="Residencia Refugio Mendoza" className="page-header-logo-img" />
        <div className="page-header-info">
          <h1>Nuevo Reporte</h1>
          <p>Residencia Refugio Mendoza</p>
        </div>
      </div>

      {/* ── FECHA Y HORA ── */}
      <div className="form-card" style={{ marginTop: 12, marginLeft: 16, marginRight: 16 }}>
        <div className="section-label">Fecha y hora</div>
        <div className="date-row">
          <div className="input-group">
            <label>Fecha</label>
            <input
              className="input"
              type="date"
              name="fecha"
              value={form.fecha}
              onChange={handleTextInput}
              max={todayISO()}
            />
          </div>
          <div className="input-group">
            <label>Hora del reporte</label>
            <input
              className="input"
              type="time"
              name="horaReporte"
              value={form.horaReporte}
              onChange={handleTextInput}
            />
          </div>
        </div>
      </div>

      {/* ── SELECCIÓN DE RESIDENTE ── */}
      <SectionCard title="Residente">
        {/* Toggle tipo */}
        <div className="turn-toggle" style={{ marginBottom: 14 }}>
          {[
            ['residencia_permanente', '🏠 Estancia Permanente'],
            ['centro_dia',            '☀️ Centro de Día'],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={`turn-btn${vistaRes === v ? ' active' : ''}`}
              onClick={() => { setVistaRes(v); setSelectedRes(null) }}
            >
              {l}
            </button>
          ))}
        </div>

        {loadingRes ? (
          <div className="chip-grid">
            {[1,2,3,4].map(i => (
              <div key={i} style={{ width: 130, height: 80, borderRadius: 12 }} className="skeleton" />
            ))}
          </div>
        ) : residentes.length === 0 ? (
          <div className="empty-residents">
            No hay residentes. Agrégalos en la pestaña "Residentes".
          </div>
        ) : (() => {
          const filtrados = residentes.filter(r =>
            (r.tipo_servicio || 'residencia_permanente') === vistaRes
          )
          return filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, padding: '16px 0' }}>
              No hay residentes de este tipo registrados.
            </div>
          ) : (
            <div className="resident-grid">
              {filtrados.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={`resident-card${selectedRes?.id === r.id ? ' selected' : ''}`}
                  onClick={() => setSelectedRes(selectedRes?.id === r.id ? null : r)}
                >
                  <div className="resident-avatar">{r.iniciales}</div>
                  <div className="resident-name">{r.nombre}</div>
                  <div className="resident-room">Hab. {r.habitacion}</div>
                </button>
              ))}
            </div>
          )
        })()}
      </SectionCard>

      {/* ── TURNO ── */}
      <SectionCard title="Turno">
        <div className="turn-toggle" role="group" aria-label="Selección de turno">
          <button
            type="button"
            className={`turn-btn${turno === 'Matutino-Vespertino' ? ' active' : ''}`}
            onClick={() => setTurno('Matutino-Vespertino')}
          >
            ☀️ Matutino-Vespertino
          </button>
          <button
            type="button"
            className={`turn-btn${turno === 'Nocturno' ? ' active' : ''}`}
            onClick={() => setTurno('Nocturno')}
          >
            🌙 Nocturno
          </button>
        </div>
      </SectionCard>

      {/* ── SUEÑO (solo nocturno) ── */}
      {turno === 'Nocturno' && (
        <SectionCard title="¿Cómo durmió?">
          <ChipMulti
            options={OPT.sueño}
            selected={form.sueño}
            onSelect={setField('sueño')}
          />
        </SectionCard>
      )}

      {/* ── ESTADO AL RECIBIR ── */}
      <SectionCard title="Estado al recibir">
        <ChipMulti
          options={OPT.estadoAlRecibir}
          selected={form.estadoAlRecibir}
          onSelect={setField('estadoAlRecibir')}
        />
      </SectionCard>

      {/* ── ACTITUD Y CONDUCTA ── */}
      <SectionCard title="Actitud y conducta">
        <ChipMulti
          options={OPT.actitudConducta}
          selected={form.actitudConducta}
          onSelect={setField('actitudConducta')}
        />
      </SectionCard>

      {/* ── CUIDADOS REALIZADOS ── */}
      <SectionCard title="Cuidados realizados">
        <div className="chip-grid">
          {OPT.cuidadosRealizados.map(opt => (
            <button
              key={opt}
              type="button"
              className={`chip${form.cuidadosRealizados.includes(opt) ? ' selected' : ''}`}
              onClick={() => toggleCuidado(opt)}
            >
              {form.cuidadosRealizados.includes(opt) && <span className="chip-check">✓</span>}
              {opt}
            </button>
          ))}
        </div>

        {isPañalSelected() && (
          <div className="diaper-row" style={{ marginTop: 12 }}>
            <div className="diaper-counter">
              <button
                type="button"
                className="counter-btn"
                onClick={() => setForm(f => ({ ...f, cambiosPañal: Math.max(0, f.cambiosPañal - 1) }))}
                disabled={form.cambiosPañal <= 0}
                aria-label="Restar cambio de pañal"
              >
                −
              </button>
              <span className="counter-value">{form.cambiosPañal}</span>
              <button
                type="button"
                className="counter-btn"
                onClick={() => setForm(f => ({ ...f, cambiosPañal: f.cambiosPañal + 1 }))}
                aria-label="Sumar cambio de pañal"
              >
                +
              </button>
            </div>
            <span className="counter-label">
              {form.cambiosPañal === 1 ? '1 cambio de pañal' : `${form.cambiosPañal} cambios de pañal`}
            </span>
          </div>
        )}
      </SectionCard>

      {/* ── ALIMENTACIÓN ── */}
      <SectionCard title="Alimentación">
        <ChipSingle
          options={OPT.alimentacion}
          selected={form.alimentacion}
          onSelect={setField('alimentacion')}
        />
      </SectionCard>

      {/* ── MEDICAMENTOS ── */}
      <SectionCard title="Medicamentos">
        <ChipSingle
          options={OPT.medicamentos}
          selected={form.medicamentos}
          onSelect={setField('medicamentos')}
        />
      </SectionCard>

      {/* ── ACTIVIDADES (solo matutino-vespertino) ── */}
      {turno !== 'Nocturno' && (
        <SectionCard title="Actividades del día">
          <ChipMulti
            options={OPT.actividadesDia}
            selected={form.actividadesDia}
            onSelect={setField('actividadesDia')}
          />
        </SectionCard>
      )}

      {/* ── OBSERVACIONES ESPECIALES ── */}
      <SectionCard title="Observaciones especiales">
        <ChipMulti
          options={OPT.observacionesEspeciales}
          selected={form.observacionesEspeciales}
          onSelect={setField('observacionesEspeciales')}
        />
      </SectionCard>

      {/* ── SIGNOS VITALES ── */}
      <SectionCard title="Signos vitales">
        <div className="vitals-grid">
          {/* T/A — full width, two inputs */}
          <div className="vital-group ta-group">
            <div className={`vital-label${alertKeys.has('ta_sistolica') || alertKeys.has('ta_diastolica') ? ' vital-label-alert' : ''}`}>
              T/A{' '}
              <span style={{ fontWeight: 400, textTransform: 'none' }}>(mmHg)</span>
              {(alertKeys.has('ta_sistolica') || alertKeys.has('ta_diastolica')) && (
                <span className="vital-alert-icon"> ⚠</span>
              )}
            </div>
            <div className="vital-input-row">
              <input
                className={`input${alertKeys.has('ta_sistolica') ? ' input-alert' : ''}`}
                type="number"
                name="ta_sistolica"
                value={form.signosVitales.ta_sistolica}
                onChange={handleVital}
                placeholder="Sistólica"
                min="60"
                max="250"
                inputMode="numeric"
                aria-label="Presión sistólica"
              />
              <span className="sep">/</span>
              <input
                className={`input${alertKeys.has('ta_diastolica') ? ' input-alert' : ''}`}
                type="number"
                name="ta_diastolica"
                value={form.signosVitales.ta_diastolica}
                onChange={handleVital}
                placeholder="Diastólica"
                min="30"
                max="150"
                inputMode="numeric"
                aria-label="Presión diastólica"
              />
            </div>
          </div>

          <VitalInput label="FC"   unit="lpm" name="fc"          value={form.signosVitales.fc}          onChange={handleVital} placeholder="72"   min="20"  max="250" hasAlert={alertKeys.has('fc')}          />
          <VitalInput label="SpO₂" unit="%"   name="spo2"        value={form.signosVitales.spo2}        onChange={handleVital} placeholder="98"   min="50"  max="100" hasAlert={alertKeys.has('spo2')}        />
          <VitalInput label="FR"   unit="rpm" name="fr"          value={form.signosVitales.fr}          onChange={handleVital} placeholder="16"   min="6"   max="60"  hasAlert={alertKeys.has('fr')}          />
          <VitalInput label="Temp" unit="°C"  name="temperatura" value={form.signosVitales.temperatura} onChange={handleVital} placeholder="36.5" min="32"  max="42"  hasAlert={alertKeys.has('temperatura')} />
        </div>

        {/* Inline warning — visible mientras se llena el formulario */}
        {vitalAlerts.length > 0 && (
          <div className="vital-inline-warning" role="alert">
            <span className="vital-inline-icon">⚠</span>
            <span>
              {vitalAlerts.map(a => `${a.label} (${a.tag})`).join(' · ')}
            </span>
          </div>
        )}
      </SectionCard>

      {/* ── MICCIONES Y EVACUACIONES ── */}
      <SectionCard title="Micciones y evacuaciones">
        {/* Micciones */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>💧 Micciones</div>
        <div className="diaper-row" style={{ marginBottom: 10 }}>
          <div className="diaper-counter">
            <button type="button" className="counter-btn"
              onClick={() => setForm(f => ({ ...f, micciones: Math.max(0, f.micciones - 1) }))}
              disabled={form.micciones <= 0} aria-label="Restar micción">−</button>
            <span className="counter-value">{form.micciones}</span>
            <button type="button" className="counter-btn"
              onClick={() => setForm(f => ({ ...f, micciones: f.micciones + 1 }))}
              aria-label="Sumar micción">+</button>
          </div>
          <span className="counter-label">
            {form.micciones === 0 ? 'Sin registrar' : form.micciones === 1 ? '1 vez' : `${form.micciones} veces`}
          </span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Características de la orina
        </div>
        <ChipMulti
          options={[
            'Clara / Normal', 'Amarillo oscuro / Concentrada', 'Turbia',
            'Con sedimento', 'Rojiza / Hematúrica', 'Anaranjada',
            'Con mal olor', 'Escasa (oliguria)', 'Abundante (poliuria)', 'Incontinencia',
          ]}
          selected={form.caracMiccion}
          onSelect={v => setForm(f => ({ ...f, caracMiccion: v }))}
        />

        {/* Divisor */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {/* Evacuaciones */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>🚽 Evacuaciones</div>
        <div className="diaper-row" style={{ marginBottom: 10 }}>
          <div className="diaper-counter">
            <button type="button" className="counter-btn"
              onClick={() => setForm(f => ({ ...f, evacuaciones: Math.max(0, f.evacuaciones - 1) }))}
              disabled={form.evacuaciones <= 0} aria-label="Restar evacuación">−</button>
            <span className="counter-value">{form.evacuaciones}</span>
            <button type="button" className="counter-btn"
              onClick={() => setForm(f => ({ ...f, evacuaciones: f.evacuaciones + 1 }))}
              aria-label="Sumar evacuación">+</button>
          </div>
          <span className="counter-label">
            {form.evacuaciones === 0 ? 'Sin registrar' : form.evacuaciones === 1 ? '1 vez' : `${form.evacuaciones} veces`}
          </span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Características de la evacuación
        </div>
        <ChipMulti
          options={[
            'Formada / Normal', 'Blanda', 'Pastosa',
            'Líquida / Diarrea', 'Dura / Estreñimiento', 'Con sangre',
            'Con moco', 'Melénica (negra)', 'Fétida', 'Incontinencia fecal',
          ]}
          selected={form.caracEvacuacion}
          onSelect={v => setForm(f => ({ ...f, caracEvacuacion: v }))}
        />
      </SectionCard>

      {/* ── RESPONSABLE ── */}
      <SectionCard title="Responsable del turno">
        <div className="input-row">
          <div className="input-group">
            <label htmlFor="enfermero">Nombre del enfermero/a *</label>
            <input
              id="enfermero"
              className="input"
              type="text"
              name="enfermero"
              value={form.enfermero}
              onChange={handleTextInput}
              placeholder="Nombre completo"
              autoComplete="name"
            />
          </div>
        </div>
      </SectionCard>

      {/* ── NOTAS ADICIONALES ── */}
      <SectionCard title="Notas adicionales *">
        <textarea
          className="input"
          name="notasAdicionales"
          value={form.notasAdicionales}
          onChange={handleTextInput}
          placeholder="Campo obligatorio — describe algo específico del turno: comportamiento, evento, cambio en el estado del residente, etc."
          rows={4}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 15, borderColor: form.notasAdicionales.trim() ? undefined : 'var(--primary)' }}
        />
      </SectionCard>

      {/* ── ERROR BANNER ── */}
      {error && (
        <div className="error-banner" role="alert">{error}</div>
      )}

      {/* ── GENERATE BUTTON ── */}
      <button
        className="btn-generate"
        onClick={handleGenerate}
        disabled={generating}
        type="button"
      >
        {generating ? (
          <>
            <div className="spinner" />
            Generando reporte…
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2a10 10 0 110 20 10 10 0 010-20z" opacity=".3"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            Generar reporte con IA
          </>
        )}
      </button>

      <div style={{ height: 20 }} />

      {/* ── BOTTOM SHEET ── */}
      {showSheet && reporteTexto && (
        <BottomSheet
          reporte={reporteTexto}
          reporteOriginal={reporteTexto}
          formData={formDataForPDF}
          residenteId={selectedRes?.id}
          notasAdicionales={form.notasAdicionales}
          onClose={() => setShowSheet(false)}
        />
      )}

      {/* ── VITAL ALERT CONFIRMATION ── */}
      {showVitalConfirm && (
        <VitalAlertModal
          alerts={vitalAlerts}
          onConfirm={doGenerate}
          onCancel={() => setShowVitalConfirm(false)}
        />
      )}
    </>
  )
}
