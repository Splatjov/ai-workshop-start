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
import { ATLAS_ORG, COMMIT, GAMMA_COMMIT, graphql, RECORDING } from './web/recording.ts';

/** GitHub from the recording, and every request made, with its Authorization header. */
function github(recording: Recording = RECORDING) {
  const requests: { url: string; authorization?: string; method?: string; body?: string }[] = [];
  const recorded = replay(recording);
  const fetch: Fetch = (url, init) => {
    requests.push({ url, authorization: init?.headers?.Authorization, method: init?.method, body: init?.body });
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

test('organization, without a token: the repository list, then one request a repository; only repositories with skills, by id', async () => {
  const { fetch, requests } = github();
  const result = await atlas(['scan', 'https://github.com/atlas-org'], { fetch });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, ORGANIZATION);
  assert.match(result.stderr, WARNING); // a warning names its repository
  assert.ok(requests.every((request) => request.authorization === undefined));
  assert.deepEqual(
    requests.map((request) => request.url).filter((url) => url.startsWith('https://api.github.com/')).sort(),
    [
      // The commit is asked for only where the tree has a SKILL.md.
      'https://api.github.com/repos/atlas-org/alpha/commits/main',
      'https://api.github.com/repos/atlas-org/alpha/git/trees/main?recursive=1',
      // No skill, and empty: one request each. The fork: none.
      'https://api.github.com/repos/atlas-org/beta/git/trees/main?recursive=1',
      'https://api.github.com/repos/atlas-org/empty/git/trees/main?recursive=1',
      'https://api.github.com/repos/atlas-org/gamma/commits/trunk',
      'https://api.github.com/repos/atlas-org/gamma/git/trees/trunk?recursive=1',
      'https://api.github.com/users/atlas-org',
      'https://api.github.com/users/atlas-org/repos?per_page=100&page=1',
    ],
  );
});

test('organization, without a token: a push between the tree and the commit, a tree too large → the repository is read at its commit', async () => {
  const ok = (body: unknown) => ({ status: 200, body });
  const pushed = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const skill = { path: '.claude/skills/commits/SKILL.md', mode: '100644', type: 'blob', sha: 'a' };
  const api = 'https://api.github.com/repos/moving';
  const { fetch, requests } = github({
    'https://api.github.com/users/moving': ok({ login: 'moving', public_repos: 2 }),
    'https://api.github.com/users/moving/repos?per_page=100&page=1': ok([
      { full_name: 'moving/pushed', default_branch: 'main', fork: false },
      { full_name: 'moving/large', default_branch: 'main', fork: false },
    ]),
    // The tree was listed at one commit; the branch is at the next one when its commit is asked for.
    [`${api}/pushed/git/trees/main?recursive=1`]: ok({ sha: COMMIT, truncated: false, tree: [{ ...skill, path: 'old/SKILL.md' }] }),
    [`${api}/pushed/commits/main`]: ok({ sha: pushed, commit: { tree: { sha: 'new-tree' } } }),
    [`${api}/pushed/git/trees/${pushed}?recursive=1`]: ok({ sha: 'new-tree', truncated: false, tree: [skill] }),
    [`https://raw.githubusercontent.com/moving/pushed/${pushed}/.claude/skills/commits/SKILL.md`]: ok('---\nname: commits\ndescription: Write good commits.\n---\n'),
    // Too large for one answer: only the skill roots, and a warning, as for any repository.
    [`${api}/large/git/trees/main?recursive=1`]: ok({ sha: COMMIT, truncated: true, tree: [] }),
    [`${api}/large/commits/main`]: ok({ sha: COMMIT, commit: { tree: { sha: 'large-tree' } } }),
    [`${api}/large/git/trees/${COMMIT}?recursive=1`]: ok({ sha: 'large-tree', truncated: true, tree: [] }),
    [`${api}/large/git/trees/${COMMIT}`]: ok({ sha: 'large-tree', truncated: false, tree: [] }),
  });
  const result = await atlas(['scan', 'https://github.com/moving'], { fetch });
  assert.equal(
    result.stdout,
    ['moving · 1 skill in 1 repository', '', 'moving/pushed · 1 skill', 'commits — Write good commits.', `  https://github.com/moving/pushed/blob/${pushed}/.claude/skills/commits/SKILL.md`].join('\n'),
  );
  assert.equal(
    result.stderr,
    'warning: moving/large: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills (GITHUB_TOKEN searches everywhere)',
  );
  assert.ok(!requests.some((request) => request.url.includes('old/SKILL.md')));
});

test('organization, with a token: a code search and one request for every 25 repositories; a tree only where skills may be', async () => {
  const { fetch, requests } = github();
  const result = await atlas(['scan', 'github.com/atlas-org/'], { fetch, token: 'secret' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, ORGANIZATION);
  assert.match(result.stderr, WARNING);
  const api = requests.filter((request) => request.url.startsWith('https://api.github.com/'));
  assert.deepEqual(
    api.map((request) => request.url).sort(),
    [
      // The five repositories' commits and usual skill places: one request. beta, empty and
      // the fork cost none of their own.
      'https://api.github.com/graphql',
      `https://api.github.com/repos/atlas-org/alpha/git/trees/${COMMIT}?recursive=1`,
      `https://api.github.com/repos/atlas-org/gamma/git/trees/${GAMMA_COMMIT}?recursive=1`,
      'https://api.github.com/search/code?q=filename:SKILL.md+user:atlas-org&per_page=100&page=1',
      'https://api.github.com/users/atlas-org',
      'https://api.github.com/users/atlas-org/repos?per_page=100&page=1',
    ],
  );
  assert.ok(api.every((request) => request.authorization === 'Bearer secret'));
  const probe = requests.find((request) => request.url.endsWith('/graphql'))!;
  assert.equal(probe.method, 'POST');
  // Every usual place of skills is asked about, and no fork.
  for (const place of ['SKILL.md', 'skills', '.agents/skills', '.claude/skills', '.github/skills', 'agent/skills']) {
    assert.ok(probe.body!.includes(JSON.stringify(`HEAD:${place}`).slice(1, -1)), place);
  }
  assert.ok(!probe.body!.includes('forked'));
});

/** atlas-org with one more repository: listed, known to GraphQL, with the files given. */
function withRepository(name: string, places: string[], files: Record<string, string>, extra: Recording = {}): Recording {
  const ok = (body: unknown) => ({ status: 200, body });
  const id = `atlas-org/${name}`;
  const listed = RECORDING['https://api.github.com/users/atlas-org/repos?per_page=100&page=1'].body as object[];
  const tree = Object.keys(files).map((path) => ({ path, mode: '100644', type: 'blob', sha: path }));
  return {
    ...RECORDING,
    'https://api.github.com/users/atlas-org/repos?per_page=100&page=1': ok([...listed, { full_name: id, default_branch: 'main', fork: false }]),
    'https://api.github.com/graphql': graphql({ ...ATLAS_ORG, [id]: { commit: COMMIT, places } }),
    [`https://api.github.com/repos/${id}/git/trees/${COMMIT}?recursive=1`]: ok({ sha: 'tree', truncated: false, tree }),
    [`https://api.github.com/repos/${id}/git/trees/main?recursive=1`]: ok({ sha: COMMIT, truncated: false, tree }),
    [`https://api.github.com/repos/${id}/commits/main`]: ok({ sha: COMMIT, commit: { tree: { sha: 'tree' } } }),
    ...Object.fromEntries(Object.entries(files).map(([path, text]) => [`https://raw.githubusercontent.com/${id}/${COMMIT}/${path}`, ok(text)])),
    ...extra,
  };
}

test('organization: a repository code search leaves out, with a skill folder at a usual place, is scanned whole with a token, as without', async () => {
  // Archived, or long inactive, or as getsentry/plugin-grok was live: absent from the search's answer.
  const recording = withRepository('archived', ['skills'], {
    'skills/old/SKILL.md': '---\nname: old\ndescription: Kept for the record.\n---\n',
    'docs/more/SKILL.md': '---\nname: more\ndescription: Outside the folder.\n---\n',
  });
  const expected = ORGANIZATION.replace('atlas-org · 4 skills in 2 repositories', 'atlas-org · 6 skills in 3 repositories').replace(
    '\natlas-org/gamma · 2 skills',
    [
      '',
      'atlas-org/archived · 2 skills',
      'more — Outside the folder.',
      `  https://github.com/atlas-org/archived/blob/${COMMIT}/docs/more/SKILL.md`,
      'old — Kept for the record.',
      `  https://github.com/atlas-org/archived/blob/${COMMIT}/skills/old/SKILL.md`,
      '',
      'atlas-org/gamma · 2 skills',
    ].join('\n'),
  );
  const withToken = github(recording);
  const scanned = await atlas(['scan', 'https://github.com/atlas-org'], { fetch: withToken.fetch, token: 'secret' });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, expected);
  assert.deepEqual(scanned, await atlas(['scan', 'https://github.com/atlas-org'], { fetch: github(recording).fetch }));
});

test('organization, with a token: a repository code search leaves out, with skills only elsewhere, is not read; without a token it is', async () => {
  const recording = withRepository('elsewhere', [], { 'docs/deep/SKILL.md': '---\nname: deep\ndescription: Far from the usual places.\n---\n' });
  const withToken = github(recording);
  const scanned = await atlas(['scan', 'https://github.com/atlas-org'], { fetch: withToken.fetch, token: 'secret' });
  assert.equal(scanned.stdout, ORGANIZATION);
  assert.ok(!withToken.requests.some((request) => request.url.includes('/repos/atlas-org/elsewhere/')));

  const complete = await atlas(['scan', 'https://github.com/atlas-org'], { fetch: github(recording).fetch });
  assert.match(complete.stdout, /^atlas-org · 5 skills in 3 repositories\n/);
  assert.match(complete.stdout, /\natlas-org\/elsewhere · 1 skill\ndeep — Far from the usual places\.\n/);
});

test('organization, with a token: a tree too large to list → the skill roots, what code search found, and a warning', async () => {
  const ok = (body: unknown) => ({ status: 200, body });
  const api = 'https://api.github.com/repos/atlas-org/gamma/git/trees';
  const { fetch } = github({
    ...RECORDING,
    [`${api}/${GAMMA_COMMIT}?recursive=1`]: ok({ sha: 'gamma-tree', truncated: true, tree: [] }),
    [`${api}/${GAMMA_COMMIT}`]: ok({ sha: 'gamma-tree', truncated: false, tree: [] }),
  });
  const result = await atlas(['scan', 'https://github.com/atlas-org'], { fetch, token: 'secret' });
  assert.equal(result.stdout, ORGANIZATION); // gamma's two skills, outside the skill roots, come from code search
  assert.equal(
    result.stderr.split('\n')[0],
    'warning: atlas-org/gamma: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills (and where code search finds a SKILL.md)',
  );
});

test('organization, with a token: 25 repositories a request; one GitHub cannot answer in time is asked for in halves', async () => {
  const ok = (body: unknown) => ({ status: 200, body });
  const names = Array.from({ length: 26 }, (_, index) => `r${index}`);
  const known = graphql(Object.fromEntries(names.map((name) => [`wide/${name}`, { commit: COMMIT, places: name === 'r25' ? ['SKILL.md'] : [] }])));
  const sizes: number[] = [];
  const { fetch } = github({
    'https://api.github.com/users/wide': ok({ login: 'wide', public_repos: 26 }),
    'https://api.github.com/users/wide/repos?per_page=100&page=1': ok(names.map((name) => ({ full_name: `wide/${name}`, default_branch: 'main', fork: false }))),
    'https://api.github.com/search/code?q=filename:SKILL.md+user:wide&per_page=100&page=1': ok({ total_count: 0, items: [] }),
    'https://api.github.com/graphql': {
      status: 200,
      body: (request: string) => {
        sizes.push(request.match(/:repository\(/g)!.length);
        return (known.body as (request: string) => unknown)(request);
      },
    },
    [`https://api.github.com/repos/wide/r25/git/trees/${COMMIT}?recursive=1`]: ok({ sha: 'tree', truncated: false, tree: [{ path: 'SKILL.md', mode: '100644', type: 'blob', sha: 'a' }] }),
    [`https://raw.githubusercontent.com/wide/r25/${COMMIT}/SKILL.md`]: ok('---\nname: whole\ndescription: The whole repository.\n---\n'),
  });
  // GitHub gives up on a request about more than 20 repositories.
  const slow: Fetch = async (url, init) =>
    url.endsWith('/graphql') && init!.body!.match(/:repository\(/g)!.length > 20 ? new Response('<html>502 Bad Gateway</html>', { status: 502 }) : fetch(url, init);
  const result = await atlas(['scan', 'https://github.com/wide'], { fetch: slow, token: 'secret' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'wide · 1 skill in 1 repository');
  assert.deepEqual(sizes.sort((a, b) => a - b), [1, 12, 13]); // 25 → 13 + 12, and the 26th

  // One repository GitHub cannot answer for at all: the scan stops with its message.
  const down: Fetch = async (url, init) => (url.endsWith('/graphql') ? new Response('', { status: 502 }) : fetch(url, init));
  assert.deepEqual(await atlas(['scan', 'https://github.com/wide'], { fetch: down, token: 'secret' }), {
    code: 1,
    stdout: '',
    stderr: 'GitHub answered 502 for https://api.github.com/graphql',
  });
});

test('organization, with a token, past its limits → the message says when to try again', async () => {
  const recorded = github().fetch;
  const reset = Math.floor(Date.now() / 1000) + 30 * 60;
  const limited: Fetch = async (url, init) =>
    url === `https://api.github.com/repos/atlas-org/gamma/git/trees/${GAMMA_COMMIT}?recursive=1`
      ? new Response(JSON.stringify({ message: 'API rate limit exceeded for user ID 1.' }), {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
        })
      : recorded(url, init);
  assert.deepEqual(await atlas(['scan', 'https://github.com/atlas-org'], { fetch: limited, token: 'secret' }), {
    code: 1,
    stdout: '',
    stderr: 'GitHub rate limit reached; try again in 30 minutes',
  });

  // A limit that resets within a minute.
  const soon: Fetch = async (url, init) =>
    url === `https://api.github.com/repos/atlas-org/gamma/git/trees/${GAMMA_COMMIT}?recursive=1`
      ? new Response(JSON.stringify({ message: 'API rate limit exceeded for user ID 1.' }), {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 30) },
        })
      : recorded(url, init);
  assert.deepEqual(await atlas(['scan', 'https://github.com/atlas-org'], { fetch: soon, token: 'secret' }), {
    code: 1,
    stdout: '',
    stderr: 'GitHub rate limit reached; try again in a minute',
  });

  // GraphQL says it in a 200 answer, with the same headers.
  const exhausted = (headers: Record<string, string>): Fetch => async (url, init) =>
    url === 'https://api.github.com/graphql'
      ? new Response(JSON.stringify({ errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded for user ID 1.' }] }), { status: 200, headers })
      : recorded(url, init);
  assert.deepEqual(
    await atlas(['scan', 'https://github.com/atlas-org'], { fetch: exhausted({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }), token: 'secret' }),
    { code: 1, stdout: '', stderr: 'GitHub rate limit reached; try again in 30 minutes' },
  );

  // GitHub does not say when.
  assert.deepEqual(await atlas(['scan', 'https://github.com/atlas-org'], { fetch: exhausted({}), token: 'secret' }), {
    code: 1,
    stdout: '',
    stderr: 'GitHub rate limit reached; try again in a minute',
  });
});

test('organization: the pages of the repository list are asked for together, and beyond the count the owner gives', async () => {
  const repositories = Array.from({ length: 201 }, (_, index) => ({
    full_name: `many/r${index}`,
    default_branch: 'main',
    fork: index !== 200, // only the last one, on the third page, is scanned
  }));
  const ok = (body: unknown) => ({ status: 200, body });
  const { fetch, requests } = github({
    // The count says two pages; there is one repository more.
    'https://api.github.com/users/many': ok({ login: 'many', public_repos: 200 }),
    'https://api.github.com/users/many/repos?per_page=100&page=1': ok(repositories.slice(0, 100)),
    'https://api.github.com/users/many/repos?per_page=100&page=2': ok(repositories.slice(100, 200)),
    'https://api.github.com/users/many/repos?per_page=100&page=3': ok(repositories.slice(200)),
    'https://api.github.com/repos/many/r200/git/trees/main?recursive=1': ok({
      sha: COMMIT,
      truncated: false,
      tree: [{ path: 'SKILL.md', mode: '100644', type: 'blob', sha: 'a' }],
    }),
    'https://api.github.com/repos/many/r200/commits/main': ok({ sha: COMMIT, commit: { tree: { sha: 'tree' } } }),
    [`https://raw.githubusercontent.com/many/r200/${COMMIT}/SKILL.md`]: ok('---\nname: whole\ndescription: The whole repository.\n---\n'),
  });
  const result = await atlas(['scan', 'https://github.com/many'], { fetch });
  assert.equal(
    result.stdout,
    ['many · 1 skill in 1 repository', '', 'many/r200 · 1 skill', 'whole — The whole repository.', `  https://github.com/many/r200/blob/${COMMIT}/SKILL.md`].join('\n'),
  );
  assert.equal(requests.filter((request) => request.url.startsWith('https://api.github.com/')).length, 6);
});

test('organization, with a token: more than 1000 files in the search → a warning; a repository found is still read whole', async () => {
  const ok = (body: unknown) => ({ status: 200, body });
  const paths = Array.from({ length: 1234 }, (_, index) => `s${index}/SKILL.md`);
  const recording: Recording = {
    'https://api.github.com/users/big': ok({ login: 'big', public_repos: 1 }),
    'https://api.github.com/users/big/repos?per_page=100&page=1': ok([{ full_name: 'big/skills', default_branch: 'main', fork: false }]),
    'https://api.github.com/graphql': graphql({ 'big/skills': { commit: COMMIT } }),
    [`https://api.github.com/repos/big/skills/git/trees/${COMMIT}?recursive=1`]: ok({
      sha: 'tree',
      truncated: false,
      tree: paths.map((path) => ({ path, mode: '100644', type: 'blob', sha: path })),
    }),
    ...Object.fromEntries(paths.map((path) => [`https://raw.githubusercontent.com/big/skills/${COMMIT}/${path}`, ok(`---\nname: ${path.split('/')[0]}\n---\n`)])),
  };
  for (let page = 1; page <= 10; page++) {
    const items = paths.slice((page - 1) * 100, page * 100).map((path) => ({ path, repository: { full_name: 'big/skills' } }));
    recording[`https://api.github.com/search/code?q=filename:SKILL.md+user:big&per_page=100&page=${page}`] = ok({ total_count: 1234, items });
  }
  const { fetch } = github(recording);
  const result = await atlas(['scan', 'https://github.com/big'], { fetch, token: 'secret' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'big · 1234 skills in 1 repository');
  assert.equal(
    result.stderr,
    'warning: code search answers with at most 1000 files of 1234; a repository among the rest is scanned only with a skill folder at a usual place',
  );
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
