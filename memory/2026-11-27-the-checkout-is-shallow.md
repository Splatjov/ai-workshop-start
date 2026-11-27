# The automation's checkout is shallow: unshallow it before comparing branches

In an Air run, `main` has a single commit locally, so `git merge-base main origin/<branch>`
says `no merge base` and `git log main..origin/<branch>` lists the whole branch. Run
`git fetch --unshallow origin` first; then merges and ranges work.

Learned in: issue #19, 2026-11-27.
