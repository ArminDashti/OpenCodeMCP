---
name: loopx-pr-review
description: >-
  Run the LoopX PR-review packet first, then review selected PR groups with evidence.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 13:33:02"
  uuid: 3ccdab9c-d5e4-4880-b0f4-1d19b4441365
---
<!-- loopx-managed-slash-command:v1 command=/loopx-pr-review surface=claude-skills -->

# LoopX /loopx-pr-review

Treat this as the LoopX `/loopx-pr-review` slash command.

Visible command arguments: `$ARGUMENTS`.
Use the installed `loopx-pr-review` skill when available.
Run `loopx --format json pr-review $ARGUMENTS` first and keep `agent_response_contract.review_execution_contract`, `review_groups`, `pull_requests[].review_plan`, `pull_requests[].review_template`, and `pull_requests[].evidence_commands` visible.
Do not reconstruct the PR queue manually from ad hoc GitHub calls before reading the LoopX packet.
This command is read-only; do not comment, approve, merge, rerun CI, or spend quota unless separately authorized.

Keep public/private boundaries intact and do not perform external writes unless the active LoopX state or owner explicitly authorizes them.
