---
name: pr-demo
description: Records a mini demo of what a Skill Atlas pull request changes - a short GIF of the web view clicked through in Chromium, or the real CLI output - and puts it in the pull request's description. For every agent that opens a pull request.
argument-hint: "[PR number, empty = the PR of the current branch]"
---

# PR demo

A pull request that changes what a user sees or gets shows it: a `## Demo` section in its
description, recorded from the code of the PR's head, not described from memory.
Runs **unattended**: never ask questions, never wait for input.

- **Web view changed** (`web/`, or `src/` behaviour the page shows) → a GIF, 5 to 15 seconds, of
  the new behaviour being used (step 1), published on a side branch (step 2).
- **CLI or core changed** → the real command and its real output, as a `console` block (step 3).
  Both changed → both.
- **Nothing a user can see** (tests, docs, CI, agent tooling, a refactoring) → no recording. The
  section says so in one line: `## Demo` / `Nothing visible changes: <why>.`

Rules:
- The demo is **evidence**: only what the recording or the command really showed. Never edit a
  frame or an output line, never show a mock of a feature. A trimmed output says `…` where it was cut.
- Nothing of the demo is committed to the PR's branch or to `main`: scratch files live in
  `/tmp/demo`, media on the `demo/<branch>` side branch.
- No secrets on screen: never type a real token into the page or print one in the console block
  (use `ghp_example` in a field, and run commands with the token in the environment).
- A demo that cannot be recorded (no browser, no `ffmpeg`, the push refused) never blocks the
  pull request: the section says what is missing, in one line.

## 1. Record the web view

Run this block as is from the repository root, on the PR's head, after `npm ci` and
`npx playwright install --with-deps chromium`; then adapt the lines marked `adapt` and run it
again. (The block is unindented on purpose, and the heredocs expand `$PWD`, so don't put `${...}`
in them.) To run it without retyping:
`sed -n '/^mkdir -p \/tmp\/demo/,/^ls -la \/tmp\/demo\/demo/p' .claude/skills/pr-demo/SKILL.md > /tmp/demo-recipe.sh && bash /tmp/demo-recipe.sh`

```bash
mkdir -p /tmp/demo && rm -rf /tmp/demo/out /tmp/demo/demo.gif /tmp/demo/demo.png && ln -sfn "$PWD/node_modules" /tmp/demo/node_modules
cat > /tmp/demo/pw.config.ts <<EOF
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '/tmp/demo', testMatch: 'demo.spec.ts', reporter: 'list', outputDir: '/tmp/demo/out',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173/',
    viewport: { width: 960, height: 640 }, video: { mode: 'on', size: { width: 960, height: 640 } } },
  webServer: { command: 'npx vite build web && npx vite preview web --port 4173 --strictPort',
    cwd: '$PWD', url: 'http://localhost:4173/', reuseExistingServer: false },
});
EOF
cat > /tmp/demo/demo.spec.ts <<EOF
import { test } from '@playwright/test';
import { RECORDING } from '$PWD/tests/web/recording.ts';

// GitHub answered from the tests' recording: the demo is the same on every run and needs no token.
test.beforeEach(async ({ context }) => {
  await context.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const a = RECORDING[route.request().url()];
    if (!a) return route.abort('internetdisconnected');
    await route.fulfill({ status: a.status, body: typeof a.body === 'string' ? a.body : JSON.stringify(a.body),
      headers: { 'access-control-allow-origin': '*' } });
  });
});

test('demo', async ({ page }) => {
  const pause = (ms = 1200) => page.waitForTimeout(ms);   // a viewer needs time to read each step
  await page.goto('./');
  await pause();
  // adapt: from here on, use the feature the PR adds, the way a user would
  await page.getByLabel('Repository link').pressSequentially('https://github.com/JetBrains/atlas-demo', { delay: 25 });
  await pause(600);
  await page.getByRole('button', { name: 'Scan' }).click();
  await page.getByRole('heading', { level: 2 }).waitFor();
  await pause(2000);
  // adapt: end on the state that shows the change, and hold it
  await page.screenshot({ path: '/tmp/demo/demo.png' });
  await pause(1500);
});
EOF
npx playwright test -c /tmp/demo/pw.config.ts 2>&1 | grep -E 'passed|failed|Error' ; VIDEO=$(find /tmp/demo/out -name '*.webm' | head -1)
command -v ffmpeg >/dev/null || sudo apt-get install -y -qq ffmpeg >/tmp/demo/ffmpeg-install.log 2>&1
ffmpeg -y -loglevel error -i "$VIDEO" -vf "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse" /tmp/demo/demo.gif
ls -la /tmp/demo/demo.gif /tmp/demo/demo.png
```

