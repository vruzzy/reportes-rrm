// Reportes de turno dentro de Gestión.
// Es el mismo reporte con IA de la pestaña "Reportes", pero los signos vitales ya no se
// capturan aquí: se toman de Controles diarios (al recibir y al entregar el turno).
const express   = require('express');
const router    = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const db        = require('../database');
const { requireAuth } = require('./auth');
const { requierePermiso } = require('../permisos');
const { TURNOS, eventosDelTurno } = require('./controles');
const { CAMPOS_SIGNOS, ETIQUETAS, UNIDADES, alertasDe } = require('../signos');

router.use(requireAuth);

const MODELO = 'claude-sonnet-4-6'; // el mismo que usa el reporte original
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const lista = (v) => (Array.isArray(v) ? v.map(x => String(x).slice(0, 80)).slice(0, 30) : []);
const txt = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const json = (s, def) => { try { return s ? JSON.parse(s) : def } catch { return def } };

/** Tomas del turno: { recibir: fila|null, entregar: fila|null } */
function signosDelTurno(residenteId, fecha, turno) {
  const filas = db.prepare('SELECT * FROM controles_signos WHERE residente_id = ? AND fecha = ? AND turno = ?')
    .all([residenteId, fecha, turno]);
  const out = { recibir: null, entregar: null };
  for (const f of filas) {
    out[f.momento] = {
      hora: f.hora, notas: f.notas, usuario_nombre: f.usuario_nombre,
      ...Object.fromEntries(CAMPOS_SIGNOS.map(c => [c, f[c]])),
    };
  }
  return out;
}

function tomaTexto(toma) {
  if (!toma) return 'sin registrar';
  const partes = [];
  if (toma.ta_sistolica != null || toma.ta_diastolica != null) partes.push(`T/A ${toma.ta_sistolica ?? '—'}/${toma.ta_diastolica ?? '—'} mmHg`);
  for (const c of ['fc', 'spo2', 'fr', 'temperatura', 'glucosa']) {
    if (toma[c] != null) partes.push(`${ETIQUETAS[c]} ${toma[c]} ${UNIDADES[c]}`);
  }
  const alertas = alertasDe(toma).map(a => `${a.etiqueta}: ${a.alerta}`);
  return `${toma.hora ? toma.hora + ' h — ' : ''}${partes.join(', ') || 'sin cifras'}`
    + (alertas.length ? ` (FUERA DE RANGO: ${alertas.join('; ')})` : ' (en rango)')
    + (toma.notas ? ` — nota: ${toma.notas}` : '');
}

