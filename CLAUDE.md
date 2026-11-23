# Residencia Refugio Mendoza (RRM) — guía para Claude

App web de la Residencia Refugio Mendoza, una residencia de adultos mayores en Mérida, Yucatán. El dueño es Emiliano (usuario de GitHub `vruzzy`). Habla español; responde siempre en español, con explicaciones claras y sin tecnicismos innecesarios.

## Stack y despliegue
- **Frontend:** React 18 + Vite (`frontend/`). Íconos: `lucide-react`. Tipografía: Inter (Google Fonts en `index.html`).
- **Backend:** Node + Express (`backend/`). Base SQLite con `node-sqlite3-wasm` (`backend/database.js`; migraciones con `ALTER TABLE ... ` dentro de `try {}`).
- **Producción:** Railway, proyecto **incredible-grace** / ambiente **production** / servicio **reportes-rrm**, con un volumen para la base. Se despliega solo con cada `git push` a `master` (`railway.toml`: compila el frontend y el backend sirve `frontend/dist`).
- **Local:** `npm run dev` en la raíz (API en :3001 y web en :5173, con proxy `/api`). `backend/.env` (no está en git) tiene `ANTHROPIC_API_KEY`, `PORT` y `NODE_ENV`. La base local `backend/rrm.db` es solo de pruebas; los datos reales están en Railway.
- **Railway CLI:** `railway logs`, `railway variable list|set|delete`, `railway deployment list`.

## Reglas de trabajo
- **Pide permiso antes de cada `git push`.** Sube a producción, donde hay datos reales de residentes. Confirmación una vez no vale para la siguiente.
- Nunca escribas claves ni contraseñas en archivos del repo; van en variables de Railway.
- Los archivos tienen finales de línea CRLF y LF mezclados. Al editar con scripts, normaliza a `\n` y restaura después.
- Verifica con `npx vite build` (en `frontend/`). El aviso de un chunk de más de 500 KB ya existía.

## Módulos de la app original (pestañas inferiores)
Recibos (PDF con jsPDF), Reporte de turno (IA con Anthropic), Historial, Calendario de visitas (con visitas recurrentes) y Residentes. **No se modifican** al trabajar en Gestión.

## Gestión (en construcción) — `frontend/src/components/gestion/`
**Objetivo:** reemplazar **Resisoft**, el SaaS que pagan hoy, con un sistema propio. **Se construye desde cero:** no se copia el código, la marca ni el diseño exacto de Resisoft.

- `GestionApp.jsx`: entrada con login (correo o usuario), "¿Olvidaste tu contraseña?", "Crear cuenta", crear contraseña desde un enlace (`?gestion=...&token=...`) y la pantalla "cuenta en revisión". Exporta `gestionFetch` (token Bearer guardado en localStorage `rrm_gestion_token`).
- `GestionLayout.jsx`: pantalla completa (overlay fijo) con una barra lateral colapsable (tecla `[`). El menú se filtra según los permisos del usuario. Los módulos que ya funcionan están en `LISTOS`; los demás muestran "Pronto".
- `ResidentesListado.jsx`: tarjetas En residencia / Fuera / Total, búsqueda, filtros, columnas configurables, paginación (10/25/50/Todos), exportar CSV, cambio rápido de ubicación y prop `puedeEditar`.
- `ResidenteExpedienteModal.jsx`: panel lateral con el expediente (foto en base64, CURP, mutualista, contactos).
- `ControlesDiarios.jsx`: signos vitales por turno. Dos turnos (mañana 07–19, noche 19–07; la fecha del turno es el día en que empieza) y dos tomas por turno: **al recibir** y **al entregar**. Tabla de captura que se guarda sola al salir de la fila (Enter baja al siguiente), alertas fuera de rango en naranja y un historial por residente. Los de centro de día no salen en el turno de noche; los que están "Fuera" no salen. Pestaña **Micciones y evacuaciones**: cada una es un registro con hora y características (`Eliminacion.jsx`, compartido con el reporte); las características a vigilar se ven en naranja.
- `ReportesTurno.jsx`: el Reporte de turno con IA integrado a Gestión. Las tomas del turno se cargan solas desde Controles (se pueden capturar ahí mismo) y van en la tabla del PDF (`reportePDF.js`, con las dos filas) y en el mensaje copiado. Si se edita el texto, se usa para que la IA aprenda (tabla `aprendizaje`). Avisa si falta una toma antes de generar. Las micciones y evacuaciones también salen de Controles (el servidor las lee al generar; ya no se capturan en el formulario).
- `Medicacion.jsx` (primera versión, 2026-11-23; falta revisarla con quien da la medicación): pestañas **Dar medicación** (tarjetas por toma: En ayunas, Desayuno, Comida, Cena, Al dormir; todos quedan como "Tomó", solo se marcan excepciones *Rechazó* (sí descuenta, la dosis se desecha) o *No estaba* (no descuenta; los "Fuera" salen así por defecto); un botón confirma la ronda completa y descuenta del inventario; **Deshacer** regresa existencias), **Inventario** (ordenado por días restantes = existencia ÷ consumo diario; rojo < 5 días, naranja < 10; Llegó / Contar / Dar para PRN; "Copiar lista de faltantes" para WhatsApp) y **Por residente**. `MedicacionResidente.jsx` es el panel de un residente (esquema, alta/edición, suspender, historial de movimientos), pensado para incrustarse también en el expediente. Utilidades en `medicacionUtil.js`, estilos en `medicacion.css`. Inventario por residente (no hay medicamentos compartidos).
- `signosVitales.js` (rangos, turnos, fechas locales) y `TurnoBarra.jsx` los comparten ambos módulos.
- `GestionConfig.jsx`: **Usuarios y permisos** (solo admin; aprobar solicitudes, invitar, puesto, permisos por módulo, desactivar) y **Mi cuenta**.

