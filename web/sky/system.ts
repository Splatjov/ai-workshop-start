// The system of the scans. Every repository is a world, and the more alike the skills of two
// repositories, the closer their worlds stand. How alike is read from the skills' own words; where
// the worlds stand is the plane that distorts those distances least. No DOM and no WebGL here, so
// tests/system.test.ts runs it in Node.
import type { SkillView } from '../../src/browser.ts';
import { home } from './chart.ts';

/** Two skills, one from each repository, that say much the same. */
export type Twin = { a: string; b: string; likeness: number };

/** How alike two repositories' skills are: 0, nothing in common, to 1, the same skills. */
export type Kinship = { likeness: number; twins: Twin[] };

export type Vec2 = [number, number];

/** Two worlds with nothing in common stand this far apart, in plate units. */
export const SPAN = 1.3;
/** The least room between two worlds: the most alike all but touch. */
export const GAP = 0.045;
/** Skills that are this alike are twins. */
const TWIN = 0.5;
/** A skill is told by its heaviest words; the rest is noise. */
const HEAVIEST = 160;

const STOP = new Set(
  (
    'the and for with that this from are was were been being have has had not but its into than then them they their there ' +
    'you your yours our ours can could should would will may might must shall when where what which who whom how why all any ' +
    'each every some such more most other only own same too very just also about above after again against before below ' +
    'between both down during few further here once out over under until while these those does did doing off nor per via ' +
    'use uses used using one two get got make makes made let lets see e.g i.e etc'
  ).split(' '),
);

/** The words of a text, as they count: lower case, three letters or more, the commonest left out, plurals as one. */
export function words(text: string): string[] {
  const found = text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  const out: string[] = [];
  for (const word of found) {
    if (STOP.has(word)) continue;
    out.push(word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word) ? word.slice(0, -1) : word);
  }
  return out;
}

const weighed = new WeakMap<SkillView, Map<string, number>>();

/**
 * What a skill is about: each word and how much it weighs. Its name weighs most, then its
 * description, then the rest of its SKILL.md; a word said again adds less each time.
 */
export function gist(skill: SkillView): Map<string, number> {
  const known = weighed.get(skill);
  if (known) return known;
  const counts = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const word of words(text)) counts.set(word, (counts.get(word) ?? 0) + weight);
  };
  add(skill.name, 4);
  add(skill.description, 2);
  add(skill.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''), 1);
  const heaviest = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, HEAVIEST);
  const gist = new Map(heaviest.map(([word, count]) => [word, 1 + Math.log(count)]));
  weighed.set(skill, gist);
  return gist;
}

/**
 * How alike the skills of two repositories are: the cosine between what the one's skills say and
 * what the other's do. A word tells more the fewer of the two repositories' skills say it. Two
 * skills, one from each, that are alike in the same way are twins. It depends on the two
 * repositories alone: charting a third changes nothing between them.
 */
