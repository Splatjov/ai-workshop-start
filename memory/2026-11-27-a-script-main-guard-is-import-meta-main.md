# A script's "am I the main module" guard is `import.meta.main`, not a comparison with `argv[1]`

`if (import.meta.url === `file://${process.argv[1]}`)` is false when the script is run through a
symlink (`import.meta.url` is the real path) or from a path with a space (`%20` in the URL): the
script then does nothing and exits 0, which a caller reads as "no output, nothing to do".
Node ≥ 24 (`engines`) has `import.meta.main`, and `tsc` accepts it here. To test a guard without
the network: `spawnSync` the script through a symlink with an argument that fails before any
request, and expect the non-zero exit (`tests/status-update.test.ts`).

Learned in: PR #26, 2026-11-27.
