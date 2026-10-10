---
name: loop-global-summary
description: >-
  Read the compact global LoopX progress digest. Legacy alias for the canonical /loopx-global-* command.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 13:33:02"
  uuid: 279879ef-a37d-47f6-a4ed-ecc75cce927f
---
<!-- loopx-managed-slash-command:v1 command=/loop-global-summary surface=claude-skills -->

# LoopX /loop-global-summary

Treat this as the LoopX `/loop-global-summary` slash command.

Visible command arguments: `$ARGUMENTS`.
Run `loopx global-summary` first and summarize visible projects, gates, monitor status, and next safe actions.
This command is read-only unless the user explicitly asks for a state update.

Keep public/private boundaries intact and do not perform external writes unless the active LoopX state or owner explicitly authorizes them.
