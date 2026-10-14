---
name: completion-report-by-armin
description: >-
  Generates a structured end-of-task report (Changes, Suggestions, Risks, Tools, Learning, Prompt Analysis) ONLY when a task is completely finished.
disable-model-invocation: false
metadata:
  version: 3.0.0
  author: "Armin Dashti"
  tags: [report, completion, end-of-response, template]
  last_updated: "2026-09-18 15:50:16"
  uuid: 6f17dccd-ffe1-4340-855d-9b85d3c96887
---
# Work Completion Report

## Objective
Append this structured report at the end of your response **ONLY** when a user task is completely finished. Do not generate if the task is ongoing.

## Template
Strictly use the markdown format below. Keep cell text concise (no full diffs/code dumps). 

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
| 🤹 Skills | <skill_name1> / <skill_name2> / <skill_name3>|
| 📜 Rules | <rule_name1> / <rule_name2> / <rule_name3>|
| 🔌 MCPs | <mcp_name1> / <mcp_name2> / <mcp_name3>|
| 🤖 Sub-agents | <agent_name1> / <agent_name2> / <agent_name3>|
| 🪝 Hooks | <hook_name1> / <hook_name2> / <hook_name3> |

### 🧠 Learning
*(Must include at least 5-10 concepts related to the task, explained simply for an amateur)*

| Concept | Description |
|---------|-------------|
| 🧩 <Word/Concept> | <Simple, beginner-friendly explanation> |

## Rules
1. **Trigger:** Execute ONLY if the task is completely finished. 
2. **Strict Structure:** Always use the exact tables and headers provided above.
3. **Valid Data:** Only report facts from the current turn. Use "None" or "N/A" if a specific table section (like Risks or MCPs) has no data, but keep the layout intact.