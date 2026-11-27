// Medicación (Fase 1): catálogo único, rondas configurables, prescripciones con versiones,
// alergias y existencias por dueño (familia del residente o la residencia).
//
// Reglas que se cuidan aquí:
// - Un solo catálogo: el medicamento ES el producto del inventario. Se avisa de posibles duplicados.
// - Cambiar dosis, horario o días de una prescripción crea una versión nueva; la anterior queda
//   "reemplazada" con su fecha de fin. Nada clínico se borra.
// - Las existencias son la suma de movimientos; nunca se edita la cantidad sin un movimiento.
// - Fechas y horas en la zona de México.
//
// Las tablas se crean aquí para que el módulo sea autocontenido.
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth } = require('./auth');
const { requierePermiso, puede } = require('../permisos');
const L = require('../medicacion/logica');

// ── Tablas ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS med_catalogo (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    principio_activo  TEXT NOT NULL,
    nombre_comercial  TEXT DEFAULT '',
    concentracion     TEXT DEFAULT '',
    forma             TEXT NOT NULL,
    unidad_dosis      TEXT NOT NULL,
    unidad_stock      TEXT NOT NULL,
    factor_conversion REAL NOT NULL DEFAULT 1,
    permite_fraccion  INTEGER NOT NULL DEFAULT 0,
    controlado        INTEGER NOT NULL DEFAULT 0,
    en_pastillero     INTEGER NOT NULL DEFAULT 1,
    activo            INTEGER NOT NULL DEFAULT 1,
    clave             TEXT NOT NULL UNIQUE,
    creado_por        INTEGER,
    creado_en         TEXT DEFAULT (datetime('now')),
    actualizado_en    TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS med_ronda_def (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    detalle     TEXT DEFAULT '',
    hora_inicio TEXT NOT NULL,
    hora_fin    TEXT NOT NULL,
    orden       INTEGER NOT NULL DEFAULT 0,
    activa      INTEGER NOT NULL DEFAULT 1
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS med_prescripciones (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    residente_id       INTEGER NOT NULL,
    medicamento_id     INTEGER NOT NULL,
    tipo               TEXT NOT NULL,                 -- fija | prn | variable
    tratamiento_id     INTEGER,                       -- Fase 3
    dosis              REAL,
    via                TEXT DEFAULT 'oral',
    horarios           TEXT NOT NULL DEFAULT '[]',    -- [{ ronda_id, hora }]
    dias_modo          TEXT NOT NULL DEFAULT 'todos', -- todos | semana | cada_n
    dias_semana        TEXT DEFAULT '',               -- 0=domingo … 6=sábado
    cada_n_dias        INTEGER,
    fecha_ancla        TEXT DEFAULT '',
    fecha_inicio       TEXT NOT NULL,
    fecha_fin          TEXT DEFAULT '',
    fecha_revision     TEXT DEFAULT '',
    indicaciones       TEXT DEFAULT '',
    provee             TEXT NOT NULL DEFAULT 'familia',
    medico             TEXT DEFAULT '',
    prn_motivo         TEXT DEFAULT '',
    prn_max_24h        REAL,
    prn_intervalo_h    REAL,
    escala             TEXT DEFAULT '',
    medicion_requerida TEXT DEFAULT '',
    estado             TEXT NOT NULL DEFAULT 'activa', -- activa | suspendida | terminada | reemplazada
    reemplaza_a_id     INTEGER,
    motivo_cambio      TEXT DEFAULT '',
    motivo_cierre      TEXT DEFAULT '',
    creado_por         INTEGER,
    creado_por_nombre  TEXT DEFAULT '',
    creado_en          TEXT DEFAULT (datetime('now')),
    cerrado_por_nombre TEXT DEFAULT '',
    cerrado_en         TEXT DEFAULT '',
    FOREIGN KEY (residente_id) REFERENCES residentes(id) ON DELETE CASCADE,
    FOREIGN KEY (medicamento_id) REFERENCES med_catalogo(id)
  )
`);
// Inventario: la existencia es la suma de movimientos. residente_id NULL = de la residencia.
db.exec(`
  CREATE TABLE IF NOT EXISTS med_stock_mov (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    medicamento_id  INTEGER NOT NULL,
    residente_id    INTEGER,
    tipo            TEXT NOT NULL,  -- entrada | salida_toma | devolucion | desecho | ajuste_inventario | prestamo_salida | prestamo_entrada
    cantidad        REAL NOT NULL,  -- en unidad de dosis; positiva suma, negativa descuenta
    motivo          TEXT DEFAULT '',
    lote            TEXT DEFAULT '',
    caducidad       TEXT DEFAULT '',
    origen          TEXT DEFAULT '',
    registro_toma_id INTEGER,
    usuario_id      INTEGER,
    usuario_nombre  TEXT DEFAULT '',
    creado_en       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (medicamento_id) REFERENCES med_catalogo(id)
  )
`);
db.exec(`CREATE TABLE IF NOT EXISTS med_config (clave TEXT PRIMARY KEY, valor TEXT)`);
try { db.exec(`ALTER TABLE residentes ADD COLUMN alergias TEXT DEFAULT ''`) } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_presc_res ON med_prescripciones (residente_id, estado)') } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_stock_med ON med_stock_mov (medicamento_id, residente_id)') } catch {}

function transaccion(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r }
  catch (err) { try { db.exec('ROLLBACK') } catch {} throw err }
}

// Rondas iniciales
if (!db.get('SELECT COUNT(*) AS n FROM med_ronda_def').n) {
  for (const r of L.RONDAS_INICIALES) {
    db.prepare('INSERT INTO med_ronda_def (nombre, detalle, hora_inicio, hora_fin, orden) VALUES (?, ?, ?, ?, ?)')
      .run([r.nombre, r.detalle, r.hora_inicio, r.hora_fin, r.orden]);
  }
}

// ── Paso único de los datos del módulo anterior (med_medicamentos) ───────────
// Las tablas viejas no se borran. Se ejecuta una sola vez.
(function migrarModuloAnterior() {
  if (db.get("SELECT valor FROM med_config WHERE clave = 'migracion_v1'")) return;
  const existe = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'med_medicamentos'");
  const viejos = existe ? db.prepare('SELECT * FROM med_medicamentos ORDER BY id').all() : [];
  const rondas = db.prepare('SELECT * FROM med_ronda_def ORDER BY orden').all();
  const porNombre = Object.fromEntries(rondas.map(r => [r.nombre, r.id]));
  const TOMA = { ayunas: ['Mañana', '06:30'], desayuno: ['Mañana', '08:00'], comida: ['Tarde', '14:00'], cena: ['Noche', '19:00'], dormir: ['Noche', '21:00'] };
  const FORMA_DE = { tableta: 'tableta', 'cápsula': 'capsula', ml: 'jarabe', gotas: 'gotas', sobre: 'sobre', parche: 'parche', 'inyección': 'inyectable', disparo: 'inhalador', pieza: 'otro' };
  transaccion(() => {
    for (const v of viejos) {
      const m = String(v.nombre).match(/^(.*?)\s+(\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|ui|%)(?:\s*\/\s*\d*\s*(?:ml|g))?)\s*$/i);
      const med = L.validarMedicamento({ principio_activo: m ? m[1] : v.nombre, concentracion: m ? m[2] : '', forma: FORMA_DE[v.unidad] || 'otro' });
      const clave = L.claveCatalogo(med);
      let cat = db.prepare('SELECT id FROM med_catalogo WHERE clave = ?').get([clave]);
      if (!cat) {
        const r = db.prepare(`INSERT INTO med_catalogo (principio_activo, nombre_comercial, concentracion, forma, unidad_dosis, unidad_stock,
          factor_conversion, permite_fraccion, controlado, en_pastillero, clave) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run([med.principio_activo, '', med.concentracion, med.forma, med.unidad_dosis, med.unidad_stock, med.factor_conversion,
            v.dosis % 1 ? 1 : med.permite_fraccion, 0, med.en_pastillero, clave]);
        cat = { id: Number(r.lastInsertRowid) };
      }
      const horarios = String(v.tomas || '').split(',').filter(t => TOMA[t]).map(t => ({ ronda_id: porNombre[TOMA[t][0]], hora: TOMA[t][1] })).filter(h => h.ronda_id);
      const prn = v.prn || !horarios.length;
      db.prepare(`INSERT INTO med_prescripciones (residente_id, medicamento_id, tipo, dosis, via, horarios, fecha_inicio, fecha_fin,
        indicaciones, provee, medico, prn_motivo, estado, motivo_cambio, creado_por_nombre)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'familia', ?, ?, ?, 'Pasado del módulo anterior', 'Sistema')`)
        .run([v.residente_id, cat.id, prn ? 'prn' : 'fija', v.dosis, L.VIA_DE_FORMA[med.forma] || 'oral', JSON.stringify(prn ? [] : horarios),
          v.fecha_inicio || String(v.creado_en || '').slice(0, 10) || L.hoyMexico(), v.fecha_fin || '', L.texto(v.indicaciones, 200), v.medico || '',
          prn ? (L.texto(v.indicaciones, 120) || 'Si hace falta') : '', v.activo ? 'activa' : 'suspendida']);
      if (v.existencia) {
        db.prepare(`INSERT INTO med_stock_mov (medicamento_id, residente_id, tipo, cantidad, motivo, usuario_nombre)
          VALUES (?, ?, 'ajuste_inventario', ?, 'Existencia pasada del módulo anterior', 'Sistema')`).run([cat.id, v.residente_id, v.existencia]);
      }
    }
    db.prepare("INSERT INTO med_config (clave, valor) VALUES ('migracion_v1', ?)").run([`${viejos.length} medicamentos · ${new Date().toISOString()}`]);
  });
  if (viejos.length) console.log(`[Medicación] Se pasaron ${viejos.length} medicamentos del módulo anterior al catálogo nuevo.`);
})();

