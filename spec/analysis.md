# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
- `github.com/<owner>/<repo>`: the default branch's latest commit
- `github.com/<owner>/<repo>/tree/<ref>`: that commit, branch or tag; listed through its tree,
  as code search sees only the default branch. An unknown ref → a clear message, exit code 1
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
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
- Without `GITHUB_TOKEN`, a tree too large for one answer → only the skill roots, and a *warning*
- Listed, but gone at the scanned commit → skipped, with a *warning*
## End-to-end tests
Real repositories, each pinned to a commit: `npm run test:e2e`, in CI too
- `JetBrains/koog` at `709079e`: 4 skills, two deep in test resources
- `JetBrains/android` at `294d4c0`: a tree too large for one answer → `0 skills` and a warning,
  under 10 s
