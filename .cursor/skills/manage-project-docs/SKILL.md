---
name: manage-project-docs
description: >-
  Write, edit, and maintain lean project documents under .documents/
  (directory tree, WebUI pages list, REST API endpoint list, general/feature
  docs and README claims, facts, timeline) matched to the codebase. Use when
  the user asks to update, refresh, or keep docs in sync with the codebase;
  when routes, pages, endpoints, or folder layout changed and docs must match;
  when the user names dirs.md / dir-tree, pages list, endpoint list, or
  general app docs; or when recording an important project fact, decision, or
  timeline entry. Prefer short factual updates; skip or ignore huge documents
  and never dump large trees into chat.
disable-model-invocation: false
metadata:
  version: 2.0.0
  author: "Armin Dashti"
  category: documentation
  tags: [docs, documents, dir-tree, webui-pages, api-endpoints, timeline, keep-up-to-date]
  last_updated: "2026-10-09 17:35:27"
  uuid: 6098ee85-1a84-4030-8911-c94ea1a90454
---

# Manage project docs

## When to use

- Update, refresh, or create project docs so they match the codebase
- Agent changed routes, pages, endpoints, or folder layout and docs must match
- User names dir-tree, pages list, endpoint list, or general app/docs markdown
- Record an important project fact, decision, or timeline entry (changelog/timeline)
- **Not** for chat completion reports, personal knowledge bases, or rewriting unrelated prose for style alone; does not invent features that are not in code
- Merges former: `keep-document-up-to-date` (itself from `doc-dir-tree-keep-up-to-date`, `doc-keep-up-to-date`, `doc-keep-up-to-date-webui-pages-list`, `doc-restful-api-keep-up-to-date-endpoint-list`), `sync-documentation`, `update-project-timeline`

## Storage (required)

All project docs this skill writes or maintains live under **`.documents/`** at the project root.

- Create `.documents/` if missing
- Prefer updating files already in `.documents/`
- If an older doc exists elsewhere (`docs/`, root inventories, `.armin/`), migrate or mirror the maintained copy into `.documents/` and keep that path going forward
- Do not scatter new inventories outside `.documents/` unless the user names another path

Typical files:

| Mode | Path |
|------|------|
| dir-tree | `.documents/dirs.md` |
| webui-pages | `.documents/pages.md` |
| api-endpoints | `.documents/endpoints.md` |
| general / facts | `.documents/notes.md` or a short topic file under `.documents/` |
| timeline | `.documents/timeline.md` |

## Goals

1. Keep docs factual and short — important points only
2. Codebase is source of truth over stale docs
3. Token-efficient: compact tables/trees; never paste huge docs into the chat
4. Ignore or skim huge documents — extract only the claims you must verify or update

## Modes (run only what is needed)

| Signal | Mode |
|--------|------|
| Directory tree / `dirs.md` / folder layout | **dir-tree** |
| WebUI pages / routes list | **webui-pages** |
| REST / API endpoint list | **api-endpoints** |
| Feature / general app facts / README | **general** |
| Changelog / timeline / "what changed when" | **timeline** |
| "Keep docs up to date" with no subtype | Infer from recent code changes; ask once if unclear |

Several modes can run in one pass when the user asked for all.

## Workflow

### 1. Resolve target files

1. Prefer paths the user named (still place new files under `.documents/` when possible)
2. Else use the typical `.documents/` paths above
3. Create `.documents/` and a **lean** file only if missing and needed

### 2. Gather ground truth (bounded)

| Mode | Source |
|------|--------|
| dir-tree | Real folders; exclude `.git`, `node_modules`, `bin`, `obj`, `.cursor`, `.documents` noise if huge, build/vendor |
| webui-pages | Routers, page components, route tables |
| api-endpoints | Route registrations, controllers, OpenAPI/Swagger if present |
| general | Changed modules + existing doc claims — verify each claim in code |
| timeline | Completed work this session / user-stated milestones — dated bullets only |

If a doc file is huge: **do not read it whole**. Search or read only the section you will edit; leave the rest untouched.

### 3. Write or edit

- Write under `.documents/` only (unless user overrides)
- Prefer tables, bullet facts, and compact trees over essays
- Add missing entries; remove or mark entries that no longer exist
- Keep existing section order and tone when a layout already exists
- Timeline: one dated line per meaningful event (what + why), no narrative padding
- **Never invent** folders, pages, endpoints, or facts not grounded in code or the user

### 4. Confirm (short)

```text
Docs updated:
- Mode(s): <dir-tree | webui-pages | api-endpoints | general | timeline>
- Files: <.documents/...>
- Summary: <added / removed / corrected — one line>
```

## Token & size rules

1. **Always** write important points and facts; skip filler and duplication
2. **Always** summarize in chat; put detail in the file under `.documents/`
3. **Never** dump huge generated trees or full large docs into the chat
4. **Never** expand a doc into a long essay when a table or short list suffices
5. **Ignore** huge unrelated documents — do not load or rewrite them
6. Cap dir-trees at meaningful project structure depth; collapse generated/vendor subtrees

## Safety

1. Codebase wins over stale docs
2. Forward slashes in paths in docs and confirmations
3. Never delete an entire doc file unless the user explicitly asks
4. Never store secrets, tokens, or credentials in docs
5. Exclude build/vendor/agent noise folders from dir trees unless the user asks to include them

## Examples

**Example 1:** API endpoints after route change

- Input: "Update the endpoint list doc"
- Flow: find endpoints markdown → scan Gin/Django/etc. routes → sync table → confirm

**Example 2:** WebUI pages list

- Input: "Keep the pages list up to date"
- Flow: read router → update pages inventory → drop removed routes

**Example 3:** Dir tree

- Input: "Refresh dirs.md"
- Flow: walk project tree with exclusions → rewrite compact tree → confirm path
