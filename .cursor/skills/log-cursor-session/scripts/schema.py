"""Shared SQLite schema for logging-cursor-session-by-armin (stdlib only)."""

from __future__ import annotations

import json
import sqlite3
import sys

SCHEMA_VERSION = 1

DDL = """
CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id   TEXT PRIMARY KEY,
  title        TEXT,
  topic        TEXT,
  project      TEXT,
  project_path TEXT,
  device       TEXT,
  ip           TEXT,
  version      TEXT,
  started_at   TEXT,
  finished_at  TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  prompt_number INTEGER NOT NULL,
  prompt        TEXT NOT NULL,
  response      TEXT,
  rate          INTEGER,
  model         TEXT,
  mode          TEXT,
  duration_ms   INTEGER,
  start_at      TEXT,
  finished_at   TEXT,
  tokens        INTEGER,
  UNIQUE (session_id, prompt_number)
);

CREATE TABLE IF NOT EXISTS turn_items (
  turn_id INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL CHECK (kind IN ('tool', 'mcp', 'rule', 'skill', 'hook', 'subagent')),
  name    TEXT NOT NULL,
  PRIMARY KEY (turn_id, kind, name)
);

CREATE INDEX IF NOT EXISTS idx_turns_finished_at ON turns(finished_at);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_turn_items_kind_name ON turn_items(kind, name);
"""


def die(msg: str, code: int = 1) -> None:
    print(json.dumps({"ok": False, "error": msg}), file=sys.stderr)
    raise SystemExit(code)


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(DDL)
    row = conn.execute("SELECT version FROM schema_meta LIMIT 1").fetchone()
    if row is None:
        conn.execute("INSERT INTO schema_meta (version) VALUES (?)", (SCHEMA_VERSION,))
        return
    version = int(row[0])
    if version > SCHEMA_VERSION:
        die(f"DB schema version {version} is newer than script {SCHEMA_VERSION}")
    if version < SCHEMA_VERSION:
        die(f"DB schema version {version} needs migration to {SCHEMA_VERSION} (none defined)")
