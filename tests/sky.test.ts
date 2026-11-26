// spec/web.md, "The sky": the chart of a scan. Where the stars are is arithmetic, so it runs in Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScanView, SkillView } from '../src/browser.ts';
import { angle, chartOf, home, magnitude } from '../web/sky/chart.ts';

type Scanned = Extract<ScanView, { skills: unknown }>;

function skill(path: string, more: Partial<SkillView> = {}): SkillView {
  const name = path.split('/').at(-2) ?? 'root';
  return { id: `JetBrains/demo:${path}`, repository: 'JetBrains/demo', path, name, description: '', commit: 'abc', copies: [], link: '', markdown: '# x\n', ...more };
}

function scanned(skills: SkillView[], commit = '0123456789abcdef0123456789abcdef01234567'): Scanned {
  return { repository: { id: 'JetBrains/demo', organization: 'JetBrains', name: 'demo', url: 'https://github.com/JetBrains/demo', commit }, skills, warnings: [] };
}

const degrees = (radians: number) => (radians * 180) / Math.PI;

const DEMO = [
  skill('.claude/skills/commits/SKILL.md', { copies: ['.github/skills/commits/SKILL.md', '.agents/skills/commits/SKILL.md'] }),
  skill('.claude/skills/review/SKILL.md'),
  skill('.claude/skills/tests/SKILL.md'),
  skill('docs/style/SKILL.md'),
  skill('tools/release/checklist/SKILL.md'),
  skill('SKILL.md'),
];

test('every skill is a star, on the sphere, in the scan’s order', () => {
  const chart = chartOf(scanned(DEMO));
  assert.deepEqual(chart.stars.map((star) => star.id), DEMO.map((skill) => skill.id));
  assert.deepEqual(chart.stars.map((star) => star.name), DEMO.map((skill) => skill.name));
  for (const star of chart.stars) assert.ok(Math.abs(Math.hypot(...star.at) - 1) < 1e-9, `${star.name} is on the unit sphere`);
});

test('a copy is a companion, a few degrees from its skill', () => {
  const chart = chartOf(scanned(DEMO));
  assert.deepEqual(chart.stars.map((star) => star.companions.length), [2, 0, 0, 0, 0, 0]);
  for (const companion of chart.stars[0].companions) {
    const away = degrees(angle(chart.stars[0].at, companion));
    assert.ok(away > 3 && away < 8, `a companion ${away.toFixed(1)}° away`);
  }
});

test('the directory that holds the skills’ folders is their constellation', () => {
  assert.equal(home('.claude/skills/commits/SKILL.md'), '.claude/skills');
  assert.equal(home('docs/style/SKILL.md'), 'docs');
  assert.equal(home('style/SKILL.md'), '/');
  assert.equal(home('SKILL.md'), '/');

  const chart = chartOf(scanned(DEMO));
  assert.deepEqual(chart.constellations.map((constellation) => constellation.name), ['.claude/skills', '/', 'docs', 'tools/release']);
  assert.deepEqual(chart.constellations.map((constellation) => constellation.stars), [[0, 1, 2], [5], [3], [4]]);
  assert.deepEqual(chart.stars.map((star) => star.constellation), [0, 0, 0, 2, 3, 1]);
});

test('a constellation’s figure joins all of its stars, and only them', () => {
  const many = Array.from({ length: 11 }, (_, i) => skill(`.claude/skills/s${i}/SKILL.md`));
  const chart = chartOf(scanned([...many, skill('docs/alone/SKILL.md')]));
  const [figure, alone] = chart.constellations;
  assert.equal(alone.lines.length, 0, 'one star: nothing to join');
  assert.equal(figure.lines.length, 10 + 2, 'a tree through eleven stars, and a loop per five');

  const reached = new Set([figure.stars[0]]);
  for (let pass = 0; pass < figure.lines.length; pass++) {
    for (const [a, b] of figure.lines) {
      if (reached.has(a)) reached.add(b);
      if (reached.has(b)) reached.add(a);
    }
  }
  assert.deepEqual([...reached].sort((a, b) => a - b), figure.stars);
});

