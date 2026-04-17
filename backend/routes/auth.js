// Rota de autenticação — POST /api/auth/login
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { signToken } = require('../middleware/auth');

const router = express.Router();

// Rate limit: 5 tentativas por IP em 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  }

  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedHash = process.env.ADMIN_PASS_HASH || '';

  if (username !== expectedUser) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const ok = bcrypt.compareSync(password, expectedHash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = signToken({ sub: username, role: 'admin' });
  res.json({ token, user: { username, role: 'admin' } });
});

// Verifica se um token é válido (usado pelo frontend no load)
router.get('/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ authenticated: false });
  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ authenticated: true, user: { username: payload.sub, role: payload.role } });
  } catch {
    res.status(401).json({ authenticated: false });
  }
});

module.exports = router;
