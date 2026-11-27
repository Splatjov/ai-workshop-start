# Links that cannot be scanned, and a shared scan

What the page says when a link cannot be scanned, and a scan opened from its address.
Needs: the network; a GitHub token if the tester has one (without one GitHub answers only a few
scans an hour from one address).

1. **Do:** open the page; with a token, type it into *GitHub token*; type `https://github.com/JetBrains/no-such-repository` into
   *Repository link* and click *Scan*.
   **See:** an error: `Repository not found: https://github.com/JetBrains/no-such-repository`; no
   skills. The view stays over the system, where `JetBrains/no-such-repository` is scribbled over,
   *not scanned*.
2. **Do:** replace the link with `https://example.com/JetBrains/koog` and click *Scan*.
   **See:** an error: `Not a GitHub repository URL: https://example.com/JetBrains/koog`.
3. **Do:** replace the link with `https://github.com/JetBrains/koog/tree/no-such-branch` and click *Scan*.
   **See:** an error that names `no-such-branch`, as not found in `https://github.com/JetBrains/koog`.
4. **Do:** open `?repo=https://github.com/JetBrains/koog/tree/709079e` (the page's address with that query).
   **See:** the scan starts by itself: the link field holds that URL, then `JetBrains/koog` and
   `4 skills`, the view at its world, no error.
