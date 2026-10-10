---
name: loopx
description: >-
  Inspect LoopX state, or start concrete project work when arguments are provided.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-09-10 13:33:02"
  uuid: 614abfdf-89cd-4eaf-a121-ea1b49a4983c
---
<!-- loopx-managed-slash-command:v1 command=/loopx surface=claude-skills -->

# LoopX /loopx

Treat this as the LoopX `/loopx` slash command.

Visible command arguments: `$ARGUMENTS`.
Identify the exact current host surface (codex-app, codex-app-ssh, codex-ide-plugin, codex-cli-tui, opencode, opencode2, traex-cli, pi, gemini-cli, cursor-agent, deepseek-harness, or ark-managed-agent).
If arguments are present, pass the complete visible command arguments unchanged as one value to `loopx start-goal --guided --project . --slash-command-arguments="<complete visible $ARGUMENTS>" --host-surface <exact-current-host>`. The CLI, not the model, owns parsing supported leading switches and preserving the remaining goal text. Never split or recompose the arguments, and never infer a route from issue/PR wording or URLs. If the host is unclear, omit the host flag once and follow the returned host-surface selection gate.
Treat the returned `ordered_steps` and `goal_start_contract` as authoritative. Follow their identity, capability-route, Todo, writeback, host-loop, quota, and stop/gate rules before substantive work; do not reconstruct those rules from skill memory.
If the packet exposes a goal-selection gate, rerun one exact choice before any mutation.
If arguments are empty and the host already identifies an active LoopX goal, follow its exact CLI `interaction_contract` or quota command first; otherwise inspect `loopx status` and `loopx bootstrap-command-pack --project .` before changing files.
If this session cannot mutate the host loop surface, surface the exact pasteable gate instead of claiming autonomous setup.

Keep public/private boundaries intact and do not perform external writes unless the active LoopX state or owner explicitly authorizes them.
