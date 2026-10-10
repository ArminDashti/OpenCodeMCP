# Code Removal (Dead / Orphan Only)

## When to use

- User asks to remove unused, dead, unreachable, or orphaned code
- User asks to clean unused imports or delete files/modules with zero references
- User asks for unused-file / file-tree cleanup only
- Scope: remove only code that is **provably** dead or orphaned
- Exclusions: do not remove code that is still connected — refuse and explain references

## Modes

| Mode | Trigger | Focus |
| ---- | ------- | ----- |
| Symbol / block | Unused helpers, classes, imports, unreachable blocks | In-file and cross-file dead symbols |
| Unused files | Unused files, orphan modules, file-tree cleanup | Whole files/modules with zero live references |

Both modes share the same eligibility rules. Prefer **unused-files** mode when the ask is only about deleting files from the tree.

## Eligibility (all must pass)

A target is removable only when every check below is satisfied:

| Check | Requirement |
| ----- | ----------- |
| References | Zero call sites, imports, exports, re-exports, type usages, or string/symbol references in the repo |
| Reachability | Not reachable from entry points (`main`, `index`, routes, CLI, jobs, hooks, DI registration, config manifests) |
| Tests | Not referenced by any test (unless the test itself is also dead/orphan) |
| Runtime wiring | Not registered in routing, DI, plugins, feature flags, build config, or deployment manifests |
| Public API | Not part of a public/exported surface consumed elsewhere |

If **any** connection exists → **do not remove**. Report the connection(s) and stop.

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] 1. Identify candidate targets
- [ ] 2. Prove dead/orphan status
- [ ] 3. Confirm no hidden connections
- [ ] 4. Execute removal
- [ ] 5. Validate and report
```

### 1. Identify candidate targets

Look for dead or orphan artifacts:

| Target | Examples |
| ------ | -------- |
| Unused function / method | Never called anywhere |
| Unused class / type | Never instantiated or referenced |
| Unused variable / constant | Declared but never read |
| Unused import | Imported but never used |
| Unreachable code block | After `return`/`throw`, disabled branch, or provably false condition |
| Orphan / unused file | No imports from other project files; not an entry point |
| Stale comment / empty stub | Left behind by prior removal; documents nothing live |
| Unused config entry | Key present but nothing reads it |

When the user names a specific symbol or file, treat it as a **candidate** — eligibility still requires proof in step 2.

#### Unused-files mode (file-tree cleanup)

When the ask is unused files only:

1. Scope the tree (path, package, or whole repo) as the user specified.
2. Build candidates: project source files not imported/required/referenced by other project files.
3. Exclude entry points, public package exports, build/deploy manifests, generated/vendor trees (unless the user explicitly targets them), and anything under `.gitignore` without clear intent.
4. List confirmed orphans in a plan before deleting when more than a few files are involved.

### 2. Prove dead/orphan status (required)

Before deleting anything:

1. Search the codebase for the symbol name, file path, and export names (Grep, symbol search).
2. Search imports, re-exports, dynamic references (`require`, `import()`, reflection, string literals).
3. Check tests, configs, routing, DI, build files, and manifests.
4. Trace reachability from known entry points when removing files or modules.

**Evidence required:** List every search performed and confirm zero live connections. If evidence is incomplete, search more or ask before proceeding.

### 3. Confirm no hidden connections

Block removal when:

- Any caller, importer, or exporter exists (including cross-package)
- Symbol or file is used only in tests that still run live code paths
- Target is an entry point or registered externally
- Usage is dynamic/reflective and cannot be ruled out safely
- Generated or vendor code (unless provably unused within that boundary)

Do **not** offer to "remove and fix callers." Connected code is out of scope for this skill.

### 4. Execute removal

- Edit only files required for confirmed dead/orphan targets.
- For whole orphan files, prefer `git rm` when the repo is under git.
- Clean up artifacts left behind:
  - Unused imports made orphan by the removal
  - Empty blocks or trailing commas
  - Orphaned comments that only described removed code
  - Config / manifest entries that became unused as a direct result
  - Empty directories left after file removal (only if they become empty and unused)
- Match surrounding code style; do not reformat unrelated lines.

### 5. Validate and report

- Re-search for dangling references after edits.
- Run linters or tests when available and relevant.
- Apply **doc-sync** if project docs exist and the removal changes structure or APIs.
- End with a completion report per **report-end-task** (Mode A).

## Safety rules

- **Never remove connected code** — even when the user requests it. Explain blockers and what would need to change outside this skill's scope.
- Never delete without proof when impact is unclear.
- Warn when a file becomes empty after removal; remove the file only if it is itself orphan.
- Respect `.gitignore` and do not delete ignored secrets or local-only files without explicit intent.
- For bulk cleanup, list all confirmed dead targets in a plan before editing.

## Edge cases

| Case | Handling |
| ---- | -------- |
| User asks to remove live code | Refuse; list all connections found |
| Used only in dead tests | Remove test and target together if both are orphan |
| Last export in file | Remove file only if the whole file is orphan |
| Entry point (`main`, `index`, route root) | Never remove |
| Generated / vendor code | Do not remove unless provably unused and user explicitly targets it |
| Feature flag branches | Remove only branches provably unreachable and unreferenced |
| Ambiguous dynamic usage | Do not remove; report uncertainty |
| File referenced only by path string | Treat as connected unless the string is clearly dead too |

## Removal report template

```markdown
### Code Removal Report

**Mode:** [symbol/block | unused-files]
**Removed:** [name and type, or file list]
**Location:** [file:line or path]
**Orphan proof:** [searches run; zero references confirmed]

**Dependencies checked:** yes
**Connections found:** none (required to proceed)
**Cleanup performed:** [unused imports, config, orphan files, empty dirs, etc.]

**Skipped (still connected):** [list or none]
**Suggested next steps:** [run tests, manual review of skipped items]
```

## Examples

### Example 1 — Remove orphan helper

**User:** Clean up unused helpers.

**Agent:**

1. Search for private helpers with zero references across src/ and tests/.
2. Find `_formatLegacyDate()` in `utils/dates.js` — no imports, calls, or exports.
3. Remove function and any imports that became unused.
4. Report: removed 1 dead function; 0 connections found.

### Example 2 — Refuse connected code

**User:** Remove `validateEmail`.

**Agent:**

1. Found `validateEmail()` in `utils/validators.js`.
2. Connections: `signup.js:23`, `profile.js:67`; exported from `validators.js`.
3. **Do not remove** — code is live. Report connections and stop.

### Example 3 — Unused file

**User:** Delete `legacy_auth.py`.

**Agent:**

1. Search imports and references to `legacy_auth` — zero matches outside the file.
2. Not listed in routes, DI, or config.
3. Remove file with `git rm`.
4. Report: removed 1 orphan file; re-search shows no dangling references.

### Example 4 — Unused-files tree cleanup

**User:** Remove unused files under `src/legacy/`.

**Agent:**

1. List candidates under `src/legacy/` with no importers.
2. Prove each file has zero references, config wiring, or entry-point use.
3. Present confirmed orphan list; skip any file with connections.
4. `git rm` confirmed orphans; clean empty dirs and leftover imports.
5. Report removed vs skipped with proof summary.
