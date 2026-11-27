# The GitHub client in src/core/github.ts remembers answers by URL; a failed one must not be

`client().json(url, notFound)` keeps each URL's promise, so a URL is asked for once. A rejected
promise was kept too: when a first caller asked for `commits/<ref>` without its own `notFound`
message, a later caller with the right one (`Not found in https://github.com/<id>: <ref>`) got the
first caller's `Not found on GitHub: <url>`. Failures are now dropped from the map. Any new early
request of a URL that a later step asks for again (as the cache's `commits/HEAD` check does) needs
a test of that later step's error message.

Learned in: issue #21 (branch `cli-scan-cache`), 2026-11-27.
