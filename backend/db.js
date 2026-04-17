// ═══════════════════════════════════════════════════════
// DB — SQLite com better-sqlite3 (síncrono, rápido, simples)
// ═══════════════════════════════════════════════════════
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/itz-cases.db';
const absDbPath = path.resolve(DB_PATH);

// Garante que a pasta /data existe
fs.mkdirSync(path.dirname(absDbPath), { recursive: true });

const db = new Database(absDbPath);
db.pragma('journal_mode = WAL');   // melhor concorrência
db.pragma('foreign_keys = ON');

// ═══════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    niche       TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    video_url   TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    featured    INTEGER DEFAULT 0,
    views       INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_cases_niche    ON cases(niche);
  CREATE INDEX IF NOT EXISTS idx_cases_featured ON cases(featured);

  CREATE TABLE IF NOT EXISTS leads (
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
  );

  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ═══════════════════════════════════════════════════════
// STATEMENTS (prepared — mais rápido e seguro que string concat)
// ═══════════════════════════════════════════════════════
const stmts = {
  // CASES ────────────────────────────────────────────────
  listCases: db.prepare(`
    SELECT id, niche, name, video_url AS videoUrl, description,
           featured, views, created_at AS createdAt
    FROM cases
    ORDER BY featured DESC, niche ASC, name ASC
  `),
  getCase: db.prepare(`
    SELECT id, niche, name, video_url AS videoUrl, description,
           featured, views, created_at AS createdAt
    FROM cases WHERE id = ?
  `),
  insertCase: db.prepare(`
    INSERT INTO cases (niche, name, video_url, description, featured)
    VALUES (@niche, @name, @videoUrl, @description, @featured)
  `),
  updateCase: db.prepare(`
    UPDATE cases SET
      niche       = @niche,
      name        = @name,
      video_url   = @videoUrl,
      description = @description,
      featured    = @featured,
      updated_at  = datetime('now')
    WHERE id = @id
  `),
  deleteCase: db.prepare(`DELETE FROM cases WHERE id = ?`),
  incrementViews: db.prepare(`UPDATE cases SET views = views + 1 WHERE id = ?`),
  topCases: db.prepare(`
    SELECT id, niche, name, views
    FROM cases
    ORDER BY views DESC
    LIMIT ?
  `),
  countCases: db.prepare(`SELECT COUNT(*) AS total FROM cases`),
  countNiches: db.prepare(`SELECT COUNT(DISTINCT niche) AS total FROM cases`),
  sumViews: db.prepare(`SELECT COALESCE(SUM(views), 0) AS total FROM cases`),

  // LEADS ────────────────────────────────────────────────
  insertLead: db.prepare(`
    INSERT INTO leads (name, phone, niche, case_id, case_name, message, ip, user_agent)
    VALUES (@name, @phone, @niche, @caseId, @caseName, @message, @ip, @userAgent)
  `),
  listLeads: db.prepare(`
    SELECT id, name, phone, niche, case_id AS caseId, case_name AS caseName,
           message, created_at AS createdAt
    FROM leads
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `),
  countLeads: db.prepare(`SELECT COUNT(*) AS total FROM leads`),
  clearLeads: db.prepare(`DELETE FROM leads`),

  // SETTINGS (key/value) ─────────────────────────────────
  getSetting: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  upsertSetting: db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
  listSettings: db.prepare(`SELECT key, value FROM settings`),
};

// ═══════════════════════════════════════════════════════
// HELPERS DE ALTO NÍVEL (usados pelas rotas)
// ═══════════════════════════════════════════════════════
function listCases() {
  return stmts.listCases.all().map(normalizeCase);
}

function getCase(id) {
  const row = stmts.getCase.get(id);
  return row ? normalizeCase(row) : null;
}

function createCase(data) {
  const info = stmts.insertCase.run({
    niche: data.niche,
    name: data.name,
    videoUrl: data.videoUrl || '',
    description: data.description || '',
    featured: data.featured ? 1 : 0,
  });
  return getCase(info.lastInsertRowid);
}

function updateCase(id, data) {
  stmts.updateCase.run({
    id,
    niche: data.niche,
    name: data.name,
    videoUrl: data.videoUrl || '',
    description: data.description || '',
    featured: data.featured ? 1 : 0,
  });
  return getCase(id);
}

function deleteCase(id) {
  return stmts.deleteCase.run(id).changes > 0;
}

function incrementViews(id) {
  return stmts.incrementViews.run(id).changes > 0;
}

function getAnalytics() {
  const total = stmts.countCases.get().total;
  const niches = stmts.countNiches.get().total;
  const views = stmts.sumViews.get().total;
  const leads = stmts.countLeads.get().total;
  const top = stmts.topCases.all(10);
  return { totalCases: total, totalNiches: niches, totalViews: views, totalLeads: leads, topCases: top };
}

function createLead(data) {
  const info = stmts.insertLead.run({
    name: data.name,
    phone: data.phone,
    niche: data.niche || '',
    caseId: data.caseId || null,
    caseName: data.caseName || '',
    message: data.message || '',
    ip: data.ip || '',
    userAgent: data.userAgent || '',
  });
  return { id: info.lastInsertRowid, ...data };
}

function listLeads({ limit = 200, offset = 0 } = {}) {
  return {
    total: stmts.countLeads.get().total,
    items: stmts.listLeads.all(limit, offset),
  };
}

function clearLeads() {
  return stmts.clearLeads.run().changes;
}

// Settings: armazenamos cada chave como JSON (flexibilidade)
function getAllSettings() {
  const out = {};
  for (const row of stmts.listSettings.all()) {
    try { out[row.key] = JSON.parse(row.value); }
    catch { out[row.key] = row.value; }
  }
  return out;
}

function getSetting(key, defaultValue = null) {
  const row = stmts.getSetting.get(key);
  if (!row) return defaultValue;
  try { return JSON.parse(row.value); }
  catch { return row.value; }
}

function setSetting(key, value) {
  const json = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  stmts.upsertSetting.run(key, json);
}

function setManySettings(obj) {
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) setSetting(k, v);
  });
  tx(Object.entries(obj));
}

// ═══════════════════════════════════════════════════════
// NORMALIZADORES
// ═══════════════════════════════════════════════════════
function normalizeCase(row) {
  return {
    ...row,
    featured: !!row.featured,
  };
}

// ═══════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════
module.exports = {
  db,
  listCases,
  getCase,
  createCase,
  updateCase,
  deleteCase,
  incrementViews,
  getAnalytics,
  createLead,
  listLeads,
  clearLeads,
  getAllSettings,
  getSetting,
  setSetting,
  setManySettings,
  _stmts: stmts,
};
