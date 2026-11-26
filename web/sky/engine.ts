// The sky, drawn: a celestial globe of glass in pen on paper, in WebGL. Its lines boil in step with
// drawably's (three frames, 400 ms each), its far side shows through, fainter and broken, and pencil
// hatching gives it volume. The globe sits wherever the page puts its slot, and glides there when
// the layout changes. Dragging turns it; choosing a star brings that star to the front.
import {
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  PerspectiveCamera,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import { offset, random, type Chart, type Vec3 } from './chart.ts';
import {
  HATCH_FRAGMENT,
  HATCH_VERTEX,
  SHADOW_FRAGMENT,
  SHADOW_VERTEX,
  STAR_FRAGMENT,
  STAR_VERTEX,
  STROKE_FRAGMENT,
  STROKE_VERTEX,
} from './shaders.ts';
import { Strokes, arc, disc, meridian, ring } from './strokes.ts';

/** The eye, in globe radii from its centre. */
const EYE = 4.2;
/** The globe's outline is the circle where the eye's rays touch it: this wide, this far forward. */
const RIM = Math.sqrt(1 - 1 / (EYE * EYE));
/** How much of its slot's half-width the globe takes; the rings around it take the rest. */
const FIT = 0.86;
/** Where a chosen star comes to rest: a little left of and above the middle. */
const REST = new Vector3(-0.1, 0.12, 1).normalize();
const FIELD = 620;
const MILKY = 900;
const TRAIL = 48;
/** How long the pencil's trail takes to dry out, in seconds. */
const LINGER = 0.8;
const TURN = Math.PI * 2;
const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);

export type Palette = { ink: string; accent: string; chalk: boolean };

export type SkyEvents = {
  /** A star was clicked. */
  choose(id: string): void;
  /** The pointer is over a star, or over none. */
  point(id: string | undefined): void;
  /** Where the middle of the view looks: right ascension in hours, declination in degrees. */
  aim?(ra: number, dec: number): void;
};

export type Sky = {
  /** The stars to draw, and the element whose `[data-star]` and `[data-constellation]` children name them. */
  chart(chart: Chart | undefined, names?: HTMLElement | null): void;
  choose(id: string | undefined): void;
  point(id: string | undefined): void;
  scanning(on: boolean): void;
  lost(on: boolean): void;
  palette(palette: Palette): void;
  dispose(): void;
};

