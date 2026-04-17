// ═══════════════════════════════════════════════════════
// DB — Postgres (Supabase / Neon / Vercel Postgres). Driver `postgres`
// (porsager) — funciona com qualquer provedor Postgres em serverless.
// ═══════════════════════════════════════════════════════
const postgres = require('postgres');

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!url) {
  throw new Error('DATABASE_URL (ou POSTGRES_URL) não definido no ambiente');
}

// Config para serverless + connection pooler (Supabase porta 6543 / PgBouncer
// em transaction mode): desabilita prepared statements.
const client = postgres(url, {
  ssl: 'require',
  prepare: false,
  max: 1,                 // serverless: 1 conexão por invocação
  idle_timeout: 20,
  connect_timeout: 10,
});

// Helper com assinatura `sql(text, params)` — retorna rows[].
async function sql(text, params) {
  const res = await client.unsafe(text, params || []);
  return res;
}

// ═══════════════════════════════════════════════════════
// SCHEMA (idempotente — roda uma vez via `npm run migrate`,
// mas também protege cold starts chamando ensureSchema() lazy).
// ═══════════════════════════════════════════════════════
let initPromise = null;
function ensureSchema() {
  if (!initPromise) {
    initPromise = (async () => {
      await sql(`
        CREATE TABLE IF NOT EXISTS cases (
          id          SERIAL PRIMARY KEY,
          niche       TEXT NOT NULL,
          name        TEXT NOT NULL,
          video_url   TEXT NOT NULL,
          description TEXT DEFAULT '',
          featured    INTEGER DEFAULT 0,
          views       INTEGER DEFAULT 0,
          created_at  TIMESTAMPTZ DEFAULT NOW(),
          updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await sql(`CREATE INDEX IF NOT EXISTS idx_cases_niche    ON cases(niche)`);
      await sql(`CREATE INDEX IF NOT EXISTS idx_cases_featured ON cases(featured)`);
      await sql(`
        CREATE TABLE IF NOT EXISTS leads (
          id         SERIAL PRIMARY KEY,
          name       TEXT NOT NULL,
          phone      TEXT NOT NULL,
          niche      TEXT DEFAULT '',
          case_id    INTEGER REFERENCES cases(id) ON DELETE SET NULL,
          case_name  TEXT DEFAULT '',
          message    TEXT DEFAULT '',
          ip         TEXT DEFAULT '',
          user_agent TEXT DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await sql(`CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`);
      await sql(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    })().catch(err => { initPromise = null; throw err; });
  }
  return initPromise;
}

async function query(text, params) {
  await ensureSchema();
  return params !== undefined ? sql(text, params) : sql(text);
}

function normalizeCase(row) {
  return {
    id: row.id,
    niche: row.niche,
    name: row.name,
    videoUrl: row.video_url,
    description: row.description,
    featured: !!row.featured,
    views: row.views,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// ═══════════════════════════════════════════════════════
// CASES
// ═══════════════════════════════════════════════════════
async function listCases() {
  const rows = await query(
    `SELECT id, niche, name, video_url, description, featured, views, created_at
     FROM cases ORDER BY featured DESC, niche ASC, name ASC`
  );
  return rows.map(normalizeCase);
}

async function getCase(id) {
  const rows = await query(
    `SELECT id, niche, name, video_url, description, featured, views, created_at
     FROM cases WHERE id = $1`,
    [id]
  );
  return rows[0] ? normalizeCase(rows[0]) : null;
}

async function createCase(data) {
  const rows = await query(
    `INSERT INTO cases (niche, name, video_url, description, featured)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, niche, name, video_url, description, featured, views, created_at`,
    [
      data.niche,
      data.name,
      data.videoUrl || '',
      data.description || '',
      data.featured ? 1 : 0,
    ]
  );
  return normalizeCase(rows[0]);
}

async function updateCase(id, data) {
  const rows = await query(
    `UPDATE cases SET
       niche = $1, name = $2, video_url = $3, description = $4,
       featured = $5, updated_at = NOW()
     WHERE id = $6
     RETURNING id, niche, name, video_url, description, featured, views, created_at`,
    [
      data.niche,
      data.name,
      data.videoUrl || '',
      data.description || '',
      data.featured ? 1 : 0,
      id,
    ]
  );
  return rows[0] ? normalizeCase(rows[0]) : null;
}

async function deleteCase(id) {
  const rows = await query(`DELETE FROM cases WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

async function incrementViews(id) {
  const rows = await query(
    `UPDATE cases SET views = views + 1 WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

async function countCases() {
  const rows = await query(`SELECT COUNT(*)::int AS total FROM cases`);
  return rows[0].total;
}

async function getAnalytics() {
  await ensureSchema();
  const [a, b, c, d, top] = await Promise.all([
    sql(`SELECT COUNT(*)::int AS total FROM cases`),
    sql(`SELECT COUNT(DISTINCT niche)::int AS total FROM cases`),
    sql(`SELECT COALESCE(SUM(views), 0)::int AS total FROM cases`),
    sql(`SELECT COUNT(*)::int AS total FROM leads`),
    sql(`SELECT id, niche, name, views FROM cases ORDER BY views DESC LIMIT 10`),
  ]);
  return {
    totalCases:  a[0].total,
    totalNiches: b[0].total,
    totalViews:  c[0].total,
    totalLeads:  d[0].total,
    topCases:    top.map(r => ({ id: r.id, niche: r.niche, name: r.name, views: r.views })),
  };
}

// ═══════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════
async function createLead(data) {
  const rows = await query(
    `INSERT INTO leads (name, phone, niche, case_id, case_name, message, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      data.name,
      data.phone,
      data.niche || '',
      data.caseId || null,
      data.caseName || '',
      data.message || '',
      data.ip || '',
      data.userAgent || '',
    ]
  );
  return { id: rows[0].id, ...data };
}

async function listLeads({ limit = 200, offset = 0 } = {}) {
  await ensureSchema();
  const [countRes, items] = await Promise.all([
    sql(`SELECT COUNT(*)::int AS total FROM leads`),
    sql(
      `SELECT id, name, phone, niche, case_id, case_name, message, created_at
       FROM leads ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
  ]);
  return {
    total: countRes[0].total,
    items: items.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      niche: r.niche,
      caseId: r.case_id,
      caseName: r.case_name,
      message: r.message,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })),
  };
}

async function clearLeads() {
  const rows = await query(`DELETE FROM leads RETURNING id`);
  return rows.length;
}

// ═══════════════════════════════════════════════════════
// SETTINGS (values stored as JSON strings)
// ═══════════════════════════════════════════════════════
async function getAllSettings() {
  const rows = await query(`SELECT key, value FROM settings`);
  const out = {};
  for (const row of rows) {
    try { out[row.key] = JSON.parse(row.value); }
    catch { out[row.key] = row.value; }
  }
  return out;
}

async function getSetting(key, defaultValue = null) {
  const rows = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  if (!rows[0]) return defaultValue;
  try { return JSON.parse(rows[0].value); }
  catch { return rows[0].value; }
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

async function setManySettings(obj) {
  await ensureSchema();
  for (const [k, v] of Object.entries(obj)) {
    await sql(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [k, JSON.stringify(v)]
    );
  }
}

module.exports = {
  sql,
  query,
  ensureSchema,
  listCases,
  getCase,
  createCase,
  updateCase,
  deleteCase,
  incrementViews,
  countCases,
  getAnalytics,
  createLead,
  listLeads,
  clearLeads,
  getAllSettings,
  getSetting,
  setSetting,
  setManySettings,
};
