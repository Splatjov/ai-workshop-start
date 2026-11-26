// spec/analysis.md, "Organization" and "Filter", and their output in spec/cli.md: what the real
// command prints for an organization answered in tests/web/recording.ts, and for ./fixture.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { parseGitHubUrl, type Fetch } from '../src/core/github.ts';
import { filterSkills, type Skill } from '../src/core/model.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { atlas, CLI, FIXTURE } from './helpers.ts';
import { COMMIT, GAMMA_COMMIT, RECORDING } from './web/recording.ts';

/** GitHub from the recording, and every request made, with its Authorization header. */
function github(recording: Recording = RECORDING) {
  const requests: { url: string; authorization?: string }[] = [];
  const recorded = replay(recording);
  const fetch: Fetch = (url, init) => {
    requests.push({ url, authorization: init?.headers?.Authorization });
    return recorded(url, init);
  };
  return { fetch, requests };
}

const ORGANIZATION = [
  'atlas-org · 4 skills in 2 repositories',
  '',
  'atlas-org/alpha · 2 skills',
  'code-style — Follow the code style.',
  `  https://github.com/atlas-org/alpha/blob/${COMMIT}/docs/code-style/SKILL.md`,
  'commits — Write commit messages the way this repository does.',
  `  https://github.com/atlas-org/alpha/blob/${COMMIT}/.claude/skills/commits/SKILL.md`,
  '',
  'atlas-org/gamma · 2 skills',
  'gradle — Build with Gradle.',
  `  https://github.com/atlas-org/gamma/blob/${GAMMA_COMMIT}/build/gradle/SKILL.md`,
  'release',
  `  https://github.com/atlas-org/gamma/blob/${GAMMA_COMMIT}/tools/release/SKILL.md`,
].join('\n');
const WARNING = /^warning: atlas-org\/gamma: tools\/release\/SKILL\.md: malformed front matter: .*; using the directory name$/;

test('github.com/<owner> is an organization; with a repository, a repository', () => {
  assert.deepEqual(parseGitHubUrl('https://github.com/JetBrains'), { owner: 'JetBrains' });
  assert.deepEqual(parseGitHubUrl('github.com/JetBrains/'), { owner: 'JetBrains' });
  assert.deepEqual(parseGitHubUrl('https://www.github.com/JetBrains/koog.git'), { owner: 'JetBrains', repo: 'koog' });
  assert.deepEqual(parseGitHubUrl('github.com/JetBrains/koog/tree/a/b'), { owner: 'JetBrains', repo: 'koog', ref: 'a/b' });
  assert.equal(parseGitHubUrl('https://gitlab.com/JetBrains'), undefined);
  assert.equal(parseGitHubUrl('https://github.com/'), undefined);
});

test('organization, without a token: the repository list, then each tree; only repositories with skills, by id', async () => {
  const { fetch, requests } = github();
  const result = await atlas(['scan', 'https://github.com/atlas-org'], { fetch });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, ORGANIZATION);
  assert.match(result.stderr, WARNING); // a warning names its repository
  const urls = requests.map((request) => request.url);
  assert.ok(urls.includes('https://api.github.com/users/atlas-org/repos?per_page=100&page=1'));
  assert.ok(!urls.some((url) => url.includes('/search/')));
  assert.ok(requests.every((request) => request.authorization === undefined));
  // The fork is not scanned; the empty repository is asked for its commit and left out.
  assert.ok(!urls.some((url) => url.includes('atlas-org/forked')));
  assert.ok(urls.includes('https://api.github.com/repos/atlas-org/empty/commits/main'));
});

