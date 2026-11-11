#!/usr/bin/env node
/**
 * opencode-mcp — expose an OpenCode agent to an orchestrator over MCP.
 *
 * Tools:
 *   assign_task — run a prompt on OpenCode and return session timing + response
 *   providers   — supported provider ids
 *   model         — search models (modelId + free flag)
 *   score       — score a session (0–10)
 *   sessions    — list session ids with filters
 *
 * Environment:
 *   OPENCODE_URL           base URL of `opencode serve`   (default http://127.0.0.1:4096)
 *   OPENCODE_PASSWORD      serve password (OPENCODE_SERVER_PASSWORD also accepted)
 *   OPENCODE_USERNAME      basic-auth user                (default opencode)
 *   OPENCODE_DIRECTORY     default project directory      (default process.cwd())
 *   OPENCODE_SCORES_FILE   score store path               (default ~/.opencode-mcp/scores.json)
 *   OPENCODE_TIMEOUT_MS    per-request HTTP timeout       (default 30000)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { loadDotenvFiles, syncGoAuthFromEnv } from "./go-api-key.js";
import { resolveEndpoint } from "./bootstrap.js";
import { OpenCode, OpenCodeError, parseModelRef, type ModelRef } from "./opencode.js";
import { recordScore } from "./scores.js";
import { PROVIDERS } from "./providers.js";
import {
  collectReply,
  waitForIdle,
} from "./render.js";
import { appendLog } from "./db.js";
import {
  filterSessionIds,
  formatCompactTimestamp,
  listModelEntries,
  resolveDirectory,
} from "./mcp-api.js";

const cfg = loadConfig();
syncGoAuthFromEnv();
const endpoint = await resolveEndpoint(cfg);
cfg.baseUrl = endpoint.baseUrl;
cfg.password = endpoint.password;
const oc = new OpenCode(cfg);

const MAX_OUTPUT_CHARS = 40_000;

/** Shrink a JSON payload's array so the serialized form fits the output budget. */
function fitArray(
  payload: Record<string, unknown>,
  key: string,
  from: "head" | "tail",
  minKeep = 1,
): void {
  const size = () => JSON.stringify(payload, null, 2).length;
  while (size() > MAX_OUTPUT_CHARS) {
    const arr = payload[key] as unknown[] | undefined;
    if (!Array.isArray(arr) || arr.length <= minKeep) break;
    const drop = Math.max(1, Math.floor(arr.length * 0.25));
    if (from === "tail") arr.splice(Math.max(minKeep, arr.length - drop), drop);
    else arr.splice(0, Math.min(drop, arr.length - minKeep));
    payload[key] = arr;
    payload.truncated = true;
    payload.droppedItems = (Number(payload.droppedItems ?? 0) || 0) + drop;
  }
  if (payload.truncated) {
    payload.truncationNote =
      "Output trimmed to fit the MCP response budget — narrow the query (filter by provider/model, lower limit, or read fewer messages) for the rest.";
  }
}

function ok(payload: unknown) {
  let text = JSON.stringify(payload, null, 2);
  if (text.length > MAX_OUTPUT_CHARS) {
    text =
      text.slice(0, MAX_OUTPUT_CHARS) +
      `\n…[output truncated at ${MAX_OUTPUT_CHARS} characters]`;
  }
  return { content: [{ type: "text" as const, text }] };
}