router.use(requireAuth);

// ── Lecturas comunes ─────────────────────────────────────────────────────────
const rondasDef = () => db.prepare('SELECT * FROM med_ronda_def ORDER BY orden, hora_inicio').all();
const catalogoPorId = (id) => db.prepare('SELECT * FROM med_catalogo WHERE id = ?').get([Number(id)]);
const quien = (req) => [req.usuario.id, req.usuario.nombre || ''];
const prescribe = (req) => puede(req.usuario, 'prescripciones', 'editar');

function enviarError(res, err, mensaje) {
  if (err.status) return res.status(err.status).json({ error: err.message, ...(err.avisos ? { avisos: err.avisos } : {}) });
  console.error(mensaje, err);
  res.status(500).json({ error: mensaje });
}

function existencia(medicamentoId, residenteId) {
  return L.redondear(db.get(
    `SELECT COALESCE(SUM(cantidad), 0) AS n FROM med_stock_mov WHERE medicamento_id = ? AND ${residenteId ? 'residente_id = ?' : 'residente_id IS NULL'}`,
    residenteId ? [medicamentoId, residenteId] : [medicamentoId]).n);
}

const SELECT_PRESC = `
  SELECT p.*, c.principio_activo, c.nombre_comercial, c.concentracion, c.forma, c.unidad_dosis, c.unidad_stock,
         c.factor_conversion, c.permite_fraccion, c.controlado, c.en_pastillero,
         r.nombre AS residente_nombre, r.iniciales AS residente_iniciales
  FROM med_prescripciones p
  JOIN med_catalogo c ON c.id = p.medicamento_id
  JOIN residentes r ON r.id = p.residente_id`;

