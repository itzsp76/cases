// Rotas públicas (sem autenticação) — cases, submissão de lead, settings públicas
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/cases — lista todos os cases
// ─────────────────────────────────────────────
router.get('/cases', (req, res) => {
  const cases = db.listCases();
  res.json({ total: cases.length, items: cases });
});

// ─────────────────────────────────────────────
// GET /api/cases/:id — detalhe do case + incrementa view
// ─────────────────────────────────────────────
router.get('/cases/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const c = db.getCase(id);
  if (!c) return res.status(404).json({ error: 'Case não encontrado' });
  db.incrementViews(id);
  res.json(c);
});

// ─────────────────────────────────────────────
// POST /api/cases/:id/view — incrementa view sem retornar dados
// (usado quando o modal abre, para métricas precisas)
// ─────────────────────────────────────────────
router.post('/cases/:id/view', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const ok = db.incrementViews(id);
  res.json({ ok });
});

// ─────────────────────────────────────────────
// POST /api/leads — submissão pública de lead (com rate limit)
// ─────────────────────────────────────────────
const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,    // 10 min
  max: 5,                       // 5 leads por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas submissões. Aguarde alguns minutos.' },
});

router.post('/leads', leadLimiter, async (req, res) => {
  const { name, phone, niche, caseId, caseName, message } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
  }
  if (name.length > 200 || phone.length > 50 || (message && message.length > 2000)) {
    return res.status(400).json({ error: 'Campos excedem tamanho máximo' });
  }

  const lead = db.createLead({
    name: String(name).trim(),
    phone: String(phone).trim(),
    niche: niche ? String(niche).trim() : '',
    caseId: caseId ? parseInt(caseId, 10) || null : null,
    caseName: caseName ? String(caseName).trim() : '',
    message: message ? String(message).trim() : '',
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  // Dispara notificação via API configurada (fire-and-forget)
  triggerNotification(lead).catch(err => console.warn('Notification error:', err.message));

  res.status(201).json({ ok: true, id: lead.id });
});

// ─────────────────────────────────────────────
// GET /api/settings/public — configs visíveis ao frontend público
// (apenas os campos seguros: hero, WhatsApp, tracking)
// ─────────────────────────────────────────────
router.get('/settings/public', (req, res) => {
  const all = db.getAllSettings();
  res.json({
    waPhone:      all.waPhone      || '',
    waMsg:        all.waMsg        || '',
    heroTitle:    all.heroTitle    || '',
    heroSub:      all.heroSub      || '',
    ga4Id:        all.ga4Id        || '',
    metaPixelId:  all.metaPixelId  || '',
    customScript: all.customScript || '',
  });
});

// ─────────────────────────────────────────────
// Helper: dispara notificação (WhatsApp via API externa)
// ─────────────────────────────────────────────
async function triggerNotification(lead) {
  const cfg = db.getAllSettings();
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

  // Timeout de 8s para não travar o request do lead
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
