---
name: about-me
description: >-

disable-model-invocation: false
metadata:
  version: "1.0.0"
  author: Armin Dashti
  category: webui
  tags: []
  last_updated: "2026-08-16 17:56:00"
  uuid: e6bb1623-a3da-4a92-9b56-1a700ec34c71
---

# About Me Section

## When to use

- Creating or editing an **About Me** / **About** page in any app WebUI
- User asks for About Me copy, bio section, or personal intro for Armin Dashti
- Related: WebUI create/rework skills; `C:/Users/armin/.cursor/plugins/local/webui-by-armin/skills/webui-heavy-cache-pwa/` when scaffolding a full WebUI
- Exclusions: do not invent a different identity; do not put plaintext crawlable email in HTML source; do not skip the closing quotes

## Objective

1. Ship an About Me page that matches the helix-webui content, tone, and structure
2. Keep privacy intact (obfuscated contact, no sensitive personal data)
3. Credit Cursor AI agents as authors; present Armin as vibe coder and reviewer
4. End with the English Anonymous quote and its Persian translation, verbatim

## Workflow

### Step 1: Place the page

- Route: `/about-me` (or project-equivalent About Me path)
- Nav label: `About Me`
- Page title: `About Me`
- Tagline under title: `Armin Dashti — vibe coder, conductor of craft.`

### Step 2: Layout (match helix)

| Block | Content |
|-------|---------|
| Header | Title + tagline |
| Portrait + bio | Photo left (or top on mobile); 3 bio paragraphs right |
| Interests | Section titled `Interests` with hobby sentence |
| Contact | Obfuscated email link (Step 4) |
| Quotes | English blockquote, then Persian RTL blockquote |

- Portrait source in this skill: `standards/about-armin/armin.png` (copy into the app as `public/about-me/armin.png`, served as `/about-me/armin.png`)
- If missing in the app, show a short placeholder: `Photo placeholder — add public/about-me/armin.png`
- Prefer a readable max-width column (helix uses ~`max-w-3xl`); keep spacing calm and uncluttered

### Step 3: Write the bio (eloquent, unique)

Use beautiful, unique, eloquent prose — not generic marketing filler. Keep these three ideas, in this order:

1. **Identity + vibe coder** — Armin Dashti is a software engineer and vibe coder; he shapes intent with clarity and constraint, then lets Cursor’s agents compose the implementation; he reviews, refines, and ships what remains worthy.
2. **Cursor authorship** — This application was written by AI agents—specifically Cursor—guided by Armin’s intent, then tempered by his review until fit to ship.
3. **Craft + stacks** — Practical API and WebUI products; prefer Golang services, Vue-based front ends, and PostgreSQL when stating defaults (adapt only if this app’s real stack differs, but keep the “substance over spectacle” close). He watches carefully, plans deliberately, and ships when ready.

Do not paste corporate resume bullets. Prefer flowing sentences like helix.

### Step 4: Contact email (anti-crawl)

- Real address: `arminonline71@gmail.com`
- **Never** put the full address as a contiguous string in static HTML/JSX/Vue template source if avoidable
- Compose at runtime from parts (`user`, `at`, `domain`, `dot`, `tld`)
- Visible label: `arminonline71 [at] gmail [dot] com`
- `mailto:` href built in `useEffect` / `onMounted` (or equivalent) from those parts
- Prefix label: `Contact:`

### Step 5: Interests

- Heading: `Interests`
- Sentence form (adapt wording lightly, keep the list): cars, movies, vibe coding, coding, politics, military, jet fighters, aircraft

### Step 6: Closing quotes (verbatim)

English (LTR):

> "Beware the quiet man. For while others speak, he watches. While others act, he plans. And when they finally rest, he strikes." — Anonymous

Persian (RTL, `dir="rtl"` `lang="fa"`):

> «از مرد خاموش برحذر باش. زیرا در حالی که دیگران سخن می‌گویند، او نظاره می‌کند. در حالی که دیگران عمل می‌کنند، او برنامه می‌ریزد. و هنگامی که سرانجام آرام می‌گیرند، او ضربه می‌زند.» — ناشناس

### Step 7: Done check

- [ ] Title, tagline, portrait slot, three bio beats, Interests, obfuscated Contact, both quotes
- [ ] Prose is eloquent and unique; privacy preserved
- [ ] Matches helix structure unless the host app’s design system forces equivalent components

## Safety rules

1. **Always** use name **Armin Dashti** and the vibe-coder / Cursor-authorship framing.
2. **Always** include both closing quotes exactly (English + Persian).
3. **Always** obfuscate the email in source; build `mailto:` at runtime.
4. **Always** prefer eloquent, unique prose over template filler.
5. **Never** invent private details (address, phone, employer secrets, family).
6. **Never** expose a contiguous plaintext `arminonline71@gmail.com` in static markup when the split-parts pattern is available.
7. **Never** omit Interests or the portrait slot (placeholder is OK if the image file is missing).
8. **Never** replace the Anonymous quotes with a different closer.

## Examples

**Example 1:** New About Me in a Vue WebUI

- Input: "Add an About Me page"
- Output: `/about-me` route + page with helix structure: tagline, photo/`public/about-me/armin.png`, three bio paragraphs, Interests, runtime-assembled Contact, English + Persian quotes

**Example 2:** Refresh copy on an existing About page

- Input: "Make About Me match our standard"
- Output: Rewrite to the three bio beats + Interests + obfuscated email + dual quotes; keep host layout tokens but preserve content order

**Example 3:** Reference check

- Input: "What should About Me say?"
- Output: Point to helix `AboutMePage.jsx` and this skill’s required blocks; do not invent a different bio
