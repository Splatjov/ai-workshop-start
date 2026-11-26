// Where skills live: the cases in spec/analysis.md, "Where skills live", on what the real command
// prints for small repositories made on disk and answered for GitHub.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { replay } from '../src/core/replay.ts';
import { atlas } from './helpers.ts';

const skill = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;

/** A repository on disk, named `repo`, with the files given; removed after the test. */
function repository(t: TestContext, files: Record<string, string>): string {
  const root = join(mkdtempSync(join(tmpdir(), 'skill-atlas-')), 'repo');
  t.after(() => rmSync(dirname(root), { recursive: true, force: true }));
  mkdirSync(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('a SKILL.md anywhere is a skill, outside the skill roots too', async (t) => {
  const root = repository(t, { 'plugins/kotlin/skills/gradle/SKILL.md': skill('gradle', 'Build with Gradle.') });
  const result = await atlas(['scan', root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    ['repo · 1 skill', 'gradle — Build with Gradle.', `  ${pathToFileURL(root).href}/plugins/kotlin/skills/gradle/SKILL.md`].join('\n'),
  );
});

test('only a file named exactly SKILL.md: skill.md and SKILL.md.bak are not skills', async (t) => {
  const root = repository(t, {
    '.claude/skills/lower/skill.md': skill('lower', 'Lower case.'),
    '.claude/skills/backup/SKILL.md.bak': skill('backup', 'A backup.'),
    '.claude/skills/SKILL.md/README.md': 'a directory named SKILL.md',
  });
  const result = await atlas(['scan', root]);
  assert.equal(result.stdout, 'repo · 0 skills');
});

test('without front matter: named after its directory; at the root, after the repository', async (t) => {
  const root = repository(t, { 'SKILL.md': '# The whole repository\n', '.claude/skills/review/SKILL.md': '# Review\n' });
  const result = await atlas(['scan', root]);
  const url = pathToFileURL(root).href;
  assert.equal(result.stdout, ['repo · 2 skills', 'repo', `  ${url}/SKILL.md`, 'review', `  ${url}/.claude/skills/review/SKILL.md`].join('\n'));
  assert.equal(
    result.stderr,
    [
      'warning: .claude/skills/review/SKILL.md: no front matter; using the directory name',
      'warning: SKILL.md: no front matter; using the directory name',
    ].join('\n'),
  );
});

test('a SKILL.md inside another skill is a skill of its own', async (t) => {
  const root = repository(t, {
    '.claude/skills/release/SKILL.md': skill('release', 'Release it.'),
    '.claude/skills/release/notes/SKILL.md': skill('release-notes', 'Write the notes.'),
  });
  const result = await atlas(['scan', root]);
  assert.match(result.stdout, /^repo · 2 skills\nrelease — Release it\.\n.*\nrelease-notes — Write the notes\.\n.*\/release\/notes\/SKILL\.md$/);
});

test('the same file in several agent folders: one skill, at the first skill root, also in the others', async (t) => {
  const text = skill('commits', 'Write good commits.');
  const root = repository(t, {
    '.github/skills/commits/SKILL.md': text,
    '.claude/skills/commits/SKILL.md': text,
    'tools/commits/SKILL.md': text,
    '.agents/skills/commits/SKILL.md': text,
  });
  const result = await atlas(['scan', root]);
  assert.equal(
    result.stdout,
    [
      'repo · 1 skill',
      'commits — Write good commits.',
      `  ${pathToFileURL(root).href}/.agents/skills/commits/SKILL.md`,
      '  also in .claude/skills/commits/SKILL.md, .github/skills/commits/SKILL.md, tools/commits/SKILL.md',
    ].join('\n'),
  );
});

test('copies that differ are separate skills, ordered by path under one name', async (t) => {
  const root = repository(t, {
    '.claude/skills/commits/SKILL.md': skill('commits', 'The Claude version.'),
    '.agents/skills/commits/SKILL.md': skill('commits', 'The shared version.'),
  });
  const result = await atlas(['scan', root]);
  const url = pathToFileURL(root).href;
  assert.equal(
    result.stdout,
    [
      'repo · 2 skills',
      'commits — The shared version.',
      `  ${url}/.agents/skills/commits/SKILL.md`,
      'commits — The Claude version.',
      `  ${url}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('symbolic links are not followed: a linked skill root or SKILL.md is not listed again', async (t) => {
  const root = repository(t, { '.agents/skills/commits/SKILL.md': skill('commits', 'Write good commits.') });
  mkdirSync(join(root, '.github/skills/commits'), { recursive: true });
  mkdirSync(join(root, '.claude'));
  symlinkSync('../.agents/skills', join(root, '.claude/skills'), 'dir');
  symlinkSync('../../../.agents/skills/commits/SKILL.md', join(root, '.github/skills/commits/SKILL.md'));
  const result = await atlas(['scan', root]);
  assert.equal(result.stdout.split('\n')[0], 'repo · 1 skill');
  assert.doesNotMatch(result.stdout, /also in/);
});

test('a local directory skips .git and node_modules', async (t) => {
  const root = repository(t, {
    '.git/skills/x/SKILL.md': skill('git', 'Not a skill.'),
    'node_modules/some-package/skills/y/SKILL.md': skill('dependency', 'Not a skill either.'),
    'web/node_modules/z/SKILL.md': skill('nested-dependency', 'Nor this.'),
  });
  const result = await atlas(['scan', root]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'repo · 0 skills');
});

test('no SKILL.md → 0 skills, exit code 0, no warnings', async (t) => {
  const result = await atlas(['scan', repository(t, { 'README.md': '# Nothing here\n' })]);
  assert.deepEqual(result, { code: 0, stdout: 'repo · 0 skills', stderr: '' });
});

test('a path with spaces and non-ASCII characters is encoded in the link', async (t) => {
  const root = repository(t, { 'docs/my skills/café/SKILL.md': skill('café', 'Make coffee.') });
  const result = await atlas(['scan', root]);
  assert.equal(result.stdout.split('\n')[2], `  ${pathToFileURL(root).href}/docs/my%20skills/caf%C3%A9/SKILL.md`);
});

// GitHub, without GITHUB_TOKEN: through the tree.
const SHA = '0123456789abcdef0123456789abcdef01234567';
const API = 'https://api.github.com/repos/JetBrains/big';
const RAW = `https://raw.githubusercontent.com/JetBrains/big/${SHA}`;
const blob = (path: string, mode = '100644') => ({ path, mode, type: 'blob', sha: `sha-${path}` });
const tree = (path: string, sha: string) => ({ path, mode: '040000', type: 'tree', sha });
const big = (answers: Record<string, unknown>) =>
  replay(
    Object.fromEntries(
      Object.entries({
        [API]: { full_name: 'JetBrains/big', default_branch: 'main' },
        [`${API}/commits/main`]: { sha: SHA },
        ...answers,
      }).map(([url, body]) => [url, { status: 200, body }]),
    ),
  );

test('GitHub: copies, symbolic links and files gone at the commit, through the whole tree', async () => {
  const text = skill('commits', 'Write good commits.');
  const fetch = big({
    [`${API}/git/trees/${SHA}?recursive=1`]: {
      truncated: false,
      tree: [
        blob('.claude/skills/commits/SKILL.md'),
        blob('.agents/skills/commits/SKILL.md'),
        blob('.github/skills/commits/SKILL.md', '120000'),
        blob('.claude/skills/gone/SKILL.md'),
        blob('README.md'),
      ],
    },
    [`${RAW}/.claude/skills/commits/SKILL.md`]: text,
    [`${RAW}/.agents/skills/commits/SKILL.md`]: text,
  });
  const result = await atlas(['scan', 'https://github.com/JetBrains/big'], {
    fetch: replay({ [`${RAW}/.claude/skills/gone/SKILL.md`]: { status: 404, body: 'Not Found' } }, fetch),
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'JetBrains/big · 1 skill',
      'commits — Write good commits.',
      `  https://github.com/JetBrains/big/blob/${SHA}/.agents/skills/commits/SKILL.md`,
      '  also in .claude/skills/commits/SKILL.md',
    ].join('\n'),
  );
  assert.equal(result.stderr, 'warning: .claude/skills/gone/SKILL.md: listed, but not found at the scanned commit; skipped');
});

test('GitHub: a tree too large for one answer → only the skill roots, and a warning', async () => {
  const fetch = big({
    [`${API}/git/trees/${SHA}?recursive=1`]: { truncated: true, tree: [] },
    [`${API}/git/trees/${SHA}`]: { truncated: false, tree: [tree('.claude', 'claude'), tree('agent', 'agent'), blob('README.md')] },
    [`${API}/git/trees/claude`]: { truncated: false, tree: [tree('skills', 'claude-skills')] },
    [`${API}/git/trees/claude-skills?recursive=1`]: {
      truncated: false,
      tree: [tree('review', 'review'), blob('review/SKILL.md'), blob('review/skill.md')],
    },
    [`${API}/git/trees/agent`]: { truncated: false, tree: [blob('skills')] }, // a file, not a skill root
    [`${RAW}/.claude/skills/review/SKILL.md`]: skill('review', 'Review the change.'),
  });
  const result = await atlas(['scan', 'https://github.com/JetBrains/big'], { fetch });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'JetBrains/big · 1 skill',
      'review — Review the change.',
      `  https://github.com/JetBrains/big/blob/${SHA}/.claude/skills/review/SKILL.md`,
    ].join('\n'),
  );
  assert.equal(
    result.stderr,
    'warning: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills (GITHUB_TOKEN searches everywhere)',
  );
});
