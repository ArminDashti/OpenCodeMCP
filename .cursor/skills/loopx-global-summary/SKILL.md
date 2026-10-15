---
name: loopx-global-summary
description: Read the compact global LoopX progress digest.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 13:33:02"
  uuid: 28734c5d-cae2-42d6-8cc7-f20fa7abff99
---
<!-- loopx-managed-slash-command:v1 command=/loopx-global-summary surface=claude-skills -->

# LoopX /loopx-global-summary

Treat this as the LoopX `/loopx-global-summary` slash command.

Visible command arguments: `$ARGUMENTS`.
Run `loopx global-summary` first and summarize visible projects, gates, monitor status, and next safe actions.
This command is read-only unless the user explicitly asks for a state update.

Keep public/private boundaries intact and do not perform external writes unless the active LoopX state or owner explicitly authorizes them.
