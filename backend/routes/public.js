// Rotas públicas (sem autenticação) — cases, submissão de lead, settings públicas
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/cases
// ─────────────────────────────────────────────
router.get('/cases', async (req, res, next) => {
  try {
    const cases = await db.listCases();
    res.json({ total: cases.length, items: cases });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /api/cases/:id — detalhe + incrementa view
// ─────────────────────────────────────────────
router.get('/cases/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const c = await db.getCase(id);
    if (!c) return res.status(404).json({ error: 'Case não encontrado' });
    db.incrementViews(id).catch(() => {}); // fire-and-forget
    res.json(c);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// POST /api/cases/:id/view
// ─────────────────────────────────────────────
router.post('/cases/:id/view', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const ok = await db.incrementViews(id);
    res.json({ ok });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// POST /api/leads — rate-limit in-memory (imperfeito em serverless,
// mas serve como freio básico; proteção forte fica a cargo do Vercel WAF)
// ─────────────────────────────────────────────
const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas submissões. Aguarde alguns minutos.' },
});

router.post('/leads', leadLimiter, async (req, res, next) => {
  try {
    const { name, phone, niche, caseId, caseName, message } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }
    if (name.length > 200 || phone.length > 50 || (message && message.length > 2000)) {
      return res.status(400).json({ error: 'Campos excedem tamanho máximo' });
    }

    const lead = await db.createLead({
      name: String(name).trim(),
      phone: String(phone).trim(),
      niche: niche ? String(niche).trim() : '',
      caseId: caseId ? parseInt(caseId, 10) || null : null,
      caseName: caseName ? String(caseName).trim() : '',
      message: message ? String(message).trim() : '',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });

    triggerNotification(lead).catch(err => console.warn('Notification error:', err.message));

    res.status(201).json({ ok: true, id: lead.id });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /api/settings/public
// ─────────────────────────────────────────────
router.get('/settings/public', async (req, res, next) => {
  try {
    const all = await db.getAllSettings();
    res.json({
      waPhone:      all.waPhone      || '',
      waMsg:        all.waMsg        || '',
      heroTitle:    all.heroTitle    || '',
      heroSub:      all.heroSub      || '',
      ga4Id:        all.ga4Id        || '',
      metaPixelId:  all.metaPixelId  || '',
      customScript: all.customScript || '',
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Notificação externa (fire-and-forget)
// ─────────────────────────────────────────────
async function triggerNotification(lead) {
  const cfg = await db.getAllSettings();
  if (!cfg.notifyEnabled || !cfg.notifyApiUrl || !cfg.notifyApiToken || !cfg.notifyDestPhone) return;

  const template = cfg.notifyMessage ||
    '🔥 Novo lead via Cases de Sucesso!\n\nNome: {nome}\nTelefone: {telefone}\nInteresse: {nicho}\nCase visto: {case}\nMensagem: {mensagem}';
  const msg = template
    .replaceAll('{nome}', lead.name)
    .replaceAll('{telefone}', lead.phone)
    .replaceAll('{nicho}', lead.niche || '—')
    .replaceAll('{case}', lead.caseName || '—')
    .replaceAll('{mensagem}', lead.message || '—');

  const body = {
    phone: cfg.notifyDestPhone,
    message: msg,
    ...(cfg.notifyChannel ? { channel: cfg.notifyChannel } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(cfg.notifyApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.notifyApiToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = router;
