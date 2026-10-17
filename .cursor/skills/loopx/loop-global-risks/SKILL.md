---
name: loop-global-risks
description: >-
  Show stale LoopX runs, boundary risks, failing checks, and rollback candidates. Legacy alias for the canonical /loopx-global-* command.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 13:33:02"
  uuid: 88a4d1c3-6a3b-4804-90d7-5d56328af783
---
<!-- loopx-managed-slash-command:v1 command=/loop-global-risks surface=claude-skills -->

# LoopX /loop-global-risks

Treat this as the LoopX `/loop-global-risks` slash command.

Visible command arguments: `$ARGUMENTS`.
Run `loopx global-risks` first and summarize structured stale runs, boundary warnings, failing checks, and whether a formally evidenced rollback candidate source is available, without mutating state.
This command is read-only unless the user explicitly asks for a state update.

Keep public/private boundaries intact and do not perform external writes unless the active LoopX state or owner explicitly authorizes them.
