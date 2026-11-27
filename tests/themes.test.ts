// spec/analysis.md, "Themes", and spec/cli.md, "Themes": what `scan --group` prints, for a
// repository and an organization answered in tests/web/recording.ts, and for ./fixture.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replay } from '../src/core/replay.ts';
import { groupByTheme, words } from '../src/core/themes.ts';
import type { Skill } from '../src/core/model.ts';
import { atlas, FIXTURE } from './helpers.ts';
import { COMMIT, RECORDING } from './web/recording.ts';

const fetch = replay(RECORDING);
const blob = (repository: string, name: string) =>
  `  https://github.com/${repository}/blob/${COMMIT}/.claude/skills/${name}/SKILL.md`;

/** Skills with only a name and a description, for the rules themselves. */
const skills = (described: Record<string, string>): Skill[] =>
  Object.entries(described).map(([name, description]) => ({
    id: `r:${name}`,
    repository: 'r',
    path: `${name}/SKILL.md`,
    name,
    description,
    commit: '',
    copies: [],
  }));
const titles = (described: Record<string, string>) =>
  groupByTheme(skills(described)).map(({ title, skills }) => `${title}: ${skills.map((skill) => skill.name).join(' ')}`);

test('--group: the skills by theme, each group under its title and count, Other last', async () => {
  const result = await atlas(['scan', 'https://github.com/JetBrains/atlas-themes', '--group'], { fetch });
  assert.equal(result.code, 0, result.stderr);
  const repo = 'JetBrains/atlas-themes';
  assert.equal(
    result.stdout,
    [
      'JetBrains/atlas-themes · 7 skills',
      '',
      'gradle · 2 skills',
      'gradle-build — Build the project with Gradle.',
      blob(repo, 'gradle-build'),
      'gradle-publish — Publish to Maven Central with Gradle.',
      blob(repo, 'gradle-publish'),
      '',
      'pdf · 2 skills',
      'pdf-fill — Fill in the fields of a PDF form.',
      blob(repo, 'pdf-fill'),
      'pdf-read — Read the text of a PDF.',
      blob(repo, 'pdf-read'),
      '',
      'test · unit · 2 skills',
      'junit-test — Run the unit tests with JUnit.',
      blob(repo, 'junit-test'),
      'kotlin-test — Kotlin unit tests, with kotlin.test.',
      blob(repo, 'kotlin-test'),
      '',
      'Other · 1 skill',
      'commits — Write commit messages the way this repository does.',
      blob(repo, 'commits'),
    ].join('\n'),
  );
});

test('--group with --filter: the groups of the skills the filter leaves', async () => {
  const result = await atlas(['scan', 'https://github.com/JetBrains/atlas-themes', '--filter', 'with', '--group'], { fetch });
  assert.equal(result.code, 0, result.stderr);
  const repo = 'JetBrains/atlas-themes';
  assert.equal(
    result.stdout,
    [
      'JetBrains/atlas-themes · 4 of 7 skills',
      '',
      'gradle · 2 skills',
      'gradle-build — Build the project with Gradle.',
      blob(repo, 'gradle-build'),
      'gradle-publish — Publish to Maven Central with Gradle.',
      blob(repo, 'gradle-publish'),
      '',
      'test · unit · 2 skills',
      'junit-test — Run the unit tests with JUnit.',
      blob(repo, 'junit-test'),
      'kotlin-test — Kotlin unit tests, with kotlin.test.',
      blob(repo, 'kotlin-test'),
    ].join('\n'),
  );
});

