# Delegate work through OpenCode MCP

Cursor manages OpenCode. OpenCode does the work. Sessions live on the OpenCode server, so they survive Cursor context limits.

Spend as few Cursor tokens as possible. Do not buy that saving by weakening the packet, the model choice, or the done check. A short, exact task with real done-criteria is cheaper and better than a long vague one.

Default server: `node C:/Users/armin/GitHub/OpenCodeMCP/dist/index.js`. `OPENCODE_DIRECTORY` is the default project root.

## Token use

Keep the orchestrator thin. Quality stays in the packet and the verdict, not in extra reading or chat.

- Load only the rules and skills this task needs, and extract short points. Never paste a full file.
- The task packet is one page: goal, required points, numbered done-criteria, constraints, reply protocol.
- After assign, read `status`, `reply`, counts, and cost. Do not pull transcripts, diffs, or the repo into Cursor to re-check.
- Poll with `fetch_session` only when the run is detached or timed out: `limit` ≤ 30, `includeMessages: false`.
- Tell the user five lines or fewer. No logs, diffs, or file dumps.
- Prefer `wait: false` and sparse polls for long jobs. Do not block on a 30-minute `wait: true`.
- Start a new session per retry. Do not grow one thread that drags history back into every reply.
- Free model first when the task is easy. Do not default to the largest paid model.
- Do not drop done-criteria, required points, the reply protocol, or `directory` to save tokens. Those are what keep the result correct.

## Stop and ask first

Ask one short question and do not continue when any of these is true:

- The step is destructive or irreversible (delete data, force-push, production deploy, drop schema).
- Requirements are ambiguous or contradictory, so honest done-criteria cannot be written.
- Secrets or credentials are involved beyond normal local file edits.
- Cost or blast radius is high for the ask.
- The same goal has already failed 3 OpenCode attempts.
- MCP is down and the recovery step is unclear.
- `status` is `blocked` or `pendingPermission` after `autoApprove: true`.

## Steps

1. Confirm `assign_task` and `fetch_session` exist. If they do not, say so and restore MCP (see Recovery). Do not do the user's task yourself, and do not switch to curl, `opencode run`, or hand-rolled HTTP.
2. Load only the rules and skills this task needs. Extract short required points. Do not paste full skill or rule files.
3. Rewrite the human's request into the worker prompt. Never pass the raw message through. Workers are usually the weaker models, so the prompt must be concrete, ordered, and complete (see Write the worker prompt).
4. Pick `model` from the list below. Do not call `models_list`. Do not invent ids. Pass the string exactly. Never double the provider (`opencode-go/opencode-go-…` is wrong).
5. Call `assign_task` with a new session (omit `sessionID`), the real repo as `directory`, and that rewritten packet. `autoApprove` must be `true` on this call and on every retry. Never omit it and never set it to `false`.
6. Read only `status`, `reply`, `toolCalls`, `tokens`, `cost`, and `pendingPermission`. For a long job use `wait: false`, then `fetch_session` with `limit` ≤ 30 and `includeMessages: false`.
7. The task is done only when `status` is `completed` and `reply` is the one word `DONE`. Anything else is not done. Do not open the repo, run tests, or edit files to check. Do not score or rank the run.
8. If it is not done, start a new session with a different model from the list below. From attempt 2 on, the task is only the failed criteria, still rewritten for a weaker model. After 3 fails, ask the human. Still do not do the work yourself.

Easy, small, clear, low-risk work starts on a free model. After one free failure, or for multi-file and tricky work, use a paid model. Do not retry the same model for the same failed criteria unless the failure was `blocked` or `timeout`. Reuse `sessionID` only for a small clarification, not for a retry.

## Write the worker prompt

Always interpret the human's request and write the best prompt the worker can follow. Do not forward the user's words, typos, or implied context. The worker does not share the chat and is usually a weaker model, so spell out what a stronger model would have inferred.

The rewritten prompt names the repo and files, says exactly what to change and what to leave alone, gives ordered steps, and ends with numbered checks the worker can verify. One goal per task. If the human asked for several unrelated things, split them into separate `assign_task` calls. On retry, rewrite again from the short failure, do not resend the old prompt.

## Auto-approve

The orchestrator forces auto-approve on every worker. Every `assign_task`, including retries and small follow-ups, sets `autoApprove: true`. A call without it is invalid: send it again with `autoApprove: true` before doing anything else. If `status` is `blocked` or `pendingPermission` and the call did not set it, re-assign with `autoApprove: true`. Ask the human only when it is still blocked after that, or when the stop-and-ask list applies.

## Task packet

```text
<goal>

Required points from rules/skills:
- …

Done-criteria:
1. …
2. …

Constraints: …

Reply protocol (required, do not soften):
- Do the work in silence. No step-by-step report. No progress update. No per-turn explanation.
- Reply only when the task is finished, or when you are blocked and cannot finish.
- Finished and every done-criterion met: the single word DONE
- Blocked: one short reason, then stop. No essay.
```

```jsonc
{
  "task": "<packet above>",
  "directory": "C:/path/to/repo",
  "model": "opencode-go/space-bunny-free",
  "orchester": "build",
  "variant": "high",
  "files": [],
  "wait": true,
  "timeoutMs": 180000,
  "autoApprove": true
}
```

