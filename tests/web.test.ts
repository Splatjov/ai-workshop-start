// spec/web.md: the browser backend's scan, the data the web view shows, on recorded GitHub answers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { replay } from '../src/core/replay.ts';
import { BROKEN_MD, COMMIT, COMMITS_MD, GAMMA_COMMIT, GRADLE_MD, RECORDING, STYLE_MD } from './web/recording.ts';

const requests: string[] = [];
const recorded = replay(RECORDING);
const backend = createBrowserBackend({
  fetch: (url, init) => {
    requests.push(url);
    return recorded(url, init);
  },
});
const blob = `https://github.com/JetBrains/atlas-demo/blob/${COMMIT}`;

test('scan: the repository, its skills sorted by name with pinned links, copies, and each SKILL.md as scanned', async () => {
  requests.length = 0;
  const view = await backend.scan('  https://github.com/JetBrains/atlas-demo  ');
  assert.ok('skills' in view, JSON.stringify(view));
  assert.deepEqual(view.repository, {
    id: 'JetBrains/atlas-demo',
    organization: 'JetBrains',
    name: 'atlas-demo',
    url: 'https://github.com/JetBrains/atlas-demo',
    commit: COMMIT,
  });
  assert.deepEqual(
    view.skills.map(({ name, description, path, link, copies, markdown }) => ({ name, description, path, link, copies, markdown })),
    [
      {
        name: 'code-style',
        description: 'Follow the code style.',
        path: 'docs/code-style/SKILL.md',
        link: `${blob}/docs/code-style/SKILL.md`,
        copies: [],
        markdown: STYLE_MD,
      },
      {
        name: 'commits',
        description: 'Write commit messages the way this repository does. Use for every commit.',
        path: '.claude/skills/commits/SKILL.md',
        link: `${blob}/.claude/skills/commits/SKILL.md`,
        copies: ['.github/skills/commits/SKILL.md'],
        markdown: COMMITS_MD,
      },
      {
        name: 'release',
        description: '',
        path: 'tools/release/SKILL.md',
        link: `${blob}/tools/release/SKILL.md`,
        copies: [],
        markdown: BROKEN_MD,
      },
    ],
  );
  assert.equal(view.warnings.length, 1);
  assert.match(view.warnings[0], /^tools\/release\/SKILL\.md: malformed front matter: .*; using the directory name$/);
});

test('scan: each SKILL.md is read once, without a token, through the tree', async () => {
  requests.length = 0;
  await backend.scan('github.com/JetBrains/atlas-demo');
  const raw = requests.filter((url) => url.startsWith('https://raw.githubusercontent.com/'));
  assert.equal(raw.length, 4);
  assert.equal(new Set(raw).size, 4);
  assert.ok(requests.some((url) => url.includes('/git/trees/')));
  assert.ok(!requests.some((url) => url.includes('/search/')));
});

test('scan: a /tree/<ref> URL scans that commit', async () => {
  const view = await backend.scan('https://github.com/JetBrains/atlas-demo/tree/v1');
  assert.ok('skills' in view);
  assert.equal(view.repository.commit, COMMIT);
  assert.equal(view.skills.length, 3);
});

test('scan: no SKILL.md → 0 skills', async () => {
  assert.deepEqual(await backend.scan('https://github.com/JetBrains/empty'), {
    repository: { id: 'JetBrains/empty', organization: 'JetBrains', name: 'empty', url: 'https://github.com/JetBrains/empty', commit: COMMIT },
    skills: [],
    warnings: [],
  });
});

test('scan: the CLI’s message for what cannot be scanned', async () => {
  assert.deepEqual(await backend.scan('https://github.com/JetBrains/no-such-repository'), {
    error: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });
  assert.deepEqual(await backend.scan('https://github.com/JetBrains/atlas-demo/tree/no-such-branch'), {
    error: 'Not found in https://github.com/JetBrains/atlas-demo: no-such-branch',
  });
  assert.deepEqual(await backend.scan('https://gitlab.com/JetBrains/atlas-demo'), {
    error: 'Not a GitHub repository URL: https://gitlab.com/JetBrains/atlas-demo',
  });
  assert.deepEqual(await backend.scan('https://github.com/JetBrains/not-answered'), {
    error: 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered',
  });
});