/** Prescripción lista para la pantalla: horarios, texto, existencia y días restantes */
function presentar(p, rondas = rondasDef(), hoy = L.hoyMexico()) {
  const out = { ...p, horarios: L.horariosDe(p), dias_semana: L.diasSemanaDe(p) };
  out.nombre = L.nombreMedicamento(p);
  out.texto = L.textoPrescripcion(out, p, rondas, hoy);
  out.consumo_diario = L.consumoDiario(out);
  const dueno = p.provee === 'centro' ? null : p.residente_id;
  out.existencia = existencia(p.medicamento_id, dueno);
  out.existencia_texto = L.existenciaLegible(out.existencia, p);
  // días restantes: el consumo de todas las prescripciones activas que comparten ese inventario
  const comparten = db.prepare(`SELECT * FROM med_prescripciones WHERE medicamento_id = ? AND estado = 'activa'
    AND ${dueno ? "provee = 'familia' AND residente_id = ?" : "provee = 'centro'"}`).all(dueno ? [p.medicamento_id, dueno] : [p.medicamento_id]);
  out.consumo_inventario = L.redondear(comparten.reduce((n, x) => n + L.consumoDiario(x), 0));
  out.dias_restantes = L.diasRestantes(out.existencia, out.consumo_inventario);
  out.aplica_hoy = L.aplicaEnFecha(out, hoy);
  out.es_nueva = p.estado === 'activa' && L.diasEntre(String(p.creado_en || '').slice(0, 10) || hoy, hoy) <= 2;
  return out;
}

/** Avisos antes de guardar: alergia, mismo principio activo, existencia */
function avisosDe(datos, med, residente, excluirId = null) {
  const avisos = [];
  const alergias = String(residente.alergias || '');
  if (alergias.trim()) {
    const palabras = alergias.split(/[,;/.\n]|\s+y\s+/i).map(L.normalizar).filter(s => s.length >= 3);
    const nombres = [med.principio_activo, med.nombre_comercial].filter(Boolean).map(L.normalizar);
    const choca = palabras.find(a => nombres.some(n => n.includes(a) || a.includes(n.split(' ')[0])));
    if (choca) avisos.push({ tipo: 'alergia', grave: true, texto: `${residente.nombre} tiene registrada alergia a "${choca}".` });
  }
  const mismos = db.prepare(`${SELECT_PRESC} WHERE p.residente_id = ? AND p.estado = 'activa' AND p.id != ?`).all([residente.id, excluirId || 0])
    .filter(x => L.normalizar(x.principio_activo) === L.normalizar(med.principio_activo));
  for (const x of mismos) {
    const diasDistintos = datos.dias_modo === 'semana' && x.dias_modo === 'semana'
      && !L.diasSemanaDe(datos).some(d => L.diasSemanaDe(x).includes(d));
    if (!diasDistintos) {
      avisos.push({ tipo: 'duplicado', grave: true, texto: `Ya tiene ${L.nombreMedicamento(x)} activo (${L.textoPrescripcion(presentar(x), x, rondasDef()).split(' — ')[1]})` });
    }
  }
  const dueno = datos.provee === 'centro' ? null : residente.id;
  const hay = existencia(med.id, dueno);
  const otras = db.prepare(`SELECT * FROM med_prescripciones WHERE medicamento_id = ? AND estado = 'activa' AND id != ?
    AND ${dueno ? "provee = 'familia' AND residente_id = ?" : "provee = 'centro'"}`).all(dueno ? [med.id, excluirId || 0, dueno] : [med.id, excluirId || 0]);
  const consumo = L.consumoDiario({ ...datos }) + otras.reduce((n, x) => n + L.consumoDiario(x), 0);
  const dias = L.diasRestantes(hay, consumo);
  const deQuien = dueno ? 'de la familia' : 'de la residencia';
  if (datos.tipo === 'prn') avisos.push({ tipo: 'stock', texto: `Hay ${L.existenciaLegible(hay, med)} ${deQuien}.` });
  else if (hay <= 0) avisos.push({ tipo: 'stock', grave: false, texto: `No hay existencias ${deQuien}. Registra la entrada cuando llegue.` });
  else avisos.push({ tipo: 'stock', texto: `Hay ${L.existenciaLegible(hay, med)} ${deQuien}${dias != null ? `, alcanzan para ${dias} ${dias === 1 ? 'día' : 'días'}` : ''}.` });
  return avisos;
}

