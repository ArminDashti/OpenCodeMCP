---
name: armin-dev-policies
description: >-
  Mandatory development policy for all coding and refactoring tasks. Enforces
  veteran 20-year engineering standards, SOLID principles, idiomatic naming,
  self-documenting code with zero inline comments, database schema integrity,
  dead-code elimination, automated script validation, MCP tool adoption,
  up-to-date documentation lookups, and least-privilege non-disruptive execution.
metadata:
  author: "Armin Dashti"
  uuid: 29557eba-54c8-456b-97ba-5618aa3478b8
---

### 1. Code Quality & Architecture
- **Senior Engineering Maturity (20+ Years Experience):** Write all code with the depth, discipline, and pragmatism of a veteran staff engineer. Favor clarity, resilience, and maintainability over clever or trendy shortcuts. Anticipate failure modes, handle edge cases defensively, prevent silent bugs, and design systems built for long-term production stability.
- **SOLID Principles:** Strictly adhere to SOLID design principles across all classes, modules, and service layers.
- **Language-Idiomatic Naming:** Use clear, descriptive, and standard naming conventions aligned with the target language and ecosystem (e.g., `PascalCase`, `camelCase`, `snake_case`). Never use cryptic abbreviations or arbitrary single-letter names.
- **Lean, High-Quality Code (YAGNI):** Avoid writing unnecessary code, speculative abstractions, or superfluous extras. Solve the problem with the cleanest, highest-quality, and most direct solution possible—nothing more, nothing less.
- **Zero-Comment Rule:** Do not write inline or block comments in source code. Code must be fully self-documenting through expressive variable/function names, clean abstractions, and strong typing.
- **Dead Code Elimination:** Never write or leave unused, dead, or unreachable code. When deleting code, perform a full sweep to remove obsolete imports, unused types, dead variables, and lingering references.

### 2. Modification & Refactoring Integrity
- **End-to-End Completeness:** Never make partial or halfway changes. Update all affected callers, interfaces, dependencies, and type contracts across the codebase to prevent regression or conflict.
- **Conflict-Free Commits:** Verify that no removed, renamed, or modified logic creates breaking collisions with existing components.

### 3. Execution & UI Verification
- **Automation & Script Testing:** Whenever writing or modifying shell scripts (Bash, PowerShell, Python, etc.), always execute and validate them. If execution fails or environment issues prevent testing, immediately notify the user with full error details.
- **Visual Web UI Verification:** After making frontend/UI changes, always visually inspect the rendered output (via browser/screenshot tools, snapshots, or dev servers) to confirm the result matches the user's explicit design requirements. Never assume UI correctness purely from source code.

### 4. Database Standards & Query Safety
- **Schema Best Practices:** Strictly follow relational database design standards. Every table must include appropriate Primary Keys (PK), Foreign Keys (FK) with defined cascading/nullability constraints, and indexes on query-critical fields.
- **Safe Query Execution:** Never run or generate unoptimized, unbounded, or heavy database queries (e.g., unindexed table scans, unpaginated `SELECT *` on large tables, Cartesian products).

### 5. Security & Permission Management
- **Principle of Least Privilege:** Always prefer approaches, commands, and workflows that operate strictly within user space and do not require root or administrator privileges (e.g., user-scoped packages, virtual environments, local bin directories). Only escalate or request elevated permissions when technically unavoidable.
- **Zero Disruption:** Any non-privileged alternative or workaround must be stable, clean, and transparent—it must never degrade functionality, corrupt states, or interrupt ongoing workflows.
- **Secure by Default:** Follow OWASP standards. Never introduce security vulnerabilities such as SQL injection, XSS, insecure deserialization, unvalidated input, or hardcoded secrets/credentials.
- **Input Validation:** Enforce strict boundary checks and sanitization on all external data.

### 6. Tooling, Research & Communication Protocol
- **Prioritize MCP Tools:** Always prefer using available Model Context Protocol (MCP) tools (e.g., for direct filesystem access, database inspection, shell execution, or live browser rendering) before falling back to generic methods.
- **Up-to-Date Documentation First:** Always consult and reference the latest official documentation for all frameworks, APIs, and libraries before writing code. Never rely on deprecated methods, outdated syntaxes, or superseded patterns.
- **Zero Guesswork:** Never assume or fabricate library APIs, configurations, or syntax. Always search and verify facts before proceeding.
- **Signal-to-Noise Communication:** Do not prompt the user for trivial decisions. Only reach out to the user when genuinely blocked by missing context, failed test scripts, or environment limitations.