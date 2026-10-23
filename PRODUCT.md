# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Node.js ≥ 18, TypeScript, MCP SDK (`@modelcontextprotocol/sdk`), SQLite (`~/.opencode-mcp/opencode-mcp.db`), single-file embedded WebUI in `src/webui.ts`. Build: `npm run build` → `dist/`. CLI entry: `opencodemcp` / `opencode-mcp`.

## Users

Primary: a solo orchestrator on their own machine—running Cursor, Claude Code, or another MCP client—who delegates coding work to OpenCode while keeping the orchestrator thin (model pick, dispatch, verify, score).

Secondary (out of scope for UX priority unless stated later): open-source integrators wiring this MCP server into their harnesses.

## Product Purpose

Make OpenCode operable as a **remote worker** under an orchestrator: assign tasks, list models and providers, poll or block on runs, score outcomes, and inspect sessions—without the orchestrator reimplementing OpenCode’s HTTP API, auth, or idle semantics.

Success means reliable dispatch and recovery on a local Windows/macOS/Linux dev machine, clear visibility in the dashboard WebUI, and a tight MCP tool surface the orchestrator can loop on (`models_list` → `assign_task` → `fetch_session` → `score_to_agent`).

## Positioning

An MCP-native control plane for OpenCode—not a replacement for ACP/`opencode acp`, and not a second agent runtime. It adds orchestration affordances OpenCode alone does not standardize: provider catalog with env-key hints, score-based ranking, blocking wait on idle, SQLite-backed keys and scores, and a local operator dashboard.

## Operating Context

- Orchestrator registers MCP stdio (`node dist/index.js`) with `OPENCODE_DIRECTORY` pointing at the repo agents should touch.
- OpenCode may run as a managed background service or explicit `opencode serve`; this server discovers credentials via `service.json` or env (`OPENCODE_URL`, `OPENCODE_PASSWORD`).
- Operator uses `opencodemcp webui` for providers, keys, sessions, logs, playground, and settings (themes, density, refresh).
- Integration tests: `npm test` against a live OpenCode instance.

## Capabilities and Constraints

**MCP tools:** `assign_task`, `models_list`, `providers_list`, `score_to_agent`, `fetch_session`.

**Behaviors:** optional session continuation; `wait` default true; `autoApprove` for permissions; provider/model normalization; OpenCode v2 `/api/*` quirks handled (async prompt, idle detection, listing limits).

**CLI:** service lifecycle, doctor, WebUI port, API port (see README).

**Constraints:** requires OpenCode installed; Go-tier models need subscription and keys via documented env vars; secrets live in env, SQLite, or WebUI import—not in repo.

**Terminology:** `orchester` / agent modes (`build`, `plan`, `explore`, …); provider ids as in `src/providers.ts` and README.

**Undecided:** public positioning beyond personal use; commercial/support model; hosted deployment story (product is local-first today).

## Brand Commitments

- Product name: **opencode-mcp** / CLI **opencodemcp**; dashboard title “opencodemcp orchestrator dashboard”.
- MIT license; honest docs—no invented benchmarks, customers, or pricing.
- Voice: direct, integrator-friendly, technical accuracy over marketing (README is the reference tone).

## Evidence on Hand

- `README.md` — install, env table, tool schemas, provider matrix, orchestration loop.
- `package.json` — package identity and scripts.
- `assets/providers/*.svg` — provider logos referenced in WebUI.
- `skills/` / bundled `SKILL.md` — delegation guidance for harnesses.
- No fabricated testimonials, case studies, or production SLAs; do not invent them in future surfaces.

## Product Principles

1. **Orchestrator stays thin** — delegate execution to OpenCode; MCP tools carry the loop, not ad-hoc HTTP in the harness.
2. **Local operator truth** — dashboard and SQLite reflect what is actually configured on this machine (keys, scores, sessions).
3. **Fail visibly** — auth, reachability, and idle/timeouts surface as actionable errors (doctor, logs, MCP errors).
4. **API fidelity** — respect OpenCode v2 semantics; work around documented quirks in one place (`src/opencode.ts`, `src/render.ts`).
5. **No secret leakage** — keys and passwords never belong in chat, skills, or git.

## Accessibility & Inclusion

WebUI targets desktop operators; theme system includes multiple presets and system preference. No formal WCAG target established yet—treat keyboard focus and contrast as requirements when redesigning Operate surfaces.
