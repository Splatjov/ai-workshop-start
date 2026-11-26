// spec/web.md: the browser backend's scan, the data the web view shows, on recorded GitHub answers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { replay } from '../src/core/replay.ts';
import { BROKEN_MD, COMMIT, COMMITS_MD, RECORDING, STYLE_MD } from './web/recording.ts';

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