// ── Opciones para los formularios ────────────────────────────────────────────
router.get('/opciones', requierePermiso('medicacion', 'ver'), (req, res) => {
  res.json({
    formas: L.FORMAS, unidades: L.UNIDADES, unidades_dosis: L.UNIDADES_DOSIS, unidades_stock: L.UNIDADES_STOCK,
    vias: L.VIAS, tipos: L.TIPOS, provee: L.PROVEE, mediciones: L.MEDICIONES,
    hoy: L.hoyMexico(), ahora: L.ahoraMexico().hora, puede_prescribir: prescribe(req), puede_operar: puede(req.usuario, 'medicacion', 'editar'),
  });
});

// ── Residentes ───────────────────────────────────────────────────────────────
router.get('/residentes', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    res.json(db.prepare(`SELECT r.id, r.nombre, r.iniciales, r.foto, r.habitacion, r.ubicacion, r.tipo_servicio, r.alergias,
      (SELECT COUNT(*) FROM med_prescripciones p WHERE p.residente_id = r.id AND p.estado = 'activa') AS activas
      FROM residentes r ORDER BY r.nombre COLLATE NOCASE`).all());
  } catch (err) { enviarError(res, err, 'No se pudieron cargar los residentes.') }
});

router.patch('/residentes/:id/alergias', requierePermiso('prescripciones', 'editar'), (req, res) => {
  try {
    const r = db.prepare('UPDATE residentes SET alergias = ? WHERE id = ?').run([L.texto(req.body?.alergias, 300), Number(req.params.id)]);
    if (!r.changes) return res.status(404).json({ error: 'Residente no encontrado.' });
    res.json({ ok: true, alergias: L.texto(req.body?.alergias, 300) });
  } catch (err) { enviarError(res, err, 'No se pudieron guardar las alergias.') }
});

// ── Rondas ───────────────────────────────────────────────────────────────────
router.get('/rondas', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    const rondas = rondasDef();
    const ahora = L.ahoraMexico();
    res.json({ rondas, actual: L.rondaDeHora(rondas, ahora.hora)?.id || null, hoy: ahora.fecha, hora: ahora.hora });
  } catch (err) { enviarError(res, err, 'No se pudieron cargar las rondas.') }
});

router.put('/rondas', requierePermiso('prescripciones', 'editar'), (req, res) => {
  try {
    const nuevas = L.validarRondas(req.body?.rondas);
    const actuales = rondasDef();
    // No se puede quitar ni desactivar una ronda que usan prescripciones activas; tampoco dejar sus horas fuera
    const activas = db.prepare("SELECT * FROM med_prescripciones WHERE estado = 'activa' AND tipo != 'prn'").all();
    for (const r of actuales) {
      const n = nuevas.find(x => x.id === r.id);
      const usan = activas.filter(p => L.horariosDe(p).some(h => h.ronda_id === r.id));
      if (!usan.length) continue;
      if (!n || !n.activa) throw L.errorUsuario(`La ronda "${r.nombre}" la usan ${usan.length} prescripciones activas. Cámbialas antes de quitarla.`);
      for (const p of usan) for (const h of L.horariosDe(p)) {
        if (h.ronda_id === r.id && h.hora && (L.minutos(h.hora) < L.minutos(n.hora_inicio) || L.minutos(h.hora) > L.minutos(n.hora_fin))) {
          throw L.errorUsuario(`Con ese horario, una toma de las ${h.hora} quedaría fuera de la ronda "${n.nombre}".`);
        }
      }
    }
    transaccion(() => {
      const ids = new Set(nuevas.filter(n => n.id).map(n => n.id));
      for (const r of actuales) if (!ids.has(r.id)) db.prepare('UPDATE med_ronda_def SET activa = 0 WHERE id = ?').run([r.id]);
      for (const n of nuevas) {
        if (n.id && actuales.some(a => a.id === n.id)) {
          db.prepare('UPDATE med_ronda_def SET nombre = ?, detalle = ?, hora_inicio = ?, hora_fin = ?, orden = ?, activa = ? WHERE id = ?')
            .run([n.nombre, n.detalle, n.hora_inicio, n.hora_fin, n.orden, n.activa, n.id]);
        } else {
          db.prepare('INSERT INTO med_ronda_def (nombre, detalle, hora_inicio, hora_fin, orden, activa) VALUES (?, ?, ?, ?, ?, ?)')
            .run([n.nombre, n.detalle, n.hora_inicio, n.hora_fin, n.orden, n.activa]);
        }
      }
    });
    res.json({ rondas: rondasDef() });
  } catch (err) { enviarError(res, err, 'No se pudieron guardar las rondas.') }
});

