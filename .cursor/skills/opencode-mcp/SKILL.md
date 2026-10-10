---
name: opencode-mcp
description: >-
  OpenCode via MCP and OpenCode Go. (1) Delegate: use when work must go through
  OpenCode MCP and Cursor only orchestrates: rewrite the human ask into a
  concrete worker prompt, assign_task, and check whether the reply is DONE;
  keep Cursor tokens as low as possible without weakening the packet or the
  verdict. Triggers: "use the skill", "assign this to OpenCode", "let OpenCode
  do X", "which model should handle this", multi-file changes, long refactors,
  parallel workstreams, "run this in the projects"; also restoring/maintaining
  the OpenCode MCP server (tool missing, 401, unreachable). Do not use for work
  Cursor should do itself. (2) Connect: wire any coding agent or
  OpenAI-compatible app (ZCode, Cursor, Claude Code, Codex, Hermes, custom
  client, OpenCode TUI) to an OpenCode Go subscription (zen/go/v1): API key,
  base URL, model IDs per endpoint type, required headers, ZCode
  provider_config.json, verification, common failures (MissingSessionID,
  ZodError, empty provider list, OPENCODE_GO_API_KEY).
disable-model-invocation: false
metadata:
  version: 3.0.0
  author: "Armin Dashti"
  category: integration
  tags: [opencode, mcp, orchestrator, delegation, token-budget, models, verify, retry, human-escalation, reply-protocol, autoApprove, rules-extract, opencode-go, zen-go, api-key, zcode, openai-compatible, model-provider]
  last_updated: "2026-10-09 17:38:34"
  uuid: c5b16077-87bd-469a-ad72-a9e02550a216
---
# OpenCode MCP

Two topics. Read only the guide that matches the task.

| Task | Guide |
| --- | --- |
| Delegate work to OpenCode through the MCP (Cursor orchestrates only); MCP setup, client registration, recovery | [guides/delegate-via-mcp.md](guides/delegate-via-mcp.md) |
| Connect an app or agent (ZCode, Cursor, Claude Code, Codex, Hermes, custom, OpenCode TUI) to OpenCode Go | [guides/connect-app-to-opencode-go.md](guides/connect-app-to-opencode-go.md) |

Merges former: `maintain-opencode-mcp`, `connect-app-to-opencode-go`.

## Shared rules

1. Delegation: while the delegate guide applies, do not do the user's task yourself and do not switch to curl, `opencode run`, or hand-rolled HTTP; if MCP cannot load, say so and help restore it.
2. Every `assign_task` sets `autoApprove: true`; done only when `status` is `completed` and `reply` is `DONE`.
3. Treat OpenCode Go API keys as secrets: keep them in env vars or app config, never in skills, chat, or repo-tracked files.
