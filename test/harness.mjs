#!/usr/bin/env node
/**
 * Integration harness: drives dist/index.js over MCP stdio and exercises all
 * five tools against a live `opencode serve`.
 *
 * Required env: OPENCODE_URL, OPENCODE_PASSWORD
 * Optional env: OPENCODE_DIRECTORY, OPENCODE_SCORES_FILE
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, "..", "dist", "index.js");

if (!process.env.OPENCODE_URL || !process.env.OPENCODE_PASSWORD) {
  console.log(
    "note: OPENCODE_URL / OPENCODE_PASSWORD not fully set — the server will fall back to " +
      "~/.config/opencode/service.json discovery (or the default URL).",
  );
}

const FREE_PROVIDER = "opencode-go";
const FREE_MODEL_ID = "gpt-6-luna";
const results = [];
let nextId = 1;
let stderrBuffer = "";

const child = spawn(process.execPath, [serverJs], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => (stderrBuffer += chunk));

const pending = new Map();
let buffer = "";

child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }
});

function send(method, params = {}, timeoutMs = 60_000) {
  const id = nextId++;
  const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout after ${timeoutMs}ms waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(payload);
  });
}

function notify(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function parseTool(result) {
  const text = (result?.content ?? []).map((c) => c.text).join("\n");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  return { text, json, isError: Boolean(result?.isError) };
}

async function callTool(name, args, timeoutMs = 180_000) {
  const res = await send("tools/call", { name, arguments: args }, timeoutMs);
  return { ...parseTool(res), raw: res };
}

async function main() {
  const init = await send(
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "opencode-mcp-harness", version: "0.0.1" },
    },
    20_000,
  );
  check(
    "initialize",
    init?.serverInfo?.name === "opencode-mcp",
    `serverInfo=${JSON.stringify(init?.serverInfo)}`,
  );
  notify("notifications/initialized");

  const list = await send("tools/list", {}, 20_000);
  const names = (list.tools ?? []).map((t) => t.name).sort();
  const expected = ["assign_task", "model", "providers", "score", "sessions"];
  check(
    "tools/list exposes exactly the 5 tools",
    JSON.stringify(names) === JSON.stringify(expected),
    names.join(","),
  );

  const prov = await callTool("providers", {}, 20_000);
  check(
    "providers returns provider ids",
    !prov.isError && Array.isArray(prov.json?.provider) && prov.json.provider.includes(FREE_PROVIDER),
    `count=${prov.json?.provider?.length}`,
  );

  const modelList = await callTool("model", { provider: FREE_PROVIDER, onlyFreeModels: false });
  check("model succeeds", !modelList.isError, modelList.isError ? modelList.text.slice(0, 300) : "");
  const modelRows = modelList.json?.model ?? [];
  check(
    "model returns modelId and free",
    modelRows.length > 0 && modelRows.every((m) => typeof m.modelId === "string" && typeof m.free === "boolean"),
    `${modelRows.length} rows`,
  );

  const assign = await callTool(
    "assign_task",
    {
      prompt: "Reply with exactly the word PONG and nothing else.",
      title: "mcp-harness",
      provider: FREE_PROVIDER,
      modelId: FREE_MODEL_ID,
    },
    150_000,
  );
  check("assign_task succeeds", !assign.isError, assign.isError ? assign.text.slice(0, 400) : "");
  check(
    "assign_task response shape",
    assign.json?.sessionId &&
      /\bPONG\b/.test(assign.json?.response ?? "") &&
      typeof assign.json?.duration === "number" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(assign.json?.startedAt ?? ""),
    JSON.stringify(assign.json),
  );
  const sessionId = assign.json?.sessionId;

  const sessions = await callTool("sessions", { limit: 16 });
  check(
    "sessions returns sessionId list",
    !sessions.isError &&
      Array.isArray(sessions.json?.sessionId) &&
      sessions.json.sessionId.includes(sessionId),
    `ids=${sessions.json?.sessionId?.length}`,
  );

  const score = await callTool("score", { sessionId, score: 9 });
  check("score returns success", !score.isError && score.json?.result === "success");

  const bad = await callTool(
    "assign_task",
    { prompt: "fail", provider: FREE_PROVIDER, modelId: "nomodel" },
    60_000,
  );
  check("bad model is a tool error", bad.isError, bad.text.slice(0, 200));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("server stderr:\n" + stderrBuffer.slice(0, 2000));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("HARNESS ERROR:", err);
    console.error("server stderr:\n" + stderrBuffer.slice(0, 2000));
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill();
  });
