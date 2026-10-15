---
name: safe-refactor
description: >-
  Restructure code while preserving behavior. Use for extraction, consolidation, ownership moves, or cleanup where verification must bracket structural edits.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  tags: []
  last_updated: "2026-10-15 20:26:51"
  uuid: 73b564e6-6d06-47c2-890b-6123bcd20231
---
# Safe refactor

Define behavior-preservation boundary and establish verification before structural edits.

- Keep feature changes outside refactor.
- Move one ownership boundary at a time.
- Preserve public interfaces, failure behavior, ordering, and compatibility unless explicitly scoped.
- Keep intermediate states buildable and testable.
- Avoid dependency or configuration growth without correctness need.

Run same proof after change. Stop when behavior matches and requested structure is achieved.
