// What GitHub answers for the repositories and the organization the web view is tested on:
// through the trees, as without a token, and through code search, as with one.
import type { Recording } from '../../src/core/replay.ts';

export const COMMIT = '0123456789abcdef0123456789abcdef01234567';
export const GAMMA_COMMIT = 'fedcba9876543210fedcba9876543210fedcba98';
const GITHUB = 'https://api.github.com';
const API = `${GITHUB}/repos`;
const RAW = 'https://raw.githubusercontent.com';
const ok = (body: unknown) => ({ status: 200, body });

export const COMMITS_MD = '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n\nOne line, then why.\n';
export const STYLE_MD = '---\nname: code-style\ndescription: Follow the code style.\n---\n# Code style\n';
export const GRADLE_MD = '---\nname: gradle\ndescription: Build with Gradle. Use for every build.\n---\n# Gradle\n';
export const BROKEN_MD = '---\nname: release: checklist: x\n---\n# Release\n';

const blob = (path: string) => ({ path, mode: '100644', type: 'blob', sha: path });

export const RECORDING: Recording = {
  // JetBrains/atlas-demo: a skill and its copy, one more, and one with malformed front matter.
  [`${API}/JetBrains/atlas-demo`]: ok({ full_name: 'JetBrains/atlas-demo', default_branch: 'main' }),
  [`${API}/JetBrains/atlas-demo/commits/main`]: ok({ sha: COMMIT }),
  [`${API}/JetBrains/atlas-demo/commits/v1`]: ok({ sha: COMMIT }),
  [`${API}/JetBrains/atlas-demo/commits/no-such-branch`]: { status: 404, body: { message: 'No commit found for SHA: no-such-branch' } },
  [`${API}/JetBrains/atlas-demo/git/trees/${COMMIT}?recursive=1`]: ok({
    truncated: false,
    tree: [
      blob('.claude/skills/commits/SKILL.md'),
      blob('.github/skills/commits/SKILL.md'),
      blob('docs/code-style/SKILL.md'),
      blob('tools/release/SKILL.md'),
      blob('README.md'),
    ],
  }),
  [`${RAW}/JetBrains/atlas-demo/${COMMIT}/.claude/skills/commits/SKILL.md`]: ok(COMMITS_MD),
  [`${RAW}/JetBrains/atlas-demo/${COMMIT}/.github/skills/commits/SKILL.md`]: ok(COMMITS_MD),
  [`${RAW}/JetBrains/atlas-demo/${COMMIT}/docs/code-style/SKILL.md`]: ok(STYLE_MD),
  [`${RAW}/JetBrains/atlas-demo/${COMMIT}/tools/release/SKILL.md`]: ok(BROKEN_MD),

  // JetBrains/empty: no SKILL.md.
  [`${API}/JetBrains/empty`]: ok({ full_name: 'JetBrains/empty', default_branch: 'main' }),
  [`${API}/JetBrains/empty/commits/main`]: ok({ sha: COMMIT }),
  [`${API}/JetBrains/empty/git/trees/${COMMIT}?recursive=1`]: ok({ truncated: false, tree: [blob('README.md')] }),

  // JetBrains/koog: one of the examples, with one skill.
  [`${API}/JetBrains/koog`]: ok({ full_name: 'JetBrains/koog', default_branch: 'develop' }),
  [`${API}/JetBrains/koog/commits/develop`]: ok({ sha: COMMIT }),
  [`${API}/JetBrains/koog/git/trees/${COMMIT}?recursive=1`]: ok({ truncated: false, tree: [blob('.claude/skills/commits/SKILL.md')] }),
  [`${RAW}/JetBrains/koog/${COMMIT}/.claude/skills/commits/SKILL.md`]: ok(COMMITS_MD),

  // JetBrains/no-such-repository: not there.
  [`${API}/JetBrains/no-such-repository`]: { status: 404, body: { message: 'Not Found' } },

  // JetBrains/koog with a token: through code search.
  [`${GITHUB}/search/code?q=filename:SKILL.md+repo:JetBrains/koog&per_page=100&page=1`]: ok({
    total_count: 1,
    items: [{ path: '.claude/skills/commits/SKILL.md' }],
  }),

  // atlas-org: alpha and gamma with skills, beta without, a fork and an empty repository.
  [`${GITHUB}/users/atlas-org`]: ok({ login: 'atlas-org' }),
  [`${GITHUB}/users/no-such-org`]: { status: 404, body: { message: 'Not Found' } },
  [`${GITHUB}/users/atlas-org/repos?per_page=100&page=1`]: ok([
    { full_name: 'atlas-org/gamma', default_branch: 'trunk', fork: false },
    { full_name: 'atlas-org/alpha', default_branch: 'main', fork: false },
    { full_name: 'atlas-org/beta', default_branch: 'main', fork: false },
    { full_name: 'atlas-org/forked', default_branch: 'main', fork: true },
    { full_name: 'atlas-org/empty', default_branch: 'main', fork: false },
  ]),
  [`${API}/atlas-org/alpha/commits/main`]: ok({ sha: COMMIT }),
  [`${API}/atlas-org/alpha/git/trees/${COMMIT}?recursive=1`]: ok({
    truncated: false,
    tree: [blob('.claude/skills/commits/SKILL.md'), blob('docs/code-style/SKILL.md'), blob('README.md')],
  }),
  [`${RAW}/atlas-org/alpha/${COMMIT}/.claude/skills/commits/SKILL.md`]: ok(COMMITS_MD),
  [`${RAW}/atlas-org/alpha/${COMMIT}/docs/code-style/SKILL.md`]: ok(STYLE_MD),
  [`${API}/atlas-org/beta/commits/main`]: ok({ sha: COMMIT }),
  [`${API}/atlas-org/beta/git/trees/${COMMIT}?recursive=1`]: ok({ truncated: false, tree: [blob('README.md')] }),
  [`${API}/atlas-org/gamma/commits/trunk`]: ok({ sha: GAMMA_COMMIT }),
  [`${API}/atlas-org/gamma/git/trees/${GAMMA_COMMIT}?recursive=1`]: ok({
    truncated: false,
    tree: [blob('build/gradle/SKILL.md'), blob('tools/release/SKILL.md')],
  }),
  [`${RAW}/atlas-org/gamma/${GAMMA_COMMIT}/build/gradle/SKILL.md`]: ok(GRADLE_MD),
  [`${RAW}/atlas-org/gamma/${GAMMA_COMMIT}/tools/release/SKILL.md`]: ok(BROKEN_MD),
  [`${API}/atlas-org/empty/commits/main`]: { status: 409, body: { message: 'Git Repository is empty.' } },
  // atlas-org with a token: one code search, then each repository's commit.
  [`${GITHUB}/search/code?q=filename:SKILL.md+user:atlas-org&per_page=100&page=1`]: ok({
    total_count: 4,
    items: [
      { path: 'tools/release/SKILL.md', repository: { full_name: 'atlas-org/gamma' } },
      { path: '.claude/skills/commits/SKILL.md', repository: { full_name: 'atlas-org/alpha' } },
      { path: 'build/gradle/SKILL.md', repository: { full_name: 'atlas-org/gamma' } },
      { path: 'docs/code-style/SKILL.md', repository: { full_name: 'atlas-org/alpha' } },
    ],
  }),
  [`${API}/atlas-org/alpha/commits/HEAD`]: ok({ sha: COMMIT }),
  [`${API}/atlas-org/gamma/commits/HEAD`]: ok({ sha: GAMMA_COMMIT }),
};
