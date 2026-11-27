// spec/cli.md, "Cache": what the CLI keeps of a GitHub repository at a commit, and what a rescan
// asks GitHub for. Each test keeps its cache in a directory of its own, never in the real home.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import type { Fetch } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { cacheDirectory, diskCache } from '../src/disk-cache.ts';
import { atlas, CLI, FIXTURE } from './helpers.ts';
import { RECORDING } from './web/recording.ts';

const FIRST = '1111111111111111111111111111111111111111';
const SECOND = '2222222222222222222222222222222222222222';
const API = 'https://api.github.com/repos/atlas-org/kept';
const RAW = 'https://raw.githubusercontent.com/atlas-org/kept';
const ok = (body: unknown) => ({ status: 200, body });
const blob = (path: string) => ({ path, mode: '100644', type: 'blob', sha: path });
const COMMITS = '---\nname: commits\ndescription: Write good commits. Always.\n---\n';
const BROKEN = '---\nname: a: b: c\n---\n';

/** atlas-org/kept at its HEAD: a skill and its copy, one with malformed front matter, one listed but gone. */
function kept(head = FIRST): Recording {
  return {
    [API]: ok({ full_name: 'atlas-org/kept', default_branch: 'main' }),
    // The same repository, asked for in another case: GitHub answers with its own name.
    'https://api.github.com/repos/ATLAS-ORG/Kept': ok({ full_name: 'atlas-org/kept', default_branch: 'main' }),
    'https://api.github.com/repos/ATLAS-ORG/Kept/commits/HEAD': ok({ sha: head, html_url: `https://github.com/atlas-org/kept/commit/${head}` }),
    [`${API}/commits/HEAD`]: ok({ sha: head, html_url: `https://github.com/atlas-org/kept/commit/${head}` }),
    [`${API}/commits/main`]: ok({ sha: head }),
    [`${API}/commits/${FIRST}`]: ok({ sha: FIRST, html_url: `https://github.com/atlas-org/kept/commit/${FIRST}` }),
    [`${API}/commits/no-such-branch`]: { status: 422, body: { message: 'No commit found for SHA: no-such-branch' } },
    [`${API}/git/trees/${FIRST}?recursive=1`]: ok({
      truncated: false,
      tree: [blob('.claude/skills/commits/SKILL.md'), blob('.github/skills/commits/SKILL.md'), blob('tools/release/SKILL.md'), blob('gone/SKILL.md'), blob('README.md')],
    }),
    [`${RAW}/${FIRST}/.claude/skills/commits/SKILL.md`]: ok(COMMITS),
    [`${RAW}/${FIRST}/.github/skills/commits/SKILL.md`]: ok(COMMITS),
    [`${RAW}/${FIRST}/tools/release/SKILL.md`]: ok(BROKEN),
    [`${RAW}/${FIRST}/gone/SKILL.md`]: { status: 404, body: '404: Not Found' },
    [`${API}/git/trees/${SECOND}?recursive=1`]: ok({ truncated: false, tree: [blob('skills/new/SKILL.md')] }),
    [`${RAW}/${SECOND}/skills/new/SKILL.md`]: ok('---\nname: new\ndescription: Added later.\n---\n'),
    // With a token: code search, which knows only one of them.
    'https://api.github.com/search/code?q=filename:SKILL.md+repo:atlas-org/kept&per_page=100&page=1': ok({
      total_count: 1,
      items: [{ path: '.claude/skills/commits/SKILL.md' }],
    }),
  };
}

/** GitHub from the recording, and the URL of every request made. */
function github(recording: Recording) {
  const requests: string[] = [];
  const recorded = replay(recording);
  const fetch: Fetch = (url, init) => {
    requests.push(url);
    return recorded(url, init);
  };
  return { fetch, requests };
}

