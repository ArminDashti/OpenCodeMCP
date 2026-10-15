---
description: 
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  tags: []
  last_updated: "2026-10-08 22:11:19"
  uuid: 6968f558-ce1b-40ea-a380-80e29ac20354
---
﻿---
description: 
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 12:50:20"
  uuid: 86d7a9da-279b-4d03-a6b1-70c4e7721ee6
---
name: dpdc-modernize-ui-pages
description: Executes a loop (gather > eval > redesign > verify) to modernize legacy .aspx UI. Strictly token-efficient.
disable-model-invocation: false
metadata:
  version: "1.1.0"
  author: Armin Dashti
  category: webui
  tags: [pakhsh360, modernize, redesign, ui-verify, token-optimized]
  last_updated: "2026-09-09 09:30:00"
  uuid: 822ea516-37bb-4028-a68f-d3870b33fdd7
---

# Pakhsh360 UI Modernization Loop

## ⚡ AGENT OUTPUT RULES (STRICT TOKEN EFFICIENCY)
- **Zero Filler:** No pleasantries, no conversational transitions, no meta-commentary.
- **Code Edits:** Use precise Search/Replace blocks or diffs. NEVER echo full unmodified files.
- **Reporting:** Use terse bullet lists or minimal JSON. Drop articles (a, an, the).
- **Verification:** Read file diffs to confirm edits. Do not trust your own "DONE" tags.

## 🎯 SCOPE & CONSTRAINTS
- **Targets:** `.aspx`, `.css`, `.js`.
- **Banned (unless explicitly requested):** `.vb` (code-behind), user's personal browser (use IDE/Playwright only), functional/CRUD bug fixing, whole-app redesigns when scoped to a single page.
- **Strict Rules:** Never invent fixes/findings without chapter evidence. Never overwrite figures without asking. Never store live URLs/secrets in reports. 

## 📂 SOURCES
- `PREFS`: `./.cursor/skills/pakhsh360-add-ui-preference/preferences/descriptions/` (Notes, indexes) & `screenshots/` (Figures).
- `STANDARDS`: `./webpageui-standard.md` & `AGENTS.md` (Learned Preferences).
- *Dense-filter default:* Purpose-tinted `.filter-section` (Taraz-style) unless overridden.

## 🔄 WORKFLOW MODES

### 1. FULL (Default for "rework/modernize page")
`gather` → `evaluate` → `redesign` → `ui-verify`. (If fails verify, `redesign` x1 more, then report limits).

### 2. GATHER (Select or Capture)
- **Select:** Read `best-ui-design-index.md` > pick chapter > list figures > write sample package (`./reference.md`).
- **Capture:** Open *good* page in IDE browser > extract *portable* rules (no hardcoded IDs/URLs) > update chapter > write sample package. 

### 3. EVALUATE (vs PREFS)
- Open *target* page (snapshot/screenshot).
- Compare to `PREFS` must-apply rules.
- Log chapter violations as **Problems**; soft polish as **Optional**.
- **Score:** 0–10 (10 = perfect; -1 per Problem).
- Update preference writers if new lasting patterns are learned.

### 4. EVALUATE-GLOBAL (No sample needed)
Render targets and check global checklist (Any fail = Finding):
- **Layout:** Clear context, content on calm surfaces. Consistent section radius/rhythm.
- **Forms:** Inline label+control, visible labels, field width fits content, required markers.
- **Actions:** Primary/secondary/destructive distinct, grouped with relevant content.
- **Tables:** Distinct header, center-aligned cells, NO horizontal scroll, clear row actions.
- **A11y/UI:** High contrast, clear focus, no overlap, status relies on more than color alone.

### 5. REDESIGN
- **Goal:** Fix **Problems** first. ASPX/CSS/JS only.
- **Layout:** Match spacing, sections, grids to `PREFS`. Use shared tokens over one-offs.
- **Forms:** Label + Control on SAME line. Modify input `Width`, *not* label, for alignment.
- **Data Grids:** 
  - Center cells, no horizontal scroll.
  - Black button text in cells, separate action columns.
  - Single-line limits for: IRC, GTIN, تاریخ (Date).
  - Product-name: Max 2 lines.
  - Cell font: 1 step smaller.
- *Verify briefly in IDE browser.* Track via DONE/BLOCKED.

### 6. IMPLEMENT
- Apply approved fix list / `chosen_alternative` to `open_target`. Prompt user once if multiple alternatives exist and none is chosen. Visual/CSS layout fixes only.

### 7. UI-VERIFY
- Re-run `evaluate` format post-edit. **Gate Pass:** Problems == 0.