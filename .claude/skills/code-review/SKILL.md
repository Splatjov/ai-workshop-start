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

The skill's own file (`.claude/skills/code-review/SKILL.md`) and other agent tooling under `.claude/`
may be part of the diff: review it as documentation (does it match the repository?), not as product
code, and mention it under "Checked, no problem".

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

Run what CI runs (`.github/workflows/ci.yml` is the reference; re-read it in case it changed).
Install and build output is long: redirect it to a log in `/tmp` and quote only the failing part.

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

For a PR, also check CI: `gh pr checks <n>` (exit code 8 just means "some pending"). A push to a PR
branch usually starts two runs (`push` and `pull_request`); both count. On a fresh push they are
often still pending — check again at the end of the review. Still pending is a note in the
report, with the run links.

Red: read why before judging (`gh run view <run-id> --log-failed | tail -40`).
- The code fails (typecheck, a test, the smoke test) → a finding, quote the failing lines.
- Infrastructure fails (apt/npm/browser download, a mirror 404, a runner timeout) before the
  repository's code ran — often while the other run on the same commit is green → not a finding
  about the change. Rerun only the failed jobs once (`gh run rerun <run-id> --failed`), check again
  at the end, and in the report name the failing step and the cause, with the run link. Still red
  or pending at the end → CI is not green: leave its definition-of-done box unticked.

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
     check them for real, e.g. `timeout 60 ./skill-atlas scan <URL> | head -1` for each listed
     repository (with `GITHUB_TOKEN`), and say which ones you checked and what they returned.
   - A bug in old code that the change **newly makes reachable** (e.g. a race in `scan()` that was
     guarded by the disabled button, now reachable through a new link) is the change's finding:
     anchor it at the new code, not the old.
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
- Web behavior: run a throwaway Playwright probe. Run this block as is, from the repository root (the
  heredocs expand `$PWD`, so don't put `${...}` in them), then adapt the lines marked `adapt`
  (the block is unindented on purpose: an indented `EOF` does not end a heredoc). To run it
  without retyping:
  `sed -n '/^mkdir -p \/tmp\/rv/,/^npx playwright test/p' .claude/skills/code-review/SKILL.md > /tmp/recipe.sh && bash /tmp/recipe.sh`
```bash
mkdir -p /tmp/rv && ln -sfn "$PWD/node_modules" /tmp/rv/node_modules
cat > /tmp/rv/pw.config.ts <<EOF
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '/tmp/rv', testMatch: '*.spec.ts', reporter: 'list',
  use: { baseURL: 'http://localhost:4173/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npx vite build web && npx vite preview web --port 4173 --strictPort',
    cwd: '$PWD', url: 'http://localhost:4173/', reuseExistingServer: true },
});
EOF
cat > /tmp/rv/probe.spec.ts <<EOF
import { test, type Page } from '@playwright/test';
import { RECORDING } from '$PWD/tests/web/recording.ts';

// GitHub from the recording, on the whole context (so a new tab gets it too).
// Answers for SLOW are held until release(): the race happens every time, not by timing luck.
const SLOW = /atlas-demo/;
let release = () => {};
let held = Promise.resolve();
let slowPending = 0;
test.beforeEach(async ({ context }) => {
  held = new Promise<void>((r) => (release = r));
  await context.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const url = route.request().url();
    const a = RECORDING[url];
    if (!a) return route.abort('internetdisconnected');
    if (SLOW.test(url)) { slowPending++; await held; slowPending--; }
    await route.fulfill({ status: a.status, body: typeof a.body === 'string' ? a.body : JSON.stringify(a.body),
      headers: { 'access-control-allow-origin': '*' } });
  });
});
const state = async (page: Page) => JSON.stringify({
  field: await page.getByLabel('Repository link').inputValue(),
  repo: new URL(page.url()).searchParams.get('repo'),
  h2: await page.getByRole('heading', { level: 2 }).textContent({ timeout: 500 }).catch(() => null),
  button: (await page.getByRole('button', { name: /Scan/ }).textContent())?.trim(),
});

test('race: the last scan must win', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Repository link').fill('https://github.com/JetBrains/atlas-demo');
  await page.getByRole('button', { name: 'Scan' }).click();              // 1st scan, held
  await page.getByRole('link', { name: 'JetBrains/koog' }).click();      // adapt: 2nd scan, another entry point
  await page.getByRole('heading', { level: 2 }).waitFor();
  console.log('BEFORE RELEASE', await state(page));
  release();
  await test.expect.poll(() => slowPending).toBe(0);
  await page.waitForTimeout(500);                                        // let the held scan render
  console.log('AFTER RELEASE ', await state(page));
});

for (const [name, opts] of [['ctrl/cmd', { modifiers: ['ControlOrMeta'] }], ['shift', { modifiers: ['Shift'] }],
  ['middle', { button: 'middle' }]] as const) {
  test('new tab: ' + name, async ({ page, context }) => {
    await page.goto('./');
    const tab = context.waitForEvent('page', { timeout: 2000 }).then(() => true, () => false);
    await page.getByRole('link', { name: 'JetBrains/koog' }).click(opts); // adapt: the new link
    console.log('NEW TAB', name, 'opened:', await tab, 'this page:', await state(page));
  });
}
EOF
npx playwright test -c /tmp/rv/pw.config.ts 2>&1 | grep -E 'RELEASE|NEW TAB|passed|failed|Error'
```
  - Race: the 2nd scan must start through a *different* entry point than the 1st (submit, Enter, a
    link, `?repo=` on load). `AFTER RELEASE` must have field, `repo` and `h2` naming the same
    repository, the 2nd one; otherwise the stale 1st scan won. `BEFORE RELEASE` shows the 2nd
    result while the 1st scan is still held: a `button` of `Scan` there means the loading state
    ended while a scan is still running. Both are symptoms of one unguarded `scan()` (one finding),
    unless the fix cancels the 1st scan on purpose, in which case `Scan` there is correct.
    Don't replace the hold with a fixed delay: a scan is ~4 sequential requests, so "delay each
    answer 800 ms, wait 2.5 s" ends before the slow scan does and reports a false "no race".
  - New tab: report which of ctrl/cmd, shift and middle-click open one. Middle-click fires no
    `click`, so it usually works even when the others are broken; it doesn't clear the finding.
  - A change to the layout: also take screenshots (`page.screenshot({ path, fullPage: true })`)
    with a result on screen (`./?repo=https://github.com/JetBrains/atlas-demo`), at the default
    size and at a phone width (`page.setViewportSize({ width: 390, height: 800 })`), into
    `$AIR_ARTIFACTS_DIR` when set, and look at them. Only what the change caused is a finding.
  - Delete or ignore `/tmp/rv`; never add the probe to the repository.
- A confirmed bug the tests missed: say which test would have caught it (one line), so the fix
  comes with its test.
- Drop anything you can't back with a concrete failure scenario. Mark the rest
  **confirmed** (reproduced) or **plausible** (reasoned, not reproduced).

Severity: **important** — a user can hit it, or it breaks the spec, a claim of the PR or the
definition of done. **nit** — real but minor (a weak test, an inconsistency with no visible effect).
Don't inflate: a test that checks one of six items where the spec says "each" is a nit, not important.

Symptoms of one root cause are one finding (e.g. a stale result winning *and* the button going idle
too early both come from an unguarded `scan()`): list the symptoms in it, fix once.

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
Verdict: ❌ if a check fails or CI fails on the code, or the definition of done is missing (spec
not updated, no test for a new spec case); ⚠️ if any `important` finding; ✅ otherwise (nits only,
or nothing). CI red only from infrastructure doesn't set the verdict, but say so in it ("✅ ready
once CI's rerun is green").
Tick a definition-of-done box only for what you checked; write `(CI pending)` or `(CI red:
infrastructure, rerun <link>)` rather than ticking.

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

When `$AIR_ARTIFACTS_DIR` is set (an automation), always write the report to
`$AIR_ARTIFACTS_DIR/code-review.md` too, so it survives the run.
