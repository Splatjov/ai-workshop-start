// spec/web.md, "The system": how alike the skills of two repositories are, and where their worlds
// stand for it. It is arithmetic, so it runs in Node.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SkillView } from '../src/browser.ts';
import { GAP, SPAN, apart, belt, kinship, layout, radiusOf, reach, ringsOf, words, type Vec2 } from '../web/sky/system.ts';

function skill(name: string, description: string, body = '', more: Partial<SkillView> = {}): SkillView {
  const path = `.claude/skills/${name}/SKILL.md`;
  const markdown = `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n\n${body}\n`;
  return { id: `o/r:${path}`, repository: 'o/r', path, name, description, commit: 'abc', copies: [], link: '', markdown, ...more };
}

const COMMITS = skill('commits', 'Write commit messages the way this repository does.', 'One line, then why. Imperative mood. No trailing period.');
const REVIEW = skill('code-review', 'Review a pull request for correctness bugs.', 'Read the diff. Check every finding against the code. Report the verified ones.');
const RELEASE = skill('release', 'Cut a release and publish the changelog.', 'Bump the version, tag it, write the notes from the merged pull requests.');
const BAKING = skill('sourdough', 'Bake a loaf of sourdough bread.', 'Feed the starter, autolyse the flour, fold the dough, proof overnight, bake in a dutch oven.');
const GARDEN = skill('tomatoes', 'Grow tomatoes on a balcony.', 'Sow in March, pinch the side shoots, water at the roots, feed weekly once the trusses set.');

const distance = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('the words of a text: lower case, three letters or more, the commonest left out, plurals as one', () => {
  assert.deepEqual(words('Write the Commit-Messages for a PR, and its tests!'), ['write', 'commit', 'message', 'test']);
  assert.deepEqual(words('SKILL.md: use when reviewing code; this class is status'), ['skill', 'reviewing', 'code', 'class', 'status']);
  assert.deepEqual(words(''), []);
});

test('the same skills → wholly alike; nothing in common → not at all; no skills → not at all', () => {
  const same = kinship([COMMITS, REVIEW, RELEASE], [COMMITS, REVIEW, RELEASE]);
  assert.ok(Math.abs(same.likeness - 1) < 1e-9, `the same skills are ${same.likeness} alike`);
  assert.deepEqual(same.twins.map(({ a, b }) => [a, b]).sort(), [['code-review', 'code-review'], ['commits', 'commits'], ['release', 'release']]);
  for (const twin of same.twins) assert.ok(Math.abs(twin.likeness - 1) < 1e-9);

  const none = kinship([COMMITS, REVIEW], [BAKING, GARDEN]);
  assert.equal(none.likeness, 0);
  assert.deepEqual(none.twins, []);

  assert.deepEqual(kinship([], [COMMITS]), { likeness: 0, twins: [] });
  assert.deepEqual(kinship([COMMITS], []), { likeness: 0, twins: [] });
});

test('the more of their skills two repositories share, the more alike they are', () => {
  const all = kinship([COMMITS, REVIEW, RELEASE], [COMMITS, REVIEW, RELEASE]).likeness;
  const two = kinship([COMMITS, REVIEW, RELEASE], [COMMITS, REVIEW, BAKING]).likeness;
  const one = kinship([COMMITS, REVIEW, RELEASE], [COMMITS, GARDEN, BAKING]).likeness;
  const none = kinship([COMMITS, REVIEW, RELEASE], [GARDEN, BAKING]).likeness;
  assert.ok(all > two && two > one && one > none, `${all} > ${two} > ${one} > ${none}`);
  assert.ok(two > 0.4 && two < 0.95, `two of three shared: ${two}`);
});

test('how alike is the same from either side, and is told from the skills’ words: name, description and the rest', () => {
  const [a, b] = [[COMMITS, REVIEW, BAKING], [COMMITS, RELEASE, GARDEN]];
  assert.ok(Math.abs(kinship(a, b).likeness - kinship(b, a).likeness) < 1e-9);

  // A skill under another name that says the same is its twin; one that shares only its name is less alike.
  const renamed = skill('commit-messages', COMMITS.description, 'One line, then why. Imperative mood. No trailing period.');
  const [twin] = kinship([COMMITS], [renamed, BAKING]).twins;
  assert.deepEqual([twin.a, twin.b], ['commits', 'commit-messages']);
  const namesake = skill('commits', 'Count the commits of a week for the changelog.', 'Group them by author.');
  assert.ok(kinship([COMMITS], [renamed]).likeness > kinship([COMMITS], [namesake]).likeness);
  assert.ok(kinship([COMMITS], [namesake]).likeness > kinship([COMMITS], [BAKING]).likeness);
});

