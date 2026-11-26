---
name: code-review
description: Reviews a pull request or the current branch of Skill Atlas (CLI, core and web view) for correctness bugs, spec drift, missing tests and broken AGENTS.md rules, then reports verified findings (optionally as PR comments). Built to run unattended in an automation.
argument-hint: "[PR number | branch | empty = current branch vs main] [--comment]"
---

# Code review

Review one change set of this repository and report only findings you have verified.
Runs **unattended**: never ask questions, never wait for input, never edit, commit or push code.
If something is ambiguous, pick the most reasonable interpretation and say so in the report.

## 1. Pick the target

From `$ARGUMENTS` (or, in an automation, from the triggering PR event):
- a number → that PR: `gh pr view <n> --json number,title,body,baseRefName,headRefName,headRefOid,url`,
  then `gh pr diff <n>`. To run things, you need its head locally: if `git rev-parse HEAD` already
  equals `headRefOid`, stay where you are; otherwise `gh pr checkout <n>`
- a branch name → `git diff origin/main...<branch>`
- nothing → if the current branch has an open PR (`gh pr view --json number`), review that PR;
  otherwise `git diff origin/main...HEAD` plus uncommitted changes (`git diff HEAD`)
- `--comment` → post the findings to the PR (step 6); without it, only print the report

Automation checkouts are often shallow and have no local `main`, so `git diff main...` fails with
"no merge base". First run `git fetch --unshallow origin 2>/dev/null; git fetch origin <base>` and
diff against `origin/<base>`.

Empty diff → report "Nothing to review" and stop.

## 2. Read the context first

1. `AGENTS.md`: the definition of done.
2. `spec/` (all of it): what the code must do. The spec is the source of truth.
3. The PR title/body, if any: what the author claims the change does. Every claim in it
   ("can be opened in a new tab", "N repositories with skills", "tests pass") is something to check.
4. Every changed file **in full**, not just the hunks, plus the callers and callees the change touches.

Architecture to keep in mind:
- `src/core`: fetch → find → parse; `src/core/github.ts` talks to GitHub; nothing is stored.
- `src/cli.ts` / `src/commands.ts`: a thin CLI client. `src/browser.ts`: the same scan for the browser,
  no Node APIs.
- `web/`: the React web view (`App.tsx`, `style.css`), drawably controls, built by Vite. State that
  must agree: the field, the `?repo=` address, and the result on screen.
- `tests/*.test.ts`: integration tests against `fixture/`. `tests/e2e/`: real GitHub.
  `tests/web/*.spec.ts`: Playwright on the built page, GitHub answered from `tests/web/recording.ts`.

## 3. Run the checks

Run what CI runs (`.github/workflows/ci.yml` is the reference; re-read it in case it changed):

```bash
npm ci
npm run typecheck
npm test
./skill-atlas help && ./skill-atlas scan ./fixture      # smoke: must exit 0
```

- `npm run test:e2e` — when the change touches `src/core/github.ts`, fetching, URL/ref handling or
  `tests/e2e/`, and the network is available. Set `GITHUB_TOKEN` (`gh auth token`) if you can.
- `npm run test:web` — when the change touches `web/`, `src/browser.ts`, `src/core`, `tests/web/`
  or `playwright.config.ts`. Needs `npx playwright install --with-deps chromium` first.

A check you did not run is reported as `skipped (why)`, never as passing.
Any failing command is a finding: quote the relevant output.

For a PR, also check CI: `gh pr checks <n>`. On a freshly opened PR it is usually still pending —
check again at the end of the review. Red is a finding; still pending is a note in the report.

## 4. Look for problems

In this order of importance:

1. **Correctness** — wrong behavior on real input.
   - Core/CLI: edge cases from `spec/analysis.md` (copies, nested skills, `skill.md` vs `SKILL.md`,
     symlinks, malformed front matter, unknown refs, truncated trees, missing files at the scanned
     commit, root `SKILL.md`), exit codes, stdout vs stderr, error messages, async/await mistakes,
     unhandled rejections, rate limits, pagination, path handling on GitHub vs local.
   - Web view: every way to start a scan (submit, Enter, links, `?repo=` on load) — can two scans
     overlap, and does the *last* one win? Does a loading/disabled state cover every entry point?
     Do the field, the address and the shown result stay in agreement? Links with an `onClick` that
     calls `preventDefault()` must still let Ctrl/Cmd/Shift-click open a new tab. Global CSS
     selectors that now hit new elements.
   - Facts the change asserts about the outside world (example repositories, URLs, counts):
     check them for real, e.g. `./skill-atlas scan <URL>` for each listed repository.
