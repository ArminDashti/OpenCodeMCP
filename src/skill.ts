/**
 * Skill definition for opencodemcp.
 *
 * A "skill" is a self-contained markdown instruction an orchestrator harness
 * (Cursor, Claude Code, a custom agent) can load to know how to drive OpenCode
 * through this MCP server. The WebUI's Skill page lets the user copy it or
 * download it as SKILL.md.
 */

export const SKILL_NAME = "opencodemcp";
export const SKILL_VERSION = "0.1.0";

export const SKILL_MARKDOWN = `# opencodemcp skill

Drive an OpenCode agent from any MCP-speaking orchestrator (Cursor, Claude
Code, a custom harness). The MCP server exposes four tools:

| Tool | Purpose |
| --- | --- |
| \`assign_task\` | Give OpenCode a task. Creates or continues a session, sets agent/model/directory, optionally attaches files, and by default blocks until the run goes idle. |
| \`models_list\` | The models you may choose from — \`provider/model\` id, context window, output limit, tool support, variants, price, availability, plus the server default. |
| \`score_to_agent\` | Record how well an agent handled a task (0–100) and get back the per-agent ranking. Scores persist locally. |
| \`fetch_session\` | List sessions, or read one in detail: status, agent, model, cost, tokens and a compact transcript including tool calls. |

## Orchestration loop

\`\`\`
models_list   →  pick "provider/model" for the task
assign_task   →  task + model (+ agent/directory), get sessionID + reply
fetch_session →  inspect transcript / poll a background dispatch
score_to_agent(agent, score, sessionID)  →  ranking → next assignment
\`\`\`

## assign_task

\`\`\`jsonc
{
  "task": "Add pagination to src/api/users.ts and run the tests",
  "sessionID": "ses_…",              // optional: continue an existing session
  "title": "pagination",             // optional: title for a new session
  "orchester": "build",              // optional: build | plan | explore | …
  "provider": "opencode-go",         // optional: pairs with model
  "model": "gpt-6-luna",             // optional: bare id with provider, or "provider/model"
  "variant": "high",                 // optional: effort tier of that model
  "directory": "C:/work/app",        // optional: project directory
  "files": ["C:/work/app/spec.md"],  // optional: prompt attachments
  "delivery": "steer",               // optional: "steer" (default) | "queue" when busy
  "autoApprove": false,              // optional: answer permission requests with "once"
  "wait": true,                      // optional: default true; false = fire and forget
  "timeoutMs": 180000                // optional: wait budget
}
\`\`\`

Result highlights: \`status\` (\`completed\` | \`blocked\` | \`timeout\` | \`failed\` |
\`dispatched\`), \`reply\`, \`toolCalls\`, \`cost\`, \`tokens\`, \`outcome\`, \`elapsedMs\`,
\`transcript\`.

\`status: "blocked"\` means the run hit a permission the server would ask a human
about; the response carries \`pendingPermission\` (\`action\`, \`resources\`), and
you either reply with \`once\`/\`always\`/\`reject\` through OpenCode's permission API
or re-assign with \`autoApprove: true\`.

## models_list

\`\`\`jsonc
{ "provider": "opencode-go", "search": "luna", "enabledOnly": true,
  "detail": "full", "limit": 50 }
\`\`\`

Returns \`default\`, \`totalMatched\`, \`returned\` and \`models[]\` with \`id\`
(\`provider/modelID\`), \`provider\`/\`providerID\`, \`model\`/\`modelID\`, \`context\`,
\`maxOutput\`, \`tools\`, \`variants\`, \`status\`, \`enabled\`, \`isDefault\`, plus
evidence from past runs: \`scoreCount\`, \`averageScore\`, \`lastScore\`,
\`avgTaskMs\`/\`avgTaskTime\`.

## score_to_agent

\`\`\`jsonc
{ "orchester": "build", "score": 92, "sessionID": "ses_…",
  "provider": "opencode-go", "model": "gpt-6-luna", "durationMs": 45000,
  "feedback": "clean diff, tests added",
  "task": "pagination", "includeRanking": true }
\`\`\`

Returns the stored record, this agent's \`agentStats\` (\`count\`, \`average\`,
\`last\`, \`min\`, \`max\`) and the full \`ranking\` (best first) plus \`bestAgent\`.

## fetch_session

\`\`\`jsonc
{ "sessionID": "ses_…",   // omit to list sessions
  "limit": 200, "order": "asc",
  "includeMessages": true, "includePermissions": true, "runningOnly": false }
\`\`\`

List mode returns \`count\`, \`running\`, \`sessions[]\`. Read mode returns \`session\`,
\`running\`, \`messages[]\` and \`pendingPermissions\` when a run is waiting.

## Providers

Supported provider ids (use as \`provider\` in \`assign_task\` / \`models_list\`):
\`openai\`, \`anthropic\`, \`google\`, \`mistral\`, \`openrouter\`, \`opencode\`,
\`opencode-go\`, \`ollama\`, \`openai-compatible\`, \`xai\`, \`deepseek\`, \`groq\`,
\`perplexity\`, \`cohere\`.

## Notes

- Everything lives under \`/api/*\` on the OpenCode server; auth is HTTP basic.
- \`POST /api/session/{id}/prompt\` is asynchronous — a run is finished when
  \`session.time.idle >= promptTime\`.
- \`GET /api/permission/request\` is location-scoped: query it with the session's
  directory or a blocked run is invisible.
- Model ids are \`provider/modelID\`; the first slash separates provider from model.
`;

/** The skill as a downloadable SKILL.md payload. */
export function skillFile(): { name: string; content: string; mime: string } {
  return { name: "SKILL.md", content: SKILL_MARKDOWN, mime: "text/markdown; charset=utf-8" };
}
