import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./config.js";
import { loadCliConfig, saveCliConfig } from "./cli-config.js";
import { readService, resolveEndpoint } from "./bootstrap.js";
import { OpenCode } from "./opencode.js";
import { loadStore, aggregate, aggregateModels, recordScore, splitModelRef } from "./scores.js";
import { PROVIDERS, providerInputFields } from "./providers.js";
import { compactSession, renderTranscript, waitForIdle, countToolCalls, collectReply, deriveOutcome } from "./render.js";
import { openDb, appendLog, listLogs, clearLogs, getSetting, setSetting, upsertApiKey, listApiKeys, deleteApiKey, getApiKey, getUserByUsername } from "./db.js";
import {
  clearSessionCookieHeader,
  ensureDefaultUser,
  login as authLogin,
  logout as authLogout,
  parseCookies,
  publicAuthPaths,
  readSessionUsername,
  SESSION_COOKIE,
  sessionCookieHeader,
} from "./auth.js";
import { SKILL_MARKDOWN, SKILL_NAME, SKILL_VERSION, skillFile } from "./skill.js";
import {
  filterSessionIds,
  formatCompactTimestamp,
  listModelEntries,
  resolveDirectory,
} from "./mcp-api.js";

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
  appendLog(level, source, entry.message);
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
  theme: "dark-plus",
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
// Shared WebUI chrome (Apple fluid-interface tokens + existing theme palette)
// ---------------------------------------------------------------------------

/** System stack first (Apple-style); no webfont on the input path. */
const WEBUI_FONTS = "";

