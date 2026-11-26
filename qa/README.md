# Manual QA scripts

The standard test scripts of the web view, in plain language: what a tester does, step by step,
and after each step what they should see. Before a release, the
[`manual-qa`](../.claude/skills/manual-qa/SKILL.md) skill (run by the "Manual QA" automation, or by
hand) follows each one in a browser, records a video and reports pass or fail.

- They are the source of truth, written and reviewed like code. The agent does not decide what to
  test: it follows the steps as written, and a step it cannot follow is a failure, not something
  to work around.
- They run against **live GitHub**, so each one names a pinned commit where it can, and says
  "at least" where live data grows (an organization).
- One file per script: `# <title>`, a line on what it covers, `Needs:` (a token, the network),
  then numbered steps, each with **Do** and **See**.

| Script | Covers |
|---|---|
| [filter.md](filter.md) | Filtering the skills of a repository by words |
| [organization.md](organization.md) | Scanning a whole organization, with a token, and filtering across it |
| [errors.md](errors.md) | Links that cannot be scanned, and a scan shared by its address |
