# Repository analysis
## Input
A **GitHub repository** URL, a **GitHub organization** URL, or a local directory
- `github.com/<owner>/<repo>`: the default branch's latest commit
- `github.com/<owner>/<repo>/tree/<ref>`: that commit, branch or tag; listed through its tree,
  as code search sees only the default branch. An unknown ref → a clear message, exit code 1
- `github.com/<owner>`: every repository of that organization, or user, each at its default
  branch's latest commit
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Filter
Words, to show only some of the scanned commit's skills: a skill matches when *every word* is in
its name, description or path, in any case. No words → every skill. The scan is the same; only
what is shown differs
## Organization
- The same scan, for each repository; the result lists the repositories *that have skills*, by id
- With and without `GITHUB_TOKEN`, the *same result*: the repository list says which there are
- Without: each one's tree, 8 at a time: two requests a repository, so GitHub's limit of 60 an
  hour is reached past some 25 repositories → the rate limit message
- With: one code search over all of them, at most 1000 files; more → a *warning*. Code search
  leaves out archived and long inactive repositories: each repository it does not answer for is
  read through its tree, as without a token
- Forks and empty repositories are not scanned
- A warning names its repository: `<owner>/<repo>: <warning>`
- Unknown organization → a clear message, exit code 1
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit. Organization → repository → skill
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
## Where skills live
- A skill is a file named exactly `SKILL.md`, *anywhere* in the repository; `skill.md` is not one
- Named after its directory; a `SKILL.md` at the root after the repository
- A `SKILL.md` inside another skill's directory is a skill of its own
- **Copies**: the same file (same bytes) in several places is *one skill*, at its first path by
  skill root (`.agents/skills`, `.claude/skills`, `.github/skills`, `agent/skills`), then by path;
  the others are its copies. Different contents → separate skills, even under one name
- Symbolic links are not followed, locally and on GitHub
- A local directory skips `.git` and `node_modules`
- No `SKILL.md` → `0 skills`, exit code 0
- Without `GITHUB_TOKEN`, a tree too large for one answer → only the skill roots, and a *warning*;
  with it too, for an organization's repository that code search does not answer for
- Listed, but gone at the scanned commit → skipped, with a *warning*
## End-to-end tests
Real repositories, each pinned to a commit: `npm run test:e2e`, in CI too
- `JetBrains/koog` at `709079e`: 4 skills, two deep in test resources
- `JetBrains/android` at `294d4c0`: a tree too large for one answer → `0 skills` and a warning,
  under 10 s
