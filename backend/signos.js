// Signos vitales: rangos para adultos mayores (65+) y límites físicos para validar captura.
// Los mismos rangos de alerta que usa el formulario de reportes original.

const CAMPOS_SIGNOS = ['ta_sistolica', 'ta_diastolica', 'fc', 'spo2', 'fr', 'temperatura', 'glucosa'];

// Valores imposibles (error de dedo): se rechazan al guardar
const LIMITES = {
  ta_sistolica:  [50, 260],
  ta_diastolica: [20, 160],
  fc:            [20, 250],
  spo2:          [50, 100],
  fr:            [4, 60],
  temperatura:   [30, 43],
  glucosa:       [20, 600],
};

const ETIQUETAS = {
  ta_sistolica: 'T/A sistólica', ta_diastolica: 'T/A diastólica', fc: 'Frec. cardiaca',
  spo2: 'SpO₂', fr: 'Frec. respiratoria', temperatura: 'Temperatura', glucosa: 'Glucosa capilar',
};
const UNIDADES = {
  ta_sistolica: 'mmHg', ta_diastolica: 'mmHg', fc: 'lpm', spo2: '%', fr: 'rpm', temperatura: '°C', glucosa: 'mg/dL',
};

/** Devuelve la etiqueta de alerta para un valor, o null si está en rango */
function alertaDe(campo, n) {
  if (n == null || Number.isNaN(n)) return null;
  switch (campo) {
    case 'ta_sistolica':  return n < 90 ? 'Hipotensión' : n > 160 ? 'Hipertensión' : null;
    case 'ta_diastolica': return n < 60 ? 'Hipotensión' : n > 100 ? 'Hipertensión' : null;
    case 'fc':            return n < 50 ? 'Bradicardia' : n > 110 ? 'Taquicardia' : null;
    case 'spo2':          return n < 92 ? 'Hipoxemia' : null;
    case 'fr':            return n < 10 ? 'Bradipnea' : n > 25 ? 'Taquipnea' : null;
    case 'glucosa':       return n < 70 ? 'Hipoglucemia' : n > 180 ? 'Hiperglucemia' : null;
    case 'temperatura':
      if (n < 35)    return 'Hipotermia';
      if (n < 36.1)  return 'Temperatura baja';
      if (n <= 37.2) return null;
      if (n <= 37.9) return 'Febrícula';
      if (n <= 39)   return 'Fiebre';
      if (n <= 40)   return 'Fiebre alta';
      return 'Hiperpirexia';
    default: return null;
  }
}

/** Lista de alertas de una toma: [{ campo, etiqueta, valor, unidad, alerta }] */
function alertasDe(toma) {
  if (!toma) return [];
  return CAMPOS_SIGNOS.flatMap(c => {
    const a = alertaDe(c, toma[c]);
    return a ? [{ campo: c, etiqueta: ETIQUETAS[c], valor: toma[c], unidad: UNIDADES[c], alerta: a }] : [];
  });
}

module.exports = { CAMPOS_SIGNOS, LIMITES, ETIQUETAS, UNIDADES, alertaDe, alertasDe };
