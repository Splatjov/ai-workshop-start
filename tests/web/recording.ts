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

/**
 * What GitHub's GraphQL answers for the repositories a request asks about: each one's commit and
 * which of the places asked for are there. A repository not given here is gone: null.
 */
export function graphql(repositories: Record<string, { commit?: string; places?: string[] }>) {
  return ok((request: string) => {
    const { query } = JSON.parse(request) as { query: string };
    const places = new Map([...query.matchAll(/(p\d+):object\(expression:"HEAD:([^"]+)"\)/g)].map(([, alias, path]) => [alias, path]));
    const data: Record<string, unknown> = {};
    for (const [, alias, owner, name] of query.matchAll(/(r\d+):repository\(owner:"([^"]+)",name:"([^"]+)"\)/g)) {
      const known = repositories[`${owner}/${name}`];
      data[alias] = known && {
        nameWithOwner: `${owner}/${name}`,
        isEmpty: !known.commit,
        defaultBranchRef: known.commit ? { target: { oid: known.commit } } : null,
        ...Object.fromEntries([...places].map(([place, path]) => [place, known.places?.includes(path) ? { __typename: 'Tree' } : null])),
      };
      data[alias] ??= null;
    }
    return { data };
  });
}

const blob = (path: string) => ({ path, mode: '100644', type: 'blob', sha: path });

export const SOURDOUGH_MD = '---\nname: sourdough\ndescription: Bake a loaf of sourdough bread.\n---\n# Sourdough\n\nFeed the starter, fold the dough, proof overnight.\n';
export const TOMATOES_MD = '---\nname: tomatoes\ndescription: Grow tomatoes on a balcony.\n---\n# Tomatoes\n\nSow in March, pinch the side shoots, water at the roots.\n';

/** The page's examples but JetBrains/koog: each with one skill of its own, like no other's. */
export const OTHER_EXAMPLES: Record<string, string> = {
  'anthropics/skills': 'spreadsheets',
  'obra/superpowers': 'brainstorming',
  'vercel-labs/agent-skills': 'deployments',
  'openai/codex': 'sandboxing',
  'huggingface/skills': 'datasets',
  'trailofbits/skills': 'fuzzing',
  'getsentry/skills': 'tracing',
  'JetBrains/kotlin': 'coroutines',
};

// JetBrains/many: 24 skills in one directory. The second is over a thousand bytes, the third is one
// line with no front matter, and the last eight have malformed front matter: nine warnings. The
// last one's name is too long to be written beside its star.
export const MANY_LONG_NAME = 'skill-24-with-a-very-long-name';
export const MANY_BIG_MD = `---\nname: skill-02\ndescription: The long one.\n---\n# Skill 02\n\n${'Read the module, run the checks, write down what changed.\n'.repeat(24)}`;
export const MANY_ONE_LINE_MD = '# Skill 03';
const many = Array.from({ length: 24 }, (_, i) => {
  const name = i === 23 ? MANY_LONG_NAME : `skill-${String(i + 1).padStart(2, '0')}`;
  const text =
    i === 1
      ? MANY_BIG_MD
      : i === 2
        ? MANY_ONE_LINE_MD
        : i >= 16
          ? `---\nname: ${name}: broken: x\n---\n# ${name}\n`
          : `---\nname: ${name}\ndescription: Does the thing number ${i + 1}.\n---\n# ${name}\n`;
  return { path: `.claude/skills/${name}/SKILL.md`, text };
});

const ALPHA_TREE = [blob('.claude/skills/commits/SKILL.md'), blob('docs/code-style/SKILL.md'), blob('README.md')];
const GAMMA_TREE = [blob('build/gradle/SKILL.md'), blob('tools/release/SKILL.md')];

/** atlas-org's repositories, as GraphQL knows them. */
export const ATLAS_ORG = {
  'atlas-org/alpha': { commit: COMMIT, places: ['.claude/skills'] },
  'atlas-org/beta': { commit: COMMIT },
  'atlas-org/gamma': { commit: GAMMA_COMMIT },
  'atlas-org/empty': {},
};

/** Skills that share words, for the themes (spec/analysis.md, "Themes"): name → description. */
export const THEMES: Record<string, string> = {
  'gradle-build': 'Build the project with Gradle.',
  'gradle-publish': 'Publish to Maven Central with Gradle.',
  'pdf-read': 'Read the text of a PDF.',
  'pdf-fill': 'Fill in the fields of a PDF form.',
  'kotlin-test': 'Kotlin unit tests, with kotlin.test.',
  'junit-test': 'Run the unit tests with JUnit.',
};
export const themeMd = (name: string) => `---\nname: ${name}\ndescription: ${THEMES[name]}\n---\n# ${name}\n`;
const themePath = (name: string) => `.claude/skills/${name}/SKILL.md`;
const themeFiles = (repository: string, commit: string, names: string[]) =>
  Object.fromEntries(names.map((name) => [`${RAW}/${repository}/${commit}/${themePath(name)}`, ok(themeMd(name))]));

/** themes-org's repositories: each one's skills. */
const THEMES_ORG = { 'themes-org/build': ['gradle-build', 'kotlin-test'], 'themes-org/docs': ['gradle-publish', 'pdf-read'] };

export const RECORDING: Recording = {
  // JetBrains/atlas-themes: skills that share words, and one that shares none.
  [`${API}/JetBrains/atlas-themes`]: ok({ full_name: 'JetBrains/atlas-themes', default_branch: 'main' }),
  [`${API}/JetBrains/atlas-themes/commits/main`]: ok({ sha: COMMIT }),
  [`${API}/JetBrains/atlas-themes/git/trees/${COMMIT}?recursive=1`]: ok({
    truncated: false,
    tree: [...Object.keys(THEMES), 'commits'].map((name) => blob(themePath(name))),
  }),
  ...themeFiles('JetBrains/atlas-themes', COMMIT, Object.keys(THEMES)),
  [`${RAW}/JetBrains/atlas-themes/${COMMIT}/${themePath('commits')}`]: ok(COMMITS_MD),

  // themes-org: two repositories, a theme across them.
  [`${GITHUB}/users/themes-org`]: ok({ login: 'themes-org', public_repos: 2 }),
  [`${GITHUB}/users/themes-org/repos?per_page=100&page=1`]: ok(
    Object.keys(THEMES_ORG).map((full_name) => ({ full_name, default_branch: 'main', fork: false })),
  ),
  ...Object.fromEntries(
    Object.entries(THEMES_ORG).flatMap(([repository, names]) => [
      [`${API}/${repository}/git/trees/main?recursive=1`, ok({ sha: COMMIT, truncated: false, tree: names.map((name) => blob(themePath(name))) })],
      [`${API}/${repository}/commits/main`, ok({ sha: COMMIT, commit: { tree: { sha: `${repository}-tree` } } })],
      ...Object.entries(themeFiles(repository, COMMIT, names)),
    ]),
  ),

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

  [`${API}/JetBrains/many`]: ok({ full_name: 'JetBrains/many', default_branch: 'main' }),
  [`${API}/JetBrains/many/commits/main`]: ok({ sha: COMMIT }),
  [`${API}/JetBrains/many/git/trees/${COMMIT}?recursive=1`]: ok({ truncated: false, tree: many.map(({ path }) => blob(path)) }),
  ...Object.fromEntries(many.map(({ path, text }) => [`${RAW}/JetBrains/many/${COMMIT}/${path}`, ok(text)])),

  // JetBrains/atlas-twin: the same three skills as JetBrains/atlas-demo, and no copy.
  [`${API}/JetBrains/atlas-twin`]: ok({ full_name: 'JetBrains/atlas-twin', default_branch: 'main' }),
  [`${API}/JetBrains/atlas-twin/commits/main`]: ok({ sha: COMMIT }),
  [`${API}/JetBrains/atlas-twin/git/trees/${COMMIT}?recursive=1`]: ok({
    truncated: false,
    tree: [blob('.claude/skills/commits/SKILL.md'), blob('docs/code-style/SKILL.md'), blob('tools/release/SKILL.md')],
  }),
  [`${RAW}/JetBrains/atlas-twin/${COMMIT}/.claude/skills/commits/SKILL.md`]: ok(COMMITS_MD),
  [`${RAW}/JetBrains/atlas-twin/${COMMIT}/docs/code-style/SKILL.md`]: ok(STYLE_MD),
  [`${RAW}/JetBrains/atlas-twin/${COMMIT}/tools/release/SKILL.md`]: ok(BROKEN_MD),

  // JetBrains/garden: two skills that have nothing in common with the others'.
  [`${API}/JetBrains/garden`]: ok({ full_name: 'JetBrains/garden', default_branch: 'main' }),
  [`${API}/JetBrains/garden/commits/main`]: ok({ sha: COMMIT }),
  [`${API}/JetBrains/garden/git/trees/${COMMIT}?recursive=1`]: ok({
    truncated: false,
    tree: [blob('skills/sourdough/SKILL.md'), blob('skills/tomatoes/SKILL.md')],
  }),
  [`${RAW}/JetBrains/garden/${COMMIT}/skills/sourdough/SKILL.md`]: ok(SOURDOUGH_MD),
  [`${RAW}/JetBrains/garden/${COMMIT}/skills/tomatoes/SKILL.md`]: ok(TOMATOES_MD),

  ...Object.fromEntries(
    Object.entries(OTHER_EXAMPLES).flatMap(([id, name]) => [
      [`${API}/${id}`, ok({ full_name: id, default_branch: 'main' })],
      [`${API}/${id}/commits/main`, ok({ sha: COMMIT })],
      [`${API}/${id}/git/trees/${COMMIT}?recursive=1`, ok({ truncated: false, tree: [blob(`skills/${name}/SKILL.md`)] })],
      [`${RAW}/${id}/${COMMIT}/skills/${name}/SKILL.md`, ok(`---\nname: ${name}\ndescription: All about ${name}.\n---\n# ${name}\n`)],
    ]),
  ),

  // JetBrains/no-such-repository: not there.
  [`${API}/JetBrains/no-such-repository`]: { status: 404, body: { message: 'Not Found' } },

  // JetBrains/koog with a token: through code search.
  [`${GITHUB}/search/code?q=filename:SKILL.md+repo:JetBrains/koog&per_page=100&page=1`]: ok({
    total_count: 1,
    items: [{ path: '.claude/skills/commits/SKILL.md' }],
  }),

  // atlas-org: alpha and gamma with skills, beta without, a fork and an empty repository.
  [`${GITHUB}/users/atlas-org`]: ok({ login: 'atlas-org', public_repos: 5 }),
  [`${GITHUB}/users/no-such-org`]: { status: 404, body: { message: 'Not Found' } },
  [`${GITHUB}/users/atlas-org/repos?per_page=100&page=1`]: ok([
    { full_name: 'atlas-org/gamma', default_branch: 'trunk', fork: false },
    { full_name: 'atlas-org/alpha', default_branch: 'main', fork: false },
    { full_name: 'atlas-org/beta', default_branch: 'main', fork: false },
    { full_name: 'atlas-org/forked', default_branch: 'main', fork: true },
    { full_name: 'atlas-org/empty', default_branch: 'main', fork: false },
  ]),
  // Without a token: each tree by its branch's name, which GitHub answers with the commit's sha;
  // the commit only of a repository with a SKILL.md.
  [`${API}/atlas-org/alpha/git/trees/main?recursive=1`]: ok({ sha: COMMIT, truncated: false, tree: ALPHA_TREE }),
  [`${API}/atlas-org/alpha/commits/main`]: ok({ sha: COMMIT, commit: { tree: { sha: 'alpha-tree' } } }),
  [`${API}/atlas-org/beta/git/trees/main?recursive=1`]: ok({ sha: COMMIT, truncated: false, tree: [blob('README.md')] }),
  [`${API}/atlas-org/gamma/git/trees/trunk?recursive=1`]: ok({ sha: GAMMA_COMMIT, truncated: false, tree: GAMMA_TREE }),
  [`${API}/atlas-org/gamma/commits/trunk`]: ok({ sha: GAMMA_COMMIT, commit: { tree: { sha: 'gamma-tree' } } }),
  [`${API}/atlas-org/empty/git/trees/main?recursive=1`]: { status: 409, body: { message: 'Git Repository is empty.' } },
  [`${RAW}/atlas-org/alpha/${COMMIT}/.claude/skills/commits/SKILL.md`]: ok(COMMITS_MD),
  [`${RAW}/atlas-org/alpha/${COMMIT}/docs/code-style/SKILL.md`]: ok(STYLE_MD),
  [`${RAW}/atlas-org/gamma/${GAMMA_COMMIT}/build/gradle/SKILL.md`]: ok(GRADLE_MD),
  [`${RAW}/atlas-org/gamma/${GAMMA_COMMIT}/tools/release/SKILL.md`]: ok(BROKEN_MD),
  // With a token: one code search, one GraphQL request for the commits and the usual skill
  // places, then the tree only of alpha (a skill folder, and found by the search) and gamma
  // (found by the search alone).
  [`${GITHUB}/search/code?q=filename:SKILL.md+user:atlas-org&per_page=100&page=1`]: ok({
    total_count: 4,
    items: [
      { path: 'tools/release/SKILL.md', repository: { full_name: 'atlas-org/gamma' } },
      { path: '.claude/skills/commits/SKILL.md', repository: { full_name: 'atlas-org/alpha' } },
      { path: 'build/gradle/SKILL.md', repository: { full_name: 'atlas-org/gamma' } },
      { path: 'docs/code-style/SKILL.md', repository: { full_name: 'atlas-org/alpha' } },
    ],
  }),
  [`${GITHUB}/graphql`]: graphql(ATLAS_ORG),
  [`${API}/atlas-org/alpha/git/trees/${COMMIT}?recursive=1`]: ok({ sha: 'alpha-tree', truncated: false, tree: ALPHA_TREE }),
  [`${API}/atlas-org/gamma/git/trees/${GAMMA_COMMIT}?recursive=1`]: ok({ sha: 'gamma-tree', truncated: false, tree: GAMMA_TREE }),
};
