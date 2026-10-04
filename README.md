# opencode-mcp

An MCP server that puts the **OpenCode agent** under an orchestrator's control. Any MCP
client — Cursor, Claude Code, Codex, a custom harness — can hand work to OpenCode, pick
the model per task, watch the run, and score the result so later assignments get smarter.

Same idea as driving an agent over ACP, but the orchestrator speaks MCP.

```
orchestrator (Cursor / Claude Code / …)
        │  MCP (stdio): assign_task · models_list · score_to_agent · fetch_session
        ▼
   opencode-mcp
        │  HTTP (OpenCode v2 API, /api/*)
        ▼
   opencode serve  ←→  OpenCode Go plan + your configured providers
```

## Tools

| Tool | Purpose |
| --- | --- |
| `assign_task` | Give OpenCode a task. Creates a session (or continues one), sets agent/model/directory, optionally attaches files, and by default **blocks until the run goes idle**, returning the agent's reply, tool-call count, tokens and cost. |
| `models_list` | The models the orchestrator may choose from — `provider/model` id, context window, output limit, tool support, variants (effort tiers), price, availability, plus the current server default. |
| `providers_list` | Supported providers with verified base URLs, key endpoints, API-key env vars, docs links and transparent logo files. |
| `score_to_agent` | Record how well an agent handled a task (0–100) and get back the per-agent ranking. Scores persist locally so assignment decisions can be made on evidence. |
| `fetch_session` | List sessions, or read one in detail: status, agent, model, cost, tokens and a compact transcript including tool calls. Use it to poll a `wait:false` dispatch or review work before scoring. |

### Orchestration loop

```
models_list   →  pick "provider/model" for the task
assign_task   →  task + model (+ agent/directory), get sessionID + reply
fetch_session →  inspect transcript / poll a background dispatch
score_to_agent(agent, score, sessionID)  →  ranking → next assignment
```

## Providers

