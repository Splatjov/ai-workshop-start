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
`--group` lists the skills by theme, from the words their names and descriptions share (offline);
in the browser, the *Group by theme* switch.

Set `GITHUB_TOKEN` in the environment for a higher GitHub rate limit, which an organization needs:
`GITHUB_TOKEN=<token> ./skill-atlas scan …`; in the browser, paste it into the *GitHub token* field. `npm test` runs the tests; `npm run test:e2e`, the end-to-end ones on real repositories.
A `/tree/<commit>` URL scans that commit: `./skill-atlas scan https://github.com/JetBrains/koog/tree/709079e`.
A repository's scan is kept in `~/.cache/skill-atlas` (or `$XDG_CACHE_HOME/skill-atlas`), by commit: a rescan of
an unchanged commit asks GitHub for that commit only. Delete the directory to start over.

Deployed: every push to `main` puts the web view on GitHub Pages, at
https://splatjov.github.io/ai-workshop-start/ ([pages.yml](.github/workflows/pages.yml)).

In the browser: `npm run web` opens an atlas of worlds, drawn by hand. Every repository you scan is
a world of a system, and the more alike the skills of two repositories, the closer their worlds
stand; scan an organization, and every repository of it is one. Nine example repositories wait on
the rim, one click away. Zoom into a world for its map: a land for every directory, a place for
every skill, and each one's `SKILL.md`, with a filter over them. `npm run test:web` clicks through
it in Chromium and records a video of each test; `npm run test:screenshots` does it in CI's
Playwright container and compares the screenshots with the baselines.

- [qa/](qa/README.md): the standard manual test scripts, which the
  [`manual-qa`](.claude/skills/manual-qa/SKILL.md) skill follows in a browser, recorded.
- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