const WEBUI_SHARED_CSS = `
:root{--bg:#f8fafc;--panel:#fff;--surface:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#2563eb;--ok:#15803d;--warn:#b45309;--bad:#b42318;--chip:#f1f5f9;--radius:12px;--sidebar-w:240px;--switch-off:#39393d;--switch-on:#34c759;--glass:rgba(255,255,255,.72);--glass-edge:rgba(255,255,255,.55);--shadow-sm:0 1px 2px rgba(15,23,42,.05),0 8px 24px rgba(15,23,42,.06);--shadow-md:0 12px 40px rgba(15,23,42,.12);--ease-out:cubic-bezier(.25,.1,.25,1);--ease-settle:cubic-bezier(.32,.72,0,1)}
[data-theme="dark"]{--bg:#0b1220;--panel:#111c33;--surface:#111c33;--ink:#e2e8f0;--muted:#94a3b8;--line:#243355;--accent:#2563eb;--chip:#1a2742;--glass:rgba(17,28,51,.82);--glass-edge:rgba(255,255,255,.08);--shadow-sm:0 1px 2px rgba(0,0,0,.25),0 8px 24px rgba(0,0,0,.35);--shadow-md:0 12px 40px rgba(0,0,0,.45)}
[data-theme="dark-plus"]{--bg:#1e1e1e;--panel:#252525;--surface:#252525;--ink:#e0e0e0;--muted:#9d9d9d;--line:#333333;--accent:#2563eb;--chip:#2d2d2d;--glass:rgba(37,37,37,.78);--glass-edge:rgba(255,255,255,.1);--shadow-sm:0 1px 2px rgba(0,0,0,.35),0 8px 24px rgba(0,0,0,.4);--shadow-md:0 12px 40px rgba(0,0,0,.55);color-scheme:dark}
[data-theme="dracula"]{--bg:#282a36;--panel:#343746;--surface:#343746;--ink:#f8f8f2;--muted:#9a9cb3;--line:#44475a;--accent:#bd93f9;--chip:#44475a;--glass:rgba(52,55,70,.82);--glass-edge:rgba(255,255,255,.08)}
[data-theme="nord"]{--bg:#2e3440;--panel:#3b4252;--surface:#3b4252;--ink:#eceff4;--muted:#9aa3b2;--line:#4c566a;--accent:#88c0d0;--chip:#434c5e;--glass:rgba(59,66,82,.82);--glass-edge:rgba(255,255,255,.08)}
[data-theme="solarized-light"]{--bg:#fdf6e3;--panel:#eee8d5;--surface:#eee8d5;--ink:#586e75;--muted:#839496;--line:#d3c69f;--accent:#268bd2;--chip:#e7dfc8;--glass:rgba(238,232,213,.85);--glass-edge:rgba(255,255,255,.5)}
[data-theme="solarized-dark"]{--bg:#002b36;--panel:#073642;--surface:#073642;--ink:#eee8d5;--muted:#93a1a1;--line:#174652;--accent:#2aa198;--chip:#0e4a57;--glass:rgba(7,54,66,.85);--glass-edge:rgba(255,255,255,.08)}
[data-theme="github-light"]{--bg:#ffffff;--panel:#f6f8fa;--surface:#f6f8fa;--ink:#1f2328;--muted:#59636e;--line:#d1d9e0;--accent:#0969da;--chip:#eaeef2;--glass:rgba(246,248,250,.88);--glass-edge:rgba(255,255,255,.6)}
[data-theme="github-dark"]{--bg:#0d1117;--panel:#161b22;--surface:#161b22;--ink:#e6edf3;--muted:#9198a1;--line:#30363d;--accent:#4493f8;--chip:#21262d;--glass:rgba(22,27,34,.85);--glass-edge:rgba(255,255,255,.08)}
[data-theme="monokai"]{--bg:#272822;--panel:#3e3d32;--surface:#3e3d32;--ink:#f8f8f2;--muted:#bebda8;--line:#49483e;--accent:#a6e22e;--chip:#49483e;--glass:rgba(62,61,50,.85);--glass-edge:rgba(255,255,255,.08)}
[data-theme="tokyo-night"]{--bg:#1a1b26;--panel:#24283b;--surface:#24283b;--ink:#c0caf5;--muted:#7f87a8;--line:#343b5c;--accent:#7aa2f7;--chip:#2b3049;--glass:rgba(36,40,59,.85);--glass-edge:rgba(255,255,255,.08)}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5;font-optical-sizing:auto;-webkit-font-smoothing:antialiased}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
@media(prefers-reduced-transparency:reduce){:root{--glass:var(--panel);--glass-edge:var(--line)}aside,.topbar,.modal .box,.login-card{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}
@media(prefers-contrast:more){.card,.login-card,.modal .box{border-width:2px}button.btn,.icon-btn{border-width:2px}}
.app{display:grid;grid-template-columns:var(--sidebar-w) 1fr;min-height:100vh;transition:grid-template-columns .28s var(--ease-out)}
.app.sidebar-collapsed{--sidebar-w:72px}
aside{background:var(--glass);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border-right:1px solid var(--glass-edge);padding:14px 10px;display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh;overflow:hidden;box-shadow:inset -1px 0 0 var(--glass-edge)}
.sidebar-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 6px 10px}
.brand{font-weight:800;font-size:16px;letter-spacing:.2px;line-height:1.2}
.brand small{display:block;font-weight:500;color:var(--muted);font-size:11px;margin-top:2px}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid color-mix(in srgb,var(--line) 70%,transparent);border-radius:10px;background:color-mix(in srgb,var(--bg) 80%,transparent);color:var(--ink);cursor:pointer;flex-shrink:0;transition:transform 100ms var(--ease-out),background 150ms var(--ease-out)}
.icon-btn:hover{background:var(--chip)}
.icon-btn:active{transform:scale(.97)}
.nav{display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;overflow-y:auto}
.nav button{display:flex;width:100%;text-align:left;gap:10px;align-items:center;padding:9px 10px;border:1px solid transparent;background:transparent;color:var(--muted);border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;letter-spacing:.01em;transition:transform 100ms var(--ease-out),background 150ms var(--ease-out),color 150ms var(--ease-out)}
.nav button .ico{width:18px;height:18px;flex-shrink:0;opacity:.85}
.nav button.active,.nav button:hover{color:var(--ink);background:color-mix(in srgb,var(--bg) 88%,var(--chip));font-weight:600}
.nav button.active{border-color:color-mix(in srgb,var(--line) 65%,transparent);box-shadow:var(--shadow-sm)}
.nav button:active{transform:scale(.98)}
.app.sidebar-collapsed .nav-label,.app.sidebar-collapsed .brand-text,.app.sidebar-collapsed .side-user-meta{display:none}
.app.sidebar-collapsed .nav button{justify-content:center;padding:10px}
.back-btn{display:flex;width:100%;text-align:left;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:6px}
.back-btn:hover{background:var(--bg)}
.side-user{margin-top:auto;display:flex;align-items:center;gap:8px;padding:10px 8px;border-top:1px solid var(--line)}
.side-user-main{display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;border-radius:8px;padding:4px}
.side-user-main:hover{background:var(--bg)}
.avatar{width:32px;height:32px;border-radius:50%;background:var(--bg);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.side-user-meta{min-width:0;flex:1}
.side-user-meta .name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-user-meta .sub{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.main-col{display:flex;flex-direction:column;min-height:100vh;min-width:0}
main{padding:20px 24px 12px;flex:1;max-width:none;width:100%;min-width:0}
.site-foot{padding:10px 24px 16px;border-top:1px solid color-mix(in srgb,var(--line) 70%,transparent);font-size:12px;color:var(--muted);letter-spacing:.02em;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.site-foot a{color:var(--accent);text-decoration:none;font-weight:500}
.site-foot a:hover{text-decoration:underline}
.topbar{display:flex;align-items:center;gap:10px;margin:0 0 18px;padding:14px 0 16px;flex-wrap:wrap;position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 70%,transparent);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent);margin-bottom:18px}
.topbar h2{margin:0;font-size:1.35rem;font-weight:700;line-height:1.12;letter-spacing:-.022em}
.dot{width:9px;height:9px;border-radius:50%;background:#999;display:inline-block}
.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}
.spacer{flex:1}
input,select,textarea{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit}
input:focus,select:focus,textarea:focus{outline:2px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:1px}
button.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:10px;border:1px solid color-mix(in srgb,var(--line) 75%,transparent);background:color-mix(in srgb,var(--panel) 92%,var(--bg));color:var(--ink);cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;transition:transform 100ms var(--ease-out),background 150ms var(--ease-out),filter 150ms var(--ease-out)}
button.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
button.btn:hover{filter:brightness(.98)}
button.btn:active{transform:scale(.97)}
button.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin:12px 0}
.card{background:var(--surface);border:1px solid color-mix(in srgb,var(--line) 75%,transparent);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow-sm)}
.card h4{margin:0 0 8px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.card .v{font-size:1.5rem;font-weight:800;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:900px){.app{grid-template-columns:1fr}.app.sidebar-collapsed{--sidebar-w:1fr}aside{position:static;height:auto;max-height:none}.grid2{grid-template-columns:1fr}main{padding:14px}}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:var(--bg);font-weight:600}
tr:hover td{background:color-mix(in srgb,var(--ink) 4%,transparent);cursor:pointer}
body[data-density="compact"] th,body[data-density="compact"] td{padding:4px 8px;font-size:12px}
code,pre{background:var(--chip);padding:2px 6px;border-radius:6px;font-family:ui-monospace,Consolas,monospace}
pre{padding:12px;overflow:auto;font-size:12px;max-height:420px}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--chip)}
.badge.hi{background:#dcfce7;color:#166534}[data-theme="dark-plus"] .badge.hi,[data-theme="dark"] .badge.hi{background:#14532d;color:#bbf7d0}
.badge.mid{background:#fef9c3;color:#854d0e}[data-theme="dark-plus"] .badge.mid,[data-theme="dark"] .badge.mid{background:#713f12;color:#fef9c3}
.badge.lo{background:#fee2e2;color:#991b1b}[data-theme="dark-plus"] .badge.lo,[data-theme="dark"] .badge.lo{background:#7f1d1d;color:#fecaca}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}
.page{display:none;opacity:0}.page.active{display:block;animation:ocm-page-in .24s var(--ease-out) forwards}
@keyframes ocm-page-in{from{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.page.active{animation:ocm-page-in .2s ease forwards}}
.log-scroll{max-height:min(70vh,720px);overflow-y:auto;min-height:140px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
.logrow{display:grid;grid-template-columns:170px 70px 150px 1fr;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line);font-size:12.5px;align-items:baseline}
.logrow .lv{font-weight:800}.lv.info{color:var(--accent)}.lv.warn{color:var(--warn)}.lv.error{color:var(--bad)}
.seg{display:flex;gap:6px;flex-wrap:wrap}
.seg button{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:12px}
.seg button.active{background:var(--ink);color:var(--bg);font-weight:700}
.set-shell{display:grid;grid-template-columns:180px 1fr;gap:20px;align-items:start}
@media(max-width:760px){.set-shell{grid-template-columns:1fr}}
.set-nav{display:flex;flex-direction:column;gap:4px}
.set-nav button{text-align:left;padding:8px 12px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--muted);cursor:pointer;font-size:13px}
.set-nav button.active,.set-nav button:hover{color:var(--ink);background:var(--bg);border-color:var(--line);font-weight:600}
.settings-panel{max-width:48rem;width:100%}
.settings-panel h1{margin:0 0 6px;font-size:22px;font-weight:700}
.settings-lead{margin:0 0 18px;color:var(--muted);font-size:13px}
.settings-section{margin:0 0 20px}
.settings-section h2{margin:0 0 8px;font-size:13px;font-weight:600}
.settings-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.settings-row{display:grid;grid-template-columns:1fr auto;gap:4px 16px;padding:14px 16px;border-bottom:1px solid var(--line);align-items:center}
.settings-row:last-child{border-bottom:none}
.settings-row__title{margin:0;font-size:13px;font-weight:500}
.settings-row__desc{margin:0;font-size:12px;color:var(--muted);grid-column:1}
.settings-row__control{grid-column:2;grid-row:1/span 2;justify-self:end}
.settings-row.stacked{grid-template-columns:1fr}
.settings-row.stacked .settings-row__control{grid-column:1;grid-row:auto;justify-self:stretch;width:100%}
.settings-footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--line)}
input.sw{appearance:none;width:44px;height:26px;border-radius:999px;background:var(--switch-off);position:relative;cursor:pointer;border:none;flex-shrink:0}
input.sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s ease}
input.sw:checked{background:var(--switch-on)}
input.sw:checked::after{transform:translateX(18px)}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.tabs button{padding:7px 13px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:13px}
.tabs button.active{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600}
.form{display:grid;grid-template-columns:180px 1fr;gap:8px 12px;align-items:center;margin:10px 0}
.form label{color:var(--muted);font-size:13px}
.hint{color:var(--muted);font-size:12px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.38);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;visibility:hidden;transition:opacity .22s var(--ease-out),visibility .22s var(--ease-out);z-index:50}
.modal.open{opacity:1;visibility:visible}
.modal .box{background:var(--glass);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid var(--glass-edge);border-radius:14px;max-width:760px;width:100%;padding:20px;max-height:86vh;overflow:auto;box-shadow:var(--shadow-md);transform:translateY(10px) scale(.96);transition:transform .32s var(--ease-settle),opacity .22s var(--ease-out);opacity:.98}
.modal.open .box{transform:none;opacity:1}
@media(prefers-reduced-motion:reduce){.modal .box{transform:none;transition:opacity .2s ease}.modal.open .box{opacity:1}}
.kv{display:grid;grid-template-columns:170px 1fr;gap:6px 10px;font-size:13px;margin:8px 0}
.kv dt{color:var(--muted)}.kv dd{margin:0}
.prov-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px;display:flex;flex-direction:column;gap:8px}
.prov-card .logo-row{display:flex;align-items:center;gap:10px}
.prov-card .logo-row img{width:28px;height:28px}
.prov-card h4{margin:0;font-size:15px}
.prov-card .actions{display:flex;gap:6px;margin-top:4px}
.key-input{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.field-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;padding:2px 7px;border-radius:999px;margin-left:6px}
.field-tag.req{background:#fee2e2;color:#991b1b}[data-theme="dark-plus"] .field-tag.req{background:#3b1d1b;color:#fecaca}
.field-tag.opt{background:var(--chip);color:var(--muted)}
.prov-detail-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:12px}
.prov-detail-head img{width:36px;height:36px}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(120% 80% at 50% 0%,color-mix(in srgb,var(--accent) 8%,transparent),transparent 55%),var(--bg)}
.login-card{background:var(--glass);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid var(--glass-edge);border-radius:16px;padding:28px 26px;width:100%;max-width:400px;box-shadow:var(--shadow-md)}
.login-card h1{margin:0 0 6px;font-size:1.45rem;line-height:1.12;letter-spacing:-.022em;font-weight:700}
.login-card .sub{margin:0 0 22px;color:var(--muted);font-size:13px}
.login-card label{display:block;font-size:13px;color:var(--muted);margin:12px 0 6px}
.login-card input{width:100%;padding:10px 12px}
.login-card button.btn.primary{width:100%;margin-top:18px;justify-content:center;padding:11px}
.login-card .err{color:var(--bad);font-size:13px;margin-top:12px;min-height:18px}
.login-brand{font-weight:800;font-size:12px;color:var(--muted);letter-spacing:.3px;text-transform:uppercase;margin-bottom:8px}
`;

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------

