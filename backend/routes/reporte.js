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

  const prompt = `Redacta el cuerpo narrativo del reporte de turno de la Residencia Refugio Mendoza para la familia del residente.

REGLAS ESTRICTAS:
- Escribe SOLO el texto narrativo, sin encabezados, sin nombre de la residencia, sin fecha, sin hora, sin nombre del responsable al inicio ni al final
- Texto corrido en párrafos, sin asteriscos, guiones, emojis, tablas ni símbolos
- Lenguaje directo y sencillo, sin frases como "lo cual es una buena noticia", "lo que siempre es positivo", "lo cual es siempre un momento especial" ni similares
- NO menciones signos vitales bajo ninguna forma: ni tensión arterial, FC, SpO₂, FR, temperatura, mmHg, lpm, rpm ni °C
- NO agregues frases de cierre ni despedidas
- Máximo 200 palabras

INFORMACIÓN DEL TURNO:
Residente: ${residente?.nombre || 'No especificado'}
Estado al recibir: ${estadoAlRecibir || 'No especificado'}
Actitud y conducta: ${Array.isArray(actitudConducta) && actitudConducta.length ? actitudConducta.join(', ') : 'Sin datos'}
Cuidados realizados: ${cuidadosTexto || 'Sin datos'}
Alimentación: ${alimentacion || 'Sin datos'}
Medicamentos: ${medicamentos || 'Sin datos'}
${turno !== 'Nocturno' && actividadesTexto ? `Actividades del día: ${actividadesTexto}` : ''}
${turno === 'Nocturno' && sueñoTexto ? `Sueño: ${sueñoTexto}` : ''}
Observaciones: ${Array.isArray(observacionesEspeciales) && observacionesEspeciales.length ? observacionesEspeciales.join(', ') : 'Sin novedades'}
${notasAdicionales?.trim() ? `Notas adicionales: ${notasAdicionales.trim()}` : ''}`;

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
