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

  const prompt = `Redacta el reporte de turno de enfermería de la Residencia Refugio Mendoza. Escribe como enfermera profesional: directo, concreto, en tercera persona.

REGLAS DE ESTILO:
- Varía el inicio del reporte: puedes usar "Se recibe al paciente...", "Al inicio del turno...", "Durante el turno...", "El paciente se encuentra..." u otras frases naturales. NUNCA uses siempre el mismo inicio.
- Frases cortas y concretas. Sin adornos ni valoraciones positivas vacías.
- PROHIBIDO usar "buen semblante" a menos que esté en el estado al recibir. Usa sinónimos variados: "estable", "tranquilo/a", "sin alteraciones aparentes", "en buen estado general", etc.
- Describe EXACTAMENTE lo que dicen los datos. Si está agitado, dilo. Si rechazó alimentos, dilo.
- Las NOTAS ADICIONALES son lo más importante — deben quedar reflejadas claramente en el reporte.
- Sin asteriscos, guiones, emojis ni encabezados
- NO menciones signos vitales
- NO uses frases como "es motivo de satisfacción", "lo cual es positivo" ni similares
- Máximo 150 palabras

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
NOTAS ADICIONALES (integra esto en el reporte): ${notasAdicionales?.trim() || ''}
${contextAprendizaje ? `\nCONTEXTO DE REPORTES ANTERIORES — aprende el estilo y NO repitas las mismas frases:\n${contextAprendizaje}` : ''}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ reporte: message.content[0].text });
  } catch (error) {
    console.error('Anthropic API error:', error);
    const msg = error?.message || 'Error desconocido al llamar a la API de Anthropic';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
