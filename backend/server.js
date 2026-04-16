require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const residentesRoutes = require('./routes/residentes');
const reporteRoutes = require('./routes/reporte');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '1mb' }));

// API Routes
app.use('/api/residentes', residentesRoutes);
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

app.listen(PORT, () => {
  console.log(`\n🏥 RRM Backend corriendo en http://localhost:${PORT}`);
  console.log(`   Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? '✅ configurada' : '❌ NO configurada'}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});
