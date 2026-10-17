---
name: loop-global-todos
description: >-
  List runnable, blocked, deferred-ready, and review LoopX todos across visible projects. Legacy alias for the canonical /loopx-global-* command.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 13:33:02"
  uuid: 7bfd833f-f12a-4edc-a5e3-a6493011757a
---
<!-- loopx-managed-slash-command:v1 command=/loop-global-todos surface=claude-skills -->

# LoopX /loop-global-todos

Treat this as the LoopX `/loop-global-todos` slash command.

Visible command arguments: `$ARGUMENTS`.
Run `loopx global-todos` first and summarize prioritized ownership and structured readiness across visible projects without mutating state.
This command is read-only unless the user explicitly asks for a state update.

Keep public/private boundaries intact and do not perform external writes unless the active LoopX state or owner explicitly authorizes them.