test('the longer the SKILL.md, the brighter the star', () => {
  assert.equal(magnitude(''), 0);
  assert.equal(magnitude('x'.repeat(120)), 0);
  assert.equal(magnitude('x'.repeat(16000)), 1);
  assert.equal(magnitude('x'.repeat(1_000_000)), 1);
  assert.ok(magnitude('x'.repeat(400)) < magnitude('x'.repeat(4000)));

  const chart = chartOf(scanned([skill('a/short/SKILL.md', { markdown: 'x'.repeat(300) }), skill('a/long/SKILL.md', { markdown: 'x'.repeat(9000) })]));
  assert.ok(chart.stars[0].magnitude < chart.stars[1].magnitude);
});

test('the scanned commit seeds the sky: the same commit, the same sky', () => {
  const again = chartOf(scanned(DEMO));
  assert.deepEqual(chartOf(scanned(DEMO)), again);

  const other = chartOf(scanned(DEMO, 'ffffffffffffffffffffffffffffffffffffffff'));
  assert.notEqual(other.seed, again.seed);
  assert.notDeepEqual(other.stars.map((star) => star.at), again.stars.map((star) => star.at));
});

test('no two stars crowd each other: one directory or many, a few skills or hundreds', () => {
  const closest = (paths: string[]) => {
    const { stars } = chartOf(scanned(paths.map((path) => skill(path))));
    let least = Infinity;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) least = Math.min(least, angle(stars[i].at, stars[j].at));
    }
    return degrees(least);
  };
  const plugins: string[] = [];
  for (let plugin = 0; plugin < 30; plugin++) {
    for (let i = 0; i <= plugin % 6; i++) plugins.push(`plugins/p${plugin}/skills/s${plugins.length}/SKILL.md`);
  }
  const skies: Record<string, string[]> = {
    '2 in one directory': Array.from({ length: 2 }, (_, i) => `skills/s${i}/SKILL.md`),
    '40 in two directories': Array.from({ length: 40 }, (_, i) => `${i % 3 === 0 ? 'docs' : '.claude/skills'}/s${i}/SKILL.md`),
    '600 in one directory': Array.from({ length: 600 }, (_, i) => `skills/s${i}/SKILL.md`),
    '50 directories of 2': Array.from({ length: 100 }, (_, i) => `d${i >> 1}/s${i}/SKILL.md`),
    '30 plugins of 1 to 6': plugins,
    '200 directories of 1': Array.from({ length: 200 }, (_, i) => `d${i}/s${i}/SKILL.md`),
  };
  for (const [sky, paths] of Object.entries(skies)) {
    const least = closest(paths);
    assert.ok(least > 5.5, `${sky}: the closest two stars are ${least.toFixed(1)}° apart`);
  }
});

test('a thousand skills in one directory are charted at once, with their figure', () => {
  const skills = Array.from({ length: 1000 }, (_, i) => skill(`skills/s${i}/SKILL.md`));
  const started = performance.now();
  const chart = chartOf(scanned(skills));
  const took = performance.now() - started;
  assert.ok(took < 3000, `charted in ${Math.round(took)} ms`);
  assert.equal(chart.constellations[0].lines.length, 999 + 200, 'a tree through a thousand stars, and a loop per five');
  for (const star of chart.stars) assert.ok(star.at.every(Number.isFinite), `${star.name} is somewhere`);
});

test('no SKILL.md → an empty chart', () => {
  const chart = chartOf(scanned([]));
  assert.deepEqual(chart.stars, []);
  assert.deepEqual(chart.constellations, []);
});

test('a local directory has no commit: its name seeds the sky', () => {
  const chart = chartOf(scanned(DEMO, ''));
  assert.deepEqual(chart, chartOf(scanned(DEMO, '')));
  assert.equal(chart.stars.length, DEMO.length);
});
