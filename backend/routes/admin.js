// Rotas admin (todas protegidas por JWT)
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ═══════════════════════════════════════════════════════
// CASES — CRUD
// ═══════════════════════════════════════════════════════
router.post('/cases', async (req, res, next) => {
  try {
    const { niche, name, videoUrl, description, featured } = req.body || {};
    if (!niche || !name) {
      return res.status(400).json({ error: 'Segmento e nome são obrigatórios' });
    }
    const created = await db.createCase({ niche, name, videoUrl, description, featured });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

router.put('/cases/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const existing = await db.getCase(id);
    if (!existing) return res.status(404).json({ error: 'Case não encontrado' });

    const { niche, name, videoUrl, description, featured } = req.body || {};
    if (!niche || !name) {
      return res.status(400).json({ error: 'Segmento e nome são obrigatórios' });
    }
    const updated = await db.updateCase(id, { niche, name, videoUrl, description, featured });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/cases/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const ok = await db.deleteCase(id);
    if (!ok) return res.status(404).json({ error: 'Case não encontrado' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════
router.get('/leads', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await db.listLeads({ limit, offset });
    res.json(result);
  } catch (err) { next(err); }
});

router.delete('/leads', async (req, res, next) => {
  try {
    const deleted = await db.clearLeads();
    res.json({ ok: true, deleted });
  } catch (err) { next(err); }
});

router.get('/leads/export.csv', async (req, res, next) => {
  try {
    const { items } = await db.listLeads({ limit: 10000, offset: 0 });
    const rows = [['Data', 'Nome', 'Telefone', 'Segmento', 'Case', 'Mensagem']];
    for (const l of items) {
      rows.push([l.createdAt, l.name, l.phone, l.niche || '', l.caseName || '', l.message || '']);
    }
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const filename = `itz-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════
router.get('/analytics', async (req, res, next) => {
  try {
    res.json(await db.getAnalytics());
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════
router.get('/settings', async (req, res, next) => {
  try {
    res.json(await db.getAllSettings());
  } catch (err) { next(err); }
});

router.put('/settings', async (req, res, next) => {
  try {
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
    await db.setManySettings(filtered);
    res.json(await db.getAllSettings());
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════
// PASSWORD — gera hash (o operador atualiza a env var ADMIN_PASS_HASH manualmente)
// ═══════════════════════════════════════════════════════
router.post('/password/generate-hash', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 8 caracteres' });
  }
  const hash = bcrypt.hashSync(password, 12);
  res.json({
    hash,
    instructions: 'Cole este hash em ADMIN_PASS_HASH (Vercel → Settings → Environment Variables) e faça redeploy.'
  });
});

module.exports = router;