// ── Catálogo ─────────────────────────────────────────────────────────────────
router.get('/catalogo', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    const filas = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM med_prescripciones p WHERE p.medicamento_id = c.id AND p.estado = 'activa') AS en_uso
      FROM med_catalogo c ${req.query.todos ? '' : 'WHERE c.activo = 1'} ORDER BY c.principio_activo COLLATE NOCASE, c.concentracion`).all();
    const q = L.normalizar(req.query.q || '');
    res.json((q ? filas.filter(c => L.normalizar(`${c.principio_activo} ${c.nombre_comercial} ${c.concentracion}`).includes(q)) : filas)
      .map(c => ({ ...c, nombre: L.nombreMedicamento(c) })));
  } catch (err) { enviarError(res, err, 'No se pudo cargar el catálogo.') }
});

router.post('/catalogo/similares', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    const todos = db.prepare('SELECT * FROM med_catalogo').all();
    res.json(L.similares(todos, req.body || {}, req.body?.id ? Number(req.body.id) : null).map(c => ({ ...c, nombre: L.nombreMedicamento(c) })));
  } catch (err) { enviarError(res, err, 'No se pudieron buscar duplicados.') }
});

function guardarMedicamento(req, id = null) {
  const m = L.validarMedicamento(req.body || {});
  const clave = L.claveCatalogo(m);
  const igual = db.prepare('SELECT * FROM med_catalogo WHERE clave = ? AND id != ?').get([clave, id || 0]);
  if (igual) throw L.errorUsuario(`Ya existe "${L.nombreMedicamento(igual)}" (${L.FORMA[igual.forma].label.toLowerCase()}) en el catálogo.`, 409, { existente: igual });
  if (!req.body?.confirmar_similar) {
    const sim = L.similares(db.prepare('SELECT * FROM med_catalogo').all(), m, id);
    if (sim.length) {
      throw L.errorUsuario('Hay medicamentos parecidos en el catálogo. Revisa que no sea el mismo.', 409,
        { similares: sim.map(c => ({ ...c, nombre: L.nombreMedicamento(c) })) });
    }
  }
  if (id) {
    const previo = catalogoPorId(id);
    if (!previo) throw L.errorUsuario('Medicamento no encontrado.', 404);
    const usa = db.get('SELECT COUNT(*) AS n FROM med_stock_mov WHERE medicamento_id = ?', [id]).n;
    if (usa && (previo.unidad_dosis !== m.unidad_dosis)) throw L.errorUsuario('Ya tiene existencias registradas: no se puede cambiar la unidad de dosis.');
    db.prepare(`UPDATE med_catalogo SET principio_activo = ?, nombre_comercial = ?, concentracion = ?, forma = ?, unidad_dosis = ?, unidad_stock = ?,
      factor_conversion = ?, permite_fraccion = ?, controlado = ?, en_pastillero = ?, clave = ?, actualizado_en = datetime('now') WHERE id = ?`)
      .run([m.principio_activo, m.nombre_comercial, m.concentracion, m.forma, m.unidad_dosis, m.unidad_stock, m.factor_conversion,
        m.permite_fraccion, m.controlado, m.en_pastillero, clave, id]);
    return id;
  }
  const r = db.prepare(`INSERT INTO med_catalogo (principio_activo, nombre_comercial, concentracion, forma, unidad_dosis, unidad_stock,
    factor_conversion, permite_fraccion, controlado, en_pastillero, clave, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run([m.principio_activo, m.nombre_comercial, m.concentracion, m.forma, m.unidad_dosis, m.unidad_stock, m.factor_conversion,
      m.permite_fraccion, m.controlado, m.en_pastillero, clave, req.usuario.id]);
  return Number(r.lastInsertRowid);
}

const conNombre = (c) => ({ ...c, nombre: L.nombreMedicamento(c) });
router.post('/catalogo', requierePermiso('prescripciones', 'crear'), (req, res) => {
  try { res.status(201).json(conNombre(catalogoPorId(guardarMedicamento(req)))) }
  catch (err) { if (err.similares || err.existente) return res.status(409).json({ error: err.message, similares: err.similares, existente: err.existente }); enviarError(res, err, 'No se pudo guardar el medicamento.') }
});
router.put('/catalogo/:id', requierePermiso('prescripciones', 'editar'), (req, res) => {
  try { res.json(conNombre(catalogoPorId(guardarMedicamento(req, Number(req.params.id))))) }
  catch (err) { if (err.similares || err.existente) return res.status(409).json({ error: err.message, similares: err.similares, existente: err.existente }); enviarError(res, err, 'No se pudo guardar el medicamento.') }
});
router.patch('/catalogo/:id/activo', requierePermiso('prescripciones', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  try {
    if (!req.body?.activo && db.get("SELECT COUNT(*) AS n FROM med_prescripciones WHERE medicamento_id = ? AND estado = 'activa'", [id]).n) {
      return res.status(409).json({ error: 'Hay prescripciones activas con este medicamento. Suspéndelas primero.' });
    }
    db.prepare("UPDATE med_catalogo SET activo = ?, actualizado_en = datetime('now') WHERE id = ?").run([req.body?.activo ? 1 : 0, id]);
    res.json(conNombre(catalogoPorId(id)));
  } catch (err) { enviarError(res, err, 'No se pudo actualizar el medicamento.') }
});

// ── Prescripciones ───────────────────────────────────────────────────────────
// GET /prescripciones?residente_id=&estado=activas|todas
router.get('/prescripciones', requierePermiso('medicacion', 'ver'), (req, res) => {
  const where = [], params = [];
  if (req.query.residente_id) { where.push('p.residente_id = ?'); params.push(Number(req.query.residente_id)) }
  if (req.query.estado !== 'todas') where.push("p.estado = 'activa'");
  try {
    const rondas = rondasDef(), hoy = L.hoyMexico();
    const filas = db.prepare(`${SELECT_PRESC} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.estado = 'activa' DESC, c.principio_activo COLLATE NOCASE, p.id DESC`).all(params);
    res.json(filas.map(p => presentar(p, rondas, hoy)));
  } catch (err) { enviarError(res, err, 'No se pudieron cargar las prescripciones.') }
});

