// The pen, as GLSL. Four things are drawn: strokes (lines with a pressure, a wobble and a boil,
// like drawably's), marks (a place, a copy, a star of the sky behind), worlds (engraved: the sea in
// swelling lines, the coasts, the contours of the land, a wash of colour over it) and the shadow a
// world casts on the plate. Everything is premultiplied ink over a transparent page.
//
// The hand's unsteadiness is read from one small block of noise (a texture, 32 numbers a side, that
// repeats): four numbers at a time, each a different noise. It is far cheaper than computing noise,
// and where there is no graphics card that is what keeps the sky moving.

const NOISE = /* glsl */ `
uniform sampler3D uNoise;
vec4 noise(vec3 p) { return texture(uNoise, p / 32.0); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`;

/** A stroke: a ribbon along a polyline, as wide as the pen presses, wobbling in the hand. */
export const STROKE_VERTEX = /* glsl */ `
attribute vec3 aPrev;
attribute vec3 aNext;
attribute vec4 aParams; // side, how far along the stroke (0..1), the stroke's length, its seed
attribute vec2 aExtra;  // its turn to be drawn (0..1), how unsteady the hand is
uniform vec2 uViewport;
uniform float uPx;
uniform float uBoil;
uniform float uWidth;
uniform float uWobble;
uniform float uWobbleFreq;
uniform float uTaper;
uniform float uSphere;
uniform float uReveal;
uniform float uStagger;
uniform float uOwn;
varying float vSide;
varying float vReach;
varying float vAlong;
varying float vLength;
varying float vSeed;
varying float vFacing;
varying float vReveal;
${NOISE}
vec3 wobble(vec3 p, float seed, float unsteady) {
  vec3 q = p * uWobbleFreq + vec3(seed * 91.7 + uBoil * 13.1 + uOwn * 37.0);
  vec3 slow = noise(q).xyz - 0.5;
  vec3 fast = noise(q * 4.1 + 7.0).xyz - 0.5;
  return (slow + fast * 0.3) * uWobble * unsteady * 1.5;
}
vec2 onScreen(vec4 clip) { return clip.xy / clip.w * uViewport * 0.5; }
void main() {
  float seed = aParams.w;
  vec4 here = projectionMatrix * modelViewMatrix * vec4(position + wobble(position, seed, aExtra.y), 1.0);
  vec4 before = projectionMatrix * modelViewMatrix * vec4(aPrev + wobble(aPrev, seed, aExtra.y), 1.0);
  vec4 after = projectionMatrix * modelViewMatrix * vec4(aNext + wobble(aNext, seed, aExtra.y), 1.0);
  vec2 along = onScreen(after) - onScreen(before);
  float span = length(along);
  along = span > 1e-5 ? along / span : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float u = aParams.y;
  float taper = max(uTaper, 1e-4);
  float landed = smoothstep(0.0, taper, u) * smoothstep(0.0, taper, 1.0 - u);
  float pressure = 0.7 + 0.6 * noise(vec3(u * aParams.z * 2.5 + seed * 31.0, seed * 7.0 + uBoil, 0.5)).x;
  float reach = 0.5 * uWidth * uPx * mix(0.45, 1.0, landed) * pressure;
  vec2 at = onScreen(here) + across * aParams.x * (reach + uPx);
  gl_Position = vec4(at / (uViewport * 0.5) * here.w, here.z, here.w);

  vSide = aParams.x * (reach + uPx);
  vReach = reach;
  vAlong = u;
  vLength = aParams.z;
  vSeed = seed;
  // What faces the eye: on a sphere, where its surface does; elsewhere, what is nearer than the middle.
  vec3 eye = (modelViewMatrix * vec4(position, 1.0)).xyz;
  vec3 middle = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 outward = normalize(eye - middle);
  float nearer = (length(middle) - length(eye)) / max(length(eye - middle), 1e-5);
  vFacing = mix(nearer, dot(outward, normalize(-eye)), uSphere);
  vReveal = clamp(uReveal * (1.0 + uStagger) - aExtra.x * uStagger, 0.0, 1.0);
}
`;