function construirPrompt({ residente, turno, d, signos, aprendizaje }) {
  const cuidados = d.cuidadosRealizados.map(c =>
    c === 'Cambio de pañal' && d.cambiosPanal > 0
      ? `Cambio de pañal (${d.cambiosPanal} ${d.cambiosPanal === 1 ? 'vez' : 'veces'})` : c).join(', ');
  const actividades = d.actividadesDia.filter(a => a !== 'N/A').join(', ');
  // Cada registro viene de Controles diarios. La hora no va al reporte (lo pidió el dueño).
  const registro = (arr, nombre) => arr.length
    ? arr.map((e, i) => `${nombre} ${i + 1}: ${e.caracteristicas?.length ? e.caracteristicas.join(', ') : 'sin características registradas'}`).join(' | ')
    : '';
  const micc = registro(d.micciones, 'Micción');
  const evac = registro(d.evacuaciones, 'Evacuación');

  const contexto = aprendizaje ? [
    aprendizaje.notas_acumuladas?.trim() ? `Notas sobre este paciente: ${aprendizaje.notas_acumuladas.trim()}` : '',
    aprendizaje.reporte_original?.trim() && aprendizaje.reporte_editado?.trim() && aprendizaje.reporte_original.trim() !== aprendizaje.reporte_editado.trim()
      ? `En el reporte anterior, el texto generado fue corregido. Aprende de estas correcciones para no cometer los mismos errores:\nVERSIÓN ORIGINAL (con errores):\n"${aprendizaje.reporte_original.trim()}"\nVERSIÓN CORREGIDA (usa este estilo):\n"${aprendizaje.reporte_editado.trim()}"`
      : aprendizaje.reporte_editado?.trim() ? `Reporte anterior aprobado para este paciente:\n"${aprendizaje.reporte_editado.trim()}"` : '',
  ].filter(Boolean).join('\n\n') : '';

  const ahora = new Date();
  const semilla = `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}-${ahora.getHours()}-${Math.floor(Math.random() * 10000)}`;

  return `Redacta el reporte de turno de enfermería de la Residencia Refugio Mendoza. Escribe como enfermera profesional: directo, concreto, en tercera persona.

VARIACIÓN OBLIGATORIA (semilla: ${semilla}):
- Este reporte DEBE sonar diferente a cualquier reporte anterior, aunque los datos sean idénticos.
- Varía libremente: el orden en que presentas la información, la longitud de las oraciones, las expresiones clínicas elegidas, la estructura del párrafo.
- Nunca empieces igual dos veces seguidas ni uses la misma frase de apertura.

REGLAS DE ESTILO:
- NUNCA copies textualmente las etiquetas del formulario. Tradúcelas a lenguaje clínico narrativo. Ejemplos:
    "Activo/a con buen semblante" → "se recibe alerta y orientado/a", "se encuentra en buen estado general", "se observa despierto/a y sin alteraciones aparentes"
    "Accesible / Cooperador/a" → "muestra buena disposición", "colabora con los cuidados", "se muestra receptivo/a"
    "Administrados en tiempo y forma" → "se administra medicación según indicación médica", "recibe su tratamiento habitual sin incidencias"
    "Completa" (alimentación) → "acepta la dieta completa", "ingiere sin dificultad", "tolera adecuadamente los alimentos"
    "Sin novedades" → "turno sin incidencias relevantes", "sin eventos de importancia durante el turno"
    "Cambio de pañal" → "se realizan cambios de pañal", "se lleva a cabo higiene íntima"
    "Durmió bien toda la noche" → "descansa de forma continua durante la noche", "presenta sueño reparador sin interrupciones"
- Varía el inicio del reporte cada vez: "Se recibe al paciente...", "Al inicio del turno...", "Durante el turno...", "El/La residente se encuentra...", "Al momento de la recepción..." u otras frases naturales distintas.
- Frases cortas y concretas. Sin adornos ni valoraciones vacías.
- Describe con exactitud lo registrado. Si hay diarrea, nómbrala. Si hay incontinencia, menciónala con vocabulario clínico.
- Las NOTAS ADICIONALES son lo más importante: deben quedar integradas con claridad.
- Sin asteriscos, guiones, emojis ni encabezados.
- SIGNOS VITALES: las cifras van en una tabla aparte, así que NO las enumeres. Si todas están en rango, basta una frase breve como "signos vitales dentro de parámetros al recibir y al entregar" (o no mencionarlos). Si alguna está FUERA DE RANGO, menciónala en una sola frase clínica con su cifra y el momento (al recibir o al entregar).
- NO uses frases como "es motivo de satisfacción", "lo cual es positivo" ni similares.
- Máximo 160 palabras.

DATOS DEL TURNO:
Residente: ${residente.nombre}
Turno: ${turno}
Estado al recibir: ${d.estadoAlRecibir.join(', ') || 'No especificado'}
Actitud y conducta: ${d.actitudConducta.join(', ') || 'Sin datos'}
Cuidados realizados: ${cuidados || 'Sin datos'}
Alimentación: ${d.alimentacion || 'Sin datos'}
Medicamentos: ${d.medicamentos || 'Sin datos'}
${turno !== 'Nocturno' && actividades ? `Actividades del día: ${actividades}` : ''}
${turno === 'Nocturno' && d.sueno.length ? `Sueño: ${d.sueno.join(', ')}` : ''}
Observaciones especiales: ${d.observacionesEspeciales.join(', ') || 'Sin novedades'}
${micc ? `Micciones (${d.micciones.length}): ${micc}` : 'Micciones: Sin registrar'}
${evac ? `Evacuaciones (${d.evacuaciones.length}): ${evac}` : 'Evacuaciones: Sin registrar'}
(Menciona cuántas micciones y evacuaciones hubo y cómo fueron, sin mencionar horas.)
Signos vitales al recibir: ${tomaTexto(signos.recibir)}
Signos vitales al entregar: ${tomaTexto(signos.entregar)}
NOTAS ADICIONALES (integra esto en el reporte): ${d.notasAdicionales}
${contexto ? `\nCONTEXTO DE REPORTES ANTERIORES — aprende el estilo y NO repitas las mismas frases:\n${contexto}` : ''}`;
}

function guardarAprendizaje(residenteId, notas, original, editado) {
  const existe = db.get('SELECT id FROM aprendizaje WHERE residente_id = ?', [residenteId]);
  if (existe) {
    db.run(`UPDATE aprendizaje SET notas_acumuladas = ?, reporte_original = ?, reporte_editado = ?, actualizado_en = datetime('now') WHERE residente_id = ?`,
      [notas || '', original || '', editado || '', residenteId]);
  } else {
    db.run('INSERT INTO aprendizaje (residente_id, notas_acumuladas, reporte_original, reporte_editado) VALUES (?, ?, ?, ?)',
      [residenteId, notas || '', original || '', editado || '']);
  }
}

