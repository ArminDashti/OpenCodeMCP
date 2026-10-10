---
name: loopx-global-risks
description: >-
  Show stale LoopX runs, boundary risks, failing checks, and rollback candidates.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 13:33:02"
  uuid: 77df6d66-1c16-4c5a-8b51-2011edd6e5b7
---
<!-- loopx-managed-slash-command:v1 command=/loopx-global-risks surface=claude-skills -->

# LoopX /loopx-global-risks

Treat this as the LoopX `/loopx-global-risks` slash command.

Visible command arguments: `$ARGUMENTS`.
Run `loopx global-risks` first and summarize structured stale runs, boundary warnings, failing checks, and whether a formally evidenced rollback candidate source is available, without mutating state.
This command is read-only unless the user explicitly asks for a state update.

Keep public/private boundaries intact and do not perform external writes unless the active LoopX state or owner explicitly authorizes them.
