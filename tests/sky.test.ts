// spec/web.md, "A world": the chart of a scan and the terrain it raises. Where the places are, and
// what is land and what is sea, is arithmetic, so it runs in Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScanView, SkillView } from '../src/browser.ts';
import { angle, chartOf, height, home, type Vec3 } from '../web/sky/chart.ts';
import { COAST, landAt, pointAt, reliefAt, terrainOf } from '../web/sky/terrain.ts';

type Scanned = Extract<ScanView, { skills: unknown }>;

function skill(path: string, more: Partial<SkillView> = {}): SkillView {
  const name = path.split('/').at(-2) ?? 'root';
  return { id: `JetBrains/demo:${path}`, repository: 'JetBrains/demo', path, name, description: '', commit: 'abc', copies: [], link: '', markdown: '# x\n', ...more };
}

function scanned(skills: SkillView[], commit = '0123456789abcdef0123456789abcdef01234567'): Scanned {
  return { repository: { id: 'JetBrains/demo', organization: 'JetBrains', name: 'demo', url: 'https://github.com/JetBrains/demo', commit }, skills, warnings: [] };
}

const degrees = (radians: number) => (radians * 180) / Math.PI;
const unit = ([x, y, z]: Vec3): Vec3 => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};
/** The point of the sphere half way between two. */
const between = (a: Vec3, b: Vec3): Vec3 => unit([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);

const DEMO = [
  skill('.claude/skills/commits/SKILL.md', { copies: ['.github/skills/commits/SKILL.md', '.agents/skills/commits/SKILL.md'] }),
  skill('.claude/skills/review/SKILL.md'),
  skill('.claude/skills/tests/SKILL.md'),
  skill('docs/style/SKILL.md'),
  skill('tools/release/checklist/SKILL.md'),
  skill('SKILL.md'),
];

test('every skill is a place, on the sphere, in the scan’s order', () => {
  const chart = chartOf(scanned(DEMO));
  assert.deepEqual(chart.places.map((place) => place.id), DEMO.map((skill) => skill.id));
  assert.deepEqual(chart.places.map((place) => place.name), DEMO.map((skill) => skill.name));
  for (const place of chart.places) assert.ok(Math.abs(Math.hypot(...place.at) - 1) < 1e-9, `${place.name} is on the unit sphere`);
});

test('a copy is a mark a few degrees from its skill', () => {
  const chart = chartOf(scanned(DEMO));
  assert.deepEqual(chart.places.map((place) => place.copies.length), [2, 0, 0, 0, 0, 0]);
  for (const copy of chart.places[0].copies) {
    const away = degrees(angle(chart.places[0].at, copy));
    assert.ok(away > 3 && away < 8, `a copy ${away.toFixed(1)}° away`);
  }
});

test('the directory that holds the skills’ folders is their land', () => {
  assert.equal(home('.claude/skills/commits/SKILL.md'), '.claude/skills');
  assert.equal(home('docs/style/SKILL.md'), 'docs');
  assert.equal(home('style/SKILL.md'), '/');
  assert.equal(home('SKILL.md'), '/');

  const chart = chartOf(scanned(DEMO));
  assert.deepEqual(chart.lands.map((land) => land.name), ['.claude/skills', '/', 'docs', 'tools/release']);
  assert.deepEqual(chart.lands.map((land) => land.places), [[0, 1, 2], [5], [3], [4]]);
  assert.deepEqual(chart.places.map((place) => place.land), [0, 0, 0, 2, 3, 1]);
});

test('a land’s roads join all of its places, and only them', () => {
  const many = Array.from({ length: 11 }, (_, i) => skill(`.claude/skills/s${i}/SKILL.md`));
  const chart = chartOf(scanned([...many, skill('docs/alone/SKILL.md')]));
  const [land, alone] = chart.lands;
  assert.equal(alone.roads.length, 0, 'one place: nothing to join');
  assert.equal(land.roads.length, 10 + 2, 'a tree through eleven places, and a loop per five');

  const reached = new Set([land.places[0]]);
  for (let pass = 0; pass < land.roads.length; pass++) {
    for (const [a, b] of land.roads) {
      if (reached.has(a)) reached.add(b);
      if (reached.has(b)) reached.add(a);
    }
  }
  assert.deepEqual([...reached].sort((a, b) => a - b), land.places);
});

test('the longer the SKILL.md, the higher its place stands', () => {
  assert.equal(height(''), 0);
  assert.equal(height('x'.repeat(120)), 0);
  assert.equal(height('x'.repeat(16000)), 1);
  assert.equal(height('x'.repeat(1_000_000)), 1);
  assert.ok(height('x'.repeat(400)) < height('x'.repeat(4000)));

  const chart = chartOf(scanned([skill('a/short/SKILL.md', { markdown: 'x'.repeat(300) }), skill('a/long/SKILL.md', { markdown: 'x'.repeat(9000) })]));
  assert.ok(chart.places[0].height < chart.places[1].height);
  assert.ok(reliefAt(chart, chart.places[0].at) < reliefAt(chart, chart.places[1].at), 'the terrain stands higher at the longer one');
  assert.ok(reliefAt(chart, chart.places[0].at) > 0.2, 'no SKILL.md is so short that it leaves no hill');
});

test('the scanned commit seeds the world: the same commit, the same world', () => {
  const again = chartOf(scanned(DEMO));
  assert.deepEqual(chartOf(scanned(DEMO)), again);
  assert.deepEqual(terrainOf(chartOf(scanned(DEMO))), terrainOf(again));

  const other = chartOf(scanned(DEMO, 'ffffffffffffffffffffffffffffffffffffffff'));
  assert.notEqual(other.seed, again.seed);
  assert.notDeepEqual(other.places.map((place) => place.at), again.places.map((place) => place.at));
});

test('no two places crowd each other: one directory or many, a few skills or hundreds', () => {
  const closest = (paths: string[]) => {
    const { places } = chartOf(scanned(paths.map((path) => skill(path))));
    let least = Infinity;
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) least = Math.min(least, angle(places[i].at, places[j].at));
    }
    return degrees(least);
  };
  const plugins: string[] = [];
  for (let plugin = 0; plugin < 30; plugin++) {
    for (let i = 0; i <= plugin % 6; i++) plugins.push(`plugins/p${plugin}/skills/s${plugins.length}/SKILL.md`);
  }
  const worlds: Record<string, string[]> = {
    '2 in one directory': Array.from({ length: 2 }, (_, i) => `skills/s${i}/SKILL.md`),
    '40 in two directories': Array.from({ length: 40 }, (_, i) => `${i % 3 === 0 ? 'docs' : '.claude/skills'}/s${i}/SKILL.md`),
    '600 in one directory': Array.from({ length: 600 }, (_, i) => `skills/s${i}/SKILL.md`),
    '50 directories of 2': Array.from({ length: 100 }, (_, i) => `d${i >> 1}/s${i}/SKILL.md`),
    '30 plugins of 1 to 6': plugins,
    '200 directories of 1': Array.from({ length: 200 }, (_, i) => `d${i}/s${i}/SKILL.md`),
  };
  for (const [world, paths] of Object.entries(worlds)) {
    const least = closest(paths);
    assert.ok(least > 5.5, `${world}: the closest two places are ${least.toFixed(1)}° apart`);
  }
});

