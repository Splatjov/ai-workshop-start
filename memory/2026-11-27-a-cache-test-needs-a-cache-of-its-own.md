# A test of the scan cache needs a cache directory of its own, and must check where each scan came from

`tests/e2e/github.test.ts` gave the whole file one `XDG_CACHE_HOME`. Its first test kept koog at
`709079e4…` from the whole tree, and such a record serves `/tree/709079e` too, so the later
"scanned again" test compared a cache hit with a cache hit: with `kept()` broken to drop a file
(`paths: [...files.keys()].slice(1)`), `npm run test:e2e` still passed 3/3. Equal output proves
nothing when both sides can come from the cache. What works: a `mkdtempSync` directory for that
test alone, and the request counts of each run (`tests/e2e/count-requests.ts`, preloaded with
`node --import`, writes them to a file so stdout and stderr stay the CLI's own): the first scan
reads raw.githubusercontent.com, the second sends exactly `{"api.github.com":1}`.
Also: without `GITHUB_TOKEN`, the e2e tests fail in an Air run with
`GitHub rate limit reached; set GITHUB_TOKEN` (a shared address); run them with
`GITHUB_TOKEN=$(gh auth token)`.

Learned in: PR #24 (review fix, branch `cli-scan-cache`), 2026-11-27.
