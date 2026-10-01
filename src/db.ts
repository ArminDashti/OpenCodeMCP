import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * SQLite-backed local store for opencodemcp.
 *
 * Replaces the ad-hoc JSON files (scores.json, webui-settings.json) with a
 * single embedded database so the WebUI has a real, queryable data layer:
 *
 *   scores   — score_to_agent records (migrated from the legacy JSON store)
 *   api_keys — per-provider API keys imported through the WebUI
 *   logs     — in-memory ring buffer persisted to disk for the Logs page
 *   settings — WebUI preferences (theme, density, refresh, …)
 *
 * The DB lives at ~/.opencode-mcp/opencode-mcp.db by default and can be
 * overridden with OPENCODE_MCP_DB.
 */

export interface ScoreRow {
  id: number;
  ts: number;
  agent: string;
  score: number;
  sessionID: string | null;
  model: string | null;
  task: string | null;
  feedback: string | null;
  orchester: string | null;
  provider: string | null;
  durationMs: number | null;
}

export interface ApiKeyRow {
  provider: string;
  label: string;
  envKey: string;
  updatedAt: number;
}

export interface LogRow {
  id: number;
  ts: number;
  level: string;
  source: string;
  message: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

let db: DatabaseSync | null = null;

export function dbPath(): string {
  return (
    process.env.OPENCODE_MCP_DB ??
    path.join(os.homedir(), ".opencode-mcp", "opencode-mcp.db")
  );
}

function legacyScoresFile(): string {
  return (
    process.env.OPENCODE_SCORES_FILE ??
    path.join(os.homedir(), ".opencode-mcp", "scores.json")
  );
}

function migrateScores(database: DatabaseSync): void {
  const file = legacyScoresFile();
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return; // nothing to migrate
  }
  const records = (raw as { records?: unknown[] })?.records;
  if (!Array.isArray(records) || records.length === 0) return;
  const ins = database.prepare(
    `INSERT OR IGNORE INTO scores
       (ts, agent, score, sessionID, model, task, feedback, orchester, provider, durationMs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let inserted = 0;
  for (const r of records) {
    const rec = r as Record<string, unknown>;
    const agent = String(rec.orchester ?? rec.agent ?? "");
    if (!agent) continue;
    const info = ins.run(
      typeof rec.ts === "number" ? rec.ts : Date.now(),
      agent,
      typeof rec.score === "number" ? rec.score : 0,
      typeof rec.sessionID === "string" ? rec.sessionID : null,
      typeof rec.model === "string" ? rec.model : null,
      typeof rec.task === "string" ? rec.task : null,
      typeof rec.feedback === "string" ? rec.feedback : null,
      typeof rec.orchester === "string" ? rec.orchester : null,
      typeof rec.provider === "string" ? rec.provider : null,
      typeof rec.durationMs === "number" ? rec.durationMs : null,
    );
    inserted += Number(info.changes);
  }
  if (inserted > 0) {
    console.error(`opencode-mcp: migrated ${inserted} score records from ${file}`);
  }
}

export function openDb(): DatabaseSync {
  if (db) return db;
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      agent      TEXT NOT NULL,
      score      REAL NOT NULL,
      sessionID  TEXT,
      model      TEXT,
      task       TEXT,
      feedback   TEXT,
      orchester  TEXT,
      provider   TEXT,
      durationMs REAL
    );
    CREATE INDEX IF NOT EXISTS idx_scores_agent ON scores(agent);
    CREATE INDEX IF NOT EXISTS idx_scores_ts ON scores(ts);
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      provider  TEXT PRIMARY KEY,
      label     TEXT NOT NULL,
      envKey    TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      INTEGER NOT NULL,
      level   TEXT NOT NULL,
      source  TEXT NOT NULL,
      message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  migrateScores(database);
  db = database;
  return database;
}

// ---------------------------------------------------------------------------
// scores
// ---------------------------------------------------------------------------

export function insertScore(rec: {
  ts?: number;
  agent: string;
  score: number;
  sessionID?: string | null;
  model?: string | null;
  task?: string | null;
  feedback?: string | null;
  orchester?: string | null;
  provider?: string | null;
  durationMs?: number | null;
}): ScoreRow {
  const database = openDb();
  const ts = rec.ts ?? Date.now();
  const info = database
    .prepare(
      `INSERT INTO scores (ts, agent, score, sessionID, model, task, feedback, orchester, provider, durationMs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ts,
      rec.agent,
      rec.score,
      rec.sessionID ?? null,
      rec.model ?? null,
      rec.task ?? null,
      rec.feedback ?? null,
      rec.orchester ?? null,
      rec.provider ?? null,
      rec.durationMs ?? null,
    );
  return {
    id: Number(info.lastInsertRowid),
    ts,
    agent: rec.agent,
    score: rec.score,
    sessionID: rec.sessionID ?? null,
    model: rec.model ?? null,
    task: rec.task ?? null,
    feedback: rec.feedback ?? null,
    orchester: rec.orchester ?? null,
    provider: rec.provider ?? null,
    durationMs: rec.durationMs ?? null,
  };
}

export function allScores(): ScoreRow[] {
  return openDb()
    .prepare(
      `SELECT id, ts, agent, score, sessionID, model, task, feedback, orchester, provider, durationMs
       FROM scores ORDER BY ts DESC, id DESC`,
    )
    .all() as unknown as ScoreRow[];
}

export function clearScores(): void {
  openDb().prepare("DELETE FROM scores").run();
}

// ---------------------------------------------------------------------------
// api keys
// ---------------------------------------------------------------------------

export function getApiKey(provider: string): ApiKeyRow | null {
  const row = openDb()
    .prepare("SELECT provider, label, envKey, updatedAt FROM api_keys WHERE provider = ?")
    .get(provider) as ApiKeyRow | undefined;
  return row ?? null;
}

export function listApiKeys(): ApiKeyRow[] {
  return openDb()
    .prepare("SELECT provider, label, envKey, updatedAt FROM api_keys ORDER BY provider")
    .all() as unknown as ApiKeyRow[];
}

export function upsertApiKey(provider: string, label: string, envKey: string): ApiKeyRow {
  openDb()
    .prepare(
      `INSERT INTO api_keys (provider, label, envKey, updatedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET label = excluded.label, envKey = excluded.envKey, updatedAt = excluded.updatedAt`,
    )
    .run(provider, label, envKey, Date.now());
  return { provider, label, envKey, updatedAt: Date.now() };
}

export function deleteApiKey(provider: string): void {
  openDb().prepare("DELETE FROM api_keys WHERE provider = ?").run(provider);
}

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

export function insertLog(level: string, source: string, message: string): void {
  openDb()
    .prepare("INSERT INTO logs (ts, level, source, message) VALUES (?, ?, ?, ?)")
    .run(Date.now(), level, source, message);
}

export function listLogs(limit: number): LogRow[] {
  return openDb()
    .prepare(
      "SELECT id, ts, level, source, message FROM logs ORDER BY ts DESC, id DESC LIMIT ?",
    )
    .all(limit) as unknown as LogRow[];
}

export function clearLogs(): void {
  openDb().prepare("DELETE FROM logs").run();
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

export function getSetting(key: string): string | null {
  const row = openDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as SettingRow | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  openDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function allSettings(): Record<string, string> {
  const rows = openDb().prepare("SELECT key, value FROM settings").all() as unknown as SettingRow[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
