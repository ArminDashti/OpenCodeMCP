---
name: armin-dev-policies
description: >-
  Mandatory Armin coding policy, routed by topic. Use on every feature, fix,
  refactor, review, or design task in a project that follows Armin's
  standards, and specifically for: semantic versioning and CHANGELOG.md on
  every commit/push or version bump; safely removing dead or orphan code
  (unused symbols, imports, blocks, files/modules); finding architecture and
  design anti-patterns with file evidence, severity, and remediation;
  architecture proposals and structure decisions; behavior-preserving
  refactors (move/extract); release signing; modern variable, function, type,
  and file naming conventions; and About Me / WebUI identity pages.
disable-model-invocation: false
metadata:
  version: 2.1.0
  author: "Armin Dashti"
  category: coding
  tags: [semver, changelog, github, dead-code, orphan, cleanup, unused-files, anti-pattern, architecture, code-smell, review, remediation, refactor, signing, naming, clean-code, best-practices, principles]
  last_updated: "2026-10-09 17:34:58"
  uuid: 29557eba-54c8-456b-97ba-5618aa3478b8
---
# Armin Dev Policies

## When

- Any implementation, review, or design work in a project that follows Armin's standards.
- Handling software versions, analyzing commits, or pushing to GitHub.
- Removing unused, dead, unreachable, or orphaned code, imports, or files.
- Finding anti-patterns, architecture smells, or design violations; proposing or changing architecture.
- Restructuring code without changing behavior; signing releases.
- Choosing or suggesting names for variables, functions, types, files, or directories.
- Creating or editing an About Me / identity WebUI page.
- Merges former: `armin-dev-policy`, `bump-software-version`, `code-pruning`, `detect-anti-pattern`, `apply-variable-naming`, `armin-dev-principles`, `armin-principles-software-engineering`, `software-engineer-principles`.

## Hard rules

1. **This skill is policy, not optional tips.** Apply the sections that match the task before you edit; do not skip it because the change "looks small."
2. **User's explicit ask for this task wins** over this skill for that ask only (for example a mandated name). **Otherwise this skill wins** over generic defaults.
3. **More specific guide wins** when two apply (code pruning for dead code; safe refactor for moves; architecture for structure).
4. **Say so** when two guides conflict and you must pick.
5. Require evidence (searches, file paths, project facts) before removing code or reporting a finding; never invent findings, signing keys, or contiguous plaintext emails in About Me markup.

## Default loop (every change)

```
Task progress:
- [ ] 1. Pick applicable topics below
- [ ] 2. Read the matching guides/ (and standards/ if needed)
- [ ] 3. Implement within those constraints
- [ ] 4. Done check: naming, structure, version impact, no new anti-patterns, no accidental live-code deletion
```

## Principles (day-to-day craft)

1. Clarity, small blast radius, reversible steps.
2. Match the repo's real stack; no ceremony the team cannot run.
3. Keep domain invariants in code, not only in UI or docs.
4. No dead abstractions, copy-paste modules, or untracked "temporary" hacks.
5. Prefer one deployable until independent deploy/scale is a real requirement.

## Topics

Read only the guide(s) that match the task; several may apply.

| Topic | Guide |
|-------|-------|
| Naming (identifiers, files) | [guides/naming.md](guides/naming.md) |
| Versioning (SemVer, CHANGELOG, tags) | [guides/versioning.md](guides/versioning.md) |
| Architecture (structure, boundaries, proposals) | [guides/architecture.md](guides/architecture.md) |
| Anti-patterns (detect, classify, report) | [guides/anti-patterns.md](guides/anti-patterns.md), catalog: [guides/anti-patterns-reference.md](guides/anti-patterns-reference.md) |
| Safe refactor (move/extract without behavior change) | [guides/safe-refactor.md](guides/safe-refactor.md) |
| Code pruning (dead / orphan code and files) | [guides/code-pruning.md](guides/code-pruning.md) |
| Signing (signed releases) | [guides/signing.md](guides/signing.md) |
| About Me / identity WebUI | [standards/about-armin/description.md](standards/about-armin/description.md); portrait `standards/about-armin/armin.png` → app `public/about-me/armin.png` |
| Standards: footer, grids, login-ui, sidebar-menu, theme | `standards/<name>/` (placeholders, no content yet) |