2. **Spec drift** — behavior changed but `spec/` not updated, or spec updated but code doesn't
   match it. AGENTS.md: "Update it with the code".
3. **Missing tests** — every case in the spec needs an integration test. A new or changed spec
   case without a test in `tests/` (`tests/e2e/` for real-GitHub behavior, `tests/web/` for the
   page) is a finding. Tests that can't fail, or that check one item where the spec says "each",
   count too.
4. **Architecture** — logic leaking into the CLI or the page instead of `src/core`; cloning instead
   of the GitHub API; storing anything (the CLI "stores nothing", the page neither); performance
   regressions against "under 5 s for intellij-community" (e.g. one request per file instead of a
   tree listing).
5. **Security** — tokens in logs or error messages, unsanitized paths, command injection,
   untrusted text rendered as HTML.
6. **Docs** — README examples that no longer match the output.

Skip pure style preferences, formatting and naming nitpicks unless they hide a bug.

## 5. Verify every finding

Before reporting, try to disprove each candidate:
- Re-read the surrounding code; check whether another layer already handles it.
- Prove it where possible: a failing command, a quick script against `fixture/`, or a concrete
  input → wrong output trace. Scratch files go in `/tmp`, never in the repo.
- Web behavior: write a throwaway Playwright test. Recipe:
  ```bash
  mkdir -p /tmp/rv && ln -sf "$PWD/node_modules" /tmp/rv/node_modules
  # /tmp/rv/pw.config.ts: testDir '/tmp/rv'; baseURL http://localhost:4173/;
  #   webServer { command: 'npx vite build web && npx vite preview web --port 4173 --strictPort',
  #               cwd: '<repo>', url: 'http://localhost:4173/', reuseExistingServer: true }
  # /tmp/rv/probe.spec.ts: import { RECORDING } from '<repo>/tests/web/recording.ts' and answer
  #   GitHub with page.route(...) like tests/web/view.spec.ts does
  npx playwright test -c /tmp/rv/pw.config.ts
  ```
  Delay chosen routes (`await new Promise(r => setTimeout(r, 300))` before `route.fulfill`) to
  expose races; `click({ modifiers: ['ControlOrMeta'] })` plus `context.waitForEvent('page')` to
  check new-tab behavior.
- Drop anything you can't back with a concrete failure scenario. Mark the rest
  **confirmed** (reproduced) or **plausible** (reasoned, not reproduced).

Severity: **important** — a user can hit it, or it breaks the spec, a claim of the PR or the
definition of done. **nit** — real but minor (a weak test, an inconsistency with no visible effect).

Prefer a few real findings over many speculative ones. Zero findings is a valid result.

## 6. Report

Print a markdown report:

```markdown
## Code review: <PR #n title | branch>
<one sentence: what the change does>

**Verdict:** ✅ ready | ⚠️ ready after fixes | ❌ not ready

**Checks:** typecheck ✅/❌ · tests ✅/❌ · web ✅/❌/skipped (why) · e2e ✅/❌/skipped (why) · smoke ✅/❌ · CI ✅/❌/pending

### Findings
1. **[important|nit] [confirmed|plausible] <short title>** — `path/to/file.ts:42`
   What is wrong. Failure scenario: <input/state> → <wrong result>. How it was confirmed: <one line>.
   Suggested fix: <one line>.

### Checked, no problem
- <one line each for the notable things you verified and found fine>

### Definition of done (AGENTS.md)
- [ ] spec updated with the code
- [ ] integration test for every spec case touched
- [ ] all tests pass locally
- [ ] CI green
```

Order findings by severity. Line numbers are of the file at the reviewed head.
Verdict: ❌ if any check fails or any confirmed `important` finding; ⚠️ if only plausible/nit
findings or the definition of done is incomplete; ✅ otherwise.

With `--comment` and a PR target:
- Post each finding with a file/line **inside the diff** as an inline review comment on the PR's
  head commit:
  `gh api repos/{owner}/{repo}/pulls/<n>/comments -f body=... -f commit_id=<head sha> -f path=... -F line=... -f side=RIGHT`
  A line outside the diff can't take an inline comment: keep that finding in the summary only.
- Post the full report once as a PR comment: `gh pr comment <n> --body-file <report.md>`
- Never approve or request changes, never merge, never close.
- Before posting, check existing comments (`gh api repos/{owner}/{repo}/pulls/<n>/comments` and
  `gh pr view <n> --json comments`) and skip findings already reported, so reruns of the automation
  don't duplicate them.

If a report file is wanted, write it to `$AIR_ARTIFACTS_DIR/code-review.md` when that variable is set.