const LOGIN_PAGE = `<!doctype html>
<html lang="en" data-theme="dark-plus"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#252525"/>
<title>Sign in • opencodemcp</title>
${WEBUI_FONTS}
<style>${WEBUI_SHARED_CSS}</style></head><body>
<div class="login-wrap">
<div class="login-card">
<div class="login-brand">opencodemcp</div>
<h1>Sign in</h1>
<p class="sub">Dashboard access for your OpenCode MCP orchestrator.</p>
<form id="loginForm">
<label for="username">Username</label>
<input id="username" name="username" autocomplete="username" required autofocus/>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required/>
<button type="submit" class="btn primary">Sign in</button>
<p class="err" id="err"></p>
</form>
</div>
</div>
<script>
document.documentElement.dataset.theme='dark-plus';
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}
document.getElementById('loginForm').addEventListener('submit',async e=>{
e.preventDefault();
const err=document.getElementById('err');
err.textContent='';
const body={username:document.getElementById('username').value,password:document.getElementById('password').value};
try{
const r=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const d=await r.json().catch(()=>({}));
if(r.ok&&d.ok){location.href='/';return}
err.textContent=esc(d.error||'Sign in failed');
}catch(x){err.textContent=esc(x)}
});
</script></body></html>`;

// ---------------------------------------------------------------------------
// Page (single-file SPA: Dashboard / Tasks / Providers / Skill / Stats / Logs / Playground / Settings)
// ---------------------------------------------------------------------------

