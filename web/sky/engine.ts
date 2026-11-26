// The sky, drawn: a system of worlds in pen on paper, in WebGL. Every repository is a world over a
// plate, as in an orrery; the worlds that are more alike stand closer. The eye looks down on the
// system, or goes to one world and looks at its map: the lands of its directories, a place for
// every skill. Everything is drawn as drawably draws: its lines boil (three frames, 400 ms each).
// A world is solid, and hides what is behind it; a world not yet charted is all sea, pencilled in.
// The eye is wherever the page puts its slot, and glides there when the layout changes.
import {
  AddEquation,
  BufferGeometry,
  CustomBlending,
  Data3DTexture,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  OneFactor,
  OneMinusConstantAlphaFactor,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import { hash, random, type Chart, type Vec3 } from './chart.ts';
import {
  MARK_FRAGMENT,
  MARK_VERTEX,
  SHADOW_FRAGMENT,
  SHADOW_VERTEX,
  STROKE_FRAGMENT,
  STROKE_VERTEX,
  WORLD_FRAGMENT,
  WORLD_VERTEX,
} from './shaders.ts';
import { Strokes, arc, disc, ring } from './strokes.ts';
import { terrainOf } from './terrain.ts';

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const TURN = Math.PI * 2;
/** How far above the plate the eye is when it looks at the system, and when it looks at one world. */
const ABOVE = rad(40);
const LEVEL = rad(7);
/** The lens: its focal length, in heights of the page. */
const LENS = 1.3;
/** How high a world's middle floats over the plate, in its own radii. */
const FLOAT = 1.42;
/** Where a chosen place comes to rest, as the eye sees it: a little left of and above the middle. */
const REST = new Vector3(-0.1, 0.12, 1).normalize();
/** The stars of the sky behind the system: they are not skills. */
const FIELD = 520;
const MILKY = 760;
const SKY = 60;
const TRAIL = 48;
/** How long the pencil's trail takes to dry out, in seconds. */
const LINGER = 0.8;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

export type Palette = { ink: string; accent: string; wash: string; chalk: boolean };

export type WorldState = 'uncharted' | 'scanning' | 'charted' | 'lost';

/** A world, as the page knows it. */
export type WorldView = {
  key: string;
  state: WorldState;
  /** Where it stands on the plate. */
  at: [number, number];
  radius: number;
  /** How many rings it wears: one for every other folder its skills are copied into. */
  rings: number;
  /** Its places and lands, once it is charted. */
  chart?: Chart;
};

/** A line drawn between two worlds, to measure how alike they are. */
export type Thread = { a: string; b: string };

export type SkyEvents = {
  /** A place was clicked. */
  choose(id: string): void;
  /** The pointer is over a place, or over none. */
  point(id: string | undefined): void;
  /** A world was clicked or zoomed into; or, with no key, the eye was drawn back to the system. */
  visit(key: string | undefined): void;
  /** The pointer is over a world, or over none. */
  pointWorld(key: string | undefined): void;
  /**
   * What the eye looks at. Over the system: its bearing round the plate and its height above it,
   * in degrees. At a world: the longitude and latitude under the eye.
   */
  aim?(of: 'system' | 'world', across: number, up: number): void;
};

export type Sky = {
  /**
   * The worlds, the threads between them, how far the plate reaches, and the element whose
   * `[data-world]`, `[data-kin]`, `[data-place]` and `[data-land]` children name what is drawn.
   */
  system(worlds: WorldView[], threads: Thread[], rim: number, names?: HTMLElement | null): void;
  /** Goes to a world; or, with no key, back to the system. */
  visit(key: string | undefined): void;
  choose(id: string | undefined): void;
  point(id: string | undefined): void;
  pointWorld(key: string | undefined): void;
  palette(palette: Palette): void;
  dispose(): void;
};

/** A name on the page: its element is a point, at what it names; the text inside hangs to one side of it. */
type Name = { element: HTMLElement; text: HTMLElement; width: number; height: number; shown: string; moved: string; side: string; gap: number };
type PlaceName = Name & { at: Vector3; place: number };
type Tween = { time: number; duration: number; delay: number; apply(t: number): void };

type World = {
  key: string;
  state: WorldState;
  /** Its own hand: 0 to 1, from its key. */
  own: number;
  /** What turns with it: its body, its places, its roads. */
  group: Group;
  /** What always faces the eye: its outline, the scribble. */
  facing: Group;
  /** What stays level round it: its rings. */
  halo: Group;
  land: ShaderMaterial;
  texture: DataTexture;
  shadow: Mesh;
  shade: ShaderMaterial;
  outlinePen: ShaderMaterial;
  sweep: Group;
  sweepPen: ShaderMaterial;
  wakePen: ShaderMaterial;
  scribblePen: ShaderMaterial;
  markPen: ShaderMaterial;
  roadPen: ShaderMaterial;
  ringPens: ShaderMaterial[];
  rings: { group: Group; tilt: Quaternion; turned: number; rate: number }[];
  marks?: Mesh;
  roads?: Mesh;
  /** Every pen that draws it, to fade and thin them together. */
  pens: ShaderMaterial[];
  /** Everything drawn of it, and when: the body first, then what lies on it, then what is round it. */
  meshes: { mesh: Mesh; order: number }[];
  chart?: Chart;
  places: { at: Vector3; size: number }[];
  chosen: number;
  pointed: number;
  // Where it is, and how it moves.
  at: Vector3;
  velocity: Vector3;
  goal: Vector3;
  radius: number;
  radiusGoal: number;
  turn: Quaternion;
  turning?: { from: Quaternion; to: Quaternion; time: number; duration: number };
  spin: Vector3;
  rate: number;
  /** 0, not there, to 1, there: it is drawn in when it comes, and fades when it goes. */
  presence: number;
  gone: boolean;
  /** How much the eye is with it. */
  with: number;
  scanning: boolean;
  scan: number;
  sweepAt: number;
  lostFor: number;
  // As the eye sees it: the middle of it on the screen and its radius, in CSS pixels; how far it is.
  x: number;
  y: number;
  size: number;
  depth: number;
  alpha: number;
};

type Line = { a: string; b: string; mesh: Mesh; pen: ShaderMaterial; shown: number; name?: Name };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (low: number, high: number, x: number) => {
  const t = clamp((x - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Whether WebGL is drawn by the processor, not by a graphics card: the browser names what draws it. */
function drawnInSoftware(): boolean {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) return false;
  const names = probe.getExtension('WEBGL_debug_renderer_info');
  const drawnBy = String(names ? probe.getParameter(names.UNMASKED_RENDERER_WEBGL) : probe.getParameter(probe.RENDERER));
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  return /swiftshader|llvmpipe|software|basic render/i.test(drawnBy);
}

export function createSky(canvas: HTMLCanvasElement, slot: HTMLElement, events: SkyEvents): Sky {
  // Where there is no graphics card, edges are not smoothed again: the pen smooths its own lines,
  // and smoothing every edge a second time is what such a machine can least afford.
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: !drawnInSoftware(), premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  canvas.dataset.motion = still ? 'still' : 'boiling';
  canvas.dataset.frame = '0'; // which of the boil's three frames is drawn, as drawably's --drawably-frame
  canvas.dataset.view = 'system';
  const root = canvas.parentElement;

  const scene = new Scene();
  const camera = new PerspectiveCamera();

  // ---- the pen -----------------------------------------------------------------------------------

  // The hand's unsteadiness: a block of noise, 32 numbers a side, four noises deep, that repeats.
  const noise = new Data3DTexture(new Uint8Array(32 * 32 * 32 * 4), 32, 32, 32);
  {
    const rand = random(0x0b1e55ed);
    const data = noise.image.data as Uint8Array;
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  }
  noise.magFilter = noise.minFilter = LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = RepeatWrapping;
  noise.unpackAlignment = 1;
  noise.needsUpdate = true;

  const shared = {
    uViewport: { value: new Vector2(1, 1) },
    uPx: { value: 1 },
    uBoil: { value: 0 },
    uNoise: { value: noise },
  };
  const ink = { value: new Vector3(0.11, 0.18, 0.54) };
  const accent = { value: new Vector3(0.89, 0.25, 0.17) };
  const wash = { value: new Vector3(1, 0.76, 0.1) };
  const chalk = { value: 0 };
  const light = { value: new Vector3(-0.62, 0.7, 0.3).normalize() };
  const materials = new Set<ShaderMaterial>();
  const geometries: BufferGeometry[] = [];

  type Pen = {
    accent?: boolean;
    width: number;
    alpha?: number;
    wobble?: number;
    freq?: number;
    taper?: number;
    /** Its points are on a sphere: the far side is told by the surface. */
    sphere?: boolean;
    back?: number;
    broken?: boolean;
    dash?: number;
    dry?: number;
    stagger?: number;
    fade?: boolean;
    /** It is hidden by the worlds in front of it. */
    hidden?: boolean;
    own?: number;
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
        uOwn: { value: o.own ?? 0 },
      },
      transparent: true,
      depthTest: Boolean(o.hidden),
      depthWrite: false,
      premultipliedAlpha: true,
      side: DoubleSide,
    });
    material.userData = { width: o.width, alpha: o.alpha ?? 1 };
    materials.add(material);
    return material;
  }

  function mark(back: number): ShaderMaterial {
    const material = new ShaderMaterial({
      vertexShader: MARK_VERTEX,
      fragmentShader: MARK_FRAGMENT,
      uniforms: {
        ...shared,
        uInk: ink,
        uAccent: accent,
        uSweep: { value: new Vector4(0, 0, 1, 0) },
        uSweepDir: { value: new Vector3(1, 0, 0) },
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
    materials.add(material);
    return material;
  }

  function markGeometry(count: number): InstancedBufferGeometry {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('aAt', new InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aData', new InstancedBufferAttribute(new Float32Array(count * 4), 4));
    geometry.setAttribute('aDelay', new InstancedBufferAttribute(new Float32Array(count), 1));
    geometry.instanceCount = count;
    return geometry;
  }

  function drawn(geometry: BufferGeometry, material: ShaderMaterial, parent: Group | Scene, order = 0): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    parent.add(mesh);
    return mesh;
  }

  /** What every world is drawn from: one sketch of each, by a fresh hand on every mount, like drawably's. */
  const hand = random((Math.random() * 2 ** 32) >>> 0);
  const keep = (strokes: Strokes) => {
    const geometry = strokes.geometry();
    geometries.push(geometry);
    return geometry;
  };
  const half = (trail: number) =>
    Array.from({ length: 61 }, (_, i): Vec3 => {
      const a = -Math.PI / 2 + (Math.PI * i) / 60;
      return [Math.cos(a) * Math.cos(trail), Math.sin(a), Math.cos(a) * Math.sin(trail)];
    });
  const sketches = {
    outline: keep(new Strokes(hand).loop(disc(1, 0, 144), 0)),
    sweep: keep(new Strokes(hand).sketch(half(0))),
    wake: keep(new Strokes(hand).line(half(0.09)).line(half(0.2)).line(half(0.34))),
    // The red pencil, for what could not be scanned: a scribble across the world.
    scribble: (() => {
      const points: Vec3[] = [];
      const lean = -0.42;
      for (let i = 0; i <= 220; i++) {
        const t = i / 220;
        const x = -0.86 + 1.72 * t;
        const y = 0.6 * Math.asin(Math.sin(t * TURN * 5.5)) * (2 / Math.PI) * (0.7 + 0.3 * Math.sin(t * 9));
        points.push([x * Math.cos(lean) - y * Math.sin(lean), x * Math.sin(lean) + y * Math.cos(lean), 0]);
      }
      return keep(new Strokes(hand).line(points, 0, 1.4));
    })(),
    // The rings a world wears: two lines, graduated, with a bead on each so its turning shows.
    rings: [1.34, 1.52, 1.7].map((radius, i) => {
      const band = 0.05 - i * 0.008;
      const marks = 36 + i * 18;
      const lines = new Strokes(hand).loop(ring(radius, 0, 160), 0).loop(ring(radius + band, 0, 160), 0.3, 1);
      lines.loop((start, sweep) => ring(0.034, 0, 20)(start, sweep).map(([x, , z]): Vec3 => [radius + band / 2 + x, z, 0]), 0.9);
      const graduations = new Strokes(hand);
      for (let k = 0; k < marks; k++) {
        const a = (k * TURN) / marks;
        const reach = k % 3 === 0 ? band : band * 0.5;
        graduations.line([0, 0.5, 1].map((t): Vec3 => [(radius + reach * t) * Math.cos(a), 0, (radius + reach * t) * Math.sin(a)]), k / marks);
      }
      return { lines: keep(lines), graduations: keep(graduations) };
    }),
    thread: keep(new Strokes(hand).line(Array.from({ length: 25 }, (_, i): Vec3 => [i / 24, 0, 0]))),
    lasso: keep(new Strokes(hand).loop(disc(1, 0, 48), 0, 2)),
    ball: new SphereGeometry(1, 64, 40),
    sheet: new PlaneGeometry(2, 2),
  };
  geometries.push(sketches.ball, sketches.sheet);

  // ---- the sky behind: stars that are not skills, and a milky way of stipple -----------------------

  const fieldPen = mark(1);
  const fieldGeometry = markGeometry(FIELD + MILKY);
  geometries.push(fieldGeometry);
  {
    const rand = random(0x5ca1ab1e);
    const at = fieldGeometry.getAttribute('aAt') as InstancedBufferAttribute;
    const data = fieldGeometry.getAttribute('aData') as InstancedBufferAttribute;
    const delay = fieldGeometry.getAttribute('aDelay') as InstancedBufferAttribute;
    // The milky way lies along a great circle: `pole` is its pole, `a` and `b` two points of it a quarter turn apart.
    const pole = new Vector3(0.35, 0.78, 0.52).normalize();
    const a = new Vector3(pole.y, -pole.x, 0).normalize();
    const b = new Vector3().crossVectors(pole, a);
    const point = new Vector3();
    for (let i = 0; i < FIELD + MILKY; i++) {
      let size: number;
      if (i < FIELD) {
        const y = 1 - 2 * rand();
        const turn = rand() * TURN;
        const r = Math.sqrt(1 - y * y);
        point.set(r * Math.cos(turn), y, r * Math.sin(turn));
        size = 0.5 + 1.7 * Math.pow(rand(), 3.4);
      } else {
        // Thicker in clumps: three throws make the spread a bell.
        const along = rand() * TURN;
        const clump = 0.55 + 0.45 * Math.sin(along * 3 + 1.3) * Math.sin(along * 1.7);
        const off = (rand() + rand() + rand() - 1.5) * 0.3 * clump;
        point.set(0, 0, 0).addScaledVector(a, Math.cos(along)).addScaledVector(b, Math.sin(along)).addScaledVector(pole, off).normalize();
        size = 0.4 + 0.5 * rand();
      }
      at.setXYZ(i, point.x, point.y, point.z);
      data.setXYZW(i, size, rand(), 0, -9);
      delay.setX(i, rand());
    }
  }
  const field = drawn(fieldGeometry, fieldPen, scene, 1);
  field.scale.setScalar(SKY);

  // Now and then a star falls: a quick stroke across the sky, gone as soon as it is drawn.
  const falling = new Group();
  falling.scale.setScalar(SKY);
  scene.add(falling);
  const fallPen = pen({ width: 1.7, alpha: 0, taper: 0.3, wobble: 0.004, dry: 0.3, fade: true });
  fallPen.uniforms.uReveal.value = 0;
  drawn(keep(new Strokes(hand).line(ring(1, 0, 40)(0, 0.5))), fallPen, falling, 2);
  let nextFall = 7;

  // ---- the plate the worlds stand over: an orrery's, graduated round its rim -----------------------

  const plate = new Group();
  scene.add(plate);
  const platePen = pen({ width: 1.5, alpha: 0.85, wobble: 0.01, freq: 1.6, taper: 0.01, stagger: 0.4 });
  const plateMarkPen = pen({ width: 1.2, alpha: 0.75, wobble: 0.003, taper: 0.3, stagger: 0.9 });
  const plateFinePen = pen({ width: 1, alpha: 0.42, wobble: 0.008, freq: 1.6, taper: 0.01, dash: 30, stagger: 0.6 });
  const platePens = [platePen, plateMarkPen, plateFinePen];
  {
    drawn(keep(new Strokes(hand).loop(ring(1, 0, 200), 0).loop(ring(1.05, 0, 200), 0.2, 1)), platePen, plate, 10);
    const marks = new Strokes(hand);
    for (let i = 0; i < 120; i++) {
      const a = (i * TURN) / 120;
      const reach = i % 10 === 0 ? 0.05 : i % 5 === 0 ? 0.034 : 0.02;
      marks.line([0, 0.5, 1].map((t): Vec3 => [(1 + reach * t) * Math.cos(a), 0, (1 + reach * t) * Math.sin(a)]), i / 120);
    }
    // The four winds, outside the rim, and a cross where the middle is.
    for (let i = 0; i < 4; i++) {
      const a = (i * TURN) / 4;
      marks.line([0, 0.5, 1].map((t): Vec3 => [(1.05 + 0.07 * t) * Math.cos(a), 0, (1.05 + 0.07 * t) * Math.sin(a)]), 1);
      marks.line([0, 0.5, 1].map((t): Vec3 => [0.05 * t * Math.cos(a), 0, 0.05 * t * Math.sin(a)]), 1);
    }
    drawn(keep(marks), plateMarkPen, plate, 10);
    drawn(keep(new Strokes(hand).line(ring(0.34, 0, 120)(0, TURN), 0.3).line(ring(0.67, 0, 160)(0, TURN), 0.5)), plateFinePen, plate, 10);
  }
  let rim = 1;
  let rimGoal = 1;
  /** How far from the middle of the plate the eye must see: to the furthest world, and its edge. */
  let span = 1;
  let spanGoal = 1;

  // ---- the threads between worlds: pencil, to measure how alike they are ---------------------------

  let lines: Line[] = [];

  // ---- over everything: the rings a pen draws round what is chosen or pointed at, and the trail -----

  const overlay = new Scene();
  const flat = new OrthographicCamera(0, 1, 0, 1, -1, 1);
  const lasso = (material: ShaderMaterial) => {
    const mesh = drawn(sketches.lasso, material, overlay, 8);
    mesh.visible = false;
    return mesh;
  };
  const chosenPen = pen({ accent: true, width: 2.1, wobble: 0.09, freq: 1.3, taper: 0.06, dry: 0.5 });
  const pointedPen = pen({ width: 1.3, wobble: 0.08, freq: 1.3, taper: 0.06, alpha: 0.85 });
  const worldPen = pen({ accent: true, width: 1.8, wobble: 0.035, freq: 1.3, taper: 0.06, dry: 0.5 });
  const chosenRing = lasso(chosenPen);
  const pointedRing = lasso(pointedPen);
  const worldRing = lasso(worldPen);

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
  drawn(trailGeometry, trailPen, overlay, 1);
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

  // The stage: the middle of the slot, in page coordinates, and its size, all in CSS pixels.
  const stage = { x: 0, y: 0, w: 0, h: 0, bleed: 0.9, placed: false };
  const box = { left: 0, top: 0, right: 0, bottom: 0 };

  // The eye: how it is turned about the plate, and how far it has gone from the system (0) to a world (1).
  const eye = { yaw: 0, sway: 0, pitch: ABOVE, zoom: 0, speed: 0, goal: 0, drift: 0, focal: 1000, x: 0, y: 0, with: 0 };
  /** The world the eye goes to, or was last at. */
  let target: World | undefined;
  /** From one world straight to another: the eye draws back on the way. */
  let transit: { from: Vector3; time: number; dip: number } | undefined;
  /** The wheel is turning: the eye follows it, and settles when it stops. */
  let wheeling: { at: number; by: number } | undefined;
  /** The world the page shows: what the eye was last told to visit. */
  let shown: string | undefined;

  const worlds = new Map<string, World>();
  let order: World[] = [];
  let namesRoot: HTMLElement | null | undefined;
  let worldNames = new Map<string, Name>();
  let placeNames: PlaceName[] = [];
  let pointedWorld: World | undefined;

  const pointer = { x: 0, y: 0, known: false };
  let drag: { x: number; y: number; travelled: number; at: number; turns: boolean } | undefined;
  /** Where the pointer is over the slot, if it is. */
  let hover: { x: number; y: number } | undefined;
  let coasting = false;
  let touched = -10;
  let orbit = 0;
  let aimed = 0;
  let turnedOnce = false;
  let resting = false;
  let first = true;

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
  const u = new Vector3();
  const look = new Vector3();
  const toEye = new Vector3();
  const seen = { x: 0, y: 0, depth: 1 };

  /** Where a point of the scene is on the screen, in CSS pixels, and how far in front of the eye. */
  function see(at: Vector3) {
    u.copy(at).applyMatrix4(camera.matrixWorldInverse);
    seen.depth = Math.max(1e-4, -u.z);
    seen.x = eye.x + (eye.focal * u.x) / seen.depth;
    seen.y = eye.y - (eye.focal * u.y) / seen.depth;
    return seen;
  }

  const placed = { x: 0, y: 0, facing: 0 };
  /** Where a place of a world is on the screen, and how much it faces the eye. */
  function seePlace(world: World, at: Vector3) {
    w.copy(at).applyQuaternion(world.group.quaternion);
    toEye.copy(camera.position).sub(world.group.position).addScaledVector(w, -world.radius);
    placed.facing = w.dot(toEye.normalize());
    w.multiplyScalar(world.radius).add(world.group.position);
    const on = see(w);
    placed.x = on.x;
    placed.y = on.y;
    return placed;
  }

  // ---- a world -------------------------------------------------------------------------------------

  function make(view: WorldView): World {
    const own = hash(view.key) / 4294967296;
    const group = new Group();
    const facing = new Group();
    const halo = new Group();
    scene.add(group, facing, halo);
    const pens: ShaderMaterial[] = [];
    const meshes: { mesh: Mesh; order: number }[] = [];
    const held = (material: ShaderMaterial) => {
      pens.push(material);
      return material;
    };
    const put = (geometry: BufferGeometry, material: ShaderMaterial, parent: Group, at: number) => {
      meshes.push({ mesh: drawn(geometry, material, parent), order: at });
    };

    const texture = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    texture.needsUpdate = true;
    const land = new ShaderMaterial({
      vertexShader: WORLD_VERTEX,
      fragmentShader: WORLD_FRAGMENT,
      uniforms: {
        uTerrain: { value: texture },
        uInk: ink,
        uWash: wash,
        uLight: light,
        uCentre: { value: new Vector2() },
        ...shared,
        uRadius: { value: 100 },
        uCharted: { value: 0 },
        uKnown: { value: 0 },
        uOwn: { value: own },
        uAlpha: { value: 1 },
        uChalk: chalk,
      },
      // It is drawn in its turn, among the pens; and it takes the place of what is behind it.
      transparent: true,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusConstantAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusConstantAlphaFactor,
      depthTest: true,
      depthWrite: true,
      premultipliedAlpha: true,
      side: FrontSide,
    });
    land.blendAlpha = 1;
    materials.add(land);
    put(sketches.ball, land, group, 0);

    const shade = new ShaderMaterial({
      vertexShader: SHADOW_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      uniforms: { ...shared, uColor: ink, uCentre: { value: new Vector2() }, uAlpha: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      side: DoubleSide,
    });
    materials.add(shade);
    const shadow = drawn(sketches.sheet, shade, scene, 30);

    // Not yet charted, its outline is broken: it is known to be there, and no more.
    const outlinePen = held(pen({ width: 2.1, wobble: 0.016, freq: 1.8, taper: 0.03, dash: 26, own }));
    put(sketches.outline, outlinePen, facing, 4);

    // The sweep: a meridian that goes round while a scan runs; the places it passes flare.
    const sweep = new Group();
    group.add(sweep);
    const sweepPen = held(pen({ accent: true, width: 2.6, alpha: 0, sphere: true, back: 0.4, taper: 0.2, wobble: 0.01, own }));
    put(sketches.sweep, sweepPen, sweep, 5);
    const wakePen = held(pen({ accent: true, width: 1.3, alpha: 0, sphere: true, back: 0.3, taper: 0.3, wobble: 0.012, dry: 0.8, own }));
    put(sketches.wake, wakePen, sweep, 5);

    const scribblePen = held(pen({ accent: true, width: 3.2, alpha: 0, wobble: 0.03, freq: 3.5, dry: 0.8, taper: 0.01, own }));
    scribblePen.uniforms.uReveal.value = 0;
    put(sketches.scribble, scribblePen, facing, 8);

    const markPen = mark(0);
    const roadPen = held(pen({ width: 1.2, alpha: 0.8, sphere: true, back: 0, dash: 46, stagger: 0.7, wobble: 0.008, taper: 0.1, own }));

    const world: World = {
      key: view.key,
      state: 'uncharted',
      own,
      group,
      facing,
      halo,
      land,
      texture,
      shadow,
      shade,
      outlinePen,
      sweep,
      sweepPen,
      wakePen,
      scribblePen,
      markPen,
      roadPen,
      ringPens: [],
      rings: [],
      pens,
      meshes,
      places: [],
      chosen: -1,
      pointed: -1,
      at: new Vector3(view.at[0], 0, view.at[1]),
      velocity: new Vector3(),
      goal: new Vector3(view.at[0], 0, view.at[1]),
      radius: view.radius,
      radiusGoal: view.radius,
      turn: new Quaternion().setFromAxisAngle(X, 0.3).multiply(new Quaternion().setFromAxisAngle(Y, own * TURN)),
      spin: new Vector3(),
      rate: 0.05 + 0.05 * own,
      presence: 0,
      gone: false,
      with: 0,
      scanning: false,
      scan: 0,
      sweepAt: own * TURN,
      lostFor: 9,
      x: 0,
      y: 0,
      size: 1,
      depth: 1,
      alpha: 0,
    };
    // It is drawn in: its outline first, then its sea.
    tween(`${view.key}:outline`, 0.9, (t) => (outlinePen.uniforms.uReveal.value = t), 0.1 + own * 0.5);
    tween(`${view.key}:presence`, 1.1, (t) => (world.presence = t), own * 0.5);
    return world;
  }

  /** The rings it wears, one for every other folder its skills are copied into. */
  function ringed(world: World, count: number) {
    count = Math.min(count, sketches.rings.length);
    if (world.rings.length === count) return;
    for (const { group } of world.rings) world.halo.remove(group);
    world.meshes = world.meshes.filter(({ mesh }) => !world.rings.some(({ group }) => group === mesh.parent));
    world.pens = world.pens.filter((material) => !world.ringPens.includes(material));
    for (const material of world.ringPens) {
      materials.delete(material);
      material.dispose();
    }
    world.ringPens = [];
    world.rings = [];
    for (let i = 0; i < count; i++) {
      const group = new Group();
      world.halo.add(group);
      const linePen = pen({ width: 1.4, alpha: 0.9, back: 0.5, wobble: 0.012, freq: 1.6, taper: 0.01, stagger: 0.4, hidden: true, own: world.own + i });
      const markingPen = pen({ width: 1.15, alpha: 0.8, back: 0.45, wobble: 0.004, taper: 0.3, stagger: 0.9, hidden: true, own: world.own + i });
      world.ringPens.push(linePen, markingPen);
      world.pens.push(linePen, markingPen);
      world.meshes.push({ mesh: drawn(sketches.rings[i].lines, linePen, group), order: 6 });
      world.meshes.push({ mesh: drawn(sketches.rings[i].graduations, markingPen, group), order: 6 });
      const lean = (world.own * 7 + i * 2.1) % TURN;
      const tilt = new Quaternion().setFromAxisAngle(new Vector3(Math.cos(lean), 0, Math.sin(lean)), 0.3 + 0.13 * i);
      world.rings.push({ group, tilt, turned: world.own * TURN, rate: (i % 2 ? -1 : 1) * (0.07 + 0.03 * i) });
      tween(`${world.key}:ring${i}`, 1.4, (t) => (linePen.uniforms.uReveal.value = markingPen.uniforms.uReveal.value = t), 0.5 + i * 0.25);
    }
  }

  /** Its map: the terrain its places raise, a mark for each place and each copy, the roads that join them. */
  function chartWorld(world: World, chart: Chart | undefined) {
    world.chart = chart;
    world.chosen = world.pointed = -1;
    world.markPen.uniforms.uSelected.value = world.markPen.uniforms.uHovered.value = -1;
    for (const mesh of [world.marks, world.roads]) {
      if (!mesh) continue;
      world.group.remove(mesh);
      mesh.geometry.dispose();
    }
    world.meshes = world.meshes.filter(({ mesh }) => mesh !== world.marks && mesh !== world.roads);
    world.marks = world.roads = undefined;
    world.places = [];
    if (!chart) return;

    const terrain = terrainOf(chart);
    world.texture.dispose();
    world.texture = new DataTexture(terrain.data, terrain.width, terrain.height);
    world.texture.magFilter = world.texture.minFilter = LinearFilter;
    world.texture.wrapS = RepeatWrapping;
    world.texture.needsUpdate = true;
    world.land.uniforms.uTerrain.value = world.texture;

    if (chart.places.length > 0) {
      const rand = random(chart.seed);
      const copies = chart.places.reduce((sum, place) => sum + place.copies.length, 0);
      const geometry = markGeometry(chart.places.length + copies);
      const at = geometry.getAttribute('aAt') as InstancedBufferAttribute;
      const data = geometry.getAttribute('aData') as InstancedBufferAttribute;
      const delay = geometry.getAttribute('aDelay') as InstancedBufferAttribute;
      const roads = new Strokes(rand);
      let spot = chart.places.length;
      chart.places.forEach((place, i) => {
        const size = 3.2 + 4.4 * place.height;
        const turnOf = i / Math.max(1, chart.places.length - 1);
        world.places.push({ at: new Vector3(...place.at), size });
        at.setXYZ(i, ...place.at);
        data.setXYZW(i, size, rand(), 1, i);
        delay.setX(i, turnOf);
        for (const copy of place.copies) {
          at.setXYZ(spot, ...copy);
          data.setXYZW(spot, 2.7, rand(), 2, -9);
          delay.setX(spot, Math.min(1, turnOf + 0.15));
          roads.line(arc(place.at, copy, 0.022), turnOf, 0.6);
          spot++;
        }
      });
      world.marks = drawn(geometry, world.markPen, world.group);
      world.meshes.push({ mesh: world.marks, order: 3 });

      chart.lands.forEach((land, c) => {
        land.roads.forEach(([a, b], k) => {
          const trim = 0.035 + 0.012 * Math.max(chart.places[a].height, chart.places[b].height);
          roads.line(arc(chart.places[a].at, chart.places[b].at, trim), (c + k / land.roads.length) / chart.lands.length);
        });
      });
      world.roads = drawn(roads.geometry(), world.roadPen, world.group);
      world.meshes.push({ mesh: world.roads, order: 2 });
    }

    // Its lands face the eye, and stay in sight as it turns: they lie about the pole that leans to it.
    const up = Math.sin(rad(56));
    const out = Math.cos(rad(56));
    v.set(Math.sin(eye.yaw) * out, up, Math.cos(eye.yaw) * out);
    world.turn.setFromUnitVectors(w.set(...chart.middle), v);
    world.turning = undefined;
    world.spin.set(0, 0, 0);

    // Charted, it is inked in: the outline closes, and the lands rise out of the sea about their places.
    world.outlinePen.uniforms.uDash.value = 0;
    const known = world.land.uniforms.uKnown.value as number;
    tween(`${world.key}:known`, 0.8, (t) => (world.land.uniforms.uKnown.value = lerp(known, 1, t)));
    tween(`${world.key}:charted`, 1.7, (t) => (world.land.uniforms.uCharted.value = t), 0.1);
    tween(`${world.key}:marks`, 1.1, (t) => (world.markPen.uniforms.uReveal.value = t), 0.7);
    tween(`${world.key}:roads`, 1.5, (t) => (world.roadPen.uniforms.uReveal.value = t), 1.0);
  }

  function lost(world: World, on: boolean) {
    if (on === (world.state === 'lost')) return;
    if (on) {
      world.lostFor = 0;
      tween(`${world.key}:lost`, 0.55, (t) => {
        world.scribblePen.uniforms.uReveal.value = t;
        world.scribblePen.userData.alpha = 1;
      });
    } else {
      tween(`${world.key}:lost`, 0.3, (t) => (world.scribblePen.userData.alpha = 1 - t));
    }
  }

  function retire(world: World) {
    if (world.gone) return;
    world.gone = true;
    const from = world.presence;
    tween(`${world.key}:presence`, 0.45, (t) => {
      world.presence = from * (1 - t);
      if (t >= 1) remove(world);
    });
  }

  function remove(world: World) {
    if (worlds.get(world.key) === world) worlds.delete(world.key);
    scene.remove(world.group, world.facing, world.halo, world.shadow);
    for (const mesh of [world.marks, world.roads]) mesh?.geometry.dispose();
    world.texture.dispose();
    for (const material of [...world.pens, world.land, world.shade, world.markPen]) {
      materials.delete(material);
      material.dispose();
    }
    if (target === world) target = undefined;
    if (pointedWorld === world) pointedWorld = undefined;
  }

  // ---- what the page tells the sky -----------------------------------------------------------------

  function system(views: WorldView[], threads: Thread[], reach: number, names?: HTMLElement | null) {
    const here = new Set<string>();
    for (const view of views) {
      here.add(view.key);
      let world = worlds.get(view.key);
      if (!world || world.gone) {
        if (world) remove(world);
        world = make(view);
        worlds.set(view.key, world);
      }
      world.goal.set(view.at[0], 0, view.at[1]);
      world.radiusGoal = view.radius;
      if (still) {
        world.at.copy(world.goal);
        world.radius = view.radius;
      }
      if (view.chart !== world.chart) chartWorld(world, view.chart);
      ringed(world, view.chart ? view.rings : 0);
      lost(world, view.state === 'lost');
      world.scanning = view.state === 'scanning';
      world.state = view.state;
    }
    for (const world of [...worlds.values()]) if (!here.has(world.key)) retire(world);
    rimGoal = reach;
    spanGoal = 0.2;
    for (const view of views) spanGoal = Math.max(spanGoal, Math.hypot(view.at[0], view.at[1]) + view.radius * 1.5);
    if (still || first) [rim, span] = [rimGoal, spanGoal];
    first = false;

    const kept = new Map(lines.map((line) => [`${line.a}|${line.b}`, line]));
    lines = threads.map(({ a, b }) => {
      const known = kept.get(`${a}|${b}`);
      if (known) {
        kept.delete(`${a}|${b}`);
        return known;
      }
      const material = pen({ width: 1.1, alpha: 0.7, wobble: 0.006, freq: 3, taper: 0.03, dash: 40, dry: 0.7, own: hash(a + b) / 4294967296 });
      const mesh = drawn(sketches.thread, material, scene, 20);
      tween(`thread:${a}|${b}`, 0.8, (t) => (material.uniforms.uReveal.value = t), 0.5);
      return { a, b, mesh, pen: material, shown: 0 };
    });
    for (const line of kept.values()) {
      scene.remove(line.mesh);
      materials.delete(line.pen);
      line.pen.dispose();
    }
    if (target && (target.gone || worlds.get(target.key) !== target)) target = undefined;
    namesRoot = names;
    name();
    repoint();
  }

  /** Reads the names the page wrote for the worlds, the threads, the places and the lands, and measures them. */
  function name() {
    worldNames = new Map();
    placeNames = [];
    for (const line of lines) line.name = undefined;
    if (!namesRoot) return;
    const read = (element: HTMLElement): Name => {
      const text = (element.firstElementChild as HTMLElement | null) ?? element;
      return { element, text, width: text.offsetWidth, height: text.offsetHeight, shown: '', moved: '', side: '', gap: -1 };
    };
    for (const element of namesRoot.querySelectorAll<HTMLElement>('[data-world]')) worldNames.set(element.dataset.world!, read(element));
    for (const element of namesRoot.querySelectorAll<HTMLElement>('[data-kin]')) {
      const line = lines.find(({ a, b }) => `${a}|${b}` === element.dataset.kin);
      if (line) line.name = read(element);
    }
    const world = shown ? worlds.get(shown) : undefined;
    if (!world?.chart) return;
    [...namesRoot.querySelectorAll<HTMLElement>('[data-place]')].forEach((element, i) => {
      if (world.places[i]) placeNames.push({ ...read(element), at: world.places[i].at, place: i });
    });
    [...namesRoot.querySelectorAll<HTMLElement>('[data-land]')].forEach((element, i) => {
      const land = world.chart!.lands[i];
      if (land) placeNames.push({ ...read(element), at: new Vector3(...land.at), place: -1 });
    });
  }

  /** How much room each name takes on the page, as it is written now. */
  function measure() {
    for (const label of [...worldNames.values(), ...placeNames, ...lines.flatMap((line) => (line.name ? [line.name] : []))]) {
      label.width = label.text.offsetWidth;
      label.height = label.text.offsetHeight;
    }
  }

  function owner(id: string | undefined): [World, number] | undefined {
    if (!id) return undefined;
    for (const world of worlds.values()) {
      const index = world.chart?.places.findIndex((place) => place.id === id) ?? -1;
      if (index >= 0) return [world, index];
    }
    return undefined;
  }

  /** Where a chosen place comes to rest, in the scene: a little left of and above the middle of what the eye will see. */
  function rest(): Vector3 {
    const [across, up] = [Math.cos(LEVEL), Math.sin(LEVEL)];
    const forward = new Vector3(Math.sin(eye.yaw) * across, up, Math.cos(eye.yaw) * across);
    const right = new Vector3(Math.cos(eye.yaw), 0, -Math.sin(eye.yaw));
    const above = new Vector3().crossVectors(forward, right);
    return new Vector3().addScaledVector(right, REST.x).addScaledVector(above, REST.y).addScaledVector(forward, REST.z).normalize();
  }

  /** Turns a world so that its chosen place faces the eye: the shortest turn that brings it to rest. */
  function settle(world: World) {
    const place = world.places[world.chosen];
    if (!place) return;
    const now = new Vector3().copy(place.at).applyQuaternion(world.turn);
    const to = rest();
    const turned = new Quaternion().setFromUnitVectors(now, to).multiply(world.turn);
    world.spin.set(0, 0, 0);
    if (still) {
      world.turn.copy(turned);
      world.turning = undefined;
    } else {
      world.turning = { from: world.turn.clone(), to: turned, time: 0, duration: clamp(0.5 + now.angleTo(to) * 0.45, 0.6, 1.5) };
    }
  }

  function choose(id: string | undefined) {
    const found = owner(id);
    for (const world of worlds.values()) {
      const next = found?.[0] === world ? found[1] : -1;
      if (next === world.chosen) continue;
      world.chosen = next;
      world.markPen.uniforms.uSelected.value = next;
      if (next < 0) continue;
      tween('chosen', 0.5, (t) => (chosenPen.uniforms.uReveal.value = t), 0.05);
      settle(world);
    }
    measure(); // the chosen name is written larger
  }

  function point(id: string | undefined) {
    const found = owner(id);
    for (const world of worlds.values()) {
      const next = found?.[0] === world ? found[1] : -1;
      if (next === world.pointed) continue;
      world.pointed = next;
      world.markPen.uniforms.uHovered.value = next;
      if (next >= 0) tween('pointed', 0.28, (t) => (pointedPen.uniforms.uReveal.value = t));
    }
  }

  function pointWorld(key: string | undefined) {
    const next = key ? worlds.get(key) : undefined;
    if (next === pointedWorld) return;
    pointedWorld = next;
    if (next) tween('world', 0.4, (t) => (worldPen.uniforms.uReveal.value = t));
  }

  function visit(key: string | undefined) {
    shown = key;
    wheeling = undefined;
    const next = key ? worlds.get(key) : undefined;
    if (next) {
      if (target && target !== next && eye.zoom > 0.4 && !still) {
        const from = new Vector3(target.at.x, target.radius * FLOAT, target.at.z);
        const away = Math.hypot(next.at.x - target.at.x, next.at.z - target.at.z);
        transit = { from, time: 0, dip: clamp(away * 0.7, 0.3, 0.72) };
      }
      target = next;
      eye.goal = 1;
      settle(next);
    } else {
      eye.goal = 0;
    }
    if (still) {
      eye.zoom = eye.goal;
      eye.speed = 0;
    }
    name();
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
    colour(next.wash, wash.value);
    chalk.value = next.chalk ? 1 : 0;
  }

  // ---- the hand on the sky -------------------------------------------------------------------------

  /** The eye is with the world the page shows: its places can be pointed at and chosen, and it can be turned. */
  const close = () => eye.zoom > 0.6 && target !== undefined && target.key === shown;

  /** The place under a point of the screen: the nearest one within reach, or the one whose name is there. */
  function placeUnder(x: number, y: number): number {
    if (!close() || !target) return -1;
    const world = target;
    let best = -1;
    let nearest = Infinity;
    const scale = world.markPen.uniforms.uScale.value;
    world.places.forEach((place, i) => {
      const at = seePlace(world, place.at);
      if (at.facing < 0.02) return;
      const gap = Math.hypot(x - at.x, y - at.y) - place.size * scale;
      if (gap < 13 && gap < nearest) [nearest, best] = [gap, i];
    });
    if (best >= 0) return best;
    for (const label of placeNames) {
      if (label.place < 0 || label.shown === '0' || label.shown === '') continue;
      const rect = label.text.getBoundingClientRect();
      if (x >= rect.left - 3 && x <= rect.right + 3 && y >= rect.top - 2 && y <= rect.bottom + 2) return label.place;
    }
    return -1;
  }

  /** The world under a point of the screen: the nearest to the eye, or the one whose name is there. */
  function worldUnder(x: number, y: number): World | undefined {
    for (let i = order.length - 1; i >= 0; i--) {
      const world = order[i];
      if (!world.gone && world.alpha > 0.3 && Math.hypot(x - world.x, y - world.y) < world.size + 5) return world;
    }
    for (const [key, label] of worldNames) {
      if (label.shown === '0' || label.shown === '') continue;
      const rect = label.text.getBoundingClientRect();
      if (x >= rect.left - 3 && x <= rect.right + 3 && y >= rect.top - 2 && y <= rect.bottom + 2) return worlds.get(key);
    }
    return undefined;
  }

  /** The charted world nearest to a point of the screen. */
  function worldNear(x: number, y: number): World | undefined {
    let best: World | undefined;
    for (const world of order) {
      if (!world.chart || world.gone) continue;
      if (!best || Math.hypot(x - world.x, y - world.y) < Math.hypot(x - best.x, y - best.y)) best = world;
    }
    return best;
  }

  /** Looks again at what the pointer is over: it moved, or the sky turned under it. */
  function repoint() {
    if (!hover || drag) return;
    if (close() && target) {
      const over = placeUnder(hover.x, hover.y);
      slot.toggleAttribute('data-over', over >= 0);
      if (over !== target.pointed) events.point(over >= 0 ? target.chart?.places[over].id : undefined);
      if (pointedWorld) events.pointWorld(undefined);
    } else {
      const over = eye.zoom < 0.4 ? worldUnder(hover.x, hover.y) : undefined;
      slot.toggleAttribute('data-over', over !== undefined);
      if (over !== pointedWorld) events.pointWorld(over?.key);
    }
  }

  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, travelled: 0, at: performance.now(), turns: close() };
    slot.setPointerCapture(event.pointerId);
    target?.spin.set(0, 0, 0);
    orbit = 0;
  }

  function move(event: PointerEvent) {
    hover = { x: event.clientX, y: event.clientY };
    if (!drag) {
      repoint();
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
    if (drag.travelled < 4) return;
    if (!turnedOnce) {
      turnedOnce = true;
      slot.setAttribute('data-turned', '');
    }
    slot.setAttribute('data-dragging', '');
    if (drag.turns && target) {
      // The surface follows the hand: a pixel of drag is a pixel of world.
      target.turning = undefined;
      const angle = Math.hypot(dx, dy) / Math.max(24, target.size);
      w.set(dy, dx, 0).normalize().applyQuaternion(camera.quaternion);
      target.turn.premultiply(q.setFromAxisAngle(w, angle));
      target.spin.lerp(w.multiplyScalar(angle / elapsed), 0.6);
    } else {
      // The plate turns under the hand, and tips towards it or away.
      const turned = -dx * 0.0052;
      eye.yaw += turned;
      eye.pitch = clamp(eye.pitch + dy * 0.004, rad(12), rad(74));
      orbit = lerp(orbit, turned / elapsed, 0.6);
    }
  }

  function up(event: PointerEvent) {
    if (!drag) return;
    const clicked = drag.travelled < 4;
    if (performance.now() - drag.at > 90 || still) {
      target?.spin.set(0, 0, 0);
      orbit = 0;
    }
    const turned = drag.turns;
    drag = undefined;
    touched = time;
    slot.removeAttribute('data-dragging');
    if (slot.hasPointerCapture(event.pointerId)) slot.releasePointerCapture(event.pointerId);
    if (clicked && event.type === 'pointerup') {
      if (turned) {
        const over = placeUnder(event.clientX, event.clientY);
        if (over >= 0 && target?.chart) events.choose(target.chart.places[over].id);
      } else if (eye.zoom < 0.4) {
        const over = worldUnder(event.clientX, event.clientY);
        if (over) events.visit(over.key);
      }
    }
    if (event.type === 'pointerup') repoint();
  }

  function leave() {
    if (drag) return;
    hover = undefined;
    slot.removeAttribute('data-over');
    if (target && target.pointed >= 0) events.point(undefined);
    if (pointedWorld) events.pointWorld(undefined);
  }

  /**
   * The wheel, or two fingers apart: nearer to a world, or back to the system. Where the page
   * scrolls, the wheel is the page's, and only two fingers move the eye.
   */
  function wheel(event: WheelEvent) {
    const scrolls = document.documentElement.scrollHeight > window.innerHeight + 1;
    if (scrolls && !event.ctrlKey) return;
    if (!wheeling && eye.goal < 0.5) {
      const nearest = worldUnder(event.clientX, event.clientY) ?? worldNear(event.clientX, event.clientY);
      if (!nearest?.chart) return;
      if (nearest !== target) {
        target = nearest;
        transit = undefined;
      }
    }
    if (!target) return;
    event.preventDefault();
    const by = -event.deltaY * (event.deltaMode === 1 ? 0.04 : event.ctrlKey ? 0.012 : 0.0024);
    eye.goal = clamp(eye.goal + by, 0, 1);
    wheeling = { at: time, by };
    if (still) settleWheel();
  }

  /** The wheel has stopped: the eye goes on to where it was heading, and the page follows. */
  function settleWheel() {
    if (!wheeling) return;
    const nearer = wheeling.by > 0;
    wheeling = undefined;
    const arrive = nearer ? eye.goal > 0.18 : eye.goal > 0.82;
    eye.goal = arrive ? 1 : 0;
    if (still) eye.zoom = eye.goal;
    const key = arrive ? target?.key : undefined;
    if (key !== shown) events.visit(key);
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
  slot.addEventListener('wheel', wheel, { passive: false });
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
    measure();
  }

  /** The stage follows the slot: at once when the page scrolls, gliding when the layout changes. */
  function place(dt: number) {
    const rect = slot.getBoundingClientRect();
    box.left = rect.left;
    box.top = rect.top;
    box.right = rect.right;
    box.bottom = rect.bottom;
    const x = rect.left + rect.width / 2 + window.scrollX;
    const y = rect.top + rect.height / 2 + window.scrollY;
    const style = getComputedStyle(slot);
    const bleed = Number(style.getPropertyValue('--bleed')) || 0.9;
    // What lies over the right of the slot (the sheet): the names keep clear of it.
    box.right -= parseFloat(style.getPropertyValue('--under')) || 0;
    if (!stage.placed || still) {
      Object.assign(stage, { x, y, w: rect.width, h: rect.height, bleed, placed: rect.width > 0 });
    } else {
      const k = 1 - Math.exp(-dt * 5.2);
      stage.x += (x - stage.x) * k;
      stage.y += (y - stage.y) * k;
      stage.w += (rect.width - stage.w) * k;
      stage.h += (rect.height - stage.h) * k;
      stage.bleed += (bleed - stage.bleed) * k;
    }
  }

  /** How large the world the eye is with is drawn: its radius on the screen, in CSS pixels. */
  const limb = () => Math.max(24, Math.min(stage.h * 0.47, stage.w * 0.5 * stage.bleed));

  /** The eye moves: on its way between the system and a world, and round the plate as the hand left it. */
  function travel(dt: number) {
    if (wheeling && time - wheeling.at > 0.22) settleWheel();
    if (still) {
      eye.zoom = eye.goal;
    } else {
      // A spring, damped so that it never overshoots: the eye leaves gently, and arrives gently.
      const stiff = wheeling ? 110 : 24;
      eye.speed += (stiff * (eye.goal - eye.zoom) - 2 * Math.sqrt(stiff) * eye.speed) * dt;
      eye.zoom = clamp(eye.zoom + eye.speed * dt, 0, 1);
    }
    if (transit) {
      transit.time += dt / 1.5;
      if (transit.time >= 1) transit = undefined;
    }
    // A push of the hand coasts on a little; left alone over the system, the plate sways from side to side.
    if (!drag && !still) {
      if (Math.abs(orbit) > 1e-3) {
        eye.yaw += orbit * dt;
        orbit *= Math.exp(-dt * 2.6);
      }
      eye.drift = lerp(eye.drift, time - touched > 2.4 ? 1 : 0, 1 - Math.exp(-dt * 0.8));
      eye.sway = 0.2 * Math.sin(time * 0.17) * eye.drift * (1 - smooth(0.05, 0.5, eye.zoom));
    }
  }

  /** Where the eye stands now, and what it sees: the whole system, one world, or the way between. */
  function stand() {
    eye.focal = LENS * height;
    eye.x = stage.x - window.scrollX;
    eye.y = stage.y - window.scrollY;
    const halfWidth = Math.max(60, stage.w / 2);
    const halfHeight = Math.max(60, stage.h / 2);
    // Far enough to see every world, with room under each for its name.
    const far = Math.max((eye.focal * span) / (0.9 * halfWidth), (eye.focal * (span * Math.sin(eye.pitch) + 0.3)) / (0.86 * halfHeight));
    let zoom = eye.zoom;
    if (transit) zoom *= 1 - transit.dip * Math.sin(Math.PI * ease(transit.time));
    eye.with = target ? zoom : 0;

    look.set(0, 0.06, 0);
    let distance = far;
    if (target) {
      const near = target.radius * Math.sqrt(1 + (eye.focal / limb()) ** 2);
      distance = Math.exp(lerp(Math.log(far), Math.log(near), zoom));
      w.set(target.at.x, target.radius * FLOAT, target.at.z);
      if (transit) w.lerpVectors(transit.from, w, ease(transit.time));
      // The eye goes straight in: what it looks at slides from the middle of the plate to the world.
      look.lerp(w, far - near > 1e-6 ? clamp(1 - (distance - near) / (far - near), 0, 1) : 1);
    }
    const pitch = lerp(eye.pitch, LEVEL, smooth(0, 1, eye.with));
    const across = Math.cos(pitch);
    const yaw = eye.yaw + eye.sway;
    camera.position.set(Math.sin(yaw) * across, Math.sin(pitch), Math.cos(yaw) * across).multiplyScalar(distance).add(look);
    camera.up.copy(Y);
    camera.lookAt(look);
    camera.updateMatrixWorld(true);
    const near = Math.max(0.004, distance * 0.03);
    const k = near / eye.focal;
    camera.projectionMatrix.makePerspective(-eye.x * k, (width - eye.x) * k, eye.y * k, -(height - eye.y) * k, near, 400);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /** Each world goes to its place on the plate as on a spring, grows to its size, and turns. */
  function advance(world: World, dt: number) {
    if (still) {
      world.at.copy(world.goal);
      world.radius = world.radiusGoal;
    } else {
      world.velocity.addScaledVector(v.copy(world.goal).sub(world.at), 22 * dt).multiplyScalar(Math.exp(-dt * 5.4));
      world.at.addScaledVector(world.velocity, dt);
      world.radius += (world.radiusGoal - world.radius) * (1 - Math.exp(-dt * 4));
    }

    world.with += ((world === target ? 1 : 0) - world.with) * (still ? 1 : 1 - Math.exp(-dt * 3.2));
    world.scan += ((world.scanning ? 1 : 0) - world.scan) * (still ? 1 : 1 - Math.exp(-dt * 4.5));
    world.lostFor += dt;
    if (!still) world.sweepAt += dt * 5.4 * world.scan;
    for (const item of world.rings) if (!still) item.turned += dt * item.rate * (1 + 14 * world.scan);

    const held = drag?.turns && world === target;
    if (world.turning) {
      world.turning.time += dt / world.turning.duration;
      world.turn.slerpQuaternions(world.turning.from, world.turning.to, ease(Math.min(1, world.turning.time)));
      if (world.turning.time >= 1) {
        world.turning = undefined;
        repoint();
      }
    } else if (!held && !still) {
      const speed = world.spin.length();
      if (speed > 1e-3) {
        world.turn.premultiply(q.setFromAxisAngle(w.copy(world.spin).normalize(), speed * dt));
        world.spin.multiplyScalar(Math.exp(-dt * 2.6));
        if (world === target) coasting = true;
      } else if (coasting && world === target) {
        coasting = false;
        world.spin.set(0, 0, 0);
        repoint();
      }
      // Left alone, a world turns on its axis; the one the eye is with holds still, to be read.
      const idle = 1 - world.with * smooth(0.2, 0.7, eye.with);
      world.turn.premultiply(q.setFromAxisAngle(Y, (world.rate * idle + 1.1 * world.scan) * dt));
    }
    world.turn.normalize();
  }

  /** Puts a world where it is, as the eye sees it now. */
  function show(world: World, rank: number, nearest: number, furthest: number) {
    const r = world.radius;
    // What could not be scanned shakes once.
    const shake = still ? 0 : Math.sin(world.lostFor * 38) * 0.06 * Math.exp(-world.lostFor * 5);
    world.group.position.set(world.at.x + shake * r, r * FLOAT, world.at.z);
    world.group.scale.setScalar(r);
    world.group.quaternion.copy(world.turn);

    toEye.copy(camera.position).sub(world.group.position);
    const away = toEye.length();
    toEye.normalize();
    world.facing.position.copy(world.group.position).addScaledVector(toEye, (r * r) / away);
    world.facing.quaternion.copy(camera.quaternion);
    world.facing.scale.setScalar(r * Math.sqrt(Math.max(0.01, 1 - (r / away) ** 2)));
    world.halo.position.copy(world.group.position);
    world.halo.scale.setScalar(r);

    const on = see(world.group.position);
    world.x = on.x;
    world.y = on.y;
    world.depth = away;
    world.size = (eye.focal * r) / Math.sqrt(Math.max(1e-6, on.depth * on.depth - r * r));

    // Further worlds are drawn fainter; and when the eye is with one world, the others are gone.
    const alone = smooth(0.3, 0.85, eye.with);
    const haze = furthest - nearest > 1e-6 ? (away - nearest) / (furthest - nearest) : 0;
    world.alpha = world.presence * lerp(1 - 0.3 * haze, world.with, alone);
    const visible = world.alpha > 0.01;
    world.group.visible = world.facing.visible = world.halo.visible = visible;

    const ratio = shared.uPx.value;
    const thin = clamp(world.size / 110, 0.45, 1);
    for (const material of world.pens) {
      material.uniforms.uAlpha.value = (material.userData.alpha as number) * world.alpha;
      material.uniforms.uWidth.value = (material.userData.width as number) * thin;
    }
    world.sweepPen.uniforms.uAlpha.value = world.scan * world.alpha;
    world.wakePen.uniforms.uAlpha.value = world.scan * 0.55 * world.alpha;
    world.sweep.rotation.y = world.sweepAt;
    // From afar a world shows its lands alone; its places and its roads come as the eye does.
    const detail = smooth(48, 150, world.size);
    world.markPen.uniforms.uAlpha.value = world.alpha * detail;
    world.roadPen.uniforms.uAlpha.value = (world.roadPen.userData.alpha as number) * world.alpha * detail;
    world.markPen.uniforms.uScale.value = clamp(world.size / 250, 0.2, 1.4);
    world.markPen.uniforms.uSweep.value.set(Math.sin(world.sweepAt), 0, Math.cos(world.sweepAt), world.scan);
    world.markPen.uniforms.uSweepDir.value.set(Math.cos(world.sweepAt), 0, -Math.sin(world.sweepAt));
    world.land.uniforms.uAlpha.value = world.alpha;
    world.land.blendAlpha = world.alpha;
    world.land.uniforms.uRadius.value = world.size * ratio;
    world.land.uniforms.uCentre.value.set(world.x * ratio, (height - world.y) * ratio);
    for (const item of world.rings) item.group.quaternion.copy(item.tilt).multiply(q.setFromAxisAngle(Y, item.turned));

    // Its shadow lies on the plate under it, a little away from the light.
    w.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0);
    v.set(world.at.x, 0.0005, world.at.z).addScaledVector(w, r * 0.22);
    const fall = see(v);
    world.shadow.position.copy(v);
    world.shadow.quaternion.setFromAxisAngle(X, -Math.PI / 2);
    world.shadow.scale.set(r * 1.02, r * 0.96, 1);
    world.shade.uniforms.uCentre.value.set(fall.x * ratio, (height - fall.y) * ratio);
    world.shade.uniforms.uAlpha.value = chalk.value > 0.5 ? 0 : lerp(0.46, 0.2, eye.with) * world.alpha * smooth(18, 46, world.size);
    world.shadow.visible = visible && world.shade.uniforms.uAlpha.value > 0.01;

    // In its turn: the body first, then what lies on it, then what is round it. What has no ink is left out.
    const base = 100 + rank * 20;
    for (const { mesh, order: at } of world.meshes) {
      mesh.renderOrder = base + at;
      const material = mesh.material as ShaderMaterial;
      mesh.visible = (material.uniforms.uAlpha.value as number) > 0.004;
    }
  }

  /** Puts a pen's ring on the screen: round a point, this many pixels wide. */
  function encircle(mesh: Mesh, material: ShaderMaterial, x: number, y: number, radius: number, alpha: number) {
    mesh.position.set(x, y, 0);
    mesh.scale.set(radius, radius, 1);
    material.uniforms.uAlpha.value = alpha;
  }

  /** A thread between two worlds, from the edge of one to the edge of the other, and what it measures. */
  function thread(line: Line, apart: number) {
    const [a, b] = [worlds.get(line.a), worlds.get(line.b)];
    const here = a && b && !a.gone && !b.gone ? Math.min(a.alpha, b.alpha) * apart : 0;
    line.shown = here;
    line.mesh.visible = here > 0.01;
    if (a && b && line.mesh.visible) {
      v.copy(b.group.position).sub(a.group.position);
      const between = v.length();
      v.normalize();
      const from = a.radius * 1.16;
      const long = Math.max(1e-4, between - from - b.radius * 1.16);
      line.mesh.position.copy(a.group.position).addScaledVector(v, from);
      line.mesh.quaternion.setFromUnitVectors(X, v);
      line.mesh.scale.setScalar(long);
      line.pen.uniforms.uAlpha.value = (line.pen.userData.alpha as number) * here;
    }
    const label = line.name;
    if (!label) return;
    let opacity = 0;
    let moved = label.moved;
    if (a && b && here > 0.01) {
      const middle = see(w.copy(a.group.position).add(b.group.position).multiplyScalar(0.5));
      moved = `translate3d(${middle.x.toFixed(1)}px,${middle.y.toFixed(1)}px,0)`;
      opacity = here;
    }
    const text = opacity <= 0.02 ? '0' : opacity.toFixed(2);
    if (text !== label.shown) label.element.style.opacity = label.shown = text;
    if (moved !== label.moved) label.element.style.transform = label.moved = moved;
  }

  /**
   * Writes each world's name under it; or over it, or beside it, where that is taken by another
   * name or another world. A name with no room anywhere is left out, unless its world is pointed at.
   */
  function nameWorlds(apart: number) {
    const taken: [number, number, number, number][] = [];
    const clear = (world: World, left: number, top: number, wide: number, high: number) => {
      if (left < 4 || top < 4 || left + wide > width - 4 || top + high > height - 4) return false;
      if (taken.some(([l, t, r, b]) => left < r && left + wide > l && top < b && top + high > t)) return false;
      // Not over another world either: the nearest point of the name to its middle is outside it.
      return !order.some((other) => {
        if (other === world || other.alpha < 0.05) return false;
        const [x, y] = [clamp(other.x, left, left + wide), clamp(other.y, top, top + high)];
        return Math.hypot(other.x - x, other.y - y) < other.size + 3;
      });
    };
    for (let i = order.length - 1; i >= 0; i--) {
      const world = order[i];
      const label = worldNames.get(world.key);
      if (!label) continue;
      let opacity = world.gone ? 0 : world.alpha * apart;
      const reach = world.size * (world.rings.length > 0 ? 1.5 : 1);
      const under = Math.round(reach + 9);
      const beside = Math.round(world.size * (world.rings.length > 0 ? 1.85 : 1) + 10);
      const sides: [string, number, number, number][] = [
        ['under', world.x - label.width / 2, world.y + under, under],
        ['over', world.x - label.width / 2, world.y - under - label.height, under],
        ['right', world.x + beside, world.y - label.height / 2, beside],
        ['left', world.x - beside - label.width, world.y - label.height / 2, beside],
      ];
      const free = sides.find(([, left, top]) => clear(world, left, top, label.width, label.height));
      const [side, left, top, gap] = free ?? sides[0];
      if (!free && world !== pointedWorld) opacity = 0;
      if (opacity > 0.02) taken.push([left - 6, top - 3, left + label.width + 6, top + label.height + 3]);
      const text = opacity <= 0.02 ? '0' : opacity.toFixed(2);
      const moved = `translate3d(${world.x.toFixed(1)}px,${world.y.toFixed(1)}px,0)`;
      if (text !== label.shown) label.element.style.opacity = label.shown = text;
      if (moved !== label.moved) label.element.style.transform = label.moved = moved;
      if (side !== label.side) label.element.dataset.side = label.side = side;
      // How far the name hangs from the middle of its world, and how large the world is drawn.
      const room = gap * 10000 + Math.round(world.size);
      if (room !== label.gap) {
        label.gap = room;
        label.element.style.setProperty('--gap', `${gap}px`);
        label.element.style.setProperty('--size', `${Math.round(world.size)}px`);
      }
    }
  }

  /**
   * Writes each place's name beside it: on the side away from the middle, or above the place where
   * neither side has room; inside the slot, and not over another name or the chosen place.
   */
  function namePlaces() {
    if (placeNames.length === 0) return;
    const world = shown ? worlds.get(shown) : undefined;
    if (!world) return;
    const near = smooth(0.72, 0.98, eye.with) * world.alpha;
    const crowded = world.places.length > 26;
    const scale = world.markPen.uniforms.uScale.value;
    const taken: [number, number, number, number][] = [];
    if (world.places[world.chosen]) {
      const at = seePlace(world, world.places[world.chosen].at);
      const reach = world.places[world.chosen].size * scale * 1.45 + 13;
      if (at.facing > 0) taken.push([at.x - reach, at.y - reach, at.x + reach, at.y + reach]);
    }
    const rank = (item: PlaceName) => (item.place < 0 ? -1 : item.place === world.chosen ? 3 : item.place === world.pointed ? 2 : world.places[item.place].size / 10);
    const sorted = [...placeNames].sort((a, b) => rank(b) - rank(a));
    for (const item of sorted) {
      const at = seePlace(world, item.at);
      const first = item.place >= 0 && (item.place === world.chosen || item.place === world.pointed);
      let opacity = item.place >= 0 ? smooth(0.06, 0.3, at.facing) : smooth(0.12, 0.4, at.facing) * 0.8;
      if (crowded && !first && item.place >= 0) opacity *= smooth(0.42, 0.62, at.facing);
      if (first && at.facing > 0.02) opacity = Math.max(opacity, 0.72);
      opacity *= near;
      let x = at.x - item.width / 2;
      let y = at.y - item.height / 2;
      let side = '';
      let gap = 0;
      let shift = 0;
      if (item.place >= 0) {
        gap = Math.round(world.places[item.place].size * scale * 1.3 + 9);
        const fits = (left: number) => left >= box.left + 4 && left + item.width <= box.right - 4;
        side = at.x >= world.x ? 'right' : 'left';
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
      const text = opacity <= 0.02 ? '0' : opacity.toFixed(2);
      const moved = `translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0)`;
      if (text !== item.shown) item.element.style.opacity = item.shown = text;
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

  /** Tells the page where the eye is: what it is with, whether everything has come to rest, what it looks at. */
  function report(now: number) {
    const view = eye.zoom >= 0.5 && target ? 'world' : 'system';
    if (canvas.dataset.view !== view) canvas.dataset.view = view;
    let moving = Math.abs(eye.goal - eye.zoom) > 0.002 || Math.abs(eye.speed) > 0.002 || transit !== undefined || wheeling !== undefined;
    moving ||= Math.abs(rim - rimGoal) > 0.004 || tweens.size > 0 || Math.abs(orbit) > 1e-3;
    for (const world of worlds.values()) {
      moving ||= world.turning !== undefined || world.velocity.lengthSq() > 1e-6 || world.at.distanceToSquared(world.goal) > 1e-6;
      moving ||= Math.abs(world.radius - world.radiusGoal) > 1e-3 || world.spin.lengthSq() > 1e-6;
    }
    if (moving === resting) {
      resting = !moving;
      canvas.toggleAttribute('data-rest', resting);
    }
    const zoom = eye.zoom.toFixed(3);
    if (root && root.style.getPropertyValue('--zoom') !== zoom) root.style.setProperty('--zoom', zoom);

    if (events.aim && now - aimed > 110) {
      aimed = now;
      if (eye.with > 0.5 && target) {
        v.copy(camera.position).sub(target.group.position).normalize().applyQuaternion(q.copy(target.turn).invert());
        events.aim('world', (Math.atan2(v.z, v.x) * 180) / Math.PI, (Math.asin(clamp(v.y, -1, 1)) * 180) / Math.PI);
      } else {
        events.aim('system', (((((eye.yaw + eye.sway) * 180) / Math.PI) % 360) + 360) % 360, (eye.pitch * 180) / Math.PI);
      }
    }
  }

  function frame(now: number) {
    if (disposed) return;
    frameRequest = requestAnimationFrame(frame);
    // By the clock, however slowly the frames come: where there is no graphics card, the sky is
    // drawn a few times a second, and what moves still takes the time it should.
    const dt = Math.min(0.3, Math.max(0, (now - last) / 1000));
    slow = now - last > 34 && time > 2 ? slow + 1 : 0;
    if (slow > 45 && quality > 0.5) {
      quality *= 0.75;
      slow = 0;
    }
    last = now;

    resize();
    place(dt);
    const boil = still ? 0 : Math.floor(now / 400) % 3;
    if (boil !== shared.uBoil.value) {
      shared.uBoil.value = boil;
      canvas.dataset.frame = String(boil);
    }

    for (const [key, item] of [...tweens]) {
      item.time += dt;
      const t = clamp((item.time - item.delay) / item.duration, 0, 1);
      item.apply(ease(t));
      if (t >= 1 && tweens.get(key) === item) tweens.delete(key);
    }

    // What moves on springs moves in steps short enough for them.
    for (let left = dt; left > 1e-6 || still; left -= 1 / 30) {
      const step = still ? dt : Math.min(left, 1 / 30);
      time += step;
      rim += (rimGoal - rim) * (still ? 1 : 1 - Math.exp(-step * 3));
      span += (spanGoal - span) * (still ? 1 : 1 - Math.exp(-step * 3));
      for (const world of worlds.values()) advance(world, step);
      travel(step);
      if (still) break;
    }
    stand();

    // The furthest worlds first: each hides what is behind it.
    order = [...worlds.values()];
    for (const world of order) world.depth = camera.position.distanceTo(v.set(world.at.x, world.radius * FLOAT, world.at.z));
    order.sort((a, b) => b.depth - a.depth);
    const furthest = order.length > 0 ? order[0].depth : 1;
    const nearest = order.length > 0 ? order[order.length - 1].depth : 1;
    order.forEach((world, rank) => show(world, rank, nearest, furthest));

    // Over the system: the plate, the threads, the names of the worlds. At a world: its places' names.
    const apart = 1 - smooth(0.25, 0.75, eye.with);
    plate.scale.setScalar(rim);
    plate.visible = apart > 0.01;
    for (const material of platePens) material.uniforms.uAlpha.value = (material.userData.alpha as number) * apart;
    fieldPen.uniforms.uAlpha.value = lerp(0.45, 0.8, apart);
    fieldPen.uniforms.uScale.value = clamp(height / 900, 0.7, 1.3);
    field.position.copy(camera.position);
    falling.position.copy(camera.position);
    for (const line of lines) thread(line, apart);
    nameWorlds(apart);
    namePlaces();

    if (!still && time > nextFall) {
      nextFall = time + 8 + Math.random() * 9;
      falling.quaternion.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      tween('fall', 1.25, (t) => {
        fallPen.uniforms.uReveal.value = Math.min(1, t * 1.6);
        fallPen.uniforms.uAlpha.value = 0.9 * (1 - smooth(0.55, 1, t));
      });
    }

    // The rings of the pen: red round the chosen place, ink round the one under the pointer, red round a pointed world.
    const world = shown ? worlds.get(shown) : undefined;
    const reading = smooth(0.72, 0.98, eye.with) * (world?.alpha ?? 0);
    chosenRing.visible = pointedRing.visible = false;
    if (world && reading > 0.01) {
      const scale = world.markPen.uniforms.uScale.value;
      for (const [mesh, material, index, reach, alpha] of [[chosenRing, chosenPen, world.chosen, 11, 1], [pointedRing, pointedPen, world.pointed, 8, 0.85]] as const) {
        const spot = world.places[index];
        if (!spot || (mesh === pointedRing && index === world.chosen)) continue;
        const at = seePlace(world, spot.at);
        if (at.facing <= 0.02) continue;
        mesh.visible = true;
        encircle(mesh, material, at.x, at.y, spot.size * scale * 1.45 + reach, alpha * reading * (0.35 + 0.65 * smooth(0.02, 0.2, at.facing)));
      }
    }
    worldRing.visible = pointedWorld !== undefined && apart > 0.5 && !pointedWorld.gone;
    if (worldRing.visible && pointedWorld) encircle(worldRing, worldPen, pointedWorld.x, pointedWorld.y, pointedWorld.size + 9, apart * pointedWorld.alpha);

    trace();
    report(now);

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(overlay, flat);
  }

  // ---- the first sketch ----------------------------------------------------------------------------

  platePens.forEach((material, i) => tween(`plate${i}`, 1.5 + i * 0.3, (t) => (material.uniforms.uReveal.value = t), 0.2 + i * 0.35));
  tween('sky', 2.2, (t) => (fieldPen.uniforms.uReveal.value = t), 0.4);
  const fonts = document.fonts?.ready.then(() => {
    if (!disposed) name();
  });
  void fonts;
  frameRequest = requestAnimationFrame(frame);

  return {
    system,
    visit,
    choose,
    point,
    pointWorld,
    palette,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameRequest);
      slot.removeEventListener('pointerdown', down);
      slot.removeEventListener('pointermove', move);
      slot.removeEventListener('pointerup', up);
      slot.removeEventListener('pointercancel', up);
      slot.removeEventListener('pointerleave', leave);
      slot.removeEventListener('wheel', wheel);
      window.removeEventListener('pointermove', track);
      for (const world of [...worlds.values()]) remove(world);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
    },
  };
}
