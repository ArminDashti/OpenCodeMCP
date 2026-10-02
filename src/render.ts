import type { OpenCode } from "./opencode.js";

export interface RenderedTool {
  name: string;
  status?: string;
  error?: string;
}

export interface RenderedMessage {
  type: string;
  at?: number;
  text?: string;
  agent?: string;
  model?: string;
  outcome?: string;
  tools?: RenderedTool[];
  toolCalls?: number;
  description?: string;
}

const TEXT_CAP = 4000;

function clip(text: string, max = TEXT_CAP): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[+${text.length - max} chars truncated]`;
}

function toolOf(part: any): RenderedTool {
  const state = part?.state ?? {};
  const status: string | undefined =
    state.status ?? state.type ?? (part?.executed ? "completed" : "pending");
  const err = state.error ?? state.message;
  const out: RenderedTool = { name: part?.name ?? "tool" };
  if (status) out.status = String(status);
  if (typeof err === "string" && status === "error") out.error = clip(err, 500);
  return out;
}

/** Reduce one OpenCode message to something an orchestrator can read cheaply. */
export function renderMessage(msg: any): RenderedMessage {
  const at: number | undefined = msg?.time?.created;
  const type: string = msg?.type ?? "unknown";

  switch (type) {
    case "user":
      return { type, at, text: clip(msg.text ?? "") };
    case "assistant": {
      const parts: any[] = Array.isArray(msg.content) ? msg.content : [];
      const text = parts
        .filter((p) => p?.type === "text")
        .map((p) => String(p.text ?? ""))
        .join("");
      const reasoning = parts
        .filter((p) => p?.type === "reasoning")
        .map((p) => String(p.text ?? ""))
        .join(" ")
        .trim();
      const tools = parts.filter((p) => p?.type === "tool").map(toolOf);
      const out: RenderedMessage = {
        type,
        at,
        agent: msg.agent,
        model: msg.model ? `${msg.model.providerID}/${msg.model.id}` : undefined,
        text: clip(text),
      };
      if (reasoning) out.description = `reasoning: ${clip(reasoning, 600)}`;
      if (tools.length) {
        out.tools = tools.slice(0, 50);
        out.toolCalls = tools.length;
      }
      if (msg.finish && msg.finish !== "stop") out.outcome = msg.finish;
      return out;
    }
    case "system":
    case "synthetic":
    case "skill":
      return { type, at, text: clip(String(msg.text ?? "")), description: msg.description };
    case "shell":
      return { type, at, text: clip(String(msg.command ?? msg.text ?? "")) };
    case "idle":
      return { type, at, outcome: msg.outcome };
    case "model-switched":
      return { type, at, model: msg.model ? `${msg.model.providerID}/${msg.model.id}` : undefined };
    case "agent-switched":
      return { type, at, agent: msg.agent };
    default:
      return { type, at };
  }
}

/** Render a transcript, optionally only messages at/after `since` (server clock, ms). */
export function renderTranscript(
  messages: any[],
  opts: { since?: number; maxMessages?: number } = {},
): RenderedMessage[] {
  const filtered =
    opts.since !== undefined
      ? messages.filter((m) => (m?.time?.created ?? 0) >= opts.since!)
      : messages;
  const capped = opts.maxMessages ? filtered.slice(-opts.maxMessages) : filtered;
  return capped.map(renderMessage);
}

/** Concatenate assistant text produced at/after `since`. */
export function collectReply(messages: any[], since: number): string {
  const texts = messages
    .filter((m) => m?.type === "assistant" && (m?.time?.created ?? 0) >= since)
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((p) => p?.type === "text")
    .map((p) => String(p.text ?? ""));
  return texts.join("\n").trim();
}

/** Count tool invocations in assistant messages at/after `since`. */
export function countToolCalls(messages: any[], since: number): number {
  return messages
    .filter((m) => m?.type === "assistant" && (m?.time?.created ?? 0) >= since)
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((p) => p?.type === "tool").length;
}

export function compactSession(s: any): Record<string, unknown> {
  const tokens = s?.tokens ?? {};
  return {
    id: s?.id,
    title: s?.title ?? null,
    agent: s?.agent ?? null,
    model: s?.model ? `${s.model.providerID}/${s.model.id}` : null,
    outcome: s?.outcome ?? null,
    cost: s?.cost ?? 0,
    tokens: {
      input: tokens.input ?? 0,
      output: tokens.output ?? 0,
      reasoning: tokens.reasoning ?? 0,
    },
    created: s?.time?.created,
    updated: s?.time?.updated,
    idle: s?.time?.idle ?? null,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An assistant message counts as finished once the server stamped `time.completed`. */
function replyCompletedAt(m: any, since: number): boolean {
  return (
    m?.type === "assistant" &&
    (m?.time?.created ?? 0) >= since &&
    m?.time?.completed != null
  );
}

/**
 * Derive a session outcome when the server no longer stamps `session.outcome`.
 * Returns null while the run is still going so pollers keep waiting.
 */
export function deriveOutcome(
  session: any,
  messages: any[],
  running = false,
): string | null {
  if (typeof session?.outcome === "string" && session.outcome) return session.outcome;
  if (running) return null;
  const assistants = messages.filter((m) => m?.type === "assistant");
  const last = assistants[assistants.length - 1];
  if (!last?.time?.completed) return null;
  return last.finish && last.finish !== "stop" ? "failed" : "succeeded";
}

export interface WaitOutcome {
  status: "completed" | "timeout" | "blocked" | "failed";
  session: any;
  /** Server-clock time of the prompt that was awaited. */
  promptAt: number;
  pendingPermission?: any;
  approvedCount: number;
  elapsedMs: number;
}

/**
 * Wait until a session goes idle after `promptAt`, honouring permission requests.
 *
 * - `autoApprove` answers pending permission requests with "once".
 * - Without it, a pending request ends the wait with status "blocked" so the
 *   orchestrator can decide (it can reply through the OpenCode permission API).
 */
export async function waitForIdle(
  oc: OpenCode,
  sessionId: string,
  promptAt: number,
  opts: { timeoutMs: number; autoApprove?: boolean; pollMs?: number; directory?: string },
): Promise<WaitOutcome> {
  const started = Date.now();
  const deadline = started + opts.timeoutMs;
  const pollMs = opts.pollMs ?? 700;
  let approved = 0;
  let lastSession: any = null;
  let inactivePolls = 0;

  while (Date.now() < deadline) {
    await sleep(pollMs);

    let session: any;
    try {
      session = await oc.session(sessionId);
      lastSession = session;
    } catch {
      continue; // transient hiccup; the deadline bounds the loop
    }

    // Completion signal: the session left the active map *and* a reply landed
    // at/after the prompt (avoids racing the window before the run starts).
    // Builds that still stamp `time.idle` keep working unchanged.
    const legacyIdle = Boolean(session?.time?.idle && session.time.idle >= promptAt);
    let active = true;
    try {
      const map = await oc.activeSessions();
      active = Object.prototype.hasOwnProperty.call(map ?? {}, sessionId);
    } catch {
      active = true; // unknown → keep polling
    }

    let completedReply = false;
    if (!active) {
      try {
        const msgs = (await oc.messages(sessionId, { order: "desc", limit: 20 })).data ?? [];
        completedReply = msgs.some((m: any) => replyCompletedAt(m, promptAt));
      } catch {
        completedReply = false;
      }
      inactivePolls = completedReply ? inactivePolls + 1 : 0;
    } else {
      inactivePolls = 0;
    }

    if (legacyIdle || inactivePolls >= 2) {
      let failed = session?.outcome === "failed";
      if (!failed && !legacyIdle) {
        try {
          const msgs = (await oc.messages(sessionId, { order: "desc", limit: 5 })).data ?? [];
          const last = msgs.find((m: any) => replyCompletedAt(m, promptAt));
          failed = Boolean(last && last.finish && last.finish !== "stop");
        } catch {
          /* keep completed */
        }
      }
      return {
        status: failed ? "failed" : "completed",
        session,
        promptAt,
        approvedCount: approved,
        elapsedMs: Date.now() - started,
      };
    }

    let pending: any[] = [];
    try {
      // The permission endpoint is location-scoped: ask with the session's own
      // directory, falling back to the directory the task was assigned in.
      const sessionDir: string | undefined =
        session?.location?.directory ?? opts.directory ?? oc.directory;
      pending = (await oc.permissionRequests(sessionDir)).filter(
        (p) => p?.sessionID === sessionId,
      );
    } catch {
      pending = [];
    }
    if (pending.length === 0 && !session?.time?.idle) {
      // A run can also block before the permission record exists for this
      // location; probing the default location keeps the common case covered.
      try {
        const extra = await oc.permissionRequests(opts.directory);
        pending = extra.filter((p) => p?.sessionID === sessionId);
      } catch {
        /* ignore */
      }
    }
    if (pending.length > 0) {
      if (!opts.autoApprove) {
        return {
          status: "blocked",
          session,
          promptAt,
          pendingPermission: pending[0],
          approvedCount: approved,
          elapsedMs: Date.now() - started,
        };
      }
      for (const req of pending) {
        try {
          await oc.replyPermission(sessionId, req.id, "once");
          approved += 1;
        } catch {
          /* another client may have answered it first */
        }
      }
      if (approved > 200) {
        return {
          status: "blocked",
          session,
          promptAt,
          pendingPermission: pending[0],
          approvedCount: approved,
          elapsedMs: Date.now() - started,
        };
      }
    }
  }

  return {
    status: "timeout",
    session: lastSession,
    promptAt,
    approvedCount: approved,
    elapsedMs: Date.now() - started,
  };
}
