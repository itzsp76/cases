// Middleware JWT — protege rotas /api/admin/*
const jwt = require('jsonwebtoken');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET não definido no ambiente');
  return s;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, getSecret());
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function signToken(payload, expiresIn = process.env.JWT_EXPIRY || '24h') {
  return jwt.sign(payload, getSecret(), { expiresIn });
}

module.exports = { requireAuth, signToken };