function prepararPrescripcion(body, excluirId) {
  const residente = db.prepare('SELECT id, nombre, alergias FROM residentes WHERE id = ?').get([Number(body.residente_id)]);
  if (!residente) throw L.errorUsuario('Residente no encontrado.', 404);
  const med = catalogoPorId(body.medicamento_id);
  if (med && !med.activo) throw L.errorUsuario('Ese medicamento está dado de baja en el catálogo.');
  const datos = L.validarPrescripcion(body, med, rondasDef());
  return { residente, med, datos, avisos: avisosDe(datos, med, residente, excluirId) };
}

// POST /prescripciones/revisar → vista previa y avisos sin guardar
router.post('/prescripciones/revisar', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    const { med, datos, avisos } = prepararPrescripcion(req.body || {}, req.body?.id);
    res.json({ texto: L.textoPrescripcion(datos, med, rondasDef()), avisos });
  } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : 'No se pudo revisar.' }) }
});

function insertarPrescripcion(residenteId, datos, req, extra = {}) {
  const cols = { residente_id: residenteId, ...datos, ...extra, creado_por: req.usuario.id, creado_por_nombre: req.usuario.nombre || '' };
  const k = Object.keys(cols);
  const r = db.prepare(`INSERT INTO med_prescripciones (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(k.map(c => cols[c]));
  return Number(r.lastInsertRowid);
}
const unaPrescripcion = (id) => { const p = db.prepare(`${SELECT_PRESC} WHERE p.id = ?`).get([id]); return p && presentar(p) };
const graves = (avisos) => avisos.filter(a => a.grave);

router.post('/prescripciones', requierePermiso('prescripciones', 'crear'), (req, res) => {
  try {
    const { residente, datos, avisos } = prepararPrescripcion(req.body || {});
    if (graves(avisos).length && !req.body.confirmar) throw L.errorUsuario('Revisa los avisos antes de guardar.', 409, { avisos });
    const id = insertarPrescripcion(residente.id, datos, req);
    res.status(201).json(unaPrescripcion(id));
  } catch (err) { enviarError(res, err, 'No se pudo guardar la prescripción.') }
});

// PUT /prescripciones/:id → si cambia algo clínico se crea una versión nueva (pide motivo).
// Excepción: corregir una captura del mismo día que aún no tiene tomas registradas.
router.put('/prescripciones/:id', requierePermiso('prescripciones', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  try {
    const actual = db.prepare('SELECT * FROM med_prescripciones WHERE id = ?').get([id]);
    if (!actual) throw L.errorUsuario('Prescripción no encontrada.', 404);
    if (actual.estado !== 'activa') throw L.errorUsuario('Solo se puede cambiar una prescripción activa.');
    const { datos, avisos } = prepararPrescripcion({ ...req.body, residente_id: actual.residente_id }, id);
    if (graves(avisos).length && !req.body.confirmar) throw L.errorUsuario('Revisa los avisos antes de guardar.', 409, { avisos });
    const cambios = L.cambiosClinicos(actual, datos);
    const hoy = L.hoyMexico();
    const tieneTomas = db.get('SELECT COUNT(*) AS n FROM med_stock_mov WHERE registro_toma_id IS NOT NULL AND medicamento_id = ? AND residente_id IS ?',
      [actual.medicamento_id, actual.provee === 'centro' ? null : actual.residente_id]).n > 0;
    const correccion = String(actual.creado_en).slice(0, 10) === new Date().toISOString().slice(0, 10) && actual.fecha_inicio >= hoy && !tieneTomas;

    if (!cambios.length || correccion) {
      const k = Object.keys(datos);
      db.prepare(`UPDATE med_prescripciones SET ${k.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run([...k.map(c => datos[c]), id]);
      return res.json({ ...unaPrescripcion(id), version: false });
    }
    const motivo = L.texto(req.body.motivo_cambio, 200);
    if (!motivo) throw L.errorUsuario('Escribe el motivo del cambio (por ejemplo: "el médico bajó la dosis").', 400, { pide_motivo: true });
    const nueva = transaccion(() => {
      // la anterior termina hoy; la nueva empieza hoy (o en su fecha, si es después)
      db.prepare(`UPDATE med_prescripciones SET estado = 'reemplazada', fecha_fin = ?, motivo_cierre = ?, cerrado_por_nombre = ?, cerrado_en = datetime('now') WHERE id = ?`)
        .run([actual.fecha_fin && actual.fecha_fin < hoy ? actual.fecha_fin : hoy, motivo, req.usuario.nombre || '', id]);
      const inicio = datos.fecha_inicio > hoy ? datos.fecha_inicio : hoy;
      return insertarPrescripcion(actual.residente_id, { ...datos, fecha_inicio: inicio }, req, {
        reemplaza_a_id: id, motivo_cambio: motivo, tratamiento_id: actual.tratamiento_id,
      });
    });
    res.json({ ...unaPrescripcion(nueva), version: true, cambios });
  } catch (err) { enviarError(res, err, 'No se pudo guardar el cambio.') }
});

