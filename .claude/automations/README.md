# Air automations of this repository

Three [Air](https://air.jetbrains.cloud) automations turn an issue into a merged pull request.
They live in Air, not in git; this directory is the reviewed copy of what they are set to, and
the place that says why. **Change Air and this directory together.**

```
issue opened ──▶ Issue start ──▶ pull request
                                     │ opened / new commits / marked ready
                                     ▼
                                 Code Review ──▶ one review per head   (read-only)
                                     ▲               │ "<!-- air-code-review head=… verdict=… -->"
                 new commits         │               ▼
                 (pushed at the  ────┘      work after code review
                  end of the run)            ├─ not-ready → fix commits, at most 3 rounds
                                             └─ ready     → merge gates → merge
```

| Automation | Starts on | May write | Prompt | Process |
|---|---|---|---|---|
| **Issue start** | `issues.opened` by `Splatjov` | a new branch and one PR (`create-pr`) | [issue-fix.prompt.md](issue-fix.prompt.md) | [`issue-fix`](../skills/issue-fix/SKILL.md) |
| **Code Review** | `pull_request.opened`, `.synchronize`, `.ready_for_review`; author `Splatjov` or `jetbrains-air[bot]`; not a draft | nothing in git (`read-only`); one PR review | [code-review.prompt.md](code-review.prompt.md) | [`code-review`](../skills/code-review/SKILL.md) |
| **work after code review** | `pull_request_review.submitted`, state `commented`, reviewer `jetbrains-air[bot]`; not a draft | commits on the PR branch (`push-to-source`); the merge | [review-fix.prompt.md](review-fix.prompt.md) | [`review-fix`](../skills/review-fix/SKILL.md) |

The exact triggers, filters and output behaviours are in [triggers.json](triggers.json).

## Why it is built this way

Each rule below closes a hole that was open, or a loop that ran, before.

1. **Who may start it is decided by the trigger, not by the prompt.** The repository is public:
   without the author filters anyone's issue becomes a PR, anyone's PR has its code run with the
   automation's token, and a "ready" review merges it. A filter is matched by Air before any agent
   starts; a sentence in a prompt can be argued with. The skills check the author again anyway.
   A trigger filter holds one login, so every trusted author is one more set of triggers.
2. **The reviewer cannot change the code.** `read-only`: Air does not push what the run commits.
   Before, the review automation pushed edits of its own skill to the PR branch, and every push
   started the next review (13 runs for two PRs). A review run now reports skill gaps in its run
   summary; a person turns them into a PR.
3. **The review is a pull request review, with a body.** That is the only thing the fix
   automation can listen to: Air has no trigger for a plain PR comment, and it drops a review
   that has only inline comments. A report posted with `gh pr comment` starts nothing.
4. **The two automations talk through one line.** The review's first line,
   `<!-- air-code-review head=<sha> verdict=<ready|not-ready> -->`, says which commit was reviewed
   and what to do. The fix automation acts only on a review by `jetbrains-air[bot]` that carries
   it and whose `head` is the PR's current head; anything else (a person's review, a stale one)
   starts nothing.
5. **Every step is safe to run twice.** Air may deliver an event twice, and `opened` and
   `synchronize` can both fire. One review per head (checked right before posting); one fix round
   per reviewed head (a claim comment, lowest id wins); one PR per issue.
6. **The loop ends.** A fix round with no commit pushes nothing, so no review follows. Three fix
   rounds on one PR and the fourth is refused. A re-review may not raise new nits on code the
   earlier review saw. Each of these ends with a comment that says a person is needed.
7. **Merging is gated, and atomic.** Only on `verdict=ready` for the current head, base `main`,
   not stacked, no person's "changes requested", mergeable, CI green on that head; then
   `gh pr merge --merge --match-head-commit <sha>`, which GitHub refuses if anything was pushed
   since. A run that made commits never merges.
8. **A pull request does not write the rules of its own review.** The automations read their
   skill from `origin/main`, not from the PR's working tree. A PR that changes a skill is reviewed
   by the skill as it was.
9. **Nobody builds on an unmerged branch.** A PR stacked on another carries that one's commits
   into `main` under its own review.

## What the platform does (checked on 2026-11-26)

- The agent posts to GitHub as `jetbrains-air[bot]`, with a GitHub App token that can write pull
  requests, issues and contents **whatever the output behaviour is**. `read-only` stops Air from
  pushing commits; it does not make the token read-only. So "never merge, never push" for the
  reviewer is also a rule of its prompt and skill.
- `push-to-source`: the agent commits, Air pushes when the run ends. `create-pr`: the agent
  pushes the branch and opens the PR itself.
- A push by the automation fires `pull_request.synchronize` like anyone's push.
- The checkout of a PR event is the PR's head branch, shallow.
- Filters are ANDed. `pr_author`, `reviewer`, `issue_author` match one login, case-insensitively;
  `is_pr_draft` and `review_state` are exact. An unset filter matches everything.
- Air has no loop protection of its own, and does not deduplicate redelivered events.

## Changing something

- **A skill or a prompt:** a PR here. After it merges, copy a changed prompt into the automation
  (the Air web UI, or `update_automation` of the
  [air-automations MCP](https://github.com/JetBrains/codespheres-air-automations-mcp)). Skills
  need no copy: the automations read them from `main`.
- **A trigger:** change `triggers.json` and the automation together. `triggers` and `triggerVcs`
  pair by position: send both.
- **One more trusted author:** for Code Review, three more triggers with their `pr_author`
  (and three more `read-only` entries); the author checks in `review-fix` step 1 and, for issues,
  `issue-fix` step 1 and one more `issues.opened` trigger.
- **To stop everything:** pause "work after code review" first (nothing gets fixed or merged),
  then the other two.
- **To try a change of the process safely:** open the PR as a **draft**. No automation touches a
  draft; marking it ready starts the review.

## When a run did nothing

That is usually a rule working. The run summary names it: a draft, a stale head, a review that is
already there, a claim held by another run. A PR left at `blocked` or `declined` waits for a
person: push a commit (a new head gets a new review and a new round) or merge it yourself.
