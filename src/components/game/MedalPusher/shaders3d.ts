/**
 * The shaders of the 3D field. Colours inside them are amounts of light, not
 * the numbers a screen is sent, so that light adds up the way it does in a
 * real cabinet; `finish` turns the sum into a pixel at the very end.
 *
 * Some things the shading language leaves to the driver, and a graphics card
 * does not complain about them: it just draws something else on somebody's
 * phone. So nothing here asks for one. `smoothstep` always has its lower
 * edge first (a falling one is written `1.0 - smoothstep(…)`), nothing below
 * zero is raised to a power, no two-argument `atan` is given two zeros, and
 * nothing is divided by what could be zero.
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
// How far apart the roof's lamps are, as a mirror turns from one row to the next and from one tube to the next, and how bright they are.
const float LAMP_ROW = 0.42;
const float LAMP_COLUMN = 0.5;
const float LAMP_HEAT = 3.0;

/** How much of the key light reaches a point: 1 in the open, 0 in full shadow, in between along a shadow's edge. */
float sunlit(vec3 world, vec3 normal) {
  vec4 seen = uSun * vec4(world + normal * 0.07, 1.0);
  // The map covers the tables, what stands on them and the feed arms over them. The housing of the screen, up the back wall, is outside it and in the open.
  if (max(abs(seen.x), max(abs(seen.y), abs(seen.z))) >= 1.0) return 1.0;
  vec3 at = seen.xyz * 0.5 + 0.5;
  float texel = uView.z;
  float lit = texture(uShadow, vec3(at.xy + texel * vec2(-0.75, -0.25), at.z));
  lit += texture(uShadow, vec3(at.xy + texel * vec2(0.25, -0.75), at.z));
  lit += texture(uShadow, vec3(at.xy + texel * vec2(0.75, 0.25), at.z));
  lit += texture(uShadow, vec3(at.xy + texel * vec2(-0.25, 0.75), at.z));
  return lit * 0.25;
}

/**
 * What a mirror in the cabinet shows when it looks along a direction, the
 * lamps apart: a dim roof, purple walls with a pink light to the left and a
 * cyan one to the right, and below, the dark between the medals. It is dim
 * on purpose: gold is only as bright as what it mirrors, and it glitters
 * when most of that is dark and a little of it is very bright.
 */
vec3 surroundings(vec3 r) {
  vec3 below = vec3(0.2, 0.115, 0.045);
  vec3 walls = vec3(0.3, 0.24, 0.4);
  vec3 roof = vec3(1.0, 0.95, 0.88) * mix(0.48, 0.74, smoothstep(0.25, 0.95, r.y));
  vec3 c = mix(below, walls, smoothstep(-0.45, 0.05, r.y));
  c = mix(c, roof, smoothstep(0.05, 0.5, r.y));
  c += vec3(1.0, 0.22, 0.55) * pow(max(dot(r, vec3(-0.88, 0.34, 0.33)), 0.0), 5.0) * 0.6;
  c += vec3(0.2, 0.78, 1.0) * pow(max(dot(r, vec3(0.88, 0.34, 0.33)), 0.0), 5.0) * 0.55;
  // The glass at the front lets the room in: a soft light on whatever turns to face the player.
  c += vec3(1.0, 0.93, 0.82) * pow(max(dot(r, vec3(0.0, 0.25, 0.97)), 0.0), 2.0) * 0.36;
  return c;
}

/**
 * The lamps under the cabinet's roof, as a mirror shows them: short bright
 * tubes in rows, each row half a tube along from the last. A medal's face
 * mirrors about one of them, and which part of it depends on how the medal
 * lies, so no two medals in a pile catch them alike. The rows drift slowly
 * back and forth — the last number of uView is how far, in rows — and the
 * glints they make travel across the pile with them.
 */
float lamps(vec3 r) {
  // A mirror looking straight along the field sees no lamp, and has no angle to work one out from.
  if (abs(r.y) + abs(r.z) < 1e-4) return 0.0;
  float row = atan(r.y, -r.z) / LAMP_ROW + uView.w;
  float along = r.x / LAMP_COLUMN + 0.5 * floor(row + 0.5);
  float tube = (1.0 - smoothstep(0.05, 0.42, abs(fract(row + 0.5) - 0.5))) * (1.0 - smoothstep(0.1, 0.48, abs(fract(along + 0.5) - 0.5)));
  return tube * smoothstep(0.08, 0.3, r.y);
}