test('a thousand skills in one directory are charted at once, with their roads and their terrain', () => {
  const skills = Array.from({ length: 1000 }, (_, i) => skill(`skills/s${i}/SKILL.md`));
  const started = performance.now();
  const chart = chartOf(scanned(skills));
  const terrain = terrainOf(chart);
  const took = performance.now() - started;
  assert.ok(took < 3000, `charted in ${Math.round(took)} ms`);
  assert.equal(chart.lands[0].roads.length, 999 + 200, 'a tree through a thousand places, and a loop per five');
  for (const place of chart.places) assert.ok(place.at.every(Number.isFinite), `${place.name} is somewhere`);
  assert.equal(terrain.data.length, terrain.width * terrain.height * 4);
});

test('no SKILL.md → an empty chart, and a world that is all sea', () => {
  const chart = chartOf(scanned([]));
  assert.deepEqual(chart.places, []);
  assert.deepEqual(chart.lands, []);
  const terrain = terrainOf(chart);
  for (let i = 0; i < terrain.data.length; i += 4) assert.equal(terrain.data[i], 0);
  assert.equal(landAt(chart, [0, 1, 0]), 0);
});

test('a local directory has no commit: its name seeds the world', () => {
  const chart = chartOf(scanned(DEMO, ''));
  assert.deepEqual(chart, chartOf(scanned(DEMO, '')));
  assert.equal(chart.places.length, DEMO.length);
});