// POST /prescripciones/:id/suspender { motivo } · /terminar { motivo } · /reanudar
for (const [accion, estado] of [['suspender', 'suspendida'], ['terminar', 'terminada']]) {
  router.post(`/prescripciones/:id/${accion}`, requierePermiso('prescripciones', 'editar'), (req, res) => {
    const id = Number(req.params.id);
    try {
      const motivo = L.texto(req.body?.motivo, 200);
      if (!motivo) throw L.errorUsuario('Escribe el motivo.');
      const p = db.prepare('SELECT * FROM med_prescripciones WHERE id = ?').get([id]);
      if (!p) throw L.errorUsuario('Prescripción no encontrada.', 404);
      if (p.estado !== 'activa') throw L.errorUsuario('Esta prescripción ya no está activa.');
      db.prepare(`UPDATE med_prescripciones SET estado = ?, motivo_cierre = ?, cerrado_por_nombre = ?, cerrado_en = datetime('now') WHERE id = ?`)
        .run([estado, motivo, req.usuario.nombre || '', id]);
      res.json(unaPrescripcion(id));
    } catch (err) { enviarError(res, err, 'No se pudo actualizar la prescripción.') }
  });
}
router.post('/prescripciones/:id/reanudar', requierePermiso('prescripciones', 'editar'), (req, res) => {
  const id = Number(req.params.id);
  try {
    const p = db.prepare('SELECT * FROM med_prescripciones WHERE id = ?').get([id]);
    if (!p) throw L.errorUsuario('Prescripción no encontrada.', 404);
    if (p.estado !== 'suspendida') throw L.errorUsuario('Solo se puede reanudar una prescripción suspendida.');
    if (p.fecha_fin && p.fecha_fin < L.hoyMexico()) throw L.errorUsuario('Su fecha de fin ya pasó. Crea una prescripción nueva.');
    db.prepare(`UPDATE med_prescripciones SET estado = 'activa', motivo_cierre = '', cerrado_por_nombre = '', cerrado_en = '' WHERE id = ?`).run([id]);
    res.json(unaPrescripcion(id));
  } catch (err) { enviarError(res, err, 'No se pudo reanudar la prescripción.') }
});

// GET /prescripciones/:id/historial → todas las versiones de esa prescripción (de la más nueva a la más vieja)
router.get('/prescripciones/:id/historial', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    const rondas = rondasDef();
    let p = db.prepare(`${SELECT_PRESC} WHERE p.id = ?`).get([Number(req.params.id)]);
    if (!p) return res.status(404).json({ error: 'Prescripción no encontrada.' });
    // subir hasta la versión más nueva
    for (let s = db.prepare(`${SELECT_PRESC} WHERE p.reemplaza_a_id = ?`).get([p.id]); s; s = db.prepare(`${SELECT_PRESC} WHERE p.reemplaza_a_id = ?`).get([p.id])) p = s;
    const versiones = [];
    for (let v = p; v && versiones.length < 50; v = v.reemplaza_a_id ? db.prepare(`${SELECT_PRESC} WHERE p.id = ?`).get([v.reemplaza_a_id]) : null) {
      versiones.push({ ...v, horarios: L.horariosDe(v), texto: L.textoPrescripcion({ ...v, horarios: L.horariosDe(v) }, v, rondas) });
    }
    res.json(versiones);
  } catch (err) { enviarError(res, err, 'No se pudo cargar el historial.') }
});

// GET /dia?fecha=&ronda_id=  → qué toca en esa ronda (vista previa; la confirmación llega en la Fase 2)
router.get('/dia', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    const rondas = rondasDef().filter(r => r.activa);
    const fecha = L.esFecha(req.query.fecha) ? req.query.fecha : L.hoyMexico();
    const ronda = rondas.find(r => r.id === Number(req.query.ronda_id)) || L.rondaDeHora(rondas, L.ahoraMexico().hora) || rondas[0];
    const res_ = db.prepare('SELECT id, nombre, iniciales, foto, habitacion, ubicacion, alergias FROM residentes ORDER BY nombre COLLATE NOCASE').all();
    const presc = db.prepare(`${SELECT_PRESC} WHERE p.estado = 'activa' AND p.tipo != 'prn'`).all().map(p => presentar(p, rondas))
      .filter(p => L.aplicaEnFecha(p, fecha) && p.horarios.some(h => h.ronda_id === ronda.id));
    const lista = res_.map(r => ({
      ...r,
      tomas: presc.filter(p => p.residente_id === r.id).flatMap(p => p.horarios.filter(h => h.ronda_id === ronda.id).map(h => ({ ...p, hora: h.hora }))),
    })).filter(r => r.tomas.length);
    res.json({ fecha, ronda, rondas, residentes: lista });
  } catch (err) { enviarError(res, err, 'No se pudo cargar la ronda.') }
});

