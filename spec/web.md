# Web view
`npm run web`: a page with a field for a **GitHub repository link**, its skills, and the
`SKILL.md` of the chosen one. Hand-drawn: [drawably](https://www.npmjs.com/package/drawably)
controls and [@sketchyicons/react](https://www.npmjs.com/package/@sketchyicons/react) icons. `npm run web:build`: a static site in `web/dist`.
## Behaviour
- The same scan as the CLI (`createBrowserBackend().scan`), from the browser, over live GitHub,
  *without a token*; the same URLs, `/tree/<ref>` included
- The repository: `owner/repo` linked at the scanned commit, and `N skills`
- The skills: sorted by **name**, each with its description's *first sentence* and its path
- The first skill is chosen; clicking another chooses it
- The chosen skill: name, the whole description, the link pinned to the scanned commit,
  `also in <paths>` for copies, and its `SKILL.md` *as scanned*, front matter included, as text
- Warnings: under the repository, as notes
- An unreachable repository, an unknown ref, a non-GitHub link → the CLI's message, as an alert
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
