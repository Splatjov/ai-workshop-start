# Web view
`npm run web`: a page with a field for a **GitHub repository or organization link**, a field for
a **GitHub token**, the skills with a **filter**, and the `SKILL.md` of the chosen one. Hand-drawn: [drawably](https://www.npmjs.com/package/drawably)
controls and [@sketchyicons/react](https://www.npmjs.com/package/@sketchyicons/react) icons. `npm run web:build`: a static site in `web/dist`.
## Behaviour
- The same scan as the CLI (`createBrowserBackend().scan`), from the browser, over live GitHub;
  the same URLs, `/tree/<ref>` and `github.com/<owner>` included
- **GitHub token**: a password field under the link, optional. The next scan sends it to GitHub,
  as the CLI sends `GITHUB_TOKEN`, but for *a higher rate limit only*: GitHub's code search answers
  without CORS headers, so a page cannot read it. With a token or without, the page lists every
  repository through its tree, an organization's too. It lives in the page's memory: *not* in the
  address, *not* stored, gone on reload. Empty → a scan without a token
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
  `GitHub rate limit reached; fill in the GitHub token field`; a tree too large to list, with a
  token or without → the warning ends `(the CLI with GITHUB_TOKEN searches everywhere)`; at
  `/tree/<ref>` it ends `(code search sees only the default branch)`, as the CLI's does: no
  search reaches another ref, the CLI's neither
- No `SKILL.md` → `0 skills`, nothing to choose
- Examples, under the field: `anthropics/skills`, `obra/superpowers`, `vercel-labs/agent-skills`,
  `openai/codex`, `huggingface/skills`, `trailofbits/skills`, `getsentry/skills`,
  `JetBrains/kotlin`, `JetBrains/koog`, each a link to `?repo=<its URL>`;
  clicking one puts its URL in the field and scans it; Ctrl/Cmd-, Shift- and middle-click open it
  in a new tab or window, as any link
- A scan started while another runs wins: only the latest scan's result is shown
- `?repo=<URL>` in the page's address scans at once; scanning writes it there, so a scan can be
  shared or reloaded. *Nothing is stored*
## Tests
- `tests/web.test.ts`: the browser backend's `scan`, on recorded GitHub answers
- `tests/web/*.spec.ts`, `npm run test:web`: the built page in Chromium, GitHub answered from
  recordings
