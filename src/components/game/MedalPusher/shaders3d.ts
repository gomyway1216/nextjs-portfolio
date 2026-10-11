/**
 * The shaders of the 3D field. Colours inside them are amounts of light, not
 * the numbers a screen is sent, so that light adds up the way it does in a
 * real cabinet; `finish` turns the sum into a pixel at the very end.
 */

import { MEDAL_RADIUS } from './engine';

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
`;

/** What every surface needs to know about the cabinet it is in. */
const WORLD = `
uniform mat4 uCamera;
uniform mat4 uSun;
uniform vec3 uEye;
uniform vec3 uKey;
uniform vec4 uView;
uniform sampler2DShadow uShadow;

const vec3 KEY_COLOUR = vec3(1.0, 0.95, 0.86);

/** How much of the key light reaches a point: 1 in the open, 0 in full shadow, in between along a shadow's edge. */
float sunlit(vec3 world, vec3 normal) {
  vec4 seen = uSun * vec4(world + normal * 0.07, 1.0);
  vec3 at = seen.xyz * 0.5 + 0.5;
  float texel = uView.z;
  float lit = texture(uShadow, vec3(at.xy + texel * vec2(-0.75, -0.25), at.z));
  lit += texture(uShadow, vec3(at.xy + texel * vec2(0.25, -0.75), at.z));
  lit += texture(uShadow, vec3(at.xy + texel * vec2(0.75, 0.25), at.z));
  lit += texture(uShadow, vec3(at.xy + texel * vec2(-0.25, 0.75), at.z));
  return lit * 0.25;
}

/**
 * What a mirror in the cabinet shows when it looks along a direction: a
 * bright roof with a lamp over the back, purple walls with a pink light to
 * the left and a cyan one to the right, and below, the gold of other medals.
 */
vec3 surroundings(vec3 r) {
  vec3 below = vec3(0.32, 0.23, 0.12);
  vec3 walls = vec3(0.36, 0.3, 0.46);
  vec3 roof = vec3(1.0, 0.97, 0.93) * mix(0.54, 0.8, smoothstep(0.3, 0.95, r.y));
  vec3 c = mix(below, walls, smoothstep(-0.45, 0.05, r.y));
  c = mix(c, roof, smoothstep(0.05, 0.5, r.y));
  c += vec3(1.0, 0.22, 0.55) * pow(max(dot(r, vec3(-0.88, 0.34, 0.33)), 0.0), 5.0) * 0.6;
  c += vec3(0.2, 0.78, 1.0) * pow(max(dot(r, vec3(0.88, 0.34, 0.33)), 0.0), 5.0) * 0.55;
  // The glass at the front lets the room in: a soft light on whatever turns to face the player.
  c += vec3(1.0, 0.93, 0.82) * pow(max(dot(r, vec3(0.0, 0.25, 0.97)), 0.0), 2.0) * 0.36;
  return c;
}

/**
 * The lit pile itself, as a mirror standing on it shows it: low down at the
 * front left. It is what puts a bright stripe down the side of a medal or a
 * tower, even on the side the key lamp does not reach.
 */
vec3 pile(vec3 r) {
  return vec3(1.0, 0.84, 0.55) * pow(max(dot(r, vec3(-0.64, -0.68, 0.37)), 0.0), 4.0);
}

/**
 * The key lamp as a mirror shows it: a broad glow, and a small hot middle
 * that makes the glints. The glints brighten and dim a little as the running
 * lights go by: the last number of uView is where their wave has got to.
 */
vec3 lamp(vec3 r, vec3 world) {
  float toward = max(dot(r, uKey), 0.0);
  float passing = 0.8 + 0.35 * sin(uView.w - world.x * 0.21);
  return KEY_COLOUR * (pow(toward, 4.5) * 1.2 + (pow(toward, 40.0) * 1.3 + pow(toward, 400.0) * 8.0) * passing);
}

