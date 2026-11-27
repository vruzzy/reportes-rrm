// Entradas y salidas: cada persona marca su entrada y su salida desde el teléfono, pero solo si está
// dentro de la residencia (se compara la ubicación del teléfono con la que configuró administración).
// Se cruza con el Horario semanal para ver retardos, quién no ha llegado y cuántas horas trabajó.
// Permisos: marcar = cualquiera con su perfil vinculado; ver a todos = `personal` ver;
// configurar la ubicación y corregir marcas = `personal` editar.
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const { puede, requierePermiso, destinatariosDe } = require('../permisos');
const L = require('../medicacion/logica');
const { turnoDePersonal } = require('./personal');
const { crearAvisos } = require('./avisos');

db.exec(`
  CREATE TABLE IF NOT EXISTS asistencia (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id   INTEGER NOT NULL,
    tipo          TEXT NOT NULL CHECK (tipo IN ('entrada','salida')),
    fecha         TEXT NOT NULL,                 -- día del turno (la salida del nocturno es del día en que entró)
    momento       TEXT NOT NULL,                 -- 'AAAA-MM-DD HH:MM' hora de México
    lat           REAL,
    lng           REAL,
    precision_m   REAL,
    distancia_m   REAL,
    entrada_id    INTEGER,                       -- en una salida: la entrada que cierra
    manual        INTEGER NOT NULL DEFAULT 0,    -- la puso administración (se le olvidó, no tenía pila…)
    nota          TEXT DEFAULT '',
    registrado_por_nombre TEXT DEFAULT '',
    creado_en     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (personal_id) REFERENCES personal(id) ON DELETE CASCADE
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_asistencia_fecha ON asistencia (fecha)');
db.exec('CREATE INDEX IF NOT EXISTS idx_asistencia_personal ON asistencia (personal_id, momento)');
db.exec('CREATE TABLE IF NOT EXISTS act_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');

// avisos: a quién avisar cuando alguien llega tarde (retardo) o no ha marcado ya pasada la tolerancia (sin_marcar)
const AVISOS = { retardo: true, sin_marcar: true, destinatarios: [], correo: false };
const POR_DEFECTO = { lat: null, lng: null, radio: 150, precision_max: 100, tolerancia: 10 };

function leerConfig() {
  const f = db.prepare("SELECT valor FROM act_config WHERE clave = 'checador'").get();
  try { return f ? JSON.parse(f.valor) : {} } catch { return {} }
}
function guardarConfig(cambios) {
  db.prepare(`INSERT INTO act_config (clave, valor) VALUES ('checador', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`)
    .run([JSON.stringify({ ...leerConfig(), ...cambios })]);
}
function config() {
  const v = leerConfig();
  const c = { ...POR_DEFECTO, ...v, avisos: { ...AVISOS, ...(v.avisos || {}) } };
  return { ...c, configurado: Number.isFinite(c.lat) && Number.isFinite(c.lng) };
}
const urlApp = (req) => (process.env.APP_URL ? process.env.APP_URL.replace(/\/+$/, '') : `${req.protocol}://${req.get('host')}`);

/** Manda el aviso a quien tenga ese aviso activado en su rol (Permisos y notificaciones), menos a quien se trata. */
function avisar(cfg, tipo, persona, { titulo, texto, clave }) {
  const quienes = destinatariosDe(tipo).filter(u => u.id !== persona.usuario_id);
  if (!quienes.length) return 0;
  return crearAvisos({
    usuarios: quienes.map(u => ({ id: u.id, correo: u.correo })), tipo, titulo, texto, vista: 'asistencia', sub: 'dia', clave,
    correo: { url: cfg.url_app },
  });
}

/** Distancia en metros entre dos puntos (fórmula de haversine). */
function distancia(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Minutos desde una referencia fija, para restar momentos ('AAAA-MM-DD HH:MM')
const minutos = (momento) => Math.round(Date.parse(momento.replace(' ', 'T') + ':00Z') / 60000);
const ahora = () => { const a = L.ahoraMexico(); return { fecha: a.fecha, hora: a.hora, momento: `${a.fecha} ${a.hora}` } };

/** Momento de inicio y fin del turno (el nocturno termina al día siguiente). */
function horarioTurno(t, fecha) {
  if (!t?.inicio || !t?.fin) return null;
  const ini = `${fecha} ${t.inicio}`;
  const fin = `${t.fin <= t.inicio ? L.sumarDias(fecha, 1) : fecha} ${t.fin}`;
  return { ini, fin };
}

/** Junta las marcas de un día de una persona y las compara con su turno. */
function resumenDia(personalId, fecha, t, marcas, cfg, momentoAhora) {
  const entrada = marcas.find(m => m.tipo === 'entrada') || null;
  const salida = entrada ? marcas.find(m => m.tipo === 'salida' && m.entrada_id === entrada.id) || null : null;
  const h = t && t.tipo === 'trabajo' ? horarioTurno(t, fecha) : null;
  const retardo = entrada && h ? Math.max(0, minutos(entrada.momento) - minutos(h.ini)) : 0;
  const temprano = salida && h ? Math.max(0, minutos(h.fin) - minutos(salida.momento)) : 0;
  const trabajadas = entrada && salida ? Math.round((minutos(salida.momento) - minutos(entrada.momento)) / 6) / 10 : null;
  let estado;
  if (t && t.tipo === 'descanso' && !entrada) estado = 'descanso';
  else if (t?.ausencia && !entrada) estado = 'ausencia';
  else if (entrada && salida) estado = retardo > cfg.tolerancia ? 'retardo' : 'completo';
  else if (entrada) estado = retardo > cfg.tolerancia ? 'retardo_trabajando' : 'trabajando';
  else if (t?.tipo === 'trabajo') estado = h && momentoAhora < h.ini ? 'pendiente' : 'sin_entrada';
  else estado = 'sin_turno';
  const pub = (m) => m && { id: m.id, hora: m.momento.slice(11), momento: m.momento, manual: !!m.manual, distancia_m: m.distancia_m, nota: m.nota, registrado_por_nombre: m.registrado_por_nombre };
  return { fecha, turno: t, entrada: pub(entrada), salida: pub(salida), retardo_min: retardo, salida_temprano_min: temprano, horas: trabajadas, estado };
}

/**
 * Si según el horario hoy no le toca trabajar (descanso, falta/permiso o "/"), no tiene que marcar.
 * Si no hay horario hecho para ese día, sí puede marcar normal.
 */
function diaLibre(personalId, fecha, t) {
  if (t?.tipo === 'descanso') return { motivo: 'descanso', texto: 'Hoy es tu día de descanso. No tienes que marcar entrada ni salida.' };
  if (t?.ausencia) return { motivo: 'ausencia', texto: t.ausencia === 'falta' ? 'En el horario dice que hoy no vienes. No tienes que marcar.' : 'Hoy tienes permiso en el horario. No tienes que marcar entrada ni salida.' };
  if (!t) {
    const c = db.prepare('SELECT turno FROM hor_publicado WHERE personal_id = ? AND fecha = ?').get([personalId, fecha]);
    if (c && !c.turno) return { motivo: 'no_toca', texto: 'Hoy no te toca trabajar según el horario. No tienes que marcar entrada ni salida.' };
  }
  return null;
}

const perfilDe = (usuarioId) => db.prepare('SELECT * FROM personal WHERE usuario_id = ? AND activo = 1').get([usuarioId]);
/** Entrada sin salida de las últimas 20 horas. */
function entradaAbierta(personalId, momentoAhora) {
  const e = db.prepare(`SELECT * FROM asistencia a WHERE personal_id = ? AND tipo = 'entrada'
    AND NOT EXISTS (SELECT 1 FROM asistencia s WHERE s.entrada_id = a.id) ORDER BY momento DESC LIMIT 1`).get([personalId]);
  return e && minutos(momentoAhora) - minutos(e.momento) <= 20 * 60 ? e : null;
}

const enviarError = (res, err, msg) => {
  if (err.status) return res.status(err.status).json({ error: err.message, ...(err.libre ? { dia_libre: true } : {}) });
  console.error(msg, err);
  res.status(500).json({ error: msg });
};

router.use(requireAuth);

// GET /api/gestion/asistencia/config
router.get('/config', (req, res) => {
  const c = config();
  const puedeConfigurar = puede(req.usuario, 'asistencia', 'editar');
  const r = { ...c, puede_configurar: puedeConfigurar };
  delete r.avisos;
  delete r.url_app; delete r.por; delete r.en;
  res.json(r);
});

// PUT /api/gestion/asistencia/config  { lat, lng, radio, precision_max, tolerancia }
router.put('/config', requierePermiso('asistencia', 'editar'), (req, res) => {
  const b = req.body || {};
  try {
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw L.errorUsuario('La ubicación no es válida.');
    const radio = Math.min(1000, Math.max(30, Number(b.radio) || POR_DEFECTO.radio));
    const precision_max = Math.min(500, Math.max(20, Number(b.precision_max) || POR_DEFECTO.precision_max));
    const tolerancia = Math.min(60, Math.max(0, Number.isFinite(Number(b.tolerancia)) ? Number(b.tolerancia) : POR_DEFECTO.tolerancia));
    guardarConfig({ lat, lng, radio, precision_max, tolerancia, por: req.usuario.nombre || '', en: ahora().momento, url_app: urlApp(req) });
    const c = config(); delete c.url_app;
    res.json(c);
  } catch (err) { enviarError(res, err, 'No se pudo guardar la ubicación.') }
});

// GET /api/gestion/asistencia/mio  → mi turno de hoy, si tengo entrada abierta y mis últimos días
router.get('/mio', (req, res) => {
  try {
    const p = perfilDe(req.usuario.id);
    const cfg = config();
    if (!p) return res.json({ vinculado: false, configurado: cfg.configurado });
    const a = ahora();
    const abierta = entradaAbierta(p.id, a.momento);
    const desde = L.sumarDias(a.fecha, -30);
    const marcas = db.prepare('SELECT * FROM asistencia WHERE personal_id = ? AND fecha >= ? ORDER BY momento').all([p.id, desde]);
    const fechas = [...new Set([a.fecha, ...marcas.map(m => m.fecha)])].sort().reverse();
    const dias = fechas.map(f => resumenDia(p.id, f, turnoDePersonal(p.id, f), marcas.filter(m => m.fecha === f), cfg, a.momento));
    res.json({
      vinculado: true, nombre: p.nombre, configurado: cfg.configurado, radio: cfg.radio, ahora: a,
      siguiente: abierta ? 'salida' : 'entrada', abierta: abierta ? { hora: abierta.momento.slice(11), fecha: abierta.fecha } : null,
      // Día libre solo cuando no tiene una entrada abierta (si entró ayer al nocturno, igual marca su salida)
      libre: abierta ? null : diaLibre(p.id, a.fecha, turnoDePersonal(p.id, a.fecha)),
      hoy: dias.find(d => d.fecha === a.fecha), dias,
    });
  } catch (err) { enviarError(res, err, 'No se pudieron cargar tus entradas.') }
});

// POST /api/gestion/asistencia/marcar  { tipo, lat, lng, precision }
router.post('/marcar', (req, res) => {
  const b = req.body || {};
  try {
    const p = perfilDe(req.usuario.id);
    if (!p) throw L.errorUsuario('Tu cuenta no está vinculada con tu perfil del personal. Pídele a administración que la vincule.');
    const cfg = config();
    if (!cfg.configurado) throw L.errorUsuario('Administración todavía no configura la ubicación de la residencia.');
    const lat = Number(b.lat), lng = Number(b.lng), precision = Number(b.precision);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw L.errorUsuario('No se recibió tu ubicación. Activa la ubicación del teléfono e intenta otra vez.');
    if (!Number.isFinite(precision) || precision > cfg.precision_max) {
      throw L.errorUsuario(`La ubicación del teléfono no es precisa (±${Math.round(precision) || '?'} m). Activa el GPS, sal a un lugar abierto de la residencia y vuelve a intentar.`);
    }
    const dist = distancia({ lat, lng }, cfg);
    if (dist > cfg.radio) throw L.errorUsuario(`Estás a ${dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist} m`} de la residencia. Solo se puede marcar dentro de la residencia.`, 403);
    const a = ahora();
    const abierta = entradaAbierta(p.id, a.momento);
    const tipo = b.tipo === 'salida' ? 'salida' : 'entrada';
    if (tipo === 'entrada' && abierta) throw L.errorUsuario(`Ya tienes una entrada a las ${abierta.momento.slice(11)}. Ahora te toca marcar tu salida.`, 409);
    if (tipo === 'salida' && !abierta) throw L.errorUsuario('No tienes una entrada abierta. Marca primero tu entrada.', 409);
    if (tipo === 'entrada' && !b.aun_asi) {
      const libre = diaLibre(p.id, a.fecha, turnoDePersonal(p.id, a.fecha));
      if (libre) throw Object.assign(L.errorUsuario(libre.texto, 409), { libre: true });
    }
    const ultima = db.prepare('SELECT momento FROM asistencia WHERE personal_id = ? ORDER BY momento DESC LIMIT 1').get([p.id]);
    if (ultima && minutos(a.momento) - minutos(ultima.momento) < 2) throw L.errorUsuario('Acabas de marcar. Espera un momento.', 409);
    const fecha = tipo === 'salida' ? abierta.fecha : a.fecha;
    db.prepare(`INSERT INTO asistencia (personal_id, tipo, fecha, momento, lat, lng, precision_m, distancia_m, entrada_id, registrado_por_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run([p.id, tipo, fecha, a.momento, lat, lng, Math.round(precision), dist, tipo === 'salida' ? abierta.id : null, req.usuario.nombre || '']);
    const marcas = db.prepare('SELECT * FROM asistencia WHERE personal_id = ? AND fecha = ? ORDER BY momento').all([p.id, fecha]);
    const t = turnoDePersonal(p.id, fecha);
    const dia = resumenDia(p.id, fecha, t, marcas, cfg, a.momento);
    if (tipo === 'entrada' && dia.retardo_min > cfg.tolerancia) {
      try {
        avisar(cfg, 'retardo', p, {
          titulo: `${p.nombre} llegó ${textoMin(dia.retardo_min)} tarde`,
          texto: `Marcó su entrada a las ${hora12(a.hora)}; su turno (${t.etiqueta}) empezaba a las ${hora12(t.inicio)}.`,
          clave: `retardo:${p.id}:${fecha}`,
        });
      } catch (e) { console.error('Aviso de retardo', e) }
    }
    res.status(201).json({ tipo, hora: a.hora, distancia_m: dist, dia });
  } catch (err) { enviarError(res, err, 'No se pudo marcar.') }
});

// GET /api/gestion/asistencia/dia?fecha=  → todo el personal: turno, entrada, salida, retardo
router.get('/dia', requierePermiso('asistencia', 'ver'), (req, res) => {
  const fecha = L.esFecha(req.query.fecha) ? req.query.fecha : L.hoyMexico();
  try {
    const cfg = config();
    const a = ahora();
    const marcas = db.prepare('SELECT * FROM asistencia WHERE fecha = ? ORDER BY momento').all([fecha]);
    const conMarcas = new Set(marcas.map(m => m.personal_id));
    const personas = db.prepare(`SELECT * FROM personal ORDER BY seccion = 'nocturno', orden, nombre COLLATE NOCASE`).all()
      .filter(p => p.activo || conMarcas.has(p.id));
    const filas = personas.map(p => ({
      personal_id: p.id, nombre: p.nombre, puesto: p.puesto, seccion: p.seccion, vinculado: !!p.usuario_id,
      ...resumenDia(p.id, fecha, turnoDePersonal(p.id, fecha), marcas.filter(m => m.personal_id === p.id), cfg, a.momento),
    })).filter(f => f.turno || f.entrada);
    const cuenta = (e) => filas.filter(f => e.includes(f.estado)).length;
    res.json({
      fecha, hoy: a.fecha, configurado: cfg.configurado, tolerancia: cfg.tolerancia, filas,
      resumen: {
        programados: filas.filter(f => f.turno?.tipo === 'trabajo' && !f.turno.ausencia).length,
        llegaron: cuenta(['completo', 'retardo', 'trabajando', 'retardo_trabajando']),
        retardos: cuenta(['retardo', 'retardo_trabajando']), sin_entrada: cuenta(['sin_entrada']), trabajando: cuenta(['trabajando', 'retardo_trabajando']),
      },
    });
  } catch (err) { enviarError(res, err, 'No se pudo cargar el registro del día.') }
});

// POST /api/gestion/asistencia/manual  { personal_id, fecha, tipo, hora, nota }  → cuando alguien no pudo marcar
router.post('/manual', requierePermiso('asistencia', 'crear'), (req, res) => {
  const b = req.body || {};
  try {
    const p = db.prepare('SELECT * FROM personal WHERE id = ?').get([Number(b.personal_id)]);
    if (!p) throw L.errorUsuario('Esa persona no existe.');
    if (!L.esFecha(b.fecha) || !L.esHora(b.hora)) throw L.errorUsuario('Pon el día y la hora.');
    const nota = L.texto(b.nota, 200);
    if (!nota) throw L.errorUsuario('Escribe por qué se pone a mano (por ejemplo: se le acabó la pila).');
    const tipo = b.tipo === 'salida' ? 'salida' : 'entrada';
    const marcas = db.prepare('SELECT * FROM asistencia WHERE personal_id = ? AND fecha = ? ORDER BY momento').all([p.id, b.fecha]);
    const entrada = marcas.find(m => m.tipo === 'entrada');
    let momento = `${b.fecha} ${b.hora}`, entradaId = null;
    if (tipo === 'entrada') {
      if (entrada) throw L.errorUsuario(`Ese día ya tiene entrada a las ${entrada.momento.slice(11)}.`, 409);
    } else {
      if (!entrada) throw L.errorUsuario('Primero pon la entrada de ese día.');
      if (marcas.some(m => m.tipo === 'salida')) throw L.errorUsuario('Ese día ya tiene salida.', 409);
      if (b.hora <= entrada.momento.slice(11)) momento = `${L.sumarDias(b.fecha, 1)} ${b.hora}`;   // salió al día siguiente (nocturno)
      entradaId = entrada.id;
    }
    if (momento > ahora().momento) throw L.errorUsuario('No se puede poner una hora que todavía no pasa.');
    db.prepare(`INSERT INTO asistencia (personal_id, tipo, fecha, momento, entrada_id, manual, nota, registrado_por_nombre) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
      .run([p.id, tipo, b.fecha, momento, entradaId, nota, req.usuario.nombre || '']);
    res.status(201).json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo guardar.') }
});

// DELETE /api/gestion/asistencia/:id  → quita una marca (si es entrada, también su salida)
router.delete('/:id(\\d+)', requierePermiso('asistencia', 'eliminar'), (req, res) => {
  try {
    const m = db.prepare('SELECT * FROM asistencia WHERE id = ?').get([Number(req.params.id)]);
    if (!m) return res.status(404).json({ error: 'No se encontró esa marca.' });
    db.prepare('DELETE FROM asistencia WHERE id = ? OR entrada_id = ?').run([m.id, m.id]);
    res.json({ ok: true });
  } catch (err) { enviarError(res, err, 'No se pudo quitar.') }
});

// GET /api/gestion/asistencia/laborados?desde=&hasta=  → días laborados de cada persona (control administrativo)
// Cruza el horario guardado (lo programado) con las entradas y salidas (lo que de verdad pasó).
// Quien no tiene cuenta no puede marcar: sus días se cuentan según el horario.
router.get('/laborados', requierePermiso('asistencia', 'ver'), (req, res) => {
  try {
    const a = ahora();
    let desde = L.esFecha(req.query.desde) ? req.query.desde : `${a.fecha.slice(0, 7)}-01`;
    let hasta = L.esFecha(req.query.hasta) ? req.query.hasta : a.fecha;
    if (hasta < desde) [desde, hasta] = [hasta, desde];
    if (L.diasEntre(desde, hasta) > 92) throw L.errorUsuario('Elige un periodo de máximo 3 meses.');
    const cfg = config();
    const fechas = [];
    for (let f = desde; f <= hasta; f = L.sumarDias(f, 1)) fechas.push(f);
    const marcas = db.prepare('SELECT * FROM asistencia WHERE fecha >= ? AND fecha <= ? ORDER BY momento').all([desde, hasta]);
    const conAlgo = new Set([
      ...marcas.map(m => m.personal_id),
      ...db.prepare('SELECT DISTINCT personal_id FROM hor_publicado WHERE fecha >= ? AND fecha <= ?').all([desde, hasta]).map(r => r.personal_id),
    ]);
    const personas = db.prepare(`SELECT * FROM personal ORDER BY seccion = 'nocturno', orden, nombre COLLATE NOCASE`).all().filter(p => p.activo || conAlgo.has(p.id));
    const r1 = (x) => Math.round(x * 10) / 10;
    const filas = personas.map(p => {
      const vinculado = !!p.usuario_id;
      const tot = { programados: 0, laborados: 0, faltas: 0, retardos: 0, descansos: 0, extra: 0, horas_programadas: 0, horas: 0, sin_salida: 0 };
      const dias = [];
      for (const f of fechas) {
        const t = turnoDePersonal(p.id, f);
        const mias = marcas.filter(m => m.personal_id === p.id && m.fecha === f);
        const d = resumenDia(p.id, f, t, mias, cfg, a.momento);
        const programado = t?.tipo === 'trabajo' && !['falta', 'permiso'].includes(t.ausencia);
        const h = programado ? horarioTurno(t, f) : null;
        const termino = !h || h.fin <= a.momento;       // el turno ya terminó (para contar faltas)
        let estado;
        if (d.entrada) {
          tot.laborados++;
          tot.horas += d.horas || 0;
          if (!d.salida && termino) tot.sin_salida++;
          if (!programado) { tot.extra++; estado = 'extra' }
          else if (d.retardo_min > cfg.tolerancia) { tot.retardos++; estado = 'retardo' }
          else estado = 'laboro';
        } else if (programado) {
          if (!vinculado) { if (f <= a.fecha) { tot.laborados++; tot.horas += t.horas || 0 } estado = 'segun_horario' }
          else if (f < a.fecha || (f === a.fecha && termino)) { tot.faltas++; estado = 'falta' }
          else estado = 'pendiente';
        } else if (t?.tipo === 'descanso') { tot.descansos++; estado = 'descanso' }
        else if (t?.ausencia) estado = 'permiso';
        else estado = t ? 'no_toca' : 'sin_horario';
        if (programado) { tot.programados++; tot.horas_programadas += t.horas || 0 }
        dias.push({ fecha: f, turno: t ? (t.tipo === 'descanso' ? 'D' : t.etiqueta) : '', estado,
          entrada: d.entrada?.hora || '', salida: d.salida?.hora || '', horas: d.horas, retardo_min: d.retardo_min, manual: !!(d.entrada?.manual || d.salida?.manual) });
      }
      return { personal_id: p.id, nombre: p.nombre, puesto: p.puesto, seccion: p.seccion, vinculado, activo: !!p.activo,
        ...tot, horas: r1(tot.horas), horas_programadas: r1(tot.horas_programadas), dias };
    });
    res.json({ desde, hasta, hoy: a.fecha, tolerancia: cfg.tolerancia, filas });
  } catch (err) { enviarError(res, err, 'No se pudieron calcular los días laborados.') }
});

// ── Revisión periódica: quién no ha marcado su entrada ya pasada la tolerancia ──
function textoMin(m) { return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min` }
function hora12(h) { if (!h) return ''; const [x, y] = h.split(':').map(Number); return `${x % 12 || 12}:${String(y).padStart(2, '0')} ${x < 12 ? 'am' : 'pm'}` }

function revisarSinMarcar() {
  const cfg = config();
  if (!cfg.configurado || !destinatariosDe('sin_marcar').length) return 0;
  const a = ahora();
  let n = 0;
  // Solo perfiles con cuenta (los demás no pueden marcar desde la app)
  const personas = db.prepare('SELECT * FROM personal WHERE activo = 1 AND usuario_id IS NOT NULL').all();
  for (const fecha of [L.sumarDias(a.fecha, -1), a.fecha]) {
    for (const p of personas) {
      const t = turnoDePersonal(p.id, fecha);
      if (!t || t.tipo !== 'trabajo' || t.ausencia) continue;
      const h = horarioTurno(t, fecha);
      if (!h) continue;
      const tarde = minutos(a.momento) - minutos(h.ini);
      // Pasada la tolerancia y dentro de las primeras 4 horas (no se avisa de turnos viejos)
      if (tarde <= cfg.tolerancia || tarde > 240) continue;
      if (db.prepare("SELECT 1 FROM asistencia WHERE personal_id = ? AND fecha = ? AND tipo = 'entrada'").get([p.id, fecha])) continue;
      n += avisar(cfg, 'sin_marcar', p, {
        titulo: `${p.nombre} no ha marcado su entrada`,
        texto: `Su turno (${t.etiqueta}) empezó a las ${hora12(t.inicio)} y lleva ${textoMin(tarde)} sin marcar.`,
        clave: `sin_marcar:${p.id}:${fecha}`,
      });
    }
  }
  return n;
}
const revisar = () => { try { revisarSinMarcar() } catch (e) { console.error('Revisión de entradas', e) } };
setTimeout(revisar, 30 * 1000).unref?.();
setInterval(revisar, 3 * 60 * 1000).unref?.();

module.exports = router;
module.exports.revisarSinMarcar = revisarSinMarcar;
