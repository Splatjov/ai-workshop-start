---
name: manual-qa
description: A manual QA pass of the Skill Atlas web view by an agent - follows each standard test script in qa/ step by step in Chromium, like a tester, records a video of each, and reports pass or fail with the step and the second in the video; opens an issue for each failure. Built to run unattended in the "Manual QA" automation, or by hand before a release.
argument-hint: "[script names, e.g. filter organization; empty = every script in qa/]"
---

# Manual QA

Follow the standard test scripts in `qa/` (see [qa/README.md](../../../qa/README.md)) in a real
browser, against live GitHub, the way a tester would, and leave evidence a person can check in a
minute: a video of each script, a screenshot of each step, and a report.
Runs **unattended**: never ask questions, never wait for input.

Rules:
- **The scripts are the source of truth.** Follow each step exactly as written: its link, its
  words, its order. Do not add steps, skip steps, or test what a script does not say. A step you
  cannot follow as written (no such field, a button that does nothing) is a **fail** of that step,
  never something to work around. A script that seems wrong is a note in the report, not an edit.
- **Judge by what the page shows**: each step's screenshot, looked at, and its text. A **See**
  holds only if everything it lists is there. A count or a word that differs is a fail; layout
  details the script does not name are not.
- **Live data**: where a script says "at least", a bigger number passes. GitHub's rate limit, a
  timeout of GitHub itself, or no network is **blocked**, not fail: say what and when.
- **Never change the repository**: no commits, no PR, no edits to `qa/`, the code or the skills.
  What this run writes: scratch in `/tmp/qa`, the evidence on the `qa/runs` side branch (step 4),
  and issues for failures (step 5).
- **No secrets in the evidence.** A token goes only into the *GitHub token* field, with `fill`
  (a password field: the video shows dots), from `gh auth token`; never in a command line you
  quote, a report or an issue. Traces stay off: they keep what is typed.

## 1. Prepare

From the repository root, on `main`:

```bash
npm ci > /tmp/qa-npm.log 2>&1 && npx playwright install --with-deps chromium > /tmp/qa-pw.log 2>&1   # apt 404 → sudo apt-get update, again
command -v ffmpeg >/dev/null || sudo apt-get install -y -qq ffmpeg > /tmp/qa-ffmpeg.log 2>&1
git rev-parse --short HEAD   # the commit under test: it goes into the report
```

Then the harness, as is (unindented on purpose; the heredocs expand `$PWD`). To run it without
retyping: `sed -n '/^mkdir -p \/tmp\/qa/,/^echo harness ready/p' .claude/skills/manual-qa/SKILL.md > /tmp/qa-harness.sh && bash /tmp/qa-harness.sh`

```bash
mkdir -p /tmp/qa && rm -rf /tmp/qa/out /tmp/qa/evidence && ln -sfn "$PWD/node_modules" /tmp/qa/node_modules
cat > /tmp/qa/pw.config.ts <<EOF
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '/tmp/qa', testMatch: '*.qa.ts', reporter: 'list', outputDir: '/tmp/qa/out',
  timeout: 180_000, workers: 1, retries: 0,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173/', trace: 'off', actionTimeout: 15_000,
    viewport: { width: 1280, height: 800 }, video: { mode: 'on', size: { width: 1280, height: 800 } } },
  webServer: { command: 'npx vite build web && npx vite preview web --port 4173 --strictPort',
    cwd: '$PWD', url: 'http://localhost:4173/', reuseExistingServer: false },
});
EOF
cat > /tmp/qa/qa.ts <<'EOF'
// One step of a QA script: do it, let the page settle, then keep what a tester would see.
import { test, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';

let started = 0;
test.beforeEach(() => { started = Date.now(); });   // the video starts with the page

/** Runs step `n` of `script`; `settled` waits for what the step's See expects (or a short pause). */
export async function step(page: Page, script: string, n: number, action: () => Promise<unknown>,
  settled: () => Promise<unknown> = () => page.waitForTimeout(1500)) {
  const dir = `/tmp/qa/evidence/${script}`;
  mkdirSync(dir, { recursive: true });
  const second = Math.round((Date.now() - started) / 100) / 10;
  let error = '';
  try {
    await action();
    await settled().catch((e: Error) => { error = `did not settle: ${e.message.split('\n')[0]}`; });
  } catch (e) {
    error = `could not do the step: ${(e as Error).message.split('\n')[0]}`;
  }
  await page.waitForTimeout(800);   // a viewer needs a moment on each step
  await page.screenshot({ path: `${dir}/step-${n}.png`, fullPage: true });
  writeFileSync(`${dir}/step-${n}.txt`, await page.locator('body').innerText());
  appendFileSync(`${dir}/steps.jsonl`, JSON.stringify({ n, second, error }) + '\n');
  if (error.startsWith('could not')) throw new Error(`step ${n}: ${error}`);
}
EOF
echo harness ready
```

## 2. Follow each script

For each script (the arguments, or every `qa/*.md` but `README.md`), write
`/tmp/qa/<name>.qa.ts`: one `test`, one `step(...)` per numbered step, each doing exactly what its
**Do** says. Use what a tester sees: `getByLabel('Repository link')`, `getByRole('button', { name:
'Scan' })`, `getByLabel('Filter skills')`, `getByLabel('GitHub token')`. Wait in `settled` for what
the **See** expects to appear, or for an alert, with a timeout that fits it (a minute for an
organization); a `settled` that times out is not yet a fail, the screenshot decides. An action
that cannot be done (no such field) gives up after 15 s: the step could not be done. Example,
`qa/filter.md` steps 1-3:

