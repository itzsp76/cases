// ═══════════════════════════════════════════════════════
// ITZ Cases — Servidor principal (Express + SQLite)
// ═══════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();

// ───────────────────────────────────────────
// Middlewares globais
// ───────────────────────────────────────────
app.set('trust proxy', 1);  // Atrás do Nginx
app.use(express.json({ limit: '256kb' }));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limit global (proteção geral)
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ───────────────────────────────────────────
// Rotas
// ───────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: NODE_ENV, uptime: process.uptime() });
});

// ───────────────────────────────────────────
// Servir frontend estático (opcional — útil em dev)
// Em produção, o Nginx serve o frontend diretamente.
// ───────────────────────────────────────────
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));

// Fallback 404 para qualquer outra rota que não comece com /api
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint não encontrado' });
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'), err => {
    if (err) next(err);
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: NODE_ENV === 'production' ? 'Erro interno' : err.message,
  });
});

// ───────────────────────────────────────────
// Start
// ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  ITZ Cases API                             ║
║  ─────────────────────────                 ║
║  Ambiente:  ${NODE_ENV.padEnd(30)} ║
║  Porta:     ${String(PORT).padEnd(30)} ║
║  CORS:      ${String(CORS_ORIGIN).padEnd(30).slice(0, 30)} ║
║                                            ║
║  Rodando em http://localhost:${PORT}        ║
╚════════════════════════════════════════════╝
  `);
});

module.exports = app;