/** A cache directory of the test's own, gone after it. */
function directory(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'skill-atlas-cache-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

/** `skill-atlas scan <url>` with the cache in `dir`; the output and the requests it made. */
async function scan(url: string, dir: string, recording = kept(), token?: string) {
  const { fetch, requests } = github(recording);
  const result = await atlas(['scan', url], { fetch, token, cache: diskCache(dir) });
  return { ...result, requests };
}

const OUTPUT = [
  'atlas-org/kept · 2 skills',
  'commits — Write good commits.',
  `  https://github.com/atlas-org/kept/blob/${FIRST}/.claude/skills/commits/SKILL.md`,
  '  also in .github/skills/commits/SKILL.md',
  'release',
  `  https://github.com/atlas-org/kept/blob/${FIRST}/tools/release/SKILL.md`,
].join('\n');

test('a rescan at an unchanged commit: one request, for the commit, and the same output', async (t) => {
  const dir = directory(t);
  const first = await scan('https://github.com/atlas-org/kept', dir);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.stdout, OUTPUT);
  assert.match(first.stderr, /^warning: gone\/SKILL\.md: listed, but not found at the scanned commit; skipped\nwarning: tools\/release\/SKILL\.md: malformed front matter: /);
  // The commit, the repository, the tree and the four files; the commit is not asked for twice.
  assert.deepEqual(first.requests.slice(0, 3), [`${API}/commits/HEAD`, API, `${API}/git/trees/${FIRST}?recursive=1`]);
  assert.equal(first.requests.length, 7);
  assert.ok(existsSync(join(dir, 'atlas-org', 'kept', `${FIRST}.json`)));

  const again = await scan('https://github.com/atlas-org/kept', dir);
  assert.deepEqual(again.requests, [`${API}/commits/HEAD`]);
  assert.deepEqual({ code: again.code, stdout: again.stdout, stderr: again.stderr }, { code: first.code, stdout: first.stdout, stderr: first.stderr });

  // Asked for in another case: kept under the repository's own name, so the same file.
  const other = await scan('github.com/ATLAS-ORG/Kept', dir);
  assert.deepEqual(other.requests, ['https://api.github.com/repos/ATLAS-ORG/Kept/commits/HEAD']);
  assert.equal(other.stdout, OUTPUT);
});

test('a new commit → scanned as without a cache, and kept too', async (t) => {
  const dir = directory(t);
  await scan('https://github.com/atlas-org/kept', dir);
  const pushed = await scan('https://github.com/atlas-org/kept', dir, kept(SECOND));
  assert.equal(pushed.code, 0, pushed.stderr);
  assert.equal(pushed.stdout, ['atlas-org/kept · 1 skill', 'new — Added later.', `  https://github.com/atlas-org/kept/blob/${SECOND}/skills/new/SKILL.md`].join('\n'));
  assert.ok(pushed.requests.includes(`${API}/git/trees/${SECOND}?recursive=1`));
  assert.deepEqual(readdirSync(join(dir, 'atlas-org', 'kept')).sort(), [`${FIRST}.json`, `${SECOND}.json`]);
  assert.deepEqual((await scan('https://github.com/atlas-org/kept', dir, kept(SECOND))).requests, [`${API}/commits/HEAD`]);
});

test('/tree/<ref>: a rescan asks for the ref\'s commit only; a commit kept by another scan serves it', async (t) => {
  const dir = directory(t);
  const branch = await scan('https://github.com/atlas-org/kept/tree/main', dir);
  assert.equal(branch.stdout, OUTPUT);
  assert.deepEqual((await scan('https://github.com/atlas-org/kept/tree/main', dir)).requests, [`${API}/commits/main`]);
  // The same commit, pinned, and the default branch: kept from the whole tree, it serves both.
  const pinned = await scan(`https://github.com/atlas-org/kept/tree/${FIRST}`, dir);
  assert.deepEqual(pinned.requests, [`${API}/commits/${FIRST}`]);
  assert.equal(pinned.stdout, OUTPUT);
  assert.deepEqual((await scan('https://github.com/atlas-org/kept', dir)).requests, [`${API}/commits/HEAD`]);
});

test('with GITHUB_TOKEN: what code search found is kept, but serves only another scan through code search', async (t) => {
  const dir = directory(t);
  const searched = await scan('https://github.com/atlas-org/kept', dir, kept(), 'secret');
  assert.equal(searched.stdout, ['atlas-org/kept · 1 skill', 'commits — Write good commits.', `  https://github.com/atlas-org/kept/blob/${FIRST}/.claude/skills/commits/SKILL.md`].join('\n'));
  assert.deepEqual((await scan('https://github.com/atlas-org/kept', dir, kept(), 'secret')).requests, [`${API}/commits/HEAD`]);

  // Without a token, the whole tree: code search's answer does not serve it, the tree's is kept.
  const tree = await scan('https://github.com/atlas-org/kept', dir);
  assert.equal(tree.stdout, OUTPUT);
  assert.ok(tree.requests.includes(`${API}/git/trees/${FIRST}?recursive=1`));
  // And then serves every scan of the commit, a token's too.
  const token = await scan('https://github.com/atlas-org/kept', dir, kept(), 'secret');
  assert.deepEqual(token.requests, [`${API}/commits/HEAD`]);
  assert.equal(token.stdout, OUTPUT);
});

