# Residencia Refugio Mendoza — Sistema de Reportes de Turno

Aplicación web para gestionar reportes de turno de enfermería en la Residencia Refugio Mendoza, Mérida, Yucatán.

## Stack

| Capa      | Tecnología                          |
|-----------|-------------------------------------|
| Frontend  | React 18 + Vite                     |
| Backend   | Node.js + Express                   |
| Base de datos | SQLite (better-sqlite3)         |
| IA        | Anthropic Claude (claude-sonnet-4-6)|
| PDF       | jsPDF                               |

## Requisitos

- Node.js 18+
- npm 9+
- Cuenta en [Anthropic Console](https://console.anthropic.com/) con API Key

---

## Instalación local

### 1. Clona o descarga el proyecto

```bash
git clone <repo-url>
cd reportes-rrm
```

### 2. Configura las variables de entorno

```bash
cp .env.example backend/.env
```

Edita `backend/.env` y agrega tu API Key:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
PORT=3001
NODE_ENV=development
```

### 3. Instala dependencias

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 4. Inicia en modo desarrollo

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Corre en http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# Abre http://localhost:5173
```

La app estará disponible en **http://localhost:5173**

---

## Deploy en Railway

### Prerequisitos
- Cuenta en [Railway](https://railway.app/)
- CLI de Railway: `npm install -g @railway/cli`

### Pasos

1. **Inicia sesión:**
   ```bash
   railway login
   ```

2. **Crea un nuevo proyecto:**
   ```bash
   railway new
   ```

3. **Configura la variable de entorno:**
   ```bash
   railway variables set ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

Railway usará el `railway.toml` incluido para construir y servir la aplicación.

> **Nota sobre la base de datos:** En Railway, usa un volumen persistente para la DB.  
> En el dashboard: `Variables → DB_PATH=/data/rrm.db` y monta un volumen en `/data`.

### Alternativa: Deploy manual en servidor

1. Construye el frontend:
   ```bash
   cd frontend && npm run build
   ```

2. Inicia el backend en producción:
   ```bash
   cd backend
   NODE_ENV=production ANTHROPIC_API_KEY=sk-ant-... node server.js
   ```

El backend sirve el frontend compilado desde `frontend/dist/`.

---

## Estructura del proyecto

```
reportes-rrm/
├── backend/
│   ├── database.js          # Inicialización SQLite
│   ├── server.js            # Entry point Express
│   ├── routes/
│   │   ├── residentes.js    # CRUD residentes
│   │   └── reporte.js       # Generación IA
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── ReporteForm.jsx      # Pantalla 1
│   │   │   ├── ResidentesAdmin.jsx  # Pantalla 2
│   │   │   ├── BottomSheet.jsx
│   │   │   └── ResidentModal.jsx
│   │   └── utils/
│   │       └── pdfGenerator.js      # Generación PDF con jsPDF
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env.example
├── railway.toml
└── README.md
```

## API Reference

| Método | Ruta                     | Descripción                       |
|--------|--------------------------|-----------------------------------|
| GET    | `/api/residentes`        | Lista todos los residentes        |
| POST   | `/api/residentes`        | Crea un nuevo residente           |
| PUT    | `/api/residentes/:id`    | Actualiza un residente            |
| DELETE | `/api/residentes/:id`    | Elimina un residente              |
| POST   | `/api/generar-reporte`   | Genera reporte narrativo con IA   |
| GET    | `/health`                | Health check                      |

## Uso

### Pantalla 1 — Nuevo Reporte
1. Selecciona el residente del turno
2. Elige el turno (Matutino-Vespertino o Nocturno)
3. Completa las secciones usando los chips de selección
4. Registra los signos vitales
5. Escribe tu nombre como responsable
6. Presiona **"Generar reporte con IA"**
7. En la hoja inferior puedes **copiar el mensaje** para WhatsApp o **descargar el PDF**

### Pantalla 2 — Residentes
- Agrega, edita y elimina residentes
- Las iniciales se auto-generan pero son editables
