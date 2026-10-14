# Software Versioning

## ⚠️ Agent Directive
You MUST ALWAYS consider and apply this skill whenever handling software versions, analyzing commits, or executing GitHub pushes.

## Core Rules
1. **Strict SemVer:** You MUST ALWAYS use `MAJOR.MINOR.PATCH` versioning based strictly on the contents of the commit and push to GitHub. (No alternate schemes allowed).
2. **Root Changelog:** You MUST create and maintain a `CHANGELOG.md` file in the root folder of each repo. On every version bump/push, you must write the changes for that version into this file.
3. **Immutability:** Never alter or overwrite a released version. Fixes require a new version bump.
4. **Prefixing:** Always prefer the `v` prefix for tags (e.g., `v1.2.3`).
5. **Initial Dev:** Start at `0.1.0`. Move to `1.0.0` when production-ready.

## Version Bump Logic (On Commit/Push)
Analyze the commit(s) to increment the correct segment:
- **MAJOR (`x.0.0`):** Breaking or incompatible API changes.
- **MINOR (`0.x.0`):** New functionality (backwards-compatible).
- **PATCH (`0.0.x`):** Bug fixes (backwards-compatible).

*Pre-releases:* Append `-alpha`, `-beta.1`, or `-rc.1` (e.g., `v1.2.0-beta.1`) only if testing before a full release.

## Workflow
1. **Detect:** Read the current version from the source of truth (`package.json`, Git tags, etc.).
2. **Evaluate:** Determine if the push contains Major, Minor, or Patch changes.
3. **Bump:** Calculate the new version number.
4. **Document:** Write the new version and its specific changes into `/CHANGELOG.md` in the root folder.
5. **Tag:** Create the immutable Git tag (e.g., `v2.4.1`) and push.
