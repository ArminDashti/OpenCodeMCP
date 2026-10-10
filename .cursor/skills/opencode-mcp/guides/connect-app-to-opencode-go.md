# Connect an app to OpenCode Go

## When

- User wants a **third-party app** (not only the OpenCode TUI) to call **OpenCode Go** models.
- User has or will have an **OpenCode Console** Go or Go Plus subscription and an API key.
- User mentions `opencode.ai/zen/go`, `OPENCODE_GO_API_KEY`, ZCode **Model settings**, or custom providers.
- User’s provider list is empty or models fail with **MissingSessionID** / **ZodError** on `provider_config.json`.

## Prerequisites

1. Subscribe to **Go** or **Go Plus** in [OpenCode Console](https://opencode.ai/console).
2. Copy the **OpenCode Go API key** (format often `oc_sk_…`).
3. Store the key in an environment variable the user chooses (canonical name: `OPENCODE_GO_API_KEY`). Example on Armin’s machine: `OPENCODE_GO_API_KEY_DASHTI75` — apps only use it if configured to read that name.
4. Docs: [OpenCode Go](https://opencode.ai/v2/docs/console/go).

## Core connection facts

| Item | Value |
|------|--------|
| Gateway base URL | `https://opencode.ai/zen/go/v1` |
| Auth header | `Authorization: Bearer <API_KEY>` |
| List models | `GET https://opencode.ai/zen/go/v1/models` |
| Protocol | OpenAI-compatible subsets (chat, responses, Anthropic messages) |

**OpenCode TUI only:** after `/connect`, model id form is `opencode-go/<slug>` (e.g. `opencode-go/qwen3.8-flash`).

**Other apps:** use the **bare slug** from the models list (e.g. `qwen3.8-flash`, `gpt-6-luna`), not `opencode-go/…`.

## Pick the correct endpoint for each model

Go routes models by API style. Wrong endpoint → 4xx or silent mis-routing.

| API style | Path suffix | Example models |
|-----------|-------------|----------------|
| Chat Completions | `/chat/completions` | `glm-5.3-flash`, `deepseek-v4.1-flash`, `longcat-2.5-preview-free`, `space-bunny`, `kimi-k3`, … |
| Responses | `/responses` | `gpt-6-luna`, `gpt-5.6-luna`, `grok-4.6`, `grok-4.7`, Muse Spark contributor variants |
| Anthropic Messages | `/messages` | `qwen3.8-flash`, `qwen3.8-max`, `minimax-m3`, `minimax-m2.7`, … |

Full table: [Go docs — Endpoints](https://opencode.ai/v2/docs/console/go#endpoints).

**Rule:** read the official endpoint table for the model slug; do not assume every model uses `/chat/completions`.

## Required client behavior (Go policy)

OpenCode Go expects **coding-agent** traffic. Configure the client to:

1. Send a **stable session id** per conversation in header `x-opencode-session` (reuse for the whole chat).
2. Use a **distinct User-Agent** (e.g. `my-app/1.0`), not a generic HTTP library default.
3. Keep requests typical of agent tools (completions with tools, long context, etc.).

[Validated clients](https://opencode.ai/v2/docs/console/go#validated-clients) include OpenCode, ZCode, Hermes, Claude Code, Codex, Pi, jcode, Kilo Code CLI. Others may work if headers and endpoint match.

## Procedure A — OpenCode TUI

1. Set `OPENCODE_GO_API_KEY` (or user’s env var) in the shell that launches OpenCode.
2. Run OpenCode → `/connect` → choose **OpenCode Go** → paste API key.
3. `/models` → pick `opencode-go/<model-id>`.
4. Verify: `GET …/zen/go/v1/models` with the same key returns the slug.

## Procedure B — Generic OpenAI-compatible app

1. **Base URL:** `https://opencode.ai/zen/go/v1` (some UIs want this without a trailing path; some want `…/v1` only — match the app’s “OpenAI base URL” field).
2. **API key:** paste key or map from env (`OPENCODE_GO_API_KEY` or user-defined name).
3. **Model:** bare slug from `/models` (e.g. `gpt-6-luna`).
4. **API mode:** set **Responses** vs **Chat** vs **Messages** per table above; if the app has only “Chat Completions”, use only chat-routed models.
5. Add custom headers if the app allows:
   - `x-opencode-session: <uuid-per-conversation>`
6. Test:

```bash
curl -sS "https://opencode.ai/zen/go/v1/models" \
  -H "Authorization: Bearer $OPENCODE_GO_API_KEY"

curl -sS "https://opencode.ai/zen/go/v1/chat/completions" \
  -H "Authorization: Bearer $OPENCODE_GO_API_KEY" \
  -H "Content-Type: application/json" \
  -H "x-opencode-session: test-session-1" \
  -H "User-Agent: my-app/1.0" \
  -d '{"model":"longcat-2.5-preview-free","messages":[{"role":"user","content":"ok"}],"max_tokens":8}'
```

Replace chat URL with `/responses` or `/messages` when the model requires it.

## Procedure C — ZCode (Windows)

ZCode does **not** read arbitrary env var names unless the UI or config is pointed at them. **Z.ai / Start Plan** in Model settings are **not** OpenCode Go.

1. **Env (optional source of truth):** set user’s key variable (e.g. `OPENCODE_GO_API_KEY_DASHTI75`) in Windows user/system environment.
2. **Personal provider file:** `%USERPROFILE%\.zcode\v2\provider_config.json` (`schemaVersion: 1`).
3. Add one **provider rule** per ZCode template you need (same API key on each):

| `templateId` | ZCode label | Use for |
|--------------|-------------|---------|
| `opencode-go-chat` | OpenCode Go (Chat) | chat/completions models |
| `opencode-go-messages` | OpenCode Go (Messages) | Qwen, MiniMax, … |
| `opencode-go-responses` | OpenCode Go (Responses) | GPT Luna, Grok, Muse Spark |

4. In each provider’s `config`:
   - `group`: `standard-personal`
   - `access`: `{ "type": "api-key", "apiKey": "<key>" }` — sync from env when rotating keys
   - `personalModelIds`: slugs to expose (e.g. `qwen3.8-flash`, `gpt-6-luna`, `longcat-2.5-preview-free`)
   - `modelOrder`: display order (optional)
5. In `modelConfigRules.providerModelRules`, set `enabled: true/false` per built-in template model. **Do not** duplicate the same `providerId` + `modelId` in `manualProviderModelRules` unless you supply a **full** manual schema (`properties`, `optionSpecs` objects). Incomplete manual rules cause ZCode to **reject the entire file** and show **no custom providers**.
6. Quit ZCode completely → reopen → **Model settings** → refresh.
7. Select models in chat from the OpenCode Go providers (not under Z.ai “Connection mode”).
8. If providers are missing, read `%USERPROFILE%\.zcode\v2\logs\*.log` for `Personal Provider Config 加载失败` and fix Zod errors.

**ZCode built-in catalog may lag** the Go API (e.g. `gpt-6-luna` on API before built-in responses list). Prefer `personalModelIds` for new slugs; avoid broken `manualProviderModelRules`.

## Procedure D — Verify key and model access

1. `GET /zen/go/v1/models` with Bearer key → slug appears in `data[].id`.
2. One minimal completion on the **correct** endpoint with `x-opencode-session`.
3. For ZCode: log line must **not** show provider-config load failure after restart.

## “Free” models on Go (pricing)

- **Token-free (limited time):** `longcat-2.5-preview-free` (Chat endpoint) — see Go pricing table.
- Models with `-free` in the name on **OpenCode Zen** (`opencode-zen-chat`) are **not** Go; separate Zen key and base `https://opencode.ai/zen/v1`.

## Always

1. **Always** use `https://opencode.ai/zen/go/v1` for Go, not Zen pay-as-you-go `…/zen/v1` unless the user explicitly wants Zen.
2. **Always** match model slug to **chat / responses / messages** per official docs.
3. **Always** send `x-opencode-session` for non-TUI clients when the app can set headers.
4. **Always** verify with `/models` before documenting a slug as available.
5. **Always** treat API keys as secrets — never commit `provider_config.json` with keys to git.

## Never

1. **Never** put `opencode-go/` prefix in non-OpenCode-TUI clients unless their docs require it.
2. **Never** assume ZCode’s Z.ai panel is OpenCode Go.
3. **Never** write partial `manualProviderModelRules` in ZCode (missing `properties` / `optionSpecs`) — ZCode drops all personal providers.
4. **Never** store keys in repo-tracked files without user approval.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Empty custom providers in ZCode | `provider_config.json` Zod validation failed | Remove or complete manual rules; check logs |
| `MissingSessionID` | No `x-opencode-session` | Add header or use a validated client |
| Model not in picker | Wrong template (chat vs messages vs responses) | Add provider with correct `templateId` |
| 401 | Wrong or expired key | Console → rotate key → update env and ZCode config |
| Model in API but not ZCode builtin | Catalog lag | `personalModelIds` on the right template |

## Examples

**Env (PowerShell, user scope):**

```powershell
[Environment]::SetEnvironmentVariable(
  'OPENCODE_GO_API_KEY_DASHTI75',
  'oc_sk_…',
  'User'
)
```

**Minimal ZCode provider rule (chat only):**

```json
{
  "providerId": "opencode-go-chat",
  "templateId": "opencode-go-chat",
  "providerName": "OpenCode Go (Chat)",
  "config": {
    "group": "standard-personal",
    "access": { "type": "api-key", "apiKey": "REDACTED" },
    "personalModelIds": ["longcat-2.5-preview-free"],
    "modelOrder": ["longcat-2.5-preview-free"]
  }
}
```

Pair with `opencode-go-messages` + `qwen3.8-flash` and `opencode-go-responses` + `gpt-6-luna` when the user needs those families.

## Reference

- [OpenCode Go documentation](https://opencode.ai/v2/docs/console/go)
- ZCode personal config: `%USERPROFILE%\.zcode\v2\provider_config.json`
- Canonical env name in ecosystem: `OPENCODE_GO_API_KEY` ([providers list](https://opencode.ai/docs/providers))
