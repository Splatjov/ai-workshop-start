// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts. The edge cases of
// where skills live are in tests/where.test.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every skill, sorted by name, linked to its file, with a warning for the malformed one', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 3 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
  // A token GitHub rejects: the CLI names where it came from.
  const rejected = replay({ 'https://api.github.com/repos/JetBrains/MPS': { status: 401, body: { message: 'Bad credentials' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: rejected, token: 'wrong' }), {
    message: 'GitHub rejected the token in GITHUB_TOKEN',
  });
});

test('a /tree/<ref> URL scans that commit, through its tree even with a token', async () => {
  const sha = '709079e4a34d6c9234583352550e6a2b88a0bb85';
  const api = 'https://api.github.com/repos/JetBrains/pinned';
  const ok = (body: unknown) => ({ status: 200, body });
  const fetch = replay({
    [api]: ok({ full_name: 'JetBrains/pinned', default_branch: 'main' }),
    [`${api}/commits/709079e`]: ok({ sha }),
    [`${api}/git/trees/${sha}?recursive=1`]: ok({
      truncated: false,
      tree: [{ path: '.claude/skills/commits/SKILL.md', mode: '100644', type: 'blob', sha: 'a' }],
    }),
    [`https://raw.githubusercontent.com/JetBrains/pinned/${sha}/.claude/skills/commits/SKILL.md`]: ok(
      '---\nname: commits\ndescription: Write good commits.\n---\n',
    ),
    // What GitHub answers for an unknown ref: a 422, not a 404.
    [`${api}/commits/no-such-branch`]: { status: 422, body: { message: 'No commit found for SHA: no-such-branch' } },
  });
  const pinned = await atlas(['scan', 'https://github.com/JetBrains/pinned/tree/709079e/'], { fetch, token: 'test' });
  assert.equal(pinned.code, 0, pinned.stderr);
  assert.equal(
    pinned.stdout,
    [
      'JetBrains/pinned · 1 skill',
      'commits — Write good commits.',
      `  https://github.com/JetBrains/pinned/blob/${sha}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );

  const missing = await atlas(['scan', 'github.com/JetBrains/pinned/tree/no-such-branch'], { fetch });
  assert.deepEqual(missing, { code: 1, stdout: '', stderr: 'Not found in https://github.com/JetBrains/pinned: no-such-branch' });
});