Supported provider ids (use as `provider` in `assign_task` / `models_list`, or
via the `providers_list` MCP tool and the dashboard's Providers page):

| Provider id | Label | Base URL | API key env | Logo |
| --- | --- | --- | --- | --- |
| `openai` | OpenAI | `https://api.openai.com/v1` | `OPENAI_API_KEY` | `assets/providers/openai.svg` |
| `anthropic` | Claude (Anthropic) | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | `assets/providers/claude.svg` |
| `google` | Google (Gemini) | `https://generativelanguage.googleapis.com` | `GEMINI_API_KEY` (`GOOGLE_API_KEY`) | `assets/providers/google.svg` |
| `mistral` | Mistral AI | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` | `assets/providers/mistral.svg` |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `assets/providers/openrouter.svg` |
| `opencode` | OpenCode Zen | `https://opencode.ai/zen/v1` | `OPENCODE_API_KEY` | `assets/providers/opencode.svg` |
| `opencode-go` | OpenCode Go | `https://opencode.ai/zen/go/v1` | `OPENCODE_GO_API_KEY` (`OPENCODE_API_KEY`) | `assets/providers/opencode-go.svg` |
| `ollama` | Ollama (local) | `http://localhost:11434` | none (optional `OLLAMA_API_KEY`) | `assets/providers/ollama.svg` |
| `openai-compatible` | OpenAI-Compatible (custom) | `{baseURL}` (e.g. `http://127.0.0.1:1234/v1`) | custom | `assets/providers/openai-compatible.svg` |
| `xai` | xAI (Grok) | `https://api.x.ai/v1` | `XAI_API_KEY` | `assets/providers/xai.svg` |
| `deepseek` | DeepSeek | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` | `assets/providers/deepseek.svg` |
| `groq` | Groq | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` | `assets/providers/groq.svg` |
| `perplexity` | Perplexity | `https://api.perplexity.ai` | `PERPLEXITY_API_KEY` | `assets/providers/perplexity.svg` |
| `cohere` | Cohere | `https://api.cohere.com/v2` | `COHERE_API_KEY` | `assets/providers/cohere.svg` |

Key per-provider endpoints (chat / models / catalog) live in `src/providers.ts`
and are served at runtime via `GET /api/providers` (dashboard Providers page)
and the `providers_list` MCP tool. OpenCode Go endpoints and setup were verified
2026-10-04 against [OpenCode Go docs](https://opencode.ai/v2/docs/console/go)
and `GET https://opencode.ai/zen/go/v1/models`. Other providers were verified
2026-09-30 (docs URLs in the same file).
All logos except `opencode-official-favicon.svg` are transparent-background SVGs.

### OpenCode Go plan

OpenCode Go is a **$10/mo (Go)** or **$40/mo (Go Plus)** subscription for curated open
coding models. Setup:

1. Subscribe at [OpenCode Console](https://opencode.ai/console) and copy your API key.
2. In OpenCode: `/connect` → OpenCode Go → paste the key; `/models` to pick a model.
3. From MCP, use `provider` `opencode-go` and a model slug (or `opencode-go/<slug>`),
   e.g. `opencode-go/gpt-6-luna`, `opencode-go/space-bunny-free`.

Direct HTTP (OpenAI-compatible): `https://opencode.ai/zen/go/v1` (`/chat/completions`,
`/models`). Coding agents should send `x-opencode-session` per conversation and a
client-specific `User-Agent` (see [Go docs](https://opencode.ai/v2/docs/console/go)).

Optional bundled console catalog: place `src/data/enterprise-providers.json` and run
`node scripts/generate-enterprise-providers.mjs` to refresh `models_list` metadata.

## Requirements

- Node.js ≥ 18
- OpenCode installed; for Go models subscribe at the Console and connect with `/connect`
  (see [Go plan](https://opencode.ai/v2/docs/console/go); model ids `opencode-go/…`)

## Install

```bash
git clone <this repo> opencode-mcp && cd opencode-mcp
npm install
npm run build          # emits dist/
npm test               # integration harness against your running OpenCode
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
webui `8090`). The MCP itself still prefers `OPENCODE_URL` when set, then
the background service from `service.json`, then the stored api port.

Running `opencodemcp webui` automatically opens your default browser at the
dashboard URL.

## Data storage

All persistent data lives in a single SQLite database at
`~/.opencode-mcp/opencode-mcp.db` (override with `OPENCODE_MCP_DB`):

- **scores** — `score_to_agent` records (auto-migrated from the legacy
  `scores.json` on first run)
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
| `OPENCODE_AUTOSTART` | `1` | Allow starting/recovering the background service. Set `0` to disable. |
| `OPENCODE_SERVICE_FILE` | `~/.config/opencode/service.json` | Alternate service credential file. |
| `OPENCODE_SCORES_FILE` | `~/.opencode-mcp/scores.json` | Score store for `score_to_agent`. |
| `OPENCODE_TIMEOUT_MS` | `30000` | Per-request HTTP timeout. |

## Tool reference

### `assign_task`

```jsonc
{
  "task": "Add pagination to src/api/users.ts and run the tests",
  "sessionID": "ses_…",              // optional: continue an existing session
  "title": "pagination",             // optional: title for a new session
  "orchester": "build",              // optional: build | plan | explore | … (agent is a deprecated alias)
  "provider": "opencode-go",         // optional: pairs with model
  "model": "gpt-6-luna",             // optional: bare id with provider, or "provider/model" for compatibility
  "variant": "high",                 // optional: effort tier of that model
  "directory": "C:/work/app",        // optional: project directory
  "files": ["C:/work/app/spec.md"],  // optional: prompt attachments
  "delivery": "steer",               // optional: "steer" (default) | "queue" when busy
  "autoApprove": false,              // optional: answer permission requests with "once"
  "wait": true,                      // optional: default true; false = fire and forget
  "timeoutMs": 180000                // optional: wait budget
}
```

Result highlights: `status` (`completed` | `blocked` | `timeout` | `failed` | `dispatched`),
`reply`, `toolCalls`, `cost`, `tokens`, `outcome`, `elapsedMs`, `transcript`.

`status: "blocked"` means the run hit a permission the server would ask a human about; the
response carries `pendingPermission` (`action`, `resources`), and the orchestrator either
replies with `once`/`always`/`reject` through OpenCode's permission API or re-assigns with
`autoApprove: true`.

### `models_list`

```jsonc
{ "provider": "opencode-go", "search": "luna", "enabledOnly": true,
  "detail": "full", "limit": 50 }
```

Returns `default`, `totalMatched`, `returned` and `models[]` with
`id` (`provider/modelID`), `provider`/`providerID`, `model`/`modelID`, `context`, `maxOutput`, `tools`,
`variants`, `status`, `enabled`, `isDefault`, plus evidence from past runs:
`scoreCount`, `averageScore`, `lastScore`, `avgTaskMs`/`avgTaskTime` (average time of doing a task).
Large result sets are trimmed to fit the MCP response budget and flagged
`truncated`.

### `score_to_agent`

```jsonc
{ "orchester": "build", "score": 92, "sessionID": "ses_…",
  "provider": "opencode-go", "model": "gpt-6-luna", "durationMs": 45000,
  "feedback": "clean diff, tests added",
  "task": "pagination", "includeRanking": true }
```

Returns the stored record, this agent's `agentStats` (`count`, `average`, `last`, `min`,
`max`) and the full `ranking` (best first) plus `bestAgent`. Scores live in
`OPENCODE_SCORES_FILE` (default `~/.opencode-mcp/scores.json`, capped at 5000 records).

### `fetch_session`

```jsonc
{ "sessionID": "ses_…",   // omit to list sessions
  "limit": 200, "order": "asc",
  "includeMessages": true, "includePermissions": true, "runningOnly": false }
```

List mode returns `count`, `running`, `sessions[]` (id, title, agent, model, outcome, cost,
tokens, timestamps). Read mode returns `session`, `running`, `messages[]` (user text,
assistant text, reasoning summary, tool calls with status, idle markers) and
`pendingPermissions` when a run is waiting on a decision.

## Driving OpenCode ACP-style

Orchestrators that speak ACP can launch `opencode acp` directly. This MCP is for
orchestrators that speak MCP instead: sessions stay server-side, so several tasks run in
parallel and survive the orchestrator's context window, and it adds what an ACP client does
not provide — model catalogues, score-based agent ranking, and polling of detached runs.

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

`npm test` drives the built server over MCP stdio and exercises all five tools against a
running OpenCode: session creation, blocking and detached runs, transcript polling, scoring,
error surfacing and output-budget trimming. It needs model access; set
`OPENCODE_URL` / `OPENCODE_PASSWORD` to test against a specific `serve` instance, otherwise
it uses the discovered background service.
