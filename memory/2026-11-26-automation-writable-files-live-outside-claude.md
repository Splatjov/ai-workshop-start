# Files the automations must write go outside `.claude/` and `AGENTS.md`

`issue-fix` may not change `.claude/` or `AGENTS.md`, and `review-fix` may change them only in a
PR that already touches them. So anything every run has to write (like these notes) lives at the
repository root (`memory/`), not under `.claude/`: there, every automation can commit it.

Learned in: branch `update-memory-skill`, 2026-11-26.
