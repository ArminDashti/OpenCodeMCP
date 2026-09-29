import os from "node:os";
import path from "node:path";

/** Runtime configuration, resolved from the environment on every start. */
export interface Config {
  /** Base URL of a running `opencode serve` instance, no trailing slash. */
  baseUrl: string;
  /** HTTP basic-auth user (OpenCode uses "opencode"). */
  username: string;
  /** HTTP basic-auth password; taken from OPENCODE_PASSWORD / OPENCODE_SERVER_PASSWORD. */
  password?: string;
  /** Project directory tasks run in when a tool call does not override it. */
  directory: string;
  /** JSON file backing score_to_agent. */
  scoresFile: string;
  /** Per-request HTTP timeout in milliseconds. */
  requestTimeoutMs: number;
  /** Start/recover the OpenCode background service when nothing is reachable. */
  autostart: boolean;
}

const DEFAULT_PORT = 4096;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(): Config {
  const baseUrl = (
    process.env.OPENCODE_URL ??
    process.env.OPENCODE_SERVER_URL ??
    `http://127.0.0.1:${DEFAULT_PORT}`
  ).replace(/\/+$/, "");

  const password = process.env.OPENCODE_PASSWORD ?? process.env.OPENCODE_SERVER_PASSWORD;

  return {
    baseUrl,
    username: process.env.OPENCODE_USERNAME ?? "opencode",
    password: password && password.length > 0 ? password : undefined,
    directory: process.env.OPENCODE_DIRECTORY ?? process.cwd(),
    scoresFile:
      process.env.OPENCODE_SCORES_FILE ??
      path.join(os.homedir(), ".opencode-mcp", "scores.json"),
    requestTimeoutMs: envInt("OPENCODE_TIMEOUT_MS", 30_000),
    autostart: !/^(0|false|no|off)$/i.test(process.env.OPENCODE_AUTOSTART ?? "1"),
  };
}
