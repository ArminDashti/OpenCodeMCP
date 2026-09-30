#!/usr/bin/env node
/**
 * opencode-mcp — expose an OpenCode agent to an orchestrator over MCP.
 *
 * Tools:
 *   assign_task    — hand a task to OpenCode (new or existing session), optionally wait
 *   models_list    — models the orchestrator can choose from
 *   score_to_agent — record a quality score for an agent's run, return the ranking
 *   fetch_session  — list sessions / read one session with its transcript
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
import { resolveEndpoint } from "./bootstrap.js";
import { OpenCode, OpenCodeError, parseModelRef, type ModelRef } from "./opencode.js";
import { aggregateModels, loadStore, recordScore, splitModelRef } from "./scores.js";
import { PROVIDERS } from "./providers.js";
import {
  collectReply,
  compactSession,
  countToolCalls,
  renderTranscript,
  waitForIdle,
} from "./render.js";

const cfg = loadConfig();
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

function resolvedOrchester(args: { orchester?: string; agent?: string }): string | undefined {
  const v = (args.orchester ?? args.agent)?.trim();
  return v ? v : undefined;
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
      "Send a task to the OpenCode agent and (by default) wait until it finishes. " +
      "Creates a new session unless sessionID is given, so the orchestrator can run " +
      "several tasks in parallel by omitting sessionID each time. The model is chosen " +
      "by the orchestrator: pass provider + model separately (e.g. provider " +
      "\"opencode-go\", model \"gpt-6-luna\"); a combined \"provider/model\" value in " +
      "model is still accepted for compatibility. Returns the session id, the agent's " +
      "final reply, tool-call count, token usage and cost. If the run needs a permission " +
      "the server would ask a human for, the result comes back as status \"blocked\" " +
      "with the pending request — reply to it or set autoApprove to answer such " +
      "requests automatically.",
    inputSchema: {
      task: z
        .string()
        .min(1)
        .describe("The instruction for the OpenCode agent. Plain text; be explicit about the goal and the done-criteria."),
      sessionID: z
        .string()
        .optional()
        .describe("Continue an existing session (ses_…). Omit to start a fresh session for this task."),
      title: z.string().max(200).optional().describe("Title for a newly created session."),
      orchester: z
        .string()
        .optional()
        .describe("Orchester agent id, e.g. \"build\", \"plan\", \"explore\" (see /api/agent). Omit to use the session default."),
      agent: z
        .string()
        .optional()
        .describe("Deprecated alias of orchester. Prefer orchester."),
      provider: z
        .string()
        .optional()
        .describe("Model provider, e.g. \"opencode-go\", \"openrouter\", \"ollama\". Pairs with model."),
      model: z
        .string()
        .optional()
        .describe("Model id. Use the bare id together with provider (e.g. model \"gpt-6-luna\"); a combined \"provider/model\" value is also accepted when provider is omitted."),
      modelID: z
        .string()
        .optional()
        .describe("Alias of model when provider is given separately."),
      variant: z
        .string()
        .optional()
        .describe("Optional model variant / effort tier, e.g. \"low\", \"medium\", \"high\", \"xhigh\"."),
      directory: z
        .string()
        .optional()
        .describe("Project directory the task runs in. Defaults to OPENCODE_DIRECTORY."),
      files: z
        .array(z.string())
        .optional()
        .describe("Files to attach to the prompt (absolute paths, relative paths or file:// URIs)."),
      delivery: z
        .enum(["steer", "queue"])
        .optional()
        .describe("What to do if the session is already busy: \"steer\" (default) injects into the running turn, \"queue\" waits for the next turn."),
      autoApprove: z
        .boolean()
        .optional()
        .describe("Answer pending permission requests with \"once\" so a headless run is not blocked. Default false (blocked result is returned instead)."),
      wait: z
        .boolean()
        .optional()
        .describe("Block until the run goes idle and return the reply (default true). Set false to fire-and-forget, then poll with fetch_session."),
      timeoutMs: z
        .number()
        .int()
        .min(1_000)
        .max(900_000)
        .optional()
        .describe("How long to wait for completion in milliseconds (default 180000). On timeout the task keeps running server-side."),
    },
  },
  async (args) => {
    try {
      const directory = args.directory ?? cfg.directory;
      const orchester = resolvedOrchester(args as { orchester?: string; agent?: string });
      const model = resolvedModel(args as { provider?: string; model?: string; modelID?: string; variant?: string });
      let sessionId: string;
      let created = false;

      if (args.sessionID) {
        sessionId = args.sessionID;
        await oc.session(sessionId); // validates the id, 404s early
        if (orchester) await oc.setAgent(sessionId, orchester);
        if (model) await oc.setModel(sessionId, model);
      } else {
        const session = await oc.createSession({
          title: args.title,
          agent: orchester,
          model,
          directory,
        });
        sessionId = session.id;
        created = true;
      }

      const files = (args.files ?? []).map((uri) => ({ uri }));

      let inbox: any;
      try {
        inbox = await oc.prompt(sessionId, {
          text: args.task,
          files,
          delivery: args.delivery,
        });
      } catch (err) {
        // 409 = the session is mid-turn and steer was not acceptable; retry as queue.
        if (err instanceof OpenCodeError && err.status === 409 && !args.delivery) {
          inbox = await oc.prompt(sessionId, { text: args.task, files, delivery: "queue" });
        } else {
          throw err;
        }
      }

      const promptAt: number = inbox?.time?.created ?? Date.now();
      const modelFull = model ? `${model.providerID}/${model.id}${model.variant ? `@${model.variant}` : ""}` : null;
      const base = {
        sessionID: sessionId,
        messageID: inbox?.id ?? null,
        sessionCreated: created,
        orchester: orchester ?? null,
        agent: orchester ?? null,
        provider: model?.providerID ?? null,
        model: modelFull,
        modelID: model?.id ?? null,
        directory,
      };

      if (args.wait === false) {
        return ok({ ...base, status: "dispatched", hint: "Poll with fetch_session(sessionID=…)." });
      }

      const wait = await waitForIdle(oc, sessionId, promptAt, {
        timeoutMs: args.timeoutMs ?? 180_000,
        autoApprove: args.autoApprove,
        directory,
      });

      const messages = (await oc.messages(sessionId, { order: "asc", limit: 500 })).data ?? [];
      const reply = collectReply(messages, promptAt);
      const session = wait.session ?? (await oc.session(sessionId));
      const tokens = session?.tokens ?? {};

      const result: Record<string, unknown> = {
        ...base,
        status: wait.status,
        outcome: session?.outcome ?? null,
        title: session?.title ?? null,
        sessionAgent: session?.agent ?? null,
        sessionModel: session?.model
          ? `${session.model.providerID}/${session.model.id}`
          : null,
        reply,
        toolCalls: countToolCalls(messages, promptAt),
        cost: session?.cost ?? 0,
        tokens: {
          input: tokens.input ?? 0,
          output: tokens.output ?? 0,
          reasoning: tokens.reasoning ?? 0,
        },
        elapsedMs: wait.elapsedMs,
        autoApprovedPermissions: wait.approvedCount,
        transcript: renderTranscript(messages, { since: promptAt, maxMessages: 60 }),
        ...(wait.status === "blocked"
          ? {
              pendingPermission: wait.pendingPermission,
              hint:
                "The run paused on a permission request. Reply via " +
                "POST /api/session/{sessionID}/permission/{requestID}/reply " +
                "(decision: once|always|reject) or re-assign with autoApprove: true.",
            }
          : {}),
        ...(wait.status === "timeout"
          ? {
              hint:
                "Wait budget exhausted — the task is still running. " +
                "Poll with fetch_session(sessionID=…) or stop it with POST /api/session/{sessionID}/interrupt.",
            }
          : {}),
      };
      fitArray(result, "transcript", "head", 3);
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// models_list
// ---------------------------------------------------------------------------
server.registerTool(
  "models_list",
  {
    title: "List OpenCode models",
    description:
      "List the models the orchestrator can choose for assign_task, with everything " +
      "needed to pick one: provider, provider/model id, context window, output limit, " +
      "tool support, variants (effort tiers), price and availability, plus evidence " +
      "from past runs — score count, average score and average time of doing a task. " +
      "Flags the current server default. Filter with provider or search.",
    inputSchema: {
      provider: z.string().optional().describe("Only models of this provider, e.g. \"opencode-go\", \"opencode\", \"ollama\"."),
      search: z.string().optional().describe("Case-insensitive substring match against id, name or family."),
      enabledOnly: z.boolean().optional().describe("Hide models whose enabled flag is false (default false — show everything)."),
      detail: z.enum(["brief", "full"]).optional().describe("\"brief\" (default) = ids + limits + scores; \"full\" adds price, capabilities and package info."),
      limit: z.number().int().min(1).max(500).optional().describe("Maximum models returned (default 50; the response is trimmed to fit the MCP output budget)."),
    },
  },
  async (args) => {
    try {
      const [models, def] = await Promise.all([oc.models(), oc.defaultModel()]);
      const defaultKey = def ? `${def.providerID}/${def.modelID ?? def.id}` : null;
      const needle = args.search?.toLowerCase();
      const statsByModel = new Map(aggregateModels(loadStore(cfg.scoresFile).records).map((s) => [s.model, s]));

      let rows = models.map((m: any) => {
        const id = `${m.providerID}/${m.id}`;
        const st = statsByModel.get(id);
        return {
          id,
          provider: m.providerID,
          providerID: m.providerID,
          model: m.id,
          modelID: m.id,
          name: m.name,
          family: m.family ?? null,
          context: m.limit?.context ?? null,
          maxOutput: m.limit?.output ?? null,
          tools: m.capabilities?.tools ?? null,
          input: m.capabilities?.input ?? null,
          output: m.capabilities?.output ?? null,
          variants: (m.variants ?? []).map((v: any) => v.id),
          status: m.status ?? null,
          enabled: m.enabled !== false,
          isDefault: defaultKey !== null && `${m.providerID}/${m.id}` === defaultKey,
          scoreCount: st?.count ?? 0,
          averageScore: st?.averageScore ?? null,
          lastScore: st?.lastScore ?? null,
          avgTaskMs: st?.avgDurationMs ?? null,
          avgTaskTime: st?.avgDurationMs ?? null,
          ...(args.detail === "full"
            ? {
                cost: m.cost ?? null,
                capabilities: m.capabilities ?? null,
                package: m.package ?? null,
                released: m.time?.released ?? null,
              }
            : {}),
        };
      });

      if (args.provider) rows = rows.filter((r) => r.providerID === args.provider);
      if (needle)
        rows = rows.filter((r) =>
          [r.id, r.name ?? "", r.family ?? ""].some((v) => String(v).toLowerCase().includes(needle)),
        );
      if (args.enabledOnly) rows = rows.filter((r) => r.enabled);
      rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id.localeCompare(b.id));

      const limit = args.limit ?? 50;
      const payload: Record<string, unknown> = {
        totalMatched: rows.length,
        returned: Math.min(rows.length, limit),
        default: defaultKey,
        directory: oc.directory,
        models: rows.slice(0, limit),
      };
      fitArray(payload, "models", "tail", 5);
      payload.returned = (payload.models as unknown[]).length;
      if (payload.truncated) payload.totalMatched = rows.length;
      return ok(payload);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// providers_list
// ---------------------------------------------------------------------------
server.registerTool(
  "providers_list",
  {
    title: "List supported providers",
    description:
      "Supported LLM providers with verified base URLs, key endpoints, the env var holding the API key, docs links and the transparent logo file. Use the provider id as the `provider` of assign_task (e.g. provider \"mistral\" with a Mistral model).",
    inputSchema: {
      search: z.string().optional().describe("Case-insensitive substring match against id, label or base URL."),
    },
  },
  async (args) => {
    try {
      const needle = args.search?.toLowerCase();
      let rows = PROVIDERS;
      if (needle) {
        rows = rows.filter((p) =>
          [p.id, p.label, p.baseUrl].some((v) => String(v).toLowerCase().includes(needle)),
        );
      }
      return ok({ count: rows.length, providers: rows });
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// score_to_agent
// ---------------------------------------------------------------------------
server.registerTool(
  "score_to_agent",
  {
    title: "Score an agent run",
    description:
      "Record how well an OpenCode orchester handled a task (0 = failure, 100 = flawless) " +
      "and get back the updated ranking across agents. The orchestrator should score " +
      "after inspecting the result of assign_task / fetch_session, then use the returned " +
      "ranking to decide which orchester (and provider/model) to assign to the next task. " +
      "Scores are stored locally in a JSON file and survive restarts.",
    inputSchema: {
      orchester: z
        .string()
        .min(1)
        .optional()
        .describe("Orchester id or label being scored, e.g. \"build\", \"plan\", \"explore\", or \"opencode/build\"."),
      agent: z
        .string()
        .min(1)
        .optional()
        .describe("Deprecated alias of orchester."),
      score: z
        .number()
        .min(0)
        .max(100)
        .describe("Quality score 0–100. Suggested bands: 90+ correct & complete, 70–89 correct with gaps, 40–69 partial/needed rework, <40 failed."),
      sessionID: z.string().optional().describe("Session the run happened in (ses_…). Used to fill in the task label and to verify the id."),
      provider: z.string().optional().describe("Model provider used for the run, e.g. \"opencode-go\" — enables provider-level analysis."),
      model: z.string().optional().describe("Model used for the run, \"provider/model\" or the bare id when provider is given — enables model-level analysis later."),
      modelID: z.string().optional().describe("Alias of model when provider is given separately."),
      durationMs: z.number().int().min(0).max(3_600_000).optional().describe("How long the task took in milliseconds (e.g. elapsedMs from assign_task). Feeds average task time in models_list."),
      task: z.string().max(500).optional().describe("Short label for the task. Defaults to the session title when sessionID is given."),
      feedback: z.string().max(2000).optional().describe("Why this score: what went well or wrong. Feeds future assignment decisions."),
      includeRanking: z.boolean().optional().describe("Return the full per-agent ranking (default true)."),
    },
  },
  async (args) => {
    try {
      const orchester = (args.orchester ?? args.agent)?.trim();
      if (!orchester) {
        return fail(new Error("orchester (or legacy agent) is required"));
      }
      let task = args.task;
      if (args.sessionID) {
        const session = await oc.session(args.sessionID); // verifies the id
        if (!task && session?.title) task = session.title;
      }
      const modelRaw = (args.modelID ?? args.model)?.trim() || undefined;
      const provider = args.provider?.trim() || splitModelRef(modelRaw).provider || undefined;
      const result = recordScore(cfg.scoresFile, {
        orchester,
        agent: orchester,
        score: args.score,
        sessionID: args.sessionID,
        provider,
        model: modelRaw,
        task,
        feedback: args.feedback,
        ...(typeof args.durationMs === "number" ? { durationMs: args.durationMs } : {}),
      });

      const payload: Record<string, unknown> = {
        stored: true,
        file: cfg.scoresFile,
        record: result.record,
        agentStats: result.agentStats,
        bestAgent: result.ranking[0]?.agent ?? null,
      };
      if (args.includeRanking !== false) payload.ranking = result.ranking;
      return ok(payload);
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------------------------------------------------------------------------
// fetch_session
// ---------------------------------------------------------------------------
server.registerTool(
  "fetch_session",
  {
    title: "Fetch OpenCode session",
    description:
      "List recent OpenCode sessions (omit sessionID) or inspect one session in detail: " +
      "status, agent, model, cost, tokens and a compact transcript of the conversation " +
      "including tool calls. Use it to poll a task dispatched with wait:false, to check " +
      "on a run that hit its timeout, or to review an agent's work before scoring it.",
    inputSchema: {
      sessionID: z.string().optional().describe("Session to read (ses_…). Omit to list sessions."),
      limit: z.number().int().min(1).max(200).optional().describe("List: page size (default 20). Read: transcript messages kept (default 200 — the server caps a page at 200)."),
      order: z.enum(["asc", "desc"]).optional().describe("Transcript order, default \"asc\" (oldest first)."),
      includeMessages: z.boolean().optional().describe("Include the transcript when sessionID is given (default true)."),
      includePermissions: z.boolean().optional().describe("Include pending permission requests for this session (default true)."),
      runningOnly: z.boolean().optional().describe("List mode: only sessions that are currently running."),
    },
  },
  async (args) => {
    try {
      if (!args.sessionID) {
        const res = await oc.listSessions({ limit: args.limit ?? 20, order: "desc" });
        const active = Object.keys(await oc.activeSessions());
        let sessions = (res.data ?? []).map((s: any) => ({
          ...compactSession(s),
          running: active.includes(s.id),
        }));
        if (args.runningOnly) sessions = sessions.filter((s: any) => s.running);
        const fetched = sessions.length;
        const payload: Record<string, unknown> = {
          count: fetched,
          sessionsFetched: fetched,
          running: active.length,
          cursor: res.cursor ?? null,
          sessions,
        };
        fitArray(payload, "sessions", "tail", 3);
        payload.count = (payload.sessions as unknown[]).length;
        return ok(payload);
      }

      const [session, active] = await Promise.all([
        oc.session(args.sessionID),
        oc.activeSessions(),
      ]);

      const payload: Record<string, unknown> = {
        session: compactSession(session),
        running: Object.keys(active).includes(args.sessionID),
        directory: session?.location?.directory ?? oc.directory,
      };

      if (args.includeMessages !== false) {
        const messages = (
          await oc.messages(args.sessionID, {
            order: args.order ?? "asc",
            limit: args.limit ?? 200,
          })
        ).data ?? [];
        payload.messages = renderTranscript(messages, { maxMessages: 300 });
        payload.messageCount = messages.length;
        fitArray(payload, "messages", "head", 2);
        payload.messagesReturned = (payload.messages as unknown[]).length;
      }

      if (args.includePermissions !== false) {
        const pending = (
          await oc.permissionRequests(session?.location?.directory ?? oc.directory)
        ).filter((p) => p?.sessionID === args.sessionID);
        if (pending.length) payload.pendingPermissions = pending;
      }

      return ok(payload);
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
