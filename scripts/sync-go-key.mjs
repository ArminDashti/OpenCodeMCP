import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  OPENCODE_GO_ARMIN_ENV,
  loadDotenvFiles,
  resolveOpencodeGoApiKey,
  syncGoAuthFromEnv,
} from "../dist/go-api-key.js";

loadDotenvFiles();
let key = resolveOpencodeGoApiKey();
if (!key) {
  console.error(
    `Set ${OPENCODE_GO_ARMIN_ENV} (User env or ${path.join(process.cwd(), ".env")}) then re-run.`,
  );
  process.exit(1);
}

execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `[Environment]::SetEnvironmentVariable('${OPENCODE_GO_ARMIN_ENV}', $env:SYNC_GO_KEY, 'User')`,
  ],
  { stdio: "ignore", env: { ...process.env, SYNC_GO_KEY: key } },
);

const envPath = path.join(process.cwd(), ".env");
let body = "";
try {
  body = fs.readFileSync(envPath, "utf8");
} catch {
  /* new */
}
if (!new RegExp(`^${OPENCODE_GO_ARMIN_ENV}=`, "m").test(body)) {
  fs.appendFileSync(
    envPath,
    (body.endsWith("\n") || !body ? "" : "\n") + `${OPENCODE_GO_ARMIN_ENV}=${key}\n`,
  );
}

syncGoAuthFromEnv();
console.log(`synced ${OPENCODE_GO_ARMIN_ENV} (len ${key.length}) and opencode auth.json`);