const PAGE = `<!doctype html>
<html lang="en" data-theme="dark-plus"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#252525"/>
<title>opencodemcp dashboard</title>
${WEBUI_FONTS}
<style>${WEBUI_SHARED_CSS}</style></head><body data-density="comfortable">
<div class="app" id="appShell">
<aside>
<div class="sidebar-head">
<div class="brand"><span class="brand-text">opencodemcp</span><small class="brand-text">orchestrator dashboard</small></div>
<button type="button" class="icon-btn" id="sidebarToggle" title="Collapse sidebar" aria-label="Collapse sidebar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
</div>
<button class="back-btn" id="backBtn" style="display:none">← Back</button>
<nav class="nav" id="nav">
<button data-page="dashboard" data-label="Dashboard" class="active"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span class="nav-label">Dashboard</span></button>
<button data-page="tasks" data-label="Tasks"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><span class="nav-label">Tasks</span></button>
<button data-page="providers" data-label="Providers"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg><span class="nav-label">Providers</span></button>
<button data-page="skill" data-label="Skill"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg><span class="nav-label">Skill</span></button>
<button data-page="stats" data-label="Stats"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 5 5-9"/></svg><span class="nav-label">Stats</span></button>
<button data-page="logs" data-label="Logs"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><span class="nav-label">Logs</span></button>
<button data-page="playground" data-label="Playground"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3l10 9-10 9V3z"/></svg><span class="nav-label">Playground</span></button>
</nav>
<div class="side-user">
<div class="side-user-main" id="sideProfile" title="Profile">
<div class="avatar" id="sideAvatar">?</div>
<div class="side-user-meta"><div class="name" id="sideName">Signed in</div><div class="sub" id="sideSub">…</div></div>
</div>
<button type="button" class="icon-btn" id="sideSettings" title="Settings" aria-label="Settings"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
</div>
</aside>
<div class="main-col">
<main>
<div class="topbar">
<h2 id="title">Dashboard</h2>
<span class="dot" id="healthDot" title="server reachability"></span>
<span class="hint" id="healthTxt">checking…</span>
<span class="spacer"></span>
<button class="btn" id="themeBtn" title="Cycle theme"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2"/></svg> Theme</button>
<button class="btn" id="refreshBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"/></svg> Refresh</button>
</div>

<!-- DASHBOARD -->
<section class="page active" id="page-dashboard">
<div class="cards" id="statCards"></div>
<div class="grid2">
<div class="card"><h4>Recent sessions</h4><div id="dashSessions">loading…</div></div>
<div class="card"><h4>Agent ranking</h4><div id="dashScores">loading…</div></div>
</div>
<div class="grid2">
<div class="card"><h4>Status</h4><pre id="statusPre">loading…</pre></div>
<div class="card"><div class="toolbar" style="margin-bottom:10px"><h4 style="margin:0">Recent logs</h4><span class="spacer"></span><button class="btn" type="button" id="dashLogsMore">Open Logs →</button></div><div id="dashLogs" class="log-scroll"><p class="hint">loading…</p></div></div>
</div>
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
<label class="hint" for="provSelect">Provider</label>
<select id="provSelect" style="min-width:min(320px,100%)"></select>
<input id="provSearch" placeholder="filter list…" style="flex:1;min-width:140px"/>
<span class="hint" id="provCount"></span>
<button class="btn" id="provReload">↻ Reload</button>
</div>
<div id="provDetail"></div>
<p class="hint">Pick a provider to configure credentials. Logos: <code>assets/providers/*.svg</code>. Catalog: <code>/api/providers</code>.</p>
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
<div id="logList" class="log-scroll"></div>
</div>
</section>

<!-- PLAYGROUND -->
<section class="page" id="page-playground">
<div class="card">
<p class="hint">Test the MCP tools live against the OpenCode server.</p>
<div class="tabs" id="pgTabs">
<button data-tool="assign_task" class="active">assign_task</button>
<button data-tool="providers">providers</button>
<button data-tool="model">model</button>
<button data-tool="score">score</button>
<button data-tool="sessions">sessions</button>
</div>
<div id="pgForm"></div>
<div class="toolbar"><button class="btn primary" id="pgRun">▶ Run</button><span class="hint" id="pgHint"></span></div>
<h4>Result</h4>
<pre id="pgOut">— run a tool to see output —</pre>
</div>
</section>

<!-- SETTINGS -->
<section class="page" id="page-settings">
<div class="set-shell">
<nav class="set-nav" id="setTabs" aria-label="Settings categories">
<button type="button" data-tab="profile" class="active">Profile</button>
<button type="button" data-tab="appearance">Appearance</button>
<button type="button" data-tab="behaviour">Behaviour</button>
<button type="button" data-tab="feedback">Feedback</button>
<button type="button" data-tab="about">About</button>
<button type="button" data-tab="app">App</button>
</nav>
<div class="settings-panel">
<h1>Settings</h1>
<p class="settings-lead">Preferences for this dashboard, orchestrator ports, and appearance.</p>
<div id="setTabProfile">
<div class="settings-section"><h2>Account</h2>
<div class="settings-card">
<div class="settings-row stacked"><p class="settings-row__title">Username</p><p class="settings-row__desc">Signed-in dashboard user.</p><div class="settings-row__control"><input id="profUser" disabled style="width:100%"/></div></div>
<div class="settings-row stacked"><p class="settings-row__title">Email</p><p class="settings-row__desc">Contact email on file.</p><div class="settings-row__control"><input id="profEmail" disabled style="width:100%"/></div></div>
<div class="settings-footer"><button class="btn" id="profLogout">Log out</button><span class="hint" id="profMsg"></span></div>
</div></div>
</div>
<div id="setTabAppearance" style="display:none">
<div class="settings-section"><h2>Appearance</h2>
<div class="settings-card">
<div class="settings-row"><p class="settings-row__title">Theme</p><p class="settings-row__desc">Editor-style palette for the dashboard.</p><div class="settings-row__control"><select id="setTheme"><option value="system">system (auto)</option><option value="light">Light</option><option value="dark">Dark</option><option value="dark-plus">Dark+ (VS Code)</option><option value="dracula">Dracula</option><option value="nord">Nord</option><option value="solarized-light">Solarized Light</option><option value="solarized-dark">Solarized Dark</option><option value="github-light">GitHub Light</option><option value="github-dark">GitHub Dark</option><option value="monokai">Monokai</option><option value="tokyo-night">Tokyo Night</option></select></div></div>
<div class="settings-row"><p class="settings-row__title">Density</p><p class="settings-row__desc">Table row spacing across the app.</p><div class="settings-row__control"><select id="setDensity"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div></div>
<div class="settings-row"><p class="settings-row__title">Default log filter</p><p class="settings-row__desc">Initial severity on the Logs page.</p><div class="settings-row__control"><select id="setLogsLevel"><option value="all">All</option><option value="info">Info</option><option value="warn">Warning</option><option value="error">Errors</option></select></div></div>
</div></div>
</div>
<div id="setTabBehaviour" style="display:none">
<div class="settings-section"><h2>Behaviour</h2>
<div class="settings-card">
<div class="settings-row stacked"><p class="settings-row__title">Auto-refresh interval</p><p class="settings-row__desc">Milliseconds between dashboard/log polls (0 disables).</p><div class="settings-row__control"><input id="setRefresh" type="number" min="0" max="300000" step="1000" style="width:100%"/></div></div>
<div class="settings-row stacked"><p class="settings-row__title">Sessions limit</p><p class="settings-row__desc">How many recent sessions load on the dashboard.</p><div class="settings-row__control"><input id="setLimit" type="number" min="1" max="200" style="width:100%"/></div></div>
</div></div>
</div>
<div id="setTabFeedback" style="display:none">
<div class="settings-section"><h2>Feedback</h2>
<div class="settings-card">
<div class="settings-row stacked"><p class="settings-row__title">Message</p><p class="settings-row__desc">Share bugs or ideas (stored locally in logs for now).</p><div class="settings-row__control"><textarea id="setFeedback" rows="4" placeholder="What should we improve?" style="width:100%"></textarea></div></div>
<div class="settings-footer"><button class="btn primary" id="setFeedbackSend">Send feedback</button><span class="hint" id="setFeedbackMsg"></span></div>
</div></div>
</div>
<div id="setTabAbout" style="display:none">
<div class="settings-section"><h2>About</h2>
<div class="settings-card">
<div class="settings-row"><p class="settings-row__title">Created by</p><p class="settings-row__desc">Author of this orchestrator dashboard.</p><div class="settings-row__control"><span>Armin Dashti</span></div></div>
<div class="settings-row"><p class="settings-row__title">GitHub</p><p class="settings-row__desc">Source and other projects.</p><div class="settings-row__control"><a class="btn" href="https://github.com/armindashti" target="_blank" rel="noopener">Open profile</a></div></div>
<div class="settings-row"><p class="settings-row__title">Product</p><p class="settings-row__desc">MCP bridge for OpenCode task orchestration.</p><div class="settings-row__control"><span>opencodemcp</span></div></div>
</div></div>
</div>
<div id="setTabApp" style="display:none">
<div class="settings-section"><h2>App</h2>
<div class="settings-card">
<div class="settings-row stacked"><p class="settings-row__title">API port</p><p class="settings-row__desc">OpenCode MCP HTTP API listener.</p><div class="settings-row__control"><input id="setApiPort" type="number" min="1" max="65535" style="width:100%"/></div></div>
<div class="settings-row stacked"><p class="settings-row__title">WebUI port</p><p class="settings-row__desc">This dashboard (requires restart).</p><div class="settings-row__control"><input id="setWebuiPort" type="number" min="1" max="65535" style="width:100%"/></div></div>
<div class="settings-row stacked"><p class="settings-row__title">Base URL</p><p class="settings-row__desc">OpenCode server endpoint.</p><div class="settings-row__control"><input id="setBaseUrl" disabled style="width:100%"/></div></div>
<div class="settings-row stacked"><p class="settings-row__title">Directory</p><p class="settings-row__desc">Default workspace for assign_task.</p><div class="settings-row__control"><input id="setDir" disabled style="width:100%"/></div></div>
<div class="settings-row stacked"><p class="settings-row__title">Database</p><p class="settings-row__desc">SQLite path for settings and logs.</p><div class="settings-row__control"><input id="setDb" disabled style="width:100%"/></div></div>
<div class="settings-footer"><button class="btn primary" id="setSave">Save settings</button><span class="hint" id="setMsg"></span></div>
</div></div>
</div>
</div></div>
</section>

</main>
<footer class="site-foot"><a href="https://github.com/armindashti" target="_blank" rel="noopener">GitHub</a><span>Created by Armin Dashti</span></footer>
</div></div>
<div class="modal" id="modal"><div class="box"><div class="toolbar"><b id="mTitle">detail</b><span class="spacer"></span><button class="btn" id="mClose">✕</button></div><div id="mBody"></div></div></div>
<script>
const $=id=>document.getElementById(id);
const state={page:'dashboard',settings:null,tasks:[],logLevel:'all',pgTool:'assign_task',setTab:'appearance',timer:null,provList:[],provKeys:{},provConfig:{}};
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
async function j(u,o){const r=await fetch(u,{credentials:'same-origin',...o});if(r.status===401&&String(u).startsWith('/api/')&&!String(u).startsWith('/api/auth/')){location.href='/login';return {error:'unauthorized'}};const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t,http:r.status}}}
function pad(n){return String(n).padStart(2,'0')}
function fmtDT(ts){if(ts==null||ts==='')return '—';const d=new Date(Number(ts));if(isNaN(d.getTime()))return '—';return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds())}
function fmtT(ts){return fmtDT(ts)}
function fmtDur(ms){if(ms==null||ms===''||!isFinite(Number(ms)))return '—';ms=Math.max(0,Math.round(Number(ms)));const s=Math.floor(ms/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m '+pad(s%60)+'s';const h=Math.floor(m/60);return h+'h '+pad(m%60)+'m '+pad(s%60)+'s'}
function tokStr(t){if(t==null||t==='')return '—';if(typeof t==='number')return t.toLocaleString();if(typeof t==='object'){const tot=(t.input||0)+(t.output||0)+(t.reasoning||0);return tot? tot.toLocaleString() + ' <span class="hint">('+ (t.input||0)+'/'+(t.output||0)+'/'+(t.reasoning||0)+')</span>':'—'}return String(t)}
function scoreBadge(s){if(s==null)return '—';const c=s>=90?'hi':s>=70?'hi':s>=40?'mid':'lo';return '<span class="badge '+c+'">'+s+'</span>'}
function applyTheme(){const th=state.settings?.theme||'dark-plus';const known=['light','dark','dark-plus','dracula','nord','solarized-light','solarized-dark','github-light','github-dark','monokai','tokyo-night'];let eff=th;if(th==='system'){eff=matchMedia('(prefers-color-scheme: dark)').matches?'dark-plus':'light'}if(!known.includes(eff))eff='dark-plus';document.documentElement.dataset.theme=eff;document.body.dataset.density=state.settings?.density||'comfortable';const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',eff==='light'?'#f8fafc':'#252525');const btn=$('themeBtn');if(btn){const t=[...btn.childNodes].find(n=>n.nodeType===3);if(t)t.textContent=' '+eff}}
function clientLog(level,msg){fetch('/api/logs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({level,message:String(msg).slice(0,500)})}).catch(()=>{})}
function pageTitle(btn){return btn?.dataset?.label||btn?.textContent?.trim()||'Dashboard'}
function activeLogLevel(){const b=document.querySelector('#logSeg button.active');return b?.dataset?.lv||state.logLevel||'all'}
function syncLogFilterUi(){const lv=state.logLevel||'all';document.querySelectorAll('#logSeg button').forEach(x=>x.classList.toggle('active',x.dataset.lv===lv))}
function renderLogRowsHtml(rows){return(rows||[]).slice().reverse().map(l=>'<div class="logrow"><span class="hint">'+fmtDT(l.ts)+'</span><span class="lv '+l.level+'">'+l.level+'</span><span class="hint">'+l.source+'</span><span>'+String(l.message).replace(/</g,'&lt;')+'</span></div>').join('')||'<p class="hint">no logs yet — MCP tool calls and dashboard actions appear here</p>'}
function goPage(page,label){state.page=page;if(page==='logs'){state.logLevel=state.settings?.logsLevel||state.logLevel||'all';syncLogFilterUi()}document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===page));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));$('title').textContent=label||pageTitle(document.querySelector('#nav button[data-page="'+page+'"]'));$('backBtn').style.display='none';load()}
function initials(name){const p=String(name||'?').trim().split(/\\s+/);return ((p[0]?.[0]||'?')+(p[1]?.[0]||'')).toUpperCase().slice(0,2)}
function syncUserFoot(me,st){const u=me?.user;if(!u)return;$('sideName').textContent=u.username||'User';$('sideAvatar').textContent=initials(u.username);$('sideSub').textContent='api '+(st?.ports?.api??'?')+' • webui '+(st?.ports?.webui??'?')}
try{const collapsed=localStorage.getItem('ocmcp-sidebar')==='1';if(collapsed)$('appShell').classList.add('sidebar-collapsed')}catch{}
$('sidebarToggle').onclick=()=>{const el=$('appShell');el.classList.toggle('sidebar-collapsed');try{localStorage.setItem('ocmcp-sidebar',el.classList.contains('sidebar-collapsed')?'1':'0')}catch{}};
function openSettings(tab){goPage('settings');showSetTab(tab||'profile')}
$('sideSettings').onclick=()=>openSettings('appearance');
$('sideProfile').onclick=()=>openSettings('profile');
$('nav').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!b.dataset.page)return;goPage(b.dataset.page,pageTitle(b))});
$('backBtn').addEventListener('click',()=>goPage('dashboard','Dashboard'));
// dashboard
async function loadDashboard(){const lim=state.settings?.sessionsLimit||20;
try{
const [st,se,sc,lg]=await Promise.all([j('/api/status'),j('/api/sessions?limit='+lim),j('/api/scores'),j('/api/logs?level=all&limit=25')]);
$('statusPre').textContent=JSON.stringify(st,null,2);
if($('dashLogs'))$('dashLogs').innerHTML=renderLogRowsHtml(lg.logs||[]);
const ok=!!st.ok;$('healthDot').className='dot '+(ok?'ok':'bad');$('healthTxt').textContent=(st.baseUrl||'')+(ok?' • reachable':' • unreachable');
const meFoot=await j('/api/auth/me').catch(()=>({}));syncUserFoot(meFoot,st);
const sess=se.sessions||[];const rank=sc.ranking||[];
const running=sess.filter(s=>s.running).length;
let tokens=0;try{tokens=sess.reduce((a,s)=>a+((s.tokens?.input||0)+(s.tokens?.output||0)+(s.tokens?.reasoning||0)),0)}catch{}
const best=rank[0];const avg=rank.length?(rank.reduce((a,r)=>a+r.average,0)/rank.length).toFixed(1):'—';
$('statCards').innerHTML=['Sessions|'+sess.length,'Running|'+running,'Scores|'+(sc.count??rank.reduce((a,r)=>a+r.count,0)),'Best agent|'+(best?best.agent:'—'),'Avg score|'+avg,'Tokens (recent)|'+Number(tokens).toLocaleString()].map(x=>{const[a,b]=x.split('|');return '<div class="card"><h4>'+a+'</h4><div class="v">'+b+'</div></div>'}).join('');
$('dashSessions').innerHTML=sess.length?'<table><tr><th>session</th><th>agent</th><th>model</th><th>state</th></tr>'+sess.slice(0,8).map(s=>'<tr><td><code>'+String(s.id||'').slice(0,14)+'…</code></td><td>'+(s.agent||'—')+'</td><td>'+(s.model||'—')+'</td><td>'+(s.running?'▶ running':(s.outcome||'—'))+'</td></tr>').join('')+'</table>':'<span class="hint">no sessions</span>';
$('dashScores').innerHTML=rank.length?'<table><tr><th>agent</th><th>n</th><th>avg</th><th>last</th></tr>'+rank.slice(0,8).map(r=>'<tr><td>'+r.agent+'</td><td>'+r.count+'</td><td>'+r.average+'</td><td>'+r.last+'</td></tr>').join('')+'</table>':'<span class="hint">no scores yet — use Playground → score</span>';
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
function renderProvDetail(){const id=$('provSelect').value;const p=state.provList.find(x=>x.id===id);
if(!p){$('provDetail').innerHTML='<p class="hint">Select a provider from the dropdown.</p>';return}
const cfg=state.provConfig[id]||{};const keyMeta=state.provKeys[id];
const fields=p.inputFields||[];
let form='';
if(!fields.length){form='<p class="hint">No credentials required for this provider.</p>'}
else{form='<div class="form">'+fields.map(f=>{
const tag=f.required?'<span class="field-tag req">required</span>':'<span class="field-tag opt">optional</span>';
const inpType=f.inputType==='secret'?'password':(f.inputType==='url'?'url':'text');
const val=f.id==='baseUrl'?(cfg.baseUrl||''):'';
const ph=esc(f.placeholder||'');
return '<label>'+esc(f.label)+tag+'</label><div><input class="key-input" id="prov_f_'+f.id+'" type="'+inpType+'" placeholder="'+ph+'" value="'+esc(val)+'" autocomplete="off"/>'+(f.hint?'<p class="hint">'+esc(f.hint)+(f.envVar?' <code>'+esc(f.envVar)+'</code>':'')+'</p>':'')+'</div>';
}).join('')+'</div>'}
const keyBadge=keyMeta?'<span class="badge hi">key saved</span>':'<span class="hint">no key saved</span>';
$('provDetail').innerHTML='<div class="prov-detail-head"><img src="/assets/providers/'+esc(p.id)+'.svg" alt=""/><div><h3 style="margin:0">'+esc(p.label)+'</h3><p class="hint"><code>'+esc(p.id)+'</code> • '+esc(p.kind)+' • '+keyBadge+'</p></div></div><p style="font-size:13px">'+esc(p.note)+'</p><p class="hint">'+esc(p.baseUrl)+' • <a href="'+esc(p.docs)+'" target="_blank" rel="noopener">docs</a></p>'+form+'<div class="toolbar"><button class="btn primary" id="provSave">Save</button>'+(keyMeta?'<button class="btn" id="provDelete">Remove saved key</button>':'')+'<span class="hint" id="provMsg"></span></div>';
$('provSave').onclick=()=>saveProvConfig(p);
const del=$('provDelete');if(del)del.onclick=()=>deleteKey(p.id);
}
async function loadProvConfig(id){try{const d=await j('/api/providers/'+encodeURIComponent(id)+'/config');state.provConfig[id]=d}catch{state.provConfig[id]={}}}
async function loadProviders(){const q=($('provSearch').value||'').trim().toLowerCase();
try{const [cat,keys]=await Promise.all([j('/api/providers'),j('/api/apikeys')]);
let rows=cat.providers||[];state.provList=rows;
state.provKeys={};for(const k of keys.keys||[])state.provKeys[k.provider]=k;
if(q)rows=rows.filter(p=>((p.id||'')+' '+(p.label||'')+' '+(p.baseUrl||'')).toLowerCase().includes(q));
$('provCount').textContent=rows.length+' of '+(cat.count??state.provList.length);
const prev=$('provSelect').value;
$('provSelect').innerHTML=rows.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.label)+' ('+esc(p.id)+')</option>').join('')||'<option value="">—</option>';
if(prev&&rows.some(p=>p.id===prev))$('provSelect').value=prev;else if(rows[0])$('provSelect').value=rows[0].id;
if($('provSelect').value)await loadProvConfig($('provSelect').value);
renderProvDetail();
}catch(e){$('provDetail').innerHTML='error: '+esc(e);clientLog('error','providers load: '+e)}
}
async function saveProvConfig(p){const fields=p.inputFields||[];const body={provider:p.id};const values={};
for(const f of fields){const el=$('prov_f_'+f.id);const v=el?el.value.trim():'';if(f.required&&!v){$('provMsg').textContent=f.label+' is required';return}if(v)values[f.id]=v}
if(values.apiKey)body.key=values.apiKey;if(values.baseUrl)body.baseUrl=values.baseUrl;
if(!body.key&&!body.baseUrl){$('provMsg').textContent='Enter at least one value to save';return}
$('provMsg').textContent='saving…';
try{const d=await j('/api/apikeys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
if(d.error){$('provMsg').textContent='error: '+d.error}else{$('provMsg').textContent='saved ✓';await loadProviders();clientLog('info','provider config saved for '+p.id)}
}catch(e){$('provMsg').textContent='error: '+e}
}
async function deleteKey(provId){if(!confirm('Delete saved key for '+provId+'?'))return;try{await fetch('/api/apikeys/'+encodeURIComponent(provId),{method:'DELETE'});await loadProviders();clientLog('info','API key deleted for '+provId)}catch(e){clientLog('error','delete key: '+e)}}
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
async function loadLogs(){const lv=activeLogLevel();state.logLevel=lv;const q=$('logSearch').value.trim();
try{const d=await j('/api/logs?level='+lv+'&limit=200'+(q?'&q='+encodeURIComponent(q):''));const rows=d.logs||[];
$('logList').innerHTML=renderLogRowsHtml(rows);
}catch(e){$('logList').innerHTML='<p class="hint">error: '+esc(e)+'</p>'}
}
$('logSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.logLevel=b.dataset.lv;syncLogFilterUi();loadLogs()});
// playground
const PG_FIELDS={assign_task:[['prompt','textarea','Reply with PONG…'],['provider','text','opencode-go'],['modelId','text','gpt-6-luna'],['title','text','playground'],['harness','text','build'],['directories','text',''],['filePaths','text','path1,path2']],providers:[],model:[['provider','text','opencode-go'],['model','text','luna'],['onlyFreeModels','select:false|true','false']],score:[['sessionId','text','ses_…'],['score','number','9']],sessions:[['fromDate','text','YYYY-MM-DDTHH-MM-SS'],['toDate','text',''],['provider','text',''],['modelId','text',''],['harness','text',''],['limit','number','16']]};
function renderPgForm(){const fs=PG_FIELDS[state.pgTool];$('pgForm').innerHTML='<div class="form">'+fs.map(f=>{const[k,t,d]=f;let inp;if(t==='textarea')inp='<textarea id="pg_'+k+'" rows="3" placeholder="'+d+'"></textarea>';else if(t.startsWith('select:')){const opts=t.slice(7).split('|');inp='<select id="pg_'+k+'">'+opts.map(o=>'<option'+(o===d?' selected':'')+'>'+o+'</option>').join('')+'</select>'}else inp='<input id="pg_'+k+'" type="'+t+'" placeholder="'+d+'"/>';return '<label>'+k+'</label>'+inp}).join('')+'</div>'}
$('pgTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.pgTool=b.dataset.tool;document.querySelectorAll('#pgTabs button').forEach(x=>x.classList.toggle('active',x===b));renderPgForm();$('pgOut').textContent='— run a tool to see output —'});
async function pgRun(){const fs=PG_FIELDS[state.pgTool];const body={};for(const[k,t]of fs){const el=$('pg_'+k);let v=el?el.value:'';if(v==='')continue;if(t==='number')v=Number(v);if(v==='true')v=true;if(v==='false')v=false;body[k]=v}
$('pgHint').textContent='running…';$('pgOut').textContent='running '+state.pgTool+'…';
try{const d=await j('/api/playground/'+state.pgTool,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});$('pgOut').textContent=JSON.stringify(d,null,2).slice(0,20000);$('pgHint').textContent='done';clientLog(d&&d.error?'error':'info','playground '+state.pgTool+': '+(d.error||'ok'));if(state.pgTool==='score'&&!d.error)loadTasks()}catch(e){$('pgOut').textContent='error: '+e;$('pgHint').textContent='failed';clientLog('error','playground '+state.pgTool+': '+e)}}
$('pgRun').onclick=pgRun;
// settings tabs
function showSetTab(tab){state.setTab=tab;document.querySelectorAll('#setTabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));['Profile','Appearance','Behaviour','Feedback','About','App'].forEach(name=>{const el=$('setTab'+name);if(el)el.style.display=name.toLowerCase()===tab?'block':'none'})}
$('setTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;showSetTab(b.dataset.tab)});
// settings
async function loadSettingsUI(){try{const [s,st,me]=await Promise.all([j('/api/settings'),j('/api/status'),j('/api/auth/me')]);state.settings=s.settings||s;$('setTheme').value=state.settings.theme;$('setDensity').value=state.settings.density;$('setLogsLevel').value=state.settings.logsLevel||'all';$('setRefresh').value=state.settings.refreshMs;$('setLimit').value=state.settings.sessionsLimit;$('setApiPort').value=(s.ports||st.ports||{}).api??st.ports?.api??'';$('setWebuiPort').value=(s.ports||st.ports||{}).webui??st.ports?.webui??'';$('setBaseUrl').value=st.baseUrl||'';$('setDir').value=st.directory||'';$('setDb').value=st.dbPath||'';if(me.user){$('profUser').value=me.user.username||'';$('profEmail').value=me.user.email||'';syncUserFoot(me,st)}if(state.page==='logs'){state.logLevel=state.settings.logsLevel||'all';syncLogFilterUi()}applyTheme();armTimer()}catch(e){$('setMsg').textContent='load failed: '+e}}
$('setFeedbackSend').onclick=async()=>{const msg=($('setFeedback').value||'').trim();if(!msg){$('setFeedbackMsg').textContent='Enter a message first';return}$('setFeedbackMsg').textContent='sending…';try{await j('/api/logs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({level:'info',message:'feedback: '+msg})});$('setFeedback').value='';$('setFeedbackMsg').textContent='Thanks — logged ✓'}catch(e){$('setFeedbackMsg').textContent='error: '+e}};
$('profLogout').onclick=async()=>{try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});location.href='/login'}catch(e){$('profMsg').textContent='error: '+e}};
$('setSave').onclick=async()=>{const body={theme:$('setTheme').value,density:$('setDensity').value,logsLevel:$('setLogsLevel').value,refreshMs:Number($('setRefresh').value),sessionsLimit:Number($('setLimit').value),apiPort:Number($('setApiPort').value)||undefined,webuiPort:Number($('setWebuiPort').value)||undefined};$('setMsg').textContent='saving…';try{const d=await j('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(d.error){$('setMsg').textContent='error: '+d.error}else{state.settings=d.settings;$('setMsg').textContent='saved ✓';applyTheme();armTimer();clientLog('info','settings saved')}}catch(e){$('setMsg').textContent='error: '+e}};
$('themeBtn').onclick=()=>{const order=['light','dark','dark-plus','dracula','nord','solarized-light','solarized-dark','github-light','github-dark','monokai','tokyo-night'];const cur=document.documentElement.dataset.theme||'light';const next=order[(order.indexOf(cur)+1)%order.length];state.settings.theme=next;applyTheme();fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:next})}).catch(()=>{});try{localStorage.setItem('ocmcp-theme',next)}catch{}};
function armTimer(){if(state.timer)clearInterval(state.timer);const ms=state.settings?.refreshMs||0;if(ms>0)state.timer=setInterval(()=>{if(state.page==='dashboard')loadDashboard();if(state.page==='logs'&&$('logAuto').checked)loadLogs()},ms)}
async function boot(){try{const s=await j('/api/settings');if(s.error==='unauthorized')return;state.settings=s.settings||s;try{const lt=localStorage.getItem('ocmcp-theme');if(lt&&state.settings)state.settings.theme=lt}catch{}}catch{state.settings={theme:'dark-plus',density:'comfortable',refreshMs:15000,sessionsLimit:20,logsLevel:'all'}}applyTheme();showSetTab('profile');renderPgForm();if($('dashLogsMore'))$('dashLogsMore').onclick=()=>goPage('logs','Logs');await loadSettingsUI();routePageFromPath();load();armTimer();j('/api/auth/me').then(me=>{if(me.user){$('profUser').value=me.user.username||'';$('profEmail').value=me.user.email||'';syncUserFoot(me,{ports:{}})}})}
function routePageFromPath(){const seg=(location.pathname||'/').replace(/^\\/+/,'').split('/')[0]||'';const labels={logs:'Logs',tasks:'Tasks',providers:'Providers',skill:'Skill',stats:'Stats',playground:'Playground',settings:'Settings'};if(labels[seg])goPage(seg,labels[seg])}
async function load(){if(state.page==='dashboard')loadDashboard();if(state.page==='tasks')loadTasks();if(state.page==='providers')loadProviders();if(state.page==='skill')loadSkill();if(state.page==='stats')loadStats();if(state.page==='logs')loadLogs();if(state.page==='settings')loadSettingsUI()}
$('refreshBtn').onclick=load;$('taskReload').onclick=loadTasks;$('provReload').onclick=loadProviders;$('logReload').onclick=loadLogs;
$('taskSearch').addEventListener('input',loadTasks);$('provSearch').addEventListener('input',loadProviders);$('logSearch').addEventListener('input',loadLogs);$('taskLimit').addEventListener('change',loadTasks);
$('provSelect').addEventListener('change',async()=>{if($('provSelect').value)await loadProvConfig($('provSelect').value);renderProvDetail()});
$('logClear').onclick=async()=>{await j('/api/logs/clear',{method:'POST'});loadLogs()};
boot();
</script></body></html>`;

