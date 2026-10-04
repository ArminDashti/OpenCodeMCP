/**
 * OpenCode Go plan — constants aligned with https://opencode.ai/v2/docs/console/go
 * (verified 2026-10-04; models list cross-checked against GET /zen/go/v1/models).
 */

export const GO_CONSOLE_URL = "https://opencode.ai/console";
export const GO_DOCS_URL = "https://opencode.ai/v2/docs/console/go";
export const GO_API_BASE = "https://opencode.ai/zen/go/v1";

/** Slugs from the Go docs model list (opencode-go/<slug> in OpenCode config). */
export const GO_DOC_MODEL_SLUGS = [
  "grok-4.7",
  "grok-4.6",
  "glm-5.3-flash",
  "glm-5.3",
  "glm-5.2",
  "gpt-6-luna",
  "gpt-5.6-luna",
  "kimi-k3",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "longcat-2.0",
  "longcat-2.5-preview-free",
  "mimo-v2.6-flash",
  "mimo-v2.6-pro",
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "minimax-m3",
  "minimax-m2.7",
  "muse-spark-1.3-contributor",
  "muse-spark-1.2-contributor",
  "qwen3.8-max",
  "qwen3.8-flash",
  "qwen3.7-plus",
  "deepseek-v4.1-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-v4-flash-vision-exp",
  "hy4-preview",
  "hy3",
  "space-bunny-free",
] as const;

/** Orchestrator-friendly defaults (free first, then paid flash / luna). */
export const GO_ORCHESTRATOR_MODELS = {
  free: ["opencode-go/space-bunny-free", "opencode-go/longcat-2.5-preview-free"],
  paid: [
    "opencode-go/qwen3.8-flash",
    "opencode-go/deepseek-v4.1-flash",
    "opencode-go/gpt-6-luna",
  ],
} as const;

export const GO_SETUP_MARKDOWN = `## OpenCode Go (subscription)

- Subscribe at [OpenCode Console](${GO_CONSOLE_URL}) — **Go** ($10/mo) or **Go Plus** ($40/mo).
- In the OpenCode TUI: \`/connect\` → OpenCode Go → paste your API key; \`/models\` to pick a model.
- Model ids: \`opencode-go/<slug>\` (see [Go docs](${GO_DOCS_URL})).
- Direct OpenAI-compatible API base: \`${GO_API_BASE}\` (chat/models under \`/chat/completions\`, \`/models\`).
- Coding agents should send a stable session id in \`x-opencode-session\` and identify with a client user-agent (not a generic SDK name).`;
