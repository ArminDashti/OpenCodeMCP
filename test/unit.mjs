#!/usr/bin/env node
/**
 * Offline unit checks (no live OpenCode required).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");
/** Absolute filesystem paths are not valid ESM import specifiers on Windows (c:). */
const distImport = (name) => pathToFileURL(path.join(dist, name)).href;

const { costIsFree, modelRowIsFree, filterSessionIds, parseCompactTimestamp } = await import(
  distImport("mcp-api.js"),
);
const { closeDb, openDb, allScores, insertScore, dedupeScores } = await import(distImport("db.js"));
const { loadDotenvFiles, resolveOpencodeGoApiKey } = await import(distImport("go-api-key.js"));

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
    console.log(`FAIL  ${name} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

check("costIsFree: empty object is not free", () => {
  assert.equal(costIsFree({}), false);
});
check("costIsFree: null/undefined/non-object are not free", () => {
  assert.equal(costIsFree(null), false);
  assert.equal(costIsFree(undefined), false);
  assert.equal(costIsFree("free"), false);
});
check("costIsFree: explicit zeros are free", () => {
  assert.equal(costIsFree({ input: 0, output: 0 }), true);
});
check("costIsFree: any positive field is not free", () => {
  assert.equal(costIsFree({ input: 0, output: 1.5 }), false);
});
check("modelRowIsFree: empty cost + normal id is not free", () => {
  assert.equal(modelRowIsFree({ id: "google/gemini-2.5-pro", cost: {} }), false);
});
check("modelRowIsFree: -free slug counts as free when cost unknown", () => {
  assert.equal(modelRowIsFree({ id: "opencode-go/space-bunny-free", cost: {} }), true);
});

check("parseCompactTimestamp: valid compact form", () => {
  assert.notEqual(parseCompactTimestamp("2026-11-11T20-26-00"), null);
});
check("parseCompactTimestamp: garbage → null", () => {
  assert.equal(parseCompactTimestamp("not-a-date"), null);
});
check("filterSessionIds: invalid fromDate throws", () => {
  assert.throws(() => filterSessionIds([], { fromDate: "not-a-date" }), /fromDate/);
});
check("filterSessionIds: invalid toDate throws", () => {
  assert.throws(() => filterSessionIds([], { toDate: "nope" }), /toDate/);
});

check("score migration is idempotent + dedupes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ocmcp-db-"));
  const dbFile = path.join(tmp, "test.db");
  const scoresFile = path.join(tmp, "scores.json");
  const records = [
    {
      ts: 1000,
      agent: "build",
      orchester: "build",
      score: 80,
      sessionID: "ses_a",
      model: "opencode-go/gpt-6-luna",
      task: "t1",
    },
    {
      ts: 2000,
      agent: "plan",
      orchester: "plan",
      score: 70,
      sessionID: "ses_b",
      model: "opencode-go/gpt-6-luna",
      task: "t2",
    },
  ];
  fs.writeFileSync(scoresFile, JSON.stringify({ version: 1, records }, null, 2));

  process.env.OPENCODE_MCP_DB = dbFile;
  process.env.OPENCODE_SCORES_FILE = scoresFile;
  closeDb();
  openDb();
  const first = allScores().length;
  assert.equal(first, 2, `expected 2 after first migrate, got ${first}`);

  // Unique index should reject a duplicate natural key from insertScore.
  assert.throws(
    () =>
      insertScore({
        ts: 1000,
        agent: "build",
        score: 80,
        sessionID: "ses_a",
        model: "opencode-go/gpt-6-luna",
        task: "t1",
      }),
    /UNIQUE|unique/i,
  );
  assert.equal(allScores().length, 2);

  closeDb();
  openDb();
  const second = allScores().length;
  assert.equal(second, 2, `expected still 2 after re-open, got ${second}`);

  // Force duplicates by deleting unique index path: raw insert without constraint is hard;
  // exercise dedupeScores directly after temporarily inserting via SQL.
  const database = openDb();
  database.exec("DROP INDEX IF EXISTS idx_scores_natural");
  database
    .prepare(
      `INSERT INTO scores (ts, agent, score, sessionID, model, task, feedback, orchester, provider, durationMs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(1000, "build", 80, "ses_a", "opencode-go/gpt-6-luna", "t1", null, "build", null, null);
  assert.equal(allScores().length, 3);
  const removed = dedupeScores(database);
  assert.equal(removed, 1);
  assert.equal(allScores().length, 2);

  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.OPENCODE_MCP_DB;
  delete process.env.OPENCODE_SCORES_FILE;
});

check("resolveOpencodeGoApiKey: prefers portable then pattern", () => {
  // Hydrate dotenv once first — otherwise clearing env and then calling
  // resolveOpencodeGoApiKey() would reload real keys from ~/.opencode-mcp/.env etc.
  loadDotenvFiles();

  const goKeyRe = /^OPENCODE_GO/i;
  const saved = {};
  for (const k of Object.keys(process.env)) {
    if (goKeyRe.test(k)) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  }

  /** Compare without assert.equal so failure messages never echo secret values. */
  const expectResolved = (label, expected) => {
    const actual = resolveOpencodeGoApiKey();
    if (actual !== expected) {
      throw new Error(
        `${label}: resolved unexpected key ` +
          `(got len=${actual == null ? "null" : actual.length}, expected len=${expected.length}; values redacted)`,
      );
    }
  };

  try {
    process.env.OPENCODE_GO_TEAM_API_KEY = "pattern-key-value";
    expectResolved("pattern-only", "pattern-key-value");

    process.env.OPENCODE_GO_ARMIN_DOPAMINE_GMAIL_API_KEY = "legacy-key";
    expectResolved("legacy-over-pattern", "legacy-key");

    process.env.OPENCODE_GO_API_KEY = "portable-key";
    // Portable name must win over legacy personal vars when both are set.
    expectResolved("portable-over-legacy", "portable-key");
  } finally {
    for (const k of Object.keys(process.env)) {
      if (goKeyRe.test(k)) delete process.env[k];
    }
    Object.assign(process.env, saved);
  }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} unit checks passed`);
if (failed.length) process.exitCode = 1;
