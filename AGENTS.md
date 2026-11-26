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
