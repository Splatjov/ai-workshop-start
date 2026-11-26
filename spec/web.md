# Web view
`npm run web`: a page with a field for a **GitHub repository or organization link**, a field for
a **GitHub token**, the skills with a **filter**, and the `SKILL.md` of the chosen one. Hand-drawn: [drawably](https://www.npmjs.com/package/drawably)
controls and [@sketchyicons/react](https://www.npmjs.com/package/@sketchyicons/react) icons. `npm run web:build`: a static site in `web/dist`.
## Behaviour
- The same scan as the CLI (`createBrowserBackend().scan`), from the browser, over live GitHub;
  the same URLs, `/tree/<ref>` and `github.com/<owner>` included
- **GitHub token**: a password field under the link, optional. The next scan sends it to GitHub,
  as the CLI sends `GITHUB_TOKEN`: a higher rate limit, and code search. It lives in the page's
  memory: *not* in the address, *not* stored, gone on reload. Empty → a scan without a token
- **Filter**: a field above the skills, once a scan has found some. As the CLI's `--filter`, while
  typing: only the matching skills are listed, the count reads `M of N skills`; the chosen skill
  stays if it matches, else the first match is chosen; no match → `No skill matches “<words>”`,
  nothing chosen. A new scan clears it
- **Organization**: `<owner>`, linked, and `N skills in R repositories`; the skills under their
  repository's `owner/repo`, linked at its scanned commit; the first skill of the first repository
  is chosen. The filter spans every repository; one without a match is not listed
- The repository: `owner/repo` linked at the scanned commit, and `N skills`
- The skills: sorted by **name**, each with its description's *first sentence* and its path
- The first skill is chosen; clicking another chooses it
- The chosen skill: name, the whole description, the link pinned to the scanned commit,
  `also in <paths>` for copies, and its `SKILL.md` *as scanned*, front matter included, as text
- Warnings: under the repository, as notes
- An unreachable repository, an unknown ref, a non-GitHub link → the CLI's message, as an alert
- The token's messages name the field, not the CLI's `GITHUB_TOKEN`: a token GitHub rejects →
  `GitHub rejected the token in the GitHub token field`; past the rate limit without a token →
  `GitHub rate limit reached; fill in the GitHub token field`; a tree too large to list without
  a token → the warning ends `(the GitHub token field searches everywhere)`
- No `SKILL.md` → `0 skills`, nothing to choose
- Examples, under the field: `anthropics/skills`, `obra/superpowers`, `vercel-labs/agent-skills`,
  `openai/codex`, `huggingface/skills`, `trailofbits/skills`, `getsentry/skills`,
  `JetBrains/kotlin`, `JetBrains/koog`, each a link to `?repo=<its URL>`;
  clicking one puts its URL in the field and scans it; Ctrl/Cmd-, Shift- and middle-click open it
  in a new tab or window, as any link
- A scan started while another runs wins: only the latest scan's result is shown
- `?repo=<URL>` in the page's address scans at once; scanning writes it there, so a scan can be
  shared or reloaded. *Nothing is stored*
## Recordings and screenshots
- **The demo as a test**: `tests/web/walkthrough.spec.ts` walks the page as a user would (open,
  scan a repository, choose a skill, filter, a filter without a match; an organization, its
  filter, a link that cannot be scanned) and after each step checks what the user should see
- **A video of every run**: every test of `npm run test:web` records one into `test-results/`;
  CI keeps them, with the HTML report, as the `web-recordings` artifact, passed or failed
- **Screenshots at the key moments** (`start`, `repository`, `skill`, `filter`, `no-match`,
  `organization`, `error`): the whole page, compared pixel by pixel with its reviewed baseline in
  `tests/web/__screenshots__/`. One pixel off fails the check; CI keeps its expected, actual and
  diff images, side by side in the HTML report
- **The same pixels on every run**: the recorded GitHub answers, a 1280×800 viewport at scale 1,
  reduced motion and no animations or caret, drawably's sketches from a fixed seed, and the fonts
  of the Playwright container (`mcr.microsoft.com/playwright:v<@playwright/test>-noble`)
- The screenshots are compared only in that container: on CI, and with `npm run
  test:screenshots` (Docker, or Podman), which sets `SCREENSHOTS=1`. Elsewhere `npm run test:web`
  skips the comparisons and keeps the behaviour checks
- **A change that is meant to look different** updates the baselines in the same PR, with
  `npm run test:screenshots -- --update-snapshots`; a new baseline is a reviewed decision, never
  the first answer to a red CI
## Tests
- `tests/web.test.ts`: the browser backend's `scan`, on recorded GitHub answers
- `tests/web/*.spec.ts`, `npm run test:web`: the built page in Chromium, GitHub answered from
  recordings
- `tests/screenshots.test.ts`: CI, the npm script and the installed Playwright name the same
  container; CI keeps the recordings; every screenshot has its baseline
