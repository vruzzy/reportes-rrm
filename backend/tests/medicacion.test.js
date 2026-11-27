// Pruebas de las reglas de Medicación. Correr con:  npm test  (dentro de backend/)
// Solo datos ficticios.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../medicacion/logica');

const RONDAS = [
  { id: 1, nombre: 'Mañana', hora_inicio: '06:00', hora_fin: '11:00', orden: 1, activa: 1 },
  { id: 2, nombre: 'Tarde', hora_inicio: '12:00', hora_fin: '17:00', orden: 2, activa: 1 },
  { id: 3, nombre: 'Noche', hora_inicio: '18:00', hora_fin: '23:00', orden: 3, activa: 1 },
];
const TABLETA = { id: 10, principio_activo: 'Levotiroxina sódica', concentracion: '100 mcg', forma: 'tableta', unidad_dosis: 'tableta', unidad_stock: 'tableta', factor_conversion: 1, permite_fraccion: 1 };
const GOTAS = { id: 11, principio_activo: 'Haloperidol', concentracion: '2 mg/ml', forma: 'gotas', unidad_dosis: 'gota', unidad_stock: 'frasco', factor_conversion: 400, permite_fraccion: 0 };
const CAPSULA = { id: 12, principio_activo: 'Omeprazol', concentracion: '20 mg', forma: 'capsula', unidad_dosis: 'capsula', unidad_stock: 'capsula', factor_conversion: 1, permite_fraccion: 0 };

test('zona horaria: las 18:51 en México siguen siendo el mismo día', () => {
  // 2026-11-23 18:51 en México = 2026-11-24 00:51 UTC
  const d = new Date('2026-11-24T00:51:00Z');
  assert.deepEqual(L.ahoraMexico(d), { fecha: '2026-11-23', hora: '18:51' });
  assert.equal(L.hoyMexico(new Date('2026-11-24T05:59:00Z')), '2026-11-23');
  assert.equal(L.hoyMexico(new Date('2026-11-24T06:00:00Z')), '2026-11-24');
});

test('días de la semana: 1½ de lunes a viernes y 1 sábado y domingo', () => {
  const lv = { estado: 'activa', fecha_inicio: '2026-11-01', dias_modo: 'semana', dias_semana: '1,2,3,4,5' };
  const sd = { estado: 'activa', fecha_inicio: '2026-11-01', dias_modo: 'semana', dias_semana: '0,6' };
  assert.equal(L.aplicaEnFecha(lv, '2026-11-23'), true);   // lunes
  assert.equal(L.aplicaEnFecha(sd, '2026-11-23'), false);
  assert.equal(L.aplicaEnFecha(lv, '2026-11-29'), false);  // domingo
  assert.equal(L.aplicaEnFecha(sd, '2026-11-29'), true);
  assert.equal(L.textoDias(lv), 'de lunes a viernes');
  assert.equal(L.textoDias(sd), 'sábados y domingos');
  assert.equal(L.textoDias({ dias_modo: 'semana', dias_semana: '1,3,5' }), 'lunes, miércoles y viernes');
});

