# The workshop's Slack bot is in everyone's private channels and cannot tell whose is whose

`users.conversations` lists ~40 private channels of the shared `AI Workshop Bot`, one per
participant, and `users.info` answers `missing_scope` (no `users:read`), so a channel's creator
id cannot be turned into a name, and the channel name (`ai-workshop-start` is someone else's)
proves nothing. Never pick a private channel by guessing: take its id from a person (Slack:
channel details, bottom) and write it into the skill (`status-update` posts to
`#decision-making`, `C0CMCSTCQ94`, which its owner named). `conversations.info`, `conversations.history` and `auth.test` work.

Learned in: branch `status-update`, 2026-11-27.