function publico(r) {
  return {
    id: r.id, residente_id: r.residente_id, residente_nombre: r.residente_nombre, fecha: r.fecha, turno: r.turno,
    hora: r.hora, enfermero: r.enfermero, texto: r.texto_reporte, notas_adicionales: r.notas_adicionales,
    signos: json(r.signos_turno, null), datos: json(r.datos_turno, null), origen: r.origen, creado_en: r.creado_en,
  };
}

const SELECT = `SELECT r.*, res.nombre AS residente_nombre FROM reportes r LEFT JOIN residentes res ON res.id = r.residente_id`;

// GET /api/gestion/reportes?fecha&turno  |  ?residente_id&desde&hasta
router.get('/', requierePermiso('reportes', 'ver'), (req, res) => {
  const { fecha, turno, residente_id, desde, hasta } = req.query;
  try {
    let filas;
    if (esFecha(fecha) && TURNOS.includes(turno)) {
      filas = db.prepare(`${SELECT} WHERE r.fecha = ? AND r.turno = ? ORDER BY r.id DESC`).all([fecha, turno]);
    } else if (residente_id) {
      filas = db.prepare(`${SELECT} WHERE r.residente_id = ? AND r.fecha BETWEEN ? AND ? ORDER BY r.fecha DESC, r.id DESC`)
        .all([Number(residente_id), esFecha(desde) ? desde : '0000-01-01', esFecha(hasta) ? hasta : '9999-12-31']);
    } else {
      return res.status(400).json({ error: 'Indica fecha y turno, o un residente.' });
    }
    res.json(filas.map(publico));
  } catch (err) {
    console.error('Error listando reportes (gestión):', err);
    res.status(500).json({ error: 'No se pudieron cargar los reportes.' });
  }
});

// GET /api/gestion/reportes/eliminacion?fecha&turno  → micciones y evacuaciones del turno
router.get('/eliminacion', requierePermiso('reportes', 'ver'), (req, res) => {
  const { fecha, turno } = req.query;
  if (!esFecha(fecha) || !TURNOS.includes(turno)) return res.status(400).json({ error: 'Fecha o turno no válidos.' });
  try {
    res.json(eventosDelTurno(fecha, turno));
  } catch (err) {
    console.error('Error leyendo micciones/evacuaciones (reportes):', err);
    res.status(500).json({ error: 'No se pudieron cargar las micciones y evacuaciones.' });
  }
});

// GET /api/gestion/reportes/controles?fecha&turno  → tomas del turno (lectura para quien hace reportes)
router.get('/controles', requierePermiso('reportes', 'ver'), (req, res) => {
  const { fecha, turno } = req.query;
  if (!esFecha(fecha) || !TURNOS.includes(turno)) return res.status(400).json({ error: 'Fecha o turno no válidos.' });
  try {
    res.json(db.prepare('SELECT * FROM controles_signos WHERE fecha = ? AND turno = ?').all([fecha, turno]));
  } catch (err) {
    console.error('Error leyendo controles (reportes):', err);
    res.status(500).json({ error: 'No se pudieron cargar los signos del turno.' });
  }
});