/** From the light that leaves a surface to the colour of its pixel. */
vec3 finish(vec3 c, vec3 world) {
  // The back of the cabinet is dimmer and a little hazy.
  float back = clamp(1.0 - world.z / 100.0, 0.0, 1.0);
  c = mix(c, vec3(0.06, 0.035, 0.13), back * back * 0.13) * (1.0 - 0.1 * back);
  // So are the corners of the glass.
  vec2 off = gl_FragCoord.xy * uView.xy - 0.5;
  c *= 1.0 - 0.42 * smoothstep(0.36, 0.86, length(off * vec2(1.0, 0.92)));
  // Light up to a point is shown as it is; anything brighter is eased toward white instead of cut off,
  // which is what turns the brightest gold yellow and its glints white.
  c = max(c, 0.0);
  c = min(c, 0.6) + 0.4 * (1.0 - exp(-max(c - 0.6, 0.0) / 0.4));
  c = pow(c, vec3(1.0 / 2.2));
  // A grain too fine to see, so the dark gradients do not band.
  return c + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}
`;

const TURN = `
vec3 turned(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
`;

// ── Medals ──────────────────────────────────────────────────────────────────

export const MEDAL_VERTEX = `${HEAD}
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aPlace;
layout(location = 3) in vec4 aTurn;
layout(location = 4) in vec4 aLook;
uniform mat4 uCamera;
out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
flat out vec4 vTurn;
flat out vec2 vOwn;
${TURN}
void main() {
  vec3 world = aPlace.xyz + turned(aTurn, aPosition);
  vWorld = world;
  vLocal = aPosition;
  vNormal = aNormal;
  vTurn = aTurn;
  vOwn = vec2(aPlace.w, aLook.z);
  gl_Position = uCamera * vec4(world, 1.0);
}
`;

export const MEDAL_FRAGMENT = `${HEAD}
in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec4 vTurn;
flat in vec2 vOwn;
uniform sampler2D uRelief;
out vec4 colour;
${WORLD}
${TURN}
const vec3 GOLD = vec3(1.0, 0.67, 0.11);

void main() {
  vec3 flatNormal = normalize(vNormal);
  vec3 n = flatNormal;
  float face = smoothstep(0.9, 0.99, abs(n.y));
  float hollow = 1.0;
  if (face > 0.0) {
    // The relief struck into the face: it bends the light, and its hollows are darker.
    vec4 relief = texture(uRelief, vLocal.xz / ${(MEDAL_RADIUS * 2).toFixed(2)} + 0.5);
    // The face is struck a hair domed, so the light runs across it instead of lying flat on it.
    vec2 lean = (relief.xy * 2.0 - 1.0 + vLocal.xz * ${(0.26 / MEDAL_RADIUS).toFixed(4)}) * face;
    n = normalize(vec3(lean.x, n.y * sqrt(max(1.0 - dot(lean, lean), 0.05)), lean.y));
    hollow = mix(1.0, 0.7 + 0.3 * relief.z, face);
  } else {
    // The milled rim, as long as its ridges are wide enough to see.
    float around = atan(vLocal.z, vLocal.x);
    float fine = clamp(1.4 - fwidth(around) * 30.0, 0.0, 1.0);
    n = normalize(n + vec3(-sin(around), 0.0, cos(around)) * sin(around * 88.0) * 0.4 * fine);
  }
  vec3 normal = turned(vTurn, n);
  vec3 solid = turned(vTurn, flatNormal);
  vec3 toEye = normalize(uEye - vWorld);
  float facing = max(dot(normal, toEye), 0.03);
  vec3 mirrored = reflect(-toEye, normal);

  float lit = smoothstep(0.0, 0.2, dot(solid, uKey));
  if (lit > 0.0) lit *= sunlit(vWorld, solid);

  // No two medals are quite the same gold.
  vec3 gold = GOLD * mix(vec3(0.84, 0.78, 0.66), vec3(1.1, 1.12, 1.25), vOwn.x);
  vec3 sheen = gold + (1.0 - gold) * pow(1.0 - facing, 5.0);
  // Gold seen in gold is deeper gold: the darker what a medal mirrors, the more orange it turns.
  vec3 seen = surroundings(mirrored) * mix(0.64, 1.0, lit) * hollow;
  seen *= mix(vec3(1.0, 0.8, 0.5), vec3(1.0), smoothstep(0.15, 0.85, dot(seen, vec3(0.3, 0.5, 0.2))));
  vec3 c = sheen * (seen + pile(mirrored) * 1.15 + lamp(mirrored, vWorld) * lit * mix(0.75, 1.0, hollow));
  colour = vec4(finish(c * vOwn.y, vWorld), 1.0);
}
`;

// ── Balls, pins and bulbs ───────────────────────────────────────────────────

export const BEAD_VERTEX = `${HEAD}
layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec4 aPlace;
layout(location = 3) in vec4 aPaint;
uniform mat4 uCamera;
out vec3 vWorld;
out vec3 vLocal;
flat out vec4 vPaint;
void main() {
  vec3 world = aPlace.xyz + aPosition * aPlace.w;
  vWorld = world;
  vLocal = aPosition;
  vPaint = aPaint;
  gl_Position = uCamera * vec4(world, 1.0);
}
`;

export const BEAD_FRAGMENT = `${HEAD}
in vec3 vWorld;
in vec3 vLocal;
flat in vec4 vPaint;
out vec4 colour;
${WORLD}
/** How far outside a five-pointed star a point is; negative inside. */
float star(vec2 p, float r) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = 0.42 * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

void main() {
  vec3 normal = normalize(vLocal);
  vec3 toEye = normalize(uEye - vWorld);
  float facing = max(dot(normal, toEye), 0.0);
  vec3 mirrored = reflect(-toEye, normal);
  float kind = vPaint.a;
  vec3 c;
  if (kind >= 2.0) {
    // A bulb: coloured glass, bright in the middle when it is lit.
    float glow = kind - 2.0;
    c = vPaint.rgb * (0.16 + 1.7 * glow) * (0.45 + 0.55 * facing) + vec3(1.0) * pow(facing, 6.0) * (0.12 + 1.0 * glow);
    c += surroundings(mirrored) * 0.25 * pow(1.0 - facing, 3.0);
  } else {
    float toward = dot(normal, uKey);
    float lit = smoothstep(-0.1, 0.3, toward);
    if (lit > 0.0) lit *= sunlit(vWorld, normal);
    if (kind >= 1.0) {
      // A pin of the back panel: polished metal.
      c = vPaint.rgb * (surroundings(mirrored) * 1.5 + lamp(mirrored, vWorld) * 0.6 + 0.12);
    } else {
      // A prize ball: glossy pink, with a star on the side the player sees.
      vec3 up = normalize(vec3(0.0, 0.55, 0.84));
      vec2 on = vec2(dot(normal, vec3(1.0, 0.0, 0.0)), dot(normal, cross(up, vec3(1.0, 0.0, 0.0))));
      float edge = dot(normal, up) > 0.0 ? star(vec2(on.x, -on.y) * 1.05, 0.52) : 1.0;
      vec3 body = mix(vec3(0.95, 0.04, 0.26), vec3(0.3, 0.0, 0.07), smoothstep(0.5, -0.7, normal.y));
      vec3 paint = mix(vec3(1.0, 0.86, 0.4), body, smoothstep(-0.012, 0.012, edge));
      paint = mix(vec3(0.24, 0.0, 0.07), paint, smoothstep(0.012, 0.03, abs(edge)));
      float wrap = clamp(toward * 0.6 + 0.4, 0.0, 1.0);
      // Deeper in colour toward its edge, as a ball of tinted plastic is.
      c = paint * (0.32 + wrap * mix(0.35, 1.0, lit)) * mix(1.0, 0.5, pow(1.0 - facing, 2.0));
      float glaze = 0.04 + 0.96 * pow(1.0 - facing, 4.0);
      c += surroundings(mirrored) * glaze * 0.2 + lamp(mirrored, vWorld) * lit * 0.5;
    }
  }
  colour = vec4(finish(c, vWorld), 1.0);
}
`;

// ── The cabinet's own surfaces ──────────────────────────────────────────────

export const SOLID_VERTEX = `${HEAD}
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aSpot;
layout(location = 3) in vec3 aColour;
layout(location = 4) in vec2 aFinish;
uniform mat4 uCamera;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vSpot;
out vec3 vColour;
out vec2 vFinish;
void main() {
  vWorld = aPosition;
  vNormal = aNormal;
  vSpot = aSpot;
  vColour = aColour;
  vFinish = aFinish;
  gl_Position = uCamera * vec4(aPosition, 1.0);
}
`;

export const SOLID_FRAGMENT = `${HEAD}
in vec3 vWorld;
in vec3 vNormal;
in vec2 vSpot;
in vec3 vColour;
in vec2 vFinish;
uniform sampler2D uArt;
out vec4 colour;
${WORLD}
void main() {
  vec3 normal = normalize(vNormal);
  vec3 paint = texture(uArt, vSpot).rgb * vColour;
  vec3 toEye = normalize(uEye - vWorld);
  float facing = max(dot(normal, toEye), 0.0);
  vec3 mirrored = reflect(-toEye, normal);
  float toward = dot(normal, uKey);
  float lit = smoothstep(0.0, 0.15, toward);
  if (lit > 0.0) lit *= sunlit(vWorld, normal);
  // Paint: lit by the key lamp where it reaches, and by the glow of the cabinet everywhere.
  vec3 matte = paint * (0.62 + KEY_COLOUR * max(toward, 0.0) * lit * 0.8);
  // Metal: its own colour of whatever it mirrors.
  vec3 metal = paint * ((surroundings(mirrored) + pile(mirrored) * 0.6) * mix(0.6, 1.0, lit) * 1.5 + lamp(mirrored, vWorld) * lit * 0.5);
  vec3 c = mix(matte, metal, vFinish.x);
  // Paint with a gloss on it also mirrors a little, most where it is seen at a slant.
  c += surroundings(mirrored) * pow(1.0 - facing, 4.0) * vFinish.x * (1.0 - vFinish.x);
  c = mix(c, paint, min(vFinish.y, 1.0)) + paint * max(vFinish.y - 1.0, 0.0);
  colour = vec4(finish(c, vWorld), 1.0);
}
`;

// ── Flat touches ────────────────────────────────────────────────────────────

export const FLAT_VERTEX = `${HEAD}
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColour;
layout(location = 2) in vec2 aWeight;
layout(location = 3) in vec3 aSpot;
uniform mat4 uCamera;
out vec3 vColour;
out vec2 vWeight;
out vec3 vSpot;
void main() {
  vColour = aColour;
  vWeight = aWeight;
  vSpot = aSpot;
  gl_Position = uCamera * vec4(aPosition, 1.0);
}
`;

export const FLAT_FRAGMENT = `${HEAD}
in vec3 vColour;
in vec2 vWeight;
in vec3 vSpot;
out vec4 colour;
void main() {
  float amount = 1.0;
  if (vSpot.z > 1.5) amount = 1.0 - abs(vSpot.y);
  else if (vSpot.z > 0.5) amount = max(0.0, 1.0 - length(vSpot.xy));
  amount *= amount;
  // It hides what is under it by its cover, and adds its colour once for the cover and once more for its shine.
  colour = vec4(pow(vColour, vec3(1.0 / 2.2)) * (vWeight.x + vWeight.y) * amount, vWeight.x * amount);
}
`;

/** The dark a lying medal leaves on whatever it lies on, drawn from the same rows as the medals. */
export const CONTACT_VERTEX = `${HEAD}
layout(location = 0) in vec2 aCorner;
layout(location = 2) in vec4 aPlace;
layout(location = 4) in vec4 aLook;
uniform mat4 uCamera;
out vec3 vSpot;
void main() {
  vSpot = vec3(aCorner, aLook.y);
  vec3 world = vec3(aPlace.x + aCorner.x * ${(MEDAL_RADIUS * 1.55).toFixed(2)}, aLook.x + 0.045, aPlace.z + aCorner.y * ${(MEDAL_RADIUS * 1.55).toFixed(2)});
  gl_Position = aLook.y > 0.0 ? uCamera * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const CONTACT_FRAGMENT = `${HEAD}
in vec3 vSpot;
uniform float uDark;
out vec4 colour;
void main() {
  float near = smoothstep(1.0, 0.5, length(vSpot.xy));
  colour = vec4(0.0, 0.0, 0.0, near * vSpot.z * uDark);
}
`;

// ── The shadow map ──────────────────────────────────────────────────────────

const NOTHING = `${HEAD}
void main() {}
`;

export const MEDAL_SHADOW_VERTEX = `${HEAD}
layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec4 aPlace;
layout(location = 3) in vec4 aTurn;
uniform mat4 uSun;
${TURN}
void main() {
  gl_Position = uSun * vec4(aPlace.xyz + turned(aTurn, aPosition), 1.0);
}
`;

export const BEAD_SHADOW_VERTEX = `${HEAD}
layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec4 aPlace;
uniform mat4 uSun;
void main() {
  gl_Position = uSun * vec4(aPlace.xyz + aPosition * aPlace.w, 1.0);
}
`;

export const SOLID_SHADOW_VERTEX = `${HEAD}
layout(location = 0) in vec3 aPosition;
uniform mat4 uSun;
void main() {
  gl_Position = uSun * vec4(aPosition, 1.0);
}
`;

export const SHADOW_FRAGMENT = NOTHING;