test('cada N días cuenta desde la fecha ancla', () => {
  const p = { estado: 'activa', fecha_inicio: '2026-11-20', dias_modo: 'cada_n', cada_n_dias: 3, fecha_ancla: '2026-11-20' };
  assert.deepEqual(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-26'].map(f => L.aplicaEnFecha(p, f)), [true, false, false, true, true]);
  assert.equal(L.aplicaEnFecha(p, '2026-11-17'), false); // antes del inicio
});

test('fechas: no aplica después de la fecha de fin ni si no está activa', () => {
  const p = { estado: 'activa', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-07', dias_modo: 'todos' };
  assert.equal(L.aplicaEnFecha(p, '2026-11-07'), true);
  assert.equal(L.aplicaEnFecha(p, '2026-11-08'), false);
  assert.equal(L.aplicaEnFecha({ ...p, estado: 'suspendida' }, '2026-11-03'), false);
  assert.equal(L.aplicaEnFecha({ ...p, estado: 'reemplazada' }, '2026-11-03'), false);
});

test('consumo diario y días restantes', () => {
  const dosVeces = { tipo: 'fija', dosis: 1, horarios: [{ ronda_id: 1 }, { ronda_id: 3 }], dias_modo: 'todos' };
  assert.equal(L.consumoDiario(dosVeces), 2);
  assert.equal(L.diasRestantes(12, 2), 6);
  const lv = { tipo: 'fija', dosis: 1.5, horarios: [{ ronda_id: 1 }], dias_modo: 'semana', dias_semana: '1,2,3,4,5' };
  assert.equal(L.consumoDiario(lv), L.redondear(1.5 * 5 / 7));
  assert.equal(L.consumoDiario({ tipo: 'prn', dosis: 1, horarios: [] }), 0);
  assert.equal(L.diasRestantes(10, 0), null);
  assert.equal(L.diasRestantes(-3, 2), 0);
});

test('gotas: 5 gotas de un frasco de 400 se muestran en frascos y gotas', () => {
  assert.equal(L.existenciaLegible(950, GOTAS), '2 frascos y 150 gotas');
  assert.equal(L.existenciaLegible(400, GOTAS), '1 frasco');
  assert.equal(L.existenciaLegible(5, GOTAS), '5 gotas');
  assert.equal(L.existenciaLegible(23, TABLETA), '23 tabletas');
  assert.equal(L.existenciaLegible(1.5, TABLETA), '1½ tabletas');
  const tresVeces = { tipo: 'fija', dosis: 5, horarios: [{ ronda_id: 1 }, { ronda_id: 2 }, { ronda_id: 3 }], dias_modo: 'todos' };
  assert.equal(L.diasRestantes(400, L.consumoDiario(tresVeces)), 26);
});

test('validar: la hora debe caer dentro de su ronda', () => {
  const base = { tipo: 'fija', dosis: 1, dias_modo: 'todos' };
  assert.throws(() => L.validarPrescripcion({ ...base, horarios: [{ ronda_id: 3, hora: '07:00' }] }, TABLETA, RONDAS, '2026-11-23'), /no cae dentro de la ronda de la Noche/);
  const ok = L.validarPrescripcion({ ...base, horarios: [{ ronda_id: 3, hora: '20:00' }, { ronda_id: 1, hora: '06:30' }] }, TABLETA, RONDAS, '2026-11-23');
  assert.deepEqual(JSON.parse(ok.horarios), [{ ronda_id: 1, hora: '06:30' }, { ronda_id: 3, hora: '20:00' }]); // ordenadas
  assert.equal(ok.fecha_inicio, '2026-11-23'); // por defecto, hoy
});

test('validar: una fija necesita ronda y días; PRN necesita motivo', () => {
  assert.throws(() => L.validarPrescripcion({ tipo: 'fija', dosis: 1, horarios: [] }, TABLETA, RONDAS), /al menos una ronda/);
  assert.throws(() => L.validarPrescripcion({ tipo: 'fija', dosis: 1, horarios: [{ ronda_id: 1 }], dias_modo: 'semana', dias_semana: [] }, TABLETA, RONDAS), /al menos un día/);
  assert.throws(() => L.validarPrescripcion({ tipo: 'prn', dosis: 1 }, TABLETA, RONDAS), /para qué se usa/);
  const prn = L.validarPrescripcion({ tipo: 'prn', dosis: 1, prn_motivo: 'dolor', prn_max_24h: 3, prn_intervalo_h: 6, horarios: [{ ronda_id: 1 }] }, TABLETA, RONDAS);
  assert.equal(prn.horarios, '[]'); // una PRN no lleva rondas
  assert.throws(() => L.validarPrescripcion({ tipo: 'variable', horarios: [{ ronda_id: 1 }] }, GOTAS, RONDAS), /escala/);
});

test('validar: sin días ni fechas en las indicaciones, y fracciones solo si se puede partir', () => {
  const b = { tipo: 'fija', dosis: 1, horarios: [{ ronda_id: 1 }] };
  assert.throws(() => L.validarPrescripcion({ ...b, indicaciones: 'lunes, miércoles y viernes' }, TABLETA, RONDAS), /no deben llevar días ni fechas/);
  assert.throws(() => L.validarPrescripcion({ ...b, indicaciones: 'del 13-10-26 al 13-01-27' }, TABLETA, RONDAS), /no deben llevar días ni fechas/);
  assert.ok(L.validarPrescripcion({ ...b, indicaciones: 'en ayunas' }, TABLETA, RONDAS));
  assert.throws(() => L.validarPrescripcion({ ...b, dosis: 0.5 }, CAPSULA, RONDAS), /no se puede partir/);
  assert.equal(L.validarPrescripcion({ ...b, dosis: 0.5 }, TABLETA, RONDAS).dosis, 0.5);
  assert.throws(() => L.validarPrescripcion({ ...b, fecha_inicio: '2026-11-10', fecha_fin: '2026-11-01' }, TABLETA, RONDAS), /anterior a la de inicio/);
});

test('versiones: detecta solo los cambios clínicos', () => {
  const a = { medicamento_id: 10, tipo: 'fija', dosis: 1, horarios: '[{"ronda_id":1,"hora":"08:00"}]', dias_modo: 'todos', provee: 'familia', indicaciones: 'en ayunas' };
  assert.deepEqual(L.cambiosClinicos(a, { ...a, indicaciones: 'con agua' }), []);
  assert.deepEqual(L.cambiosClinicos(a, { ...a, dosis: 1.5 }), ['dosis']);
  assert.deepEqual(L.cambiosClinicos(a, { ...a, horarios: [{ ronda_id: 1, hora: '08:00' }] }), []);
  assert.deepEqual(L.cambiosClinicos(a, { ...a, horarios: '[{"ronda_id":3,"hora":""}]' }), ['horarios']);
});

test('rondas: no se traslapan y la hora de fin va después del inicio', () => {
  assert.throws(() => L.validarRondas([{ nombre: 'Mañana', hora_inicio: '07:00', hora_fin: '12:30' }, { nombre: 'Tarde', hora_inicio: '12:00', hora_fin: '17:00' }]), /se traslapan/);
  assert.throws(() => L.validarRondas([{ nombre: 'Noche', hora_inicio: '23:00', hora_fin: '20:00' }]), /después del inicio/);
  assert.equal(L.validarRondas(RONDAS).length, 3);
  assert.equal(L.rondaDeHora(RONDAS, '19:30').nombre, 'Noche');
  assert.equal(L.rondaDeHora(RONDAS, '03:00'), null);
});

test('catálogo: detecta duplicados con mayúsculas, acentos y errores de dedo', () => {
  const cat = [
    { id: 1, principio_activo: 'Levotiroxina', concentracion: '100 mcg', forma: 'tableta' },
    { id: 2, principio_activo: 'Esomeprazol', concentracion: '40 mg', forma: 'tableta' },
    { id: 3, principio_activo: 'Losartán', concentracion: '50 mg', forma: 'tableta' },
  ];
  assert.equal(L.claveCatalogo({ principio_activo: 'LEVOTIROXINA ', concentracion: '100MCG', forma: 'tableta' }), L.claveCatalogo(cat[0]));
  assert.deepEqual(L.similares(cat, { principio_activo: 'LEVOTIROZINA SODICA' }).map(m => m.id), [1]);
  assert.deepEqual(L.similares(cat, { principio_activo: 'Esoprazol' }).map(m => m.id), [2]);
  assert.deepEqual(L.similares(cat, { principio_activo: 'losartan' }).map(m => m.id), [3]);
  assert.deepEqual(L.similares(cat, { principio_activo: 'Metformina' }), []);
});

test('vista previa en lenguaje natural', () => {
  const p = { tipo: 'fija', dosis: 1.5, horarios: [{ ronda_id: 1, hora: '08:00' }], dias_modo: 'semana', dias_semana: '1,2,3,4,5', fecha_inicio: '2026-11-23', fecha_fin: '', provee: 'familia' };
  assert.equal(L.textoPrescripcion(p, TABLETA, RONDAS, '2026-11-23'),
    'Levotiroxina sódica 100 mcg — 1½ tabletas en la Mañana (08:00), de lunes a viernes, desde hoy, sin fecha de fin. La provee la familia.');
  const prn = { tipo: 'prn', dosis: 1, prn_motivo: 'dolor', prn_max_24h: 3, prn_intervalo_h: 8, fecha_inicio: '2026-11-23', provee: 'centro' };
  assert.match(L.textoPrescripcion(prn, TABLETA, RONDAS, '2026-11-23'), /1 tableta solo si hace falta \(dolor\), máximo 3 al día y con al menos 8 h entre dosis/);
});