// POST /api/gestion/reportes/generar
router.post('/generar', requierePermiso('reportes', 'crear'), async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no está configurada en el servidor.' });

  const b = req.body || {};
  const residente = db.prepare('SELECT id, nombre FROM residentes WHERE id = ?').get([Number(b.residente_id)]);
  if (!residente) return res.status(400).json({ error: 'Selecciona un residente.' });
  if (!esFecha(b.fecha) || !TURNOS.includes(b.turno)) return res.status(400).json({ error: 'Fecha o turno no válidos.' });

  const x = b.datos || {};
  const d = {
    estadoAlRecibir: lista(x.estadoAlRecibir), actitudConducta: lista(x.actitudConducta),
    cuidadosRealizados: lista(x.cuidadosRealizados), cambiosPanal: Math.max(0, Math.min(Number(x.cambiosPanal) || 0, 30)),
    alimentacion: txt(x.alimentacion, 80), medicamentos: txt(x.medicamentos, 80),
    actividadesDia: lista(x.actividadesDia), sueno: lista(x.sueno), observacionesEspeciales: lista(x.observacionesEspeciales),
    notasAdicionales: txt(x.notasAdicionales, 3000),
  };
  if (!d.notasAdicionales) return res.status(400).json({ error: 'Las notas adicionales son obligatorias.' });
  const enfermero = txt(b.enfermero, 120) || req.usuario.nombre || '';
  const hora = /^\d{2}:\d{2}$/.test(b.hora || '') ? b.hora : '';

  const signos = signosDelTurno(residente.id, b.fecha, b.turno);
  // Micciones y evacuaciones: se toman de Controles diarios, no del formulario
  const eventos = eventosDelTurno(b.fecha, b.turno, residente.id).map(e => ({ tipo: e.tipo, hora: e.hora, caracteristicas: e.caracteristicas }));
  d.micciones = eventos.filter(e => e.tipo === 'miccion');
  d.evacuaciones = eventos.filter(e => e.tipo === 'evacuacion');
  const aprendizaje = db.get('SELECT notas_acumuladas, reporte_original, reporte_editado FROM aprendizaje WHERE residente_id = ?', [residente.id]);

  let texto;
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      temperature: 1,
      messages: [{ role: 'user', content: construirPrompt({ residente, turno: b.turno, d, signos, aprendizaje }) }],
    });
    texto = message.content.find(c => c.type === 'text')?.text?.trim();
    if (!texto) throw new Error('La IA no devolvió texto. Intenta de nuevo.');
  } catch (err) {
    console.error('Error de la API de Anthropic (gestión):', err);
    return res.status(502).json({ error: err?.message || 'No se pudo generar el reporte.' });
  }

  try {
    // signos_vitales (formato plano) se llena con la última toma, para que el Historial de la app lo siga leyendo
    const ultima = signos.entregar || signos.recibir || {};
    const plano = Object.fromEntries(['ta_sistolica', 'ta_diastolica', 'fc', 'spo2', 'fr', 'temperatura'].map(c => [c, ultima[c] ?? '']));
    const r = db.prepare(`
      INSERT INTO reportes
        (residente_id, fecha, turno, texto_reporte, texto_original, notas_adicionales, signos_vitales, alimentacion, medicamentos,
         observaciones_especiales, micciones, evacuaciones, signos_turno, datos_turno, enfermero, hora, usuario_id, origen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'gestion')
    `).run([
      residente.id, b.fecha, b.turno, texto, texto, d.notasAdicionales, JSON.stringify(plano), d.alimentacion, d.medicamentos,
      d.observacionesEspeciales.join(', '), JSON.stringify(d.micciones.map(e => e.caracteristicas)), JSON.stringify(d.evacuaciones.map(e => e.caracteristicas)),
      JSON.stringify(signos), JSON.stringify(d), enfermero, hora, req.usuario.id,
    ]);
    res.status(201).json(publico(db.prepare(`${SELECT} WHERE r.id = ?`).get([Number(r.lastInsertRowid)])));
  } catch (err) {
    console.error('Error guardando reporte (gestión):', err);
    res.status(500).json({ error: 'El reporte se generó pero no se pudo guardar.', texto });
  }
});

// PUT /api/gestion/reportes/:id  → guarda el texto revisado y lo usa para que la IA aprenda el estilo
router.put('/:id', requierePermiso('reportes', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  const texto = txt(req.body?.texto, 6000);
  if (!texto) return res.status(400).json({ error: 'El reporte no puede quedar vacío.' });
  try {
    const r = db.prepare('SELECT * FROM reportes WHERE id = ?').get([id]);
    if (!r) return res.status(404).json({ error: 'Reporte no encontrado.' });
    db.prepare('UPDATE reportes SET texto_reporte = ? WHERE id = ?').run([texto, id]);
    if (r.residente_id) guardarAprendizaje(r.residente_id, r.notas_adicionales, r.texto_original || r.texto_reporte, texto);
    res.json(publico(db.prepare(`${SELECT} WHERE r.id = ?`).get([id])));
  } catch (err) {
    console.error('Error actualizando reporte (gestión):', err);
    res.status(500).json({ error: 'No se pudo guardar el reporte.' });
  }
});

// DELETE /api/gestion/reportes/:id
router.delete('/:id', requierePermiso('reportes', 'eliminar'), (req, res) => {
  try {
    const r = db.prepare('DELETE FROM reportes WHERE id = ?').run([Number(req.params.id)]);
    if (!r.changes) return res.status(404).json({ error: 'Reporte no encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error borrando reporte (gestión):', err);
    res.status(500).json({ error: 'No se pudo borrar el reporte.' });
  }
});

module.exports = router;
