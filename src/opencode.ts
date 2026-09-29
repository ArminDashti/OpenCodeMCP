import type { Config } from "./config.js";

/** Structured failure that is safe to hand back to the orchestrator. */
export class OpenCodeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "OpenCodeError";
  }
}

/** OpenCode model reference: `providerID` + `id`, optionally a variant (effort tier). */
export interface ModelRef {
  providerID: string;
  id: string;
  variant?: string;
}

/**
 * Parse "provider/model" (optionally "provider/model@variant") into a Model.Ref.
 * A bare model name is rejected: the API always needs the provider.
 */
export function parseModelRef(input: string, variant?: string): ModelRef {
  let spec = input.trim();
  let v = variant;
  const at = spec.indexOf("@");
  if (at > 0) {
    v = spec.slice(at + 1).trim() || v;
    spec = spec.slice(0, at);
  }
  const slash = spec.indexOf("/");
  if (slash <= 0 || slash === spec.length - 1) {
    throw new OpenCodeError(
      `model must look like "provider/model" (e.g. "opencode-go/gpt-6-luna"), got "${input}"`,
    );
  }
  const ref: ModelRef = { providerID: spec.slice(0, slash), id: spec.slice(slash + 1) };
  if (v) ref.variant = v;
  return ref;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

/**
 * OpenCode rejects `limit` above 200 with HTTP 400 on both /session and
 * /session/{id}/message, so clamp instead of letting callers trip it.
 */
function clampLimit(limit?: number): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isFinite(limit)) return undefined;
  return Math.min(200, Math.max(1, Math.trunc(limit)));
}

/** Minimal typed client for the `opencode serve` HTTP API (OpenAPI at /openapi.json). */
export class OpenCode {
  constructor(private readonly cfg: Config) {}

  get baseUrl(): string {
    return this.cfg.baseUrl;
  }