test('scan: with a token, it goes to GitHub with every API request, and code search finds the skills', async () => {
  const sent: { url: string; authorization?: string }[] = [];
  const withToken = createBrowserBackend({
    fetch: (url, init) => {
      sent.push({ url, authorization: init?.headers?.Authorization });
      return recorded(url, init);
    },
  });
  const view = await withToken.scan('https://github.com/JetBrains/koog', { token: '  secret  ' });
  assert.ok('skills' in view, JSON.stringify(view));
  assert.deepEqual(view.skills.map((skill) => skill.name), ['commits']);
  const api = sent.filter(({ url }) => url.startsWith('https://api.github.com/'));
  assert.ok(api.some(({ url }) => url.includes('/search/code?q=filename:SKILL.md+repo:JetBrains/koog')));
  assert.ok(api.every(({ authorization }) => authorization === 'Bearer secret'));

  // An empty token is no token.
  sent.length = 0;
  await withToken.scan('https://github.com/JetBrains/koog', { token: '  ' });
  assert.ok(sent.every(({ authorization }) => authorization === undefined));
  assert.ok(!sent.some(({ url }) => url.includes('/search/')));
});

test('scan: the token messages name the GitHub token field, not GITHUB_TOKEN', async () => {
  const answering = (status: number, message: string) =>
    createBrowserBackend({ fetch: async () => new Response(JSON.stringify({ message }), { status }) });
  assert.deepEqual(await answering(401, 'Bad credentials').scan('https://github.com/JetBrains/koog', { token: 'wrong' }), {
    error: 'GitHub rejected the token in the GitHub token field',
  });
  assert.deepEqual(await answering(403, 'API rate limit exceeded for 192.0.2.1.').scan('https://github.com/JetBrains/koog'), {
    error: 'GitHub rate limit reached; fill in the GitHub token field',
  });
  // With a token, past the limit: nothing to fill in.
  assert.deepEqual(await answering(403, 'API rate limit exceeded for user ID 1.').scan('https://github.com/JetBrains/koog', { token: 'good' }), {
    error: 'GitHub rate limit reached; try again in a minute',
  });
});

test('scan: an organization → its repositories with skills, by id, each SKILL.md as scanned, warnings named', async () => {
  for (const token of [undefined, 'secret']) {
    const view = await backend.scan('https://github.com/atlas-org', { token });
    assert.ok('repositories' in view, JSON.stringify(view));
    assert.deepEqual(view.organization, { id: 'atlas-org', url: 'https://github.com/atlas-org' });
    assert.deepEqual(
      view.repositories.map(({ repository, skills }) => ({
        id: repository.id,
        commit: repository.commit,
        skills: skills.map(({ id, link, markdown }) => ({ id, link, markdown })),
      })),
      [
        {
          id: 'atlas-org/alpha',
          commit: COMMIT,
          skills: [
            { id: 'atlas-org/alpha:docs/code-style/SKILL.md', link: `https://github.com/atlas-org/alpha/blob/${COMMIT}/docs/code-style/SKILL.md`, markdown: STYLE_MD },
            { id: 'atlas-org/alpha:.claude/skills/commits/SKILL.md', link: `https://github.com/atlas-org/alpha/blob/${COMMIT}/.claude/skills/commits/SKILL.md`, markdown: COMMITS_MD },
          ],
        },
        {
          id: 'atlas-org/gamma',
          commit: GAMMA_COMMIT,
          skills: [
            { id: 'atlas-org/gamma:build/gradle/SKILL.md', link: `https://github.com/atlas-org/gamma/blob/${GAMMA_COMMIT}/build/gradle/SKILL.md`, markdown: GRADLE_MD },
            { id: 'atlas-org/gamma:tools/release/SKILL.md', link: `https://github.com/atlas-org/gamma/blob/${GAMMA_COMMIT}/tools/release/SKILL.md`, markdown: BROKEN_MD },
          ],
        },
      ],
    );
    assert.equal(view.warnings.length, 1);
    assert.match(view.warnings[0], /^atlas-org\/gamma: tools\/release\/SKILL\.md: malformed front matter: /);
  }
  assert.deepEqual(await backend.scan('https://github.com/no-such-org'), { error: 'Organization not found: https://github.com/no-such-org' });
});
