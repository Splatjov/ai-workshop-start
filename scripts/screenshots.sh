#!/usr/bin/env bash
# `npm run test:screenshots [-- <playwright args>]`: the web tests with their screenshot
# comparisons, in the Playwright container CI uses, so the pixels are CI's on any machine.
# `npm run test:screenshots -- --update-snapshots`: make new baselines, to be reviewed in the PR.
#
# The image's tag is the @playwright/test version in package-lock.json, as in ci.yml
# (tests/screenshots.test.ts checks they agree). Docker, or Podman when there is no Docker.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")
IMAGE="mcr.microsoft.com/playwright:v$VERSION-noble"
ENGINE=${CONTAINER_ENGINE:-$(command -v docker >/dev/null && docker info >/dev/null 2>&1 && echo docker || echo podman)}
SUDO=$([ "$(id -u)" != 0 ] && ! "$ENGINE" info >/dev/null 2>&1 && echo sudo || true)

# node_modules in a volume of its own: the container's Linux packages never replace the host's.
# What the run writes (results, report, baselines) is handed back to the host's user.
exec $SUDO "$ENGINE" run --rm --network host --ipc host \
  -v "$PWD:/work" -v skill-atlas-node-modules:/work/node_modules -w /work \
  -e CI -e SCREENSHOTS=1 -e OWNER="$(id -u):$(id -g)" \
  "$IMAGE" bash -c '
    npm ci --no-audit --no-fund --loglevel error
    npx playwright test "$@"; status=$?
    chown -R "$OWNER" test-results playwright-report tests/web/__screenshots__ web/dist 2>/dev/null
    exit $status' -- "$@"
