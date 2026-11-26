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

  // The more skills, the more of the sky they take, and the closer they may come.
  const cap = clamp(rad(17) * Math.sqrt(skills.length), rad(22), rad(100));
  const apart = clamp((cap * 1.25) / Math.sqrt(Math.max(1, skills.length)), rad(7), rad(20));

  const names = [...new Set(skills.map((skill) => home(skill.path)))].sort();
  const members = names.map((name) => skills.flatMap((skill, index) => (home(skill.path) === name ? [index] : [])));
  const phase = rand() * Math.PI * 2;
  const centres = names.map((_, i) =>
    names.length === 1 ? zenith : offset(zenith, cap * 0.62 * Math.sqrt((i + 0.5) / names.length), phase + i * GOLDEN),
  );

  // A sunflower around each constellation's centre, then pushed apart until nothing crowds.
  const at: Vec3[] = [];
  const of: number[] = [];
  members.forEach((stars, c) => {
    const turn = rand() * Math.PI * 2;
    stars.forEach((star, k) => {
      at[star] = offset(centres[c], apart * 0.8 * Math.sqrt(k + 0.35), turn + k * GOLDEN);
      of[star] = c;
    });
  });
  spread(at, of, centres, members.map((stars) => apart * 0.75 * Math.sqrt(stars.length)), apart);

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

/** Pushes stars closer than `apart` away from each other, and keeps each within reach of its centre. */
function spread(at: Vec3[], of: number[], centres: Vec3[], reach: number[], apart: number) {
  for (let pass = 0; pass < 90; pass++) {
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const wanted = of[i] === of[j] ? apart : apart * 1.9;
        const gap = angle(at[i], at[j]);
        if (gap >= wanted) continue;
        const push = (wanted - gap) * 0.3;
        const [a, b] = [at[i], at[j]];
        at[i] = gap < 1e-6 ? offset(a, push, i) : towards(a, b, -push);
        at[j] = gap < 1e-6 ? offset(b, push, j + Math.PI) : towards(b, a, -push);
      }
    }
    for (let i = 0; i < at.length; i++) {
      const far = angle(at[i], centres[of[i]]) - reach[of[i]];
      if (far > 0) at[i] = towards(at[i], centres[of[i]], far * 0.3);
    }
  }
}

/** A copy sits a few degrees from its skill, at a bearing its own path picks. */
function companions(skill: SkillView, at: Vec3): Vec3[] {
  return skill.copies.map((copy, i) => offset(at, rad(4.6 + i * 1.5), (hash(copy) / 4294967296) * Math.PI * 2));
}

/** The figure of a constellation: the shortest tree through its stars, and a loop per five of them. */
function figure(stars: number[], at: Vec3[]): [number, number][] {
  if (stars.length < 2) return [];
  const lines: [number, number][] = [];
  const joined = new Set([stars[0]]);
  while (joined.size < stars.length) {
    let best: [number, number] | undefined;
    let shortest = Infinity;
    for (const a of joined) {
      for (const b of stars) {
        if (joined.has(b)) continue;
        const gap = angle(at[a], at[b]);
        if (gap < shortest) [shortest, best] = [gap, [a, b]];
      }
    }
    joined.add(best![1]);
    lines.push(best!);
  }
  const has = (a: number, b: number) => lines.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const spare: { gap: number; line: [number, number] }[] = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      if (!has(stars[i], stars[j])) spare.push({ gap: angle(at[stars[i]], at[stars[j]]), line: [stars[i], stars[j]] });
    }
  }
  spare.sort((a, b) => a.gap - b.gap || a.line[0] - b.line[0] || a.line[1] - b.line[1]);
  return [...lines, ...spare.slice(0, Math.floor(stars.length / 5)).map(({ line }) => line)];
}