```ts
import { test } from '@playwright/test';
import { step } from './qa.ts';

test('filter', async ({ page }) => {
  const s = 'filter';
  const result = page.getByRole('heading', { level: 2 }).or(page.getByRole('alert'));
  await step(page, s, 1, async () => {
    await page.goto('./');
    if (process.env.QA_TOKEN) await page.getByLabel('GitHub token').fill(process.env.QA_TOKEN);
  });
  await step(page, s, 2, async () => {
    await page.getByLabel('Repository link').pressSequentially('https://github.com/JetBrains/koog/tree/709079e', { delay: 20 });
    await page.getByRole('button', { name: 'Scan' }).click();
  }, () => result.first().waitFor({ timeout: 60_000 }));
  await step(page, s, 3, () => page.getByLabel('Filter skills').pressSequentially('weather', { delay: 60 }));
  // … every step of the script, none added
});
```

The token: `QA_TOKEN=$(gh auth token)` in the environment; each script says in which step it
goes into the field. Without one, a script that says it *needs* a token is **blocked**, and the
others run without (and may get blocked by the rate limit: say so).

Run them all (`QA_TOKEN=$(gh auth token) npx playwright test -c /tmp/qa/pw.config.ts 2>&1 | tail -20`),
then **judge every step**: open `step-<n>.png` and read `step-<n>.txt` of
`/tmp/qa/evidence/<script>/`, and hold them against the step's **See**, item by item.
- Pass: everything the See lists is there.
- Fail: the first step whose See does not hold, or that could not be done; note what was seen
  instead, in one line, and its `second` from `steps.jsonl`. The later steps of that script are
  `not run` when they could not be done, else judge them too.
- A failure you suspect is the run's (a selector of yours, a step done too fast) → fix your
  `.qa.ts`, not the script, and run that script again, once. Report only the second run.

Then the media, for each script:

```bash
for d in /tmp/qa/evidence/*/; do s=$(basename "$d"); v=$(find /tmp/qa/out -path "*$s*" -name '*.webm' | head -1)
  cp "$v" "$d/video.webm"
  ffmpeg -y -loglevel error -i "$v" -vf "fps=6,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse" "$d/video.gif"
done; du -sh /tmp/qa/evidence/*
```

A GIF over 8 MB → `fps=4` or `scale=640`. No `ffmpeg` → the videos alone.

## 3. The report

`/tmp/qa/evidence/report.md`:

```markdown
# Manual QA of <short sha>, <YYYY-MM-DD>

| Script | Result | Where |
|---|---|---|
| filter | ✅ pass | 5 steps |
| organization | ❌ fail at step 4 | 0:41 in [video](<url>/organization/video.webm): `1 of 397 skills` but two repositories listed |
| errors | ⏸ blocked | GitHub rate limit at step 3 |

## <script> (one section per script that did not pass)
Step <n>, **See:** <the line of the script>. **Seen:** <what the screenshot shows>.
![step <n>](<url>/<script>/step-<n>.png)
```

## 4. Publish the evidence

On the `qa/runs` side branch, one commit per run, made without touching the working tree, as
`pr-demo` does; it has no workflow file and no automation listens to it:

```bash
REF=refs/heads/qa/runs; PARENT=$(git ls-remote origin "$REF" | cut -f1); [ -n "$PARENT" ] && git fetch -q origin "$REF"
DIR="$(date -u +%Y-%m-%d)-$(git rev-parse --short HEAD)"
INDEX=/tmp/qa/index; rm -f "$INDEX"
(cd /tmp/qa/evidence && find . -type f ! -name '*.txt' ! -name '*.jsonl' | sed 's#^\./##') | while read -r f; do
  GIT_INDEX_FILE=$INDEX git update-index --add --cacheinfo "100644,$(git hash-object -w "/tmp/qa/evidence/$f"),$DIR/$f"
done
COMMIT=$(git commit-tree "$(GIT_INDEX_FILE=$INDEX git write-tree)" ${PARENT:+-p "$PARENT"} -m "Manual QA of $(git rev-parse --short HEAD)")
git push -q origin "$COMMIT:$REF" && echo "https://raw.githubusercontent.com/$(gh repo view --json nameWithOwner --jq .nameWithOwner)/$COMMIT/$DIR"
```

That prints `<url>`, pinned to the commit: put it into the report's links, and push again only if
the report changed (a new commit on top, never a forced push). Push refused → the evidence goes to
`$AIR_ARTIFACTS_DIR` (when set) and the report says "not published: `<git's message>`".
When `$AIR_ARTIFACTS_DIR` is set, copy `/tmp/qa/evidence` there too.

## 5. An issue for each failure

For each script that **failed** (not blocked), one issue, unless an open one has it already:
`gh issue list --state open --search "in:title \"Manual QA: <script>\"" --json number,title`.
Found → a comment on it with this run's line and video, not a new issue. Otherwise:

```bash
gh issue create --title "Manual QA: <script> fails at step <n>" --body-file /tmp/qa/issue-<script>.md
```

The body: the script (a link to `qa/<script>.md` at the tested sha), the commit, the failing
step's **Do** and **See**, what was seen, the screenshot, the GIF inline
(`![<script>](<url>/<script>/video.gif)`), the video link with the second, and the steps before
it that passed. No label: a person decides whether it is delegated to AI. The issue is opened by
`jetbrains-air[bot]`, so it does not start "Issue start", which only takes a trusted author's issue.

Blocked scripts get no issue: they are in the report and the run summary.

## 6. The run summary

The sha, one line per script (pass, fail at step n, blocked: why), the report's link, the issues
opened or commented on, and "Script notes": a script step that looked wrong or ambiguous, for a
person to change in `qa/`.