test('a skill’s name weighs most, then its description, then the rest of its SKILL.md', () => {
  const told = skill('migrations', 'Write a database migration.', 'Never edit one that was merged.');
  const alike = (other: SkillView) => kinship([told], [other]).likeness;
  const byName = alike(skill('migrations', 'Plan a picnic.', 'Pack sandwiches and lemonade.'));
  const byDescription = alike(skill('picnic', 'Write a database migration.', 'Pack sandwiches and lemonade.'));
  const byTheRest = alike(skill('picnic', 'Plan an outing.', 'Never edit one that was merged.'));
  assert.ok(byName > 0 && byDescription > 0 && byTheRest > 0);
  // One word in the name tells more than one in the description, and that more than one in the rest.
  const word = (name: string, description: string, body: string) => kinship([skill('alpha', 'beta', 'gamma')], [skill(name, description, body)]).likeness;
  assert.ok(word('alpha', 'other', 'another') > word('zeta', 'alpha', 'another'), 'the name over the description');
  assert.ok(word('zeta', 'alpha', 'another') > word('zeta', 'other', 'alpha'), 'the description over the rest');
});

test('a word tells more the fewer of the two repositories’ skills say it', () => {
  // In each repository one skill is about a word the other two never say, and two are about a word all four of those say.
  const about = (name: string, own: string) => skill(name, `All about ${name}.`, own);
  const one = [about('rare', 'kettle'), about('common', 'lantern'), about('common', 'marble')];
  const other = [about('rare', 'nutmeg'), about('common', 'orchid'), about('common', 'pebble')];
  const { twins } = kinship(one, other);
  const rare = twins.find((twin) => twin.a === 'rare');
  const common = twins.find((twin) => twin.a === 'common');
  assert.ok(rare && common, JSON.stringify(twins));
  assert.equal(rare.b, 'rare');
  assert.equal(common.b, 'common');
  assert.ok(rare.likeness > common.likeness + 0.05, `${rare.likeness} against ${common.likeness}`);
});

test('a world is the larger, the more skills its repository has', () => {
  assert.ok(radiusOf(0) > 0.05, 'a world with no skills is still there');
  assert.ok(radiusOf(0) < radiusOf(4) && radiusOf(4) < radiusOf(30) && radiusOf(30) < radiusOf(100));
  assert.equal(radiusOf(5000), radiusOf(160), 'however many, a world keeps to the plate');
  assert.ok(radiusOf(5000) < 0.25);
});

test('a ring for every other folder a world’s skills are copied into', () => {
  const copied = (copies: string[]) => skill('x', 'x', '', { copies });
  assert.deepEqual(ringsOf([COMMITS, REVIEW]), []);
  assert.deepEqual(ringsOf([copied(['.github/skills/x/SKILL.md', '.agents/skills/x/SKILL.md']), copied(['.github/skills/y/SKILL.md'])]), ['.agents/skills', '.github/skills']);
  // A copy in the folder the skills themselves are in is not another folder.
  assert.deepEqual(ringsOf([copied(['.claude/skills/x-again/SKILL.md'])]), []);
});

test('how far apart two worlds are to stand: all but touching when the same, a span when nothing alike', () => {
  assert.equal(apart(1, 0.1, 0.15), 0.1 + 0.15 + GAP);
  assert.equal(apart(0, 0.1, 0.15), SPAN);
  let last = Infinity;
  for (const likeness of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const now = apart(likeness, 0.1, 0.1);
    assert.ok(now <= last, `at ${likeness} alike, ${now} apart`);
    last = now;
  }
  assert.ok(apart(0.2, 0.1, 0.1) > apart(0.6, 0.1, 0.1) + 0.3, 'likeness shows');
});