- `1 passed` and both files listed → look at `demo.png` (and a frame or two of the GIF) before
  publishing: it must show the change, not a loading state or an error.
- The feature needs answers the recording does not have (another repository, an error case) →
  the PR's own tests added them to `tests/web/recording.ts`: use those. Do not let the demo talk
  to live GitHub: without a token it runs into the rate limit in the middle of the recording.
- Keep the GIF under 5 MB: shorter pauses, fewer steps, or `fps=6`.
- No `ffmpeg` and it cannot be installed → publish `demo.png` alone.
- `/tmp/demo` is scratch; never add it to the repository.

## 2. Publish the recording

The media goes to a side branch that holds nothing else, `demo/<PR branch>`, as a commit made
without touching the working tree or the index. Run from the repository root, on the PR's branch:

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD); REF="refs/heads/demo/$BRANCH"
PARENT=$(git ls-remote origin "$REF" | cut -f1); [ -n "$PARENT" ] && git fetch -q origin "$REF"
TREE=$(for f in /tmp/demo/demo.gif /tmp/demo/demo.png; do [ -f "$f" ] && printf '100644 blob %s\t%s\n' "$(git hash-object -w "$f")" "$(basename "$f")"; done | git mktree)
COMMIT=$(git commit-tree "$TREE" ${PARENT:+-p "$PARENT"} -m "Demo of $BRANCH at $(git rev-parse --short HEAD)")
git push -q origin "$COMMIT:$REF" && echo "https://raw.githubusercontent.com/$(gh repo view --json nameWithOwner --jq .nameWithOwner)/$COMMIT/demo.gif"
```

- It prints the GIF's address, pinned to the commit, so a later demo does not change an earlier
  description. `demo.png` is at the same address with `.png`.
- A second demo of the same branch is a new commit on top of the first: a plain push, never a
  forced one. The side branch has no workflow file, so CI does not run on it, and no automation
  listens to it.
- The push is refused → no retry with other means: the section says "recorded, not published:
  `<git's message>`", and the files go to `$AIR_ARTIFACTS_DIR` when it is set.

## 3. The CLI

Run the real command on the PR's head and keep what it printed, the exit code included when it
matters:

```bash
GITHUB_TOKEN=$(gh auth token) timeout 60 ./skill-atlas scan <what the PR is about> 2>&1 | head -30; echo "exit code ${PIPESTATUS[0]}"
```

Prefer `./fixture` or a repository pinned to a commit (`/tree/<sha>`), so the output can be
reproduced. More than ~20 lines → keep the first lines, the lines the change is about, and `…`.

## 4. Put it in the description

One `## Demo` section, after the summary of the change:

````markdown
## Demo

![<one line: what is done and what appears>](https://raw.githubusercontent.com/<owner>/<repo>/<commit>/demo.gif)

```console
$ ./skill-atlas scan ./fixture
fixture · 3 skills
…
```

Recorded on `<short sha of the PR head>`; GitHub answered from `tests/web/recording.ts`.
````

- Opening the PR: write the section into the body file before `gh pr create`. The branch must be
  pushed first; record after the checks pass, so the demo is of the code that is proposed.
- The PR exists already: `gh pr view <n> --json body --jq .body > /tmp/demo/body.md`, replace
  the `## Demo` section (or add it), `gh pr edit <n> --body-file /tmp/demo/body.md`. Never add a
  second section, and never post the demo as a comment.
- Later commits changed what the demo shows → record again and replace the section; the line
  under it names the new sha.
- When `$AIR_ARTIFACTS_DIR` is set, copy `demo.gif` and `demo.png` there too.