export const STROKE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uPx;
uniform float uBoil;
uniform float uAlpha;
uniform float uBackAlpha;
uniform float uBackDash;
uniform float uDash;
uniform float uDry;
uniform float uFade;
varying float vSide;
varying float vReach;
varying float vAlong;
varying float vLength;
varying float vSeed;
varying float vFacing;
varying float vReveal;
${NOISE}
void main() {
  float edge = 1.0 - smoothstep(vReach - 0.6 * uPx, vReach + 0.6 * uPx, abs(vSide));
  edge *= clamp(vReach / (0.55 * uPx), 0.3, 1.0);
  // Where the pen runs dry, the paper shows through.
  float grain = noise(vec3(vAlong * vLength * 46.0 + vSeed * 53.0, vSeed * 11.0 + uBoil + vSide * 0.35 / uPx, 0.37)).x;
  float ink = edge * mix(1.0, smoothstep(0.2, 0.56, grain), uDry);
  // Drawn so far.
  float drawn = vReveal * 1.04 - 0.02;
  ink *= 1.0 - smoothstep(drawn, drawn + 0.02, vAlong);
  // The far side: fainter, and broken.
  float front = smoothstep(-0.05, 0.07, vFacing);
  float broken = step(0.5, fract(vAlong * vLength * 24.0 + vSeed));
  ink *= mix(uBackAlpha * mix(1.0, broken, uBackDash), 1.0, front);
  ink *= mix(1.0, step(0.42, fract(vAlong * vLength * uDash + vSeed)), step(0.5, uDash));
  ink *= mix(1.0, vAlong * vAlong, uFade);
  float a = ink * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** Marks: one square each, turned to the eye. A place is a dot in a ring; a copy, a ring; a star, a blot. */
export const MARK_VERTEX = /* glsl */ `
attribute vec3 aAt;
attribute vec4 aData; // size in px, seed, kind (0 a star of the sky, 1 a place, 2 a copy), index
attribute float aDelay;
uniform vec2 uViewport;
uniform float uPx;
uniform float uReveal;
uniform float uStagger;
uniform float uScale;
uniform float uSelected;
uniform float uHovered;
uniform float uBackAlpha;
uniform vec4 uSweep;    // the sweeping meridian's plane, and how much it is on
uniform vec3 uSweepDir;
varying vec2 vAt;
varying float vSize;
varying float vKind;
varying float vSeed;
varying float vHot;
varying float vAlpha;
void main() {
  vec3 at = aAt;
  vec4 eye = modelViewMatrix * vec4(at, 1.0);
  vec3 middle = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 outward = normalize(eye.xyz - middle);
  float front = smoothstep(-0.02, 0.16, dot(outward, normalize(-eye.xyz)));

  float shown = clamp(uReveal * (1.0 + uStagger) - aDelay * uStagger, 0.0, 1.0);
  float pop = smoothstep(0.0, 0.3, shown) * (1.0 + 0.9 * sin(shown * 3.14159) * (1.0 - shown));
  float swept = uSweep.w * exp(-pow(dot(normalize(at), uSweep.xyz) * 7.0, 2.0)) * step(0.0, dot(at, uSweepDir));
  float chosen = 1.0 - step(0.5, abs(aData.w - uSelected));
  float over = 1.0 - step(0.5, abs(aData.w - uHovered));
  float size = aData.x * uScale * mix(0.72, 1.0, front) * pop * (1.0 + swept * 1.8) * (1.0 + 0.22 * max(chosen, over));
  float reach = aData.z > 0.5 ? size * 2.3 + 2.0 : size + 1.5;

  vec4 clip = projectionMatrix * eye;
  gl_Position = vec4(clip.xy + position.xy * reach * uPx / uViewport * 2.0 * clip.w, clip.z, clip.w);
  vAt = position.xy * reach;
  vSize = size;
  vKind = aData.z;
  vSeed = aData.y;
  vHot = chosen;
  vAlpha = mix(uBackAlpha, 1.0, front) * smoothstep(0.0, 0.15, shown) * (1.0 + swept);
}
`;

export const MARK_FRAGMENT = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uAccent;
uniform float uBoil;
uniform float uAlpha;
varying vec2 vAt;
varying float vSize;
varying float vKind;
varying float vSeed;
varying float vHot;
varying float vAlpha;
${NOISE}
const float TURN = 6.2831853;
void main() {
  float r = length(vAt);
  float angle = atan(vAt.y, vAt.x) + TURN;
  float shake = noise(vec3(angle * 2.3 + vSeed * 40.0, uBoil * 3.7 + vSeed * 9.0, 0.61)).x - 0.5;
  float a;
  if (vKind < 0.5) {
    float edge = vSize * (1.0 + shake * 0.6);
    a = 1.0 - smoothstep(edge - 0.55, edge + 0.55, r);
  } else if (vKind < 1.5) {
    // A place: a dot of ink in a ring, as a town on a map; the highest have a second ring.
    float blot = vSize * 0.5 * (1.0 + shake * 0.3);
    a = 1.0 - smoothstep(blot - 0.6, blot + 0.6, r);
    float pen = 0.34 + vSize * 0.07;
    a = max(a, 1.0 - smoothstep(pen, pen + 0.75, abs(r - vSize * 1.22 * (1.0 + shake * 0.16))));
    a = max(a, (1.0 - smoothstep(0.3, 0.95, abs(r - vSize * 1.86 * (1.0 - shake * 0.14)))) * smoothstep(5.2, 6.4, vSize) * 0.8);
  } else {
    float edge = vSize * (1.0 + shake * 0.3);
    a = 1.0 - smoothstep(0.35, 1.0, abs(r - edge));
  }
  a *= vAlpha * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uInk, uAccent, vHot) * a, a);
}
`;

const PENCIL = /* glsl */ `
// Parallel pencil lines at an angle: each has its own weight, and lifts off the paper here and there.
float lines(vec2 p, float angle, float gap, float weight) {
  float across = p.x * sin(angle) + p.y * cos(angle);
  float along = p.x * cos(angle) - p.y * sin(angle);
  float line = floor(across / gap);
  float off = abs(fract(across / gap) - 0.5) * gap;
  float own = hash21(vec2(line, 3.0 + uBoil));
  float lifted = smoothstep(0.3, 0.44, noise(vec3(along * 0.021 + own * 40.0, line * 1.7, 0.83)).x);
  return (1.0 - smoothstep(weight * 0.5 - 0.5, weight * 0.5 + 0.5, off)) * lifted * (0.55 + 0.45 * own);
}
// The hand is not a ruler: the page slides a little under the pencil.
vec2 unruled(vec2 p) {
  return p + (noise(vec3(p * 0.03 + uBoil * 5.0, 0.19)).xy - 0.5) * 6.0;
}
`;

/** A world: a sphere, engraved. */
export const WORLD_VERTEX = /* glsl */ `
varying vec3 vAt;
varying vec3 vNormal;
varying vec3 vEye;
void main() {
  vec4 eye = modelViewMatrix * vec4(position, 1.0);
  vAt = position;
  vNormal = normalize(normalMatrix * normal);
  vEye = -eye.xyz;
  gl_Position = projectionMatrix * eye;
}
`;

/**
 * The sea is engraved in parallels that swell where the light does not reach, as a burin's lines
 * do, and finer ones grow in between as the world comes nearer. The coast is a pen line with
 * waterlines off it; the land is left as paper, with the contours of its heights and a wash of
 * colour, a little out of register, as a plate tinted by hand. Until it is charted a world is all
 * sea, and lightly drawn. The world hides what is behind it.
 */
export const WORLD_FRAGMENT = /* glsl */ `
uniform sampler2D uTerrain;
uniform vec3 uInk;
uniform vec3 uWash;
uniform vec3 uLight;
uniform vec2 uCentre;
uniform float uPx;
uniform float uBoil;
uniform float uRadius;
uniform float uCharted;
uniform float uKnown;
uniform float uOwn;
uniform float uAlpha;
uniform float uChalk;
varying vec3 vAt;
varying vec3 vNormal;
varying vec3 vEye;
${NOISE}
${PENCIL}
const float PI = 3.14159265;
const float COAST = 0.5;
void main() {
  vec3 p = normalize(vAt);
  vec3 outward = normalize(vNormal);
  float facing = max(dot(outward, normalize(vEye)), 0.0);
  float lit = dot(outward, uLight) * 0.5 + 0.5;
  // Ink shades the dark side; chalk, on a dark page, picks out the light one.
  float shade = clamp(mix(1.0 - lit, lit, uChalk) * 0.94 + pow(1.0 - facing, 3.0) * 0.3, 0.0, 1.0);
  float size = uRadius / uPx; // the world's radius on the screen, in CSS pixels
  int boil = int(uBoil);

  // The hand's unsteadiness here: slow, quicker, and quicker still.
  vec4 slow = noise(p * 3.1 + uOwn * 31.0);
  vec4 mid = noise(p * 6.5 + uOwn * 17.0);
  vec4 quick = noise(p * 17.0 + uOwn * 5.0);

  vec2 uv = vec2(atan(p.z, p.x) / (2.0 * PI) + 0.5, asin(clamp(p.y, -1.0, 1.0)) / PI + 0.5);
  vec4 terrain = texture2D(uTerrain, uv);
  // The coast is not a compass's curve: the hand roughens it, and leaves islets off it.
  float rough = (mid.r - 0.5) * 0.3 + (quick.r - 0.5) * 0.13;
  float level = mix(1.3, COAST, uCharted); // the lands rise out of the sea about their places
  float d = terrain.r + rough - level;
  float w = max(fwidth(d), 1e-4);
  float land = smoothstep(-0.7 * w, 0.7 * w, d);
  float charted = smoothstep(0.0, 0.35, uCharted);

  float pen = mix(0.55, 1.2, smoothstep(30.0, 190.0, size));
  float coast = 1.0 - smoothstep(pen - 0.45, pen + 0.55, abs(d) / w);

  // Waterlines: three lines off the coast, each fainter and further than the last.
  float room = smoothstep(2.2, 4.5, 0.07 / w);
  float lifted = smoothstep(0.3, 0.44, mid.g);
  float water = 0.85 * (1.0 - smoothstep(0.3, 1.0, abs(d + 0.075) / w));
  water = max(water, 0.6 * (1.0 - smoothstep(0.25, 0.95, abs(d + 0.165) / w)) * lifted);
  water = max(water, 0.38 * (1.0 - smoothstep(0.2, 0.9, abs(d + 0.275) / w)) * lifted);
  water *= room * (1.0 - land) * charted;

  // The sea: parallels of latitude, as an engraver cuts them. Between every two, a finer one grows
  // as the world comes nearer, so the lines never crowd and never thin out.
  float depth = log2(max(size, 10.0) / 30.0);
  float count = 22.0 * exp2(floor(depth));
  float near = fract(depth);
  float v = uv.y * count * 2.0 + (slow.r - 0.5) * 0.6 + (quick[boil + 1] - 0.5) * 0.12;
  float k = floor(v + 0.5);
  float grown = mix(1.0, smoothstep(0.0, 1.0, near), mod(k, 2.0));
  float perLine = 1.0 / max(fwidth(v), 1e-5); // pixels from one line to the next
  float thick = mix(0.2, 1.9, pow(shade, 1.7)) * uPx * grown;
  float cut = 1.0 - smoothstep(thick - 0.5, thick + 0.5, abs(v - k) * perLine);
  cut *= clamp(thick / 0.45, 0.0, 1.0);
  cut *= smoothstep(0.26, 0.38, noise(vec3(p.x * 4.2, p.z * 4.2, k * 1.31 + uBoil * 0.61 + uOwn * 9.0)).x); // the burin lifts
  // Where the lines would be closer than the screen can show, a tone stands in for them.
  cut = mix(clamp(2.0 * thick / perLine, 0.0, 0.8), cut, smoothstep(1.3, 2.8, perLine));
  float offshore = mix(1.0, smoothstep(0.05, 0.36, -d), room * charted);
  float sea = cut * (1.0 - land) * offshore;

  // The land: the contours of its heights, a ring for every seventh of the way to the highest summit.
  float high = terrain.g + (mid.b - 0.5) * 0.05;
  float c = high * 7.0;
  float ck = floor(c + 0.5);
  float cw = max(fwidth(c), 1e-4);
  float contour = (1.0 - smoothstep(0.35, 1.05, abs(c - ck) / cw)) * step(0.5, ck) * smoothstep(1.6, 3.2, 1.0 / cw);
  contour *= land * 0.62 * smoothstep(0.02, 0.08, d) * charted;

  // Pencil, where the light does not reach: over land and sea alike, crossed where it is darkest.
  float hatch = 0.0;
  if (shade > 0.58 && size > 26.0) {
    vec2 q = unruled((gl_FragCoord.xy - uCentre) / uPx);
    hatch = lines(q, -0.9 + outward.x * 0.22, 6.5, mix(0.7, 1.4, shade)) * smoothstep(0.6, 0.82, shade) * land;
    hatch = max(hatch, lines(q, 0.5 + outward.y * 0.18, 7.5, 1.1) * smoothstep(0.8, 0.95, shade));
    hatch *= 0.5 * smoothstep(26.0, 60.0, size);
  }

  // The wash: laid by hand after the plate was printed, so it sits a little off the coast it fills,
  // pools at its edges and grains with the paper.
  float off = texture2D(uTerrain, uv + vec2(0.0042, -0.0056)).r + rough - level;
  float tint = smoothstep(-0.6 * w, 0.6 * w, off);
  float wash = tint * (0.5 + 0.22 * (quick.g * 0.5 + mid.a * 0.5) + 0.25 * (1.0 - smoothstep(0.0, 0.1, off))) * charted;
  wash *= mix(1.0, 0.72, shade);

  // Not yet charted, a world is pencilled in: fainter than one that is known.
  float ink = max(max(coast * charted, sea), max(max(water, contour), hatch)) * mix(0.5, 1.0, uKnown);
  // Ink over wash over nothing: what is left blank still hides what is behind the world.
  vec3 colour = uInk * ink + uWash * wash * (1.0 - ink);
  float alpha = ink + wash * (1.0 - ink);
  gl_FragColor = vec4(colour, alpha) * uAlpha;
}
`;

/** The shadow a world casts on the plate: an ellipse of pencil hatching, densest in its middle. */
export const SHADOW_VERTEX = /* glsl */ `
varying vec2 vAt;
void main() {
  vAt = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SHADOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec2 uCentre;
uniform float uPx;
uniform float uBoil;
uniform float uAlpha;
varying vec2 vAt;
${NOISE}
${PENCIL}
void main() {
  float dark = 1.0 - smoothstep(0.15, 1.0, length(vAt));
  if (dark < 0.01) discard;
  vec2 p = unruled((gl_FragCoord.xy - uCentre) / uPx);
  float first = lines(p, -0.9, 6.0, mix(0.6, 1.5, dark)) * smoothstep(0.0, 0.45, dark);
  float second = lines(p, 0.5, 7.5, 1.1) * smoothstep(0.6, 0.95, dark);
  float a = max(first, second) * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;
