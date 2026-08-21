const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../database');

// POST /api/guardar-aprendizaje
router.post('/guardar-aprendizaje', (req, res) => {
  const { residente_id, notas, reporte_original, reporte_editado } = req.body;
  if (!residente_id) return res.status(400).json({ error: 'residente_id requerido' });

  const existing = db.get('SELECT id FROM aprendizaje WHERE residente_id = ?', [residente_id]);
  if (existing) {
    db.run(
      `UPDATE aprendizaje SET notas_acumuladas = ?, reporte_original = ?, reporte_editado = ?, actualizado_en = datetime('now') WHERE residente_id = ?`,
      [notas || '', reporte_original || '', reporte_editado || '', residente_id]
    );
  } else {
    db.run(
      `INSERT INTO aprendizaje (residente_id, notas_acumuladas, reporte_original, reporte_editado) VALUES (?, ?, ?, ?)`,
      [residente_id, notas || '', reporte_original || '', reporte_editado || '']
    );
  }
  res.json({ ok: true });
});

// POST /api/generar-reporte
router.post('/generar-reporte', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' });
  }

  const client = new Anthropic({ apiKey });

  const {
    residente,
    turno,
    fecha,
    estadoAlRecibir,
    actitudConducta,
    cuidadosRealizados,
    cambiosPañal,
    alimentacion,
    medicamentos,
    actividadesDia,
    observacionesEspeciales,
    signosVitales,
    enfermero,
    horaReporte,
    notasAdicionales,
    sueño,
    micciones,
    evacuaciones,
  } = req.body;

  const cuidadosTexto = Array.isArray(cuidadosRealizados)
    ? cuidadosRealizados.map(c =>
        c === 'Cambio de pañal' && cambiosPañal > 0
          ? `Cambio de pañal (${cambiosPañal} ${cambiosPañal === 1 ? 'vez' : 'veces'})`
          : c
      ).join(', ')
    : cuidadosRealizados;

  const actividadesTexto = Array.isArray(actividadesDia)
    ? actividadesDia.filter(a => a !== 'N/A').join(', ')
    : actividadesDia;

  const sueñoTexto = Array.isArray(sueño) && sueño.length
    ? sueño.join(', ')
    : '';

  const miccionesTexto = Array.isArray(micciones) && micciones.length
    ? micciones.map((carac, i) => {
        const desc = Array.isArray(carac) && carac.length ? carac.join(', ') : 'sin características registradas';
        return `Micción ${i + 1}: ${desc}`;
      }).join(' | ')
    : '';

  const evacuacionesTexto = Array.isArray(evacuaciones) && evacuaciones.length
    ? evacuaciones.map((carac, i) => {
        const desc = Array.isArray(carac) && carac.length ? carac.join(', ') : 'sin características registradas';
        return `Evacuación ${i + 1}: ${desc}`;
      }).join(' | ')
    : '';

  const aprendizaje = residente?.id
    ? db.get('SELECT notas_acumuladas, reporte_original, reporte_editado FROM aprendizaje WHERE residente_id = ?', [residente.id])
    : null;

  const contextAprendizaje = aprendizaje
    ? [
        aprendizaje.notas_acumuladas?.trim()
          ? `Notas sobre este paciente: ${aprendizaje.notas_acumuladas.trim()}`
          : '',
        aprendizaje.reporte_original?.trim() && aprendizaje.reporte_editado?.trim()
          ? `En el reporte anterior, el texto generado fue corregido. Aprende de estas correcciones para no cometer los mismos errores:\nVERSIÓN ORIGINAL (con errores):\n"${aprendizaje.reporte_original.trim()}"\nVERSIÓN CORREGIDA (usa este estilo):\n"${aprendizaje.reporte_editado.trim()}"`
          : aprendizaje.reporte_editado?.trim()
          ? `Reporte anterior aprobado para este paciente:\n"${aprendizaje.reporte_editado.trim()}"`
          : '',
      ].filter(Boolean).join('\n\n')
    : '';

  const ahora = new Date()
  const semilla = `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}-${ahora.getHours()}-${Math.floor(Math.random() * 10000)}`

  const prompt = `Redacta el reporte de turno de enfermería de la Residencia Refugio Mendoza. Escribe como enfermera profesional: directo, concreto, en tercera persona.

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
- NO menciones signos vitales.
- NO uses frases como "es motivo de satisfacción", "lo cual es positivo" ni similares.
- Máximo 160 palabras.

DATOS DEL TURNO:
Residente: ${residente?.nombre || 'No especificado'}
Turno: ${turno}
Estado al recibir: ${Array.isArray(estadoAlRecibir) && estadoAlRecibir.length ? estadoAlRecibir.join(', ') : 'No especificado'}
Actitud y conducta: ${Array.isArray(actitudConducta) && actitudConducta.length ? actitudConducta.join(', ') : 'Sin datos'}
Cuidados realizados: ${cuidadosTexto || 'Sin datos'}
Alimentación: ${alimentacion || 'Sin datos'}
Medicamentos: ${medicamentos || 'Sin datos'}
${turno !== 'Nocturno' && actividadesTexto ? `Actividades del día: ${actividadesTexto}` : ''}
${turno === 'Nocturno' && sueñoTexto ? `Sueño: ${sueñoTexto}` : ''}
Observaciones especiales: ${Array.isArray(observacionesEspeciales) && observacionesEspeciales.length ? observacionesEspeciales.join(', ') : 'Sin novedades'}
${miccionesTexto ? `Micciones (${micciones.length}): ${miccionesTexto}` : 'Micciones: Sin registrar'}
${evacuacionesTexto ? `Evacuaciones (${evacuaciones.length}): ${evacuacionesTexto}` : 'Evacuaciones: Sin registrar'}
NOTAS ADICIONALES (integra esto en el reporte): ${notasAdicionales?.trim() || ''}
${contextAprendizaje ? `\nCONTEXTO DE REPORTES ANTERIORES — aprende el estilo y NO repitas las mismas frases:\n${contextAprendizaje}` : ''}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const textoReporte = message.content[0].text;

    // Guardar reporte en historial
    if (residente?.id) {
      try {
        db.prepare(`
          INSERT INTO reportes
            (residente_id, fecha, turno, texto_reporte, notas_adicionales,
             signos_vitales, alimentacion, medicamentos, observaciones_especiales,
             micciones, evacuaciones)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run([
          residente.id,
          fecha,
          turno,
          textoReporte,
          notasAdicionales || '',
          JSON.stringify(signosVitales || {}),
          alimentacion || '',
          medicamentos || '',
          Array.isArray(observacionesEspeciales) ? observacionesEspeciales.join(', ') : '',
          JSON.stringify(micciones || []),
          JSON.stringify(evacuaciones || []),
        ]);
      } catch (e) { /* no bloquear si falla el guardado */ }
    }

    res.json({ reporte: textoReporte });
  } catch (error) {
    console.error('Anthropic API error:', error);
    const msg = error?.message || 'Error desconocido al llamar a la API de Anthropic';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
