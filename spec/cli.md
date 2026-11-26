# Command line
`./skill-atlas scan <GitHub URL | directory> [--filter <words>]`; a `/tree/<ref>` URL pins a
commit; `github.com/<owner>` scans all of an organization's repositories
Prints the result **at once**; *nothing is stored*.
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