test('organization, with a token: one code search over all its repositories, the same result', async () => {
  const { fetch, requests } = github();
  const result = await atlas(['scan', 'github.com/atlas-org/'], { fetch, token: 'secret' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, ORGANIZATION);
  assert.match(result.stderr, WARNING);
  const api = requests.filter((request) => request.url.startsWith('https://api.github.com/'));
  assert.deepEqual(
    api.map((request) => request.url).sort(),
    [
      'https://api.github.com/repos/atlas-org/alpha/commits/HEAD',
      'https://api.github.com/repos/atlas-org/gamma/commits/HEAD',
      'https://api.github.com/search/code?q=filename:SKILL.md+user:atlas-org&per_page=100&page=1',
      'https://api.github.com/users/atlas-org',
    ],
  );
  assert.ok(api.every((request) => request.authorization === 'Bearer secret'));
});

test('organization: the repository list is read page by page', async () => {
  const repositories = Array.from({ length: 101 }, (_, index) => ({
    full_name: `many/r${index}`,
    default_branch: 'main',
    fork: index !== 100, // only the last one, on the second page, is scanned
  }));
  const ok = (body: unknown) => ({ status: 200, body });
  const { fetch } = github({
    'https://api.github.com/users/many': ok({ login: 'many' }),
    'https://api.github.com/users/many/repos?per_page=100&page=1': ok(repositories.slice(0, 100)),
    'https://api.github.com/users/many/repos?per_page=100&page=2': ok(repositories.slice(100)),
    'https://api.github.com/repos/many/r100/commits/main': ok({ sha: COMMIT }),
    [`https://api.github.com/repos/many/r100/git/trees/${COMMIT}?recursive=1`]: ok({
      truncated: false,
      tree: [{ path: 'SKILL.md', mode: '100644', type: 'blob', sha: 'a' }],
    }),
    [`https://raw.githubusercontent.com/many/r100/${COMMIT}/SKILL.md`]: ok('---\nname: whole\ndescription: The whole repository.\n---\n'),
  });
  const result = await atlas(['scan', 'https://github.com/many'], { fetch });
  assert.equal(
    result.stdout,
    ['many · 1 skill in 1 repository', '', 'many/r100 · 1 skill', 'whole — The whole repository.', `  https://github.com/many/r100/blob/${COMMIT}/SKILL.md`].join('\n'),
  );
});

test('organization, with a token: more than 1000 files → the first 1000 and a warning', async () => {
  const recording: Recording = {
    'https://api.github.com/users/big': { status: 200, body: { login: 'big' } },
    'https://api.github.com/repos/big/skills/commits/HEAD': { status: 200, body: { sha: COMMIT } },
  };
  for (let page = 1; page <= 10; page++) {
    const items = Array.from({ length: 100 }, (_, index) => ({ path: `s${page}-${index}/SKILL.md`, repository: { full_name: 'big/skills' } }));
    recording[`https://api.github.com/search/code?q=filename:SKILL.md+user:big&per_page=100&page=${page}`] = { status: 200, body: { total_count: 1234, items } };
    for (const { path } of items) {
      recording[`https://raw.githubusercontent.com/big/skills/${COMMIT}/${path}`] = { status: 200, body: `---\nname: ${path.split('/')[0]}\n---\n` };
    }
  }
  const { fetch } = github(recording);
  const result = await atlas(['scan', 'https://github.com/big'], { fetch, token: 'secret' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'big · 1000 skills in 1 repository');
  assert.equal(result.stderr, 'warning: code search answers with at most 1000 files of 1234; the rest are not scanned');
});

test('organization without skills → 0 skills in 0 repositories, exit code 0', async () => {
  const { fetch } = github({
    'https://api.github.com/users/quiet': { status: 200, body: { login: 'quiet' } },
    'https://api.github.com/users/quiet/repos?per_page=100&page=1': { status: 200, body: [] },
  });
  assert.deepEqual(await atlas(['scan', 'https://github.com/quiet'], { fetch }), {
    code: 0,
    stdout: 'quiet · 0 skills in 0 repositories',
    stderr: '',
  });
});

test('unknown organization → a clear message, exit code 1', async () => {
  const { fetch } = github();
  assert.deepEqual(await atlas(['scan', 'https://github.com/no-such-org'], { fetch }), {
    code: 1,
    stdout: '',
    stderr: 'Organization not found: https://github.com/no-such-org',
  });
});

test('organization, without a token, past the rate limit → the message that asks for GITHUB_TOKEN', async () => {
  const { fetch } = github({
    ...RECORDING,
    'https://api.github.com/repos/atlas-org/gamma/commits/trunk': { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  });
  assert.deepEqual(await atlas(['scan', 'https://github.com/atlas-org'], { fetch }), {
    code: 1,
    stdout: '',
    stderr: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('filter: every word, in any case, in the name, the description or the path', () => {
  const skill = (name: string, description: string, path: string) => ({ name, description, path }) as Skill;
  const skills = [
    skill('commits', 'Write commit messages.', '.claude/skills/commits/SKILL.md'),
    skill('gradle', 'Build with Gradle.', 'build/gradle/SKILL.md'),
    skill('release', '', 'tools/release/SKILL.md'),
  ];
  const names = (query: string) => filterSkills(skills, query).map((found) => found.name);
  assert.deepEqual(names(''), ['commits', 'gradle', 'release']);
  assert.deepEqual(names('   '), ['commits', 'gradle', 'release']);
  assert.deepEqual(names('GRADLE'), ['gradle']); // the name, in any case
  assert.deepEqual(names('messages'), ['commits']); // the description
  assert.deepEqual(names('tools/'), ['release']); // the path
  assert.deepEqual(names('build  with'), ['gradle']); // every word
  assert.deepEqual(names('build commit'), []); // not one or the other
  assert.deepEqual(names('skill.md'), ['commits', 'gradle', 'release']);
});

test('--filter: only the matching skills, M of N skills, every warning still', async () => {
  const root = pathToFileURL(FIXTURE).href;
  const filtered = await atlas(['scan', FIXTURE, '--filter', 'Commit MESSAGES']);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(
    filtered.stdout,
    ['fixture · 1 of 3 skills', 'commits — Write commit messages the way this repository does.', `  ${root}/.claude/skills/commits/SKILL.md`].join('\n'),
  );
  assert.match(filtered.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);

  // Before the target, with =, by path; no match; no words.
  const byPath = await atlas(['scan', '--filter=.github/', FIXTURE]);
  assert.equal(byPath.stdout, ['fixture · 1 of 3 skills', "code-style — Follow the project's code style.", `  ${root}/.github/skills/code-style/SKILL.md`].join('\n'));
  assert.equal((await atlas(['scan', FIXTURE, '--filter', 'no-such-skill'])).stdout, 'fixture · 0 of 3 skills');
  assert.equal((await atlas(['scan', FIXTURE, '--filter', ''])).stdout, (await atlas(['scan', FIXTURE])).stdout);
});

test('--filter, through the real CLI', () => {
  const result = spawnSync(process.execPath, [CLI, 'scan', FIXTURE, '--filter', 'style'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'fixture · 1 of 3 skills');
});

test('--filter without its words, another option, two targets → the usage, exit code 1', async () => {
  const usage = 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>]';
  assert.deepEqual(await atlas(['scan', FIXTURE, '--filter']), { code: 1, stdout: '', stderr: usage });
  assert.deepEqual(await atlas(['scan', FIXTURE, '--token', 'x']), { code: 1, stdout: '', stderr: `Unknown option: --token\n${usage}` });
  assert.deepEqual(await atlas(['scan', FIXTURE, FIXTURE]), { code: 1, stdout: '', stderr: usage });
  assert.deepEqual(await atlas(['scan']), { code: 1, stdout: '', stderr: usage });
});

test('organization with --filter: M of N skills in R repositories, only the repositories with a match', async () => {
  const { fetch } = github();
  const result = await atlas(['scan', 'https://github.com/atlas-org', '--filter', 'gradle'], { fetch });
  assert.equal(
    result.stdout,
    [
      'atlas-org · 1 of 4 skills in 1 repository',
      '',
      'atlas-org/gamma · 1 of 2 skills',
      'gradle — Build with Gradle.',
      `  https://github.com/atlas-org/gamma/blob/${GAMMA_COMMIT}/build/gradle/SKILL.md`,
    ].join('\n'),
  );
  assert.match(result.stderr, WARNING);
  assert.equal((await atlas(['scan', 'https://github.com/atlas-org', '--filter', 'nothing'], { fetch })).stdout, 'atlas-org · 0 of 4 skills in 0 repositories');
});

test('help: the filter, the organization and where GITHUB_TOKEN goes', async () => {
  const { stdout } = await atlas(['help']);
  assert.match(stdout, /--filter <words>/);
  assert.match(stdout, /github\.com\/<owner>/);
  assert.match(stdout, /GITHUB_TOKEN, in the environment/);
});
