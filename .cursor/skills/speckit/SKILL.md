---
name: speckit
description: >-
  Routes Speckit feature workflow steps (specify, plan, tasks, implement, and
  related) to the matching nested skill.
disable-model-invocation: false
metadata:
  version: "1.0.0"
  author: Armin Dashti
  category: process
  tags: [speckit, specify, plan, tasks, implement, router]
  last_updated: "2026-08-02 11:32:30"
  uuid: 7b8174e4-e06a-4181-879e-6c74d58463ed
---

# Speckit

## When to use

- User asks for Speckit / feature-spec workflow steps
- Nested: `speckit-specify/`, `speckit-plan/`, `speckit-tasks/`, `speckit-taskstoissues/`, `speckit-implement/`, `speckit-analyze/`, `speckit-checklist/`, `speckit-clarify/`, `speckit-constitution/`, `speckit-converge/`

## Objective

1. Classify the Speckit step
2. Read and follow the matching nested skill
3. Keep artifacts consistent across spec → plan → tasks → implement

## Workflow

### Step 1: Route

| Ask | Nested skill |
|-----|----------------|
| Specify / write feature spec | `speckit-specify/SKILL.md` |
| Plan / design artifacts | `speckit-plan/SKILL.md` |
| Tasks / tasks.md | `speckit-tasks/SKILL.md` |
| Tasks to GitHub issues | `speckit-taskstoissues/SKILL.md` |
| Implement from tasks | `speckit-implement/SKILL.md` |
| Analyze consistency | `speckit-analyze/SKILL.md` |
| Checklist | `speckit-checklist/SKILL.md` |
| Clarify underspecified areas | `speckit-clarify/SKILL.md` |
| Constitution | `speckit-constitution/SKILL.md` |
| Converge remaining work into tasks | `speckit-converge/SKILL.md` |

### Step 2: Execute

1. Read `C:/Users/<USER>/.cursor/skills/<nested>/SKILL.md`
2. Follow it fully
3. Report which Speckit artifacts changed

## Safety rules

1. **Always** read the nested Speckit skill before editing artifacts.
2. **Never** skip clarify/constitution constraints the nested skill requires.
3. **Always** keep analyze non-destructive unless the nested skill says otherwise.

## Examples

**Example 1:** Spec

- Input: "Speckit specify: add export to CSV"
- Route: `speckit-specify/SKILL.md`

**Example 2:** Implement

- Input: "Run speckit implement"
- Route: `speckit-implement/SKILL.md`
