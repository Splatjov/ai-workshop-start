---
name: status-update
description: Writes the status post of this repository - the PRs merged, the issues resolved and the PRs in review or in progress since a time and date, by person, one mark per item - and posts it to Slack with SLACK_BOT_TOKEN: to #decision-making, or to the channel in SLACK_STATUS_CHANNEL. Nothing new, nothing posted. Built to run unattended in the "Status update" automation, or by hand.
argument-hint: "[since=<time with zone>] [until=<time with zone>] [channel=<Slack channel id>]"
---

# Status update

Nobody has to ask what changed: this skill reads GitHub and posts it to Slack, where the team
already reads. It runs **unattended**: never ask questions, never wait for input. It writes
**nothing in git** and nothing on GitHub; the only thing it writes is **one** Slack message.

The post, as the team writes it: the repository, the time range, then each person with their
items, one mark each.

```
*Status · Splatjov/ai-workshop-start*
27 Nov 2026, 09:30 – 12:45 CET

*@Splatjov*
:white_check_mark: done <…/issues/21|#21>: add persistance - caching for commit results (<…/pull/24|#24>)
:eyes: review <…/pull/23|#23>: agents: red-agent skill
```

| Mark | An item is |
|---|---|
| `:white_check_mark: done` | a PR merged in the range (shown as the issue it closes, with the PR in brackets, when it closes one); an issue closed as completed in the range, with no merged PR (closed as not planned or duplicate is not resolved: left out) |
| `:eyes: review` | an open PR, not a draft, with activity in the range |
| `:construction: in progress` | an open draft PR with activity in the range |

The person is the PR's author; for a PR by a bot (`jetbrains-air[bot]`), the person who opened
the issue it closes, else who merged it. For an issue closed without a PR: its assignee, else its
author. People are GitHub logins (`@Splatjov`), not Slack mentions: the post pings nobody.

`status.ts`, next to this file, writes the post from GitHub (through `gh`), so the format is the
same in every run. Change the format there, not by hand in a run.

Rules that hold in every step:
- **`$SLACK_BOT_TOKEN` is a secret.** Only in an `Authorization` header, never echoed, logged,
  written to a file or put in the post or the summary; no `set -x` around it.
- **One post per run, to the one channel** (step 1). No other channel, no DM, no thread reply,
  no edit or delete of other messages.
- The post says only what GitHub says. No guesses, no "probably", no work that is not in GitHub.

## 1. The channel and the repository

The channel is, first that is set: `channel=` in `$ARGUMENTS`; the environment variable
`SLACK_STATUS_CHANNEL`; else **`C0CMCSTCQ94`** (`#decision-making`, where the bot is a member).
It is a channel **id** (`C…`), with the bot a member: a team that posts to a channel of its own
sets its id in `SLACK_STATUS_CHANNEL`. `$SLACK_BOT_TOKEN` unset → stop: nothing posted, the
summary says what is missing.

```bash
CH="${CH:-${SLACK_STATUS_CHANNEL:-C0CMCSTCQ94}}"   # CH: the channel= argument, when given
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
BOT=$(curl -sS https://slack.com/api/auth.test -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["user_id"] if d.get("ok") else "ERROR "+d.get("error","?"))')
echo "$REPO $BOT"
```

## 2. The time range

`until` is `until=` in `$ARGUMENTS`, else now, to the minute. `since` is, first that exists:

1. `since=` in `$ARGUMENTS`;
2. the `until` of the **last status post of this repository** in the channel: the newest message
   by `$BOT` with metadata `event_type: status_update` and `event_payload.repo` = `$REPO`;
   a message by `$BOT` whose text starts with `*Status · $REPO*` and has no metadata counts too,
   with its `ts` as its `until`;
3. 24 hours before `until`.

