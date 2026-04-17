// ═══════════════════════════════════════════════════════
// DB — Turso (libSQL). Mesma API do projeto anterior, agora ASSÍNCRONA.
// ═══════════════════════════════════════════════════════
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('TURSO_DATABASE_URL não definido no ambiente');
}

const client = createClient({ url, authToken });

// ═══════════════════════════════════════════════════════
// SCHEMA + init (idempotente — seguro rodar a cada cold start)
// ═══════════════════════════════════════════════════════
let initPromise = null;
function ensureSchema() {
  if (!initPromise) {
    initPromise = client.batch([
      `CREATE TABLE IF NOT EXISTS cases (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        niche       TEXT    NOT NULL,
        name        TEXT    NOT NULL,
        video_url   TEXT    NOT NULL,
        description TEXT    DEFAULT '',
        featured    INTEGER DEFAULT 0,
        views       INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT (datetime('now')),
        updated_at  TEXT    DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_cases_niche    ON cases(niche)`,
      `CREATE INDEX IF NOT EXISTS idx_cases_featured ON cases(featured)`,
      `CREATE TABLE IF NOT EXISTS leads (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        phone      TEXT    NOT NULL,
        niche      TEXT    DEFAULT '',
        case_id    INTEGER,
        case_name  TEXT    DEFAULT '',
        message    TEXT    DEFAULT '',
        ip         TEXT    DEFAULT '',
        user_agent TEXT    DEFAULT '',
        created_at TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`,
      `CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ], 'write').catch(err => { initPromise = null; throw err; });
  }
  return initPromise;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
async function exec(sql, args) {
  await ensureSchema();
  return client.execute(args !== undefined ? { sql, args } : sql);
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
    createdAt: row.created_at,
  };
}

// ═══════════════════════════════════════════════════════
// CASES
// ═══════════════════════════════════════════════════════
async function listCases() {
  const { rows } = await exec(
    `SELECT id, niche, name, video_url, description, featured, views, created_at
     FROM cases ORDER BY featured DESC, niche ASC, name ASC`
  );
  return rows.map(normalizeCase);
}

async function getCase(id) {
  const { rows } = await exec(
    `SELECT id, niche, name, video_url, description, featured, views, created_at
     FROM cases WHERE id = ?`,
    [id]
  );
  return rows[0] ? normalizeCase(rows[0]) : null;
}

async function createCase(data) {
  const result = await exec(
    `INSERT INTO cases (niche, name, video_url, description, featured)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.niche,
      data.name,
      data.videoUrl || '',
      data.description || '',
      data.featured ? 1 : 0,
    ]
  );
  const id = Number(result.lastInsertRowid);
  return getCase(id);
}

async function updateCase(id, data) {
  await exec(
    `UPDATE cases SET
       niche = ?, name = ?, video_url = ?, description = ?,
       featured = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      data.niche,
      data.name,
      data.videoUrl || '',
      data.description || '',
      data.featured ? 1 : 0,
      id,
    ]
  );
  return getCase(id);
}

async function deleteCase(id) {
  const res = await exec(`DELETE FROM cases WHERE id = ?`, [id]);
  return res.rowsAffected > 0;
}

async function incrementViews(id) {
  const res = await exec(`UPDATE cases SET views = views + 1 WHERE id = ?`, [id]);
  return res.rowsAffected > 0;
}

async function countCases() {
  const { rows } = await exec(`SELECT COUNT(*) AS total FROM cases`);
  return Number(rows[0].total);
}

async function getAnalytics() {
  await ensureSchema();
  const [a, b, c, d, e] = await client.batch(
    [
      `SELECT COUNT(*) AS total FROM cases`,
      `SELECT COUNT(DISTINCT niche) AS total FROM cases`,
      `SELECT COALESCE(SUM(views), 0) AS total FROM cases`,
      `SELECT COUNT(*) AS total FROM leads`,
      `SELECT id, niche, name, views FROM cases ORDER BY views DESC LIMIT 10`,
    ],
    'read'
  );
  return {
    totalCases:  Number(a.rows[0].total),
    totalNiches: Number(b.rows[0].total),
    totalViews:  Number(c.rows[0].total),
    totalLeads:  Number(d.rows[0].total),
    topCases:    e.rows.map(r => ({ id: r.id, niche: r.niche, name: r.name, views: r.views })),
  };
}

// ═══════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════
async function createLead(data) {
  const res = await exec(
    `INSERT INTO leads (name, phone, niche, case_id, case_name, message, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
  return { id: Number(res.lastInsertRowid), ...data };
}

async function listLeads({ limit = 200, offset = 0 } = {}) {
  await ensureSchema();
  const [countRes, itemsRes] = await client.batch(
    [
      { sql: `SELECT COUNT(*) AS total FROM leads`, args: [] },
      {
        sql: `SELECT id, name, phone, niche, case_id, case_name, message, created_at
              FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        args: [limit, offset],
      },
    ],
    'read'
  );
  return {
    total: Number(countRes.rows[0].total),
    items: itemsRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      niche: r.niche,
      caseId: r.case_id,
      caseName: r.case_name,
      message: r.message,
      createdAt: r.created_at,
    })),
  };
}

async function clearLeads() {
  const res = await exec(`DELETE FROM leads`);
  return res.rowsAffected;
}

// ═══════════════════════════════════════════════════════
// SETTINGS (valores armazenados como JSON)
// ═══════════════════════════════════════════════════════
async function getAllSettings() {
  const { rows } = await exec(`SELECT key, value FROM settings`);
  const out = {};
  for (const row of rows) {
    try { out[row.key] = JSON.parse(row.value); }
    catch { out[row.key] = row.value; }
  }
  return out;
}

async function getSetting(key, defaultValue = null) {
  const { rows } = await exec(`SELECT value FROM settings WHERE key = ?`, [key]);
  if (!rows[0]) return defaultValue;
  try { return JSON.parse(rows[0].value); }
  catch { return rows[0].value; }
}

async function setSetting(key, value) {
  const json = JSON.stringify(value);
  await exec(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, json]
  );
}

async function setManySettings(obj) {
  await ensureSchema();
  const stmts = Object.entries(obj).map(([k, v]) => ({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [k, JSON.stringify(v)],
  }));
  if (stmts.length) await client.batch(stmts, 'write');
}

module.exports = {
  client,
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
