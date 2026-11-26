// What GitHub answers, without a token, for the repositories the web view is tested on.
import type { Recording } from '../../src/core/replay.ts';

export const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const API = 'https://api.github.com/repos';
const RAW = 'https://raw.githubusercontent.com';
const ok = (body: unknown) => ({ status: 200, body });

export const COMMITS_MD = '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n\nOne line, then why.\n';
export const STYLE_MD = '---\nname: code-style\ndescription: Follow the code style.\n---\n# Code style\n';
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
};
