# logging-cursor-session-by-armin — SQLite reference

DB path: `<PROJECT>/.armin/logs-db.sqlite`

Pragmas on open: `journal_mode=WAL`, `foreign_keys=ON`.

Schema version: **1** (`schema_meta.version`).

## DDL

```sql
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
```

## Field map

| Param | Column / table |
|-------|----------------|
| `session_id` | `sessions.session_id`, `turns.session_id` |
| `title`, `topic`, `project`, `project_path`, `device`, `ip`, `version` | `sessions.*` |
| `prompt_number`, `prompt`, `response`, `rate`, `model`, `mode`, `duration_ms`, `start_at`, `finished_at`, `tokens` | `turns.*` |
| `tools`, `mcps`, `rules`, `skills`, `hooks`, `subagents` | `turn_items` (`kind` + `name`) |

## Upsert behavior

1. Insert `schema_meta` row `(1)` if table empty; refuse if `version` > supported; migrate later when needed.
2. Upsert `sessions` by `session_id` (refresh title/topic/project fields and `finished_at`; keep existing `ip` / `started_at` when already set).
3. If `prompt_number` omitted: `MAX(prompt_number)+1` for that session (or `1`).
4. Upsert `turns` on `(session_id, prompt_number)`.
5. Delete all `turn_items` for that `turn_id`, then insert the new set.
6. Public IP: if `sessions.ip` is null/empty after upsert intent, fetch `https://api.ipify.org` once; on failure leave null.

## Scripts

Shared DDL lives in `scripts/schema.py` (imported by prepare + upsert).

```text
# Create / verify empty-or-existing DB (no turn rows required)
python scripts/prepare_db.py --db <abs-or-rel-db>

# Upsert one turn
python scripts/upsert_turn.py --db <abs-or-rel-db> --payload <json-file>
# or: ... --payload -   (stdin)
```

Upsert stdout (one line): `{"ok":true,"db":"...","session_id":"...","prompt_number":1,"turn_id":1}`
