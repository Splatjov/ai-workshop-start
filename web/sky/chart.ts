// The sky of a scan. Every skill is a star on the unit sphere, the directory that holds its folder
// is its constellation, and a copy is a companion beside it. The scanned commit seeds it: the same
// commit, the same sky. No DOM and no WebGL here, so tests/sky.test.ts runs it in Node.
import type { ScanView, SkillView } from '../../src/browser.ts';

export type Vec3 = [number, number, number];

export type Star = {
  /** The skill's id. */
  id: string;
  name: string;
  /** Where it is, on the unit sphere. */
  at: Vec3;
  /** 0, faint, to 1, bright: the longer the SKILL.md, the brighter. */
  magnitude: number;
  /** Its constellation, an index into the chart's. */
  constellation: number;
  /** One per copy of the skill, close by. */
  companions: Vec3[];
};

export type Constellation = {
  /** The directory that holds the skills' folders; `/` for the repository root. */
  name: string;
  /** Where its name is written: under its stars. */
  at: Vec3;
  /** Its stars, as indexes into the chart's. */
  stars: number[];
  /** The figure: pairs of the chart's stars to join. */
  lines: [number, number][];
};

export type Chart = {
  /** From the scanned commit; the field stars behind the skills are drawn from it too. */
  seed: number;
  /** The middle of the part of the sky the skills take. */
  zenith: Vec3;
  /** In the scan's order: by name. */
  stars: Star[];
  constellations: Constellation[];
};

