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

  const prompt = `Redacta el reporte de turno de enfermería de la Residencia Refugio Mendoza. Escribe exactamente como lo haría una enfermera en un reporte real: directo, práctico y sin adornos.

ESTILO:
- Empieza siempre con "Se recibe paciente..."
- Frases cortas y concretas, en tercera persona
- Usa expresiones como: "se administra medicación en tiempo y forma", "accesible durante su baño", "se mantiene hidratado/a", "sin eventualidades"
- Termina con "Sin eventualidades." si no hay nada que reportar
- Sin asteriscos, guiones, emojis, tablas ni símbolos
- NO menciones signos vitales de ninguna forma
- NO uses frases como "lo cual es una buena noticia", "es motivo de satisfacción" ni similares
- NO pongas encabezados, ni nombre de residencia, ni firma al inicio ni al final
- Máximo 150 palabras

DATOS DEL TURNO:
Residente: ${residente?.nombre || 'No especificado'}
Turno: ${turno}
Estado al recibir: ${estadoAlRecibir || 'No especificado'}
Actitud y conducta: ${Array.isArray(actitudConducta) && actitudConducta.length ? actitudConducta.join(', ') : 'Sin datos'}
Cuidados realizados: ${cuidadosTexto || 'Sin datos'}
Alimentación: ${alimentacion || 'Sin datos'}
Medicamentos: ${medicamentos || 'Sin datos'}
${turno !== 'Nocturno' && actividadesTexto ? `Actividades del día: ${actividadesTexto}` : ''}
${turno === 'Nocturno' && sueñoTexto ? `Sueño durante el turno: ${sueñoTexto}` : ''}
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
