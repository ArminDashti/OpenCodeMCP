/** Shared dashboard HTML shell: fonts, theme tokens, layout (Yoda Admin–aligned). */

export const WEBUI_FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>`;

export const WEBUI_THEME_COLOR = `<meta name="theme-color" content="#252525"/>`;

export const WEBUI_CSS = `
:root{
  --bg:#f8fafc;--panel:#ffffff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;
  --accent:#2563eb;--ok:#15803d;--warn:#b45309;--bad:#b42318;--chip:#f1f5f9;
  --radius:8px;--switch-off:#cbd5e1;--switch-on:#34c759;
}
[data-theme="dark"]{--bg:#0b1220;--panel:#111c33;--ink:#e2e8f0;--muted:#94a3b8;--line:#243355;--accent:#60a5fa;--chip:#1a2742;--switch-off:#39393d}
[data-theme="dark-plus"]{
  --bg:#1e1e1e;--panel:#252525;--ink:#e0e0e0;--muted:#9d9d9d;--line:#333333;
  --accent:#2563eb;--chip:#2d2d30;--switch-off:#39393d;
}
[data-theme="dracula"]{--bg:#282a36;--panel:#343746;--ink:#f8f8f2;--muted:#9a9cb3;--line:#44475a;--accent:#bd93f9;--chip:#44475a;--switch-off:#39393d}
[data-theme="nord"]{--bg:#2e3440;--panel:#3b4252;--ink:#eceff4;--muted:#9aa3b2;--line:#4c566a;--accent:#88c0d0;--chip:#434c5e;--switch-off:#39393d}
[data-theme="solarized-light"]{--bg:#fdf6e3;--panel:#eee8d5;--ink:#586e75;--muted:#839496;--line:#d3c69f;--accent:#268bd2;--chip:#e7dfc8}
[data-theme="solarized-dark"]{--bg:#002b36;--panel:#073642;--ink:#eee8d5;--muted:#93a1a1;--line:#174652;--accent:#2aa198;--chip:#0e4a57;--switch-off:#39393d}
[data-theme="github-light"]{--bg:#ffffff;--panel:#f6f8fa;--ink:#1f2328;--muted:#59636e;--line:#d1d9e0;--accent:#0969da;--chip:#eaeef2}
[data-theme="github-dark"]{--bg:#0d1117;--panel:#161b22;--ink:#e6edf3;--muted:#9198a1;--line:#30363d;--accent:#4493f8;--chip:#21262d;--switch-off:#39393d}
[data-theme="monokai"]{--bg:#272822;--panel:#3e3d32;--ink:#f8f8f2;--muted:#bebda8;--line:#49483e;--accent:#a6e22e;--chip:#49483e;--switch-off:#39393d}
[data-theme="tokyo-night"]{--bg:#1a1b26;--panel:#24283b;--ink:#c0caf5;--muted:#7f87a8;--line:#343b5c;--accent:#7aa2f7;--chip:#2b3049;--switch-off:#39393d}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,"Segoe UI",Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
a{color:var(--accent)}
.app{display:grid;grid-template-columns:240px 1fr;min-height:100vh;transition:grid-template-columns .2s ease}
.app.collapsed{grid-template-columns:72px 1fr}
aside{background:var(--panel);border-right:1px solid var(--line);padding:12px 10px;display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh;overflow:hidden}
.side-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}
.side-toggle{flex-shrink:0;width:36px;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.side-toggle:hover{background:var(--chip)}
.side-toggle svg{width:18px;height:18px}
.brand{flex:1;min-width:0;font-weight:800;font-size:16px;letter-spacing:.2px;padding:4px 2px}
.brand small{display:block;font-weight:500;color:var(--muted);font-size:11px;margin-top:2px}
.app.collapsed .brand-text,.app.collapsed .nav-label,.app.collapsed .side-user-name,.app.collapsed .side-meta{display:none}
.nav{display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;overflow-y:auto}
.nav button{display:flex;width:100%;text-align:left;gap:10px;align-items:center;padding:9px 10px;border:1px solid transparent;background:transparent;color:var(--muted);border-radius:8px;cursor:pointer;font-size:13px;font-weight:500}
.nav button .nav-ico{width:18px;height:18px;flex-shrink:0;opacity:.85}
.nav button.active{color:var(--ink);background:var(--bg);font-weight:600}
.nav button:hover{color:var(--ink);background:var(--bg)}
.app.collapsed .nav button{justify-content:center;padding:9px}
.back-btn{display:flex;width:100%;text-align:left;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:6px}
.back-btn:hover{background:var(--bg)}
.side-user{display:flex;align-items:center;gap:6px;padding:8px 4px;border-top:1px solid var(--line);margin-top:4px}
.side-user-main{flex:1;min-width:0;display:flex;align-items:center;gap:10px;border:none;background:transparent;color:var(--ink);cursor:pointer;padding:6px;border-radius:8px;text-align:left}
.side-user-main:hover{background:var(--bg)}
.side-avatar{width:32px;height:32px;border-radius:50%;background:var(--bg);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
.side-user-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-user-gear{width:36px;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0}
.side-user-gear:hover{color:var(--ink);background:var(--chip)}
.side-meta{color:var(--muted);font-size:11px;padding:4px 8px 2px}
.main-col{display:flex;flex-direction:column;min-height:100vh;min-width:0}
main{padding:20px 28px 12px;flex:1;max-width:none;width:100%;min-width:0}
.topbar{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.topbar h2{margin:0;font-size:20px;font-weight:700}
.dot{width:9px;height:9px;border-radius:50%;background:#999;display:inline-block}
.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}
.spacer{flex:1}
input,select,textarea{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
button.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:13px;font-weight:500;font-family:inherit}
button.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
button.btn:hover{filter:brightness(.97)}
button.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px}
.card h3,.card h4{margin:0 0 8px}
.card h4{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.card .v{font-size:22px;font-weight:800}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:900px){
  .app,.app.collapsed{grid-template-columns:1fr}
  aside{position:static;height:auto;max-height:none}
  .grid2{grid-template-columns:1fr}
  main{padding:14px}
}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:var(--bg);font-weight:600}
tr:hover td{background:rgba(127,127,127,.06);cursor:pointer}
body[data-density="compact"] th,body[data-density="compact"] td{padding:4px 8px;font-size:12px}
code,pre{background:var(--chip);padding:2px 6px;border-radius:6px;font-family:ui-monospace,Consolas,monospace}
pre{padding:12px;overflow:auto;font-size:12px;max-height:420px}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--chip)}
.badge.hi{background:#dcfce7;color:#166534}[data-theme="dark-plus"] .badge.hi,[data-theme="dark"] .badge.hi{background:#14532d;color:#bbf7d0}
.badge.mid{background:#fef9c3;color:#854d0e}[data-theme="dark-plus"] .badge.mid,[data-theme="dark"] .badge.mid{background:#713f12;color:#fef9c3}
.badge.lo{background:#fee2e2;color:#991b1b}[data-theme="dark-plus"] .badge.lo,[data-theme="dark"] .badge.lo{background:#7f1d1d;color:#fecaca}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}
.page{display:none;animation:hx-rise .25s ease}
.page.active{display:block}
@keyframes hx-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.page.active{animation:none}}
.logrow{display:grid;grid-template-columns:170px 70px 150px 1fr;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line);font-size:12.5px;align-items:baseline}
.logrow .lv{font-weight:800}.lv.info{color:var(--accent)}.lv.warn{color:var(--warn)}.lv.error{color:var(--bad)}
.seg{display:flex;gap:6px;flex-wrap:wrap}
.seg button{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:12px}
.seg button.active{background:var(--ink);color:var(--bg);font-weight:700}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.tabs button{padding:7px 13px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font-size:13px}
.tabs button.active{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:600}
.form{display:grid;grid-template-columns:180px 1fr;gap:8px 12px;align-items:center;margin:10px 0}
.form label{color:var(--muted);font-size:13px}
.hint{color:var(--muted);font-size:12px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease;z-index:100}
.modal.open{opacity:1;visibility:visible}
.modal .box{background:var(--panel);border:1px solid var(--line);border-radius:12px;max-width:760px;width:100%;padding:18px;max-height:86vh;overflow:auto;transform:scale(.98);transition:transform .2s ease}
.modal.open .box{transform:scale(1)}
.kv{display:grid;grid-template-columns:170px 1fr;gap:6px 10px;font-size:13px;margin:8px 0}
.kv dt{color:var(--muted)}.kv dd{margin:0}
.prov-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px;display:flex;flex-direction:column;gap:8px}
.prov-card .logo-row{display:flex;align-items:center;gap:10px}
.prov-card .logo-row img{width:28px;height:28px}
.prov-card h4{margin:0;font-size:15px}
.prov-card .actions{display:flex;gap:6px;margin-top:4px}
.key-input{width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.field-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;padding:2px 7px;border-radius:999px;margin-left:6px}
.field-tag.req{background:#fee2e2;color:#991b1b}[data-theme="dark-plus"] .field-tag.req{background:#7f1d1d;color:#fecaca}
.field-tag.opt{background:var(--chip);color:var(--muted)}
.prov-detail-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:12px}
.prov-detail-head img{width:36px;height:36px}
.site-foot{margin-top:24px;padding:14px 0;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;font-size:12px;color:var(--muted)}
.site-foot a{color:var(--accent);text-decoration:none;font-weight:500}
.site-foot a:hover{text-decoration:underline}
.settings-shell{display:grid;grid-template-columns:minmax(140px,180px) 1fr;gap:24px;align-items:start}
@media(max-width:720px){.settings-shell{grid-template-columns:1fr}}
.settings-nav{display:flex;flex-direction:column;gap:2px}
.settings-nav button{display:block;width:100%;text-align:left;padding:8px 12px;border:none;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-size:13px;font-weight:500}
.settings-nav button.active{background:var(--bg);color:var(--ink);font-weight:600}
.settings-nav button:hover{color:var(--ink);background:var(--bg)}
.settings-panel{max-width:48rem}
.settings-panel h1{margin:0 0 6px;font-size:22px;font-weight:700}
.settings-lead{margin:0 0 20px;color:var(--muted);font-size:13px}
.settings-section{margin-bottom:20px}
.settings-section h2{margin:0 0 8px;font-size:13px;font-weight:600}
.settings-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.settings-row{display:grid;grid-template-columns:1fr auto;gap:12px 16px;padding:14px 16px;border-bottom:1px solid var(--line);align-items:center}
.settings-row:last-child{border-bottom:none}
.settings-row__text{min-width:0}
.settings-row__title{margin:0;font-size:13px;font-weight:500}
.settings-row__desc{margin:4px 0 0;font-size:12px;color:var(--muted)}
.settings-row__control{justify-self:end;min-width:140px}
.settings-row__control select,.settings-row__control input{width:100%;min-width:140px}
.settings-row--stack{grid-template-columns:1fr}
.settings-row--stack .settings-row__control{justify-self:stretch;min-width:0}
.settings-footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--line);background:var(--bg)}
.login-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.login-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:28px 26px;width:100%;max-width:400px}
.login-card h1{margin:0 0 6px;font-size:22px}
.login-card .sub{margin:0 0 22px;color:var(--muted);font-size:13px}
.login-card label{display:block;font-size:13px;color:var(--muted);margin:12px 0 6px}
.login-card input{width:100%;padding:10px 12px}
.login-card button[type=submit]{width:100%;margin-top:18px;padding:11px}
.login-brand{font-weight:800;font-size:12px;color:var(--muted);letter-spacing:.3px;text-transform:uppercase;margin-bottom:8px}
.login-err{color:var(--bad);font-size:13px;margin-top:12px;min-height:18px}
`;

/** Inline nav icons (stroke, currentColor). */
export const NAV_ICONS: Record<string, string> = {
  dashboard: `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  tasks: `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></svg>`,
  providers: `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  skill: `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M10 13h4M10 17h4"/></svg>`,
  stats: `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>`,
  logs: `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h10M4 18h10"/></svg>`,
  playground: `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 3h6l3 7-6 11-6-11 3-7z"/><path d="M6 10h12"/></svg>`,
};