// ── Existencias ──────────────────────────────────────────────────────────────
// GET /existencias?residente_id=  → por medicamento y dueño, con consumo y días restantes
router.get('/existencias', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    const presc = db.prepare("SELECT * FROM med_prescripciones WHERE estado = 'activa'").all();
    const llaves = new Map();
    const llave = (medId, resId) => `${medId}|${resId || 'centro'}`;
    for (const p of presc) llaves.set(llave(p.medicamento_id, p.provee === 'centro' ? null : p.residente_id), { medicamento_id: p.medicamento_id, residente_id: p.provee === 'centro' ? null : p.residente_id });
    for (const m of db.prepare('SELECT DISTINCT medicamento_id, residente_id FROM med_stock_mov').all()) llaves.set(llave(m.medicamento_id, m.residente_id), m);
    const residentes = Object.fromEntries(db.prepare('SELECT id, nombre, iniciales, foto FROM residentes').all().map(r => [r.id, r]));
    let filas = [...llaves.values()].map(({ medicamento_id, residente_id }) => {
      const med = catalogoPorId(medicamento_id);
      const usan = presc.filter(p => p.medicamento_id === medicamento_id && (residente_id ? p.provee === 'familia' && p.residente_id === residente_id : p.provee === 'centro'));
      const hay = existencia(medicamento_id, residente_id);
      const consumo = L.redondear(usan.reduce((n, p) => n + L.consumoDiario(p), 0));
      const usuarios = [...new Set(usan.map(p => p.residente_id))].map(id => residentes[id]?.nombre).filter(Boolean);
      return {
        medicamento_id, residente_id, residente: residente_id ? residentes[residente_id] || null : null,
        medicamento: conNombre(med), existencia: hay, existencia_texto: L.existenciaLegible(hay, med),
        consumo_diario: consumo, consumo_texto: consumo ? `${L.dosisTexto(Math.round(consumo * 10) / 10, med.unidad_dosis)} al día` : (usan.length ? 'Solo si hace falta' : 'Sin uso activo'),
        dias_restantes: L.diasRestantes(hay, consumo), en_uso: usan.length, usan: usuarios,
        estado: usan.length && hay <= 0 ? 'sin_stock' : (L.diasRestantes(hay, consumo) ?? 999) <= 7 ? 'por_agotarse' : 'ok',
      };
    });
    if (req.query.residente_id) filas = filas.filter(f => f.residente_id === Number(req.query.residente_id));
    const orden = { sin_stock: 0, por_agotarse: 1, ok: 2 };
    filas.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999) || a.medicamento.nombre.localeCompare(b.medicamento.nombre));
    res.json(filas);
  } catch (err) { enviarError(res, err, 'No se pudieron cargar las existencias.') }
});

// POST /existencias/movimiento { medicamento_id, residente_id|null, tipo: entrada|ajuste_inventario|desecho, cantidad, en: 'stock'|'dosis', motivo, lote, caducidad, origen }
//   entrada: llegó medicamento · ajuste_inventario: se contó y se fija la cantidad · desecho: se tiró (caducó, se cayó)
router.post('/existencias/movimiento', requierePermiso('medicacion', 'editar'), (req, res) => {
  const b = req.body || {};
  try {
    const med = catalogoPorId(b.medicamento_id);
    if (!med) throw L.errorUsuario('Medicamento no encontrado.', 404);
    const residenteId = b.residente_id ? Number(b.residente_id) : null;
    if (residenteId && !db.prepare('SELECT id FROM residentes WHERE id = ?').get([residenteId])) throw L.errorUsuario('Residente no encontrado.', 404);
    if (!['entrada', 'ajuste_inventario', 'desecho'].includes(b.tipo)) throw L.errorUsuario('Movimiento no válido.');
    if (b.tipo === 'ajuste_inventario' && !prescribe(req)) throw L.errorUsuario('Solo la encargada puede ajustar el inventario.', 403);
    const n = Number(String(b.cantidad ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 1000000 || (b.tipo !== 'ajuste_inventario' && n === 0)) throw L.errorUsuario('La cantidad no es válida.');
    const factor = b.en === 'stock' ? (Number(med.factor_conversion) || 1) : 1;
    const enDosis = L.redondear(n * factor);
    const motivo = L.texto(b.motivo, 200);
    if (b.tipo !== 'entrada' && !motivo) throw L.errorUsuario('Escribe el motivo.');
    const caducidad = L.esFecha(b.caducidad) ? b.caducidad : '';
    const hay = existencia(med.id, residenteId);
    const cantidad = b.tipo === 'entrada' ? enDosis : b.tipo === 'desecho' ? -enDosis : L.redondear(enDosis - hay);
    if (b.tipo === 'ajuste_inventario' && cantidad === 0) throw L.errorUsuario('El conteo coincide con el sistema: no hay nada que ajustar.');
    db.prepare(`INSERT INTO med_stock_mov (medicamento_id, residente_id, tipo, cantidad, motivo, lote, caducidad, origen, usuario_id, usuario_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run([med.id, residenteId, b.tipo, cantidad, motivo, L.texto(b.lote, 40), caducidad, L.texto(b.origen, 40) || (residenteId ? 'familia' : 'compra'), ...quien(req)]);
    const nueva = existencia(med.id, residenteId);
    res.status(201).json({ existencia: nueva, existencia_texto: L.existenciaLegible(nueva, med), diferencia: cantidad });
  } catch (err) { enviarError(res, err, 'No se pudo registrar el movimiento.') }
});

router.get('/existencias/movimientos', requierePermiso('medicacion', 'ver'), (req, res) => {
  try {
    const med = catalogoPorId(req.query.medicamento_id);
    if (!med) return res.status(404).json({ error: 'Medicamento no encontrado.' });
    const rid = req.query.residente_id ? Number(req.query.residente_id) : null;
    const filas = db.prepare(`SELECT * FROM med_stock_mov WHERE medicamento_id = ? AND ${rid ? 'residente_id = ?' : 'residente_id IS NULL'} ORDER BY id DESC LIMIT 200`)
      .all(rid ? [med.id, rid] : [med.id]);
    res.json(filas.map(f => ({ ...f, cantidad_texto: L.existenciaLegible(Math.abs(f.cantidad), med) })));
  } catch (err) { enviarError(res, err, 'No se pudo cargar el historial.') }
});

module.exports = router;
