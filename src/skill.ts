/**
 * Skill definition for opencodemcp.
 *
 * A "skill" is a self-contained markdown instruction an orchestrator harness
 * (Cursor, Claude Code, a custom agent) can load to know how to drive OpenCode
 * through this MCP server. The WebUI's Skill page lets the user copy it or
 * download it as SKILL.md.
 */

import { GO_ORCHESTRATOR_MODELS, GO_SETUP_MARKDOWN } from "./go-plan.js";

export const SKILL_NAME = "opencodemcp";
export const SKILL_VERSION = "0.1.0";

export const SKILL_MARKDOWN = `# opencodemcp skill

Drive an OpenCode agent from any MCP-speaking orchestrator (Cursor, Claude
Code, a custom harness). The MCP server exposes five tools:

| Tool | Purpose |
| --- | --- |
| \`assign_task\` | Run a prompt; returns sessionId, response, duration, startedAt, finishedAt. |
| \`providers\` | List supported provider ids. |
| \`model\` | Search models; returns modelId and free flag. |
| \`score\` | Score a session 0–10; returns success or fail. |
| \`sessions\` | List session ids with optional filters (default limit 16). |

## Orchestration loop

\`\`\`
providers → model → assign_task → score
sessions  →  pick prior runs
\`\`\`

## assign_task

\`\`\`jsonc
{
  "prompt": "Add pagination and run tests",
  "provider": "opencode-go",
  "modelId": "gpt-6-luna",
  "title": "pagination",
  "harness": "build",
  "directories": "C:/work/app",
  "filePaths": ["C:/work/app/spec.md"]
}
\`\`\`

Returns \`sessionId\`, \`response\`, \`duration\` (ms), \`startedAt\`, \`finishedAt\`
(timestamps \`YYYY-MM-DDTHH-MM-SS\`).

## model

\`\`\`jsonc
{ "provider": "opencode-go", "model": "luna", "onlyFreeModels": true }
\`\`\`

Returns \`model[]\` entries with \`modelId\` and \`free\`.

## providers

No parameters. Returns \`provider\`: string array of ids.

## score

\`\`\`jsonc
{ "sessionId": "ses_…", "score": 9 }
\`\`\`

Returns \`result\`: \`success\` or \`fail\`.

## sessions

\`\`\`jsonc
{
  "fromDate": null,
  "toDate": null,
  "provider": null,
  "modelId": null,
  "harness": null,
  "limit": 16
}
\`\`\`

Date filters use \`YYYY-MM-DDTHH-MM-SS\`. Returns \`sessionId\` array.

## Providers

Supported provider ids (use as \`provider\` in \`assign_task\` / \`model\`):
\`openai\`, \`anthropic\`, \`google\`, \`mistral\`, \`openrouter\`, \`opencode\`,
\`opencode-go\`, \`ollama\`, \`openai-compatible\`, \`xai\`, \`deepseek\`, \`groq\`,
\`perplexity\`, \`cohere\`.

${GO_SETUP_MARKDOWN}

Recommended \`assign_task\` models (OpenCode Go):

- Free: ${GO_ORCHESTRATOR_MODELS.free.join(", ")}
- Paid: ${GO_ORCHESTRATOR_MODELS.paid.join(", ")}

## Notes

- Everything lives under \`/api/*\` on the OpenCode server; auth is HTTP basic.
- \`POST /api/session/{id}/prompt\` takes \`{"text": "…"}\` (plus optional
  \`files\`, \`delivery\`, \`metadata\`) and is asynchronous — a run is finished when the session
  leaves \`GET /api/session/active\` and a \`time.completed\` reply exists at/after the
  prompt time (\`session.time.idle >= promptTime\` on older builds).
- \`GET /api/permission/request\` is location-scoped: query it with the session's
  directory or a blocked run is invisible.
- Model ids are \`provider/modelID\`; the first slash separates provider from model.
`;

/** The skill as a downloadable SKILL.md payload. */
export function skillFile(): { name: string; content: string; mime: string } {
  return { name: "SKILL.md", content: SKILL_MARKDOWN, mime: "text/markdown; charset=utf-8" };
}
