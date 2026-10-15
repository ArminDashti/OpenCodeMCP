---
name: loopx-global-todos
description: >-
  List runnable, blocked, deferred-ready, and review LoopX todos across visible projects.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 13:33:02"
  uuid: 7867a699-959e-4547-af3c-b3ac283d1555
---
<!-- loopx-managed-slash-command:v1 command=/loopx-global-todos surface=claude-skills -->

# LoopX /loopx-global-todos

Treat this as the LoopX `/loopx-global-todos` slash command.

Visible command arguments: `$ARGUMENTS`.
Run `loopx global-todos` first and summarize prioritized ownership and structured readiness across visible projects without mutating state.
This command is read-only unless the user explicitly asks for a state update.

Keep public/private boundaries intact and do not perform external writes unless the active LoopX state or owner explicitly authorizes them.
