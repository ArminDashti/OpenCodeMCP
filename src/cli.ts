#!/usr/bin/env node
/**
 * opencodemcp — terminal CLI for the opencode-mcp bridge.
 *
 *   opencodemcp service start|stop|restart|status
 *   opencodemcp doctor
 *   opencodemcp help
 *   opencodemcp webui [--port N]
 *   opencodemcp webui port [--port N]
 *   opencodemcp api port [--port N]
 *   opencodemcp update            (placeholder)
 *   opencodemcp remove            (placeholder)
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.js";
import { readService, runServiceCommand, serviceFilePath } from "./bootstrap.js";
import {
  DEFAULT_API_PORT,
  DEFAULT_WEBUI_PORT,
  cliConfigPath,
  loadCliConfig,
  parsePortFlag,
  saveCliConfig,
} from "./cli-config.js";
import { startWebui } from "./webui.js";
import { loadStore, aggregate } from "./scores.js";

const VERSION = "0.1.0";

function help(): string {
  return `opencodemcp ${VERSION} — CLI for the opencode-mcp bridge

Usage:
  opencodemcp service start|stop|restart|status
  opencodemcp doctor
  opencodemcp webui [--port <n>]        Run the local dashboard web UI
  opencodemcp webui port [--port <n>]   Show or set the web UI port (default ${DEFAULT_WEBUI_PORT})
  opencodemcp api port [--port <n>]     Show or set the API port (default ${DEFAULT_API_PORT})
  opencodemcp update                    (placeholder — not implemented yet)
  opencodemcp remove                    (placeholder — not implemented yet)
  opencodemcp help                      Show this help
  opencodemcp --help | -h               Show this help
  opencodemcp --version | -v            Show version

Ports are persisted in ${cliConfigPath()}.

Examples:
  opencodemcp service start
  opencodemcp service status
  opencodemcp doctor
  opencodemcp webui --port 8090
  opencodemcp api port --port=4096
  opencodemcp webui port --port=8090
`;
}

function fail(msg: string, code = 1): never {
  console.error(`opencodemcp: ${msg}`);
  console.error(`Run "opencodemcp help" for usage.`);
  process.exit(code);
}

async function probe(baseUrl: string, password: string | undefined, timeoutMs = 5000): Promise<boolean> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (password) {
    headers.Authorization = "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
  }
  try {
    const res = await fetch(`${baseUrl}/api/info`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401 || res.status === 403) return false;
    return res.status < 500;
  } catch {
    return false;
  }
}

async function serviceStatusJson(): Promise<void> {
  const cfg = loadConfig();
  const svc = readService();
  const url = svc ? `http://127.0.0.1:${svc.port}` : cfg.baseUrl;
  const reachable = probe(url, svc?.password ?? cfg.password);
  console.log(
    JSON.stringify(
      {
        running: reachable,
        url,
        serviceFile: svc?.file ?? serviceFilePath(),
        servicePort: svc?.port ?? null,
        hasPassword: Boolean(svc?.password ?? cfg.password),
        reachable,
      },
      null,
      2,
    ),
  );
  if (!reachable) process.exitCode = 1;
}

async function serviceStatusText(): Promise<void> {
  const cfg = loadConfig();
  const svc = readService();
  if (!svc) {
    console.log(`service: not configured (no ${serviceFilePath()})`);
    console.log(`fallback url: ${cfg.baseUrl}`);
    process.exitCode = 1;
    return;
  }
  const url = `http://127.0.0.1:${svc.port}`;
  const ok = await probe(url, svc.password ?? cfg.password);
  console.log(`service: ${ok ? "running" : "not reachable"} → ${url}`);
  console.log(`file: ${svc.file}${svc.password ? " (has password)" : " (no password)"}`);
  if (!ok) process.exitCode = 1;
}

function runServiceVerb(verb: "start" | "stop" | "restart"): void {
  try {
    execSync(`opencode service ${verb}`, { stdio: "inherit", timeout: 90_000 });
  } catch {
    fail(`"opencode service ${verb}" failed (is opencode installed and on PATH?)`);
  }
}

async function doctor(): Promise<void> {
  const out: Array<{ name: string; ok: boolean; detail: string }> = [];
  const cfg = loadConfig();
  const cli = loadCliConfig();
  const nodeMajor = Number(process.versions.node.split(".")[0] ?? "0");
  out.push({
    name: "node >= 18.17",
    ok: nodeMajor >= 18,
    detail: process.versions.node,
  });

  let opencodeVersion = "";
  try {
    opencodeVersion = execSync("opencode --version", { encoding: "utf8", timeout: 15_000 }).trim().split("\n")[0] ?? "";
  } catch {
    opencodeVersion = "";
  }
  out.push({
    name: "opencode CLI on PATH",
    ok: opencodeVersion.length > 0,
    detail: opencodeVersion || "not found — install opencode first",
  });

  const svc = readService();
  out.push({
    name: "service.json present",
    ok: svc !== null,
    detail: svc ? `${svc.file} (port ${svc.port})` : serviceFilePath(),
  });

  const url = svc ? `http://127.0.0.1:${svc.port}` : cfg.baseUrl;
  const reachable = await probe(url, svc?.password ?? cfg.password);
  out.push({
    name: "server reachable",
    ok: reachable,
    detail: url + (reachable ? "" : " — try: opencodemcp service start"),
  });

  const portsOk =
    Number.isInteger(cli.apiPort) && cli.apiPort >= 1 && cli.apiPort <= 65535 &&
    Number.isInteger(cli.webuiPort) && cli.webuiPort >= 1 && cli.webuiPort <= 65535;
  out.push({
    name: "ports configured",
    ok: portsOk,
    detail: `api=${cli.apiPort} webui=${cli.webuiPort} (${cliConfigPath()})`,
  });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const mcpJs = path.join(here, "index.js");
  const cliJs = path.join(here, "cli.js");
  const mcpOk = fs.existsSync(mcpJs);
  const cliOk = fs.existsSync(cliJs);
  out.push({
    name: "dist bundle present",
    ok: mcpOk && cliOk,
    detail: `index.js:${mcpOk ? "ok" : "missing"} cli.js:${cliOk ? "ok" : "missing"}`,
  });

  let scoresOk = true;
  let scoresDetail = cfg.scoresFile;
  try {
    const store = loadStore(cfg.scoresFile);
    aggregate(store.records);
    scoresDetail = `${cfg.scoresFile} (${store.records.length} records)`;
  } catch (err) {
    scoresOk = false;
    scoresDetail = `${cfg.scoresFile}: ${err instanceof Error ? err.message : String(err)}`;
  }
  out.push({ name: "scores store readable", ok: scoresOk, detail: scoresDetail });

  let failed = 0;
  for (const row of out) {
    console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.name} — ${row.detail}`);
    if (!row.ok) failed++;
  }
  const envHint = `env: OPENCODE_URL=${process.env.OPENCODE_URL ?? "(unset)"} OPENCODE_DIRECTORY=${cfg.directory} HOME=${os.homedir()}`;
  console.log(envHint);
  if (failed > 0) process.exitCode = 1;
}

/** Open the default browser at the given URL (cross-platform, best-effort). */
function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "win32") {
      // `start` is a cmd builtin; spawn it detached so it does not block.
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // best-effort — never block the server on a browser launch failure
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = (argv[0] ?? "").toLowerCase();
  const rest = argv.slice(1);

  if (argv.length === 0 || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(help());
    return;
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    console.log(`opencodemcp ${VERSION}`);
    return;
  }
  if (cmd === "doctor") {
    if (rest.includes("--json")) {
      const cfg = loadConfig();
      const cli = loadCliConfig();
      const svc = readService();
      console.log(JSON.stringify({ version: VERSION, config: cfg, ports: cli, service: svc }, null, 2));
      return;
    }
    await doctor();
    return;
  }
  if (cmd === "service") {
    const verb = (rest[0] ?? "").toLowerCase();
    const json = rest.includes("--json");
    if (verb === "start" || verb === "stop" || verb === "restart") {
      runServiceVerb(verb);
      return;
    }
    if (verb === "status") {
      if (json) await serviceStatusJson();
      else await serviceStatusText();
      return;
    }
    fail(`unknown service subcommand "${rest[0] ?? ""}" (expected start|stop|restart|status)`);
  }
  if (cmd === "api") {
    if ((rest[0] ?? "").toLowerCase() !== "port") fail(`unknown api subcommand (expected "opencodemcp api port --port=<n>")`);
    let port: number | undefined;
    try {
      port = parsePortFlag(rest.slice(1));
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    if (port === undefined) {
      console.log(`api port: ${loadCliConfig().apiPort}`);
      return;
    }
    const next = saveCliConfig({ apiPort: port });
    console.log(`api port set to ${next.apiPort} (stored in ${cliConfigPath()})`);
    console.log(`note: the MCP uses OPENCODE_URL when set, else the background service, else http://127.0.0.1:${next.apiPort}.`);
    return;
  }
  if (cmd === "webui") {
    const sub = (rest[0] ?? "").toLowerCase();
    if (sub === "port") {
      let port: number | undefined;
      try {
        port = parsePortFlag(rest.slice(1));
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
      if (port === undefined) {
        console.log(`webui port: ${loadCliConfig().webuiPort}`);
        return;
      }
      const next = saveCliConfig({ webuiPort: port });
      console.log(`webui port set to ${next.webuiPort} (stored in ${cliConfigPath()})`);
      return;
    }
    if (sub === "--help" || sub === "-h" || sub === "help") {
      console.log(`Usage: opencodemcp webui [--port <n>]\n       opencodemcp webui port [--port <n>]\n`);
      return;
    }
    let port: number | undefined;
    try {
      port = parsePortFlag(rest);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    const finalPort = port ?? loadCliConfig().webuiPort;
    if (!Number.isInteger(finalPort) || finalPort < 1 || finalPort > 65535) {
      fail(`invalid port "${finalPort}": expected 1-65535`);
    }
    try {
      const server = await startWebui(finalPort);
      const addr = server.address();
      const shown = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : `http://127.0.0.1:${finalPort}`;
      console.log(`opencodemcp webui listening on ${shown} (Ctrl+C to stop)`);
      openBrowser(shown);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }
  if (cmd === "update") {
    console.log("opencodemcp update: not implemented yet (placeholder).");
    return;
  }
  if (cmd === "remove") {
    console.log("opencodemcp remove: not implemented yet (placeholder).");
    return;
  }
  fail(`unknown command "${argv[0]}"`);
}

await main();
