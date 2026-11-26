# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally
- The CI build is green

## Pull requests
A mini demo of what changes, in the description: [pr-demo](.claude/skills/pr-demo/SKILL.md).

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run test:e2e`: end-to-end, on real GitHub repositories (network)
- `npm run typecheck`: the types, as CI checks them
- `npm run test:web`: the web view in Chromium, a video of each test in `test-results/`
- `npm run test:screenshots`: the same, in CI's Playwright container, with the screenshot
  comparisons; `-- --update-snapshots` when a change is meant to look different (see
  [spec/web.md](spec/web.md), "Recordings and screenshots")