test('every place stands on land, and far from every place there is sea', () => {
  for (const count of [1, 6, 40, 300]) {
    const skills = Array.from({ length: count }, (_, i) => skill(`${i % 4 === 0 ? 'docs' : i % 7 === 0 ? 'tools/x' : '.claude/skills'}/s${i}/SKILL.md`));
    const chart = chartOf(scanned(skills));
    for (const place of chart.places) assert.ok(landAt(chart, place.at) > COAST + 0.2, `${count} skills: ${place.name} is on land`);
    const far: Vec3 = [-chart.middle[0], -chart.middle[1], -chart.middle[2]];
    if (count < 100) assert.ok(landAt(chart, far) < COAST - 0.3, `${count} skills: the far side of the world is sea`);
  }
});

test('the places of one directory stand on one land; there is a strait between two lands', () => {
  const chart = chartOf(scanned(DEMO));
  // The three skills of .claude/skills: land all the way along the roads between them.
  const [land] = chart.lands;
  for (const [a, b] of land.roads) {
    const [from, to] = [chart.places[a].at, chart.places[b].at];
    const along = [between(from, between(from, to)), between(from, to), between(between(from, to), to)];
    for (const point of along) assert.ok(landAt(chart, point) > COAST, `land between ${chart.places[a].name} and ${chart.places[b].name}`);
  }

  // Two directories whose places are as close as places come: where their lands meet, there is sea.
  const near = chartOf(scanned(Array.from({ length: 200 }, (_, i) => skill(`d${i}/s${i}/SKILL.md`))));
  let straits = 0;
  let pairs = 0;
  for (let i = 0; i < near.places.length; i++) {
    for (let j = i + 1; j < near.places.length; j++) {
      if (angle(near.places[i].at, near.places[j].at) > near.apart * 1.3) continue;
      pairs++;
      if (landAt(near, between(near.places[i].at, near.places[j].at)) < COAST) straits++;
    }
  }
  assert.ok(pairs > 100, `${pairs} pairs of neighbouring lands`);
  assert.equal(straits, pairs, 'a strait between every two neighbouring lands');
});

test('the terrain is the map of the whole sphere: what the field is at each of its points', () => {
  const skills = Array.from({ length: 30 }, (_, i) => skill(`${i % 3 === 0 ? 'docs' : '.claude/skills'}/s${i}/SKILL.md`, { markdown: 'x'.repeat(200 + i * 400) }));
  const chart = chartOf(scanned(skills));
  const terrain = terrainOf(chart);
  assert.equal(terrain.data.length, terrain.width * terrain.height * 4);
  let land = 0;
  for (let k = 0; k < 3000; k++) {
    const row = (k * 7919) % terrain.height;
    const column = (k * 104729) % terrain.width;
    const point = pointAt(((column + 0.5) / terrain.width - 0.5) * Math.PI * 2, ((row + 0.5) / terrain.height - 0.5) * Math.PI);
    const at = (row * terrain.width + column) * 4;
    assert.ok(Math.abs(terrain.data[at] / 255 - Math.max(0, landAt(chart, point))) < 0.004, `the land field at row ${row}, column ${column}`);
    assert.ok(Math.abs(terrain.data[at + 1] / 255 - reliefAt(chart, point)) < 0.004, `the relief at row ${row}, column ${column}`);
    assert.equal(terrain.data[at + 3], 255);
    if (terrain.data[at] / 255 >= COAST) {
      land++;
      assert.notEqual(terrain.data[at + 2], 0, 'what is land is some directory’s');
    }
  }
  assert.ok(land > 150 && land < 2400, `${land} of 3000 points are land: there is land, and there is sea`);
});