test('a cut or foreign cache file is a miss: the scan goes on, and keeps it again', async (t) => {
  const dir = directory(t);
  await scan('https://github.com/atlas-org/kept', dir);
  const file = join(dir, 'atlas-org', 'kept', `${FIRST}.json`);
  const record = readFileSync(file, 'utf8');
  for (const broken of [record.slice(0, 40), 'null', JSON.stringify({ ...JSON.parse(record), format: 2 }), record.replace(FIRST, SECOND)]) {
    writeFileSync(file, broken);
    const result = await scan('https://github.com/atlas-org/kept', dir);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, OUTPUT);
    assert.ok(result.requests.length > 1, broken);
    assert.equal(readFileSync(file, 'utf8'), record);
  }
});

test('a cache directory that cannot be written → the same scan, nothing kept', async (t) => {
  const file = join(directory(t), 'a-file');
  writeFileSync(file, '');
  for (let run = 0; run < 2; run++) {
    const result = await scan('https://github.com/atlas-org/kept', join(file, 'skill-atlas'));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, OUTPUT);
    assert.equal(result.requests.length, 7);
  }
});

test('with a cache: an unreachable repository, an unknown ref → the same message as without', async (t) => {
  const dir = directory(t);
  const missing = await scan('https://github.com/atlas-org/no-such-repository', dir, {
    'https://api.github.com/repos/atlas-org/no-such-repository/commits/HEAD': { status: 404, body: { message: 'Not Found' } },
    'https://api.github.com/repos/atlas-org/no-such-repository': { status: 404, body: { message: 'Not Found' } },
  });
  assert.deepEqual([missing.code, missing.stdout, missing.stderr], [1, '', 'Repository not found: https://github.com/atlas-org/no-such-repository']);
  const ref = await scan('https://github.com/atlas-org/kept/tree/no-such-branch', dir);
  assert.deepEqual([ref.code, ref.stdout, ref.stderr], [1, '', 'Not found in https://github.com/atlas-org/kept: no-such-branch']);
  assert.deepEqual(readdirSync(dir), []);
});

test('organization, with a token: a repository at a kept commit costs no tree and no file', async (t) => {
  const dir = directory(t);
  const first = await scan('https://github.com/atlas-org', dir, RECORDING, 'secret');
  assert.equal(first.code, 0, first.stderr);
  assert.ok(first.requests.some((url) => url.includes('/git/trees/')));
  const again = await scan('https://github.com/atlas-org', dir, RECORDING, 'secret');
  assert.deepEqual({ stdout: again.stdout, stderr: again.stderr }, { stdout: first.stdout, stderr: first.stderr });
  assert.deepEqual(
    again.requests.sort(),
    [
      'https://api.github.com/graphql',
      'https://api.github.com/search/code?q=filename:SKILL.md+user:atlas-org&per_page=100&page=1',
      'https://api.github.com/users/atlas-org',
      'https://api.github.com/users/atlas-org/repos?per_page=100&page=1',
    ],
  );
});

test('organization, without a token: its tree tells the commit, so only the files are not read again', async (t) => {
  const dir = directory(t);
  const first = await scan('https://github.com/atlas-org', dir, RECORDING);
  assert.ok(first.requests.some((url) => url.startsWith('https://raw.githubusercontent.com/')));
  const again = await scan('https://github.com/atlas-org', dir, RECORDING);
  assert.deepEqual({ stdout: again.stdout, stderr: again.stderr }, { stdout: first.stdout, stderr: first.stderr });
  assert.deepEqual(again.requests.sort(), first.requests.filter((url) => url.startsWith('https://api.github.com/')).sort());
});

test('the cache directory: $XDG_CACHE_HOME/skill-atlas, else ~/.cache/skill-atlas; a relative XDG_CACHE_HOME is ignored', () => {
  assert.equal(cacheDirectory({ XDG_CACHE_HOME: '/var/cache/me' }), join('/var/cache/me', 'skill-atlas'));
  assert.equal(cacheDirectory({ XDG_CACHE_HOME: 'relative' }), join(homedir(), '.cache', 'skill-atlas'));
  assert.equal(cacheDirectory({}), join(homedir(), '.cache', 'skill-atlas'));
});

test('the real CLI: a local directory keeps nothing in the cache', (t) => {
  const dir = directory(t);
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { encoding: 'utf8', env: { ...process.env, XDG_CACHE_HOME: dir } });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.deepEqual(readdirSync(dir), []);
});
