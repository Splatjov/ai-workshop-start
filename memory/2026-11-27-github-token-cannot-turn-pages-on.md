# A workflow's GITHUB_TOKEN cannot turn GitHub Pages on: `enablement: true` needs another token

`actions/configure-pages` with `enablement: true` and no `token:` fails on a repository where
Pages is off ("Resource not accessible by integration"): its `action.yml` says the option "requires
a token other than `GITHUB_TOKEN`" (a PAT with `repo` or Pages write, or an App with
`administration:write`). So a Pages workflow either gets such a secret, or a person turns Pages on
once: Settings → Pages → Source: GitHub Actions. Is it on? `gh api repos/<owner>/<repo>/pages`
(404 = off). A test that greps the workflow for `enablement: true` proves nothing: the workflow
only runs from `main`, so only the action's own inputs tell.

Learned in: PR #27, 2026-11-27.