/**
 * The lit pile itself, as a mirror standing on it shows it: low down at the
 * front left. It is what puts a bright stripe down the side of a medal or a
 * tower, even on the side the key lamp does not reach.
 */
vec3 pile(vec3 r) {
  return vec3(1.0, 0.84, 0.55) * pow(max(dot(r, vec3(-0.64, -0.68, 0.37)), 0.0), 4.0);
}

/** The light of the roof as a mirror shows it: the glow of the whole lit roof, widest toward the key lamp, and the lamps themselves, far brighter. */
vec3 lamp(vec3 r) {
  float toward = max(dot(r, uKey), 0.0);
  return KEY_COLOUR * (pow(toward, 4.0) * 0.45 + lamps(r) * LAMP_HEAT);
}

/** The same light on something too round to show the lamps one by one, like a ball: one soft gleam with a hot middle. */
vec3 gleam(vec3 r) {
  float toward = max(dot(r, uKey), 0.0);
  return KEY_COLOUR * (pow(toward, 4.5) * 1.2 + pow(toward, 40.0) * 1.3 + pow(toward, 400.0) * 8.0);
}

/** From the light that leaves a surface to the colour of its pixel. */
vec3 finish(vec3 c, vec3 world) {
  // The back of the cabinet is dimmer and a little hazy.
  float back = clamp(1.0 - world.z / 100.0, 0.0, 1.0);
  c = mix(c, vec3(0.06, 0.035, 0.13), back * back * 0.13) * (1.0 - 0.1 * back);
  // So are the corners of the glass.
  vec2 off = gl_FragCoord.xy * uView.xy - 0.5;
  c *= 1.0 - 0.42 * smoothstep(0.36, 0.86, length(off * vec2(1.0, 0.92)));
  // Light up to a point is shown as it is. Anything brighter is eased down instead of cut off, and it
  // keeps its colour as it is: bright gold stays a deep yellow instead of going pale. Only the very
  // brightest light loses its colour, so a glint off gold is white in the middle.
  c = max(c, 0.0);
  float most = max(max(c.r, c.g), max(c.b, 1e-4));
  c = mix(c, vec3(most), smoothstep(1.7, 4.2, most) * 0.9);
  c *= (min(most, 0.6) + 0.4 * (1.0 - exp(-max(most - 0.6, 0.0) / 0.4))) / most;
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
const vec3 GOLD = vec3(1.0, 0.64, 0.06);

void main() {
  vec3 flatNormal = normalize(vNormal);
  vec3 n = flatNormal;
  float face = smoothstep(0.9, 0.99, abs(n.y));
  float hollow = 1.0;
  float steep = 0.0;
  if (face > 0.0) {
    // The relief struck into the face: it bends the light, what stands up is a little brighter, and
    // the foot of every edge is dark with wear, which is what draws the star and the ring from far off.
    vec4 relief = texture(uRelief, vLocal.xz / ${(MEDAL_RADIUS * 2).toFixed(2)} + 0.5);
    // The face is struck a hair domed, so a lamp is mirrored on a part of it and not all over it.
    vec2 lean = (relief.xy * 2.0 - 1.0 + vLocal.xz * ${(0.12 / MEDAL_RADIUS).toFixed(4)}) * face;
    n = normalize(vec3(lean.x, n.y * sqrt(max(1.0 - dot(lean, lean), 0.05)), lean.y));
    steep = relief.a * face;
    hollow = mix(1.0, (0.9 + 0.18 * relief.z) * (1.0 - 0.55 * relief.a), face);
  } else {
    // The milled rim, as long as its ridges are wide enough to see.
    float around = atan(vLocal.z, vLocal.x);
    float fine = clamp(1.4 - fwidth(around) * 30.0, 0.0, 1.0);
    n = normalize(n + vec3(-sin(around), 0.0, cos(around)) * sin(around * 88.0) * 0.4 * fine);
  }
  vec3 normal = turned(vTurn, n);
  vec3 solid = turned(vTurn, flatNormal);
  vec3 toEye = normalize(uEye - vWorld);
  // Two directions of length one can come out a hair more than 1 apart, and 1 minus that is raised to a power below.
  float facing = clamp(dot(normal, toEye), 0.03, 1.0);
  vec3 mirrored = reflect(-toEye, normal);

  float lit = smoothstep(0.0, 0.2, dot(solid, uKey));
  if (lit > 0.0) lit *= sunlit(vWorld, solid);

  // No two medals are quite the same gold.
  vec3 gold = GOLD * mix(vec3(0.8, 0.72, 0.6), vec3(1.08, 1.12, 1.3), vOwn.x);
  vec3 sheen = gold + (1.0 - gold) * pow(1.0 - facing, 5.0);
  // Gold seen in gold is deeper gold: the darker what a medal mirrors, the more orange it turns.
  vec3 seen = surroundings(mirrored) * mix(0.5, 1.0, lit) * hollow;
  seen *= mix(vec3(1.0, 0.8, 0.5), vec3(1.0), smoothstep(0.1, 0.6, dot(seen, vec3(0.3, 0.5, 0.2))));
  // A lamp shows on the smooth of the face and on the rounded edge, not in every nick of the relief: that would only be glitter.
  vec3 c = sheen * (seen + pile(mirrored) * 1.15 + lamp(mirrored) * lit * (1.0 - 0.8 * steep));
  // The rounded edge between face and rim turns through every angle, so somewhere along it the key lamp
  // is mirrored straight at the player: a thin bright arc on the side of the medal the lamp is on.
  float rounded = (1.0 - face) * smoothstep(0.4, 0.62, flatNormal.y);
  c += sheen * KEY_COLOUR * pow(max(dot(mirrored, uKey), 0.0), 7.0) * 4.5 * lit * rounded;
  colour = vec4(finish(c * vOwn.y, vWorld), 1.0);
}
`;

// ── Jewels ──────────────────────────────────────────────────────────────────

/**
 * A jewel is drawn from rows like a medal's and by the medal's own vertex
 * shader: only what a face of it looks like is its own. Its faces are flat,
 * so every point of one has the same way to face.
 */
export const JEWEL_FRAGMENT = `${HEAD}
in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec4 vTurn;
flat in vec2 vOwn;
out vec4 colour;
${WORLD}
${TURN}
// The colour of the stone: what is left of white light that has been through it.
const vec3 ROSE = vec3(1.0, 0.07, 0.42);

/**
 * How bright one colour of the light is that comes back out through a face.
 * It went into the stone, was bent on the way in — each colour a little
 * differently, which is the fire in a stone — and was thrown back up by the
 * pavilion under the face. So what a face shows is a patch of the roof, and
 * a lamp when there is one in it; and as the lamps drift, the faces flash by
 * turns, and not all in one colour.
 */
float through(vec3 toEye, vec3 normal, vec3 pavilion, float bend) {
  vec3 back = reflect(refract(-toEye, normal, bend), pavilion);
  // A cut stone is all contrast: a face that shows the dim walls is dark, and one that shows the roof is bright.
  float room = dot(surroundings(back), vec3(0.42));
  return lamps(back) * LAMP_HEAT * 0.6 + room * room;
}

void main() {
  vec3 normal = turned(vTurn, normalize(vNormal));
  vec3 toEye = normalize(uEye - vWorld);
  float facing = clamp(dot(normal, toEye), 0.03, 1.0);
  vec3 mirrored = reflect(-toEye, normal);
  float toward = max(dot(normal, uKey), 0.0);
  float lit = smoothstep(0.0, 0.2, toward);
  if (lit > 0.0) lit *= sunlit(vWorld, normal);
  // The pavilion under this point of the crown is a mirror that leans in toward the stone's own axis.
  vec2 outward = vLocal.xz / max(length(vLocal.xz), 0.35);
  vec3 pavilion = turned(vTurn, normalize(vec3(-outward.x * 0.5, 0.86, -outward.y * 0.5)));
  vec3 fire = vec3(through(toEye, normal, pavilion, 0.6), through(toEye, normal, pavilion, 0.64), through(toEye, normal, pavilion, 0.68));
  // What the stone lets through of that, and a glow of its own colour, so that a face with nothing bright behind it is deep rose and not black.
  // A face seen at a slant is looked into the long way, and is the deeper for it.
  vec3 c = (fire * ROSE * (0.24 + 0.36 * lit) + ROSE * (0.14 + 0.36 * toward * lit)) * (0.62 + 0.38 * facing);
  // The polish on the face itself mirrors the cabinet: little seen square on, more at a slant. A face that
  // catches a lamp, or the key lamp itself, flashes nearly white.
  float sheen = 0.03 + 0.45 * pow(1.0 - facing, 5.0);
  vec3 flash = vec3(1.0, 0.86, 0.94) * (lamps(mirrored) * LAMP_HEAT * 0.26 + pow(max(dot(mirrored, uKey), 0.0), 90.0) * 5.0);
  c = c * (1.0 - sheen) + sheen * surroundings(mirrored) + flash * lit;
  colour = vec4(finish(c * vOwn.y, vWorld), 1.0);
}
`;

// ── Balls, studs and bulbs ──────────────────────────────────────────────────

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
  float facing = clamp(dot(normal, toEye), 0.0, 1.0);
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
      // A stud on the screen's housing: polished metal.
      c = vPaint.rgb * (surroundings(mirrored) * 1.9 + gleam(mirrored) * 0.6 + 0.12);
    } else {
      // A prize ball: glossy pink, with a star on the side the player sees.
      vec3 up = normalize(vec3(0.0, 0.55, 0.84));
      vec2 on = vec2(dot(normal, vec3(1.0, 0.0, 0.0)), dot(normal, cross(up, vec3(1.0, 0.0, 0.0))));
      float edge = dot(normal, up) > 0.0 ? star(vec2(on.x, -on.y) * 1.05, 0.52) : 1.0;
      vec3 body = mix(vec3(0.95, 0.04, 0.26), vec3(0.3, 0.0, 0.07), 1.0 - smoothstep(-0.7, 0.5, normal.y));
      vec3 paint = mix(vec3(1.0, 0.86, 0.4), body, smoothstep(-0.012, 0.012, edge));
      paint = mix(vec3(0.24, 0.0, 0.07), paint, smoothstep(0.012, 0.03, abs(edge)));
      float wrap = clamp(toward * 0.6 + 0.4, 0.0, 1.0);
      // Deeper in colour toward its edge, as a ball of tinted plastic is.
      c = paint * (0.32 + wrap * mix(0.35, 1.0, lit)) * mix(1.0, 0.5, pow(1.0 - facing, 2.0));
      float glaze = 0.04 + 0.96 * pow(1.0 - facing, 4.0);
      c += surroundings(mirrored) * glaze * 0.3 + gleam(mirrored) * lit * 0.5;
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
  float facing = clamp(dot(normal, toEye), 0.0, 1.0);
  vec3 mirrored = reflect(-toEye, normal);
  float toward = dot(normal, uKey);
  float lit = smoothstep(0.0, 0.15, toward);
  if (lit > 0.0) lit *= sunlit(vWorld, normal);
  // Paint: lit by the key lamp where it reaches, and by the glow of the cabinet everywhere.
  vec3 matte = paint * (0.52 + KEY_COLOUR * max(toward, 0.0) * lit * 0.92);
  // Metal: its own colour of whatever it mirrors.
  vec3 metal = paint * ((surroundings(mirrored) + pile(mirrored) * 0.6) * mix(0.6, 1.0, lit) * 1.9 + lamp(mirrored) * lit * 0.3);
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
  // At the edge of a touch a colour between black and another can come out a hair below black.
  colour = vec4(pow(max(vColour, 0.0), vec3(1.0 / 2.2)) * (vWeight.x + vWeight.y) * amount, vWeight.x * amount);
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
  float near = 1.0 - smoothstep(0.5, 1.0, length(vSpot.xy));
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
