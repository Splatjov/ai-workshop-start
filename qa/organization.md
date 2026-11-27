# Scan an organization

Every repository of an organization, with a token, and a filter across all of them.
Needs: the network and a GitHub token (the tester types it into the *GitHub token* field).

1. **Do:** open the page.
   **See:** the *Repository link* field and, under it, the *GitHub token* field, empty.
2. **Do:** type the token into *GitHub token*.
   **See:** dots only: the token itself is never shown.
3. **Do:** type `https://github.com/JetBrains` into *Repository link* and click *Scan*.
   **See:** within a minute: the heading `JetBrains`, linked, and `N skills in R repositories`,
   with N at least 300 and R at least 30 (397 in 35 on 2026-11-26); the skills grouped under
   their repositories' `JetBrains/<repo>` headings; the first skill of the first repository
   chosen, its `SKILL.md` on the right. The view stays over the system: each of those
   repositories is a world on it, the world of the chosen skill marked. No error.
4. **Do:** type `weather-retrieval` into the filter.
   **See:** `1 of N skills` (N as in step 3); only the `JetBrains/koog` heading, with
   `weather-retrieval` under it, chosen: *Retrieve current weather information for a specific
   location.*
5. **Do:** reload the page.
   **See:** the same organization scanned again from the address, the filter empty, and the
   *GitHub token* field **empty**: the token is not kept.
