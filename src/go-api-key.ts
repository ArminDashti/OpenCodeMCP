import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Portable env var for the OpenCode Go API key. */
export const OPENCODE_GO_API_KEY_ENV = "OPENCODE_GO_API_KEY";

/**
 * @deprecated Personal machine-specific name kept as a fallback for existing setups.
 * Prefer {@link OPENCODE_GO_API_KEY_ENV}.
 */
export const OPENCODE_GO_ARMIN_ENV = "OPENCODE_GO_ARMIN_DOPAMINE_GMAIL_API_KEY";

/** Well-known names checked first (order preserved for existing installs). */
const LEGACY_GO_KEY_ENV_NAMES = [
  OPENCODE_GO_ARMIN_ENV,
  OPENCODE_GO_API_KEY_ENV,
  "OPENCODE_GO_DASHTI75_API_KEY",
] as const;

const DOTENV_FILES = [
  path.join(process.cwd(), ".env"),
  path.join(os.homedir(), ".opencode-mcp", ".env"),
  path.join(os.homedir(), ".config", "opencode", ".env"),
];

let dotenvLoaded = false;

function parseDotenvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return [key, val];
}

/** Load simple `.env` files into `process.env` without overriding existing vars. */
export function loadDotenvFiles(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  for (const file of DOTENV_FILES) {
    try {
      const text = fs.readFileSync(file, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const parsed = parseDotenvLine(line);
        if (!parsed) continue;
        const [key, val] = parsed;
        if (process.env[key] === undefined && val.length > 0) {
          process.env[key] = val;
        }
      }
    } catch {
      /* missing file */
    }
  }
}

/**
 * Resolve OpenCode Go API key from env (after optional dotenv hydration).
 * Prefers well-known names (including legacy personal vars), then any
 * `OPENCODE_GO_*_API_KEY` pattern.
 */
export function resolveOpencodeGoApiKey(): string | undefined {
  loadDotenvFiles();
  for (const name of LEGACY_GO_KEY_ENV_NAMES) {
    const val = process.env[name]?.trim();
    if (val) return val;
  }
  for (const [name, raw] of Object.entries(process.env)) {
    if (!/^OPENCODE_GO_.+_API_KEY$/i.test(name)) continue;
    if ((LEGACY_GO_KEY_ENV_NAMES as readonly string[]).includes(name)) continue;
    const val = raw?.trim();
    if (val) return val;
  }
  return undefined;
}

const authFilePath = (): string =>
  path.join(os.homedir(), ".local", "share", "opencode", "auth.json");

/** Write `opencode-go` credentials so `opencode serve` uses the resolved key. */
export function syncGoAuthFromEnv(): boolean {
  const key = resolveOpencodeGoApiKey();
  if (!key) return false;

  const file = authFilePath();
  let auth: Record<string, { type?: string; key?: string }> = {};
  try {
    auth = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* new file */
  }

  const prev = auth["opencode-go"]?.key;
  if (prev === key) return true;

  auth["opencode-go"] = { type: "api", key };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(auth, null, 2) + "\n", "utf8");
  return true;
}

/** Environment for a detached `opencode serve` child (inherits + Go key). */
export function serveChildEnv(): NodeJS.ProcessEnv {
  loadDotenvFiles();
  syncGoAuthFromEnv();
  const key = resolveOpencodeGoApiKey();
  if (!key) return { ...process.env };
  // Stale User-level OPENCODE_API_KEY (Zen/other account) wins over auth.json in serve.
  return { ...process.env, OPENCODE_GO_API_KEY: key, OPENCODE_API_KEY: key };
}
