import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  OPENCODE_GO_API_KEY_ENV,
  OPENCODE_GO_ARMIN_ENV,
  loadDotenvFiles,
  resolveOpencodeGoApiKey,
  syncGoAuthFromEnv,
} from "../dist/go-api-key.js";

loadDotenvFiles();
let key = resolveOpencodeGoApiKey();
if (!key) {
  console.error(
    `Set ${OPENCODE_GO_API_KEY_ENV} (or a legacy OPENCODE_GO_*_API_KEY) in the environment or ${path.join(process.cwd(), ".env")}, then re-run.`,
  );
  process.exit(1);
}

// Prefer writing the portable name; keep legacy User env in sync when present on Windows.
const primaryEnv = OPENCODE_GO_API_KEY_ENV;
if (process.platform === "win32") {
  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `[Environment]::SetEnvironmentVariable('${primaryEnv}', $env:SYNC_GO_KEY, 'User')`,
      ],
      { stdio: "ignore", env: { ...process.env, SYNC_GO_KEY: key } },
    );
  } catch {
    /* best-effort */
  }
}

const envPath = path.join(process.cwd(), ".env");
let body = "";
try {
  body = fs.readFileSync(envPath, "utf8");
} catch {
  /* new */
}
if (!new RegExp(`^${primaryEnv}=`, "m").test(body)) {
  // Migrate legacy personal line if that was the only key source.
  const legacyLine = new RegExp(`^${OPENCODE_GO_ARMIN_ENV}=`, "m");
  if (legacyLine.test(body)) {
    body = body.replace(legacyLine, `${primaryEnv}=`);
    fs.writeFileSync(envPath, body.endsWith("\n") ? body : body + "\n", "utf8");
  } else {
    fs.appendFileSync(
      envPath,
      (body.endsWith("\n") || !body ? "" : "\n") + `${primaryEnv}=${key}\n`,
    );
  }
}

syncGoAuthFromEnv();
console.log(`synced ${primaryEnv} (len ${key.length}) and opencode auth.json`);
