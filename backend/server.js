require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const residentesRoutes = require('./routes/residentes');
const reporteRoutes    = require('./routes/reporte');
const recibosRoutes    = require('./routes/recibos');
const historialRoutes  = require('./routes/historial');
const visitasRoutes    = require('./routes/visitas');
const authRoutes       = require('./routes/auth');

const app = express();
app.set('trust proxy', 1); // Railway está detrás de un proxy: req.ip real para el límite de intentos
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json({ limit: '1mb' }));

// API Routes
app.use('/api/residentes', residentesRoutes);
app.use('/api/recibos',   recibosRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/visitas',   visitasRoutes);
app.use('/api/auth',      authRoutes);
app.use('/api/gestion/usuarios', require('./routes/usuarios'));
app.use('/api/gestion/controles', require('./routes/controles'));
app.use('/api/gestion/reportes',  require('./routes/reportesGestion'));
app.use('/api/gestion/medicacion', require('./routes/medicacion'));
app.use('/api/gestion/banos',      require('./routes/banos'));
app.use('/api/gestion/actividades', require('./routes/actividades'));
app.use('/api/gestion/rol',        require('./routes/rolDia'));
app.use('/api/gestion/personal',   require('./routes/personal'));
app.use('/api/gestion/asistencia', require('./routes/asistencia'));
app.use('/api/gestion/avisos',     require('./routes/avisos'));
app.use('/api/gestion/roles',      require('./routes/roles'));
app.use('/api/gestion/documentos', require('./routes/documentos'));
app.use('/api/gestion',   require('./routes/gestion'));
app.use('/api', reporteRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve frontend in production (Railway single-service deploy)
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏥 RRM Backend corriendo en http://localhost:${PORT}`);
  console.log(`   Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? '✅ configurada' : '❌ NO configurada'}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});