type Scanned = Extract<ScanView, { skills: unknown }>;

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix = (a: Vec3, ka: number, b: Vec3, kb: number): Vec3 => [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/**
 * A disc drawn on flat paper, laid on the sphere with its area kept: the angle its radius becomes.
 * Small discs keep their radius; one of radius 2 wraps the whole sphere.
 */
const round = (radius: number) => Math.acos(clamp(1 - (radius * radius) / 2, -1, 1));
/** The other way: the flat radius of a cap of the sphere. */
const flat = (cap: number) => Math.sqrt(2 * (1 - Math.cos(cap)));

/** The angle between two points of the sphere, in radians. */
export function angle(a: Vec3, b: Vec3): number {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

/** From `from`, `distance` radians along the great circle that leaves it at `bearing`: 0 is east. */
export function offset(from: Vec3, distance: number, bearing: number): Vec3 {
  const east = unit(cross(Math.abs(from[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0], from));
  const north = cross(from, east);
  const heading = mix(east, Math.cos(bearing), north, Math.sin(bearing));
  return unit(mix(from, Math.cos(distance), heading, Math.sin(distance)));
}

/** `from`, moved `distance` radians towards `to`; a negative distance moves it away. */
function towards(from: Vec3, to: Vec3, distance: number): Vec3 {
  const heading = mix(to, 1, from, -dot(from, to));
  if (Math.hypot(heading[0], heading[1], heading[2]) < 1e-9) return from;
  return unit(mix(from, Math.cos(distance), unit(heading), Math.sin(distance)));
}

/** FNV-1a: the same text, the same number, in every browser and in Node. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32, drawably's own generator: the same seed, the same numbers. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The directory that holds the skill's folder: `.claude/skills/x/SKILL.md` → `.claude/skills`. */
export function home(path: string): string {
  return path.split('/').slice(0, -2).join('/') || '/';
}

/** A SKILL.md of 120 characters is the faintest star, one of 16 000 the brightest. */
export function magnitude(markdown: string): number {
  const faint = Math.log(120);
  return clamp((Math.log(Math.max(1, markdown.length)) - faint) / (Math.log(16000) - faint), 0, 1);
}

export function chartOf(view: Scanned): Chart {
  const { repository, skills } = view;
  const seed = hash(repository.commit || repository.id);
  const rand = random(seed);
  const zenith = offset(offset([0, 0, 1], rand() * Math.PI * 2, 0), rad(-30 + rand() * 60), Math.PI / 2);

  // The more skills, the more of the sky they take, and the closer they may come. A sky too full
  // for the smallest gap takes a smaller one still: the sphere has only so much room.
  const cap = clamp(rad(17) * Math.sqrt(skills.length), rad(22), rad(100));
  const room = Math.sqrt((0.72 * 4 * Math.PI) / (0.866 * Math.max(1, skills.length)));
  const apart = Math.min(clamp((cap * 1.25) / Math.sqrt(Math.max(1, skills.length)), rad(7), rad(20)), room);

  const names = [...new Set(skills.map((skill) => home(skill.path)))].sort();
  const members = names.map((name) => skills.flatMap((skill, index) => (home(skill.path) === name ? [index] : [])));

  // The constellations' centres: a sunflower round the zenith, over as much sky as all the stars
  // need at that gap, or over the middle of the cap if that is more.
  const needed = Math.min(2, Math.sqrt((skills.length * 0.866 * apart * apart) / 0.72 / Math.PI));
  const typical = 0.75 * apart * (members.reduce((sum, stars) => sum + Math.sqrt(stars.length), 0) / Math.max(1, names.length));
  const over = Math.max(flat(cap * 0.62), needed - typical);
  const phase = rand() * Math.PI * 2;
  const centres = names.map((_, i) =>
    names.length === 1 ? zenith : offset(zenith, round(over * Math.sqrt((i + 0.5) / names.length)), phase + i * GOLDEN),
  );

  // A sunflower around each constellation's centre, then pushed apart as far as the sky has room.
  const at: Vec3[] = [];
  const of: number[] = [];
  members.forEach((stars, c) => {
    const turn = rand() * Math.PI * 2;
    const step = Math.min(apart * 0.8, 1.96 / Math.sqrt(stars.length)); // the whole sphere, at most
    stars.forEach((star, k) => {
      at[star] = offset(centres[c], round(step * Math.sqrt(k + 0.35)), turn + k * GOLDEN);
      of[star] = c;
    });
  });
  spread(at, of, centres, members.map((stars) => round(apart * 0.75 * Math.sqrt(stars.length))), apart);

  const stars = skills.map((skill, index) => ({
    id: skill.id,
    name: skill.name,
    at: at[index],
    magnitude: magnitude(skill.markdown),
    constellation: of[index],
    companions: companions(skill, at[index]),
  }));

  const constellations = names.map((name, c) => {
    const middle = unit(members[c].reduce<Vec3>((sum, star) => mix(sum, 1, at[star], 1), [0, 0, 0]));
    const reach = Math.max(...members[c].map((star) => angle(middle, at[star])));
    return { name, at: offset(middle, reach + rad(6.5), -Math.PI / 2), stars: members[c], lines: figure(members[c], at) };
  });

  return { seed, zenith, stars, constellations };
}

/**
 * Pushes stars closer than `apart` away from each other, and keeps each within reach of its centre.
 * Where many constellations share little sky, the two pull against each other; so the last passes
 * have no centre to hold to, and push apart whatever still crowds.
 */
function spread(at: Vec3[], of: number[], centres: Vec3[], reach: number[], apart: number) {
  const passes = clamp(Math.round(36000 / Math.max(1, at.length)), 12, 90); // a huge sky settles for less
  const push = (wanted: (i: number, j: number) => number, widest: number, strength: number) => {
    const near = Math.cos(widest); // most pairs are further apart than any wanted gap: a product tells
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        if (dot(at[i], at[j]) < near) continue;
        const gap = angle(at[i], at[j]);
        const by = (wanted(i, j) - gap) * strength;
        if (by <= 0) continue;
        const [a, b] = [at[i], at[j]];
        at[i] = gap < 1e-6 ? offset(a, by, i) : towards(a, b, -by);
        at[j] = gap < 1e-6 ? offset(b, by, j + Math.PI) : towards(b, a, -by);
      }
    }
  };
  for (let pass = 0; pass < passes; pass++) {
    push((i, j) => (of[i] === of[j] ? apart : apart * 1.9), apart * 1.9, 0.3);
    for (let i = 0; i < at.length; i++) {
      const far = angle(at[i], centres[of[i]]) - reach[of[i]];
      if (far > 0) at[i] = towards(at[i], centres[of[i]], far * 0.3);
    }
  }
  for (let pass = 0; pass < Math.max(10, Math.round(passes / 3)); pass++) push(() => apart * 0.92, apart * 0.92, 0.5);
}

/** A copy sits a few degrees from its skill, at a bearing its own path picks. */
function companions(skill: SkillView, at: Vec3): Vec3[] {
  return skill.copies.map((copy, i) => offset(at, rad(4.6 + i * 1.5), (hash(copy) / 4294967296) * Math.PI * 2));
}

/** The figure of a constellation: the shortest tree through its stars, and a loop per five of them. */
function figure(stars: number[], at: Vec3[]): [number, number][] {
  const count = stars.length;
  if (count < 2) return [];
  const between = (i: number, j: number) => angle(at[stars[i]], at[stars[j]]);
  const key = (i: number, j: number) => (i < j ? i * count + j : j * count + i);

  // Prim's: each star not yet joined remembers the joined star nearest to it.
  const joined = new Array<boolean>(count).fill(false);
  const nearest = new Array<number>(count).fill(0);
  const gap = stars.map((_, i) => between(0, i));
  joined[0] = true;
  const lines: [number, number][] = [];
  const tree = new Set<number>();
  for (let added = 1; added < count; added++) {
    let next = -1;
    for (let i = 0; i < count; i++) if (!joined[i] && (next < 0 || gap[i] < gap[next])) next = i;
    joined[next] = true;
    lines.push([nearest[next], next]);
    tree.add(key(nearest[next], next));
    for (let i = 0; i < count; i++) {
      if (joined[i]) continue;
      const away = between(next, i);
      if (away < gap[i]) [gap[i], nearest[i]] = [away, next];
    }
  }

  // The loops: the shortest of the lines from each star to the nearest one the tree does not join it to.
  const loops = Math.floor(count / 5);
  const spare = new Map<number, { gap: number; line: [number, number] }>();
  for (let i = 0; loops > 0 && i < count; i++) {
    let best = -1;
    let least = Infinity;
    for (let j = 0; j < count; j++) {
      if (j === i || tree.has(key(i, j))) continue;
      const away = between(i, j);
      if (away < least) [least, best] = [away, j];
    }
    if (best >= 0) spare.set(key(i, best), { gap: least, line: [Math.min(i, best), Math.max(i, best)] });
  }
  const shortest = [...spare.values()].sort((a, b) => a.gap - b.gap || a.line[0] - b.line[0] || a.line[1] - b.line[1]);
  return [...lines, ...shortest.slice(0, loops).map(({ line }) => line)].map(([a, b]) => [stars[a], stars[b]]);
}
