# Playwright empties its output directory at the start of every run

`npx playwright test` deletes everything in `outputDir` before it starts, so two runs that share
one (`/tmp/red/out`) leave only the second run's videos: the first run's `video.webm` is gone
by the time anything looks for it. Seen with the red agent's repros, one run per bug: every
bug but the last had no video. Give each run its own directory
(`--output /tmp/red/repro/<name>`), or copy the video out before the next run.

Also found there: a `page.route` that delays every request of a scan delays the scan by that
much *per request* (a repository scan makes three in a row: the repository, the commit, the
tree), so 4 s became 14 s. Delay one exact URL to hold a scan for a known time.

Learned in: PR #23 (branch `red-agent-skill`), 2026-11-27.
