import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CliConfig {
  /** Port the OpenCode API is expected on when no OPENCODE_URL / service.json wins. */
  apiPort: number;
  /** Port `opencodemcp webui` listens on. */
  webuiPort: number;
}

export const DEFAULT_API_PORT = 4096;
export const DEFAULT_WEBUI_PORT = 8090;

export function cliConfigPath(): string {
  return (
    process.env.OPENCODE_MCP_CONFIG ??
    path.join(os.homedir(), ".opencode-mcp", "config.json")
  );
}

function validPort(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 65535
  );
}

export function loadCliConfig(): CliConfig {
  const fallback: CliConfig = {
    apiPort: DEFAULT_API_PORT,
    webuiPort: DEFAULT_WEBUI_PORT,
  };
  try {
    const raw = JSON.parse(fs.readFileSync(cliConfigPath(), "utf8"));
    return {
      apiPort: validPort(raw?.apiPort) ? raw.apiPort : fallback.apiPort,
      webuiPort: validPort(raw?.webuiPort) ? raw.webuiPort : fallback.webuiPort,
    };
  } catch {
    return fallback;
  }
}

export function saveCliConfig(partial: Partial<CliConfig>): CliConfig {
  const current = loadCliConfig();
  const next: CliConfig = {
    apiPort: partial.apiPort ?? current.apiPort,
    webuiPort: partial.webuiPort ?? current.webuiPort,
  };
  if (partial.apiPort !== undefined && !validPort(partial.apiPort)) {
    throw new Error(
      `invalid --port "${partial.apiPort}": expected an integer 1-65535`,
    );
  }
  if (partial.webuiPort !== undefined && !validPort(partial.webuiPort)) {
    throw new Error(
      `invalid --port "${partial.webuiPort}": expected an integer 1-65535`,
    );
  }
  const file = cliConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
  return next;
}

/** Parse --port=1234 / --port 1234 / -p 1234 from an argv slice. */
export function parsePortFlag(args: string[]): number | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--port=")) {
      const n = Number(a.slice("--port=".length));
      if (!Number.isInteger(n)) throw new Error(`invalid --port value "${a}"`);
      return n;
    }
    if (a === "--port" || a === "-p" || a === "--api-port" || a === "--webui-port") {
      const next = args[i + 1];
      if (next === undefined) throw new Error(`missing value for ${a} (expected a port number)`);
      const n = Number(next);
      if (!Number.isInteger(n)) throw new Error(`invalid ${a} value "${next}"`);
      return n;
    }
  }
  return undefined;
}
