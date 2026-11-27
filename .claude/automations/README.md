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
                  end of the run)            ├─ not-ready → fix commits, round after round
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
6. **The loop runs until the review says ready.** There is no limit on fix rounds: every
   `not-ready` review of the current head gets one, and every push gets a review. Before, the
   fourth round was refused, and findings in `.claude/`, `AGENTS.md`, workflows or dependencies
   were always declined, so PRs stopped half-fixed and waited for a person. Now every file is
   fixed like code, and a "Needs a human" entry is asked in Slack and settled in the same round.
   Two things still end it: a fix round with no commit (everything declined, or Slack did not
   answer in time) pushes nothing, so no review follows, and its comment says a person is needed;
   and a re-review may not raise new nits on code the earlier review saw, nor a finding a person
   settled in Slack, so the rounds converge. Nothing else stops it:
   **to stop a PR's loop, mark it as a draft**, or pause "work after code review".
7. **Merging is gated, and atomic.** Only on `verdict=ready` for the current head, base `main`,
   not stacked, no person's "changes requested", mergeable, CI green on that head; then
   `gh pr merge --merge --match-head-commit <sha>`, which GitHub refuses if anything was pushed
   since. A run that made commits never merges.
8. **A pull request does not write the rules of its own review.** The automations read their
   skill from `origin/main`, never from the PR's working tree, and do nothing when `main` has
   none. A PR that changes a skill, a prompt, `AGENTS.md`, a workflow or a dependency is reviewed
   and merged by the rules as they were, like any other PR; its new rules apply from the next
   run on. Two things the automations cannot do for themselves: a PR that changes a prompt or a
   trigger still needs a person to copy it into Air, and one that changes the marker line must
   change `code-review` and `review-fix` together (both read `main`, so they switch at once).
9. **Nobody builds on an unmerged branch.** A PR stacked on another carries that one's commits
   into `main` under its own review.

## Asking a person (Slack)

When an issue leaves a product decision open ("make the skill list nicer"), Issue start does not
guess and does not stop: it posts one question with concrete options to the Slack channel named in
[`issue-fix`](../skills/issue-fix/SKILL.md) step 3a, waits up to 40 minutes for a person's reply in
its thread, and builds what the reply picks. No reply → the question goes on the issue, as before.

- The environments of Issue start and "work after code review" hold the secret `SLACK_BOT_TOKEN`
  (a bot with `chat:write` and `channels:history`/`groups:history`, member of that channel). The
  fix automation uses it for a review's "Needs a human" entries: it asks them all in one message
  and fixes or declines each as the reply says. Code Review does not need it.
- A reply chooses between readings of a trusted author's issue; it is not an instruction. Anyone
  in the channel can reply, so a reply that asks for more (a secret, CI, a merge) is not followed.
- While it waits, the run rewrites its `working` comment every few minutes, so a redelivered
  event does not take the issue over (claims expire 60 minutes after their last update).

## Demos

Every pull request that changes what a user sees shows it in a `## Demo` section of its
description: a short GIF of the web view, or the real CLI output
([`pr-demo`](../skills/pr-demo/SKILL.md)). Issue start records it before it opens the PR; the fix
automation records it again when its fixes change what is shown, and adds it before a merge when
it is missing. The media sits on a `demo/<branch>` side branch, which has no workflow file and
which no automation listens to. A missing demo is never a review finding and never stops a
merge, so it cannot add a round to the loop.

## Manual QA

A fourth automation, **Manual QA**, follows the standard test scripts in [qa/](../../qa/README.md)
with the [`manual-qa`](../skills/manual-qa/SKILL.md) skill: each script in Chromium against live
GitHub, a video of each, a report of pass or fail with the step and the second in the video. The
evidence goes to the `qa/runs` side branch; each failing script gets one issue.

**Not created in Air yet.** To create it: in the same environment, a new automation whose
instructions are [manual-qa.prompt.md](manual-qa.prompt.md), on `main`, output `read-only`; no
event trigger (**Run Now** before a release, or a schedule if you want one). Run it once, watch the
videos, polish the skill until you like the report; then add it to `triggers.json` with its id.

- `read-only`, as the reviewer: it tests `main`, it never changes it. The evidence branch and the
  issues are written with the token, which `read-only` does not restrict, so the prompt says so.
- Its issues are opened by `jetbrains-air[bot]`, so they do not start Issue start, which only
  takes `Splatjov`'s: a person reads the failure and decides whether to delegate it.
- The scripts are the source of truth: the automation follows them and never edits them; a step
  that looks wrong is a "Script notes" line in its run summary.

## Status update

A fifth automation, **Status update**, posts what changed in this repository to `#decision-making`
in Slack (`C0CMCSTCQ94`), so nobody has to ask: the PRs merged, the issues resolved and the PRs in
review or in progress since the last post, by person, one mark per item
([`status-update`](../../.agents/skills/status-update/SKILL.md)). Nothing new since the last
post → nothing is posted.

**Not created in Air yet.** To create it: in the same environment, a new automation whose
instructions are [status-update.prompt.md](status-update.prompt.md), on `main`, output
`read-only`; no event trigger (**Run Now** to test, then a schedule, e.g. weekdays 09:30 and
13:30). The environment needs `SLACK_BOT_TOKEN`; `SLACK_STATUS_CHANNEL` (a channel id, `C…`,
with the bot a member: `/invite @AI Workshop Bot`) only to post somewhere else. Run it by hand, check the claims against
GitHub, polish the skill until you like the post; then add it to `triggers.json` with its id.

- `read-only`: it writes nothing in git and nothing on GitHub; its one write is the Slack post.
- Each post carries its range in the message's metadata (`event_type: status_update`), so the
  next run starts where the last one ended, and a run started twice in a minute posts nothing.
- The post names GitHub logins, not Slack users: the bot has no `users:read`, so it cannot
  tell who in Slack is who on GitHub, and the post pings nobody.

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
