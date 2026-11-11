# opencode-mcp

An MCP server that puts the **OpenCode agent** under an orchestrator's control. Any MCP
client — Cursor, Claude Code, Codex, a custom harness — can hand work to OpenCode, pick
the model per task, watch the run, and score the result so later assignments get smarter.

Same idea as driving an agent over ACP, but the orchestrator speaks MCP.

```
orchestrator (Cursor / Claude Code / …)
        │  MCP (stdio): assign_task · model · providers · score · sessions
        ▼
   opencode-mcp
        │  HTTP (OpenCode v2 API, /api/*)
        ▼
   opencode serve  ←→  OpenCode Go plan + your configured providers
```

## Tools

| Tool | Purpose |
| --- | --- |
| `assign_task` | Run a prompt; returns `sessionId`, `response`, `duration`, `startedAt`, `finishedAt`. |
| `providers` | Curated provider ids (`provider[]`) — static subset, not a live OpenCode dump. |
| `model` | Search/list models; returns `{ modelId, free }[]`. |
| `score` | Score a session 0–10; returns `{ result: "success" \| "fail" }` (fail sets `isError` + `reason`). |
| `sessions` | Filter sessions; returns `sessionId[]` (default limit 16). |

### Orchestration loop

```
model         →  pick provider + modelId (optionally onlyFreeModels)
assign_task   →  prompt + model (+ harness/directories/filePaths), get sessionId + response
sessions      →  filter recent session ids (optional date / provider / model / harness)
score         →  score sessionId 0–10 → { result: "success" }
```

## Providers

The `providers` tool and dashboard catalog are a **static curated subset** of four
provider ids (see `src/providers.ts`). OpenCode itself may expose many more; use the
`model` tool against a live server to discover what that instance actually has.

| Provider id | Label | Base URL | API key env | Logo |
| --- | --- | --- | --- | --- |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `assets/providers/openrouter.svg` |
| `opencode` | OpenCode Zen | `https://opencode.ai/zen/v1` | `OPENCODE_API_KEY` | `assets/providers/opencode.svg` |
| `opencode-go` | OpenCode Go | `https://opencode.ai/zen/go/v1` | `OPENCODE_GO_API_KEY` | `assets/providers/opencode-go.svg` |
| `openai-compatible` | OpenAI-Compatible (custom) | `{baseURL}` (e.g. `http://127.0.0.1:1234/v1`) | custom | `assets/providers/openai-compatible.svg` |

