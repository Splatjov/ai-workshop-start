# A `test.beforeEach` at the top of a shared helper module runs only for the first test file

Playwright loads a helper like `/tmp/red/red.ts` once per worker, so a top-level
`test.beforeEach(...)` in it registers in the first test file that imports it, and not in the
next ones. Found with `workers: 1` and two `*.red.ts` files: the second file's timer was never
reset, so its "second in the video" was off by the length of the first test. Errors kept by
`page.on(...)` in such a hook are missed the same way. Do the per-test setup in an exported
function that each test calls first (`watch(page)` in the red agent's harness), or in a fixture.
`manual-qa`'s `qa.ts` has the same `beforeEach`.

Learned in: branch `red-agent-skill`, 2026-11-27.
