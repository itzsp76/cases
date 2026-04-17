// ═══════════════════════════════════════════════════════
// ITZ Cases — Express app (exporta app; Vercel monta como handler)
// ═══════════════════════════════════════════════════════
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limit geral
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: NODE_ENV, uptime: process.uptime() });
});

// Em desenvolvimento local (npm run dev), também servimos o frontend estático.
// Em produção na Vercel, o frontend é servido como arquivos estáticos (ver vercel.json).
if (NODE_ENV !== 'production') {
  const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
  app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Endpoint não encontrado' });
    }
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'), err => err && next(err));
  });
} else {
  // Em produção, 404 para /api não reconhecidos
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado' });
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: NODE_ENV === 'production' ? 'Erro interno' : err.message,
  });
});

// Só escuta porta quando rodado diretamente (dev local).
// Na Vercel, api/index.js importa `app` e delega.
if (require.main === module) {
  const PORT = parseInt(process.env.PORT, 10) || 3001;
  app.listen(PORT, () => {
    console.log(`ITZ Cases API rodando em http://localhost:${PORT} (${NODE_ENV})`);
  });
}

module.exports = app;
