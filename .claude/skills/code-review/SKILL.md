---
name: code-review
description: Reviews a pull request or the current branch of Skill Atlas for correctness bugs, spec drift, missing tests and broken AGENTS.md rules, then reports verified findings (optionally as PR comments). Built to run unattended in an automation.
argument-hint: "[PR number | branch | empty = current branch vs main] [--comment]"
---

# Code review

Review one change set of this repository and report only findings you have verified.
Runs **unattended**: never ask questions, never wait for input, never edit, commit or push code.
If something is ambiguous, pick the most reasonable interpretation and say so in the report.

## 1. Pick the target

From `$ARGUMENTS`:
- a number → that PR: `gh pr view <n> --json number,title,body,baseRefName,headRefName,url`,
  then `gh pr diff <n>`; check it out with `gh pr checkout <n>` to run things
- a branch name → `git diff main...<branch>`
- nothing → if the current branch has an open PR (`gh pr view --json number`), review that PR;
  otherwise `git diff main...HEAD` plus uncommitted changes (`git diff HEAD`)
- `--comment` → post the findings to the PR (step 6); without it, only print the report

Empty diff → report "Nothing to review" and stop.

## 2. Read the context first

1. `AGENTS.md`: the definition of done.
2. `spec/` (all of it): what the code must do. The spec is the source of truth.
3. The PR title/body, if any: what the author claims the change does.
4. Every changed file **in full**, not just the hunks, plus the callers and callees the change touches.
   Architecture to keep in mind: `src/core` is fetch → find → parse; `src/cli.ts`/`commands.ts`
   are a thin client; `tests/` are integration tests against `fixture/`; `tests/e2e/` hit real GitHub.

## 3. Run the checks

```bash
npm ci
npm run typecheck
npm test
```
Run `npm run test:e2e` only if the change touches `src/core/github.ts`, fetching, URL/ref handling
or `tests/e2e/`, and the network is available (set `GITHUB_TOKEN` if present). If it can't run,
say so — do not report it as passing.
Also run the CI smoke test: `./skill-atlas help && ./skill-atlas scan ./fixture` (must exit 0).

For a PR, also check CI: `gh pr checks <n>`. A red or pending CI is a finding / a note.

Any failing command is a finding: quote the relevant output.

## 4. Look for problems

In this order of importance:

1. **Correctness** — wrong behavior on real input: edge cases from `spec/analysis.md`
   (copies, nested skills, `skill.md` vs `SKILL.md`, symlinks, malformed front matter, unknown refs,
   truncated trees, missing files at the scanned commit, root `SKILL.md`), exit codes,
   stdout vs stderr, error messages, async/await mistakes, unhandled rejections, rate limits,
   pagination, path handling on GitHub vs local.
2. **Spec drift** — behavior changed but `spec/` not updated, or spec updated but code doesn't
   match it. AGENTS.md: "Update it with the code".
3. **Missing tests** — every case in the spec needs an integration test. A new or changed spec
   case without a test in `tests/` (or `tests/e2e/` for real-GitHub behavior) is a finding.
   Tests that can't fail, or that assert nothing meaningful, count too.
4. **Architecture** — logic leaking into the CLI instead of `src/core`; cloning instead of the
   GitHub API; storing anything (the CLI "stores nothing"); performance regressions against
   "under 5 s for intellij-community" (e.g. one request per file instead of a tree listing).
5. **Security** — tokens in logs or error messages, unsanitized paths, command injection.
6. **Docs** — README examples that no longer match the output.

Skip pure style preferences, formatting and naming nitpicks unless they hide a bug.

## 5. Verify every finding

Before reporting, try to disprove each candidate:
- Re-read the surrounding code; check whether another layer already handles it.
- Where possible, prove it: a failing command, a quick script against `fixture/`, or a concrete
  input → wrong output trace. Put scratch scripts in `/tmp`, never in the repo.
- Drop anything you can't back with a concrete failure scenario. Mark the rest
  **confirmed** (reproduced) or **plausible** (reasoned, not reproduced).

Prefer a few real findings over many speculative ones. Zero findings is a valid result.

## 6. Report

Print a markdown report:

```markdown
## Code review: <PR #n title | branch>
**Verdict:** ✅ ready | ⚠️ ready after fixes | ❌ not ready

**Checks:** typecheck ✅/❌ · tests ✅/❌ · e2e ✅/❌/skipped (why) · smoke ✅/❌ · CI ✅/❌/pending

### Findings
1. **[important|nit] [confirmed|plausible] <short title>** — `path/to/file.ts:42`
   What is wrong. Failure scenario: <input/state> → <wrong result>. Suggested fix: <one line>.

### Definition of done (AGENTS.md)
- [ ] spec updated with the code
- [ ] integration test for every spec case touched
- [ ] all tests pass locally
- [ ] CI green
```

Order findings by severity. Verdict: ❌ if any check fails or any confirmed `important` finding;
⚠️ if only plausible/nit findings or the definition of done is incomplete; ✅ otherwise.

With `--comment` and a PR target:
- Post each finding with a file/line as an inline review comment on the PR's head commit:
  `gh api repos/{owner}/{repo}/pulls/<n>/comments -f body=... -f commit_id=<head sha> -f path=... -F line=... -f side=RIGHT`
- Post the full report once as a PR comment: `gh pr comment <n> --body-file <report.md>`
- Never approve or request changes, never merge, never close.
- Before posting, check existing comments (`gh api repos/{owner}/{repo}/pulls/<n>/comments`)
  and skip findings already reported, so reruns of the automation don't duplicate them.

If a report file is wanted, write it to `$AIR_ARTIFACTS_DIR/code-review.md` when that variable is set.
