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
- `GestionConfig.jsx`: **Usuarios y permisos** (solo admin; aprobar solicitudes, invitar, puesto, permisos por módulo, desactivar) y **Mi cuenta**.

### Backend de Gestión
- `routes/auth.js`: contraseñas con scrypt, sesiones de 7 días (tabla `sesiones`) y límite de intentos por IP (`trust proxy` activo). Rutas: `/registro` (la cuenta queda con `aprobado=0` y sin permisos), `/olvide` (responde al instante y envía en segundo plano), `/enlace/:token` (enlaces de un solo uso en `enlaces_acceso`: invitación 7 días, recuperación 1 hora) y `/mi-cuenta`. Recuperación de emergencia: variable `GESTION_RESET_PASSWORD` en Railway; después se borra.
- `routes/usuarios.js`: administración de usuarios (solo admin). No permite quedarse sin un admin activo.
- `permisos.js`: roles `admin`, `administracion`, `encargado_enfermeria`, `enfermeria`, `cocina` y `limpieza`. Cada módulo tiene nivel `ver` o `editar`; el admin puede personalizarlo por persona (`usuarios.permisos`, JSON). Proteger rutas con `requierePermiso(modulo, nivel)`.
- `routes/gestion.js`: residentes de Gestión, con verificación de permisos.
- `correo.js`: **Railway bloquea SMTP**, así que en producción se envía por la **API HTTPS de Brevo** (`BREVO_API_KEY`, remitente verificado `residenciarrm@gmail.com` = `GMAIL_USER`; el bloqueo por IP en Brevo está desactivado). El SMTP de Gmail (`GMAIL_APP_PASSWORD`) solo sirve en local.

### Próximos módulos (orden sugerido)
Ficha completa del residente, Pre-admisión, Controles diarios, Medicación, Baños, Personal, Instalaciones e Inicio (resumen). Al terminar uno, agrégalo a `LISTOS`, a `MODULOS` de `permisos.js` (si es nuevo) y al roadmap de `GestionProximamente.jsx`.

## Diseño (preferencias firmes del dueño)
- **Profesional y sobrio**, como software médico o administrativo. Rechazó explícitamente: degradados morado-rosa, neón/glow, glassmorphism, texto con degradado, confeti, tarjetas con inclinación 3D y ripple ("se ve muy ChatGPT").
- **Tema oscuro estilo panel de Railway:** fondo `#13111b` con puntos sutiles, tarjetas `#1a1824`, bordes finos, pestañas con subrayado.
- **Rosa RRM = color principal** (`--rose #e0508a`, el de marca es `#c23a6b`). Naranja `#f0a43a` para "Fuera". Verde y azul solo como apoyo de estado.
- **Escala grande, similar a Resisoft:** fotos de 84 px, texto base de 15–17 px, tabla a ancho completo y botones de ubicación sólidos.
- Animaciones cortas y funcionales: aparición escalonada, conteo de números y paneles que se deslizan. Siempre respetan `prefers-reduced-motion`.
- Todos los tokens viven en `.gl-root` dentro de `gestion.css`.

## Datos sensibles
Las capturas de Resisoft tienen datos reales (CURP, fotos, teléfonos): no se comparten ni se suben a ningún lado. Las contraseñas y claves que el usuario escriba en el chat se guardan solo en Railway.
