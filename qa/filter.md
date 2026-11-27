# Filter the skills of a repository

Filtering by words, while typing, on a repository at a pinned commit.
Needs: the network; a GitHub token if the tester has one (without one GitHub answers only a few
scans an hour from one address).

1. **Do:** open the page; with a token, type it into *GitHub token*.
   **See:** the title *Skill Atlas*, an empty *Repository link* field with a *Scan* button, the
   example repositories under it; no skills. On the right, the system: the nine examples as
   worlds on the rim of a plate, not yet charted. The token, if typed, as dots only.
2. **Do:** type `https://github.com/JetBrains/koog/tree/709079e` into *Repository link* and click *Scan*.
   **See:** the heading `JetBrains/koog` and `4 skills`; the list, sorted by name:
   `add-java-code-snippets-in-docs`, `arithmetic-evaluator`, `split-jvm-nonjvm`,
   `weather-retrieval`; the first one chosen, its `SKILL.md` on a sheet on the right. The view has
   gone to the world of `JetBrains/koog`: a place for each skill, named, the chosen one circled in
   red. A *Filter* field above the list.
3. **Do:** type `weather` into the filter.
   **See:** `1 of 4 skills`; only `weather-retrieval` listed, and chosen: its description
   *Retrieve current weather information for a specific location.* and its `SKILL.md`. On the
   world, only the place `weather-retrieval` is named.
4. **Do:** replace the filter with `no-such-words`.
   **See:** `No skill matches “no-such-words”`; no skill listed, none chosen.
5. **Do:** clear the filter.
   **See:** all 4 skills again, `4 skills`, one of them chosen.
