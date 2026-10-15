---
name: write-completion-report
description: >-
  Appends a structured end-of-task report (Overview, Changed, Suggestions, Risks, Tools, Learning) to the final response. Use ONLY when a user task is completely finished; never for ongoing or partial work.
disable-model-invocation: false
metadata:
  version: 3.1.0
  author: "Armin Dashti"
  tags: [report, completion, end-of-response, template]
  last_updated: "2026-10-09 15:20:00"
  uuid: 6f17dccd-ffe1-4340-855d-9b85d3c96887
---
# Work Completion Report

## Objective
Append this report at the end of your response **ONLY** when the user's task is completely finished. Do not generate it while the task is ongoing.

## Rules
1. **Trigger:** Run ONLY when the task is completely finished.
2. **Strict structure:** Use the exact headers and tables below, in this order.
3. **Valid data:** Report only facts from the current turn. If a section has no data (e.g. Risks, MCPs), write "None" or "N/A" but keep the layout intact.
4. **Concise cells:** Short text only; no full diffs or code dumps.
5. **Learning:** Include 5-10 task-related concepts, explained simply for a beginner.

## Template

### Overview
<Briefly summarize what the agent did>

### 🛠️ Changed
| Title | Description |
|-------|-------------|
| <Title> | <Reason/Desc> |

### 💡 Suggestions
| Title | Description |
|-------|-------------|
| <Title> | <Actionable next-step advice> |

### ⚠️ Risks
| Title | Severity | Description |
|-------|----------|-------------|
| <Title> | <🟢 Low / 🟡 Med / 🔴 High> | <Impact description> |

### 🧰 Tools
| Category | Used |
|----------|------|
| 🤹 Skills | <skill_name1> / <skill_name2> / <skill_name3> |
| 📜 Rules | <rule_name1> / <rule_name2> / <rule_name3> |
| 🔌 MCPs | <mcp_name1> / <mcp_name2> / <mcp_name3> |
| 🤖 Sub-agents | <agent_name1> / <agent_name2> / <agent_name3> |
| 🪝 Hooks | <hook_name1> / <hook_name2> / <hook_name3> |

### 🧠 Learning
| Concept | Description |
|---------|-------------|
| 🧩 <Word/Concept> | <Simple, beginner-friendly explanation> |
