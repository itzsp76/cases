// Rotas admin (todas protegidas por JWT)
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ═══════════════════════════════════════════════════════
// CASES — CRUD completo
// ═══════════════════════════════════════════════════════
router.post('/cases', (req, res) => {
  const { niche, name, videoUrl, description, featured } = req.body || {};
  if (!niche || !name) {
    return res.status(400).json({ error: 'Segmento e nome são obrigatórios' });
  }
  const created = db.createCase({ niche, name, videoUrl, description, featured });
  res.status(201).json(created);
});

router.put('/cases/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const existing = db.getCase(id);
  if (!existing) return res.status(404).json({ error: 'Case não encontrado' });

  const { niche, name, videoUrl, description, featured } = req.body || {};
  if (!niche || !name) {
    return res.status(400).json({ error: 'Segmento e nome são obrigatórios' });
  }
  const updated = db.updateCase(id, { niche, name, videoUrl, description, featured });
  res.json(updated);
});

router.delete('/cases/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const ok = db.deleteCase(id);
  if (!ok) return res.status(404).json({ error: 'Case não encontrado' });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// LEADS — leitura e limpeza
// ═══════════════════════════════════════════════════════
router.get('/leads', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const offset = parseInt(req.query.offset, 10) || 0;
  const result = db.listLeads({ limit, offset });
  res.json(result);
});

router.delete('/leads', (req, res) => {
  const deleted = db.clearLeads();
  res.json({ ok: true, deleted });
});

// Export CSV
router.get('/leads/export.csv', (req, res) => {
  const { items } = db.listLeads({ limit: 10000, offset: 0 });
  const rows = [['Data', 'Nome', 'Telefone', 'Segmento', 'Case', 'Mensagem']];
  for (const l of items) {
    rows.push([l.createdAt, l.name, l.phone, l.niche || '', l.caseName || '', l.message || '']);
  }
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const filename = `itz-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM para Excel ler acentos corretamente
  res.send('\uFEFF' + csv);
});

// ═══════════════════════════════════════════════════════
// ANALYTICS / DASHBOARD
// ═══════════════════════════════════════════════════════
router.get('/analytics', (req, res) => {
  res.json(db.getAnalytics());
});

// ═══════════════════════════════════════════════════════
// SETTINGS — configurações do sistema
// ═══════════════════════════════════════════════════════
router.get('/settings', (req, res) => {
  res.json(db.getAllSettings());
});

router.put('/settings', (req, res) => {
  const allowedKeys = [
    'waPhone', 'waMsg', 'heroTitle', 'heroSub',
    'notifyApiUrl', 'notifyApiToken', 'notifyDestPhone', 'notifyChannel',
    'notifyMessage', 'notifyEnabled',
    'ga4Id', 'metaPixelId', 'customScript',
  ];
  const body = req.body || {};
  const filtered = {};
  for (const k of allowedKeys) {
    if (k in body) filtered[k] = body[k];
  }
  db.setManySettings(filtered);
  res.json(db.getAllSettings());
});

// ═══════════════════════════════════════════════════════
// PASSWORD — trocar senha admin (atualiza hash e retorna novo hash)
// O operador precisa atualizar o .env manualmente com o novo hash.
// ═══════════════════════════════════════════════════════
router.post('/password/generate-hash', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 8 caracteres' });
  }
  const hash = bcrypt.hashSync(password, 12);
  res.json({
    hash,
    instructions: 'Cole este hash no .env (ADMIN_PASS_HASH=...) e reinicie o servidor (pm2 restart itz-cases).'
  });
});

module.exports = router;
