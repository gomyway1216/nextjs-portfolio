/**
 * What a medal looks like, for everything in the game that draws one: the 3D
 * field, the canvas field, the tray on the control panel, the stacks on the
 * screen, the instruction plate and the diagram on the Odds tab. Only how a
 * medal looks is here. How big it is and how it moves are the engine's.
 *
 * A real arcade medal is a disc of copper-nickel, about 25 mm across and not
 * quite 2 mm thick, with a raised rim and a design struck into its face. New,
 * it is a bright, cool grey; the machine dulls it. In a heap under a
 * cabinet's lamps most of them are a dull nickel grey, a few are still bright,
 * some have gone darker with years of hands and the dirt of the machine, and
 * now and then one is faintly warm. Every medal keeps the tone its number
 * gives it, so nothing flickers. Gold in this game is for what is lit — the
 * gold spins, the lucky lamp, the jackpot, the cabinet's trim — and a medal
 * is never gold.
 */

const TAU = Math.PI * 2;

// ── The 3D field ────────────────────────────────────────────────────────────

/**
 * How much of the light that falls on it the metal mirrors, red, green and
 * blue, in the shader's units (amounts of light, before the picture is
 * finished). Copper-nickel that has been round a machine: a grey that
 * mirrors a little under half of what it sees, far from the near-white of
 * silver or chrome. The lamps are warm, so it is written a hair cool, and
 * comes out a cool, neutral grey under them.
 */
export const NICKEL = [0.43, 0.445, 0.465] as const;

/**
 * How the medals of a heap differ, as shares of all of them, each medal's
 * share fixed by its number. A few are still bright from the hopper and
 * mirror the lamps one by one; some have gone dark; a few are faintly warm;
 * the rest are dulled, from a little to a good deal (the shader spreads them
 * between `polish.dull` and `polish.worn`). The tints multiply the metal.
 */
export const WEAR = {
  bright: 0.14,
  dark: 0.12,
  warm: 0.07,
  polish: { bright: 0.95, worn: 0.75, dull: 0.15, dark: 0.12 },
  darkTint: [0.5, 0.5, 0.49],
  warmTint: [1.04, 0.96, 0.87],
} as const;

/**
 * The heap as a medal or the cabinet's metal mirrors it: lit grey where the
 * lamps fall on it, and nearly black in the gaps between the medals.
 */
export const HEAP_SEEN = { lit: [0.84, 0.85, 0.88], gaps: [0.1, 0.1, 0.106] } as const;

/** The numbers of a colour in a shader's source: `vec3(0.62, 0.61, 0.59)`. */
export const glsl = (rgb: readonly [number, number, number]): string => `vec3(${rgb.map((value) => value.toFixed(3)).join(', ')})`;

/**
 * The design struck into a medal's face, as the corners of an outline in
 * shares of the medal's radius, from the top round to the right: a star of
 * four long points and four short ones, a cross with a star between its arms,
 * as the medals of a real station read from a step away.
 */
export const FACE_STAR: readonly (readonly [number, number])[] = Array.from({ length: 16 }, (_, i) => {
  const radius = i % 2 === 1 ? 0.16 : i % 4 === 0 ? 0.5 : 0.31;
  const angle = -Math.PI / 2 + (i * Math.PI) / 8;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
});

// ── The canvas field ────────────────────────────────────────────────────────

/**
 * The paints of a medal on a canvas, from its brightest to its darkest: the
 * glint, the lit and middle and shaded parts of its face, the deep side of
 * its raised rim, and its edge (what is seen of its thickness).
 */
export const MEDAL_PAINT = {
  glint: '#ffffff',
  light: '#eef1f5',
  face: '#b8bec7',
  dark: '#7d848d',
  rim: '#666c75',
  edge: '#40444b',
} as const;

/** What a tower's column is shaded with across it, left to right, and the line between one medal and the next. */
export const TOWER_PAINT = {
  stops: [
    [0, '#33363c'],
    [0.28, '#eceff3'],
    [0.42, '#c3c8cf'],
    [0.7, '#858b94'],
    [1, '#2f3237'],
  ],
  seam: 'rgba(22, 24, 30, 0.55)',
} as const satisfies { stops: readonly (readonly [number, string])[]; seam: string };

/** The shading across a tower's column, from its left edge to its right. */
export function towerShade(g: CanvasRenderingContext2D, left: number, right: number): CanvasGradient {
  const shade = g.createLinearGradient(left, 0, right, 0);
  for (const [at, colour] of TOWER_PAINT.stops) shade.addColorStop(at, colour);
  return shade;
}

/** The dark a medal of the upper tier throws on the medals it lies on, and what a medal on its way into the dark fades to. */
export const MEDAL_SHADE = { onMedals: 'rgba(10, 12, 18, 0.42)', dark: '#0c0d10' } as const;