Key per-provider endpoints (chat / models / catalog) live in `src/providers.ts`
and are served at runtime via `GET /api/providers` (dashboard Providers page)
and the `providers` MCP tool. OpenCode Go endpoints and setup were verified
2026-10-04 against [OpenCode Go docs](https://opencode.ai/v2/docs/console/go)
and `GET https://opencode.ai/zen/go/v1/models`.

### OpenCode Go plan

OpenCode Go is a **$10/mo (Go)** or **$40/mo (Go Plus)** subscription for curated open
coding models. Setup:

1. Subscribe at [OpenCode Console](https://opencode.ai/console) and copy your API key.
2. In OpenCode: `/connect` → OpenCode Go → paste the key; `/models` to pick a model.
3. From MCP, use `provider` `opencode-go` and a model slug (or `opencode-go/<slug>`),
   e.g. `opencode-go/gpt-6-luna`, `opencode-go/space-bunny-free`.

Set `OPENCODE_GO_API_KEY` (preferred). Legacy `OPENCODE_GO_*_API_KEY` names still work
as fallbacks; never commit real keys.

Direct HTTP (OpenAI-compatible): `https://opencode.ai/zen/go/v1` (`/chat/completions`,
`/models`). Coding agents should send `x-opencode-session` per conversation and a
client-specific `User-Agent` (see [Go docs](https://opencode.ai/v2/docs/console/go)).

Optional bundled console catalog: place `src/data/enterprise-providers.json` and run
`node scripts/generate-enterprise-providers.mjs` to refresh `model` metadata.

## Requirements

- Node.js ≥ 18
- OpenCode installed; for Go models subscribe at the Console and connect with `/connect`
  (see [Go plan](https://opencode.ai/v2/docs/console/go); model ids `opencode-go/…`)

## Install

```bash
git clone <this repo> opencode-mcp && cd opencode-mcp
npm install
npm run build          # emits dist/
npm test               # unit checks + integration harness against your running OpenCode
```

## CLI (`opencodemcp`)

On Windows the installer (`scripts/installer-win-x64.ps1`) deploys an
`opencodemcp.cmd` shim and adds `%LOCALAPPDATA%\opencode-mcp` to the User
`PATH`, so `opencodemcp` resolves from any terminal (restart the terminal
after first install). Global `npm install` exposes the same command via the
`opencodemcp` bin entry (`dist/cli.js`).

```text
opencodemcp service start|stop|restart|status
opencodemcp doctor
opencodemcp webui [--port <n>]        # run the local dashboard web UI (opens browser)
opencodemcp webui port [--port <n>]   # show or set the web UI port
opencodemcp api port [--port <n>]     # show or set the API port
opencodemcp update                    # placeholder — not implemented yet
opencodemcp remove                    # placeholder — not implemented yet
opencodemcp help
```

Ports persist in `~/.opencode-mcp/config.json` (defaults: api `4096`,
webui `28479`). The MCP itself still prefers `OPENCODE_URL` when set, then
the background service from `service.json`, then the stored api port.

Running `opencodemcp webui` automatically opens your default browser at the
dashboard URL.

`service start` reports success only after a readiness probe succeeds.
`service stop` treats “already down” (no pid file, not reachable) as success.
`opencodemcp doctor` does not treat a stale `serve.pid` alone as proof that
`service.json` / the server is healthy.

## Data storage

All persistent data lives in a single SQLite database at
`~/.opencode-mcp/opencode-mcp.db` (override with `OPENCODE_MCP_DB`):

- **scores** — score records (auto-migrated once from legacy `scores.json`;
  migration is idempotent and duplicates are deduped)
- **api_keys** — per-provider API keys imported through the WebUI
- **logs** — persisted log ring for the Logs page
- **settings** — WebUI preferences (theme, density, refresh, …)

## WebUI pages

The dashboard (`opencodemcp webui`) includes:

- **Dashboard** — status, recent sessions, agent ranking
- **Tasks** — score records with token/duration enrichment
- **Providers** — provider catalog with color logos; import/delete API keys
- **Skill** — copy or download the `SKILL.md` skill definition for your harness
- **Stats** — aggregate stats: top models, top agents, score distribution
- **Logs** — persisted log viewer with level filter and search
- **Playground** — live MCP tool testing
- **Settings** — tabbed settings (Appearance / Behaviour / App)

## Register with Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "opencode": {
      "command": "node",
      "args": ["C:/Users/<you>/GitHub/OpenCodeMCP/dist/index.js"],
      "env": {
        "OPENCODE_DIRECTORY": "C:/path/to/the/project/agents/should/work/in"
      }
    }
  }
}
```

No password in the config: the server reads the background service's own credential
(`~/.config/opencode/service.json`, written by `opencode service`) and starts that
service if it is not running. Builds that no longer ship `opencode service` fall back
to a detached `opencode serve` on the stored api port (pid in
`~/.opencode-mcp/serve.pid`, managed by `opencodemcp service start|stop`). Set the env
vars below only to point somewhere else.

## How it finds the OpenCode server

1. `OPENCODE_URL` / `OPENCODE_SERVER_URL` if set (explicit; never autostarts).
2. The background service from `~/.config/opencode/service.json` — `{ port, password }`.
3. `opencode service start`, then the freshly written `service.json`.
4. A detached `opencode serve` on the stored api port (fallback for builds without
   `opencode service`), started automatically when autostart is enabled.
5. Otherwise `http://127.0.0.1:4096`.

`opencode serve` instances also work — point `OPENCODE_URL` at them and pass the password
they print (`OPENCODE_PASSWORD`); that password is machine-stored and stable, but it differs
from the background service's.

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENCODE_URL` | discovered | Base URL of the OpenCode server. |
| `OPENCODE_PASSWORD` | from `service.json` | HTTP basic-auth password. |
| `OPENCODE_SERVER_PASSWORD` | — | Alias for `OPENCODE_PASSWORD`. |
| `OPENCODE_USERNAME` | `opencode` | Basic-auth user. |
| `OPENCODE_DIRECTORY` | `process.cwd()` | Project directory tasks run in. |
| `WEBUI_USERNAME` / `WEBUI_PASSWORD` / `WEBUI_EMAIL` | `admin` / `admin` / `admin@local` | Dashboard login (seeded on first run). Override before exposing the dashboard beyond loopback. |
| `OPENCODE_AUTOSTART` | `1` | Allow starting/recovering the background service. Set `0` to disable. |
| `OPENCODE_SERVICE_FILE` | `~/.config/opencode/service.json` | Alternate service credential file. |
| `OPENCODE_SCORES_FILE` | `~/.opencode-mcp/scores.json` | Legacy JSON score store (migrated into SQLite). |
| `OPENCODE_GO_API_KEY` | — | Preferred OpenCode Go API key env var. |
| `OPENCODE_TIMEOUT_MS` | `30000` | Per-request HTTP timeout. |

## Tool reference

### `assign_task`

```jsonc
{
  "prompt": "Add pagination to src/api/users.ts and run the tests",
  "title": "pagination",             // optional: title for a new session
  "provider": "opencode-go",         // optional: pairs with modelId
  "modelId": "gpt-6-luna",           // optional: bare id with provider
  "harness": "build",                // optional: orchester agent id (build | plan | explore | …)
  "directories": "C:/work/app",      // optional: string or string[] (first is used)
  "filePaths": ["C:/work/app/spec.md"] // optional: prompt attachments
}
```

Unknown `provider`/`modelId` combinations fail fast (validated against `/api/model`)
instead of waiting out the idle timeout.

Result: `sessionId`, `response`, `duration` (ms), `startedAt`, `finishedAt`
(`YYYY-MM-DDTHH-MM-SS`).

### `model`

```jsonc
{ "provider": "opencode-go", "model": "luna", "onlyFreeModels": true }
```

Returns `{ model: [{ modelId, free }, ...] }`. A model is `free` only when cost fields
are explicitly all zero, or the model id ends with `-free` / `_free`. Empty `cost: {}`
from OpenCode is treated as **unknown**, not free — so `onlyFreeModels` can filter.

### `providers`

```jsonc
{}
```

Returns `{ provider: ["openrouter", "opencode", "opencode-go", "openai-compatible"] }`.

### `score`

```jsonc
{ "sessionId": "ses_…", "score": 9 }
```

Records quality on a **0–10** scale. Success → `{ "result": "success" }`.
Unknown `sessionId` → `{ "result": "fail", "reason": "…" }` with `isError: true`.

### `sessions`

```jsonc
{
  "fromDate": "2026-11-11T00-00-00",  // optional YYYY-MM-DDTHH-MM-SS
  "toDate": null,
  "provider": "opencode-go",
  "modelId": "gpt-6-luna",
  "harness": "build",
  "limit": 16
}
```

Returns `{ sessionId: ["ses_…", ...] }`. Unparseable `fromDate` / `toDate` values
are rejected with a validation error (they are not silently ignored).

## Driving OpenCode ACP-style

Orchestrators that speak ACP can launch `opencode acp` directly. This MCP is for
orchestrators that speak MCP instead: sessions stay server-side, so several tasks run in
parallel and survive the orchestrator's context window, and it adds what an ACP client does
not provide — model catalogues, score-based ranking, and polling of detached runs.

## Notes on the OpenCode v2 API (things this server works around)

- Everything lives under `/api/*`; unknown paths fall back to the web app's HTML.
- Auth is HTTP basic (`opencode:<password>`); the password is machine-stored and printed
  only the first time a `serve` process generates it.
- `POST /api/session/{id}/prompt` is asynchronous — it returns an inbox item (`timeCreated`).
  The body is flat: `{"text": "…", "files": [...], "delivery": "steer"}` (`text` required).
  A run is finished when the session drops out of `GET /api/session/active` and a reply
  stamped `time.completed` exists at/after the prompt time; builds that still expose
  `session.time.idle >= promptTime` are honoured unchanged.
- `limit` above 200 is rejected (HTTP 400) on session and message listings — the client
  clamps instead of tripping it.
- `GET /api/permission/request` is **location-scoped**: it must be queried with the
  session's directory, or a blocked run is invisible and looks like a hang.
- Model ids are `provider/modelID`, and some providers embed a slash
  (`openrouter/anthropic/claude-…`) — the first slash separates provider from model.

## Tests

`npm test` runs offline unit checks (`test/unit.mjs`) then the integration harness
(`test/harness.mjs`) against a running OpenCode. The harness records timeouts as named
`FAIL` rows instead of crashing. It needs model access for the live path; set
`OPENCODE_URL` / `OPENCODE_PASSWORD` to test against a specific `serve` instance, otherwise
it uses the discovered background service.
