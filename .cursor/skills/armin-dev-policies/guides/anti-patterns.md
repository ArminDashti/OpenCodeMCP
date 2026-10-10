# Detect Anti-Pattern

## When to use

- User asks to find anti-patterns, architecture smells, or design violations
- User asks whether the codebase has god classes, circular deps, leaky layers, or similar
- After a large feature or before a refactor when structural risk should be measured
- Exclusions: security vulns (`find-security-issue`), functional REST bugs (`find-bug-in-restful`), proposing a new architecture (`porpose-app-architecture`), pure style/lint nits
- Related: `detect-app-architecture`, `porpose-app-architecture`, `suggest-improvements`

## Objective

1. Scan the target scope for confirmed architecture/design anti-patterns
2. Rank each finding by severity with file/path evidence
3. Recommend a concrete, scoped fix per finding
4. Separate confirmed issues from weak signals / needs-more-context

## Workflow

### Step 1: Scope

- [ ] Confirm target: whole repo, project, folder, or changed files
- [ ] Prefer current workspace / git root; ask once if scope is unclear
- [ ] Note stack signals (e.g. ASP.NET Core, EF Core, frontend SPA) — they change which patterns apply

### Step 2: Map structure

- [ ] List top-level projects/folders and dependency direction (refs, imports, package graph)
- [ ] Identify intended layers if any (API, Application, Domain, Infrastructure, UI)
- [ ] Run `detect-app-architecture` first when the style is unknown — anti-patterns are relative to the declared style

### Step 3: Hunt by category

Check each category that fits the stack. Require **evidence** (path + short snippet or dependency fact).

| Category | Look for |
|----------|----------|
| Structure | God class/service; shotgun surgery; divergent change; circular project/package deps |
| Layering | Domain depending on Infrastructure/UI; controllers calling DbContext/SQL directly when a layer exists; business rules in controllers or views |
| Coupling | Feature envy; inappropriate intimacy; hard-coded concrete deps where DI is the norm; service locator abuse |
| Data | Anemic domain with logic only in services *and* duplicated invariants; N+1 query hotspots; unbounded queries; shared mutable static state |
| API/App | Fat controllers; duplicate endpoint logic; catch-all exception swallowing; temporal coupling (must-call-in-order APIs) |
| Process | Copy-paste modules instead of shared abstraction; dead abstraction layers; premature microservices |

Common named patterns to flag when evidenced:

- Big Ball of Mud / no clear module boundaries
- Golden Hammer (one pattern forced everywhere)
- Lava Flow (dead/unused paths kept “just in case”)
- Spaghetti / Lasagna (tangled control flow / too many thin layers)
- God Object, Circular Dependency, Leaky Abstraction
- Hard-Coded Configuration, Magic Strings for cross-cutting behavior
- Distributed Monolith (many deployables, tight runtime coupling)

### Step 4: Classify

For each candidate:

| Severity | Meaning |
|----------|---------|
| Critical | Blocks maintainability/safety now (e.g. circular deps that prevent builds/changes; domain rules only in UI) |
| High | Repeated pain or high blast radius |
| Medium | Localized but real debt |
| Low | Smell / consistency issue |

| Confidence | Meaning |
|------------|---------|
| Confirmed | Clear evidence in code or project graph |
| Suspected | Strong signal; needs product/context confirmation |

Drop anything without evidence. Do not invent anti-patterns to fill a report.

### Step 5: Report

Use this shape:

```markdown
# Anti-pattern report — <scope>

## Summary
- Confirmed: N | Suspected: M | Scanned: <paths/projects>

## Findings
### 1. <Anti-pattern name> — <Critical|High|Medium|Low> (Confirmed|Suspected)
- Evidence: `path` — <one-line fact>
- Why it hurts: <1 sentence>
- Fix: <concrete next step, scoped>

## Out of scope / not found
- <categories checked with no hits>
```

- Sort Critical → Low; Confirmed before Suspected within a severity
- Cap verbose dumps; link paths instead of pasting large files
- Offer to apply fixes only if the user asks

## Safety rules

1. **Always** cite file/project evidence for every finding.
2. **Always** distinguish Confirmed vs Suspected.
3. **Always** tailor checks to the detected architecture style.
4. **Never** invent anti-patterns or severity without evidence.
5. **Never** treat style preferences (brace style, naming taste) as architecture anti-patterns.
6. **Never** refactor while reporting unless the user explicitly asks to fix.
7. **Never** confuse security vulns or test failures with anti-patterns — route those skills instead.

## Examples

**Example 1:** Layer leak

- Input: "Find architecture anti-patterns in this API"
- Evidence: `OrdersController` injects `AppDbContext` and builds SQL in the action while `Application/` and `Domain/` projects exist
- Output: **Leaky layering — High (Confirmed)**; fix: move persistence to Infrastructure via an application use-case/service

**Example 2:** Circular projects

- Input: "Any structural anti-patterns?"
- Evidence: `Billing.csproj` → `Orders.csproj` and `Orders.csproj` → `Billing.csproj`
- Output: **Circular dependency — Critical (Confirmed)**; fix: extract shared contracts project or invert one edge

## Additional resources

- Pattern catalog detail: [anti-patterns-reference.md](anti-patterns-reference.md)
