# To count the requests a real CLI run sends, preload a fetch wrapper; GitHub's /rate_limit is no use for it

`GET /rate_limit` before and after a run gave wrong counts (a getsentry scan read as 4 requests):
its `used` counters cover only api.github.com, the hourly window can reset mid-run, and SKILL.md
reads from raw.githubusercontent.com never show. What works: a module that wraps `globalThis.fetch`
and prints a count by host on `process.on('exit')`, run as
`node --import /tmp/count.mjs src/cli.ts scan <url>` (stdout unchanged, the count on stderr).
Also: code search allows few requests a minute; two organization scans back to back can fail the
second with `GitHub rate limit reached; try again in a minute`: wait a minute between them.

Learned in: issue #21 (branch `cli-scan-cache`), 2026-11-27.