/** A name on the page: its element is a point, at its star; the text inside hangs to one side of it. */
type Name = { element: HTMLElement; text: HTMLElement; at: Vector3; star: number; width: number; height: number; shown: string; moved: string; side: string; gap: number };
type Tween = { time: number; duration: number; delay: number; apply(t: number): void };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
const smooth = (low: number, high: number, x: number) => {
  const t = clamp((x - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

export function createSky(canvas: HTMLCanvasElement, slot: HTMLElement, events: SkyEvents): Sky {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.dataset.motion = still ? 'still' : 'boiling';

  const scene = new Scene();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, EYE);

  // ---- the pen -----------------------------------------------------------------------------------

  const shared = {
    uViewport: { value: new Vector2(1, 1) },
    uPx: { value: 1 },
    uBoil: { value: 0 },
    uDist: { value: EYE },
  };
  const ink = { value: new Vector3(0.11, 0.18, 0.54) };
  const accent = { value: new Vector3(0.89, 0.25, 0.17) };
  const sweeping = { value: new Vector4(0, 0, 1, 0) };
  const sweepDir = { value: new Vector3(1, 0, 0) };
  const materials: ShaderMaterial[] = [];
  const geometries: BufferGeometry[] = [];

  type Pen = {
    accent?: boolean;
    width: number;
    alpha?: number;
    wobble?: number;
    freq?: number;
    taper?: number;
    /** Its points are on the globe: the far side is told by the surface, not by depth. */
    sphere?: boolean;
    back?: number;
    broken?: boolean;
    dash?: number;
    dry?: number;
    stagger?: number;
    fade?: boolean;
  };

  function pen(o: Pen): ShaderMaterial {
    const material = new ShaderMaterial({
      vertexShader: STROKE_VERTEX,
      fragmentShader: STROKE_FRAGMENT,
      uniforms: {
        ...shared,
        uColor: o.accent ? accent : ink,
        uWidth: { value: o.width },
        uAlpha: { value: o.alpha ?? 1 },
        uWobble: { value: o.wobble ?? 0.012 },
        uWobbleFreq: { value: o.freq ?? 2.4 },
        uTaper: { value: o.taper ?? 0.04 },
        uSphere: { value: o.sphere ? 1 : 0 },
        uBackAlpha: { value: o.back ?? 1 },
        uBackDash: { value: o.broken ? 1 : 0 },
        uDash: { value: o.dash ?? 0 },
        uDry: { value: o.dry ?? 0.45 },
        uReveal: { value: 1 },
        uStagger: { value: o.stagger ?? 0 },
        uFade: { value: o.fade ? 1 : 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      side: DoubleSide,
    });
    materials.push(material);
    return material;
  }

  function drawn(strokes: Strokes, material: ShaderMaterial, parent: Group | Scene, order: number): Mesh {
    const geometry = strokes.geometry();
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    parent.add(mesh);
    return mesh;
  }

  // ---- the globe: what turns ---------------------------------------------------------------------

  const hand = random((Math.random() * 2 ** 32) >>> 0); // a fresh sketch on every mount, like drawably's
  const globe = new Group();
  const facing = new Group(); // what always faces the eye: the outline, the hatching, the scribble
  scene.add(facing, globe);

  const graticule = new Strokes(hand);
  for (let i = 0; i < 6; i++) graticule.loop(meridian((i * Math.PI) / 6), i / 8, 1);
  for (const latitude of [-60, -30, 30, 60]) {
    const a = (latitude * Math.PI) / 180;
    graticule.loop(ring(Math.cos(a), Math.sin(a)), 0.6 + latitude / 300, 1);
  }
  const graticulePen = pen({ width: 1, alpha: 0.5, sphere: true, back: 0.3, broken: true, stagger: 0.75, taper: 0.01 });
  drawn(graticule, graticulePen, globe, 1);

  const equator = new Strokes(hand).loop(ring(1), 0);
  const equatorPen = pen({ width: 1.5, alpha: 0.85, sphere: true, back: 0.34, broken: true, taper: 0.01 });
  drawn(equator, equatorPen, globe, 2);

  // The ecliptic: the equator, tilted by 23.4°, dashed, with a tick every 15°.
  const tilt = (23.4 * Math.PI) / 180;
  const tilted = ([x, y, z]: Vec3): Vec3 => [x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
  const ecliptic = new Strokes(hand).line(ring(1)(0, TURN).map(tilted), 0.2);
  const eclipticPen = pen({ width: 1.2, alpha: 0.7, sphere: true, back: 0.3, dash: 34, taper: 0.01 });
  drawn(ecliptic, eclipticPen, globe, 2);
  const ticks = new Strokes(hand);
  for (let i = 0; i < 24; i++) {
    const a = (i * TURN) / 24;
    const reach = i % 6 === 0 ? 0.05 : 0.026;
    ticks.line([tilted([Math.cos(a), -reach, Math.sin(a)]), tilted([Math.cos(a), 0, Math.sin(a)]), tilted([Math.cos(a), reach, Math.sin(a)])], i / 24);
  }
  const tickPen = pen({ width: 1.3, alpha: 0.85, sphere: true, back: 0.3, taper: 0.3, stagger: 0.8, wobble: 0.006 });
  drawn(ticks, tickPen, globe, 2);

  // The axis, through both poles, with a finial at each end.
  const axis = new Strokes(hand);
  for (const end of [-1, 1]) {
    axis.sketch([
      [0, end * 1.02, 0],
      [0, end * 1.26, 0],
      [0, end * 1.5, 0],
    ]);
    axis.loop(ring(0.045, end * 1.5, 24), 0.5);
  }
  const axisPen = pen({ width: 1.5, alpha: 0.9, back: 0.4, taper: 0.1, wobble: 0.01, stagger: 0.5 });
  drawn(axis, axisPen, globe, 3);

  // ---- what faces the eye ------------------------------------------------------------------------

  const outline = new Strokes(hand).loop(disc(RIM, 1 / EYE, 144), 0);
  const outlinePen = pen({ width: 2.2, wobble: 0.016, freq: 1.8, taper: 0.03 });
  drawn(outline, outlinePen, facing, 4);

  const hatching = new ShaderMaterial({
    vertexShader: HATCH_VERTEX,
    fragmentShader: HATCH_FRAGMENT,
    uniforms: {
      uPx: shared.uPx,
      uBoil: shared.uBoil,
      uColor: ink,
      uLight: { value: new Vector3(-0.62, 0.7, 0.22).normalize() },
      uCentre: { value: new Vector2() },
      uAlpha: { value: 0 },
      uChalk: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
    side: FrontSide,
  });
  materials.push(hatching);
  const ball = new SphereGeometry(0.992, 72, 48);
  geometries.push(ball);
  const shade = new Mesh(ball, hatching);
  shade.renderOrder = 0;
  facing.add(shade);

  // The shadow it casts on the page, below and a little to the right: the light is at the upper left.
  const shadowing = new ShaderMaterial({
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT,
    uniforms: { uPx: shared.uPx, uBoil: shared.uBoil, uColor: ink, uCentre: hatching.uniforms.uCentre, uAlpha: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
    side: DoubleSide,
  });
  materials.push(shadowing);
  const sheet = new PlaneGeometry(2, 2);
  geometries.push(sheet);
  const shadow = new Mesh(sheet, shadowing);
  shadow.position.set(0.14, -1.385, 0);
  shadow.scale.set(1.0, 0.1, 1);
  shadow.renderOrder = 0;
  shadow.frustumCulled = false;
  facing.add(shadow);
  let shadowShown = 0;
  let shadowReveal = 0;
  let chalk = false;

  // The red pencil, for what could not be scanned: a scribble across the globe.
  const scribble = new Strokes(hand);
  {
    const points: Vec3[] = [];
    const lean = -0.42;
    for (let i = 0; i <= 220; i++) {
      const t = i / 220;
      const x = -0.86 + 1.72 * t;
      const y = 0.6 * Math.asin(Math.sin(t * TURN * 5.5)) * (2 / Math.PI) * (0.7 + 0.3 * Math.sin(t * 9));
      points.push([x * Math.cos(lean) - y * Math.sin(lean), x * Math.sin(lean) + y * Math.cos(lean), 1 / EYE]);
    }
    scribble.line(points, 0, 1.4);
  }
  const scribblePen = pen({ accent: true, width: 3.2, alpha: 0, wobble: 0.03, freq: 3.5, dry: 0.8, taper: 0.01 });
  scribblePen.uniforms.uReveal.value = 0;
  drawn(scribble, scribblePen, facing, 9);

  // ---- the rings around it: an armillary sphere ----------------------------------------------------

  function armillary(radius: number, band: number, marks: number): Group {
    const group = new Group();
    const lines = new Strokes(hand).loop(ring(radius, 0, 160), 0).loop(ring(radius + band, 0, 160), 0.3, 1);
    drawn(lines, ringPen, group, 5);
    const graduations = new Strokes(hand);
    for (let i = 0; i < marks; i++) {
      const a = (i * TURN) / marks;
      const reach = i % 3 === 0 ? band : band * 0.5;
      graduations.line(
        [0, 0.5, 1].map((t): Vec3 => [(radius + reach * t) * Math.cos(a), 0, (radius + reach * t) * Math.sin(a)]),
        i / marks,
      );
    }
    drawn(graduations, markPen, group, 5);
    // A bead rides each ring, so its turning shows.
    const bead = new Strokes(hand).loop(
      (start, sweep) => ring(0.034, 0, 20)(start, sweep).map(([x, , z]): Vec3 => [radius + band / 2 + x, z, 0]),
      0.9,
    );
    drawn(bead, ringPen, group, 5);
    scene.add(group);
    return group;
  }
  const ringPen = pen({ width: 1.5, alpha: 0.9, back: 0.32, wobble: 0.014, freq: 1.6, taper: 0.01, stagger: 0.4 });
  const markPen = pen({ width: 1.25, alpha: 0.85, back: 0.3, wobble: 0.004, taper: 0.3, stagger: 0.9 });
  const inner = armillary(1.13, 0.05, 36);
  const outer = armillary(1.27, 0.038, 72);
  const innerTilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0.35).normalize(), 1.02);
  const outerTilt = new Quaternion().setFromAxisAngle(new Vector3(0.9, 0, -0.5).normalize(), -0.52);

  // ---- the stars -----------------------------------------------------------------------------------

  function starPen(back: number): ShaderMaterial {
    const material = new ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: {
        uViewport: shared.uViewport,
        uPx: shared.uPx,
        uBoil: shared.uBoil,
        uInk: ink,
        uAccent: accent,
        uSweep: sweeping,
        uSweepDir: sweepDir,
        uMorph: { value: 1 },
        uReveal: { value: 0 },
        uStagger: { value: 1 },
        uScale: { value: 1 },
        uSelected: { value: -1 },
        uHovered: { value: -1 },
        uBackAlpha: { value: back },
        uAlpha: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      side: DoubleSide,
    });
    materials.push(material);
    return material;
  }

  function starGeometry(count: number): InstancedBufferGeometry {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('aFrom', new InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aAt', new InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aData', new InstancedBufferAttribute(new Float32Array(count * 4), 4));
    geometry.setAttribute('aDelay', new InstancedBufferAttribute(new Float32Array(count), 1));
    geometry.instanceCount = count;
    return geometry;
  }

  // The field: the stars that are not skills, and a milky way of stipple. The commit seeds them.
  const fieldPen = starPen(0.3);
  const fieldGeometry = starGeometry(FIELD + MILKY);
  geometries.push(fieldGeometry);
  const field = new Mesh(fieldGeometry, fieldPen);
  field.frustumCulled = false;
  field.renderOrder = 1;
  globe.add(field);

  function sow(seed: number, first: boolean) {
    const rand = random(seed);
    const from = fieldGeometry.getAttribute('aFrom') as InstancedBufferAttribute;
    const at = fieldGeometry.getAttribute('aAt') as InstancedBufferAttribute;
    const data = fieldGeometry.getAttribute('aData') as InstancedBufferAttribute;
    const delay = fieldGeometry.getAttribute('aDelay') as InstancedBufferAttribute;
    (from.array as Float32Array).set(at.array as Float32Array);
    const pole = offset(offset([0, 0, 1], rand() * TURN, 0), (rand() - 0.5) * 1.6, Math.PI / 2);
    const start = offset(pole, Math.PI / 2, rand() * TURN);
    for (let i = 0; i < FIELD + MILKY; i++) {
      let point: Vec3;
      let size: number;
      if (i < FIELD) {
        const y = 1 - 2 * rand();
        const a = rand() * TURN;
        const r = Math.sqrt(1 - y * y);
        point = [r * Math.cos(a), y, r * Math.sin(a)];
        size = 0.5 + 1.8 * Math.pow(rand(), 3.4);
      } else {
        // Along a great circle, thicker in clumps: three throws make the spread a bell.
        const along = rand() * TURN;
        const clump = 0.55 + 0.45 * Math.sin(along * 3 + seed) * Math.sin(along * 1.7);
        const off = (rand() + rand() + rand() - 1.5) * 0.3 * clump;
        const onCircle: Vec3 = [
          start[0] * Math.cos(along) + (pole[1] * start[2] - pole[2] * start[1]) * Math.sin(along),
          start[1] * Math.cos(along) + (pole[2] * start[0] - pole[0] * start[2]) * Math.sin(along),
          start[2] * Math.cos(along) + (pole[0] * start[1] - pole[1] * start[0]) * Math.sin(along),
        ];
        const length = Math.hypot(onCircle[0] + pole[0] * off, onCircle[1] + pole[1] * off, onCircle[2] + pole[2] * off);
        point = [(onCircle[0] + pole[0] * off) / length, (onCircle[1] + pole[1] * off) / length, (onCircle[2] + pole[2] * off) / length];
        size = 0.42 + 0.5 * rand();
      }
      at.setXYZ(i, point[0], point[1], point[2]);
      data.setXYZW(i, size, rand(), 0, -9);
      delay.setX(i, rand());
    }
    if (first) (from.array as Float32Array).set(at.array as Float32Array);
    from.needsUpdate = at.needsUpdate = data.needsUpdate = delay.needsUpdate = true;
  }

  // The skills, and the figures that join them: drawn anew for every chart.
  const skillPen = starPen(0.34);
  const figurePen = pen({ width: 1.5, alpha: 0.92, sphere: true, back: 0.3, broken: true, stagger: 0.7, wobble: 0.01, taper: 0.12 });
  let skillMesh: Mesh | undefined;
  let figureMesh: Mesh | undefined;

  // The sweep: a meridian that goes round while a scan runs; the stars it passes flare.
  const sweep = new Group();
  globe.add(sweep);
  const half = (trail: number) =>
    Array.from({ length: 61 }, (_, i): Vec3 => {
      const a = -Math.PI / 2 + (Math.PI * i) / 60;
      return [Math.cos(a) * Math.cos(trail), Math.sin(a), Math.cos(a) * Math.sin(trail)];
    });
  const sweepPen = pen({ accent: true, width: 2.6, alpha: 0, sphere: true, back: 0.4, taper: 0.2, wobble: 0.01 });
  drawn(new Strokes(hand).sketch(half(0)), sweepPen, sweep, 7);
  const wakePen = pen({ accent: true, width: 1.3, alpha: 0, sphere: true, back: 0.3, taper: 0.3, wobble: 0.012, dry: 0.8 });
  drawn(new Strokes(hand).line(half(0.09)).line(half(0.2)).line(half(0.34)), wakePen, sweep, 7);

  // The rings a pen draws around a star: the chosen one in red pencil, the one under the pointer in ink.
  const lasso = (material: ShaderMaterial) => {
    const mesh = drawn(new Strokes(hand).loop(disc(1, 0, 48), 0, 2), material, scene, 8);
    mesh.visible = false;
    return mesh;
  };
  const chosenPen = pen({ accent: true, width: 2.1, wobble: 0.09, freq: 1.3, taper: 0.06, dry: 0.5 });
  const pointedPen = pen({ width: 1.3, wobble: 0.08, freq: 1.3, taper: 0.06, alpha: 0.85 });
  const chosenRing = lasso(chosenPen);
  const pointedRing = lasso(pointedPen);

  // ---- the pointer's trail: pencil, drying out -----------------------------------------------------

  const overlay = new Scene();
  const flat = new OrthographicCamera(0, 1, 0, 1, -1, 1);
  const trailGeometry = new BufferGeometry();
  for (const [name, size] of [['position', 3], ['aPrev', 3], ['aNext', 3], ['aParams', 4], ['aExtra', 2]] as const) {
    const attribute = new Float32BufferAttribute(new Float32Array(TRAIL * 2 * size), size);
    attribute.setUsage(DynamicDrawUsage);
    trailGeometry.setAttribute(name, attribute);
  }
  trailGeometry.setIndex(Array.from({ length: TRAIL - 1 }, (_, i) => [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]).flat());
  trailGeometry.setDrawRange(0, 0);
  geometries.push(trailGeometry);
  const trailPen = pen({ width: 1.6, alpha: 0.6, wobble: 0, taper: 0.02, dry: 0.8, fade: true });
  const trailMesh = new Mesh(trailGeometry, trailPen);
  trailMesh.frustumCulled = false;
  overlay.add(trailMesh);
  const trail: { x: number; y: number; born: number }[] = [];

  // ---- state ---------------------------------------------------------------------------------------

  let width = 0;
  let height = 0;
  // Where frames come slowly, the sky is drawn with fewer pixels: never fewer than the page's own.
  let quality = 1;
  let slow = 0;
  let time = 0;
  let last = performance.now();
  let frameRequest = 0;
  let disposed = false;

  // Where the globe is: its centre, in page coordinates, and its radius, both in CSS pixels.
  const centre = new Vector2();
  let radius = 0;
  let placed = false;
  const box = { left: 0, top: 0, right: 0, bottom: 0 };

  // How it is turned: by the hand, plus a lean towards the pointer.
  const turn = new Quaternion().setFromAxisAngle(X, 0.3).multiply(new Quaternion().setFromAxisAngle(Z, -0.38));
  const lean = new Quaternion();
  const spin = new Vector3();
  const pointer = { x: 0, y: 0, known: false };
  let drag: { x: number; y: number; travelled: number; at: number } | undefined;
  let touched = -10;
  let turning: { from: Quaternion; to: Quaternion; time: number; duration: number } | undefined;
  let innerTurn = 0;
  let outerTurn = 0;
  let tumble = 0;

  let current: Chart | undefined;
  let stars: { at: Vector3; size: number }[] = [];
  let names: Name[] = [];
  let namesRoot: HTMLElement | null | undefined;
  let chosen = -1;
  let pointed = -1;
  let scan = 0;
  let scanOn = false;
  let sweepAt = 0;
  let lostOn = false;
  let lostFor = 9;
  let aimed = 0;
  let turnedOnce = false;

  const tweens = new Map<string, Tween>();
  function tween(key: string, duration: number, apply: (t: number) => void, delay = 0) {
    if (still || duration <= 0) {
      tweens.delete(key);
      apply(1);
    } else {
      apply(0);
      tweens.set(key, { time: 0, duration, delay, apply });
    }
  }

  const q = new Quaternion();
  const v = new Vector3();
  const w = new Vector3();
  const seen = { x: 0, y: 0, facing: 0, near: 1 };

  /** Where a point of the globe is on the screen, in CSS pixels, and how much it faces the eye. */
  function see(at: Vector3) {
    v.copy(at).applyQuaternion(globe.quaternion);
    seen.near = EYE / (EYE - v.z);
    seen.x = centre.x - window.scrollX + v.x * radius * RIM * seen.near;
    seen.y = centre.y - window.scrollY - v.y * radius * RIM * seen.near;
    seen.facing = v.z - 1 / EYE;
    return seen;
  }

  // ---- the chart -----------------------------------------------------------------------------------

  function chart(next: Chart | undefined, root?: HTMLElement | null) {
    current = next;
    namesRoot = root;
    chosen = pointed = -1;
    skillPen.uniforms.uSelected.value = skillPen.uniforms.uHovered.value = -1;
    chosenRing.visible = pointedRing.visible = false;

    sow(next?.seed ?? HOME, false);
    tween('field', 1.7, (t) => (fieldPen.uniforms.uMorph.value = t));

    for (const mesh of [skillMesh, figureMesh]) {
      if (!mesh) continue;
      globe.remove(mesh);
      mesh.geometry.dispose();
    }
    skillMesh = figureMesh = undefined;
    stars = [];
    if (next && next.stars.length > 0) {
      const rand = random(next.seed);
      const companions = next.stars.reduce((sum, star) => sum + star.companions.length, 0);
      const geometry = starGeometry(next.stars.length + companions);
      const at = geometry.getAttribute('aAt') as InstancedBufferAttribute;
      const from = geometry.getAttribute('aFrom') as InstancedBufferAttribute;
      const data = geometry.getAttribute('aData') as InstancedBufferAttribute;
      const delay = geometry.getAttribute('aDelay') as InstancedBufferAttribute;
      const figure = new Strokes(rand);
      let spot = next.stars.length;
      next.stars.forEach((star, i) => {
        const size = 3 + 4.6 * star.magnitude;
        const turnOf = i / Math.max(1, next.stars.length - 1);
        stars.push({ at: new Vector3(...star.at), size });
        at.setXYZ(i, ...star.at);
        data.setXYZW(i, size, rand(), 1, i);
        delay.setX(i, turnOf);
        for (const companion of star.companions) {
          at.setXYZ(spot, ...companion);
          data.setXYZW(spot, 2.7, rand(), 2, -9);
          delay.setX(spot, Math.min(1, turnOf + 0.15));
          figure.line(arc(star.at, companion, 0.022), turnOf, 0.6);
          spot++;
        }
      });
      (from.array as Float32Array).set(at.array as Float32Array);
      skillMesh = new Mesh(geometry, skillPen);
      skillMesh.frustumCulled = false;
      skillMesh.renderOrder = 6;
      globe.add(skillMesh);

      next.constellations.forEach((constellation, c) => {
        constellation.lines.forEach(([a, b], k) => {
          const trim = 0.03 + 0.012 * Math.max(next.stars[a].magnitude, next.stars[b].magnitude);
          figure.sketch(arc(next.stars[a].at, next.stars[b].at, trim), (c + k / constellation.lines.length) / next.constellations.length);
        });
      });
      figureMesh = new Mesh(figure.geometry(), figurePen);
      figureMesh.frustumCulled = false;
      figureMesh.renderOrder = 5;
      globe.add(figureMesh);

      tween('stars', 1.1, (t) => (skillPen.uniforms.uReveal.value = t), 0.15);
      tween('figure', 1.5, (t) => (figurePen.uniforms.uReveal.value = t), 0.45);
    }
    name();
  }

  /** Reads the names the page wrote for the stars and the constellations, and measures them. */
  function name() {
    names = [];
    if (!current || !namesRoot) return;
    const of = (selector: string) => [...namesRoot!.querySelectorAll<HTMLElement>(selector)];
    const read = (element: HTMLElement, at: Vector3, star: number) => {
      const text = (element.firstElementChild as HTMLElement | null) ?? element;
      names.push({ element, text, at, star, width: text.offsetWidth, height: text.offsetHeight, shown: '', moved: '', side: '', gap: -1 });
    };
    of('[data-star]').forEach((element, i) => {
      if (stars[i]) read(element, stars[i].at, i);
    });
    of('[data-constellation]').forEach((element, i) => {
      const constellation = current!.constellations[i];
      if (constellation) read(element, new Vector3(...constellation.at), -1);
    });
  }

  const indexOf = (id: string | undefined) => (id && current ? current.stars.findIndex((star) => star.id === id) : -1);

  function choose(id: string | undefined) {
    const next = indexOf(id);
    if (next === chosen) return;
    chosen = next;
    skillPen.uniforms.uSelected.value = chosen;
    chosenRing.visible = chosen >= 0;
    if (chosen < 0) return;
    tween('chosen', 0.5, (t) => (chosenPen.uniforms.uReveal.value = t), 0.05);
    // The shortest turn that brings the star to rest in front.
    v.copy(stars[chosen].at).applyQuaternion(turn);
    const to = new Quaternion().setFromUnitVectors(v, REST).multiply(turn);
    if (still) {
      turn.copy(to);
    } else {
      turning = { from: turn.clone(), to, time: 0, duration: clamp(0.5 + v.angleTo(REST) * 0.45, 0.6, 1.5) };
      spin.set(0, 0, 0);
    }
  }

  function point(id: string | undefined) {
    const next = indexOf(id);
    if (next === pointed) return;
    pointed = next;
    skillPen.uniforms.uHovered.value = pointed;
    pointedRing.visible = pointed >= 0 && pointed !== chosen;
    if (pointed >= 0) tween('pointed', 0.28, (t) => (pointedPen.uniforms.uReveal.value = t));
  }

  function lost(on: boolean) {
    if (on === lostOn) return;
    lostOn = on;
    if (on) {
      lostFor = 0;
      tween('lost', 0.55, (t) => {
        scribblePen.uniforms.uReveal.value = t;
        scribblePen.uniforms.uAlpha.value = 1;
      });
    } else {
      tween('lost', 0.3, (t) => (scribblePen.uniforms.uAlpha.value = 1 - t));
    }
  }

  // A canvas reads any CSS colour, whatever its notation.
  const swatch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function colour(css: string, into: Vector3) {
    if (!swatch) return;
    swatch.clearRect(0, 0, 1, 1);
    swatch.fillStyle = css.trim();
    swatch.fillRect(0, 0, 1, 1);
    const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
    into.set(r / 255, g / 255, b / 255);
  }

  function palette(next: Palette) {
    colour(next.ink, ink.value);
    colour(next.accent, accent.value);
    hatching.uniforms.uChalk.value = next.chalk ? 1 : 0;
    chalk = next.chalk;
  }

  // ---- the hand on the globe -----------------------------------------------------------------------

  /** The star under a point of the screen: the nearest one within reach, or the one whose name is there. */
  function under(x: number, y: number): number {
    let best = -1;
    let nearest = Infinity;
    const scale = skillPen.uniforms.uScale.value;
    stars.forEach((star, i) => {
      const at = see(star.at);
      if (at.facing < -0.02) return;
      const gap = Math.hypot(x - at.x, y - at.y) - star.size * scale;
      if (gap < 13 && gap < nearest) [nearest, best] = [gap, i];
    });
    if (best >= 0) return best;
    for (const label of names) {
      if (label.star < 0 || label.shown === '0') continue;
      const rect = label.text.getBoundingClientRect();
      if (x >= rect.left - 3 && x <= rect.right + 3 && y >= rect.top - 2 && y <= rect.bottom + 2) return label.star;
    }
    return -1;
  }

  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, travelled: 0, at: performance.now() };
    slot.setPointerCapture(event.pointerId);
    spin.set(0, 0, 0);
  }

  function move(event: PointerEvent) {
    if (!drag) {
      const over = under(event.clientX, event.clientY);
      slot.toggleAttribute('data-over', over >= 0);
      if (over !== pointed) events.point(over >= 0 ? current?.stars[over].id : undefined);
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.at) / 1000;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.at = now;
    drag.travelled += Math.hypot(dx, dy);
    if (drag.travelled < 4 || radius <= 0) return;
    if (!turnedOnce) {
      turnedOnce = true;
      slot.setAttribute('data-turned', '');
    }
    slot.setAttribute('data-dragging', '');
    turning = undefined;
    // The surface follows the hand: a pixel of drag is a pixel of globe.
    const angle = Math.hypot(dx, dy) / radius;
    w.set(dy, dx, 0).normalize();
    turn.premultiply(q.setFromAxisAngle(w, angle));
    spin.lerp(w.multiplyScalar(angle / elapsed), 0.6);
  }

  function up(event: PointerEvent) {
    if (!drag) return;
    const clicked = drag.travelled < 4;
    if (performance.now() - drag.at > 90 || still) spin.set(0, 0, 0);
    drag = undefined;
    touched = time;
    slot.removeAttribute('data-dragging');
    if (slot.hasPointerCapture(event.pointerId)) slot.releasePointerCapture(event.pointerId);
    if (clicked && event.type === 'pointerup') {
      const over = under(event.clientX, event.clientY);
      if (over >= 0 && current) events.choose(current.stars[over].id);
    }
  }

  function leave() {
    if (drag) return;
    slot.removeAttribute('data-over');
    if (pointed >= 0) events.point(undefined);
  }

  function track(event: PointerEvent) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.known = true;
    if (still || event.pointerType !== 'mouse') return;
    const head = trail[trail.length - 1];
    if (!head || Math.hypot(head.x - pointer.x, head.y - pointer.y) > 5) {
      trail.push({ x: pointer.x, y: pointer.y, born: time });
      if (trail.length > TRAIL) trail.shift();
    }
  }

  slot.addEventListener('pointerdown', down);
  slot.addEventListener('pointermove', move);
  slot.addEventListener('pointerup', up);
  slot.addEventListener('pointercancel', up);
  slot.addEventListener('pointerleave', leave);
  window.addEventListener('pointermove', track, { passive: true });

  // ---- every frame ---------------------------------------------------------------------------------

  function resize() {
    const nextWidth = canvas.clientWidth || window.innerWidth;
    const nextHeight = canvas.clientHeight || window.innerHeight;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1) * quality);
    if (nextWidth === width && nextHeight === height && ratio === shared.uPx.value) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    shared.uPx.value = ratio;
    shared.uViewport.value.set(width * ratio, height * ratio);
    flat.right = width;
    flat.bottom = height;
    flat.updateProjectionMatrix();
    for (const label of names) {
      label.width = label.text.offsetWidth;
      label.height = label.text.offsetHeight;
    }
  }

  /** The globe follows its slot: at once when the page scrolls, gliding when the layout changes. */
  function place(dt: number) {
    const rect = slot.getBoundingClientRect();
    box.left = rect.left;
    box.top = rect.top;
    box.right = rect.right;
    box.bottom = rect.bottom;
    const x = rect.left + rect.width / 2 + window.scrollX;
    const y = rect.top + rect.height / 2 + window.scrollY;
    const r = Math.max(24, Math.min(rect.width, rect.height) * 0.5 * FIT);
    if (!placed || still) {
      centre.set(x, y);
      radius = r;
      placed = rect.width > 0;
    } else {
      const k = 1 - Math.exp(-dt * 5.2);
      centre.x += (x - centre.x) * k;
      centre.y += (y - centre.y) * k;
      radius += (r - radius) * k;
    }
    // The eye looks straight at the globe wherever it is on the page: the view is shifted, not turned.
    const cx = centre.x - window.scrollX;
    const cy = centre.y - window.scrollY;
    const near = 0.1;
    const k = near / (EYE * radius * RIM);
    camera.projectionMatrix.makePerspective(-cx * k, (width - cx) * k, cy * k, -(height - cy) * k, near, 40);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const ratio = shared.uPx.value;
    hatching.uniforms.uCentre.value.set(cx * ratio, (height - cy) * ratio);
    const scale = clamp(radius / 230, 0.62, 1.5);
    skillPen.uniforms.uScale.value = scale;
    fieldPen.uniforms.uScale.value = clamp(radius / 250, 0.7, 1.35);
    // The shadow is drawn where the page has room for it under the globe, and not in chalk.
    const room = rect.bottom - 30 - (cy + radius * 1.5);
    const wanted = chalk ? 0 : smooth(-radius * 0.12, 0, room) * 0.55 * shadowReveal;
    shadowShown += (wanted - shadowShown) * (still ? 1 : Math.min(1, dt * 6));
    shadowing.uniforms.uAlpha.value = shadowShown;
  }

  function rotate(dt: number) {
    if (turning) {
      turning.time += dt / turning.duration;
      turn.slerpQuaternions(turning.from, turning.to, ease(Math.min(1, turning.time)));
      if (turning.time >= 1) turning = undefined;
    } else if (!drag) {
      const speed = spin.length();
      if (speed > 1e-3) {
        turn.premultiply(q.setFromAxisAngle(w.copy(spin).normalize(), speed * dt));
        spin.multiplyScalar(Math.exp(-dt * 2.6));
      }
      // With nothing charted, the sky drifts round its own axis.
      if (!current && !still && !lostOn && time - touched > 2.2) turn.multiply(q.setFromAxisAngle(Y, 0.055 * dt));
    }
    if (scan > 0.001 && !turning && !drag && !still) turn.multiply(q.setFromAxisAngle(Y, 1.1 * scan * dt));
    turn.normalize();

    // A lean towards the pointer, so the globe is never quite still under the hand.
    q.identity();
    if (pointer.known && !still && !drag && radius > 0) {
      const px = clamp((pointer.x - (centre.x - window.scrollX)) / (radius * 3.2), -1, 1);
      const py = clamp((pointer.y - (centre.y - window.scrollY)) / (radius * 3.2), -1, 1);
      q.setFromAxisAngle(X, py * 0.08).multiply(new Quaternion().setFromAxisAngle(Y, px * 0.1));
    }
    lean.slerp(q, 1 - Math.exp(-dt * 3.5));
    // What could not be scanned shakes the globe once.
    lostFor += dt;
    const shake = still ? 0 : Math.sin(lostFor * 38) * 0.055 * Math.exp(-lostFor * 5);
    q.setFromAxisAngle(Z, shake).premultiply(lean);

    globe.quaternion.copy(q).multiply(turn);
    if (!still) {
      innerTurn += dt * (0.06 + 2.8 * scan);
      outerTurn -= dt * (0.04 + 2.1 * scan);
      tumble += dt * (0.012 + 1.3 * scan);
    }
    inner.quaternion.copy(q).multiply(innerTilt).multiply(new Quaternion().setFromAxisAngle(X, tumble)).multiply(new Quaternion().setFromAxisAngle(Y, innerTurn));
    outer.quaternion.copy(q).multiply(outerTilt).multiply(new Quaternion().setFromAxisAngle(Z, -tumble * 0.7)).multiply(new Quaternion().setFromAxisAngle(Y, outerTurn));
  }

  function lasso3(mesh: Mesh, material: ShaderMaterial, star: number, reach: number, alpha: number) {
    if (!stars[star]) return;
    const at = see(stars[star].at);
    mesh.position.copy(v);
    const size = stars[star].size * skillPen.uniforms.uScale.value * 1.2 + reach;
    mesh.scale.setScalar(size / (radius * RIM * at.near));
    material.uniforms.uAlpha.value = alpha * (0.35 + 0.65 * smooth(-0.08, 0.1, at.facing));
  }

  /**
   * Writes each name beside its star: on the side away from the middle, or above the star where
   * neither side has room; inside the slot, and not over another name or the chosen star.
   */
  function label() {
    if (names.length === 0) return;
    const crowded = stars.length > 26;
    const scale = skillPen.uniforms.uScale.value;
    const taken: [number, number, number, number][] = [];
    if (stars[chosen]) {
      const at = see(stars[chosen].at);
      const reach = stars[chosen].size * scale + 13;
      if (at.facing > 0) taken.push([at.x - reach, at.y - reach, at.x + reach, at.y + reach]);
    }
    const order = [...names].sort((a, b) => rank(b) - rank(a));
    for (const item of order) {
      const at = see(item.at);
      const first = item.star >= 0 && (item.star === chosen || item.star === pointed);
      let opacity = item.star >= 0 ? smooth(-0.04, 0.22, at.facing) : smooth(0.0, 0.3, at.facing) * 0.8;
      if (crowded && !first && item.star >= 0) opacity *= smooth(0.42, 0.62, at.facing);
      // The chosen star and the one under the pointer are named even on the far side of the glass.
      if (first) opacity = Math.max(opacity, 0.72);
      let x = at.x - item.width / 2;
      let y = at.y - item.height / 2;
      let side = '';
      let gap = 0;
      let shift = 0;
      if (item.star >= 0) {
        gap = Math.round(stars[item.star].size * scale + 9);
        const fits = (left: number) => left >= box.left + 4 && left + item.width <= box.right - 4;
        side = at.x >= centre.x - window.scrollX ? 'right' : 'left';
        if (side === 'right' && !fits(at.x + gap)) side = 'left';
        if (side === 'left' && !fits(at.x - gap - item.width)) side = fits(at.x + gap) ? 'right' : 'above';
        if (side === 'above') {
          const middle = clamp(at.x, box.left + 4 + item.width / 2, Math.max(box.left + 4 + item.width / 2, box.right - 4 - item.width / 2));
          shift = Math.round(middle - at.x);
          x = middle - item.width / 2;
          y = at.y - gap - 4 - item.height;
        } else {
          x = side === 'right' ? at.x + gap : at.x - gap - item.width;
        }
      }
      if (x < box.left || x + item.width > box.right || y < box.top || y + item.height > box.bottom) opacity = 0;
      if (opacity > 0.02 && !first && taken.some(([l, t, r, b]) => x < r && x + item.width > l && y < b && y + item.height > t)) opacity = 0;
      if (opacity > 0.02) taken.push([x - 4, y - 1, x + item.width + 4, y + item.height + 1]);
      const shown = opacity <= 0.02 ? '0' : opacity.toFixed(2);
      const moved = `translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0)`;
      if (shown !== item.shown) item.element.style.opacity = item.shown = shown;
      if (moved !== item.moved) item.element.style.transform = item.moved = moved;
      if (side !== item.side) item.element.dataset.side = item.side = side;
      const room = gap * 1000 + shift;
      if (room !== item.gap) {
        item.gap = room;
        item.element.style.setProperty('--gap', `${gap}px`);
        item.element.style.setProperty('--shift', `${shift}px`);
      }
    }
  }
  const rank = (item: Name) => (item.star < 0 ? -1 : item.star === chosen ? 3 : item.star === pointed ? 2 : stars[item.star].size / 10);

  function trace() {
    while (trail.length > 0 && time - trail[0].born > LINGER) trail.shift();
    const count = trail.length;
    if (count < 2) {
      trailGeometry.setDrawRange(0, 0);
      return;
    }
    const position = trailGeometry.getAttribute('position') as Float32BufferAttribute;
    const prev = trailGeometry.getAttribute('aPrev') as Float32BufferAttribute;
    const next = trailGeometry.getAttribute('aNext') as Float32BufferAttribute;
    const params = trailGeometry.getAttribute('aParams') as Float32BufferAttribute;
    const extra = trailGeometry.getAttribute('aExtra') as Float32BufferAttribute;
    let length = 0;
    for (let i = 1; i < count; i++) length += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
    for (let i = 0; i < count; i++) {
      const here = trail[i];
      const before = trail[Math.max(0, i - 1)];
      const after = trail[Math.min(count - 1, i + 1)];
      const age = 1 - (time - here.born) / LINGER;
      for (let side = 0; side < 2; side++) {
        const k = i * 2 + side;
        position.setXYZ(k, here.x, here.y, 0);
        prev.setXYZ(k, before.x, before.y, 0);
        next.setXYZ(k, after.x, after.y, 0);
        params.setXYZW(k, side * 2 - 1, clamp(age, 0, 1) * (i / (count - 1)), length / 90, 0.37);
        extra.setXY(k, 0, 0);
      }
    }
    position.needsUpdate = prev.needsUpdate = next.needsUpdate = params.needsUpdate = extra.needsUpdate = true;
    trailGeometry.setDrawRange(0, (count - 1) * 6);
  }

  function frame(now: number) {
    if (disposed) return;
    frameRequest = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    slow = now - last > 34 && time > 2 ? slow + 1 : 0;
    if (slow > 45 && quality > 0.5) {
      quality *= 0.75;
      slow = 0;
    }
    last = now;
    time += dt;

    resize();
    place(dt);
    shared.uBoil.value = still ? 0 : Math.floor(now / 400) % 3;

    for (const [key, item] of tweens) {
      item.time += dt;
      const t = clamp((item.time - item.delay) / item.duration, 0, 1);
      item.apply(ease(t));
      if (t >= 1) tweens.delete(key);
    }

    scan += ((scanOn ? 1 : 0) - scan) * (still ? 1 : 1 - Math.exp(-dt * 4.5));
    if (!still) sweepAt += dt * 5.4 * scan;
    sweep.rotation.y = sweepAt;
    sweepPen.uniforms.uAlpha.value = scan;
    wakePen.uniforms.uAlpha.value = scan * 0.55;
    sweeping.value.set(Math.sin(sweepAt), 0, Math.cos(sweepAt), scan);
    sweepDir.value.set(Math.cos(sweepAt), 0, -Math.sin(sweepAt));
    const dimmed = lostOn ? 0.45 : 1;
    fieldPen.uniforms.uAlpha.value += (dimmed - fieldPen.uniforms.uAlpha.value) * Math.min(1, dt * 6);

    rotate(dt);
    if (chosen >= 0) lasso3(chosenRing, chosenPen, chosen, 11, 1);
    if (pointedRing.visible) lasso3(pointedRing, pointedPen, pointed, 8, 0.85);
    label();
    trace();

    if (events.aim && now - aimed > 110) {
      aimed = now;
      v.copy(Z).applyQuaternion(q.copy(turn).invert());
      events.aim((((Math.atan2(v.x, v.z) / TURN) * 24) + 24) % 24, (Math.asin(clamp(v.y, -1, 1)) * 180) / Math.PI);
    }

    renderer.clear();
    renderer.render(scene, camera);
    renderer.render(overlay, flat);
  }

  // ---- the first sketch ----------------------------------------------------------------------------

  const HOME = 0x5ca1ab1e;
  sow(HOME, true);
  hatching.uniforms.uAlpha.value = 0;
  const armature: [ShaderMaterial, number, number][] = [
    [outlinePen, 1.1, 0],
    [equatorPen, 1.2, 0.25],
    [graticulePen, 1.9, 0.35],
    [eclipticPen, 1.3, 0.7],
    [tickPen, 1.0, 1.2],
    [axisPen, 0.8, 0.9],
    [ringPen, 1.6, 0.6],
    [markPen, 1.4, 1.3],
  ];
  armature.forEach(([material, duration, delay], i) => tween(`armature${i}`, duration, (t) => (material.uniforms.uReveal.value = t), delay));
  tween('sky', 2.2, (t) => (fieldPen.uniforms.uReveal.value = t), 0.5);
  tween('shade', 1.4, (t) => {
    hatching.uniforms.uAlpha.value = t * 0.5;
    shadowReveal = t;
  }, 1.1);
  const fonts = document.fonts?.ready.then(() => {
    if (!disposed) name();
  });
  void fonts;
  frameRequest = requestAnimationFrame(frame);

  return {
    chart,
    choose,
    point,
    lost,
    palette,
    scanning(on) {
      scanOn = on;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameRequest);
      slot.removeEventListener('pointerdown', down);
      slot.removeEventListener('pointermove', move);
      slot.removeEventListener('pointerup', up);
      slot.removeEventListener('pointercancel', up);
      slot.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointermove', track);
      for (const mesh of [skillMesh, figureMesh]) mesh?.geometry.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
    },
  };
}
