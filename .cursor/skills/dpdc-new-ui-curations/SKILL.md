---
name: dpdc-new-ui-curations
description: >-
  Extends the project Pakhsh360 (DPDC) UI design book with portable pattern
  rules and optional figures — no live page URL or screenshot capture required.
  Use when the human invokes /dpdc-new-ui-curations (or former
  /add-armin-preferences-for-pakhsh360, /apply-dpdc-preferences), or asks to
  add, update, or apply Armin/DPDC UI preferences or the Pakhsh360 UI standard
  (report filters, grids/kartabl, forms/popups) under ./.armin/preferences/.
  Merges former add-armin-preferences-for-pakhsh360 and apply-dpdc-preferences.
disable-model-invocation: false
metadata:
  version: 3.0.0
  author: "Armin Dashti"
  category: webui
  tags: [dpdc, pakhsh360, preferences, design-book, standard, patterns, figures]
  last_updated: "2026-10-09 17:24:57"
  uuid: d0d3061b-69e3-4ccf-86df-1a4baabaddf4
---

# DPDC New UI Curations

## When

- Human invokes `/dpdc-new-ui-curations` (former: `/add-armin-preferences-for-pakhsh360`, `/apply-dpdc-preferences`) or asks to add or update the Pakhsh360 UI standard
- Input: pattern description (required); chapter or archetype hint; optional figure file or generic illustration
- Output: updated chapter under `./.armin/preferences/descriptions/` + optional figure + row in `book/04-figures.md`
- Exclusions: not functional testing; not redesign of a target page; not a substitute for `pakhsh360-evaluate-design-ui-ux` on bad pages
- Related: `../pakhsh360-rework-webui-loop/`, `./reference.md`, project `./.armin/preferences/descriptions/best-ui-design-readme.md`

## How

### Step 1: Normalize input

| Input | Use as |
|-------|--------|
| Archetype: filter / report / گزارش | `book/01-report-filters.md` |
| Archetype: grid / kartabl / کارتابل | `book/02-grids-and-kartabl.md` |
| Archetype: form / popup / فرم | `book/03-forms-and-popups.md` |
| Unclear | Ask one question: which archetype? |

Derive:

- `pattern_title` — short heading for the new subsection
- `chapter_file` — target markdown under `./.armin/preferences/descriptions/`
- **Do not** require or store app routes, `.aspx` paths, or `localhost` URLs

Optional: human may attach a screenshot file or describe an illustration. If they name a live page only as *inspiration*, extract **portable layout rules** — do not catalog the page.

### Step 2: Write portable pattern rules

Add or update a subsection in the target chapter using the template in [`reference.md`](./reference.md).

The subsection must:

- State **what** to copy (layout, spacing, grouping, grid behavior)
- State **when** agents apply it (archetype / page type in generic terms)
- State **do not copy** items that are business-specific
- Contain **no URL**, no `Pages/...aspx` path, no “open this page” instruction

### Step 3: Optional figure

Only when the human supplies an image or explicitly asks for an illustration:

1. Save under `./.armin/preferences/screenshots/<subfolder>/` with a **descriptive** filename (e.g. `dense-filter-radio-popup.jpg`), not a page slug.
2. Assign the next figure ID in [04-figures.md](./reference.md) (`F-01-xx`, `F-02-xx`, `F-03-xx`).
3. Embed in the chapter: `![Figure x.y](../figures/...)` plus caption.
4. Append one row to `./.armin/preferences/descriptions/04-figures.md`.

Do not overwrite an existing figure without asking. Do not capture from a live browser unless the human explicitly requests a new screenshot this turn.

### Step 4: Update table of contents if needed

If a new chapter section deserves a TOC mention, add one line to `./.armin/preferences/descriptions/best-ui-design-index.md` only when structure changes (new chapter — rare).

### Step 5: Confirm to human

```text
Armin preference added to design book:
- Pattern: <pattern_title>
- Chapter: ./.armin/preferences/descriptions/<chapter-file>
- Figure: <path or "none">
- Figures index: ./.armin/preferences/descriptions/04-figures.md
- Archetype: <archetype>
```

### Consumption by rework loop

Agents running `pakhsh360-rework-webui-loop` (steps 1–3) must:

1. Read `./.armin/preferences/descriptions/best-ui-design-index.md`
2. Read the chapter for the target archetype under `./.armin/preferences/descriptions/`
3. Use figures optionally; **chapter prose is authoritative**

No live page dependency.

## Always

1. Store all material in the **project** `./.armin/preferences/` tree.
2. Write **portable** rules any agent can apply without opening a reference URL.
3. Keep the book doc-like: numbered sections, tables, figure index.

## Never

1. Add catalog rows that bind a pattern to a specific app page or URL.
2. Put passwords or secrets in the book.
3. Overwrite figures or major chapter sections silently.
4. Require browser login or `screenshot-pages.py` for a normal add.

## Examples

**Example 1 — Text-only pattern**

- Input: “Grid approve buttons must each have their own column”
- Output: new §2.x bullet in `02-grids-and-kartabl.md`, confirmation block, no figure

**Example 2 — Pattern + supplied image**

- Input: archetype grid + attached PNG + “compact filter above kartabl”
- Output: subsection in chapter 2, figure `F-02-04`, row in `04-figures.md`

**Example 3 — Human names a page as inspiration only**

- Input: “Like the warehouse kartabl layout but as a general rule”
- Output: generic kartabl rules in chapter 2; **no** URL or page name in the book

**Example 4 — Extend report filters**

- Input: “Purpose-colored sections for Taraz-style reports”
- Output: §1.2 updated or cross-referenced in `01-report-filters.md`
