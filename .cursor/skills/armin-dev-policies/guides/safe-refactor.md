# Safe refactor

Restructure while preserving behavior.

1. Define the behavior boundary and lock verification **before** edits.
2. Keep feature work out of the refactor.
3. Move one ownership boundary at a time.
4. Preserve public interfaces, failure behavior, ordering, and compatibility unless the user scoped a break.
5. Keep every intermediate state buildable and testable.
6. Do not grow dependencies or config without a correctness need.
7. Re-run the same proof after. Stop when behavior matches and structure matches the ask.