test('where the worlds stand: none, one, two, three', () => {
  assert.deepEqual(layout([], []), []);
  assert.deepEqual(layout([[1]], [0.1]), [[0, 0]]);

  const two = layout([[1, 0.5], [0.5, 1]], [0.1, 0.12]);
  assert.ok(Math.abs(distance(two[0], two[1]) - apart(0.5, 0.1, 0.12)) < 1e-6, 'two worlds stand exactly as far apart as they are unlike');
  assert.ok(Math.abs(two[0][0] + two[1][0]) < 1e-9 && Math.abs(two[0][1] + two[1][1]) < 1e-9, 'about the middle of the plate');
  assert.ok(Math.abs(two[0][1]) < 1e-6 && Math.abs(two[1][1]) < 1e-6, 'across it');

  // Three worlds: every distance can be kept in a plane.
  const likeness = [[1, 0.7, 0.2], [0.7, 1, 0.3], [0.2, 0.3, 1]];
  const radii = [0.1, 0.1, 0.1];
  const three = layout(likeness, radii);
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
    assert.ok(Math.abs(distance(three[i], three[j]) - apart(likeness[i][j], 0.1, 0.1)) < 1e-3, `worlds ${i} and ${j} stand as far apart as they are unlike`);
  }
  assert.ok(distance(three[0], three[1]) < distance(three[1], three[2]) && distance(three[1], three[2]) < distance(three[0], three[2]), 'the more alike, the closer');
});

test('the worlds of real repositories: the more alike, the closer; none over another; the same worlds, the same system', () => {
  const repos = [
    [COMMITS, REVIEW, RELEASE],
    [COMMITS, REVIEW, BAKING],
    [COMMITS, GARDEN, BAKING],
    [GARDEN, BAKING],
    [skill('agents', 'Build an agent with tools.', 'Define the tools, loop until the model stops calling them.')],
  ];
  const likeness = repos.map((a) => repos.map((b) => kinship(a, b).likeness));
  const radii = repos.map((skills) => radiusOf(skills.length));
  const at = layout(likeness, radii);
  assert.equal(at.length, repos.length);

  // 0 shares two skills with 1, one with 2, none with 3.
  assert.ok(distance(at[0], at[1]) < distance(at[0], at[2]), 'two shared skills are closer than one');
  assert.ok(distance(at[0], at[2]) < distance(at[0], at[3]), 'one shared skill is closer than none');
  assert.ok(distance(at[3], at[2]) < distance(at[3], at[0]), 'the gardeners and bakers keep together');

  for (let i = 0; i < at.length; i++) {
    for (let j = i + 1; j < at.length; j++) {
      assert.ok(distance(at[i], at[j]) >= radii[i] + radii[j] + GAP - 1e-6, `worlds ${i} and ${j} do not touch`);
    }
  }
  const middle = at.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0]);
  assert.ok(Math.hypot(...middle) < 1e-6, 'the middle of them all is the middle of the plate');
  assert.ok(reach(at, radii) < SPAN, 'they keep within a span of the middle');
  assert.deepEqual(layout(likeness, radii), at, 'the same worlds stand the same way');
});

test('worlds as alike as can be still do not overlap', () => {
  const likeness = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => 1));
  const radii = [0.2, 0.1, 0.1, 0.15, 0.08, 0.12, 0.2];
  const at = layout(likeness, radii);
  for (let i = 0; i < at.length; i++) {
    for (let j = i + 1; j < at.length; j++) {
      assert.ok(distance(at[i], at[j]) >= radii[i] + radii[j] + GAP - 1e-6, `worlds ${i} and ${j}: ${distance(at[i], at[j])} apart`);
    }
  }
});

test('a world not yet charted waits on the rim of the plate, each in its own place', () => {
  const places = Array.from({ length: 9 }, (_, slot) => belt(slot, 9, 0.66));
  for (const place of places) assert.ok(Math.abs(Math.hypot(...place) - 0.66) < 1e-9, 'on the rim');
  for (let i = 0; i < 9; i++) {
    const next = places[(i + 1) % 9];
    assert.ok(Math.abs(distance(places[i], next) - 2 * 0.66 * Math.sin(Math.PI / 9)) < 1e-9, 'evenly round it');
  }
  assert.deepEqual(belt(0, 1, 1), belt(0, 1, 1));
});
