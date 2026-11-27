// The terrain of a world. Every place raises land about itself, as far as half the way to its
// neighbour, so the places of one directory stand on one land, with bays and lakes between them;
// where the lands of two directories would meet, a strait runs between them; and the longer a
// SKILL.md, the higher its place stands. The terrain is a map of the whole sphere, which the engine
// draws the coasts, the contours and the sea from. No DOM and no WebGL here, so tests/sky.test.ts
// runs it in Node.
import { angle, type Chart, type Vec3 } from './chart.ts';

/** Where the land field is this high, there is the coast: above it, land; below it, sea. */
export const COAST = 0.5;
/** How much of the next land's field is taken from a land's own: where two lands meet, neither is land. */
const STRAIT = 0.9;

export type Terrain = {
  width: number;
  height: number;
  /**
   * RGBA, row by row from the south pole to the north, each row from longitude −180° to 180°:
   * R the land field (`COAST` is the coast), G how high the land stands, B which land it is
   * (a different shade for each; 0 where no land reaches), A 255.
   */
  data: Uint8Array;
};

/**
 * How far each place's land reaches: a little over half the way to the nearest place of its own
 * land, so the two join; a place alone on its land makes an island.
 */
export function reaches(chart: Chart): number[] {
  return chart.places.map((place, i) => {
    let nearest = Infinity;
    for (const other of chart.lands[place.land].places) if (other !== i) nearest = Math.min(nearest, angle(place.at, chart.places[other].at));
    if (nearest === Infinity) return chart.apart * 0.62;
    return Math.min(chart.apart * 1.3, Math.max(chart.apart * 0.42, nearest * 0.5));
  });
}

/** How high a place stands at its summit: no SKILL.md is so short that it leaves no hill. */
const summit = (height: number) => 0.24 + 0.76 * height;

/** A bell about a place: 1 at the place, falling with the angle from it. */
const bell = (away: number, wide: number) => Math.exp(-((away / wide) ** 2));

/** The land field at a point of the sphere: `COAST` and above is land; at a place it is at its highest. */
export function landAt(chart: Chart, p: Vec3): number {
  const wide = reaches(chart);
  const sea = chart.lands.map(() => 1);
  chart.places.forEach((place, i) => (sea[place.land] *= 1 - bell(angle(place.at, p), wide[i])));
  const [first = 0, second = 0] = sea.map((left) => 1 - left).sort((a, b) => b - a);
  return first - STRAIT * second;
}

/** How high the land stands at a point: 0, flat, to 1, the summit of the longest SKILL.md. */
export function reliefAt(chart: Chart, p: Vec3): number {
  const wide = reaches(chart);
  let flat = 1;
  chart.places.forEach((place, i) => (flat *= 1 - summit(place.height) * bell(angle(place.at, p), wide[i] * 0.78)));
  return 1 - flat;
}

/** The point of the sphere at a longitude and a latitude, in radians. */
export function pointAt(longitude: number, latitude: number): Vec3 {
  const across = Math.cos(latitude);
  return [across * Math.cos(longitude), Math.sin(latitude), across * Math.sin(longitude)];
}

/**
 * The map of a world's terrain. Each place is drawn only as far as its bell reaches, so a world of
 * a hundred skills is mapped as fast as one of ten.
 */
export function terrainOf(chart: Chart, width = 512, height = 256): Terrain {
  const size = width * height;
  const wide = reaches(chart);
  const flat = new Float32Array(size).fill(1);
  // The two lands that reach furthest to each point, and which the first is.
  const first = new Float32Array(size);
  const second = new Float32Array(size);
  const which = new Uint8Array(size);
  // One land at a time: the sea its places leave, and the points they reach.
  const sea = new Float32Array(size).fill(1);
  const reached: number[] = [];

  chart.lands.forEach((land, l) => {
    // A different shade for each land, never 0: 0 is where no land reaches.
    const shade = 1 + ((l * 97) % 255);
    for (const index of land.places) {
      const place = chart.places[index];
      const [x, y, z] = place.at;
      const far = wide[index] * 3.1; // beyond this a bell is under a thousandth
      const cosFar = Math.cos(Math.min(Math.PI, far));
      const latitude = Math.asin(Math.max(-1, Math.min(1, y)));
      const longitude = Math.atan2(z, x);
      const top = Math.min(height - 1, Math.floor(((latitude + far) / Math.PI + 0.5) * height));
      const bottom = Math.max(0, Math.floor(((latitude - far) / Math.PI + 0.5) * height));
      const peak = summit(place.height);
      const middle = Math.floor((longitude / (Math.PI * 2) + 0.5) * width);
      for (let row = bottom; row <= top; row++) {
        const rowLatitude = ((row + 0.5) / height - 0.5) * Math.PI;
        const [sin, cos] = [Math.sin(rowLatitude), Math.cos(rowLatitude)];
        // How far east and west of the place the bell reaches on this row; near a pole, all the way round.
        const across = cos * Math.cos(latitude);
        const least = across > 1e-6 ? (cosFar - sin * y) / across : -2;
        if (least > 1) continue;
        const half = least <= -1 ? width / 2 : Math.ceil((Math.acos(least) / (Math.PI * 2)) * width) + 1;
        for (let step = -half; step <= half && step < -half + width; step++) {
          const column = (((middle + step) % width) + width) % width;
          const columnLongitude = ((column + 0.5) / width - 0.5) * Math.PI * 2;
          const dot = Math.min(1, Math.max(-1, cos * Math.cos(columnLongitude) * x + sin * y + cos * Math.sin(columnLongitude) * z));
          const away = Math.acos(dot);
          const at = row * width + column;
          if (sea[at] === 1) reached.push(at);
          // Never quite 1, so a point a place has reached is told from one none has.
          sea[at] *= Math.min(0.999999, 1 - bell(away, wide[index]));
          flat[at] *= 1 - peak * bell(away, wide[index] * 0.78);
        }
      }
    }
    for (const at of reached) {
      const field = 1 - sea[at];
      sea[at] = 1;
      if (field > first[at]) {
        second[at] = first[at];
        first[at] = field;
        which[at] = shade;
      } else if (field > second[at]) {
        second[at] = field;
      }
    }
    reached.length = 0;
  });

  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    data[i * 4] = Math.round(Math.max(0, first[i] - STRAIT * second[i]) * 255);
    data[i * 4 + 1] = Math.round((1 - flat[i]) * 255);
    data[i * 4 + 2] = which[i];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}