export function kinship(a: SkillView[], b: SkillView[]): Kinship {
  if (a.length === 0 || b.length === 0) return { likeness: 0, twins: [] };
  const all = [...a, ...b].map(gist);
  const said = new Map<string, number>();
  for (const skill of all) for (const word of skill.keys()) said.set(word, (said.get(word) ?? 0) + 1);
  const rare = (word: string) => Math.log((1 + all.length) / (1 + said.get(word)!)) + 1;

  // What each repository says, all its skills together.
  const whole = (from: number, to: number) => {
    const sum = new Map<string, number>();
    for (const skill of all.slice(from, to)) for (const [word, weight] of skill) sum.set(word, (sum.get(word) ?? 0) + weight * rare(word));
    return sum;
  };
  const [saysA, saysB] = [whole(0, a.length), whole(a.length, all.length)];
  const length = (says: Map<string, number>) => Math.sqrt([...says.values()].reduce((sum, weight) => sum + weight * weight, 0)) || 1;
  let shared = 0;
  for (const [word, weight] of saysA) shared += weight * (saysB.get(word) ?? 0);
  const likeness = Math.min(1, shared / (length(saysA) * length(saysB)));

  // The twins: for each skill of the one, the skill of the other most like it. Each word lists
  // the other's skills that say it, so only the words two skills share are looked at.
  const unit = all.map((skill) => {
    const vector = new Map([...skill].map(([word, weight]) => [word, weight * rare(word)]));
    const long = length(vector);
    for (const [word, weight] of vector) vector.set(word, weight / long);
    return vector;
  });
  const saidBy = new Map<string, [number, number][]>();
  for (let j = 0; j < b.length; j++) {
    for (const [word, weight] of unit[a.length + j]) {
      if (!saidBy.has(word)) saidBy.set(word, []);
      saidBy.get(word)!.push([j, weight]);
    }
  }
  const twins: Twin[] = [];
  const alike = new Float64Array(b.length);
  for (let i = 0; i < a.length; i++) {
    alike.fill(0);
    for (const [word, weight] of unit[i]) for (const [j, other] of saidBy.get(word) ?? []) alike[j] += weight * other;
    let best = 0;
    for (let j = 1; j < b.length; j++) if (alike[j] > alike[best]) best = j;
    if (alike[best] >= TWIN) twins.push({ a: a[i].name, b: b[best].name, likeness: Math.min(1, alike[best]) });
  }
  twins.sort((x, y) => y.likeness - x.likeness || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0));
  return { likeness, twins };
}

/** How large a world is, in plate units: the more skills, the larger; an empty one is the smallest. */
export function radiusOf(skills: number): number {
  return 0.072 + 0.0125 * Math.sqrt(Math.min(skills, 160));
}

/**
 * The rings of a world: the other folders its skills are copied into, such as `.github/skills`
 * beside `.claude/skills`. One ring each.
 */
export function ringsOf(skills: SkillView[]): string[] {
  const own = new Set(skills.map((skill) => home(skill.path)));
  const others = new Set<string>();
  for (const skill of skills) for (const copy of skill.copies) if (!own.has(home(copy))) others.add(home(copy));
  return [...others].sort();
}

/** How far apart two worlds are to stand: all but touching when their skills are the same, `SPAN` when nothing is. */
export function apart(likeness: number, radiusA: number, radiusB: number): number {
  return Math.max(radiusA + radiusB + GAP, SPAN * Math.pow(1 - Math.min(1, Math.max(0, likeness)), 1.5));
}

/**
 * Where the worlds stand on the plate: the plane in which the distances between them are closest
 * to what their likeness asks for (the least stress). No two overlap; the middle of them all is the
 * middle of the plate; and the same worlds always stand the same way round.
 */
export function layout(likeness: number[][], radii: number[]): Vec2[] {
  const n = radii.length;
  if (n === 0) return [];
  if (n === 1) return [[0, 0]];
  const wanted = radii.map((_, i) => radii.map((__, j) => (i === j ? 0 : apart(likeness[i][j], radii[i], radii[j]))));
  let at = classical(wanted);
  at = majorize(at, wanted);
  at = separate(at, radii);
  return upright(centred(at), radii);
}

/** How far the worlds reach from the middle of the plate, their own size included. */
export function reach(at: Vec2[], radii: number[]): number {
  return at.reduce((far, [x, y], i) => Math.max(far, Math.hypot(x, y) + radii[i]), 0);
}

/** Where the `slot`th of `slots` uncharted worlds waits: on the belt round the plate, `rim` from its middle. */
export function belt(slot: number, slots: number, rim: number): Vec2 {
  const angle = -Math.PI / 2 + ((slot + 0.5) / Math.max(1, slots)) * Math.PI * 2;
  return [rim * Math.cos(angle), rim * Math.sin(angle)];
}

