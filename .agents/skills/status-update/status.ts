#!/usr/bin/env node
// The status post of the status-update skill (SKILL.md, next to this file): what happened in a
// GitHub repository in a time range, by person, one mark per item, in Slack's mrkdwn.
//
//   node .agents/skills/status-update/status.ts --since 2026-11-27T09:30+01:00 [--until <time>]
//        [--repo owner/name] [--time-zone Europe/Berlin] [--json]
//
// Prints the post, or nothing when nothing happened. --json prints the items instead, with their
// links, to check the post's claims against GitHub.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

export interface Login { login: string; is_bot?: boolean }
export interface IssueRef { number: number; url: string; repository?: { name: string; owner: { login: string } } }
export interface MergedPr {
  number: number; title: string; url: string; author: Login; mergedBy?: Login | null; mergedAt: string;
  closingIssuesReferences?: IssueRef[];
}
export interface ClosedIssue {
  number: number; title: string; url: string; author: Login; assignees?: Login[];
  closedAt: string; stateReason?: string | null;
}
export interface OpenPr {
  number: number; title: string; url: string; author: Login; isDraft: boolean; updatedAt: string;
  closingIssuesReferences?: IssueRef[];
}
export interface GitHubState {
  merged: MergedPr[]; closedIssues: ClosedIssue[]; openPrs: OpenPr[];
  /** Who opened the issues that a bot's open PRs close: the person the bot works for. */
  issueAuthors?: Record<number, Login>;
}

export type Mark = 'done' | 'review' | 'progress';
export interface Item {
  person: string; mark: Mark; number: number; title: string; url: string;
  /** The merged PR that resolved the issue, when the item is an issue. */
  pr?: { number: number; url: string };
}

const MARK: Record<Mark, string> = {
  done: ':white_check_mark: done',
  review: ':eyes: review',
  progress: ':construction: in progress',
};
const ORDER: Mark[] = ['done', 'review', 'progress'];

const isBot = (who?: Login | null) => !who || who.is_bot === true || /\[bot\]$|^app\//.test(who.login);
const name = (who: Login) => who.login.replace(/^app\//, '').replace(/\[bot\]$/, '');
const inRange = (at: string, since: Date, until: Date) => {
  const t = Date.parse(at);
  return t >= since.getTime() && t < until.getTime();
};

/** Who did the work: the first person among `candidates`, else the first bot. */
function person(...candidates: (Login | null | undefined)[]): string {
  const known = candidates.filter((c): c is Login => !!c);
  const human = known.find((c) => !isBot(c));
  return name(human ?? known[0] ?? { login: 'unknown' });
}

/** The items of `repo` ("owner/name") between `since` (included) and `until` (excluded). */
export function statusItems(repo: string, state: GitHubState, since: Date, until: Date): Item[] {
  const sameRepo = (ref: IssueRef) =>
    !ref.repository || `${ref.repository.owner.login}/${ref.repository.name}`.toLowerCase() === repo.toLowerCase();
  const issues = new Map(state.closedIssues.map((i) => [i.number, i]));
  const items: Item[] = [];
  const covered = new Set<number>();

  for (const pr of state.merged.filter((p) => inRange(p.mergedAt, since, until))) {
    const closes = (pr.closingIssuesReferences ?? []).filter(sameRepo);
    if (closes.length === 0) {
      items.push({ person: person(pr.author, pr.mergedBy), mark: 'done', number: pr.number, title: pr.title, url: pr.url });
      continue;
    }
    for (const ref of closes) {
      const issue = issues.get(ref.number);
      covered.add(ref.number);
      items.push({
        person: person(pr.author, issue?.assignees?.[0], issue?.author, pr.mergedBy),
        mark: 'done', number: ref.number, title: issue?.title ?? pr.title, url: ref.url,
        pr: { number: pr.number, url: pr.url },
      });
    }
  }
  for (const issue of state.closedIssues) {
    if (covered.has(issue.number) || !inRange(issue.closedAt, since, until)) continue;
    if (issue.stateReason && issue.stateReason !== 'COMPLETED') continue; // not planned, duplicate: not resolved
    items.push({
      person: person(issue.assignees?.[0], issue.author), mark: 'done',
      number: issue.number, title: issue.title, url: issue.url,
    });
  }
  for (const pr of state.openPrs.filter((p) => inRange(p.updatedAt, since, until))) {
    items.push({
      person: person(pr.author, ...(pr.closingIssuesReferences ?? []).filter(sameRepo).map((r) => state.issueAuthors?.[r.number])),
      mark: pr.isDraft ? 'progress' : 'review',
      number: pr.number, title: pr.title, url: pr.url,
    });
  }
  return items;
}

/** Slack's mrkdwn treats these three as control characters. */
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "27 Nov 2026, 09:30 – 12:30 CET", or with both dates when the range spans days. */
export function formatRange(since: Date, until: Date, timeZone: string): string {
  const part = (d: Date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23', timeZoneName: 'short',
      }).formatToParts(d).map((p) => [p.type, p.value]),
    );
    return { date: `${parts.day} ${parts.month} ${parts.year}`, time: `${parts.hour}:${parts.minute}`, zone: parts.timeZoneName };
  };
  const a = part(since);
  const b = part(until);
  const zone = a.zone === b.zone ? ` ${b.zone}` : '';
  const from = a.zone === b.zone ? a.time : `${a.time} ${a.zone}`;
  const to = a.zone === b.zone ? b.time : `${b.time} ${b.zone}`;
  return a.date === b.date ? `${a.date}, ${from} – ${to}${zone}` : `${a.date}, ${from} – ${b.date}, ${to}${zone}`;
}

