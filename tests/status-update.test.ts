// .agents/skills/status-update: the status post, from what GitHub answers, as the skill says.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  formatRange, parseTime, statusItems, statusPost,
  type ClosedIssue, type GitHubState, type MergedPr, type OpenPr,
} from '../.agents/skills/status-update/status.ts';

const REPO = 'Splatjov/ai-workshop-start';
const BASE = `https://github.com/${REPO}`;
const since = new Date('2026-11-27T09:30:00+01:00');
const until = new Date('2026-11-27T12:30:00+01:00');
const ana = { login: 'Ana', is_bot: false };
const ben = { login: 'Ben', is_bot: false };
const air = { login: 'app/jetbrains-air', is_bot: true };
const ref = (number: number, repo = REPO) => {
  const [owner, name] = repo.split('/');
  return { number, url: `https://github.com/${repo}/issues/${number}`, repository: { name, owner: { login: owner } } };
};

const merged = (n: number, title: string, at: string, more: Partial<MergedPr> = {}): MergedPr => ({
  number: n, title, url: `${BASE}/pull/${n}`, author: ana, mergedBy: ana, mergedAt: at, closingIssuesReferences: [], ...more,
});
const closed = (n: number, title: string, at: string, more: Partial<ClosedIssue> = {}): ClosedIssue => ({
  number: n, title, url: `${BASE}/issues/${n}`, author: ana, assignees: [], closedAt: at, stateReason: 'COMPLETED', ...more,
});
const open = (n: number, title: string, at: string, more: Partial<OpenPr> = {}): OpenPr => ({
  number: n, title, url: `${BASE}/pull/${n}`, author: ana, isDraft: false, updatedAt: at, closingIssuesReferences: [], ...more,
});
const state = (s: Partial<GitHubState>): GitHubState => ({ merged: [], closedIssues: [], openPrs: [], ...s });

