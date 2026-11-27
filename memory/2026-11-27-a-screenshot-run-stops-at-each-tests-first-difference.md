# A red screenshot run names only the first differing screenshot of each test

`npm run test:screenshots` after a layout change failed on `start` and `organization` only, but a
third baseline (`error`) differed too: a walkthrough test stops at its first failed
`toHaveScreenshot`, so the screenshots after it in the same test are never compared. Which
baselines a change really touches is known only after
`npm run test:screenshots -- walkthrough --update-snapshots` (it prints `… is re-generated` for
each); look at every one it lists, then compare again without the flag
(`-- walkthrough --repeat-each 3`).

Learned in: PR #22, 2026-11-27.