/** The post, or '' when there is nothing to post. */
export function statusPost(repo: string, items: Item[], since: Date, until: Date, timeZone: string): string {
  if (items.length === 0) return '';
  const people = [...new Set(items.map((i) => i.person))].sort((a, b) => a.localeCompare(b));
  const lines = [`*Status · ${repo}*`, formatRange(since, until, timeZone)];
  for (const who of people) {
    lines.push('', `*@${who}*`);
    const mine = items
      .filter((i) => i.person === who)
      .sort((a, b) => ORDER.indexOf(a.mark) - ORDER.indexOf(b.mark) || a.number - b.number);
    for (const i of mine) {
      const pr = i.pr ? ` (<${i.pr.url}|#${i.pr.number}>)` : '';
      lines.push(`${MARK[i.mark]} <${i.url}|#${i.number}>: ${escape(i.title)}${pr}`);
    }
  }
  return lines.join('\n');
}

/** A time with its zone: `2026-11-27T09:30+01:00` or `…Z`. Without one, it would be a guess. */
export function parseTime(text: string, option: string): Date {
  if (!/(Z|[+-]\d\d:?\d\d)$/i.test(text.trim()) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${option}: "${text}" is not a time with a zone, like 2026-11-27T09:30+01:00`);
  }
  return new Date(text);
}

function gh(args: string[]): unknown {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function readGitHub(repo: string, since: Date): GitHubState {
  const from = since.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const common = ['--repo', repo, '--limit', '500'];
  const state: GitHubState = {
    merged: gh(['pr', 'list', ...common, '--state', 'merged', '--search', `merged:>=${from}`, '--json',
      'number,title,url,author,mergedBy,mergedAt,closingIssuesReferences']) as MergedPr[],
    closedIssues: gh(['issue', 'list', ...common, '--state', 'closed', '--search', `closed:>=${from}`, '--json',
      'number,title,url,author,assignees,closedAt,stateReason']) as ClosedIssue[],
    openPrs: gh(['pr', 'list', ...common, '--state', 'open', '--search', `updated:>=${from}`, '--json',
      'number,title,url,author,isDraft,updatedAt,closingIssuesReferences']) as OpenPr[],
    issueAuthors: {},
  };
  for (const pr of state.openPrs.filter((p) => isBot(p.author))) {
    for (const ref of pr.closingIssuesReferences ?? []) {
      const owner = ref.repository ? `${ref.repository.owner.login}/${ref.repository.name}` : repo;
      if (owner.toLowerCase() !== repo.toLowerCase()) continue;
      const issue = gh(['issue', 'view', String(ref.number), '--repo', repo, '--json', 'author']) as { author: Login };
      state.issueAuthors![ref.number] = issue.author;
    }
  }
  return state;
}

function main() {
  const { values } = parseArgs({
    options: {
      since: { type: 'string' }, until: { type: 'string' }, repo: { type: 'string' },
      'time-zone': { type: 'string', default: 'Europe/Berlin' }, json: { type: 'boolean', default: false },
    },
  });
  if (!values.since) throw new Error('--since is required, like 2026-11-27T09:30+01:00');
  const since = parseTime(values.since, '--since');
  const until = values.until ? parseTime(values.until, '--until') : new Date();
  if (since >= until) throw new Error('--since must be before --until');
  const repo = values.repo ?? (gh(['repo', 'view', '--json', 'nameWithOwner']) as { nameWithOwner: string }).nameWithOwner;
  const items = statusItems(repo, readGitHub(repo, since), since, until);
  const out = values.json
    ? JSON.stringify({ repo, since: since.toISOString(), until: until.toISOString(), items }, null, 2)
    : statusPost(repo, items, since, until, values['time-zone']);
  if (out) process.stdout.write(`${out}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`status: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
