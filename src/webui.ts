import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./config.js";
import { loadCliConfig, saveCliConfig } from "./cli-config.js";
import { readService, resolveEndpoint } from "./bootstrap.js";
import { OpenCode } from "./opencode.js";
import { loadStore, aggregate, aggregateModels, recordScore, splitModelRef } from "./scores.js";
import { PROVIDERS } from "./providers.js";
import { compactSession, renderTranscript, waitForIdle, countToolCalls, collectReply } from "./render.js";
import { openDb, insertLog, listLogs, clearLogs, getSetting, setSetting, upsertApiKey, listApiKeys, deleteApiKey, getApiKey } from "./db.js";
import { SKILL_MARKDOWN, SKILL_NAME, SKILL_VERSION, skillFile } from "./skill.js";

// ---------------------------------------------------------------------------
// Log ring (persisted to SQLite)
// ---------------------------------------------------------------------------

export type LogLevel = "info" | "warn" | "error";
export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
}

export function pushLog(level: LogLevel, message: string, source = "webui"): LogEntry {
  const entry: LogEntry = { ts: Date.now(), level, source, message: String(message).slice(0, 2000) };
  insertLog(level, source, entry.message);
  return entry;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// WebUI settings (SQLite-backed)
// ---------------------------------------------------------------------------

export type ThemeName =
  | "system"
  | "light"
  | "dark"
  | "dark-plus"
  | "dracula"
  | "nord"
  | "solarized-light"
  | "solarized-dark"
  | "github-light"
  | "github-dark"
  | "monokai"
  | "tokyo-night";
export const THEMES: { id: ThemeName; label: string }[] = [
  { id: "system", label: "system (auto)" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "dark-plus", label: "Dark+ (VS Code)" },
  { id: "dracula", label: "Dracula" },
  { id: "nord", label: "Nord" },
  { id: "solarized-light", label: "Solarized Light" },
  { id: "solarized-dark", label: "Solarized Dark" },
  { id: "github-light", label: "GitHub Light" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "monokai", label: "Monokai" },
  { id: "tokyo-night", label: "Tokyo Night" },
];

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export interface WebuiSettings {
  theme: ThemeName;
  density: "comfortable" | "compact";
  refreshMs: number;
  sessionsLimit: number;
  logsLevel: "all" | LogLevel;
}

const DEFAULT_SETTINGS: WebuiSettings = {
  theme: "system",
  density: "comfortable",
  refreshMs: 15000,
  sessionsLimit: 20,
  logsLevel: "all",
};

function loadSettings(): WebuiSettings {
  const s = allSettingsFromDb();
  return {
    theme: THEME_IDS.has(s.theme) ? (s.theme as ThemeName) : DEFAULT_SETTINGS.theme,
    density: ["comfortable", "compact"].includes(s.density) ? (s.density as "comfortable" | "compact") : DEFAULT_SETTINGS.density,
    refreshMs: Number.isInteger(Number(s.refreshMs)) && Number(s.refreshMs) >= 0 && Number(s.refreshMs) <= 300000
      ? Number(s.refreshMs)
      : DEFAULT_SETTINGS.refreshMs,
    sessionsLimit: Number.isInteger(Number(s.sessionsLimit)) && Number(s.sessionsLimit) >= 1 && Number(s.sessionsLimit) <= 200
      ? Number(s.sessionsLimit)
      : DEFAULT_SETTINGS.sessionsLimit,
    logsLevel: ["all", "info", "warn", "error"].includes(s.logsLevel) ? (s.logsLevel as "all" | LogLevel) : DEFAULT_SETTINGS.logsLevel,
  };
}

function allSettingsFromDb(): Record<string, string> {
  const db = openDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as unknown as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function saveSettings(patch: Partial<WebuiSettings>): WebuiSettings {
  const next = { ...loadSettings(), ...patch };
  if (!THEME_IDS.has(next.theme)) next.theme = DEFAULT_SETTINGS.theme;
  if (!["comfortable", "compact"].includes(next.density)) next.density = DEFAULT_SETTINGS.density;
  if (!Number.isInteger(next.refreshMs) || next.refreshMs < 0 || next.refreshMs > 300000) next.refreshMs = DEFAULT_SETTINGS.refreshMs;
  if (!Number.isInteger(next.sessionsLimit) || next.sessionsLimit < 1 || next.sessionsLimit > 200) next.sessionsLimit = DEFAULT_SETTINGS.sessionsLimit;
  if (!["all", "info", "warn", "error"].includes(next.logsLevel)) next.logsLevel = "all";
  setSetting("theme", next.theme);
  setSetting("density", next.density);
  setSetting("refreshMs", String(next.refreshMs));
  setSetting("sessionsLimit", String(next.sessionsLimit));
  setSetting("logsLevel", next.logsLevel);
  return next;
}

// ---------------------------------------------------------------------------
// Page (single-file SPA: Dashboard / Tasks / Providers / Skill / Stats / Logs / Playground / Settings)
// ---------------------------------------------------------------------------

const PAGE = `<!doctype html>
<html lang="en" data-theme="system"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>opencodemcp dashboard</title>
<style>
:root{--bg:#f8fafc;--panel:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#2563eb;--ok:#15803d;--warn:#b45309;--bad:#b91c1c;--chip:#f1f5f9;--radius:12px}
[data-theme="dark"]{--bg:#0b1220;--panel:#111c33;--ink:#e2e8f0;--muted:#94a3b8;--line:#243355;--accent:#60a5fa;--chip:#1a2742}
[data-theme="dark-plus"]{--bg:#1e1e1e;--panel:#252526;--ink:#d4d4d4;--muted:#9d9d9d;--line:#3e3e42;--accent:#007acc;--chip:#2d2d30}
[data-theme="dracula"]{--bg:#282a36;--panel:#343746;--ink:#f8f8f2;--muted:#9a9cb3;--line:#44475a;--accent:#bd93f9;--chip:#44475a}
[data-theme="nord"]{--bg:#2e3440;--panel:#3b4252;--ink:#eceff4;--muted:#9aa3b2;--line:#4c566a;--accent:#88c0d0;--chip:#434c5e}
[data-theme="solarized-light"]{--bg:#fdf6e3;--panel:#eee8d5;--ink:#586e75;--muted:#839496;--line:#d3c69f;--accent:#268bd2;--chip:#e7dfc8}
[data-theme="solarized-dark"]{--bg:#002b36;--panel:#073642;--ink:#eee8d5;--muted:#93a1a1;--line:#174652;--accent:#2aa198;--chip:#0e4a57}
[data-theme="github-light"]{--bg:#ffffff;--panel:#f6f8fa;--ink:#1f2328;--muted:#59636e;--line:#d1d9e0;--accent:#0969da;--chip:#eaeef2}
[data-theme="github-dark"]{--bg:#0d1117;--panel:#161b22;--ink:#e6edf3;--muted:#9198a1;--line:#30363d;--accent:#4493f8;--chip:#21262d}
[data-theme="monokai"]{--bg:#272822;--panel:#3e3d32;--ink:#f8f8f2;--muted:#bebda8;--line:#49483e;--accent:#a6e22e;--chip:#49483e}
[data-theme="tokyo-night"]{--bg:#1a1b26;--panel:#24283b;--ink:#c0caf5;--muted:#7f87a8;--line:#343b5c;--accent:#7aa2f7;--chip:#2b3049}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,"Segoe UI",Arial,sans-serif;background:var(--bg);color:var(--ink)}
.app{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
aside{background:var(--panel);border-right:1px solid var(--line);padding:18px 14px;display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100vh}
.brand{font-weight:800;font-size:17px;letter-spacing:.2px;margin:2px 6px 12px}
.brand small{display:block;font-weight:500;color:var(--muted);font-size:11px}
.nav button{display:flex;width:100%;text-align:left;gap:10px;align-items:center;padding:10px 12px;border:1px solid transparent;background:transparent;color:var(--ink);border-radius:10px;cursor:pointer;font-size:14px}
.nav button.active{background:var(--chip);border-color:var(--line);font-weight:700}
.nav button:hover{background:var(--chip)}
.back-btn{display:flex;width:100%;text-align:left;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:10px;cursor:pointer;font-size:14px;margin-bottom:8px}
.back-btn:hover{background:var(--chip)}
.side-foot{margin-top:auto;color:var(--muted);font-size:12px;padding:8px 6px}
main{padding:22px 26px;max-width:none;width:100%;min-width:0}
.topbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.topbar h2{margin:0;font-size:22px}
.dot{width:9px;height:9px;border-radius:50%;background:#999;display:inline-block}
.dot.ok{background:#22c55e}.dot.bad{background:#ef4444}
.spacer{flex:1}
input,select,textarea{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px}
button.btn{padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:13px}
button.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}
button.btn:hover{filter:brightness(.97)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px}
.card h4{margin:0 0 6px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.card .v{font-size:22px;font-weight:800}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:900px){.app{grid-template-columns:1fr}aside{position:static;height:auto;flex-direction:row;flex-wrap:wrap}.grid2{grid-template-columns:1fr}main{padding:14px}}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
tr:hover td{background:rgba(127,127,127,.06);cursor:pointer}
body[data-density="compact"] th,body[data-density="compact"] td{padding:4px 8px;font-size:12px}
code,pre{background:var(--chip);padding:2px 6px;border-radius:6px}
pre{padding:12px;overflow:auto;font-size:12px;max-height:420px}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--chip)}
.badge.hi{background:#dcfce7;color:#166534}[data-theme="dark"] .badge.hi{background:#14532d;color:#bbf7d0}
.badge.mid{background:#fef9c3;color:#854d0e}[data-theme="dark"] .badge.mid{background:#713f12;color:#fef9c3}
.badge.lo{background:#fee2e2;color:#991b1b}[data-theme="dark"] .badge.lo{background:#7f1d1d;color:#fecaca}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}
.page{display:none}.page.active{display:block}
.logrow{display:grid;grid-template-columns:170px 70px 150px 1fr;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line);font-size:12.5px;align-items:baseline}
.logrow .lv{font-weight:800}.lv.info{color:var(--accent)}.lv.warn{color:var(--warn)}.lv.error{color:var(--bad)}
.seg{display:flex;gap:6px;flex-wrap:wrap}
.seg button{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:12px}
.seg button.active{background:var(--ink);color:var(--bg);font-weight:700}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.tabs button{padding:7px 13px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:13px}
.tabs button.active{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700}
.form{display:grid;grid-template-columns:180px 1fr;gap:8px 12px;align-items:center;margin:10px 0}
.form label{color:var(--muted);font-size:13px}
.hint{color:var(--muted);font-size:12px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:20px}
.modal.open{display:flex}
.modal .box{background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:760px;width:100%;padding:18px;max-height:86vh;overflow:auto}
.kv{display:grid;grid-template-columns:170px 1fr;gap:6px 10px;font-size:13px;margin:8px 0}
.kv dt{color:var(--muted)}.kv dd{margin:0}
.prov-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px;display:flex;flex-direction:column;gap:8px}
.prov-card .logo-row{display:flex;align-items:center;gap:10px}
.prov-card .logo-row img{width:28px;height:28px}
.prov-card h4{margin:0;font-size:15px}
.prov-card .actions{display:flex;gap:6px;margin-top:4px}
.key-input{width:100%;font-family:monospace;font-size:12px}
</style></head><body data-density="comfortable">
<div class="app">
<aside>
<div class="brand">opencodemcp<small>orchestrator dashboard</small></div>
<button class="back-btn" id="backBtn" style="display:none">← Back</button>
<nav class="nav" id="nav">
<button data-page="dashboard" class="active">📊 Dashboard</button>
<button data-page="tasks">🗂 Tasks</button>
<button data-page="providers">🔌 Providers</button>
<button data-page="skill">📜 Skill</button>
<button data-page="stats">📈 Stats</button>
<button data-page="logs">🧾 Logs</button>
<button data-page="playground">🧪 Playground</button>
<button data-page="settings">⚙ Settings</button>
</nav>
<div class="side-foot" id="sidefoot">…</div>
</aside>
<main>
<div class="topbar">
<h2 id="title">Dashboard</h2>
<span class="dot" id="healthDot" title="server reachability"></span>
<span class="hint" id="healthTxt">checking…</span>
<span class="spacer"></span>
<button class="btn" id="themeBtn" title="toggle light/dark">◐ theme</button>
<button class="btn" id="refreshBtn">↻ Refresh</button>
</div>

<!-- DASHBOARD -->
<section class="page active" id="page-dashboard">
<div class="cards" id="statCards"></div>
<div class="grid2">
<div class="card"><h4>Recent sessions</h4><div id="dashSessions">loading…</div></div>
<div class="card"><h4>Agent ranking</h4><div id="dashScores">loading…</div></div>
</div>
<div class="card"><h4>Status</h4><pre id="statusPre">loading…</pre></div>
</section>

<!-- TASKS -->
<section class="page" id="page-tasks">
<div class="card">
<div class="toolbar">
<input id="taskSearch" placeholder="search task / session / agent…" style="flex:1;min-width:200px"/>
<select id="taskAgent"><option value="">all agents</option></select>
<select id="taskLimit"><option>25</option><option selected>50</option><option>100</option><option>200</option></select>
<button class="btn" id="taskReload">↻ Reload</button>
</div>
<div class="hint" id="taskCount"></div>
<div style="overflow:auto"><table><thead><tr>
<th>Orchester</th><th>Session</th><th>Task</th><th>Agent</th><th>Model</th><th>Score</th><th>Token usage</th><th>Duration</th><th>Assigned at</th>
</tr></thead><tbody id="taskRows"></tbody></table></div>
</div>
</section>

<!-- PROVIDERS -->
<section class="page" id="page-providers">
<div class="card">
<div class="toolbar">
<input id="provSearch" placeholder="search providers…" style="flex:1;min-width:200px"/>
<span class="hint" id="provCount"></span>
<button class="btn" id="provReload">↻ Reload</button>
</div>
<div class="cards" id="provGrid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))"></div>
<p class="hint">Color logos: <code>assets/providers/*.svg</code>. Endpoints verified 2026-09-30 against each provider's official docs — see <code>/api/providers</code>.</p>
</div>
</section>

<!-- SKILL -->
<section class="page" id="page-skill">
<div class="card">
<h3>Skill</h3>
<p class="hint">Copy or download the skill definition for your harness. This markdown file tells your orchestrator how to use the opencodemcp MCP tools.</p>
<div class="toolbar">
<button class="btn primary" id="skillCopy">📋 Copy to clipboard</button>
<button class="btn" id="skillDownload">⬇ Download SKILL.md</button>
<span class="hint" id="skillMsg"></span>
</div>
<pre id="skillContent" style="white-space:pre-wrap;max-height:60vh"></pre>
</div>
</section>

<!-- STATS -->
<section class="page" id="page-stats">
<div class="cards" id="statsCards"></div>
<div class="grid2">
<div class="card"><h4>Top models by score</h4><div id="statsModels">loading…</div></div>
<div class="card"><h4>Top agents by score</h4><div id="statsAgents">loading…</div></div>
</div>
<div class="card"><h4>Score distribution</h4><div id="statsDist">loading…</div></div>
</section>

<!-- LOGS -->
<section class="page" id="page-logs">
<div class="card">
<div class="toolbar">
<div class="seg" id="logSeg">
<button data-lv="all" class="active">all</button>
<button data-lv="info">info</button>
<button data-lv="warn">warning</button>
<button data-lv="error">errors</button>
</div>
<input id="logSearch" placeholder="filter message…" style="flex:1;min-width:160px"/>
<label class="hint"><input type="checkbox" id="logAuto" checked/> auto-refresh</label>
<button class="btn" id="logReload">↻</button>
<button class="btn" id="logClear">clear</button>
</div>
<div id="logList"></div>
</div>
</section>

<!-- PLAYGROUND -->
<section class="page" id="page-playground">
<div class="card">
<p class="hint">Test the MCP tools live against the OpenCode server. <b>assign_task</b> defaults to fire-and-forget (wait=false) so the UI never hangs; tick <i>wait</i> for a blocking run.</p>
<div class="tabs" id="pgTabs">
<button data-tool="assign_task" class="active">assign_task</button>
<button data-tool="models_list">models_list</button>
<button data-tool="score_to_agent">score_to_agent</button>
<button data-tool="fetch_session">fetch_session</button>
</div>
<div id="pgForm"></div>
<div class="toolbar"><button class="btn primary" id="pgRun">▶ Run</button><span class="hint" id="pgHint"></span></div>
<h4>Result</h4>
<pre id="pgOut">— run a tool to see output —</pre>
</div>
</section>

<!-- SETTINGS -->
<section class="page" id="page-settings">
<div class="tabs" id="setTabs">
<button data-tab="appearance" class="active">Appearance</button>
<button data-tab="behaviour">Behaviour</button>
<button data-tab="app">App</button>
</div>
<div id="setTabAppearance">
<div class="card"><h3>Appearance</h3>
<div class="form">
<label>Theme</label>
<select id="setTheme"><option value="system">system (auto)</option><option value="light">Light</option><option value="dark">Dark</option><option value="dark-plus">Dark+ (VS Code)</option><option value="dracula">Dracula</option><option value="nord">Nord</option><option value="solarized-light">Solarized Light</option><option value="solarized-dark">Solarized Dark</option><option value="github-light">GitHub Light</option><option value="github-dark">GitHub Dark</option><option value="monokai">Monokai</option><option value="tokyo-night">Tokyo Night</option></select>
<label>Density</label>
<select id="setDensity"><option value="comfortable">comfortable</option><option value="compact">compact</option></select>
<label>Log level (default filter)</label>
<select id="setLogsLevel"><option value="all">all</option><option value="info">info</option><option value="warn">warning</option><option value="error">errors</option></select>
</div></div>
</div>
<div id="setTabBehaviour">
<div class="card"><h3>Behaviour</h3>
<div class="form">
<label>Auto-refresh (ms, 0=off)</label><input id="setRefresh" type="number" min="0" max="300000" step="1000"/>
<label>Default sessions limit</label><input id="setLimit" type="number" min="1" max="200"/>
</div></div>
</div>
<div id="setTabApp">
<div class="card"><h3>App</h3>
<div class="form">
<label>API port</label><input id="setApiPort" type="number" min="1" max="65535"/>
<label>WebUI port</label><input id="setWebuiPort" type="number" min="1" max="65535"/>
<label>Base URL</label><input id="setBaseUrl" disabled/>
<label>Directory</label><input id="setDir" disabled/>
<label>Database</label><input id="setDb" disabled/>
</div>
<div class="toolbar"><button class="btn primary" id="setSave">💾 Save settings</button><span class="hint" id="setMsg"></span></div>
</div>
</div>
</section>

</main></div>
<div class="modal" id="modal"><div class="box"><div class="toolbar"><b id="mTitle">detail</b><span class="spacer"></span><button class="btn" id="mClose">✕</button></div><div id="mBody"></div></div></div>
<script>
const $=id=>document.getElementById(id);
const state={page:'dashboard',settings:null,tasks:[],logLevel:'all',pgTool:'assign_task',setTab:'appearance',timer:null,provKeys:{}};
async function j(u,o){const r=await fetch(u,o);const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t,http:r.status}}}
function pad(n){return String(n).padStart(2,'0')}
function fmtDT(ts){if(ts==null||ts==='')return '—';const d=new Date(Number(ts));if(isNaN(d.getTime()))return '—';return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds())}
function fmtT(ts){return fmtDT(ts)}
function fmtDur(ms){if(ms==null||ms===''||!isFinite(Number(ms)))return '—';ms=Math.max(0,Math.round(Number(ms)));const s=Math.floor(ms/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m '+pad(s%60)+'s';const h=Math.floor(m/60);return h+'h '+pad(m%60)+'m '+pad(s%60)+'s'}
function tokStr(t){if(t==null||t==='')return '—';if(typeof t==='number')return t.toLocaleString();if(typeof t==='object'){const tot=(t.input||0)+(t.output||0)+(t.reasoning||0);return tot? tot.toLocaleString() + ' <span class="hint">('+ (t.input||0)+'/'+(t.output||0)+'/'+(t.reasoning||0)+')</span>':'—'}return String(t)}
function scoreBadge(s){if(s==null)return '—';const c=s>=90?'hi':s>=70?'hi':s>=40?'mid':'lo';return '<span class="badge '+c+'">'+s+'</span>'}
function applyTheme(){const th=state.settings?.theme||'system';const known=['light','dark','dark-plus','dracula','nord','solarized-light','solarized-dark','github-light','github-dark','monokai','tokyo-night'];let eff=th;if(th==='system'){eff=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(!known.includes(eff))eff='light';document.documentElement.dataset.theme=eff;document.body.dataset.density=state.settings?.density||'comfortable';$('themeBtn').textContent='◐ '+eff}
function clientLog(level,msg){fetch('/api/logs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({level,message:String(msg).slice(0,500)})}).catch(()=>{})}
// nav
$('nav').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.page=b.dataset.page;document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+state.page));$('title').textContent=b.textContent.trim().replace(/^[\p{Emoji}\s]+/u,'');$('backBtn').style.display='none';load()});
$('backBtn').addEventListener('click',()=>{state.page='dashboard';document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.page==='dashboard'));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-dashboard'));$('title').textContent='Dashboard';$('backBtn').style.display='none';load()});
// dashboard
async function loadDashboard(){const lim=state.settings?.sessionsLimit||20;
try{
const [st,se,sc]=await Promise.all([j('/api/status'),j('/api/sessions?limit='+lim),j('/api/scores')]);
$('statusPre').textContent=JSON.stringify(st,null,2);
const ok=!!st.ok;$('healthDot').className='dot '+(ok?'ok':'bad');$('healthTxt').textContent=(st.baseUrl||'')+(ok?' • reachable':' • unreachable');
$('sidefoot').textContent='api '+(st.ports?.api??'?')+' • webui '+(st.ports?.webui??'?');
const sess=se.sessions||[];const rank=sc.ranking||[];
const running=sess.filter(s=>s.running).length;
let tokens=0;try{tokens=sess.reduce((a,s)=>a+((s.tokens?.input||0)+(s.tokens?.output||0)+(s.tokens?.reasoning||0)),0)}catch{}
const best=rank[0];const avg=rank.length?(rank.reduce((a,r)=>a+r.average,0)/rank.length).toFixed(1):'—';
$('statCards').innerHTML=['Sessions|'+sess.length,'Running|'+running,'Scores|'+(sc.count??rank.reduce((a,r)=>a+r.count,0)),'Best agent|'+(best?best.agent:'—'),'Avg score|'+avg,'Tokens (recent)|'+Number(tokens).toLocaleString()].map(x=>{const[a,b]=x.split('|');return '<div class="card"><h4>'+a+'</h4><div class="v">'+b+'</div></div>'}).join('');
$('dashSessions').innerHTML=sess.length?'<table><tr><th>session</th><th>agent</th><th>model</th><th>state</th></tr>'+sess.slice(0,8).map(s=>'<tr><td><code>'+String(s.id||'').slice(0,14)+'…</code></td><td>'+(s.agent||'—')+'</td><td>'+(s.model||'—')+'</td><td>'+(s.running?'▶ running':(s.outcome||'—'))+'</td></tr>').join('')+'</table>':'<span class="hint">no sessions</span>';
$('dashScores').innerHTML=rank.length?'<table><tr><th>agent</th><th>n</th><th>avg</th><th>last</th></tr>'+rank.slice(0,8).map(r=>'<tr><td>'+r.agent+'</td><td>'+r.count+'</td><td>'+r.average+'</td><td>'+r.last+'</td></tr>').join('')+'</table>':'<span class="hint">no scores yet — use Playground → score_to_agent</span>';
}catch(e){$('statusPre').textContent='error: '+e;clientLog('error','dashboard load: '+e)}
}
// tasks
async function loadTasks(){const q=$('taskSearch').value.trim().toLowerCase();const ag=$('taskAgent').value;const lim=$('taskLimit').value;
try{const d=await j('/api/tasks?limit='+lim);state.tasks=d.tasks||[];
const agents=[...new Set(state.tasks.map(t=>t.orchester||t.agent).filter(Boolean))];const cur=$('taskAgent').value;
$('taskAgent').innerHTML='<option value="">all agents</option>'+agents.map(a=>'<option'+(a===cur?' selected':'')+'>'+a+'</option>').join('');if(ag)$('taskAgent').value=ag;
let rows=state.tasks.filter(t=>{const orch=t.orchester||t.agent;if(ag&&orch!==ag)return false;if(q&&!((t.task||'')+' '+(t.sessionID||'')+' '+(orch||'')+' '+((t.provider||'')+' '+(t.model||'')+' '+(t.modelID||''))).toLowerCase().includes(q))return false;return true});
$('taskCount').textContent=rows.length+' of '+state.tasks.length+' shown';
$('taskRows').innerHTML=rows.map((t,i)=>{const orch=t.orchester||t.agent||'—';const agt=t.provider||'—';const mdl=t.modelID||t.model||'—';return '<tr data-i="'+state.tasks.indexOf(t)+'"><td><b>'+orch+'</b></td><td><code>'+String(t.sessionID||'—').slice(0,16)+'</code></td><td>'+(t.task?String(t.task).slice(0,90):'<span class="hint">—</span>')+'</td><td>'+agt+'</td><td>'+mdl+'</td><td>'+scoreBadge(t.score)+'</td><td>'+tokStr(t.tokens)+'</td><td class="hint">'+fmtDur(t.durationMs)+'</td><td class="hint">'+fmtDT(t.assignedAt)+'</td></tr>'}).join('')||'<tr><td colspan="9" class="hint">no tasks yet</td></tr>';
}catch(e){$('taskRows').innerHTML='<tr><td colspan="9">error: '+e+'</td></tr>';clientLog('error','tasks load: '+e)}
}
$('taskRows').addEventListener('click',e=>{const tr=e.target.closest('tr');if(!tr||tr.dataset.i===undefined||tr.dataset.i==='')return;const t=state.tasks[+tr.dataset.i];if(!t||!t.sessionID)return;
const u='/task?sessionID='+encodeURIComponent(t.sessionID)+(t.assignedAt!=null?'&ts='+encodeURIComponent(t.assignedAt):'');window.open(u,'_blank')});
$('mClose').onclick=()=>$('modal').classList.remove('open');$('modal').addEventListener('click',e=>{if(e.target.id==='modal')$('modal').classList.remove('open')});
// providers
async function loadProviders(){const q=($('provSearch').value||'').trim().toLowerCase();
try{const d=await j('/api/providers');let rows=d.providers||[];
if(q)rows=rows.filter(p=>((p.id||'')+' '+(p.label||'')+' '+(p.baseUrl||'')).toLowerCase().includes(q));
$('provCount').textContent=rows.length+' of '+(d.count??rows.length)+' providers';
$('provGrid').innerHTML=rows.map(p=>{
const key=state.provKeys[p.id];
const keyStatus=key?'<span class="badge hi">key saved</span>':'<span class="hint">no key</span>';
return '<div class="prov-card"><div class="logo-row"><img src="/assets/providers/'+p.id+'.svg" alt="" width="28" height="28"/><h4>'+p.label+'</h4></div><div class="v" style="font-size:13px"><code>'+p.id+'</code></div><p class="hint">'+p.baseUrl+'</p><p style="font-size:12px">'+p.note+'</p><p class="hint">key: <code>'+(p.envKey||'none')+'</code> '+keyStatus+'</p><div class="actions"><button class="btn" data-prov="'+p.id+'" data-action="import">Import key</button>'+(key?'<button class="btn" data-prov="'+p.id+'" data-action="delete">Delete</button>':'')+'</div></div>';
}).join('')||'<p class="hint">no providers match</p>';
// bind import/delete buttons
document.querySelectorAll('#provGrid [data-action]').forEach(btn=>{btn.addEventListener('click',()=>{const prov=btn.dataset.prov;const action=btn.dataset.action;if(action==='import')openKeyModal(prov);if(action==='delete')deleteKey(prov);});});
}catch(e){$('provGrid').innerHTML='error: '+e;clientLog('error','providers load: '+e)}
}
function openKeyModal(proId){const p=PROVIDERS.find(x=>x.id===proId);if(!p)return;
$('mTitle').textContent='Import API key — '+p.label;
$('mBody').innerHTML='<p class="hint">Enter the API key for <b>'+esc(p.label)+'</b>. It is stored locally in the SQLite database and used as <code>'+esc(p.envKey||'custom')+'</code>.</p><input type="password" id="keyInput" class="key-input" placeholder="sk-..." style="width:100%;margin:10px 0"/><div class="toolbar"><button class="btn primary" id="keySave">Save key</button><button class="btn" id="keyCancel">Cancel</button><span class="hint" id="keyMsg"></span></div>';
$('modal').classList.add('open');
$('keyCancel').onclick=()=>$('modal').classList.remove('open');
$('keySave').onclick=async()=>{const val=$('keyInput').value.trim();if(!val){$('keyMsg').textContent='key is required';return}try{const r=await fetch('/api/apikeys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:provId,label:p.label,envKey:p.envKey||'custom',key:val})});const d=await r.json();if(d.error){$('keyMsg').textContent='error: '+d.error}else{$('modal').classList.remove('open');loadProviders();clientLog('info','API key saved for '+provId)}}catch(e){$('keyMsg').textContent='error: '+e}};
}
async function deleteKey(provId){if(!confirm('Delete saved key for '+provId+'?'))return;try{await fetch('/api/apikeys/'+encodeURIComponent(provId),{method:'DELETE'});loadProviders();clientLog('info','API key deleted for '+provId)}catch(e){clientLog('error','delete key: '+e)}}
// skill
function loadSkill(){$('skillContent').textContent=SKILL_MARKDOWN}
$('skillCopy').onclick=async()=>{try{await navigator.clipboard.writeText(SKILL_MARKDOWN);$('skillMsg').textContent='copied ✓'}catch(e){$('skillMsg').textContent='copy failed: '+e}};
$('skillDownload').onclick=()=>{const blob=new Blob([SKILL_MARKDOWN],{type:'text/markdown'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='SKILL.md';a.click();URL.revokeObjectURL(url);$('skillMsg').textContent='downloaded ✓'};
// stats
async function loadStats(){try{const [sc,tk]=await Promise.all([j('/api/scores'),j('/api/tasks?limit=500')]);
const rank=sc.ranking||[];const tasks=tk.tasks||[];const models=tk.models||[];
const totalTasks=tasks.length;const totalTokens=tasks.reduce((a,t)=>a+((t.tokens?.input||0)+(t.tokens?.output||0)+(t.tokens?.reasoning||0)),0);
const totalCost=tasks.reduce((a,t)=>a+(t.cost||0),0);
const avgScore=rank.length?(rank.reduce((a,r)=>a+r.average,0)/rank.length).toFixed(1):'—';
const best=rank[0];
$('statsCards').innerHTML=['Total tasks|'+totalTasks,'Total scores|'+(sc.count??rank.reduce((a,r)=>a+r.count,0)),'Avg score|'+avgScore,'Best agent|'+(best?best.agent:'—'),'Total tokens|'+Number(totalTokens).toLocaleString(),'Total cost|$'+totalCost.toFixed(4)].map(x=>{const[a,b]=x.split('|');return '<div class="card"><h4>'+a+'</h4><div class="v">'+b+'</div></div>'}).join('');
$('statsModels').innerHTML=models.length?'<table><tr><th>model</th><th>n</th><th>avg</th><th>avg time</th></tr>'+models.slice(0,10).map(m=>'<tr><td><code>'+m.model+'</code></td><td>'+m.count+'</td><td>'+m.averageScore+'</td><td class="hint">'+fmtDur(m.avgDurationMs)+'</td></tr>').join('')+'</table>':'<span class="hint">no model data</span>';
$('statsAgents').innerHTML=rank.length?'<table><tr><th>agent</th><th>n</th><th>avg</th><th>min</th><th>max</th></tr>'+rank.slice(0,10).map(r=>'<tr><td>'+r.agent+'</td><td>'+r.count+'</td><td>'+r.average+'</td><td>'+r.min+'</td><td>'+r.max+'</td></tr>').join('')+'</table>':'<span class="hint">no agent data</span>';
// distribution
const bands=[{label:'90-100',min:90,max:101},{label:'70-89',min:70,max:90},{label:'40-69',min:40,max:70},{label:'0-39',min:0,max:40}];
const dist=bands.map(b=>{const count=tasks.filter(t=>t.score>=b.min&&t.score<b.max).length;return{label:b.label,count}});
const maxCount=Math.max(...dist.map(d=>d.count),1);
$('statsDist').innerHTML='<div style="display:flex;flex-direction:column;gap:6px">'+dist.map(d=>'<div style="display:flex;align-items:center;gap:8px"><span class="hint" style="width:60px">'+d.label+'</span><div style="flex:1;background:var(--chip);border-radius:4px;height:20px;overflow:hidden"><div style="width:'+Math.round(d.count/maxCount*100)+'%;height:100%;background:var(--accent);border-radius:4px"></div></div><span style="font-size:12px;font-weight:700">'+d.count+'</span></div>').join('')+'</div>';
}catch(e){$('statsCards').innerHTML='<div class="card"><h4>Error</h4><div class="v">'+e+'</div></div>';clientLog('error','stats load: '+e)}
}
// logs
async function loadLogs(){const lv=state.logLevel;const q=$('logSearch').value.trim();
try{const d=await j('/api/logs?level='+lv+'&limit=200'+(q?'&q='+encodeURIComponent(q):''));const rows=d.logs||[];
$('logList').innerHTML=rows.slice().reverse().map(l=>'<div class="logrow"><span class="hint">'+fmtDT(l.ts)+'</span><span class="lv '+l.level+'">'+l.level+'</span><span class="hint">'+l.source+'</span><span>'+String(l.message).replace(/</g,'&lt;')+'</span></div>').join('')||'<p class="hint">no logs</p>';
}catch(e){$('logList').innerHTML='error: '+e}
}
$('logSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.logLevel=b.dataset.lv;document.querySelectorAll('#logSeg button').forEach(x=>x.classList.toggle('active',x===b));loadLogs()});
// playground
const PG_FIELDS={assign_task:[['task','textarea','Add pagination to src/api/users.ts…'],['sessionID','text','ses_… (optional)'],['title','text','pagination'],['orchester','text','build'],['provider','text','opencode-go'],['model','text','gpt-6-luna (or provider/model)'],['variant','text','high'],['directory','text',''],['delivery','select:steer|queue','steer'],['wait','select:false|true','false'],['timeoutMs','number','180000']],models_list:[['provider','text',''],['search','text','luna'],['enabledOnly','select:false|true','false'],['detail','select:brief|full','brief'],['limit','number','20']],score_to_agent:[['orchester','text','build'],['score','number','92'],['sessionID','text','ses_…'],['provider','text','opencode-go'],['model','text','gpt-6-luna (or provider/model)'],['durationMs','number','45000'],['task','text','pagination'],['feedback','text','clean diff, tests added']],fetch_session:[['sessionID','text','(omit to list)'],['limit','number','20'],['order','select:asc|desc','asc'],['includeMessages','select:true|false','true'],['runningOnly','select:false|true','false']]};
function renderPgForm(){const fs=PG_FIELDS[state.pgTool];$('pgForm').innerHTML='<div class="form">'+fs.map(f=>{const[k,t,d]=f;let inp;if(t==='textarea')inp='<textarea id="pg_'+k+'" rows="3" placeholder="'+d+'"></textarea>';else if(t.startsWith('select:')){const opts=t.slice(7).split('|');inp='<select id="pg_'+k+'">'+opts.map(o=>'<option'+(o===d?' selected':'')+'>'+o+'</option>').join('')+'</select>'}else inp='<input id="pg_'+k+'" type="'+t+'" placeholder="'+d+'"/>';return '<label>'+k+'</label>'+inp}).join('')+'</div>'}
$('pgTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.pgTool=b.dataset.tool;document.querySelectorAll('#pgTabs button').forEach(x=>x.classList.toggle('active',x===b));renderPgForm();$('pgOut').textContent='— run a tool to see output —'});
async function pgRun(){const fs=PG_FIELDS[state.pgTool];const body={};for(const[k,t]of fs){const el=$('pg_'+k);let v=el?el.value:'';if(v==='')continue;if(t==='number')v=Number(v);if(v==='true')v=true;if(v==='false')v=false;body[k]=v}
$('pgHint').textContent='running…';$('pgOut').textContent='running '+state.pgTool+'…';
try{const d=await j('/api/playground/'+state.pgTool,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('pgOut').textContent=JSON.stringify(d,null,2).slice(0,20000);$('pgHint').textContent='done';clientLog(d&&d.error?'error':'info','playground '+state.pgTool+': '+(d.error||'ok'));if(state.pgTool==='score_to_agent'&&!d.error)loadTasks()}catch(e){$('pgOut').textContent='error: '+e;$('pgHint').textContent='failed';clientLog('error','playground '+state.pgTool+': '+e)}}
$('pgRun').onclick=pgRun;
// settings tabs
$('setTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.setTab=b.dataset.tab;document.querySelectorAll('#setTabs button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('#setTabAppearance,#setTabBehaviour,#setTabApp').forEach(el=>el.style.display='none');$('setTab'+state.setTab.charAt(0).toUpperCase()+state.setTab.slice(1)).style.display='block'});
// settings
async function loadSettingsUI(){try{const [s,st]=await Promise.all([j('/api/settings'),j('/api/status')]);state.settings=s.settings||s;$('setTheme').value=state.settings.theme;$('setDensity').value=state.settings.density;$('setLogsLevel').value=state.settings.logsLevel||'all';$('setRefresh').value=state.settings.refreshMs;$('setLimit').value=state.settings.sessionsLimit;$('setApiPort').value=(s.ports||st.ports||{}).api??st.ports?.api??'';$('setWebuiPort').value=(s.ports||st.ports||{}).webui??st.ports?.webui??'';$('setBaseUrl').value=st.baseUrl||'';$('setDir').value=st.directory||'';$('setDb').value=st.dbPath||'';state.logLevel=state.settings.logsLevel||'all';applyTheme();armTimer()}catch(e){$('setMsg').textContent='load failed: '+e}}
$('setSave').onclick=async()=>{const body={theme:$('setTheme').value,density:$('setDensity').value,logsLevel:$('setLogsLevel').value,refreshMs:Number($('setRefresh').value),sessionsLimit:Number($('setLimit').value),apiPort:Number($('setApiPort').value)||undefined,webuiPort:Number($('setWebuiPort').value)||undefined};$('setMsg').textContent='saving…';try{const d=await j('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(d.error){$('setMsg').textContent='error: '+d.error}else{state.settings=d.settings;$('setMsg').textContent='saved ✓';applyTheme();armTimer();clientLog('info','settings saved')}}catch(e){$('setMsg').textContent='error: '+e}};
$('themeBtn').onclick=()=>{const order=['light','dark','dark-plus','dracula','nord','solarized-light','solarized-dark','github-light','github-dark','monokai','tokyo-night'];const cur=document.documentElement.dataset.theme||'light';const next=order[(order.indexOf(cur)+1)%order.length];state.settings.theme=next;applyTheme();fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:next})}).catch(()=>{});try{localStorage.setItem('ocmcp-theme',next)}catch{}};
function armTimer(){if(state.timer)clearInterval(state.timer);const ms=state.settings?.refreshMs||0;if(ms>0)state.timer=setInterval(()=>{if(state.page==='dashboard')loadDashboard();if(state.page==='logs'&&$('logAuto').checked)loadLogs()},ms)}
async function boot(){try{const s=await j('/api/settings');state.settings=s.settings||s;try{const lt=localStorage.getItem('ocmcp-theme');if(lt&&!s.settings)state.settings.theme=lt}catch{}}catch{state.settings={theme:'system',density:'comfortable',refreshMs:15000,sessionsLimit:20,logsLevel:'all'}}applyTheme();renderPgForm();load();loadSettingsUI();armTimer()}
async function load(){if(state.page==='dashboard')loadDashboard();if(state.page==='tasks')loadTasks();if(state.page==='providers')loadProviders();if(state.page==='skill')loadSkill();if(state.page==='stats')loadStats();if(state.page==='logs')loadLogs();if(state.page==='settings')loadSettingsUI()}
$('refreshBtn').onclick=load;$('taskReload').onclick=loadTasks;$('provReload').onclick=loadProviders;$('logReload').onclick=loadLogs;
$('taskSearch').addEventListener('input',loadTasks);$('provSearch').addEventListener('input',loadProviders);$('logSearch').addEventListener('input',loadLogs);$('taskLimit').addEventListener('change',loadTasks);
$('logClear').onclick=async()=>{await j('/api/logs/clear',{method:'POST'});loadLogs()};
boot();
</script></body></html>`;

const TASK_PAGE = `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>task detail • opencodemcp</title>
<style>
:root{--bg:#f8fafc;--panel:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#2563eb;--chip:#f1f5f9;--radius:12px}
[data-theme="dark"]{--bg:#0b1220;--panel:#111c33;--ink:#e2e8f0;--muted:#94a3b8;--line:#243355;--accent:#60a5fa;--chip:#1a2742}
[data-theme="dark-plus"]{--bg:#1e1e1e;--panel:#252526;--ink:#d4d4d4;--muted:#9d9d9d;--line:#3e3e42;--accent:#007acc;--chip:#2d2d30}
[data-theme="dracula"]{--bg:#282a36;--panel:#343746;--ink:#f8f8f2;--muted:#9a9cb3;--line:#44475a;--accent:#bd93f9;--chip:#44475a}
[data-theme="nord"]{--bg:#2e3440;--panel:#3b4252;--ink:#eceff4;--muted:#9aa3b2;--line:#4c566a;--accent:#88c0d0;--chip:#434c5e}
[data-theme="solarized-light"]{--bg:#fdf6e3;--panel:#eee8d5;--ink:#586e75;--muted:#839496;--line:#d3c69f;--accent:#268bd2;--chip:#e7dfc8}
[data-theme="solarized-dark"]{--bg:#002b36;--panel:#073642;--ink:#eee8d5;--muted:#93a1a1;--line:#174652;--accent:#2aa198;--chip:#0e4a57}
[data-theme="github-light"]{--bg:#ffffff;--panel:#f6f8fa;--ink:#1f2328;--muted:#59636e;--line:#d1d9e0;--accent:#0969da;--chip:#eaeef2}
[data-theme="github-dark"]{--bg:#0d1117;--panel:#161b22;--ink:#e6edf3;--muted:#9198a1;--line:#30363d;--accent:#4493f8;--chip:#21262d}
[data-theme="monokai"]{--bg:#272822;--panel:#3e3d32;--ink:#f8f8f2;--muted:#bebda8;--line:#49483e;--accent:#a6e22e;--chip:#49483e}
[data-theme="tokyo-night"]{--bg:#1a1b26;--panel:#24283b;--ink:#c0caf5;--muted:#7f87a8;--line:#343b5c;--accent:#7aa2f7;--chip:#2b3049}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,"Segoe UI",Arial,sans-serif;background:var(--bg);color:var(--ink)}
main{padding:22px 26px;max-width:none;width:100%;min-width:0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
.hint{color:var(--muted);font-size:12px}
pre{background:var(--chip);padding:12px;border-radius:8px;overflow:auto;font-size:12.5px;white-space:pre-wrap}
code{background:var(--chip);padding:2px 6px;border-radius:6px}
.topbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.back-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:13px;text-decoration:none}
.back-btn:hover{background:var(--chip)}
</style></head><body>
<main>
<div class="topbar"><a class="back-btn" href="/">← Back</a><h2 id="title">Task</h2><span class="hint" id="sub">loading…</span></div>
<div class="card"><h3>Request from orchester</h3><div id="req">loading…</div></div>
<div class="card"><h3>Response from MCP</h3><div id="res">loading…</div></div>
</main>
<script>
const pad=n=>String(n).padStart(2,'0');
function fmtDT(ts){if(ts==null||ts==='')return '—';const d=new Date(Number(ts));if(isNaN(d.getTime()))return '—';return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds())}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
async function boot(){const q=new URLSearchParams(location.search);const sid=q.get('sessionID')||'';const ts=q.get('ts');if(!sid){document.getElementById('sub').textContent='missing sessionID';return}
try{const s=await fetch('/api/settings').then(r=>r.json());const th=(s.settings||{}).theme||'system';const known=['light','dark','dark-plus','dracula','nord','solarized-light','solarized-dark','github-light','github-dark','monokai','tokyo-night'];document.documentElement.dataset.theme=th==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):(known.includes(th)?th:'light')}catch{}
try{const u='/api/task?sessionID='+encodeURIComponent(sid)+(ts?'&ts='+encodeURIComponent(ts):'');const d=await fetch(u).then(r=>r.json());if(d.error){document.getElementById('sub').textContent='error: '+d.error;return}
document.getElementById('title').textContent='Task • '+(d.request?.orchester||'?');document.getElementById('sub').textContent=(sid||'')+' • '+fmtDT(d.request?.assignedAt);
document.getElementById('req').innerHTML='<pre>'+esc(d.request?.task||'(empty)')+'</pre><p class="hint">orchester <b>'+esc(d.request?.orchester||'—')+'</b> • agent(provider) <b>'+esc(d.request?.provider||'—')+'</b> • model <b>'+esc(d.request?.model||'—')+'</b> • assigned <b>'+esc(fmtDT(d.request?.assignedAt))+'</b> • session <code>'+esc(sid)+'</code></p>';
const r=d.response||{};const toks=r.tokens||{};const tot=((toks.input||0)+(toks.output||0)+(toks.reasoning||0));
document.getElementById('res').innerHTML='<pre>'+esc(r.reply||'(no reply yet)')+'</pre><p class="hint">outcome <b>'+esc(r.outcome||'—')+'</b> • tool calls <b>'+esc(r.toolCalls??'—')+'</b> • tokens <b>'+tot.toLocaleString()+'</b> • cost <b>'+esc(r.cost??'—')+'</b></p>';
}catch(e){document.getElementById('sub').textContent='error: '+e}}
boot();
</script></body></html>`;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function json(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!buf) return resolve({});
      try {
        resolve(JSON.parse(buf));
      } catch {
        resolve({ _raw: buf });
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function resolvedClient(): Promise<OpenCode> {
  const cfg = loadConfig();
  const endpoint = await resolveEndpoint(cfg);
  cfg.baseUrl = endpoint.baseUrl;
  cfg.password = endpoint.password;
  return new OpenCode(cfg);
}

async function statusPayload(): Promise<Record<string, unknown>> {
  const cfg = loadConfig();
  const cli = loadCliConfig();
  const svc = readService();
  const endpoint = await resolveEndpoint(cfg);
  cfg.baseUrl = endpoint.baseUrl;
  cfg.password = endpoint.password;
  const oc = new OpenCode(cfg);
  let info: unknown = null;
  let reachable = false;
  let infoError: string | null = null;
  try {
    info = await oc.info();
    reachable = true;
  } catch (err) {
    infoError = err instanceof Error ? err.message.split("\n")[0]! : String(err);
  }
  return {
    ok: reachable,
    baseUrl: cfg.baseUrl,
    source: endpoint.source,
    notes: endpoint.notes,
    serviceFile: svc?.file ?? null,
    servicePort: svc?.port ?? null,
    hasPassword: Boolean(cfg.password),
    ports: { api: cli.apiPort, webui: cli.webuiPort },
    directory: cfg.directory,
    scoresFile: cfg.scoresFile,
    dbPath: process.env.OPENCODE_MCP_DB ?? path.join(os.homedir(), ".opencode-mcp", "opencode-mcp.db"),
    info,
    ...(infoError ? { error: infoError } : {}),
  };
}

/** Tasks grid: score records enriched with session token usage + duration. */
async function tasksPayload(limit: number): Promise<Record<string, unknown>> {
  const cfg = loadConfig();
  const store = loadStore(cfg.scoresFile);
  const records = store.records.slice(-Math.max(1, limit)).reverse();
  // Best-effort token + duration enrichment from recent sessions.
  const tokenBySession = new Map<string, unknown>();
  const durationBySession = new Map<string, number>();
  try {
    const oc = await resolvedClient();
    const list = await oc.listSessions({ limit: 200, order: "desc" });
    for (const s of list.data ?? []) {
      const t = s?.tokens ?? {};
      const total = (t.input ?? 0) + (t.output ?? 0) + (t.reasoning ?? 0);
      tokenBySession.set(s.id, { input: t.input ?? 0, output: t.output ?? 0, reasoning: t.reasoning ?? 0, total });
      const created = s?.time?.created;
      const updated = s?.time?.updated ?? s?.time?.idle;
      if (typeof created === "number" && typeof updated === "number" && updated >= created) {
        durationBySession.set(s.id, updated - created);
      }
    }
  } catch (err) {
    pushLog("warn", `token enrichment failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`, "tasks");
  }
  const tasks = records.map((r) => {
    const orchester = r.orchester ?? r.agent;
    const split = splitModelRef(r.model);
    const provider = r.provider ?? split.provider;
    const modelID = split.modelID ?? r.model;
    return {
      agent: orchester,
      orchester,
      sessionID: r.sessionID ?? null,
      task: r.task ?? null,
      score: r.score,
      provider: provider ?? null,
      model: r.model ?? null,
      modelID: modelID ?? null,
      feedback: r.feedback ?? null,
      assignedAt: r.ts,
      durationMs: typeof r.durationMs === "number" ? r.durationMs : (durationBySession.get(r.sessionID ?? "") ?? null),
      tokens: tokenBySession.get(r.sessionID ?? "") ?? null,
    };
  });
  return { count: tasks.length, tasks, ranking: aggregate(store.records), models: aggregateModels(store.records) };
}

/** Single task detail: request from the orchester + response from MCP. */
async function taskDetailPayload(sessionID: string, ts?: number): Promise<Record<string, unknown>> {
  const cfg = loadConfig();
  const store = loadStore(cfg.scoresFile);
  const candidates = store.records.filter((r) => (r.sessionID ?? "") === sessionID);
  const record =
    (ts !== undefined ? candidates.find((r) => r.ts === ts) : undefined) ??
    candidates[candidates.length - 1] ??
    null;
  const oc = await resolvedClient();
  const session = await oc.session(sessionID);
  const messages = (await oc.messages(sessionID, { order: "asc", limit: 200 })).data ?? [];
  const since = record?.ts ?? 0;
  const transcript = renderTranscript(messages, { maxMessages: 200 });
  const reply = collectReply(messages, since) || collectReply(messages, 0);
  const requestText =
    record?.task ??
    [...messages].find((m: any) => m?.type === "user")?.text ??
    session?.title ??
    "(no request recorded)";
  const orchester = record ? (record.orchester ?? record.agent) : (session?.agent ?? null);
  const split = splitModelRef(record?.model ?? (session?.model ? `${session.model.providerID}/${session.model.id}` : null));
  return {
    sessionID,
    record,
    request: {
      from: "orchester",
      orchester,
      sessionID,
      task: requestText,
      provider: record?.provider ?? split.provider,
      model: record?.model ?? (session?.model ? `${session.model.providerID}/${session.model.id}` : null),
      assignedAt: record?.ts ?? session?.time?.created ?? null,
    },
    response: {
      from: "mcp",
      reply,
      toolCalls: countToolCalls(messages, since || 0),
      cost: session?.cost ?? 0,
      tokens: session?.tokens ?? {},
      outcome: session?.outcome ?? null,
      transcript,
      messageCount: messages.length,
    },
    session: compactSession(session),
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/** Start the dashboard HTTP server. Resolves when listening; never resolves on close. */
export function startWebui(port: number): Promise<http.Server> {
  pushLog("info", `webui starting on port ${port}`, "boot");
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const p = url.pathname;

      if ((req.method === "GET" && p === "/") || p === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(PAGE);
        return;
      }
      if (req.method === "GET" && p === "/task") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(TASK_PAGE);
        return;
      }
      if (p === "/api/task" && req.method === "GET") {
        const sessionID = url.searchParams.get("sessionID") ?? "";
        if (!sessionID) {
          json(res, 400, { error: "sessionID query param required" });
          return;
        }
        const tsRaw = url.searchParams.get("ts");
        const ts = tsRaw !== null && tsRaw !== "" ? Number(tsRaw) : undefined;
        try {
          json(res, 200, await taskDetailPayload(sessionID, Number.isFinite(ts) ? ts : undefined));
        } catch (err) {
          pushLog("error", `task ${sessionID} failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`, "api");
          json(res, 502, { error: err instanceof Error ? err.message.split("\n")[0] : String(err) });
        }
        return;
      }

      // ---- status / sessions / scores (legacy + enriched) ----
      if (p === "/api/status") {
        const payload = await statusPayload();
        if (!payload.ok) pushLog("warn", `status check unreachable: ${payload.baseUrl}`, "api");
        json(res, 200, payload);
        return;
      }
      if (p === "/api/sessions") {
        const oc = await resolvedClient();
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "10") || 10));
        try {
          const list = await oc.listSessions({ limit, order: "desc" });
          const active = await oc.activeSessions().catch(() => ({}));
          const sessions = (list.data ?? []).map((s: any) => ({
            ...compactSession(s),
            running: Object.keys(active).includes(s?.id),
          }));
          json(res, 200, { sessions });
        } catch (err) {
          pushLog("error", `sessions failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`, "api");
          json(res, 502, { error: err instanceof Error ? err.message.split("\n")[0] : String(err) });
        }
        return;
      }
      if (p === "/api/session") {
        const sessionID = url.searchParams.get("sessionID") ?? "";
        if (!sessionID) {
          json(res, 400, { error: "sessionID query param required" });
          return;
        }
        try {
          const oc = await resolvedClient();
          const [session, active] = await Promise.all([oc.session(sessionID), oc.activeSessions().catch(() => ({}))]);
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100));
          const messages = (await oc.messages(sessionID, { order: "asc", limit })).data ?? [];
          json(res, 200, {
            session: compactSession(session),
            running: Object.keys(active).includes(sessionID),
            messageCount: messages.length,
            messages: renderTranscript(messages, { maxMessages: 200 }),
          });
        } catch (err) {
          pushLog("error", `session ${sessionID} failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`, "api");
          json(res, 502, { error: err instanceof Error ? err.message.split("\n")[0] : String(err) });
        }
        return;
      }
      if (p === "/api/scores") {
        const cfg = loadConfig();
        const store = loadStore(cfg.scoresFile);
        json(res, 200, { file: cfg.scoresFile, count: store.records.length, ranking: aggregate(store.records) });
        return;
      }
      if (p === "/api/tasks") {
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));
        json(res, 200, await tasksPayload(limit));
        return;
      }
      if (p === "/api/models" || p === "/api/agents") {
        try {
          const oc = await resolvedClient();
          const data = p === "/api/models" ? await oc.models() : await oc.agents();
          json(res, 200, { count: data.length, data: data.slice(0, 200) });
        } catch (err) {
          pushLog("error", `${p} failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`, "api");
          json(res, 502, { error: err instanceof Error ? err.message.split("\n")[0] : String(err) });
        }
        return;
      }

      // ---- providers (catalog: color logos + verified endpoints) ----
      if (p === "/api/providers") {
        json(res, 200, { count: PROVIDERS.length, providers: PROVIDERS });
        return;
      }
      if (p.startsWith("/assets/providers/") && req.method === "GET") {
        const name = p.slice("/assets/providers/".length);
        if (!/^[a-z0-9][a-z0-9_.-]*\.svg$/i.test(name)) {
          json(res, 400, { error: "invalid logo name" });
          return;
        }
        // assets/ lives next to src/ and dist/ — try both layouts.
        const candidates = [
          path.join(process.cwd(), "assets", "providers", name),
          path.join(process.cwd(), "dist", "..", "assets", "providers", name),
        ];
        const hit = candidates.find((f) => {
          try {
            return fs.statSync(f).isFile();
          } catch {
            return false;
          }
        });
        // Friendly alias: the Anthropic mark is stored as claude.svg.
        const fallback =
          !hit && name.toLowerCase() === "anthropic.svg"
            ? candidates.map((f) => f.replace("anthropic.svg", "claude.svg")).find((f) => {
                try {
                  return fs.statSync(f).isFile();
                } catch {
                  return false;
                }
              })
            : undefined;
        const file = hit ?? fallback;
        if (!file) {
          json(res, 404, { error: `unknown provider logo ${name}` });
          return;
        }
        res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" });
        res.end(fs.readFileSync(file, "utf8"));
        return;
      }

      // ---- api keys ----
      if (p === "/api/apikeys" && req.method === "GET") {
        const keys = listApiKeys().map((k) => ({ provider: k.provider, label: k.label, envKey: k.envKey, updatedAt: k.updatedAt }));
        json(res, 200, { count: keys.length, keys });
        return;
      }
      if (p === "/api/apikeys" && req.method === "POST") {
        const body = await readBody(req);
        const provider = String(body.provider ?? "").trim();
        const key = String(body.key ?? "").trim();
        if (!provider || !key) {
          json(res, 400, { error: "provider and key are required" });
          return;
        }
        const prov = PROVIDERS.find((pr) => pr.id === provider);
        const label = prov?.label ?? provider;
        const envKey = prov?.envKey ?? "custom";
        upsertApiKey(provider, label, envKey);
        pushLog("info", `API key saved for ${provider}`, "api");
        json(res, 200, { ok: true, provider });
        return;
      }
      if (p.startsWith("/api/apikeys/") && req.method === "DELETE") {
        const provider = p.slice("/api/apikeys/".length);
        deleteApiKey(provider);
        pushLog("info", `API key deleted for ${provider}`, "api");
        json(res, 200, { ok: true });
        return;
      }

      // ---- skill ----
      if (p === "/api/skill" && req.method === "GET") {
        const file = skillFile();
        json(res, 200, { name: file.name, mime: file.mime, content: file.content });
        return;
      }
      if (p === "/api/skill/download" && req.method === "GET") {
        const file = skillFile();
        res.writeHead(200, {
          "Content-Type": file.mime,
          "Content-Disposition": `attachment; filename="${file.name}"`,
        });
        res.end(file.content);
        return;
      }

      // ---- logs ----
      if (p === "/api/logs" && req.method === "GET") {
        const level = url.searchParams.get("level") ?? "all";
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "200") || 200));
        let rows = listLogs(limit * 2); // fetch extra to allow filtering
        if (level !== "all") rows = rows.filter((l) => l.level === level);
        if (q) rows = rows.filter((l) => (l.message + " " + l.source).toLowerCase().includes(q));
        rows = rows.slice(0, limit);
        json(res, 200, { count: rows.length, logs: rows });
        return;
      }
      if (p === "/api/logs" && req.method === "POST") {
        const body = await readBody(req);
        const level: LogLevel = ["info", "warn", "error"].includes(body?.level) ? body.level : "info";
        const entry = pushLog(level, String(body?.message ?? "(empty)"), "browser");
        json(res, 200, { ok: true, entry });
        return;
      }
      if (p === "/api/logs/clear" && req.method === "POST") {
        clearLogs();
        pushLog("info", "log buffer cleared", "api");
        json(res, 200, { ok: true });
        return;
      }

      // ---- settings ----
      if (p === "/api/settings" && req.method === "GET") {
        const cli = loadCliConfig();
        json(res, 200, { settings: loadSettings(), ports: { api: cli.apiPort, webui: cli.webuiPort }, file: process.env.OPENCODE_MCP_DB ?? path.join(os.homedir(), ".opencode-mcp", "opencode-mcp.db") });
        return;
      }
      if (p === "/api/settings" && (req.method === "PUT" || req.method === "POST")) {
        const body = await readBody(req);
        const settings = saveSettings({
          ...(body.theme !== undefined ? { theme: body.theme } : {}),
          ...(body.density !== undefined ? { density: body.density } : {}),
          ...(body.refreshMs !== undefined ? { refreshMs: Number(body.refreshMs) } : {}),
          ...(body.sessionsLimit !== undefined ? { sessionsLimit: Number(body.sessionsLimit) } : {}),
          ...(body.logsLevel !== undefined ? { logsLevel: body.logsLevel } : {}),
        });
        let ports = loadCliConfig();
        try {
          const patch: Record<string, number> = {};
          if (body.apiPort !== undefined && Number.isInteger(Number(body.apiPort))) patch.apiPort = Number(body.apiPort);
          if (body.webuiPort !== undefined && Number.isInteger(Number(body.webuiPort))) patch.webuiPort = Number(body.webuiPort);
          if (Object.keys(patch).length) ports = saveCliConfig(patch);
        } catch (err) {
          pushLog("error", `settings ports failed: ${err instanceof Error ? err.message : String(err)}`, "api");
          json(res, 400, { error: err instanceof Error ? err.message : String(err) });
          return;
        }
        pushLog("info", `settings saved (theme=${settings.theme}, density=${settings.density})`, "api");
        json(res, 200, { ok: true, settings, ports });
        return;
      }

      // ---- playground: live tool testing ----
      if (p.startsWith("/api/playground/") && req.method === "POST") {
        const tool = p.slice("/api/playground/".length);
        const body = await readBody(req);
        const cfg = loadConfig();
        try {
          const oc = await resolvedClient();
          if (tool === "models_list") {
            const [models, def] = await Promise.all([oc.models(), oc.defaultModel().catch(() => null)]);
            const needle = String(body.search ?? "").toLowerCase();
            const statsByModel = new Map(
              aggregateModels(loadStore(cfg.scoresFile).records).map((s) => [s.model, s]),
            );
            let rows = models.map((m: any) => {
              const id = `${m.providerID}/${m.id}`;
              const st = statsByModel.get(id);
              return {
                id,
                provider: m.providerID,
                providerID: m.providerID,
                model: m.id,
                modelID: m.id,
                context: m.limit?.context ?? null,
                maxOutput: m.limit?.output ?? null,
                tools: m.capabilities?.tools ?? null,
                enabled: m.enabled !== false,
                scoreCount: st?.count ?? 0,
                averageScore: st?.averageScore ?? null,
                lastScore: st?.lastScore ?? null,
                avgTaskMs: st?.avgDurationMs ?? null,
                avgTaskTime: st?.avgDurationMs ?? null,
              };
            });
            if (body.provider) rows = rows.filter((r: any) => r.providerID === String(body.provider) || r.id.startsWith(String(body.provider) + "/"));
            if (needle) rows = rows.filter((r: any) => r.id.toLowerCase().includes(needle));
            if (body.enabledOnly === true) rows = rows.filter((r: any) => r.enabled);
            const limit = Math.min(200, Math.max(1, Number(body.limit ?? 20) || 20));
            pushLog("info", `playground models_list → ${rows.length} matched`, "playground");
            json(res, 200, { default: def ? `${def.providerID}/${def.modelID ?? def.id}` : null, totalMatched: rows.length, models: rows.slice(0, limit) });
            return;
          }
          if (tool === "fetch_session") {
            if (!body.sessionID) {
              const list = await oc.listSessions({ limit: Math.min(200, Number(body.limit ?? 20) || 20), order: "desc" });
              const active = Object.keys(await oc.activeSessions().catch(() => ({})));
              pushLog("info", "playground fetch_session list", "playground");
              json(res, 200, {
                count: (list.data ?? []).length,
                sessions: (list.data ?? []).map((s: any) => ({ ...compactSession(s), running: active.includes(s.id) })),
              });
              return;
            }
            const [session, active] = await Promise.all([oc.session(String(body.sessionID)), oc.activeSessions().catch(() => ({}))]);
            const messages = (await oc.messages(String(body.sessionID), { order: body.order ?? "asc", limit: Math.min(200, Number(body.limit ?? 50) || 50) })).data ?? [];
            pushLog("info", `playground fetch_session ${body.sessionID}`, "playground");
            json(res, 200, {
              session: compactSession(session),
              running: Object.keys(active).includes(String(body.sessionID)),
              messageCount: messages.length,
              messages: body.includeMessages === false ? [] : renderTranscript(messages, { maxMessages: 200 }),
            });
            return;
          }
          if (tool === "score_to_agent") {
            const orchester = (body.orchester ?? body.agent)?.toString().trim();
            if (!orchester || body.score === undefined) {
              json(res, 400, { error: "orchester and score (0-100) are required" });
              return;
            }
            const score = Number(body.score);
            if (!Number.isFinite(score) || score < 0 || score > 100) {
              json(res, 400, { error: "score must be 0-100" });
              return;
            }
            const modelRaw = (body.modelID ?? body.model)?.toString().trim() || undefined;
            const split = splitModelRef(modelRaw);
            const result = recordScore(cfg.scoresFile, {
              orchester,
              agent: orchester,
              score,
              sessionID: body.sessionID ? String(body.sessionID) : undefined,
              provider: body.provider ? String(body.provider) : (split.provider ?? undefined),
              model: modelRaw,
              task: body.task ? String(body.task) : undefined,
              feedback: body.feedback ? String(body.feedback) : undefined,
              ...(body.durationMs !== undefined && body.durationMs !== "" ? { durationMs: Number(body.durationMs) } : {}),
            });
            pushLog("info", `playground score ${orchester}=${score}`, "playground");
            json(res, 200, { stored: true, record: result.record, agentStats: result.agentStats, ranking: result.ranking });
            return;
          }
          if (tool === "assign_task") {
            if (!body.task || !String(body.task).trim()) {
              json(res, 400, { error: "task text is required" });
              return;
            }
            const directory = body.directory || cfg.directory;
            const orchester = (body.orchester ?? body.agent)?.toString().trim() || undefined;
            let sessionId = body.sessionID ? String(body.sessionID) : "";
            let created = false;
            if (sessionId) {
              await oc.session(sessionId);
              if (orchester) await oc.setAgent(sessionId, String(orchester));
            } else {
              const payload: Record<string, unknown> = { title: body.title, agent: orchester, directory };
              const provider = body.provider?.toString().trim() || undefined;
              const modelRaw = (body.modelID ?? body.model)?.toString().trim() || undefined;
              if (provider && modelRaw) {
                const bare = modelRaw.startsWith(provider + "/") ? modelRaw.slice(provider.length + 1) : modelRaw;
                payload.model = { providerID: provider, id: bare, ...(body.variant ? { variant: String(body.variant) } : {}) };
              } else if (modelRaw) {
                const slash = modelRaw.indexOf("/");
                if (slash > 0) {
                  payload.model = {
                    providerID: modelRaw.slice(0, slash),
                    id: modelRaw.slice(slash + 1),
                    ...(body.variant ? { variant: String(body.variant) } : {}),
                  };
                }
              }
              const session = await oc.createSession(payload as any);
              sessionId = session.id;
              created = true;
            }
            const inbox = await oc.prompt(sessionId, { text: String(body.task), delivery: body.delivery === "queue" ? "queue" : "steer" });
            const promptAt: number = inbox?.time?.created ?? Date.now();
            pushLog("info", `playground assign_task → ${sessionId} (created=${created})`, "playground");
            if (body.wait !== true) {
              json(res, 200, { status: "dispatched", sessionID: sessionId, messageID: inbox?.id ?? null, sessionCreated: created, hint: "Poll with fetch_session or the Tasks page." });
              return;
            }
            const wait = await waitForIdle(oc, sessionId, promptAt, {
              timeoutMs: Math.min(300000, Math.max(5000, Number(body.timeoutMs ?? 60000) || 60000)),
              directory,
            });
            const messages = (await oc.messages(sessionId, { order: "asc", limit: 200 })).data ?? [];
            const session = wait.session ?? (await oc.session(sessionId));
            json(res, 200, {
              status: wait.status,
              sessionID: sessionId,
              reply: collectReply(messages, promptAt),
              toolCalls: countToolCalls(messages, promptAt),
              cost: session?.cost ?? 0,
              tokens: session?.tokens ?? {},
              elapsedMs: wait.elapsedMs,
              transcript: renderTranscript(messages, { since: promptAt, maxMessages: 40 }),
            });
            return;
          }
          json(res, 404, { error: `unknown playground tool ${esc(tool)}` });
        } catch (err) {
          const msg = err instanceof Error ? err.message.split("\n")[0]! : String(err);
          pushLog("error", `playground ${tool} failed: ${msg}`, "playground");
          json(res, 502, { error: msg });
        }
        return;
      }

      json(res, 404, { error: `unknown path ${esc(url.pathname)}` });
    } catch (err) {
      pushLog("error", String(err), "server");
      json(res, 500, { error: String(err) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