const TASK_PAGE = `<!doctype html>
<html lang="en" data-theme="dark-plus"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#252525"/>
<title>task detail • opencodemcp</title>
${WEBUI_FONTS}
<style>${WEBUI_SHARED_CSS}</style></head><body>
<div class="main-col" style="min-height:100vh">
<main>
<div class="topbar"><a class="btn back-btn" href="/" style="width:auto;display:inline-flex">← Back</a><h2 id="title">Task</h2><span class="hint" id="sub">loading…</span></div>
<div class="card"><h4>Request from orchester</h4><div id="req">loading…</div></div>
<div class="card"><h4>Response from MCP</h4><div id="res">loading…</div></div>
</main>
<footer class="site-foot"><a href="https://github.com/armindashti" target="_blank" rel="noopener">GitHub</a><span>Created by Armin Dashti</span></footer>
</div>
<script>
const pad=n=>String(n).padStart(2,'0');
function fmtDT(ts){if(ts==null||ts==='')return '—';const d=new Date(Number(ts));if(isNaN(d.getTime()))return '—';return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds())}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
async function boot(){const q=new URLSearchParams(location.search);const sid=q.get('sessionID')||'';const ts=q.get('ts');if(!sid){document.getElementById('sub').textContent='missing sessionID';return}
try{const s=await fetch('/api/settings',{credentials:'same-origin'}).then(r=>r.status===401?null:r.json());const th=(s?.settings||{}).theme||'dark-plus';const known=['light','dark','dark-plus','dracula','nord','solarized-light','solarized-dark','github-light','github-dark','monokai','tokyo-night'];document.documentElement.dataset.theme=th==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark-plus':'light'):(known.includes(th)?th:'dark-plus')}catch{}
try{const u='/api/task?sessionID='+encodeURIComponent(sid)+(ts?'&ts='+encodeURIComponent(ts):'');const d=await fetch(u,{credentials:'same-origin'}).then(async r=>{if(r.status===401){location.href='/login';return {error:'unauthorized'}}return r.json()});if(d.error){document.getElementById('sub').textContent='error: '+d.error;return}
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
      outcome: deriveOutcome(session, messages, false) ?? null,
      transcript,
      messageCount: messages.length,
    },
    session: compactSession(session),
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function webuiListenHost(): string {
  const host = process.env.WEBUI_HOST?.trim();
  return host && host.length > 0 ? host : "127.0.0.1";
}

const DASHBOARD_SPA_PATHS = new Set([
  "/",
  "/index.html",
  "/logs",
  "/tasks",
  "/providers",
  "/skill",
  "/stats",
  "/playground",
  "/settings",
]);

/** Start the dashboard HTTP server. Resolves when listening; never resolves on close. */
export function startWebui(port: number): Promise<http.Server> {
  ensureDefaultUser();
  pushLog("info", `webui starting on port ${port}`, "boot");
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const p = url.pathname;
      const sessionUser = readSessionUsername(req);
      const authPublic =
        publicAuthPaths().has(p) || (p === "/api/auth/logout" && req.method === "POST");

      if (sessionUser && req.method === "GET" && p === "/login") {
        res.writeHead(302, { Location: "/" });
        res.end();
        return;
      }
      if (!sessionUser && !authPublic) {
        if (p.startsWith("/api/")) {
          json(res, 401, { error: "unauthorized", login: "/login" });
          return;
        }
        res.writeHead(302, { Location: "/login" });
        res.end();
        return;
      }

      if (req.method === "GET" && p === "/login") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(LOGIN_PAGE);
        return;
      }
      if (p === "/api/auth/login" && req.method === "POST") {
        const body = await readBody(req);
        const result = authLogin(String(body.username ?? ""), String(body.password ?? ""));
        if (!result) {
          json(res, 401, { error: "Invalid username or password" });
          return;
        }
        pushLog("info", `user ${result.username} signed in`, "auth");
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": sessionCookieHeader(result.token),
        });
        res.end(JSON.stringify({ ok: true, user: { username: result.username, email: result.email } }));
        return;
      }
      if (p === "/api/auth/logout" && req.method === "POST") {
        const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
        authLogout(token);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": clearSessionCookieHeader(),
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (p === "/api/auth/me" && req.method === "GET") {
        const name = readSessionUsername(req);
        if (!name) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        const profile = getUserByUsername(name);
        if (!profile) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        json(res, 200, { user: { username: profile.username, email: profile.email } });
        return;
      }

      if (req.method === "GET" && DASHBOARD_SPA_PATHS.has(p)) {
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
        const providers = PROVIDERS.map((pr) => ({
          ...pr,
          inputFields: providerInputFields(pr),
        }));
        json(res, 200, { count: providers.length, providers });
        return;
      }
      const provConfigMatch = /^\/api\/providers\/([^/]+)\/config$/.exec(p);
      if (provConfigMatch && req.method === "GET") {
        const id = decodeURIComponent(provConfigMatch[1]!);
        const prov = PROVIDERS.find((pr) => pr.id === id);
        if (!prov) {
          json(res, 404, { error: `unknown provider ${id}` });
          return;
        }
        const keyRow = getApiKey(id);
        const baseUrl = getSetting(`provider.${id}.baseUrl`) ?? "";
        json(res, 200, {
          provider: id,
          hasKey: Boolean(keyRow),
          baseUrl,
          envKey: prov.envKey,
          updatedAt: keyRow?.updatedAt ?? null,
        });
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
        const file = hit;
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
        const baseUrl = String(body.baseUrl ?? "").trim();
        if (!provider) {
          json(res, 400, { error: "provider is required" });
          return;
        }
        if (!key && !baseUrl) {
          json(res, 400, { error: "key or baseUrl is required" });
          return;
        }
        const prov = PROVIDERS.find((pr) => pr.id === provider);
        const label = prov?.label ?? provider;
        const envKey = prov?.envKey ?? (key ? "custom" : prov?.envAliases?.[0] ?? "custom");
        if (key) {
          upsertApiKey(provider, label, envKey);
        }
        if (baseUrl) {
          setSetting(`provider.${provider}.baseUrl`, baseUrl);
        }
        pushLog("info", `Provider config saved for ${provider}`, "api");
        json(res, 200, { ok: true, provider, savedKey: Boolean(key), savedBaseUrl: Boolean(baseUrl) });
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
          if (tool === "providers") {
            pushLog("info", "playground providers", "playground");
            json(res, 200, { provider: PROVIDERS.map((p) => p.id) });
            return;
          }
          if (tool === "model") {
            const rows = await listModelEntries(oc, cfg.scoresFile, {
              provider: body.provider ? String(body.provider) : null,
              model: body.model ? String(body.model) : null,
              onlyFreeModels: body.onlyFreeModels === true,
            });
            pushLog("info", `playground model → ${rows.length} matched`, "playground");
            json(res, 200, { model: rows });
            return;
          }
          if (tool === "sessions") {
            const limit = Math.min(200, Math.max(1, Number(body.limit ?? 16) || 16));
            const fetchN = Math.min(200, Math.max(limit * 4, 64));
            const list = await oc.listSessions({ limit: fetchN, order: "desc" });
            const sessionId = filterSessionIds(list.data ?? [], {
              fromDate: body.fromDate ? String(body.fromDate) : null,
              toDate: body.toDate ? String(body.toDate) : null,
              provider: body.provider ? String(body.provider) : null,
              modelId: body.modelId ? String(body.modelId) : null,
              harness: body.harness ? String(body.harness) : null,
              limit,
            });
            pushLog("info", `playground sessions → ${sessionId.length}`, "playground");
            json(res, 200, { sessionId });
            return;
          }
          if (tool === "score") {
            const sessionId = String(body.sessionId ?? "").trim();
            const score = Number(body.score);
            if (!sessionId || !Number.isFinite(score) || score < 0 || score > 10) {
              json(res, 400, { error: "sessionId and score (0-10) are required" });
              return;
            }
            try {
              const session = await oc.session(sessionId);
              const orchester = (session?.agent ?? "unknown").toString();
              const modelRaw = session?.model
                ? `${session.model.providerID}/${session.model.id}`
                : undefined;
              recordScore(cfg.scoresFile, {
                orchester,
                agent: orchester,
                score: score * 10,
                sessionID: sessionId,
                provider: session?.model?.providerID,
                model: modelRaw,
                task: session?.title ?? undefined,
              });
              json(res, 200, { result: "success" });
            } catch {
              json(res, 200, { result: "fail" });
            }
            return;
          }
          if (tool === "assign_task") {
            if (!body.prompt || !String(body.prompt).trim()) {
              json(res, 400, { error: "prompt is required" });
              return;
            }
            const directory = resolveDirectory(body.directories, cfg.directory);
            const harness = body.harness?.toString().trim() || undefined;
            const provider = body.provider?.toString().trim() || undefined;
            const modelId = body.modelId?.toString().trim() || undefined;
            let model: { providerID: string; id: string } | undefined;
            if (provider && modelId) {
              const bare = modelId.startsWith(provider + "/") ? modelId.slice(provider.length + 1) : modelId;
              model = { providerID: provider, id: bare };
            }
            const filePaths = body.filePaths
              ? String(body.filePaths)
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
            const session = await oc.createSession({
              title: body.title,
              agent: harness,
              model,
              directory,
            });
            const sessionId = session.id;
            const inbox = await oc.prompt(sessionId, {
              text: String(body.prompt),
              files: filePaths.map((uri) => ({ uri })),
              delivery: "steer",
            });
            const promptAt: number = inbox?.time?.created ?? Date.now();
            const wait = await waitForIdle(oc, sessionId, promptAt, {
              timeoutMs: 120_000,
              directory,
            });
            if (wait.status !== "completed") {
              json(res, 502, { error: `run ended with status ${wait.status}` });
              return;
            }
            const messages = (await oc.messages(sessionId, { order: "asc", limit: 200 })).data ?? [];
            let finishedMs = promptAt;
            for (const m of messages) {
              if (m?.type === "assistant" && (m?.time?.created ?? 0) >= promptAt && m?.time?.completed) {
                finishedMs = Math.max(finishedMs, m.time.completed);
              }
            }
            pushLog("info", `playground assign_task → ${sessionId}`, "playground");
            json(res, 200, {
              sessionId,
              response: collectReply(messages, promptAt),
              duration: wait.elapsedMs,
              startedAt: formatCompactTimestamp(promptAt),
              finishedAt: formatCompactTimestamp(finishedMs),
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
    server.listen(port, webuiListenHost(), () => resolve(server));
  });
}
