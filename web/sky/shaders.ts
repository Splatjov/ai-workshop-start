// The pen, as GLSL. Three things are drawn: strokes (lines with a pressure, a wobble and a boil,
// like drawably's), stars (ink blots with rays) and the pencil hatching that gives the globe its
// volume. Everything is premultiplied ink over a transparent page.

const NOISE = /* glsl */ `
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float hash31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
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
uniform float uDist;
uniform float uWidth;
uniform float uWobble;
uniform float uWobbleFreq;
uniform float uTaper;
uniform float uSphere;
uniform float uReveal;
uniform float uStagger;
varying float vSide;
varying float vReach;
varying float vAlong;
varying float vLength;
varying float vSeed;
varying float vFacing;
varying float vReveal;
${NOISE}
vec3 wobble(vec3 p, float seed, float unsteady) {
  vec3 q = p * uWobbleFreq + vec3(seed * 91.7 + uBoil * 13.1);
  vec3 slow = vec3(vnoise3(q), vnoise3(q + 19.19), vnoise3(q + 47.3)) - 0.5;
  vec3 fast = vec3(vnoise3(q * 4.1 + 7.0), vnoise3(q * 4.1 + 23.0), vnoise3(q * 4.1 + 61.0)) - 0.5;
  return (slow + fast * 0.3) * uWobble * unsteady;
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
  float pressure = 0.7 + 0.6 * vnoise2(vec2(u * aParams.z * 2.5 + seed * 31.0, seed * 7.0 + uBoil));
  float reach = 0.5 * uWidth * uPx * mix(0.45, 1.0, landed) * pressure;
  vec2 at = onScreen(here) + across * aParams.x * (reach + uPx);
  gl_Position = vec4(at / (uViewport * 0.5) * here.w, here.z, here.w);

  vSide = aParams.x * (reach + uPx);
  vReach = reach;
  vAlong = u;
  vLength = aParams.z;
  vSeed = seed;
  vec3 eye = (modelViewMatrix * vec4(position, 1.0)).xyz;
  vec3 outward = normalize((modelViewMatrix * vec4(position, 0.0)).xyz);
  vFacing = mix((eye.z + uDist) / max(length(position), 1e-4), dot(outward, normalize(-eye)), uSphere);
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
  float grain = vnoise2(vec2(vAlong * vLength * 46.0 + vSeed * 53.0, vSeed * 11.0 + uBoil + vSide * 0.35 / uPx));
  float ink = edge * mix(1.0, smoothstep(0.1, 0.55, grain), uDry);
  // Drawn so far.
  float drawn = vReveal * 1.04 - 0.02;
  ink *= 1.0 - smoothstep(drawn, drawn + 0.02, vAlong);
  // The far side of the glass: fainter, and broken.
  float front = smoothstep(-0.05, 0.07, vFacing);
  float broken = step(0.5, fract(vAlong * vLength * 24.0 + vSeed));
  ink *= mix(uBackAlpha * mix(1.0, broken, uBackDash), 1.0, front);
  ink *= mix(1.0, step(0.42, fract(vAlong * vLength * uDash + vSeed)), step(0.5, uDash));
  ink *= mix(1.0, vAlong * vAlong, uFade);
  float a = ink * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** Stars: one square each, turned to the eye; a blot of ink, rays for a skill, a ring for a copy. */
export const STAR_VERTEX = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aAt;
attribute vec4 aData; // size in px, seed, kind (0 field, 1 skill, 2 copy), index
attribute float aDelay;
uniform vec2 uViewport;
uniform float uPx;
uniform float uMorph;
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
  float moved = clamp(uMorph * 1.5 - aDelay * 0.5, 0.0, 1.0);
  moved = moved * moved * (3.0 - 2.0 * moved);
  vec3 at = normalize(mix(aFrom, aAt, moved) + vec3(1e-5));
  vec4 eye = modelViewMatrix * vec4(at, 1.0);
  vec3 outward = normalize((modelViewMatrix * vec4(at, 0.0)).xyz);
  float front = smoothstep(-0.08, 0.12, dot(outward, normalize(-eye.xyz)));

  float shown = clamp(uReveal * (1.0 + uStagger) - aDelay * uStagger, 0.0, 1.0);
  float pop = smoothstep(0.0, 0.3, shown) * (1.0 + 0.9 * sin(shown * 3.14159) * (1.0 - shown));
  float swept = uSweep.w * exp(-pow(dot(at, uSweep.xyz) * 7.0, 2.0)) * step(0.0, dot(at, uSweepDir));
  float chosen = 1.0 - step(0.5, abs(aData.w - uSelected));
  float over = 1.0 - step(0.5, abs(aData.w - uHovered));
  float size = aData.x * uScale * mix(0.72, 1.0, front) * pop * (1.0 + swept * 1.8) * (1.0 + 0.22 * max(chosen, over));
  float reach = aData.z > 0.5 ? size * 5.6 + 2.0 : size + 1.5;

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

export const STAR_FRAGMENT = /* glsl */ `
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
// A ray: thin, tapering to its tip, as long as the hand made it.
float rays(float r, float angle, float arms, float longest, float shortest, float thick) {
  float sector = TURN / arms;
  float off = mod(angle + sector * 0.5, sector) - sector * 0.5;
  float arm = floor((angle + sector * 0.5) / sector);
  float reach = mix(shortest, longest, hash21(vec2(arm, vSeed * 17.0)));
  float width = thick * (1.0 - clamp(r / reach, 0.0, 1.0));
  return (1.0 - smoothstep(width - 0.45, width + 0.45, abs(sin(off)) * r)) * step(r, reach) * step(0.0, cos(off));
}
void main() {
  float r = length(vAt);
  float angle = atan(vAt.y, vAt.x) + TURN;
  float shake = vnoise2(vec2(angle * 2.3 + vSeed * 40.0, uBoil * 3.7 + vSeed * 9.0)) - 0.5;
  float a;
  if (vKind < 0.5) {
    float edge = vSize * (1.0 + shake * 0.6);
    a = 1.0 - smoothstep(edge - 0.55, edge + 0.55, r);
  } else if (vKind < 1.5) {
    float edge = vSize * (1.0 + shake * 0.34);
    float turned = angle + vSeed * TURN + shake * 0.07;
    a = 1.0 - smoothstep(edge - 0.7, edge + 0.7, r);
    a = max(a, rays(r, turned, 4.0, vSize * 4.9, vSize * 3.4, 1.05));
    a = max(a, rays(r, turned + TURN / 8.0, 4.0, vSize * 2.9, vSize * 1.9, 0.8) * smoothstep(3.6, 5.4, vSize));
  } else {
    float edge = vSize * (1.0 + shake * 0.3);
    a = 1.0 - smoothstep(0.35, 1.0, abs(r - edge));
  }
  a *= vAlpha * uAlpha;
  gl_FragColor = vec4(mix(uInk, uAccent, vHot) * a, a);
}
`;

/** The globe's volume: pencil hatching where the light does not reach, crossed where it is darkest. */
export const HATCH_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vEye;
void main() {
  vec4 eye = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vEye = normalize(-eye.xyz);
  gl_Position = projectionMatrix * eye;
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
  float lifted = smoothstep(0.22, 0.4, vnoise2(vec2(along * 0.021 + own * 40.0, line * 1.7)));
  return (1.0 - smoothstep(weight * 0.5 - 0.5, weight * 0.5 + 0.5, off)) * lifted * (0.55 + 0.45 * own);
}
// The hand is not a ruler: the page slides a little under the pencil.
vec2 unruled(vec2 p) {
  return p + (vec2(vnoise2(p * 0.03 + uBoil * 5.0), vnoise2(p * 0.03 + 40.0 + uBoil * 5.0)) - 0.5) * 6.0;
}
`;

