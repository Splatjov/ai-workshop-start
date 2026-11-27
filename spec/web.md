# Web view
`npm run web`: an **atlas of worlds**, drawn by hand. A field for a **GitHub repository or
organization link**, and one for a **GitHub token**; every repository scanned is a **world** of a
system, *the more alike the skills of two, the closer they stand*; and, at a world, its skills as
an index with a **filter** and as the places of its map, and the `SKILL.md` of the chosen one, on a
sheet of its own. Hand-drawn:
[drawably](https://www.npmjs.com/package/drawably) controls,
[@sketchyicons/react](https://www.npmjs.com/package/@sketchyicons/react) icons, and the worlds, in
WebGL ([three](https://www.npmjs.com/package/three)), in the same pen. `npm run web:build`: a static
site in `web/dist`.
## Behaviour
- The same scan as the CLI (`createBrowserBackend().scan`), from the browser, over live GitHub;
  the same URLs, `/tree/<ref>` and `github.com/<owner>` included
- **GitHub token**: a password field under the link, optional. The next scan sends it to GitHub,
  as the CLI sends `GITHUB_TOKEN`, but for *a higher rate limit only*: GitHub's code search answers
  without CORS headers, so a page cannot read it. With a token or without, the page lists every
  repository through its tree, an organization's too. It lives in the page's memory: *not* in the
  address, *not* stored, gone on reload. Empty → a scan without a token
- A scan charts its repository's world, and the view goes to it
- **Filter**: a field above the skills, once a scan has found some. As the CLI's `--filter`, while
  typing: only the matching skills are listed, the count reads `M of N skills`; the chosen skill
  stays if it matches, else the first match is chosen; no match → `No skill matches “<words>”`,
  nothing chosen. On the world, only the places of the skills listed are named. A new scan clears it
- **Group by theme**: a switch next to the filter, off at first. On: the skills under their
  themes (`spec/analysis.md`, "Themes"), each `<title> · N skills`, instead of under their
  repositories; of an organization, each skill's path after its repository's `owner/repo/`. With
  the filter, of the skills it leaves. The chosen skill stays; else the first one shown is chosen.
  It stays as set for the next scan; *not* in the address, *not* stored. Where the index is
  narrow (a phone; the column beside a world's map) it goes under the filter, which keeps the
  whole row. On the world, the places are the same, grouped or not
- **Organization**: every repository of it that has skills is charted, each a world; the view stays
  over the system, with `<owner>`, linked, and `N skills in R repositories`; the skills under their
  repository's `owner/repo`, linked at its scanned commit; the first skill of the first repository
  is chosen, and the world of the chosen skill is marked. The filter spans every repository; one
  without a match is not listed
- The repository: `owner/repo` linked at the scanned commit, and `N skills`
- The skills: sorted by **name**, each with its description's *first sentence* and its path
- The first skill is chosen; clicking another chooses it; in the index, `↓` and `↑` choose the next
  and the previous. A long index scrolls; the chosen skill stays in view
- The chosen skill: name, the whole description, the link pinned to the scanned commit,
  `also in <paths>` for copies, its size (`N lines · N B`, `N.N kB` from a thousand bytes), and its
  `SKILL.md` *as scanned*, front matter included, as text, line by line
- Warnings: under the repository, as notes; however many, the index keeps its room
- An unreachable repository, an unknown ref, a non-GitHub link → the CLI's message, as an alert;
  the view stays over the system
- The token's messages name the field, not the CLI's `GITHUB_TOKEN`: a token GitHub rejects →
  `GitHub rejected the token in the GitHub token field`; past the rate limit without a token →
  `GitHub rate limit reached; fill in the GitHub token field`; a tree too large to list, with a
  token or without → the warning ends `(the CLI with GITHUB_TOKEN searches everywhere)`; at
  `/tree/<ref>` it ends `(code search sees only the default branch)`, as the CLI's does: no
  search reaches another ref, the CLI's neither
- No `SKILL.md` → `0 skills`, nothing to choose
- Examples, under the field until a world is in view: `anthropics/skills`, `obra/superpowers`,
  `vercel-labs/agent-skills`, `openai/codex`, `huggingface/skills`, `trailofbits/skills`,
  `getsentry/skills`, `JetBrains/kotlin`, `JetBrains/koog`, each a link to `?repo=<its URL>`;
  clicking one puts its URL in the field and scans it; Ctrl/Cmd-, Shift- and middle-click open it
  in a new tab or window, as any link. `chart all`, beside their caption, scans every example not
  yet charted; the view stays over the system
- A scan started while another runs takes the view: only the latest scan's result is shown. The
  earlier one's world is charted where it stands. Going to a world, to an organization's skills or
  back to the system while a scan runs is the latest move too: that scan is charted where it
  stands, and the view, the field and the address stay where the user went
- `?repo=<URL>` in the page's address scans at once. Several `repo`s chart them all, the first in
  view; with `view=system`, none is, and the page opens over the system. Scanning and going from
  world to world write the address so: a system can be shared or reloaded. *Nothing is stored*
## The system
- Every repository scanned is a **world**. The examples are in the system before they are scanned,
  *not yet charted*: all sea, pencilled in, waiting on the rim of the plate
- **How alike** two repositories are, 0 to 100%: the cosine between what the skills of the one say
  and what the skills of the other do. A skill says its words (lower case, three letters or more,
  the commonest left out, plurals as one): its name weighs most, then its description, then the
  rest of its `SKILL.md`; and a word tells more the fewer of the two repositories' skills say it.
  The same skills → 100%; no word in common, or no skills → 0%. It depends on the two alone
- **The more alike, the closer**: the worlds stand over a plate, where the distances between them
  are as near as a plane allows to what their likeness asks for. The same skills → all but
  touching; no two overlap. *The same repositories, the same system*
- A world is the larger, the more skills it has; and wears a ring for every other folder its skills
  are copied into (`.github/skills` beside `.claude/skills`)
- The register: the charted worlds by name, each with `N skills` and the world nearest to it,
  `N% alike`. Clicking an entry goes to its world; pointing at an entry marks its world, and
  pointing at a world marks its entry. Over it, the organizations that were scanned, each with
  `N skills in R repositories`: a click, and its skills are read again
- A thread from each world to the one most like it, with how alike they are, in percent, half way
  along; the world pointed at is ringed in red, and has a thread to every other
- A world's name is written under it; or over it, or beside it, where there is no room. It keeps
  clear of the other names and worlds, and of what the page writes over the sky: the title, the
  form, the register, the index, the sheet, the notes. A name with no room anywhere is left out,
  until its world is pointed at. How alike two worlds are keeps clear of the names: where one is
  written half way along the thread, it is written elsewhere along it, or beside it. It is never
  left out: every thread drawn has its percent. One with no room along its thread or beside it is
  written at the one of these spots where it is least in the way: over a world rather than over a
  name or what the page writes (between two worlds that all but touch: half way, where they meet)
- Clicking a world goes to it; one not yet charted is scanned first
- The wheel, or two fingers on a trackpad, goes nearer to the world under the pointer, and back to
  the system; where the page itself scrolls, the wheel is the page's. `Escape` and `the system`,
  over the repository, go back too
- At a world: the three worlds most alike, each with how alike, a step away
- Dragging over the system turns the plate
- While a scan runs, a meridian sweeps its world; what cannot be scanned is scribbled over, until
  the next scan
## A world
- Engraved, in pen on paper: its sea in lines that swell where the light does not reach, its lands
  washed with the marker; its lines *boil* as drawably's do
- Every skill is a **place**, with its name beside it; the longer its `SKILL.md`, the higher it
  stands, in contours. A copy is a ring beside its skill
- The directory that holds the skills' folders is their **land**: its places stand on it, roads
  join them, and there is a strait between two lands. Every place is on land
- The *scanned commit* seeds the world: the same commit, the same world
- Clicking a place chooses its skill; the chosen place is circled in red, and turns to the front
- Pointing at a skill in the index marks its place, with a ring of ink, and pointing at a place
  marks its skill
- Dragging turns the world
- **Day**, pen on paper, or **night**, chalk on cyanotype: the system's at first, then the switch's.
  *Nothing is stored*
- `prefers-reduced-motion` → the sky is drawn, and still; the eye is at once where it goes
- No WebGL → the page works without the sky
## Recordings and screenshots
- **The demo as a test**: `tests/web/walkthrough.spec.ts` walks the page as a user would (open,
  over the system; scan a repository, at its world; choose a skill, filter, a filter without a
  match; an organization, its worlds, its filter, a link that cannot be scanned; skills grouped by
  theme) and after each step checks what the user should see
- **A video of every run**: every test of `npm run test:web` records one into `test-results/`;
  CI keeps them, with the HTML report, as the `web-recordings` artifact, passed or failed
- **Screenshots at the key moments** (`start`, `repository`, `skill`, `filter`, `no-match`,
  `organization`, `error`, `themes`): the whole page, compared pixel by pixel with its reviewed baseline in
  `tests/web/__screenshots__/`. One pixel off fails the check; CI keeps its expected, actual and
  diff images, side by side in the HTML report
- **The same pixels on every run**: the recorded GitHub answers, a 1280×800 viewport at scale 1,
  reduced motion and no animations or caret, the sky at rest (`data-rest` on its canvas),
  drawably's sketches and the sky's pen from fixed seeds (one sequence per caller, so how many
  sketches come before the sky does not change it), and the fonts of the Playwright container
  (`mcr.microsoft.com/playwright:v<@playwright/test>-noble`)
- The screenshots are compared only in that container: on CI, and with `npm run
  test:screenshots` (Docker, or Podman), which sets `SCREENSHOTS=1`. Elsewhere `npm run test:web`
  skips the comparisons and keeps the behaviour checks
- **A change that is meant to look different** updates the baselines in the same PR, with
  `npm run test:screenshots -- --update-snapshots`; a new baseline is a reviewed decision, never
  the first answer to a red CI
## Tests
- `tests/web.test.ts`: the browser backend's `scan`, on recorded GitHub answers
- `tests/system.test.ts`: how alike two repositories are, and where their worlds stand, in Node
- `tests/sky.test.ts`: the chart of a scan and its terrain, in Node
- `tests/web/*.spec.ts`, `npm run test:web`: the built page in Chromium, GitHub answered from
  recordings; what the sky shows is read from its canvas
- `tests/screenshots.test.ts`: CI, the npm script and the installed Playwright name the same
  container; CI keeps the recordings; every screenshot has its baseline