/** Classical scaling: the two widest axes of the distances, found by power iteration. */
function classical(wanted: number[][]): Vec2[] {
  const n = wanted.length;
  const squared = wanted.map((row) => row.map((d) => d * d));
  const rowMean = squared.map((row) => row.reduce((sum, value) => sum + value, 0) / n);
  const mean = rowMean.reduce((sum, value) => sum + value, 0) / n;
  const b = squared.map((row, i) => row.map((value, j) => -0.5 * (value - rowMean[i] - rowMean[j] + mean)));
  const axes: number[][] = [];
  const values: number[] = [];
  for (let axis = 0; axis < 2; axis++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i * 1.7 + axis * 0.9 + 0.4));
    let value = 0;
    for (let pass = 0; pass < 200; pass++) {
      let next = b.map((row) => row.reduce((sum, weight, j) => sum + weight * v[j], 0));
      for (const other of axes) {
        const along = next.reduce((sum, x, i) => sum + x * other[i], 0);
        next = next.map((x, i) => x - along * other[i]);
      }
      value = Math.hypot(...next);
      if (value < 1e-12) break;
      v = next.map((x) => x / value);
    }
    axes.push(v);
    values.push(value);
  }
  return Array.from({ length: n }, (_, i): Vec2 => [axes[0][i] * Math.sqrt(values[0]), axes[1][i] * Math.sqrt(values[1])]);
}

/**
 * Stress majorization (SMACOF): each pass puts every world where the others, each pushing it as far
 * off as it should be, would have it (the Guttman transform, every pair weighing the same). The
 * stress never grows, so the worlds settle.
 */
function majorize(start: Vec2[], wanted: number[][]): Vec2[] {
  const n = start.length;
  let at = start.map(([x, y], i): Vec2 => [x + 1e-4 * Math.cos(i * 2.4), y + 1e-4 * Math.sin(i * 2.4)]); // no two on one spot
  for (let pass = 0; pass < 400; pass++) {
    const next: Vec2[] = at.map(() => [0, 0]);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const [dx, dy] = [at[i][0] - at[j][0], at[i][1] - at[j][1]];
        const gap = Math.hypot(dx, dy) || 1e-9;
        next[i][0] += (wanted[i][j] * dx) / gap / n;
        next[i][1] += (wanted[i][j] * dy) / gap / n;
      }
      moved = Math.max(moved, Math.abs(next[i][0] - at[i][0]), Math.abs(next[i][1] - at[i][1]));
    }
    at = next;
    if (moved < 1e-9) break;
  }
  return at;
}

/** Pushes apart whatever still overlaps: the plane cannot always give every pair its distance. */
function separate(start: Vec2[], radii: number[]): Vec2[] {
  const at = start.map(([x, y]): Vec2 => [x, y]);
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const least = radii[i] + radii[j] + GAP;
        let [dx, dy] = [at[j][0] - at[i][0], at[j][1] - at[i][1]];
        let gap = Math.hypot(dx, dy);
        if (gap >= least - 1e-9) continue;
        if (gap < 1e-9) [dx, dy, gap] = [Math.cos(i + j), Math.sin(i + j), 1];
        const push = (least - gap) / 2 + 1e-6;
        at[i][0] -= (dx / gap) * push;
        at[i][1] -= (dy / gap) * push;
        at[j][0] += (dx / gap) * push;
        at[j][1] += (dy / gap) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return at;
}

function centred(at: Vec2[]): Vec2[] {
  const [mx, my] = at.reduce(([sx, sy], [x, y]) => [sx + x / at.length, sy + y / at.length], [0, 0]);
  return at.map(([x, y]): Vec2 => [x - mx, y - my]);
}

/**
 * The same worlds, the same way round, whatever order they came in: their longest axis lies across
 * the plate, the heavier end to the left, and the heavier side to the front.
 */
function upright(at: Vec2[], radii: number[]): Vec2[] {
  let [xx, xy, yy] = [0, 0, 0];
  for (const [x, y] of at) {
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const tilt = 0.5 * Math.atan2(2 * xy, xx - yy);
  const [cos, sin] = [Math.cos(-tilt), Math.sin(-tilt)];
  let turned = at.map(([x, y]): Vec2 => [x * cos - y * sin, x * sin + y * cos]);
  const lean = (axis: 0 | 1) => turned.reduce((sum, point, i) => sum + radii[i] * Math.sign(point[axis]) * point[axis] * point[axis], 0);
  if (lean(0) > 1e-9) turned = turned.map(([x, y]): Vec2 => [-x, y]);
  if (lean(1) < -1e-9) turned = turned.map(([x, y]): Vec2 => [x, -y]);
  return turned;
}
