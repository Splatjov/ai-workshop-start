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

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests; `npm run test:e2e`, the end-to-end ones on real repositories.
A `/tree/<commit>` URL scans that commit: `./skill-atlas scan https://github.com/JetBrains/koog/tree/709079e`.

In the browser: `npm run web` opens an atlas of worlds, drawn by hand. Every repository you scan is
a world of a system, and the more alike the skills of two repositories, the closer their worlds
stand; nine example repositories wait on the rim, one click away. Zoom into a world for its map: a
land for every directory, a place for every skill, and each one's `SKILL.md`. `npm run test:web`
clicks through it in Chromium.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