  get directory(): string {
    return this.cfg.directory;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(this.cfg.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cfg.password) {
      const token = Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString(
        "base64",
      );
      headers["Authorization"] = `Basic ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(this.buildUrl(path, opts.query), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs ?? this.cfg.requestTimeoutMs),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new OpenCodeError(
        `Cannot reach the OpenCode server at ${this.cfg.baseUrl} (${message}). ` +
          `Start it with "opencode serve" or point OPENCODE_URL at a running instance.`,
      );
    }

    const raw = await res.text();

    if (res.status === 401 || res.status === 403) {
      throw new OpenCodeError(
        `OpenCode rejected the request (HTTP ${res.status}). The MCP normally reuses the ` +
          `password from ~/.config/opencode/service.json; if it was started manually, set ` +
          `OPENCODE_PASSWORD (or OPENCODE_SERVER_PASSWORD) to the password printed by ` +
          `"opencode serve", or run "opencode service restart".`,
        res.status,
        raw.slice(0, 300),
      );
    }
    if (!res.ok) {
      if (raw.trimStart().startsWith("<")) {
        throw new OpenCodeError(
          `GET ${path} returned HTML instead of JSON — OPENCODE_URL probably points at ` +
            `the web app or another site. Use the API base, e.g. http://127.0.0.1:4096.`,
          res.status,
        );
      }
      throw new OpenCodeError(
        `${method} ${path} failed with HTTP ${res.status}`,
        res.status,
        raw.slice(0, 500),
      );
    }

    if (!raw) return undefined as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /** `location[directory]` query — scopes list endpoints to a project. */
  private locationQuery(directory?: string): Record<string, string> {
    const dir = directory ?? this.cfg.directory;
    return dir ? { "location[directory]": dir } : {};
  }

  // ---- server -------------------------------------------------------------

  async info(): Promise<any> {
    return this.request("GET", "/api/info");
  }

  // ---- models / agents ----------------------------------------------------

  async models(directory?: string): Promise<any[]> {
    const res = await this.request<any>("GET", "/api/model", {
      query: this.locationQuery(directory),
      timeoutMs: 60_000,
    });
    return res?.data ?? [];
  }

  async defaultModel(directory?: string): Promise<any | undefined> {
    const res = await this.request<any>("GET", "/api/model/default", {
      query: this.locationQuery(directory),
    });
    return res?.data;
  }

  async agents(directory?: string): Promise<any[]> {
    const res = await this.request<any>("GET", "/api/agent", {
      query: this.locationQuery(directory),
    });
    return res?.data ?? [];
  }

  // ---- sessions -----------------------------------------------------------

  async listSessions(opts: { limit?: number; order?: "asc" | "desc" } = {}): Promise<{
    data: any[];
    cursor?: { previous?: string | null; next?: string | null };
  }> {
    return this.request("GET", "/api/session", {
      query: { limit: clampLimit(opts.limit), order: opts.order },
    });
  }

  async session(id: string): Promise<any> {
    const res = await this.request<any>("GET", `/api/session/${encodeURIComponent(id)}`);
    return res?.data ?? res;
  }

  async createSession(body: {
    title?: string;
    agent?: string;
    model?: ModelRef;
    directory?: string;
  }): Promise<any> {
    const payload: Record<string, unknown> = {};
    if (body.title) payload.title = body.title;
    if (body.agent) payload.agent = body.agent;
    if (body.model) payload.model = body.model;
    const dir = body.directory ?? this.cfg.directory;
    if (dir) payload.location = { directory: dir };
    const res = await this.request<any>("POST", "/api/session", { body: payload });
    return res?.data ?? res;
  }

  async setModel(sessionId: string, model: ModelRef): Promise<void> {
    await this.request("POST", `/api/session/${encodeURIComponent(sessionId)}/model`, {
      body: { model },
    });
  }

  async setAgent(sessionId: string, agent: string): Promise<void> {
    await this.request("POST", `/api/session/${encodeURIComponent(sessionId)}/agent`, {
      body: { agent },
    });
  }

  async interrupt(sessionId: string): Promise<void> {
    await this.request(
      "POST",
      `/api/session/${encodeURIComponent(sessionId)}/interrupt`,
      { timeoutMs: 10_000 },
    );
  }

  // ---- prompts / messages -------------------------------------------------

  /** Queue a prompt. Returns the inbox item (id + server-side creation time). */
  async prompt(
    sessionId: string,
    body: {
      text: string;
      files?: { uri: string; name?: string }[];
      delivery?: "steer" | "queue";
      metadata?: Record<string, unknown>;
    },
  ): Promise<any> {
    const payload: Record<string, unknown> = { text: body.text };
    if (body.files?.length) payload.files = body.files;
    if (body.delivery) payload.delivery = body.delivery;
    if (body.metadata) payload.metadata = body.metadata;
    const res = await this.request<any>(
      "POST",
      `/api/session/${encodeURIComponent(sessionId)}/prompt`,
      { body: payload },
    );
    return res?.data ?? res;
  }

  async messages(
    sessionId: string,
    opts: { limit?: number; order?: "asc" | "desc" } = {},
  ): Promise<{ data: any[]; cursor?: { previous?: string | null; next?: string | null } }> {
    return this.request("GET", `/api/session/${encodeURIComponent(sessionId)}/message`, {
      query: { limit: clampLimit(opts.limit), order: opts.order },
    });
  }

  async activeSessions(): Promise<Record<string, unknown>> {
    const res = await this.request<any>("GET", "/api/session/active");
    return res?.data ?? {};
  }

  // ---- permissions --------------------------------------------------------

  /**
   * Pending permission requests. The endpoint is location-scoped, so pass the
   * session's directory — otherwise requests from sessions in other projects
   * are invisible and a blocked run looks like a hang.
   */
  async permissionRequests(directory?: string): Promise<any[]> {
    const res = await this.request<any>("GET", "/api/permission/request", {
      query: this.locationQuery(directory),
    });
    return res?.data ?? [];
  }

  async replyPermission(
    sessionId: string,
    requestId: string,
    decision: "once" | "always" | "reject",
  ): Promise<void> {
    await this.request(
      "POST",
      `/api/session/${encodeURIComponent(sessionId)}/permission/${encodeURIComponent(requestId)}/reply`,
      { body: { decision }, timeoutMs: 10_000 },
    );
  }
}
