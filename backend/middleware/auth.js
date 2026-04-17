// Middleware JWT — protege rotas /api/admin/*
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET não definido no .env');
  process.exit(1);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function signToken(payload, expiresIn = process.env.JWT_EXPIRY || '24h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

module.exports = { requireAuth, signToken };