```bash
curl -sS -G https://slack.com/api/conversations.history -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  --data-urlencode "channel=$CH" --data-urlencode "limit=200" --data-urlencode "include_all_metadata=true" \
  | python3 -c '
import json, sys, datetime
d = json.load(sys.stdin); bot, repo = sys.argv[1], sys.argv[2]
if not d.get("ok"): sys.exit("ERROR " + d.get("error", "?"))
for m in d["messages"]:                       # newest first
    if m.get("user") != bot: continue
    meta = m.get("metadata") or {}
    if meta.get("event_type") == "status_update" and meta.get("event_payload", {}).get("repo") == repo:
        print(meta["event_payload"]["until"]); break
    if not meta and m.get("text", "").startswith(f"*Status · {repo}*"):
        print(datetime.datetime.fromtimestamp(float(m["ts"]), datetime.UTC).isoformat(timespec="seconds")); break
' "$BOT" "$REPO"
```

Times are ISO 8601 **with a zone** (`2026-11-27T09:30+01:00`, `…Z`); `status.ts` refuses one
without. A person's "since 9:30" is Europe/Berlin time: write it with that day's offset (`+01:00`
in winter, `+02:00` in summer). `since` not before `until` (the last post is newer than a minute,
a redelivered run) → nothing to do; stop.

`ERROR not_in_channel` or `channel_not_found` → stop: the bot is not in that channel, so nothing
can be posted; the summary says so (a person runs `/invite @AI Workshop Bot` there).

## 3. Write the post

```bash
S=.agents/skills/status-update/status.ts
node $S --repo "$REPO" --since "$SINCE" --until "$UNTIL" > /tmp/status-post.md; echo "post exit=$?"
node $S --repo "$REPO" --since "$SINCE" --until "$UNTIL" --json > /tmp/status-items.json; echo "items exit=$?"
cat /tmp/status-post.md
```

Either exit is not 0 (`gh` failed: no login, a rate limit, no network; or a wrong time) → stop:
nothing is posted, the state is `stopped`, and the summary quotes the `status:` line the script
printed. A failed run leaves an empty file too: that is **not** "nothing new".

Both exits 0 and an empty `/tmp/status-post.md` → **nothing new: nothing is posted**. Stop; the
summary says "Nothing since <since>".

## 4. Check the claims

Each item of `/tmp/status-items.json` against GitHub, one command per kind:

```bash
gh pr view <n> --json state,mergedAt,isDraft,updatedAt     # a PR item, and a done item's PR
gh issue view <n> --json state,stateReason,closedAt        # a done issue item
```

A done PR is `MERGED` with `mergedAt` in the range; a done issue is `CLOSED`, `COMPLETED`, closed
in the range; a review or in-progress PR is `OPEN`, a draft for in progress. An item that does
not hold (it changed between the steps) → write the post again (step 3). One that still does not
hold → leave the post as it is, post it, and put the item under "Skill gaps" in the summary.

## 5. Post it

With the range in the message's metadata, so that the next run starts where this one ended:

```bash
python3 -c '
import json, sys
ch, repo, since, until, text = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], open(sys.argv[5]).read()
print(json.dumps({"channel": ch, "text": text, "unfurl_links": False, "unfurl_media": False,
  "metadata": {"event_type": "status_update", "event_payload": {"repo": repo, "since": since, "until": until}}}))
' "$CH" "$REPO" "$SINCE" "$UNTIL" /tmp/status-post.md > /tmp/status-slack.json
curl -sS -X POST https://slack.com/api/chat.postMessage -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H 'Content-Type: application/json; charset=utf-8' --data @/tmp/status-slack.json \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["ts"] if d.get("ok") else "ERROR "+d.get("error","?"))'
```

Posted once: an `ERROR` is reported, not retried with other settings and not posted elsewhere.
The link for the summary: `chat.getPermalink?channel=$CH&message_ts=<ts>`, `.permalink`.

## 6. Summary

The run ends with: the repository, the range, the state (`posted` with the link, `nothing new`,
or `stopped` and why), and the number of items by mark. A case this skill got wrong or left out
goes under "Skill gaps"; nothing goes into a commit.