export const HATCH_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLight;
uniform vec2 uCentre;
uniform float uPx;
uniform float uBoil;
uniform float uAlpha;
uniform float uChalk;
varying vec3 vNormal;
varying vec3 vEye;
${NOISE}
${PENCIL}
void main() {
  vec3 outward = normalize(vNormal);
  float lit = dot(outward, uLight) * 0.5 + 0.5;
  float rim = 1.0 - max(dot(outward, normalize(vEye)), 0.0);
  // Ink shades the dark side; chalk, on a dark page, picks out the light one.
  float shade = mix(1.0 - lit, lit, uChalk) * 0.92 + pow(rim, 4.0) * 0.3;
  vec2 p = unruled((gl_FragCoord.xy - uCentre) / uPx);
  float first = lines(p, -0.9 + outward.x * 0.22, 6.5, mix(0.7, 1.5, shade)) * smoothstep(0.5, 0.72, shade);
  float second = lines(p, 0.5 + outward.y * 0.18, 7.5, 1.1) * smoothstep(0.76, 0.93, shade);
  float a = max(first, second) * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** The shadow the globe casts on the page: an ellipse of the same hatching, densest in its middle. */
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
  vec2 p = unruled((gl_FragCoord.xy - uCentre) / uPx);
  float first = lines(p, -0.9, 6.0, mix(0.6, 1.5, dark)) * smoothstep(0.0, 0.45, dark);
  float second = lines(p, 0.5, 7.5, 1.1) * smoothstep(0.6, 0.95, dark);
  float a = max(first, second) * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;
