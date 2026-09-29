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
| `score_to_agent` | Record how well an agent handled a task (0–100) and get back the per-agent ranking. Scores persist locally so assignment decisions can be made on evidence. |
| `fetch_session` | List sessions, or read one in detail: status, agent, model, cost, tokens and a compact transcript including tool calls. Use it to poll a `wait:false` dispatch or review work before scoring. |

### Orchestration loop

```
models_list   →  pick "provider/model" for the task
assign_task   →  task + model (+ agent/directory), get sessionID + reply
fetch_session →  inspect transcript / poll a background dispatch
score_to_agent(agent, score, sessionID)  →  ranking → next assignment
```

## Requirements

- Node.js ≥ 18
- OpenCode installed and authenticated (`opencode auth login`; the OpenCode Go plan works
  with the `opencode-go/…` model ids)

## Install

```bash
git clone <this repo> opencode-mcp && cd opencode-mcp
npm install
npm run build          # emits dist/
npm test               # integration harness against your running OpenCode
```

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
service if it is not running. Set the env vars below only to point somewhere else.

## How it finds the OpenCode server

1. `OPENCODE_URL` / `OPENCODE_SERVER_URL` if set (explicit; never autostarts).
2. The background service from `~/.config/opencode/service.json` — `{ port, password }`.
3. `opencode service start`, then the freshly written `service.json`.
4. Otherwise `http://127.0.0.1:4096`.

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
  "agent": "build",                  // optional: build | plan | explore | …
  "model": "opencode-go/gpt-6-luna", // optional: pick from models_list
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
`id` (`provider/modelID`), `providerID`, `modelID`, `context`, `maxOutput`, `tools`,
`variants`, `status`, `enabled`, `isDefault` (plus `cost` and `capabilities` in `full`
detail). Large result sets are trimmed to fit the MCP response budget and flagged
`truncated`.

### `score_to_agent`

```jsonc
{ "agent": "build", "score": 92, "sessionID": "ses_…",
  "model": "opencode-go/gpt-6-luna", "feedback": "clean diff, tests added",
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
- `POST /api/session/{id}/prompt` is asynchronous — it returns an inbox item. A run is
  finished when `session.time.idle >= promptTime`; transcripts then gain an `idle` message
  carrying `outcome`.
- `limit` above 200 is rejected (HTTP 400) on session and message listings — the client
  clamps instead of tripping it.
- `GET /api/permission/request` is **location-scoped**: it must be queried with the
  session's directory, or a blocked run is invisible and looks like a hang.
- Model ids are `provider/modelID`, and some providers embed a slash
  (`openrouter/anthropic/claude-…`) — the first slash separates provider from model.

## Tests

`npm test` drives the built server over MCP stdio and exercises all four tools against a
running OpenCode: session creation, blocking and detached runs, transcript polling, scoring,
error surfacing, output-budget trimming and permission handling. It needs model access; set
`OPENCODE_URL` / `OPENCODE_PASSWORD` to test against a specific `serve` instance, otherwise
it uses the discovered background service.