test('--group for an organization: the header, then the groups across its repositories', async () => {
  const result = await atlas(['scan', 'https://github.com/themes-org', '--group'], { fetch });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'themes-org · 4 skills in 2 repositories',
      '',
      'gradle · 2 skills',
      'gradle-build — Build the project with Gradle.',
      blob('themes-org/build', 'gradle-build'),
      'gradle-publish — Publish to Maven Central with Gradle.',
      blob('themes-org/docs', 'gradle-publish'),
      '',
      'Other · 2 skills',
      'kotlin-test — Kotlin unit tests, with kotlin.test.',
      blob('themes-org/build', 'kotlin-test'),
      'pdf-read — Read the text of a PDF.',
      blob('themes-org/docs', 'pdf-read'),
    ].join('\n'),
  );
});

test('--group on ./fixture: no words shared, every skill under Other; a filter without a match, no group', async () => {
  const fixture = await atlas(['scan', FIXTURE, '--group']);
  assert.equal(fixture.code, 0);
  assert.deepEqual(
    fixture.stdout.split('\n').filter((line) => !line.startsWith('  ')),
    ['fixture · 3 skills', '', 'Other · 3 skills', "code-style — Follow the project's code style.", 'commits — Write commit messages the way this repository does.', 'release-checklist'],
  );
  const none = await atlas(['scan', FIXTURE, '--group', '--filter=no-such-skill']);
  assert.equal(none.stdout, 'fixture · 0 of 3 skills');
});

test('help: --group', async () => {
  const { stdout } = await atlas(['help']);
  assert.match(stdout, /\[--group\]/);
  assert.match(stdout, /--group: the skills by theme/);
});

test("a skill's words: lower case, split at anything but letters and digits, no short, numeric or common words, no final s (not of ss, is, us)", () => {
  assert.deepEqual(
    [...words({ name: 'kotlin-Tests', description: 'Use it with JUnit5 for 2026 classes, a CSS class; the skill runs Gradle’s tests, against analysis status.' })],
    ['kotlin', 'test', 'junit5', 'classe', 'css', 'class', 'run', 'gradle', 'analysis', 'status'],
  );
});

test('a theme word: in 2 skills or more, at most half of them; a word nearly every skill has is no theme', () => {
  // "kotlin" is in all 4: no theme. "gradle" and "pdf" are in 2 of 4.
  assert.deepEqual(
    titles({
      a: 'Kotlin with Gradle.',
      b: 'Kotlin builds, with Gradle.',
      c: 'Kotlin and PDF.',
      d: 'Kotlin; a PDF.',
    }),
    ['gradle: a b', 'pdf: c d'],
  );
  // In 3 of 6: still a theme.
  assert.deepEqual(titles({ a: 'Docker.', b: 'Docker.', c: 'Docker.', d: 'x1', e: 'y1', f: 'z1' }), ['docker: a b c', 'Other: d e f']);
});

test('groups: the word most skills not yet grouped have first, a tie alphabetically; Other last, each by name', () => {
  assert.deepEqual(
    titles({
      zeta: 'Release notes.',
      beta: 'Release builds.',
      alpha: 'Release checklist.',
      gamma: 'Docker builds.',
      delta: 'Docker images.',
      kappa: 'Lonely.',
      omega: 'Docs.',
      sigma: 'More docs.',
    }),
    // release: 3; then doc and docker, 2 each, doc first (build lost beta to release: 1 left); kappa alone.
    ['release: alpha beta zeta', 'doc: omega sigma', 'docker: delta gamma', 'Other: kappa'],
  );
  assert.deepEqual(titles({ a: 'Nothing.', b: 'Shared.' }), ['Other: a b']);
  assert.deepEqual(groupByTheme([]), []);
});

test("a group's title: its word, then up to 2 more theme words all its skills have, alphabetically", () => {
  assert.deepEqual(
    titles({
      a: 'Android emulator gradle kotlin tests.',
      b: 'Android emulator gradle kotlin tests.',
      c: 'One.',
      d: 'Two.',
      e: 'Three.',
      f: 'Four.',
      g: 'Five.',
      h: 'Six.',
      i: 'Seven.',
      j: 'Eight.',
    }),
    ['android · emulator · gradle: a b', 'Other: c d e f g h i j'],
  );
});
