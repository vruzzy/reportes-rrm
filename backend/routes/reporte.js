const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

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
  } = req.body;

  const cuidadosTexto = Array.isArray(cuidadosRealizados)
    ? cuidadosRealizados.map(c =>
        c === 'Cambio de pañal' && cambiosPañal > 0
          ? `Cambio de pañal (${cambiosPañal} ${cambiosPañal === 1 ? 'vez' : 'veces'})`
          : c
      ).join(', ')
    : cuidadosRealizados;

  const prompt = `Eres enfermero/a de la Residencia Refugio Mendoza, Mérida, Yucatán. Escribe el reporte del turno para la familia del residente de forma clara y cercana, como si les estuvieras contando cómo estuvo su familiar durante el turno.

REGLAS:
- Texto corrido y natural, sin asteriscos, guiones, emojis, tablas ni símbolos
- Lenguaje sencillo y cercano, sin tecnicismos innecesarios, pero siempre respetuoso
- Tono cálido, como si le hablaras directamente a la familia
- NO menciones signos vitales en ningún momento, ni T/A, FC, SpO₂, FR ni temperatura
- NO agregues frases de cierre, despedidas, ni frases motivacionales al final
- Máximo 250 palabras

DATOS DEL TURNO:
- Residencia: Residencia Refugio Mendoza
- Residente: ${residente?.nombre || 'No especificado'}
- Turno: ${turno}
- Fecha: ${fecha}
- Hora del reporte: ${horaReporte}
- Responsable: ${enfermero}

ESTADO AL RECIBIR: ${estadoAlRecibir || 'No especificado'}
ACTITUD Y CONDUCTA: ${Array.isArray(actitudConducta) && actitudConducta.length ? actitudConducta.join(', ') : 'Sin datos'}
CUIDADOS REALIZADOS: ${cuidadosTexto || 'Sin datos'}
ALIMENTACIÓN: ${alimentacion || 'Sin datos'}
MEDICAMENTOS: ${medicamentos || 'Sin datos'}
${turno !== 'Nocturno' && actividadesDia && actividadesDia !== 'N/A' ? `ACTIVIDADES DEL DÍA: ${actividadesDia}` : ''}
OBSERVACIONES ESPECIALES: ${Array.isArray(observacionesEspeciales) && observacionesEspeciales.length ? observacionesEspeciales.join(', ') : 'Sin novedades'}
${notasAdicionales?.trim() ? `NOTAS ADICIONALES: ${notasAdicionales.trim()}` : ''}

SIGNOS VITALES:
• T/A: ${signosVitales?.ta_sistolica || '--'}/${signosVitales?.ta_diastolica || '--'} mmHg
• FC: ${signosVitales?.fc || '--'} lpm
• SpO2: ${signosVitales?.spo2 || '--'}%
• FR: ${signosVitales?.fr || '--'} rpm
• Temperatura: ${signosVitales?.temperatura || '--'}°C

Redacta el reporte completo integrando TODA la información anterior de forma narrativa y fluida. Incluye: encabezado con nombre de la residencia y datos del turno, cuerpo narrativo, signos vitales en formato tabla de texto, y firma del responsable.`;

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
