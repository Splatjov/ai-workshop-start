# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and link.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`./skill-atlas scan https://github.com/JetBrains` scans every repository of an organization;
`--filter "gradle api"` shows only the skills with those words in their name, description or path.

Set `GITHUB_TOKEN` in the environment for a higher GitHub rate limit, which an organization needs:
`GITHUB_TOKEN=<token> ./skill-atlas scan …`; in the browser, paste it into the *GitHub token* field. `npm test` runs the tests; `npm run test:e2e`, the end-to-end ones on real repositories.
A `/tree/<commit>` URL scans that commit: `./skill-atlas scan https://github.com/JetBrains/koog/tree/709079e`.

In the browser: `npm run web` opens a hand-drawn page with a field for the repository or organization link, a token field, a filter, the
skills and each one's `SKILL.md`, with nine example repositories one click away; `npm run test:web`
clicks through it in Chromium.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