### Backend de Gestión
- `routes/auth.js`: contraseñas con scrypt, sesiones de 7 días (tabla `sesiones`) y límite de intentos por IP (`trust proxy` activo). Rutas: `/registro` (la cuenta queda con `aprobado=0` y sin permisos), `/olvide` (responde al instante y envía en segundo plano), `/enlace/:token` (enlaces de un solo uso en `enlaces_acceso`: invitación 7 días, recuperación 1 hora) y `/mi-cuenta`. Recuperación de emergencia: variable `GESTION_RESET_PASSWORD` en Railway; después se borra.
- `routes/usuarios.js`: administración de usuarios (solo admin). No permite quedarse sin un admin activo.
- `permisos.js`: roles `admin`, `administracion`, `encargado_enfermeria`, `enfermeria`, `cocina` y `limpieza`. Cada módulo tiene nivel `ver` o `editar`; el admin puede personalizarlo por persona (`usuarios.permisos`, JSON). Proteger rutas con `requierePermiso(modulo, nivel)`.
- `routes/gestion.js`: residentes de Gestión, con verificación de permisos.
- `routes/controles.js` (`/api/gestion/controles`, módulo `controles`): tabla `controles_signos`, una toma única por residente + fecha + turno + momento (upsert). Valida límites físicos en `signos.js`. Rutas `/eliminacion` (GET/POST/PUT/DELETE) sobre la tabla `controles_eliminacion` (un registro por micción o evacuación).
- `routes/reportesGestion.js` (`/api/gestion/reportes`, módulo `reportes`): genera con el mismo prompt y modelo del reporte original (`claude-sonnet-4-6`), pero recibe las tomas del turno. Guarda en la misma tabla `reportes` con `origen='gestion'`, `signos_turno` (ambas tomas), `datos_turno` y `texto_original`; `signos_vitales` lleva la última toma en formato plano para que el Historial de la app lo siga leyendo. `routes/reporte.js` (app original) no se tocó.
- `routes/medicacion.js` (`/api/gestion/medicacion`, módulo `medicacion`): crea sus propias tablas `med_medicamentos` (existencia guardada en la fila), `med_rondas` (única por fecha + toma, evita descontar doble), `med_ronda_residentes` (dada/rechazo/fuera) y `med_movimientos` (bitácora: entrada, toma, prn, ajuste, reverso). Todo cambio de existencias pasa por `mover()` dentro de una transacción.
- `correo.js`: **Railway bloquea SMTP**, así que en producción se envía por la **API HTTPS de Brevo** (`BREVO_API_KEY`, remitente verificado `residenciarrm@gmail.com` = `GMAIL_USER`; el bloqueo por IP en Brevo está desactivado). El SMTP de Gmail (`GMAIL_APP_PASSWORD`) solo sirve en local.

### Próximos módulos (orden sugerido)
Ficha completa del residente, Pre-admisión, Baños, Personal, Instalaciones e Inicio (resumen). Al terminar uno, agrégalo a `LISTOS`, a `MODULOS` de `permisos.js` (si es nuevo) y al roadmap de `GestionProximamente.jsx`.

## Diseño (preferencias firmes del dueño)
- **Profesional y sobrio**, como software médico o administrativo. Rechazó explícitamente: degradados morado-rosa, neón/glow, glassmorphism, texto con degradado, confeti, tarjetas con inclinación 3D y ripple ("se ve muy ChatGPT").
- **Tema oscuro estilo panel de Railway:** fondo `#13111b` con puntos sutiles, tarjetas `#1a1824`, bordes finos, pestañas con subrayado.
- **Rosa RRM = color principal** (`--rose #e0508a`, el de marca es `#c23a6b`). Naranja `#f0a43a` para "Fuera". Verde y azul solo como apoyo de estado.
- **Escala grande, similar a Resisoft:** fotos de 84 px, texto base de 15–17 px, tabla a ancho completo y botones de ubicación sólidos.
- Animaciones cortas y funcionales: aparición escalonada, conteo de números y paneles que se deslizan. Siempre respetan `prefers-reduced-motion`.
- Todos los tokens viven en `.gl-root` dentro de `gestion.css`.

## Datos sensibles
Las capturas de Resisoft tienen datos reales (CURP, fotos, teléfonos): no se comparten ni se suben a ningún lado. Las contraseñas y claves que el usuario escriba en el chat se guardan solo en Railway.
