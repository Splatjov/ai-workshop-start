// Strokes, as geometry. A polyline becomes a ribbon: two vertices per point, which the vertex shader
// pushes apart on the screen by the pen's width. Each stroke carries a seed, so it wobbles its own way.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Vec3 } from './chart.ts';

const TURN = Math.PI * 2;

export class Strokes {
  #rand: () => number;
  #position: number[] = [];
  #prev: number[] = [];
  #next: number[] = [];
  #params: number[] = [];
  #extra: number[] = [];
  #index: number[] = [];

  constructor(rand: () => number) {
    this.#rand = rand;
  }

  /** One pass of the pen through the points. `turn`: when it is drawn, 0 first, 1 last. */
  line(points: Vec3[], turn = 0, unsteady = 1): this {
    if (points.length < 2) return this;
    const along = [0];
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      along.push(along[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const length = along[along.length - 1] || 1;
    const seed = this.#rand();
    const base = this.#position.length / 3;
    points.forEach((point, i) => {
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(points.length - 1, i + 1)];
      for (const side of [-1, 1]) {
        this.#position.push(...point);
        this.#prev.push(...before);
        this.#next.push(...after);
        this.#params.push(side, along[i] / length, length, seed);
        this.#extra.push(turn, unsteady);
      }
      if (i < points.length - 1) {
        const k = base + i * 2;
        this.#index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    });
    return this;
  }

  /** Twice over, the second pass less steady: drawably's double stroke. */
  sketch(points: Vec3[], turn = 0): this {
    return this.line(points, turn, 1).line(points, turn, 1.6);
  }

  /** A closed curve, twice over: each pass starts somewhere else and overshoots where it began. */
  loop(curve: (start: number, sweep: number) => Vec3[], turn = 0, passes = 2): this {
    for (let pass = 0; pass < passes; pass++) {
      this.line(curve(this.#rand() * TURN, TURN * (1.02 + this.#rand() * 0.05)), turn, 1 + pass * 0.6);
    }
    return this;
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.#position, 3));
    geometry.setAttribute('aPrev', new Float32BufferAttribute(this.#prev, 3));
    geometry.setAttribute('aNext', new Float32BufferAttribute(this.#next, 3));
    geometry.setAttribute('aParams', new Float32BufferAttribute(this.#params, 4));
    geometry.setAttribute('aExtra', new Float32BufferAttribute(this.#extra, 2));
    geometry.setIndex(this.#index);
    return geometry;
  }
}

/** A circle around the Y axis, `radius` wide, at height `y`. */
export function ring(radius: number, y = 0, steps = 120) {
  return (start = 0, sweep = TURN): Vec3[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = start + (sweep * i) / steps;
      return [radius * Math.cos(a), y, radius * Math.sin(a)];
    });
}

/** A circle facing the eye, in the XY plane, at depth `z`. */
export function disc(radius: number, z = 0, steps = 96) {
  return (start = 0, sweep = TURN): Vec3[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = start + (sweep * i) / steps;
      return [radius * Math.cos(a), radius * Math.sin(a), z];
    });
}

/** The great circle through both poles, at a longitude. */
export function meridian(longitude: number, steps = 120) {
  return (start = 0, sweep = TURN): Vec3[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = start + (sweep * i) / steps;
      return [Math.cos(a) * Math.cos(longitude), Math.sin(a), Math.cos(a) * Math.sin(longitude)];
    });
}

/** The great-circle arc from one point of the sphere to another, short of each end by `trim` radians. */
export function arc(from: Vec3, to: Vec3, trim = 0): Vec3[] {
  const cos = Math.min(1, Math.max(-1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2]));
  const whole = Math.acos(cos);
  if (whole < 1e-5 || whole - trim * 2 < 1e-3) return [];
  const steps = Math.max(2, Math.ceil(((whole - trim * 2) * 180) / Math.PI / 2.5));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (trim + ((whole - trim * 2) * i) / steps) / whole;
    const a = Math.sin((1 - t) * whole) / Math.sin(whole);
    const b = Math.sin(t * whole) / Math.sin(whole);
    return [from[0] * a + to[0] * b, from[1] * a + to[1] * b, from[2] * a + to[2] * b];
  });
}
