# Web view
`npm run web`: a **celestial atlas**, drawn by hand. A field for a **GitHub repository link**; its
skills, as an index and as the stars of a globe; and the `SKILL.md` of the chosen one, on a sheet of
its own. Hand-drawn: [drawably](https://www.npmjs.com/package/drawably) controls,
[@sketchyicons/react](https://www.npmjs.com/package/@sketchyicons/react) icons, and the globe, in
WebGL ([three](https://www.npmjs.com/package/three)), in the same pen. `npm run web:build`: a static
site in `web/dist`.
## Behaviour
- The same scan as the CLI (`createBrowserBackend().scan`), from the browser, over live GitHub,
  *without a token*; the same URLs, `/tree/<ref>` included
- The repository: `owner/repo` linked at the scanned commit, and `N skills`
- The skills: sorted by **name**, each with its description's *first sentence* and its path
- The first skill is chosen; clicking another chooses it; in the index, `↓` and `↑` choose the next
  and the previous
- The chosen skill: name, the whole description, the link pinned to the scanned commit,
  `also in <paths>` for copies, its size (`7 lines · 144 B`; in `kB` from a thousand bytes), and its
  `SKILL.md` *as scanned*, front matter included, as text, line by line
- The chosen skill stays in view in the index, however long the index and however it was chosen
- Warnings: under the repository, as notes; however many, the index keeps its room
- An unreachable repository, an unknown ref, a non-GitHub link → the CLI's message, as an alert
- No `SKILL.md` → `0 skills`, nothing to choose
- Examples, under the field until a scan is shown: `anthropics/skills`, `obra/superpowers`, `vercel-labs/agent-skills`,
  `openai/codex`, `huggingface/skills`, `trailofbits/skills`, `getsentry/skills`,
  `JetBrains/kotlin`, `JetBrains/koog`, each a link to `?repo=<its URL>`;
  clicking one puts its URL in the field and scans it; Ctrl/Cmd-, Shift- and middle-click open it
  in a new tab or window, as any link
- A scan started while another runs wins: only the latest scan's result is shown
- `?repo=<URL>` in the page's address scans at once; scanning writes it there, so a scan can be
  shared or reloaded. *Nothing is stored*
## The sky
- A globe of glass, in pen on paper: its far side shows through, and its lines *boil* as drawably's do
- Every skill is a **star**, with its name beside it, or above it where there is no room beside;
  the longer its `SKILL.md`, the brighter. A copy is a ring beside its skill
- The directory that holds the skills' folders is their **constellation**: a figure joins its stars
- The *scanned commit* seeds the sky: the same commit, the same sky
- Clicking a star chooses its skill; the chosen star is circled in red, and turns to the front
- Pointing at a skill in the index marks its star, and pointing at a star marks its skill
- Dragging turns the globe
- While a scan runs, a meridian sweeps the globe; what cannot be scanned is scribbled over
- **Day**, pen on paper, or **night**, chalk on cyanotype: the system's at first, then the switch's.
  *Nothing is stored*
- `prefers-reduced-motion` → the sky is drawn, and still
- No WebGL → the page works without the sky
## Tests
- `tests/web.test.ts`: the browser backend's `scan`, on recorded GitHub answers
- `tests/sky.test.ts`: the chart of a scan, where its stars are, in Node
- `tests/web/*.spec.ts`, `npm run test:web`: the built page in Chromium, GitHub answered from
  recordings; what the sky shows is read from its canvas
