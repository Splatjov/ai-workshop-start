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
- **Few requests**: the repository list, 100 a page, the pages asked for together; then
  - Without `GITHUB_TOKEN`: *one request a repository*, its tree by the branch's name, 8 at a
    time; one more, the commit, only where the tree has a `SKILL.md`. Complete: a skill anywhere
    is found. GitHub's limit of 60 an hour is reached past some 50 repositories → the rate limit
    message. A push between the two requests, a tree too large → the repository is read again
    at its commit
  - With: one code search over all of them (at most 1000 files; more → a *warning*), and *one
    request for every 25 repositories* (GraphQL) that says each one's commit and whether a usual
    skill place is at its top: `SKILL.md`, `skills`, `.agents/skills`, `.claude/skills`,
    `.github/skills`, `agent/skills`. Only a repository that the search answers for, or that
    has such a place, is read, whole, through its tree: one request. A tree listed whole is
    what is scanned: a file only the search still lists (its index is behind the branch) is not
    read, and gives no warning. A repository without skills costs none of its own. `getsentry`, 637 repositories: some 100 requests, not 1200
  - With a token, *not found*: skills only outside the usual places, in a repository code
    search does not answer for (archived, long inactive, at times an active one). Speed is
    chosen over these; without a token they are found
  - A request for 25 repositories that GitHub cannot answer in time is asked for in halves
- Past a limit with a token → the scan stops with `GitHub rate limit reached; try again in N
  minutes`, N from GitHub's answer; `try again in a minute` when the limit resets within one, or
  GitHub does not say when
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
  with it too, for an organization's repository, together with what code search found there
- Listed, but gone at the scanned commit → skipped, with a *warning*
## End-to-end tests
Real repositories, each pinned to a commit: `npm run test:e2e`, in CI too
- `JetBrains/koog` at `709079e`: 4 skills, two deep in test resources
- `JetBrains/android` at `294d4c0`: a tree too large for one answer → `0 skills` and a warning,
  under 10 s
- `JetBrains/koog` at `709079e`, scanned twice: the same output, the second from the CLI's cache
