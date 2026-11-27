# Command line
`./skill-atlas scan <GitHub URL | directory> [--filter <words>] [--group]`; a `/tree/<ref>` URL pins a
commit; `github.com/<owner>` scans all of an organization's repositories
Prints the result **at once**; *nothing is stored* but a GitHub repository's scan, in the cache (below).
## GitHub token
`GITHUB_TOKEN`, in the environment, optional: `GITHUB_TOKEN=<token> ./skill-atlas scan …`. A higher
GitHub rate limit (5000 requests an hour, not 60) and code search; in practice needed for an
organization. A read-only token for public repositories is enough. Never an argument: arguments
show in the process list and the shell history
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
- `--filter <words>` or `--filter=<words>`: only the matching skills, and `M of N skills`; every
  warning still. Without its words, or another `--option` → the usage, exit code 1
## Organization
```
JetBrains · 10 skills in 2 repositories

JetBrains/koog · 4 skills
…

JetBrains/kotlin · 6 skills
…
```
- Repositories by id, a blank line before each; each as a repository scan prints it
- With `--filter`: `M of N skills in R repositories`, only the repositories with a match
## Themes
```
JetBrains/atlas-themes · 7 skills

gradle · 2 skills
gradle-build — Build the project with Gradle.
  https://github.com/JetBrains/atlas-themes/blob/<commit>/…
…

Other · 1 skill
…
```
- `--group`: the shown skills by theme (`spec/analysis.md`, "Themes"), each group after a blank
  line, under `<title> · N skills`; with `--filter`, of the skills it leaves
- An organization: the header line, then the groups, across its repositories
## Cache
What a GitHub repository's scan read, kept on disk by its commit: a commit never changes, so what
was read at it is never stale. *The CLI only*; the web view stores nothing
- In `$XDG_CACHE_HOME/skill-atlas`, else `~/.cache/skill-atlas` (a relative `XDG_CACHE_HOME` is
  ignored): one file a commit, `<owner>/<repo>/<commit>.json` in lower case, under the
  repository's own name, whatever case or old name the URL used. A local directory: nothing kept
- Kept: every `SKILL.md` the scan read, as text (or that it was gone), and the listing's warnings;
  the skills are parsed from them again at every scan
- **A rescan**: one request, the commit (`commits/HEAD`, or the `/tree/<ref>`'s). A kept commit →
  the same output, the same warnings, *no other request*. A new commit → scanned as without a
  cache, and kept too
- Kept from the whole tree, it serves every scan of that commit, `/tree/<commit>` and with a
  token too; listed otherwise (code search with `GITHUB_TOKEN`, a tree too large for one answer),
  only a scan listed the same way. What code search found is kept like the rest, though its index
  can lag behind a push
- **Organization**: each repository at its listed commit. With a token, a kept one costs no tree
  and no file; without, its tree is still asked for (it says the commit), its files are not
- A cache file that cannot be read, cut or not one of these → a miss: the scan goes on and keeps
  it again. A cache that cannot be written → nothing kept, the same scan
- An unreachable repository, an unknown ref → the same message as without a cache
- No option: to start over, delete the directory
