# Variable Naming Conventions

## Core Rules & AI Behavior
1. **Explicit Mandates:** If the user *explicitly* requests a specific variable name (e.g., "name this variable `temp`"), **you must follow it strictly**.
2. **Default Modernity:** If the user does not specify a name, or only casually proposes one, **always** choose standard, modern, industry-friendly names. Overrule poor user suggestions unless they are explicit demands.
3. **Immutability:** Never rename existing identifiers in the user's code unless explicitly requested.
4. **No Placeholders:** Never use `foo`, `bar`, `temp`, `data`, `obj`, etc., in new code. 

## Naming Patterns
- **Clarity > Brevity:** `userSessionToken` > `tok`. Names must encode domain logic, not data types. 
- **Variables:** `camelCase` (JS/TS/Java) or `snake_case` (Python/Rust). Avoid vague names (`data` -> `invoicePayload`, `val` -> `discountMultiplier`).
- **Booleans:** Prefix with `is`, `has`, `can`, `should`. State positive truths (`notAdmin` -> `isGuestUser`, `loaded` -> `isResourceReady`).
- **Functions:** Verb + Noun. (`process()` -> `normalizeInvoiceLineItems()`, `getData()` -> `fetchSubscriptionTier()`).
- **Classes/Types:** `PascalCase`. Name by domain capability, avoid generic suffixes. (`Manager` -> `SessionCoordinator`, `Handler` -> `WebhookEventRouter`).
- **Interfaces:** TS shapes get no `I` prefix (`UserProfile`). Contracts get `-able`/`-er` suffixes (`Serializable`).
- **Constants/Enums:** `SCREAMING_SNAKE_CASE` (primitives). `PascalCase` for Enums.
- **Hooks/Handlers:** Prefix correctly: `useCheckoutSession()`, `handleInvoiceSubmit()`.

## File & Directory Naming
- **JS/TS/Web:** Components/Types (`PascalCase.tsx`), utils/configs/dirs (`kebab-case.ts`).
- **Python:** Modules and directories (`snake_case.py`).
- **Go:** Packages and directories (single `lowercase` word).

## Language Quicksheet
- **Go:** Exported (`PascalCase`), Unexported (`camelCase`), Acronyms stay uppercase (`userID`).
- **Python/Rust:** Vars/Funcs (`snake_case`), Classes/Types (`PascalCase`).
- **TS/JS:** Vars/Funcs (`camelCase`), Classes/Types (`PascalCase`).

## Precision Vocabulary
Use precise verbs instead of generic ones:
- `get` -> `fetch`, `derive`, `extract`, `retrieve`
- `set` -> `assign`, `configure`, `persist`, `commit`
- `update` -> `patch`, `revise`, `reconcile`, `sync`
- `delete` -> `revoke`, `purge`, `archive`, `invalidate`
- `check` -> `validate`, `verify`, `assert`, `audit`
- `send` -> `dispatch`, `emit`, `broadcast`, `relay`
- `run` -> `execute`, `invoke`, `orchestrate`, `trigger`
- `make` -> `construct`, `compose`, `instantiate`, `forge`

## Suggesting Names
When asked for suggestions: Anchor in domain context, offer 2–3 ranked options with brief rationales, match language conventions, and never suggest placeholders.