function fail(err: unknown) {
  const message =
    err instanceof OpenCodeError
      ? err.detail
        ? `${err.message}\n${err.detail}`
        : err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function mcpLog(tool: string, message: string, level: "info" | "warn" | "error" = "info") {
  try {
    appendLog(level, message, `mcp:${tool}`);
  } catch {
    // Logging must never break stdio MCP.
  }
}

function resolvedModel(args: {
  provider?: string;
  model?: string;
  modelID?: string;
  variant?: string;
}): ModelRef | undefined {
  const provider = args.provider?.trim() || undefined;
  const raw = (args.modelID ?? args.model)?.trim() || undefined;
  if (!provider && !raw) return undefined;
  if (!provider && raw) return parseModelRef(raw, args.variant);
  // provider given separately: model is the bare model id (prefix tolerated).
  if (provider && !raw) {
    throw new OpenCodeError(
      `model is required when provider is given (e.g. provider "opencode-go" with model "gpt-6-luna")`,
    );
  }
  let modelID = raw!;
  if (modelID.startsWith(provider! + "/")) modelID = modelID.slice(provider!.length + 1);
  // tolerate "provider/model@variant" even when split.
  let variant = args.variant;
  const at = modelID.indexOf("@");
  if (at > 0) {
    variant = modelID.slice(at + 1).trim() || variant;
    modelID = modelID.slice(0, at);
  }
  if (!modelID) {
    throw new OpenCodeError(
      `model must look like "provider/model" (e.g. "opencode-go/gpt-6-luna"), got "${args.model ?? ""}"`,
    );
  }
  const ref: ModelRef = { providerID: provider!, id: modelID };
  if (variant) ref.variant = variant;
  return ref;
}

const server = new McpServer({ name: "opencode-mcp", version: "0.1.0" });

// ---------------------------------------------------------------------------
// assign_task
// ---------------------------------------------------------------------------
server.registerTool(
  "assign_task",
  {
    title: "Assign task to OpenCode",
    description:
      "Run a prompt on OpenCode with provider/model, optional harness and attachments. " +
      "Blocks until the run finishes and returns sessionId, response text, duration (ms), " +
      "startedAt and finishedAt (YYYY-MM-DDTHH-MM-SS).",
    inputSchema: {
      prompt: z.string().min(1).describe("Task instruction for the OpenCode agent."),
      provider: z.string().optional().describe("Model provider, e.g. opencode-go."),
      modelId: z.string().optional().describe("Bare model id; pairs with provider."),
      title: z.string().max(200).optional().describe("Title for a new session."),
      harness: z.string().optional().describe("Orchester agent id, e.g. build, plan, explore."),
      directories: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Project directory or list of directories (first is used)."),
      filePaths: z.array(z.string()).optional().describe("Files to attach to the prompt."),
    },
  },
  async (args) => {
    try {
      mcpLog("assign_task", `prompt=${String(args.prompt).slice(0, 160)}`);
      const directory = resolveDirectory(args.directories, cfg.directory);
      const orchester = args.harness?.trim() || undefined;
      const model = resolvedModel({
        provider: args.provider,
        model: args.modelId,
        modelID: args.modelId,
      });

      if (model) {
        const known = await oc.models(directory);
        const okModel = known.some(
          (m: any) => m?.providerID === model.providerID && (m?.id === model.id || m?.modelID === model.id),
        );
        if (!okModel) {
          throw new OpenCodeError(
            `Unknown model "${model.providerID}/${model.id}". ` +
              `Use the model tool to list available models for provider "${model.providerID}".`,
          );
        }
      }

      const session = await oc.createSession({
        title: args.title,
        agent: orchester,
        model,
        directory,
      });
      const sessionId = session.id;
      const files = (args.filePaths ?? []).map((uri) => ({ uri }));

      let inbox: any;
      try {
        inbox = await oc.prompt(sessionId, { text: args.prompt, files, delivery: "steer" });
      } catch (err) {
        if (err instanceof OpenCodeError && err.status === 409) {
          inbox = await oc.prompt(sessionId, { text: args.prompt, files, delivery: "queue" });
        } else {
          throw err;
        }
      }

      const promptAt: number = inbox?.time?.created ?? Date.now();
      const wait = await waitForIdle(oc, sessionId, promptAt, {
        timeoutMs: 180_000,
        autoApprove: false,
        directory,
      });

      if (wait.status !== "completed") {
        return fail(
          new Error(
            wait.status === "blocked"
              ? "Run blocked on a permission request."
              : wait.status === "timeout"
                ? "Run timed out before completion."
                : `Run ended with status ${wait.status}.`,
          ),
        );
      }

      const messages = (await oc.messages(sessionId, { order: "asc", limit: 500 })).data ?? [];
      const response = collectReply(messages, promptAt);
      let finishedMs = promptAt;
      for (const m of messages) {
        if (m?.type === "assistant" && (m?.time?.created ?? 0) >= promptAt && m?.time?.completed) {
          finishedMs = Math.max(finishedMs, m.time.completed);
        }
      }
      const sessionAfter = wait.session ?? (await oc.session(sessionId));
      if (sessionAfter?.time?.updated) finishedMs = Math.max(finishedMs, sessionAfter.time.updated);

      return ok({
        sessionId,
        response,
        duration: wait.elapsedMs,
        startedAt: formatCompactTimestamp(promptAt),
        finishedAt: formatCompactTimestamp(finishedMs),
      });
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// providers
// ---------------------------------------------------------------------------
server.registerTool(
  "providers",
  {
    title: "List providers",
    description:
      "Return the curated provider ids supported by this MCP (static subset: " +
      "openrouter, opencode, opencode-go, openai-compatible).",
    inputSchema: {},
  },
  async () => {
    try {
      mcpLog("providers", "list");
      return ok({ provider: PROVIDERS.map((p) => p.id) });
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------
server.registerTool(
  "model",
  {
    title: "List or search models",
    description:
      "Return modelId and free flag. Optional provider filter, model substring search, " +
      "and onlyFreeModels to hide paid models.",
    inputSchema: {
      provider: z.string().nullish().describe("Filter by provider id."),
      model: z.string().nullish().describe("Case-insensitive search on model id or name."),
      onlyFreeModels: z.boolean().nullish().describe("When true, return only free models."),
    },
  },
  async (args) => {
    try {
      mcpLog("model", `provider=${args.provider ?? "*"} search=${args.model ?? ""}`);
      const rows = await listModelEntries(oc, cfg.scoresFile, {
        provider: args.provider,
        model: args.model,
        onlyFreeModels: args.onlyFreeModels ?? false,
      });
      const payload: Record<string, unknown> = { model: rows };
      fitArray(payload, "model", "tail", 5);
      return ok(payload);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// score
// ---------------------------------------------------------------------------
server.registerTool(
  "score",
  {
    title: "Score a session",
    description: "Record session quality on a 0–10 scale. Returns result success or fail.",
    inputSchema: {
      sessionId: z.string().min(1).describe("Session id (ses_…)."),
      score: z.number().min(0).max(10).describe("Quality score 0–10."),
    },
  },
  async (args) => {
    try {
      mcpLog("score", `session=${args.sessionId} score=${args.score}`);
      const session = await oc.session(args.sessionId);
      if (!session || !session.id) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  result: "fail",
                  reason: `Unknown sessionId: ${args.sessionId}`,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
      const orchester = (session?.agent ?? "unknown").toString();
      const modelRaw = session?.model
        ? `${session.model.providerID}/${session.model.id}`
        : undefined;
      const provider = session?.model?.providerID;
      recordScore(cfg.scoresFile, {
        orchester,
        agent: orchester,
        score: args.score * 10,
        sessionID: args.sessionId,
        provider,
        model: modelRaw,
        task: session?.title ?? undefined,
      });
      return ok({ result: "success" });
    } catch (err) {
      mcpLog("score", String(err), "error");
      const reason =
        err instanceof OpenCodeError
          ? err.status === 404
            ? `Unknown sessionId: ${args.sessionId}`
            : err.detail
              ? `${err.message}: ${err.detail}`
              : err.message
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ result: "fail", reason }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------
server.registerTool(
  "sessions",
  {
    title: "List session ids",
    description:
      "Return matching session ids. fromDate/toDate use YYYY-MM-DDTHH-MM-SS; filters may be null. " +
      "Default limit 16.",
    inputSchema: {
      fromDate: z.string().nullish().describe("Inclusive start (YYYY-MM-DDTHH-MM-SS)."),
      toDate: z.string().nullish().describe("Inclusive end (YYYY-MM-DDTHH-MM-SS)."),
      provider: z.string().nullish().describe("Filter by model provider."),
      modelId: z.string().nullish().describe("Filter by model id or provider/model."),
      harness: z.string().nullish().describe("Filter by orchester agent id."),
      limit: z.number().int().min(1).max(200).optional().describe("Max ids returned (default 16)."),
    },
  },
  async (args) => {
    try {
      const limit = args.limit ?? 16;
      mcpLog("sessions", `limit=${limit}`);
      const fetchN = Math.min(200, Math.max(limit * 4, 64));
      const res = await oc.listSessions({ limit: fetchN, order: "desc" });
      const sessionId = filterSessionIds(res.data ?? [], { ...args, limit });
      return ok({ sessionId });
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `opencode-mcp ready → ${cfg.baseUrl} (${endpoint.source}, ` +
    `${cfg.password ? "authenticated" : "no password"})` +
    (endpoint.notes.length ? ` — ${endpoint.notes.join("; ")}` : ""),
);
