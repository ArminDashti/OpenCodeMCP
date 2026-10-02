#!/usr/bin/env node
/**
 * Integration harness: drives dist/index.js over MCP stdio and exercises all
 * four tools against a live `opencode serve`.
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

const FREE_MODEL = "opencode-go/longcat-2.5-preview-free";
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // --- tools/list ---------------------------------------------------------
  const list = await send("tools/list", {}, 20_000);
  const names = (list.tools ?? []).map((t) => t.name).sort();
  const expected = ["assign_task", "fetch_session", "models_list", "providers_list", "score_to_agent"];
  check(
    "tools/list exposes exactly the 5 tools",
    JSON.stringify(names) === JSON.stringify(expected),
    names.join(","),
  );
  check(
    "every tool has a description",
    (list.tools ?? []).every((t) => typeof t.description === "string" && t.description.length > 40),
  );

  // --- models_list --------------------------------------------------------
  const models = await callTool("models_list", { provider: "opencode-go", limit: 10 });
  check("models_list succeeds", !models.isError, models.isError ? models.text.slice(0, 300) : "");
  const modelRows = models.json?.models ?? [];
  check(
    "models_list returns opencode-go models with context limits",
    modelRows.length > 0 && modelRows.every((m) => typeof m.context === "number" && m.id.includes("/")),
    `${modelRows.length} rows, first=${modelRows[0]?.id}, default=${models.json?.default}`,
  );

  const allModels = await callTool("models_list", { limit: 500 });
  check(
    "models_list stays parseable and bounded when asked for everything",
    !allModels.isError &&
      allModels.json !== null &&
      typeof allModels.json?.default === "string" &&
      Array.isArray(allModels.json?.models) &&
      allModels.json.models.length > 0 &&
      allModels.json.models.length === allModels.json.returned,
    `default=${allModels.json?.default}, totalMatched=${allModels.json?.totalMatched}, returned=${allModels.json?.returned}, truncated=${allModels.json?.truncated ?? false}`,
  );

  // --- assign_task (blocking) --------------------------------------------
  const assign = await callTool(
    "assign_task",
    {
      task: "Reply with exactly the word PONG and nothing else.",
      title: "mcp-harness-blocking",
      model: FREE_MODEL,
      wait: true,
      timeoutMs: 120_000,
    },
    150_000,
  );
  check("assign_task (wait) succeeds", !assign.isError, assign.isError ? assign.text.slice(0, 400) : "");
  check(
    "assign_task completed with a PONG reply",
    assign.json?.status === "completed" && /\bPONG\b/.test(assign.json?.reply ?? ""),
    `status=${assign.json?.status} reply=${JSON.stringify(assign.json?.reply)} model=${assign.json?.sessionModel} tokens=${JSON.stringify(assign.json?.tokens)}`,
  );
  const sessionID = assign.json?.sessionID;
  check("assign_task returned a session id", /^ses_/.test(sessionID ?? ""), sessionID);

  // --- assign_task (fire and forget + fetch polling) ----------------------
  const dispatch = await callTool(
    "assign_task",
    {
      task: "Reply with exactly the word PING and nothing else.",
      title: "mcp-harness-async",
      model: FREE_MODEL,
      wait: false,
    },
    60_000,
  );
  check(
    "assign_task (wait:false) dispatches immediately",
    !dispatch.isError && dispatch.json?.status === "dispatched",
    `status=${dispatch.json?.status} session=${dispatch.json?.sessionID}`,
  );

  let asyncDone = null;
  if (dispatch.json?.sessionID) {
    for (let i = 0; i < 40; i++) {
      const poll = await callTool("fetch_session", { sessionID: dispatch.json.sessionID }, 30_000);
      if (poll.json?.session?.outcome) {
        asyncDone = poll;
        break;
      }
      await sleep(1500);
    }
    check(
      "fetch_session polls the async run to completion",
      asyncDone !== null && asyncDone.json?.session?.outcome === "succeeded",
      `outcome=${asyncDone?.json?.session?.outcome} running=${asyncDone?.json?.running}`,
    );
    check(
      "async transcript contains the PING reply",
      (asyncDone?.json?.messages ?? []).some(
        (m) => m.type === "assistant" && /\bPING\b/.test(m.text ?? ""),
      ),
      `messages=${asyncDone?.json?.messageCount}`,
    );
  }

  // --- fetch_session ------------------------------------------------------
  const fetched = await callTool("fetch_session", { sessionID, includeMessages: true });
  check("fetch_session returns the session", !fetched.isError && fetched.json?.session?.id === sessionID);
  check(
    "fetch_session transcript includes assistant output",
    (fetched.json?.messages ?? []).some((m) => m.type === "assistant"),
    `messages=${fetched.json?.messageCount}, cost=${fetched.json?.session?.cost}`,
  );

  const listing = await callTool("fetch_session", { limit: 5 });
  check(
    "fetch_session lists sessions when no id given",
    !listing.isError && Array.isArray(listing.json?.sessions) && listing.json.sessions.length > 0,
    `count=${listing.json?.count}`,
  );

  // --- score_to_agent -----------------------------------------------------
  const score = await callTool("score_to_agent", {
    agent: "build",
    score: 92,
    sessionID,
    model: FREE_MODEL,
    feedback: "Answered exactly as asked; harness test run.",
  });
  check("score_to_agent stores the score", !score.isError && score.json?.stored === true);
  check(
    "score_to_agent returns stats and ranking",
    score.json?.agentStats?.count >= 1 && Array.isArray(score.json?.ranking) && score.json.ranking.length >= 1,
    `count=${score.json?.agentStats?.count} avg=${score.json?.agentStats?.average} best=${score.json?.bestAgent}`,
  );

  // --- error surfacing ----------------------------------------------------
  const bad = await callTool(
    "assign_task",
    { task: "This should fail fast.", model: "nomodel" },
    60_000,
  );
  check(
    "bad model reference is reported as a tool error",
    bad.isError && /provider\/model/.test(bad.text),
    bad.text.slice(0, 200),
  );

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