test('a merged PR that closes an issue is one done item: the issue, with the PR in brackets', () => {
  const s = state({
    merged: [merged(24, 'CLI: keep each scan on disk', '2026-11-27T10:19:09Z', { closingIssuesReferences: [ref(21)] })],
    closedIssues: [closed(21, 'Cache the scans', '2026-11-27T10:19:10Z')],
  });
  const items = statusItems(REPO, s, since, until);
  assert.deepEqual(items, [{
    person: 'Ana', mark: 'done', number: 21, title: 'Cache the scans', url: `${BASE}/issues/21`,
    pr: { number: 24, url: `${BASE}/pull/24` },
  }]);
  assert.match(statusPost(REPO, items, since, until, 'Europe/Berlin'),
    /^:white_check_mark: done <.+\/issues\/21\|#21>: Cache the scans \(<.+\/pull\/24\|#24>\)$/m);
});

test('a merged PR that closes no issue is a done item of its own; one closing an issue of another repository too', () => {
  const s = state({
    merged: [
      merged(18, 'issue-fix: ask in Slack', '2026-11-27T09:56:51Z'),
      merged(19, 'Fix upstream', '2026-11-27T10:00:00Z', { closingIssuesReferences: [ref(5, 'JetBrains/other')] }),
    ],
  });
  assert.deepEqual(statusItems(REPO, s, since, until).map((i) => [i.mark, i.number, i.pr]), [
    ['done', 18, undefined], ['done', 19, undefined],
  ]);
});

test('an issue closed as completed without a PR is done; closed as not planned is left out', () => {
  const s = state({
    closedIssues: [
      closed(30, 'Works already', '2026-11-27T10:00:00Z', { assignees: [ben] }),
      closed(31, 'Not doing it', '2026-11-27T10:00:00Z', { stateReason: 'NOT_PLANNED' }),
    ],
  });
  assert.deepEqual(statusItems(REPO, s, since, until).map((i) => [i.person, i.mark, i.number]), [['Ben', 'done', 30]]);
});

test('open PRs with activity: review, or in progress for a draft', () => {
  const s = state({
    openPrs: [open(23, 'Red agent', '2026-11-27T10:29:52Z'), open(26, 'Skill map', '2026-11-27T11:00:00Z', { author: ben, isDraft: true })],
  });
  assert.deepEqual(statusItems(REPO, s, since, until).map((i) => [i.person, i.mark, i.number]), [
    ['Ana', 'review', 23], ['Ben', 'progress', 26],
  ]);
});

test("a bot's PR is the person's who opened its issue, else who merged it", () => {
  const s = state({
    merged: [
      merged(25, 'Group skills', '2026-11-27T10:39:35Z', { author: air, mergedBy: air, closingIssuesReferences: [ref(20)] }),
      merged(27, 'Bump', '2026-11-27T10:40:00Z', { author: air, mergedBy: ben }),
    ],
    closedIssues: [closed(20, 'Group skills by theme', '2026-11-27T10:39:37Z', { author: ben })],
    openPrs: [open(22, 'Atlas of worlds', '2026-11-27T10:32:07Z', { author: air, closingIssuesReferences: [ref(19)] })],
    issueAuthors: { 19: ana },
  });
  assert.deepEqual(statusItems(REPO, s, since, until).map((i) => [i.person, i.number]), [['Ben', 20], ['Ben', 27], ['Ana', 22]]);
  const alone = state({ merged: [merged(28, 'Bot only', '2026-11-27T10:40:00Z', { author: air, mergedBy: air })] });
  assert.equal(statusItems(REPO, alone, since, until)[0].person, 'jetbrains-air');
});

test('the range includes since and excludes until', () => {
  const s = state({
    merged: [
      merged(1, 'Before', '2026-11-27T08:29:59Z'),
      merged(2, 'At since', '2026-11-27T08:30:00Z'),
      merged(3, 'At until', '2026-11-27T11:30:00Z'),
    ],
    closedIssues: [closed(4, 'Earlier', '2026-11-26T15:00:00Z')],
    openPrs: [open(5, 'Untouched', '2026-11-26T16:47:25Z')],
  });
  assert.deepEqual(statusItems(REPO, s, since, until).map((i) => i.number), [2]);
});

test('nothing new: nothing to post', () => {
  assert.equal(statusPost(REPO, [], since, until, 'Europe/Berlin'), '');
});

test('the post: the repository, the range, then each person in order, done before review before in progress', () => {
  const s = state({
    merged: [merged(24, 'Cache <scans> & more', '2026-11-27T10:19:09Z', { author: ben })],
    closedIssues: [closed(30, 'Works already', '2026-11-27T10:00:00Z')],
    openPrs: [open(26, 'Skill map', '2026-11-27T11:00:00Z', { isDraft: true }), open(23, 'Red agent', '2026-11-27T10:00:00Z')],
  });
  assert.equal(statusPost(REPO, statusItems(REPO, s, since, until), since, until, 'Europe/Berlin'), [
    `*Status · ${REPO}*`,
    '27 Nov 2026, 09:30 – 12:30 CET',
    '',
    '*@Ana*',
    `:white_check_mark: done <${BASE}/issues/30|#30>: Works already`,
    `:eyes: review <${BASE}/pull/23|#23>: Red agent`,
    `:construction: in progress <${BASE}/pull/26|#26>: Skill map`,
    '',
    '*@Ben*',
    `:white_check_mark: done <${BASE}/pull/24|#24>: Cache &lt;scans&gt; &amp; more`,
  ].join('\n'));
});

test('a range over two days shows both dates; over a change of the clock, both zones', () => {
  assert.equal(formatRange(new Date('2026-11-26T15:30:00Z'), new Date('2026-11-27T08:30:00Z'), 'Europe/Berlin'),
    '26 Nov 2026, 16:30 – 27 Nov 2026, 09:30 CET');
  assert.equal(formatRange(new Date('2026-10-24T10:00:00Z'), new Date('2026-10-25T10:00:00Z'), 'Europe/Berlin'),
    '24 Oct 2026, 12:00 CEST – 25 Oct 2026, 11:00 CET');
});

test('a time needs its zone', () => {
  assert.equal(parseTime('2026-11-27T09:30+01:00', '--since').toISOString(), '2026-11-27T08:30:00.000Z');
  assert.equal(parseTime('2026-11-27T08:30:00Z', '--since').toISOString(), '2026-11-27T08:30:00.000Z');
  assert.throws(() => parseTime('2026-11-27T09:30', '--since'), /not a time with a zone/);
  assert.throws(() => parseTime('yesterday', '--since'), /not a time with a zone/);
});

test('SKILL.md: its name, and the marks and channel rules the script follows', () => {
  const skill = readFileSync(new URL('../.agents/skills/status-update/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /^---\nname: status-update\ndescription: \S/);
  for (const mark of [':white_check_mark: done', ':eyes: review', ':construction: in progress']) assert.ok(skill.includes(mark), mark);
  // The channel: channel=, else SLACK_STATUS_CHANNEL, else #decision-making. Never no channel.
  assert.match(skill, /`channel=` in `\$ARGUMENTS`; the environment variable\s+`SLACK_STATUS_CHANNEL`; else \*\*`C0CMCSTCQ94`\*\* \(`#decision-making`/);
  assert.ok(skill.includes('CH="${CH:-${SLACK_STATUS_CHANNEL:-C0CMCSTCQ94}}"'), 'the fallback in the command');
  const readme = readFileSync(new URL('../.claude/automations/README.md', import.meta.url), 'utf8');
  assert.match(readme, /The post goes to `#decision-making`\s+\(`C0CMCSTCQ94`\); to post to another channel, set `SLACK_STATUS_CHANNEL`/);
  assert.match(skill, /event_type: status_update/);
});