/** Traces the design on a medal's face (`FACE_STAR`) at `cx`, `cy`, `radius` being the medal's. */
export function faceStarPath(g: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  g.beginPath();
  for (const [x, y] of FACE_STAR) g.lineTo(cx + x * radius, cy + y * radius);
  g.closePath();
}

/**
 * One medal seen from straight above, drawn once and stamped wherever a medal
 * lies: a face of nickel, lit from the upper left, with a milled edge, a
 * raised rim, a ring of beads and the star struck into it. Raised parts are
 * drawn as a die strikes them: a bright edge toward the light and a dark one
 * away from it.
 */
export function strikeMedal(): HTMLCanvasElement {
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.translate(size / 2, size / 2);
  const r = size / 2 - 1;
  const circle = (radius: number, x = 0, y = 0) => {
    g.beginPath();
    g.arc(x, y, radius, 0, TAU);
  };

  const body = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
  body.addColorStop(0, '#f7f9fb');
  body.addColorStop(0.35, '#d0d5dc');
  body.addColorStop(0.8, '#a3a9b2');
  body.addColorStop(1, '#7b818a');
  g.fillStyle = body;
  circle(r);
  g.fill();

  // The milled edge.
  g.strokeStyle = 'rgba(46, 50, 58, 0.5)';
  g.lineWidth = r * 0.03;
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * TAU;
    g.beginPath();
    g.moveTo(Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9);
    g.lineTo(Math.cos(angle) * r * 0.99, Math.sin(angle) * r * 0.99);
    g.stroke();
  }
  // The raised rim: dark on the side away from the light, bright on the side toward it, and its top between.
  g.lineWidth = r * 0.075;
  g.strokeStyle = 'rgba(52, 56, 64, 0.75)';
  circle(r * 0.85, r * 0.025, r * 0.03);
  g.stroke();
  g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  circle(r * 0.85, -r * 0.02, -r * 0.025);
  g.stroke();
  g.lineWidth = r * 0.05;
  g.strokeStyle = '#bfc5cd';
  circle(r * 0.85);
  g.stroke();
  // A ring of beads, and a fine ring inside it.
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * TAU;
    const [x, y] = [Math.cos(angle) * r * 0.7, Math.sin(angle) * r * 0.7];
    g.fillStyle = 'rgba(58, 62, 70, 0.6)';
    circle(r * 0.03, x + r * 0.012, y + r * 0.014);
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.7)';
    circle(r * 0.022, x - r * 0.008, y - r * 0.01);
    g.fill();
  }
  g.lineWidth = r * 0.028;
  g.strokeStyle = 'rgba(64, 68, 78, 0.5)';
  circle(r * 0.6);
  g.stroke();
  // The star: a dark copy below and to the right, a bright one above and to the left, the face on top.
  for (const [dx, dy, fill] of [
    [r * 0.04, r * 0.045, 'rgba(40, 44, 52, 0.75)'],
    [-r * 0.032, -r * 0.036, '#fbfcfd'],
    [0, 0, '#c4c9d0'],
  ] as const) {
    faceStarPath(g, dx, dy, r);
    g.fillStyle = fill;
    g.fill();
  }
  // A glint across the upper left.
  const glint = g.createLinearGradient(-r, -r, r * 0.2, r * 0.2);
  glint.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  glint.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  g.fillStyle = glint;
  circle(r * 0.98);
  g.fill();
  return canvas;
}

/**
 * What is laid over a medal's face to give each of the tones a medal can
 * have gone to in the machine. The first is laid over every medal: nickel
 * under the cabinet's lamps, a little cooler and duller than the struck face.
 * Over that, one more for a medal that is still bright, one that is dulled,
 * one that has gone dark, and one that is faintly warm.
 */
export const FACES = ['rgba(108, 116, 128, 0.14)', 'rgba(255, 255, 255, 0.24)', 'rgba(62, 64, 68, 0.3)', 'rgba(30, 30, 30, 0.5)', 'rgba(170, 118, 66, 0.2)'] as const;

/** Which of `FACES` a medal has, fixed by its id: of sixteen medals, six as they are, three bright, four dulled, two dark and one warm. */
export function faceOf(id: number): number {
  const lot = (Math.imul(id, 0x9e3779b1) >>> 0) % 16;
  return lot < 6 ? 0 : lot < 9 ? 1 : lot < 13 ? 2 : lot < 15 ? 3 : 4;
}

// ── The screen, the plate and the tabs ──────────────────────────────────────

/** A stack of medals as the screen draws it: the line round each, the edge of each under the top one, and the top one's face and its shine. */
export const SCREEN_STACK = { line: '#3a3e45', edge: '#959ca5', face: '#d4d8de', shine: '#f6f7f9' } as const;

/** A medal on the instruction plate, printed in flat inks: its face, its middle, and its rim under the face. */
export const PLATE_SILVER = { face: '#a5acb6', light: '#dde1e6', dark: '#636a74' } as const;
