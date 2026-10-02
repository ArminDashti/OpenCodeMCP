import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, spawn } from "node:child_process";

import type { Config } from "./config.js";

/**
 * OpenCode v2 keeps its background server ("opencode service") credential in
 * ~/.config/opencode/service.json as { port, password }. The MCP reuses it so
 * an orchestrator needs no manual secret wiring.
 */
export interface ServiceCredential {
  port: number;
  password?: string;
  file: string;
}

export function serviceFilePath(): string {
  return (
    process.env.OPENCODE_SERVICE_FILE ??
    path.join(os.homedir(), ".config", "opencode", "service.json")
  );
}

export function readService(file = serviceFilePath()): ServiceCredential | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const port = Number(raw?.port);
    if (!Number.isFinite(port) || port <= 0) return null;
    return {
      port,
      password: typeof raw?.password === "string" && raw.password ? raw.password : undefined,
      file,
    };
  } catch {
    return null;
  }
}

/** Run `opencode service <verb>` (start/restart/stop). Returns true on success. */
export function runServiceCommand(verb: "start" | "restart" | "stop"): boolean {
  try {
    execSync(`opencode service ${verb}`, { stdio: "pipe", timeout: 90_000 });
    return true;
  } catch {
    return false;
  }
}

/** PID file for the `opencode serve` fallback (newer builds drop `opencode service`). */
export function servePidFile(): string {
  return path.join(os.homedir(), ".opencode-mcp", "serve.pid");
}

function portFromBaseUrl(baseUrl: string): number {
  try {
    const port = Number(new URL(baseUrl).port);
    return Number.isInteger(port) && port > 0 ? port : 4096;
  } catch {
    return 4096;
  }
}

/**
 * Start a detached `opencode serve` on `port` — the fallback for OpenCode
 * builds that no longer ship the `opencode service` subcommand.
 */
export function startServeFallback(port: number): boolean {
  try {
    const child = spawn(`opencode serve --port ${port}`, {
      detached: true,
      stdio: "ignore",
      shell: true,
      windowsHide: true,
    });
    child.on("error", () => {
      /* surfaced through the readiness probe, not here */
    });
    child.unref();
    fs.mkdirSync(path.dirname(servePidFile()), { recursive: true });
    fs.writeFileSync(servePidFile(), JSON.stringify({ pid: child.pid, port }));
    return true;
  } catch {
    return false;
  }
}

/** Stop the `opencode serve` fallback process started by startServeFallback. */
export function stopServeFallback(): boolean {
  let pid = 0;
  try {
    pid = Number(JSON.parse(fs.readFileSync(servePidFile(), "utf8"))?.pid);
  } catch {
    return false;
  }
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "pipe" });
    } else {
      process.kill(pid, "SIGTERM");
    }
    fs.rmSync(servePidFile(), { force: true });
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ProbeState = "ok" | "unauthorized" | "unreachable";

async function probe(baseUrl: string, password?: string, timeoutMs = 5_000): Promise<ProbeState> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (password) {
    headers.Authorization =
      "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
  }
  try {
    const res = await fetch(`${baseUrl}/api/info`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401 || res.status === 403) return "unauthorized";
    return res.status < 500 ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export interface ResolvedEndpoint {
  baseUrl: string;
  password?: string;
  /** Human-readable description of where the endpoint came from. */
  source: string;
  notes: string[];
}

/**
 * Decide which OpenCode server to talk to, in priority order:
 *   1. OPENCODE_URL / OPENCODE_SERVER_URL (explicit wins, never autostarts)
 *   2. the background service from ~/.config/opencode/service.json
 *   3. `opencode service start`, then its freshly written service.json
 *   4. the configured default URL (http://127.0.0.1:4096)
 */
export async function resolveEndpoint(cfg: Config): Promise<ResolvedEndpoint> {
  const notes: string[] = [];

  if (process.env.OPENCODE_URL || process.env.OPENCODE_SERVER_URL) {
    return { baseUrl: cfg.baseUrl, password: cfg.password, source: "OPENCODE_URL", notes };
  }

  let cred = readService();
  if (cred) {
    const url = `http://127.0.0.1:${cred.port}`;
    const state = await probe(url, cred.password ?? cfg.password);
    if (state === "ok") {
      return {
        baseUrl: url,
        password: cred.password ?? cfg.password,
        source: `background service (${cred.file})`,
        notes,
      };
    }

    if (cfg.autostart) {
      const verb = state === "unauthorized" ? "restart" : "start";
      if (runServiceCommand(verb)) {
        cred = readService() ?? cred;
        const retryUrl = `http://127.0.0.1:${cred.port}`;
        if ((await probe(retryUrl, cred.password)) === "ok") {
          notes.push(`recovered the background service with "opencode service ${verb}"`);
          return {
            baseUrl: retryUrl,
            password: cred.password,
            source: `background service after ${verb} (${cred.file})`,
            notes,
          };
        }
      }
      notes.push(
        `background service at ${url} was ${state} and "opencode service ${verb}" did not fix it`,
      );
    }

    return {
      baseUrl: url,
      password: cred.password ?? cfg.password,
      source: `background service, unverified (${cred.file})`,
      notes,
    };
  }

  if (cfg.autostart) {
    if (runServiceCommand("start")) {
      const started = readService();
      if (started) {
        const url = `http://127.0.0.1:${started.port}`;
        if ((await probe(url, started.password)) === "ok") {
          notes.push('started the OpenCode background service with "opencode service start"');
          return {
            baseUrl: url,
            password: started.password,
            source: `background service, started by MCP (${started.file})`,
            notes,
          };
        }
      }
    }
    // Builds without `opencode service` never write service.json; fall back to
    // a detached `opencode serve` on the configured port.
    const state = await probe(cfg.baseUrl, cfg.password);
    if (state !== "ok") {
      if (startServeFallback(portFromBaseUrl(cfg.baseUrl))) {
        for (let i = 0; i < 40 && (await probe(cfg.baseUrl, cfg.password)) !== "ok"; i++) {
          await sleep(500);
        }
        if ((await probe(cfg.baseUrl, cfg.password)) === "ok") {
          notes.push("started a detached `opencode serve` (no `opencode service` command)");
          return {
            baseUrl: cfg.baseUrl,
            password: cfg.password,
            source: "detached opencode serve, started by MCP",
            notes,
          };
        }
      }
      notes.push(
        'no service.json and neither "opencode service start" nor "opencode serve" produced a reachable server',
      );
    } else {
      notes.push(`OpenCode already reachable at ${cfg.baseUrl} (no service.json in this build)`);
      return { baseUrl: cfg.baseUrl, password: cfg.password, source: "detached opencode serve", notes };
    }
  }

  return { baseUrl: cfg.baseUrl, password: cfg.password, source: "default", notes };
}
