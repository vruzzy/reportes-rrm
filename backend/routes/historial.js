const express  = require('express');
const router   = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const db       = require('../database');

// GET /api/historial?residente_id=&desde=&hasta=
router.get('/', (req, res) => {
  try {
    const { residente_id, desde, hasta } = req.query;
    if (!residente_id) return res.status(400).json({ error: 'residente_id requerido' });

    let query = `
      SELECT r.*, res.nombre AS residente_nombre
      FROM reportes r
      LEFT JOIN residentes res ON res.id = r.residente_id
      WHERE r.residente_id = ?
    `;
    const params = [residente_id];

    if (desde)  { query += ` AND r.fecha >= ?`; params.push(desde); }
    if (hasta)  { query += ` AND r.fecha <= ?`; params.push(hasta); }

    query += ` ORDER BY r.fecha ASC, r.creado_en ASC`;

    const reportes = db.prepare(query).all(params);
    res.json(reportes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/historial/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM reportes WHERE id = ?').run([req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/historial/evolucion — generar resumen de evolución con IA
router.post('/evolucion', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  const { residente, reportes, desde, hasta, destinatario } = req.body;
  if (!reportes?.length) return res.status(400).json({ error: 'No hay reportes en el período seleccionado' });

  const client = new Anthropic({ apiKey });

  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function fechaLegible(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-');
    return `${parseInt(d)} de ${MESES[parseInt(m)-1]} de ${y}`;
  }

  const resumenReportes = reportes.map((r, i) => {
    const sv = (() => { try { return JSON.parse(r.signos_vitales || '{}') } catch { return {} } })();
    const svTexto = Object.entries(sv)
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => {
        const labels = { ta_sistolica: 'T/A Sis', ta_diastolica: 'T/A Dia', fc: 'FC', spo2: 'SpO₂', fr: 'FR', temperatura: 'Temp' };
        return `${labels[k] || k}: ${v}`;
      }).join(', ');

    const micciones = (() => { try { return JSON.parse(r.micciones || '[]') } catch { return [] } })();
    const evacuaciones = (() => { try { return JSON.parse(r.evacuaciones || '[]') } catch { return [] } })();

    return `--- Reporte ${i+1} | ${fechaLegible(r.fecha)} | Turno: ${r.turno} ---
Texto: ${r.texto_reporte}
${svTexto ? `Signos vitales: ${svTexto}` : ''}
${r.alimentacion ? `Alimentación: ${r.alimentacion}` : ''}
${r.medicamentos ? `Medicamentos: ${r.medicamentos}` : ''}
${r.observaciones_especiales ? `Observaciones: ${r.observaciones_especiales}` : ''}
${micciones.length ? `Micciones: ${micciones.length} (${micciones.map((m,i) => `${i+1}: ${Array.isArray(m)?m.join(', '):'sin datos'}`).join(' | ')})` : ''}
${evacuaciones.length ? `Evacuaciones: ${evacuaciones.length} (${evacuaciones.map((e,i) => `${i+1}: ${Array.isArray(e)?e.join(', '):'sin datos'}`).join(' | ')})` : ''}`;
  }).join('\n\n');

  const destinatarioTexto = destinatario === 'medico'
    ? 'médico/a que atenderá al paciente en consulta (lenguaje clínico preciso)'
    : 'familiar del/la residente (lenguaje claro y comprensible, sin jerga médica excesiva)';

  const prompt = `Eres el asistente clínico de la Residencia Refugio Mendoza. Genera un resumen de evolución del/la residente ${residente?.nombre || ''} correspondiente al período del ${fechaLegible(desde)} al ${fechaLegible(hasta)}, basado en ${reportes.length} reportes de enfermería.

Este resumen está dirigido al ${destinatarioTexto}.

INCLUYE en el resumen:
1. Estado general y evolución a lo largo del período
2. Tendencias en signos vitales (si hay datos)
3. Patrón de alimentación y adherencia a medicamentos
4. Eventos relevantes (caídas, visitas médicas, cambios de comportamiento, observaciones especiales)
5. Patrón de micciones y evacuaciones si hay datos relevantes
6. Conclusión general sobre el estado actual del/la residente

ESTILO:
- Escribe en párrafos fluidos, no en listas con guiones
- Lenguaje profesional pero humano
- Menciona fechas específicas cuando ocurrió algo importante
- Sin asteriscos ni encabezados con #
- Máximo 300 palabras

REPORTES DEL PERÍODO:
${resumenReportes}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ evolucion: message.content[0].text });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Error al generar evolución' });
  }
});

module.exports = router;