`orchester` is `build`, `plan`, `explore`, or `general`. `directory` is required and is the real repo, not the MCP process cwd. One `assign_task` per independent task.

Done-criteria are numbered and testable, for example "tests pass" or "no change outside `src/foo`". Put verification steps in the task. The worker proves them silently. The only reply is `DONE`, or one short reason if blocked.

## Worker replies

Every `assign_task` must include the reply protocol above, worded as an order, not a suggestion. Workers reply only when the task is finished or they cannot finish. A step-by-step report, a progress note, or an explanation before the work is done is a protocol break: treat the run as not done and re-assign with the reply protocol only. Do not ask a worker for a status update.


## Models

Free, prefer these first:

- `opencode-go/space-bunny-free`
- `opencode-go/longcat-2.5-preview-free`

Paid, for harder work or after a free failure:

- `opencode-go/qwen3.8-flash`
- `opencode-go/deepseek-v4.1-flash`
- `opencode-go/gpt-6-luna`

Narrow edits and smoke checks: a free model, usually `opencode-go/space-bunny-free`. Multi-file features and tricky bugs: a paid flash model, then `opencode-go/gpt-6-luna`. Critical or unclear work: ask the human before assigning.

Each id is `opencode-go/` plus the model slug from the [OpenCode Go docs](https://opencode.ai/v2/docs/console/go). These five match the current Go plan list. Do not add or rename one here.

## Tools

- `assign_task` hands off work and returns `sessionID` and `reply`.
- `fetch_session` polls a detached run. Keep the transcript minimal.
- `providers_list` is optional and only for env or provider debug. It does not choose the model.
- `models_list` is never called.

## Verify

| status | action |
| --- | --- |
| `completed` and reply is `DONE` (one word, any case) | Done |
| `completed` and a short failure | Not done, then rotate |
| `completed` and any step-by-step or progress report | Not done. Re-assign with the reply protocol only |
| `blocked` | Re-assign with `autoApprove: true` if it was not set; otherwise ask the human and report `pendingPermission` |
| `timeout` | `fetch_session` with a small limit, or re-dispatch with `wait: false` |
| `failed` | Not done, then rotate |

## Tell the user

Five lines or fewer:

- Result: done, not done, or waiting on the human
- Model: the id from the list above for the run that finished, or the last attempt
- Session: `sessionID`
- If not done: the short failure text, nothing else

Do not paste transcripts, diffs, logs, or file contents. Do not add a score. Shorter is required, but never by calling a run done when the reply was not `DONE`.

## Recovery

- Tool missing: check `~/.cursor/mcp.json` → `mcpServers.opencode`, run `npm run build` in `C:/Users/armin/GitHub/OpenCodeMCP`, restart Cursor.
- Cannot reach OpenCode: `opencodemcp service start` or `opencode service start`.
- 401: Console Go API key via `/connect`, or `~/.config/opencode/service.json` / `OPENCODE_PASSWORD` for the local serve API.
- Hung run: `fetch_session`, then interrupt through the OpenCode API if needed.
- Instant fail with 0 tokens: the model string is not one of the ids above.
- More detail: `C:/Users/armin/GitHub/OpenCodeMCP/README.md`.
- Cannot reach OpenCode: the MCP tries to start the service itself unless `OPENCODE_AUTOSTART=0`. 401 after a manual server start: set `OPENCODE_PASSWORD` or run `opencode service restart`.
- Hung run: stop it with `POST /api/session/{id}/interrupt`.
- Live MCP test suite: `cd C:/Users/armin/GitHub/OpenCodeMCP && npm test`.

### Client registration

| Client | Where | Tool names |
| --- | --- | --- |
| Cursor / Claude Code / Codex | Cursor: `~/.cursor/mcp.json` → `mcpServers.opencode` (restart Cursor after editing) | `assign_task`, `fetch_session`, `providers_list` |
| Hermes | `mcp_servers.opencode` in `%LOCALAPPDATA%\hermes\config.yaml` (`command: node`, `args: [C:/Users/armin/GitHub/OpenCodeMCP/dist/index.js]`, `timeout: 600`); verify with `hermes config get mcp_servers.opencode`; restart the session/app after registering | `mcp_opencode_assign_task`, `mcp_opencode_fetch_session` |

Rebuild (`npm run build`, produces `dist/index.js`) after any edit in `src/`.

If MCP cannot load, say that and help restore it. Do not run the task in Cursor or over CLI or HTTP instead. Do not invent a `sessionID` or a reply. If recovery is unclear, ask the human.

## Do not

- Edit files, run implementation commands, spawn worker subagents, or write the code in chat while this skill applies.
- Call `models_list` or use a model that is not in the list above.
- Omit `autoApprove: true`, or set `autoApprove` to `false`, on any worker call.
- Skip `directory`, done-criteria, the reply protocol, or the rules extract.
- Paste a full transcript into chat or into the task packet.
- Forward the raw human message as the worker task.
- Claim the work was delegated while doing it directly.
- Let a worker report step by step, or accept a reply sent before the task is finished.
