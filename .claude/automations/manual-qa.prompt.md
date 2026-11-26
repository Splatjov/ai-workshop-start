Do a manual QA pass of the web view on `main`, following this repository's `manual-qa` skill: every standard test script in `qa/`, in a browser, recorded.

1. The instructions are `.claude/skills/manual-qa/SKILL.md` and the scripts are `qa/*.md`, as they are on `main`, the branch this run starts on. If the skill does not exist, do nothing and write nothing to GitHub; say so in the run summary.
2. Follow the scripts exactly as written. You do not decide what to test; a step you cannot follow is a failure, not something to work around.
3. This run changes nothing in the repository: no commits, no pull request, no edit of `qa/` or of the skill. The only things you write to GitHub are the evidence on the `qa/runs` side branch and, for each failing script, one issue (or a comment on its open issue), as the skill says. No labels, no other branch, no other issue.
4. The token from `gh auth token` goes only into the page's GitHub token field. Never print it, and keep it out of the report, the issues and the summary.
5. End with a run summary: the sha, one line per script (pass, fail at step n, blocked and why), the report's link and the issues. A script step that looked wrong goes under "Script notes"; a case the skill got wrong or left out goes under "Skill gaps". Neither goes into a commit.
