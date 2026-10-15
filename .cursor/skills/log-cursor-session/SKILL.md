---
name: log-cursor-session
description: >-
  Logs Cursor session and prompt details to a local SQLite database.
disable-model-invocation: false
metadata:
  version: 1.3.0
  author: "Armin Dashti"
  tags: []
  last_updated: "2026-09-11 15:17:00"
  uuid: 156c9e22-6dda-4b8a-9f36-27e9a5327e68
---
# Log Cursor Session

## Objective
Persist conversation details into a SQLite database located at `<Project_path>/.armin/session-logs.db`. 

## Architecture & Data Safety
- **Standard Normalized Design**: 1:N relational architecture (`sessions` and `prompts` tables).
- **Arrays as JSON**: Arrays (`tools`, `mcps`, `rules`, `skills`, `hooks`, `subagents`) must be stringified JSON.
- **Zero Data Loss**: NEVER `DROP` tables/columns. Use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` for migrations.
- **Cross-Platform**: Use Python (or Node.js) with standard libraries to avoid Windows (cmd/PowerShell) vs. Linux (bash/zsh) syntax errors (like `mkdir -p` or heredocs).
- **Strict Mode**: The `mode` field is strictly limited to: `plan`, `ask`, `agent`, `debug`, `multitask`.

## Agent Execution Steps
1. **Extract**: Gather context data (timestamps, model, prompt, response, used MCPs/Skills, etc.).
2. **Commit**: Write and execute a transient Python script to create the directory, initialize the schema, insert the data, and then delete the script.

## Example Execution (Cross-Platform Python)
Generate and run a temporary file (e.g., `.armin/log_temp.py`) with the following logic, then delete it:

```python
import os, sqlite3, json

# 1. Init Directory
os.makedirs('.armin', exist_ok=True)
db = sqlite3.connect('.armin/session-logs.db')

# 2. Schema Setup
db.executescript("""
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, title TEXT, topic TEXT, project_name TEXT, project_path TEXT, device TEXT, cursor_version TEXT
);
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT REFERENCES sessions(id), prompt_number INTEGER, 
  prompt TEXT, response TEXT, model TEXT, mode TEXT CHECK(mode IN ('plan', 'ask', 'agent', 'debug', 'multitask')), 
  duration_ms INTEGER, start_at TEXT, finished_at TEXT, tools TEXT, mcps TEXT, rules TEXT, skills TEXT, hooks TEXT, subagents TEXT
);
""")

# 3. Insert Data
db.execute("""
INSERT INTO sessions (id, title, topic, project_name, project_path, device, cursor_version)
VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title
""", ('sess_abc123', 'Refactoring DB', 'db', 'my-app', '/Users/armin/my-app', 'ARMIN-MAC', '0.40.1'))

db.execute("""
INSERT INTO prompts (
  session_id, prompt_number, prompt, response, model, mode, duration_ms, start_at, finished_at, 
  tools, mcps, rules, skills, hooks, subagents
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (
  'sess_abc123', 1, 'Update schema', 'Done.', 'claude-3.5-sonnet', 'agent', 4500, 
  '2026-09-11T15:10:00Z', '2026-09-11T15:10:04Z',
  json.dumps(["Shell", "Read"]), json.dumps(["github"]), '[]', json.dumps(["log-cursor-session"]), '[]', '[]'
))

db.commit()
db.close()
```