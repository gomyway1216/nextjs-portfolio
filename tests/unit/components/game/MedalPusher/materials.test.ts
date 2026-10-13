import { afterEach, describe, expect, it, vi } from 'vitest';

import { BRUSH_STROKES, paintTable, paintWall } from '@/components/game/MedalPusher/art3d';
import { FLAT_STRIDE, Flat, MATERIAL, SHAPE, SOLID_STRIDE, Solid, buildCabinet, buildTouches } from '@/components/game/MedalPusher/cabinet3d';
import { FIELD, createMachine, pusherFront } from '@/components/game/MedalPusher/engine';
import { FACES, GLASS, POOL, SCREEN_GLOW, createStage, drawOverlay, faceOf, glassShift, paintStage, trackMedals } from '@/components/game/MedalPusher/render';
import { SLOW, createScene3d } from '@/components/game/MedalPusher/render3d';
import * as shaders from '@/components/game/MedalPusher/shaders3d';
import { HEIGHT, VIEW } from '@/components/game/MedalPusher/view';

afterEach(() => vi.unstubAllGlobals());

/** What was done to a canvas that draws nothing: every call with what it was given, and every colour it was told to fill or stroke with. */
interface Drawn {
  calls: { name: string; args: unknown[] }[];
  fills: string[];
  strokes: string[];
  stops: string[];
}

/** A 2D context that writes down what it is asked to do. */
function recorder(): { context: CanvasRenderingContext2D; drawn: Drawn } {
  const drawn: Drawn = { calls: [], fills: [], strokes: [], stops: [] };
  const gradient = { addColorStop: (_at: number, colour: string) => void drawn.stops.push(colour) };
  const context = new Proxy(
    {},
    {
      get:
        (_target, name: string) =>
        (...args: unknown[]) => {
          drawn.calls.push({ name, args });
          return name.startsWith('create') ? gradient : undefined;
        },
      set: (_target, name: string, value: unknown) => {
        if (name === 'fillStyle' && typeof value === 'string') drawn.fills.push(value);
        if (name === 'strokeStyle' && typeof value === 'string') drawn.strokes.push(value);
        return true;
      },
    },
  );
  return { context: context as unknown as CanvasRenderingContext2D, drawn };
}

/** A document whose canvases all draw on recorders, the newest last. */
function recordingDocument(): Drawn[] {
  const made: Drawn[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const { context, drawn } = recorder();
      made.push(drawn);
      return { width: 0, height: 0, getContext: () => context };
    },
  });
  return made;
}

const UNIFORMS = ['uCamera', 'uSun', 'uEye', 'uKey', 'uView', 'uGlow', 'uField', 'uShadow', 'uArt', 'uRelief', 'uDark'];

/** A WebGL2 context that draws nothing and writes down the four-number uniforms it is sent, by name. */
function fakeGl(): { gl: WebGL2RenderingContext; sent: { name: string; values: number[] }[] } {
  const sent: { name: string; values: number[] }[] = [];
  const constants = new Map<string, number>([['NO_ERROR', 0]]);
  const own: Record<string, unknown> = {
    drawingBufferWidth: 640,
    drawingBufferHeight: 860,
    getError: () => 0,
    getExtension: () => null,
    getShaderParameter: () => true,
    getProgramParameter: (_program: unknown, what: number) => (what === constants.get('ACTIVE_UNIFORMS') ? UNIFORMS.length : true),
    getActiveUniform: (_program: unknown, index: number) => ({ name: UNIFORMS[index] }),
    getUniformLocation: (_program: unknown, name: string) => name,
    uniform4f: (name: string | null, ...values: number[]) => void (name && sent.push({ name, values })),
  };
  const gl = new Proxy(own, {
    get(target, name: string) {
      if (name in target) return target[name];
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
        if (!constants.has(name)) constants.set(name, 1000 + constants.size);
        return constants.get(name);
      }
      if (name === 'checkFramebufferStatus') return () => constants.get('FRAMEBUFFER_COMPLETE');
      return () => (name.startsWith('create') ? {} : undefined);
    },
  });
  // The constants a status is compared with are asked for before the status is.
  void (gl as unknown as WebGL2RenderingContext).FRAMEBUFFER_COMPLETE;
  void (gl as unknown as WebGL2RenderingContext).ACTIVE_UNIFORMS;
  return { gl: gl as unknown as WebGL2RenderingContext, sent };
}

/** The last value sent for a uniform. */
const lastOf = (sent: { name: string; values: number[] }[], name: string): number[] | undefined => sent.filter((one) => one.name === name).at(-1)?.values;

describe('the medals’ metal', () => {
  const medal = shaders.MEDAL_FRAGMENT;

  it('is brass, far less yellow than the gilt it was, and no two medals the same', () => {
    const [, r, g, b] = /const vec3 BRASS = vec3\(([\d.]+), ([\d.]+), ([\d.]+)\);/.exec(medal)?.map(Number) ?? [];
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThan(b);
    // The gilt had hardly any blue in it at all (0.06): that is what made it the yellow of a sweet wrapper.
    expect(b).toBeGreaterThan(0.2);
    expect((r - b) / r).toBeLessThan(0.8);
    expect(medal).not.toContain('vec3(1.0, 0.64, 0.06)');
    // Each medal has its own wear and its own kind, worked out from the one number that is its own.
    expect(medal).toContain('float wear = own(1.0);');
    expect(medal).toContain('float kind = own(2.0);');
    expect(medal).toMatch(/float polish = kind > 0\.\d+ && kind < 0\.\d+ \? 0\.95 : mix\(0\.8, 0\.22, wear\);/);
    // Tarnished ones and redder ones are the few, at either end.
    expect(medal).toMatch(/if \(kind < 0\.125\) metal \*= vec3\(/);
    expect(medal).toMatch(/else if \(kind > 0\.9\d*\) metal \*= vec3\(/);
  });

  it('takes the light from near by as well as the roof’s, and less of the roof’s away from the middle of the field', () => {
    expect(medal).toContain('pool(vWorld)');
    expect(medal).toContain('nearLight(vWorld, solid)');
    expect(medal).toContain('lipGlints(vWorld, mirrored, polish)');
    expect(shaders.SOLID_FRAGMENT).toContain('nearLight(vWorld, normal)');
    expect(shaders.SOLID_FRAGMENT).toContain('pool(vWorld)');
    // The pool is brightest where the pusher meets the lower table and never dims a place by more than half.
    const [, least] = /return 1\.0 - (0\.\d+) \* smoothstep\(14\.0, 60\.0, length\(off\)\);/.exec(medal) ?? [];
    expect(Number(least)).toBeGreaterThan(0.2);
    expect(Number(least)).toBeLessThan(0.5);
  });

  it('gives every shader that knows the cabinet the screen’s glow and the pusher’s place', () => {
    const worldly = Object.entries(shaders).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].includes('uniform vec4 uView;'));
    expect(worldly.length).toBeGreaterThanOrEqual(4);
    for (const [name, source] of worldly) {
      expect(source, name).toContain('uniform vec4 uGlow;');
      expect(source, name).toContain('uniform vec4 uField;');
      // The glow is one colour and one level, multiplied: nothing else in a shader says what the screen is doing.
      expect(source, name).toContain('uGlow.rgb * uGlow.a');
    }
  });

  it('leaves out of the plain picture what a slow device cannot afford', () => {
    // One look at the shadow map instead of four.
    expect(medal).toContain('if (uField.y < 0.5) return texture(uShadow, at);');
    // No glints of the lamps under the lip, no blotches on a face, and print that is sharp to the back.
    expect(medal).toMatch(/vec3 lipGlints\(vec3 world, vec3 r, float polish\) \{\s*if \(uField\.y < 0\.5\) return vec3\(0\.0\);/);
    expect(medal).toMatch(/if \(uField\.y > 0\.5\) \{[^}]*blotch\(/);
    expect(shaders.SOLID_FRAGMENT).toContain('texture(uArt, vSpot, uField.y * 1.5 * (1.0 - smoothstep(0.0, 24.0, vWorld.z)))');
    // The grain is a trace on the full picture and the old hair's breadth on the plain one: at most 2.6 parts in 255, and still.
    expect(medal).toContain('* (1.0 + 1.6 * uField.y) / 255.0');
    expect(medal).not.toMatch(/gl_FragCoord\.xy[^;]*uView\.w/);
  });
});

describe('the light the scene is given', () => {
  /** Tests that draw some hundreds of frames get room on a slow machine. */
  const LONG = 30_000;
  /** A scene on a card that draws nothing, with its first frame drawn. `bare` clears the field, for a test that only counts frames. */
  const frame = (options: Parameters<ReturnType<typeof createScene3d>['draw']>[2], now?: () => number, bare = false) => {
    recordingDocument();
    const { gl, sent } = fakeGl();
    const scene = createScene3d(gl, now);
    const machine = createMachine(7, 2, 2);
    if (bare) machine.medals = [];
    const stage = createStage(1, false);
    trackMedals(stage, machine, 0);
    scene.draw(stage, machine, options);
    return { scene, sent, machine, stage };
  };

  it('is the screen’s idle glow unless the cabinet says otherwise, as one uniform: a colour and a level', () => {
    const idle = frame({ showGuide: true });
    expect(lastOf(idle.sent, 'uGlow')).toEqual([...SCREEN_GLOW.colour, SCREEN_GLOW.level]);
    expect(SCREEN_GLOW.level).toBeGreaterThan(0);
    expect(SCREEN_GLOW.level).toBeLessThan(0.6);
    const gold = frame({ showGuide: true, glow: { colour: [1, 0.8, 0.3], level: 1.1 } });
    expect(lastOf(gold.sent, 'uGlow')).toEqual([1, 0.8, 0.3, 1.1]);
    // Every program drawn in the frame was told the same.
    const told = gold.sent.filter((one) => one.name === 'uGlow');
    expect(told.length).toBeGreaterThanOrEqual(6);
    for (const one of told) expect(one.values).toEqual([1, 0.8, 0.3, 1.1]);
    // A dark screen throws nothing.
    expect(lastOf(frame({ showGuide: true, glow: { colour: [1, 1, 1], level: 0 } }).sent, 'uGlow')?.[3]).toBe(0);
  });

  it('is told where the pusher’s front is, for the lamps under its lip, and whether the picture is the full one', () => {
    const { scene, sent, machine, stage } = frame({ showGuide: true });
    expect(lastOf(sent, 'uField')).toEqual([pusherFront(machine.time), 1, 0, 0]);
    expect(scene.last.plain).toBe(false);
    // Asked for the plain picture, it draws that one, for that frame.
    scene.draw(stage, machine, { showGuide: true, plain: true });
    expect(lastOf(sent, 'uField')?.[1]).toBe(0);
    expect(scene.last.plain).toBe(true);
    scene.draw(stage, machine, { showGuide: true });
    expect(lastOf(sent, 'uField')?.[1]).toBe(1);
    expect(scene.last.plain).toBe(false);
  });

  it('drops to the plain picture when frames have come slowly for a while, and stays there', { timeout: LONG }, () => {
    expect(SLOW.milliseconds).toBeGreaterThan(1000 / 60);
    expect(SLOW.milliseconds).toBeLessThan(1000 / 30);
    let clock = 0;
    const { scene, machine, stage } = frame({ showGuide: true }, () => clock, true);
    const run = (frames: number, apart: number) => {
      for (let i = 0; i < frames; i++) {
        clock += apart;
        scene.draw(stage, machine, { showGuide: true });
      }
    };
    // A window at sixty frames a second: the full picture.
    run(SLOW.frames, 1000 / 60);
    expect(scene.last.plain).toBe(false);
    // A window that is mostly slow frames comes to more than the limit on average, and the picture is given up at its end.
    run(SLOW.frames - 1, 40);
    expect(scene.last.plain).toBe(false);
    run(2, 40);
    expect(scene.last.plain).toBe(true);
    // It is not tried again, however fast the frames come afterwards.
    run(SLOW.frames, 1000 / 120);
    expect(scene.last.plain).toBe(true);
  });

  it('does not take a page that was out of sight, or one slow frame, for a slow device', { timeout: LONG }, () => {
    let clock = 0;
    const { scene, machine, stage } = frame({ showGuide: true }, () => clock, true);
    // A frame every half second is a page being woken now and then: none of them is counted, however many there are.
    for (let i = 0; i < SLOW.frames + 10; i++) {
      clock += SLOW.pause * 2;
      scene.draw(stage, machine, { showGuide: true });
    }
    expect(scene.last.plain).toBe(false);
    // One frame in ten that takes three times as long does not bring the average over the limit.
    for (let i = 0; i < SLOW.frames * 2; i++) {
      clock += i % 10 === 0 ? 50 : 1000 / 60;
      scene.draw(stage, machine, { showGuide: true });
    }
    expect(0.1 * 50 + 0.9 * (1000 / 60)).toBeLessThan(SLOW.milliseconds);
    expect(scene.last.plain).toBe(false);
  });
});

describe('the lamps under the pusher’s lip', () => {
  const { LIP_LAMPS } = shaders;

  it('are two, low on the pusher’s face to either side of the catcher, and travel with it', () => {
    expect(LIP_LAMPS.inset).toBeGreaterThan(FIELD.width * 0.08);
    expect(LIP_LAMPS.inset).toBeLessThan(FIELD.width * 0.25);
    expect(LIP_LAMPS.below).toBeGreaterThan(0);
    expect(LIP_LAMPS.below).toBeLessThan(HEIGHT.pusher);
    // The shaders light the heap from exactly there: the same numbers are written into them.
    const medal = shaders.MEDAL_FRAGMENT;
    expect(medal).toContain(`const float LIP_LAMP_OUT = ${LIP_LAMPS.inset.toFixed(1)};`);
    expect(medal).toContain(`const float LIP_LAMP_HIGH = ${(HEIGHT.pusher - LIP_LAMPS.below).toFixed(2)};`);
    expect(medal).toContain(`LIP_LAMP_HIGH, uField.x + ${LIP_LAMPS.before.toFixed(1)});`);
    // Only what is under the lip and out in front of the pusher is lit by them.
    expect(medal).toContain('* step(uField.x - 0.5, world.z);');
  });

  it('are drawn where they shine from: a bulb and its glare each, wherever the pusher has got to', () => {
    recordingDocument();
    const stage = createStage(1, false);
    for (const time of [0, 1.3, 2.9]) {
      const machine = createMachine(7, 2, 2);
      machine.time = time;
      const front = pusherFront(time);
      const flat = new Flat(1200);
      buildTouches(flat, machine, front, stage, { showGuide: false });
      // The spots that stand at the lamps' depth, by where their middles are.
      const spots = new Map<string, { shine: number; wide: number }[]>();
      for (let corner = 0; corner < flat.count; corner += 6) {
        const at = corner * FLAT_STRIDE;
        const [x0, y0, z, shape] = [flat.data[at], flat.data[at + 1], flat.data[at + 2], flat.data[at + 10]];
        const [x1, y1] = [flat.data[at + 2 * FLAT_STRIDE], flat.data[at + 2 * FLAT_STRIDE + 1]];
        if (shape !== SHAPE.spot || Math.abs(z - (front + LIP_LAMPS.before)) > 0.05) continue;
        const key = `${((x0 + x1) / 2).toFixed(2)},${((y0 + y1) / 2).toFixed(2)}`;
        spots.set(key, [...(spots.get(key) ?? []), { shine: flat.data[at + 7], wide: Math.abs(x1 - x0) }]);
      }
      const height = (HEIGHT.pusher - LIP_LAMPS.below).toFixed(2);
      expect([...spots.keys()].sort()).toEqual([`${LIP_LAMPS.inset.toFixed(2)},${height}`, `${(FIELD.width - LIP_LAMPS.inset).toFixed(2)},${height}`]);
      for (const lamp of spots.values()) {
        // A wide soft glare and a small bulb, brighter, in the middle of it. Neither hides anything: they are light.
        expect(lamp).toHaveLength(2);
        const [glare, bulb] = lamp;
        expect(glare.wide).toBeGreaterThan(bulb.wide * 3);
        expect(bulb.shine).toBeGreaterThan(glare.shine);
      }
    }
  });
});

describe('what the cabinet is made of', () => {
  it('names the finishes a part can be given, each within what the shader takes', () => {
    expect(Object.keys(MATERIAL)).toEqual(['chrome', 'brushedSteel', 'brass', 'enamel', 'plastic', 'rubber', 'backlit', 'lamp']);
    for (const [name, { gloss, glow }] of Object.entries(MATERIAL)) {
      expect(gloss, name).toBeGreaterThanOrEqual(0);
      expect(gloss, name).toBeLessThanOrEqual(1);
      expect(glow, name).toBeGreaterThanOrEqual(0);
    }
    // From a mirror down to something that mirrors nothing.
    expect(MATERIAL.chrome.gloss).toBe(1);
    expect(MATERIAL.brass.gloss).toBeGreaterThan(MATERIAL.brushedSteel.gloss);
    expect(MATERIAL.brushedSteel.gloss).toBeGreaterThan(MATERIAL.enamel.gloss);
    expect(MATERIAL.enamel.gloss).toBeGreaterThan(MATERIAL.plastic.gloss);
    expect(MATERIAL.plastic.gloss).toBeGreaterThan(MATERIAL.rubber.gloss);
    // Only what has a lamp in it or behind it gives light of its own.
    expect(Object.entries(MATERIAL).filter(([, { glow }]) => glow > 0).map(([name]) => name)).toEqual(['backlit', 'lamp']);
  });

  it('puts a material on the surfaces that follow, in the two numbers every corner carries', () => {
    const solid = new Solid(12);
    solid.as(MATERIAL.chrome).paint([0.9, 0.9, 1]).quad(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0);
    solid.as(MATERIAL.backlit).quad(0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1);
    expect(solid.count).toBe(12);
    const finishOf = (corner: number) => [solid.data[corner * SOLID_STRIDE + 11], solid.data[corner * SOLID_STRIDE + 12]];
    for (let corner = 0; corner < 6; corner++) expect(finishOf(corner)).toEqual([1, 0]);
    for (let corner = 6; corner < 12; corner++) expect(finishOf(corner)).toEqual([Math.fround(MATERIAL.backlit.gloss), Math.fround(MATERIAL.backlit.glow)]);
  });

  it('makes the lower table of brushed steel', () => {
    const still = new Solid(600);
    const table = buildCabinet(still).find((part) => part.art === 'table');
    expect(table?.count).toBe(6);
    for (let corner = table?.first ?? 0; corner < (table?.first ?? 0) + 6; corner++) {
      expect(still.data[corner * SOLID_STRIDE + 11]).toBe(Math.fround(MATERIAL.brushedSteel.gloss));
      expect(still.data[corner * SOLID_STRIDE + 12]).toBe(0);
    }
  });
});

describe('what is printed and worn on the cabinet', () => {
  /** The red, green and blue of a colour written as #rrggbb. */
  const parts = (hex: string): number[] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

  it('paints the lower table as a sheet of steel: grey, brushed across, the same every time', () => {
    const made = recordingDocument();
    paintTable();
    const first = made[0];
    // The sheet itself: three greys with a blue cast, lighter toward the front.
    const sheet = first.stops.slice(0, 3);
    expect(sheet).toHaveLength(3);
    const brightness = sheet.map((hex) => parts(hex).reduce((sum, part) => sum + part, 0));
    expect(brightness[0]).toBeLessThan(brightness[1]);
    expect(brightness[1]).toBeLessThan(brightness[2]);
    for (const hex of sheet) {
      const [r, g, b] = parts(hex);
      expect(b).toBeGreaterThan(r);
      // Grey: its strongest and weakest parts are near each other, where the blue plate's were four times apart.
      expect(b - r).toBeLessThan(40);
      expect(g).toBeGreaterThan(r);
    }
    expect(first.stops).not.toContain('#0d3f72');
    // The brushing is that many strokes, each a thin bar across, lighter and darker by turns.
    const bars = first.calls.filter((call) => call.name === 'fillRect' && (call.args[3] as number) < 0.2 && (call.args[2] as number) >= 5);
    expect(bars.length).toBeGreaterThanOrEqual(BRUSH_STROKES);
    expect(first.fills.filter((fill) => fill.startsWith('rgba(236, 244, 255,')).length).toBeGreaterThanOrEqual(BRUSH_STROKES / 2);
    expect(first.fills.filter((fill) => fill.startsWith('rgba(6, 10, 20,')).length).toBeGreaterThanOrEqual(BRUSH_STROKES / 2);
    // The words the player needs are still printed on it.
    expect(first.calls.filter((call) => call.name === 'fillText').map((call) => call.args[0])).toEqual(['GET', 'GET', 'GET', 'OUT', 'OUT']);
    // Painted again it is stroke for stroke the same sheet: no device and no test gets another.
    paintTable();
    expect(JSON.stringify(made[1].calls)).toBe(JSON.stringify(first.calls));
    expect(made[1].fills).toEqual(first.fills);
  });

  it('paints the side walls with their strips of light turned down to what frosted plastic lets through', () => {
    const made = recordingDocument();
    paintWall();
    const alpha = (fill: string): number => Number(fill.slice(fill.lastIndexOf(',') + 1, -1));
    const pink = made[0].fills.filter((fill) => fill.startsWith('rgba(255, 170, 215,'));
    const cyan = made[0].fills.filter((fill) => fill.startsWith('rgba(150, 232, 250,'));
    expect(pink.length).toBeGreaterThan(3);
    expect(cyan).toHaveLength(pink.length);
    for (const fill of [...pink, ...cyan]) expect(alpha(fill)).toBeLessThan(0.4);
    // The frames are dull brass with a dark line under them, not a line of gold light.
    expect(made[0].strokes).toContain('rgba(206, 168, 92, 0.72)');
    expect(made[0].strokes).not.toContain('rgba(255, 206, 96, 0.8)');
  });
});

describe('the canvas renderer’s medals', () => {
  it('have one of four tones each, fixed by the medal, most of them as struck', () => {
    expect(FACES).toHaveLength(4);
    const share = [0, 0, 0, 0];
    for (let id = 1; id <= 1600; id++) share[faceOf(id)] += 1 / 1600;
    expect(share[0]).toBeCloseTo(7 / 16, 1);
    expect(share[1]).toBeCloseTo(3 / 16, 1);
    expect(share[2]).toBeCloseTo(4 / 16, 1);
    expect(share[3]).toBeCloseTo(2 / 16, 1);
    for (const id of [1, 2, 3, 77, 4096, 123456]) expect(faceOf(id)).toBe(faceOf(id));
    // Neighbours in the order they were made are not all alike.
    expect(new Set(Array.from({ length: 12 }, (_, index) => faceOf(100 + index))).size).toBeGreaterThanOrEqual(3);
  });

  it('are stamped from a face for each tone, the stage’s own medal being the first', () => {
    recordingDocument();
    const bare = createStage(1, false);
    expect(bare.faces).toHaveLength(FACES.length);
    expect(bare.faces[0]).toBe(bare.medal);
    const made = recordingDocument();
    paintStage(bare);
    expect(bare.faces).toHaveLength(FACES.length);
    expect(bare.faces[0]).toBe(bare.medal);
    expect(new Set(bare.faces).size).toBe(FACES.length);
    // Each is the struck medal with a wash laid on only where the medal is: brass over all of them, and its own tone over that.
    const washes = made.filter((drawn) => drawn.calls.some((call) => call.name === 'drawImage') && drawn.fills.includes(FACES[0]));
    expect(washes).toHaveLength(FACES.length);
    expect(washes.map((drawn) => drawn.fills.length)).toEqual([1, 2, 2, 2]);
    FACES.slice(1).forEach((wash, index) => expect(washes[index + 1].fills[1]).toBe(wash));
  });
});

describe('the glass at the front of the cabinet', () => {
  it('has bands that drift slowly there and back, and stand still in a calm cabinet', () => {
    expect(glassShift(0)).toBe(0);
    expect(glassShift(GLASS.period / 4)).toBeCloseTo(GLASS.drift, 9);
    expect(glassShift(GLASS.period / 2)).toBeCloseTo(0, 9);
    expect(glassShift((GLASS.period * 3) / 4)).toBeCloseTo(-GLASS.drift, 9);
    expect(glassShift(GLASS.period * 3)).toBeCloseTo(0, 9);
    // Never faster than a few pixels a second: something seen out of the corner of the eye, not a thing that moves.
    let fastest = 0;
    for (let frame = 0; frame < GLASS.period * 60; frame++) fastest = Math.max(fastest, Math.abs(glassShift((frame + 1) / 60) - glassShift(frame / 60)) * 60);
    expect(fastest).toBeGreaterThan(1);
    expect(fastest).toBeLessThan(4);
    for (const clock of [0, 1, 7.3, GLASS.period / 4, 1000]) expect(glassShift(clock, true)).toBe(0);
  });

  it('is two bands of light, a haze of dust toward its edges and a line of light along its top', () => {
    recordingDocument();
    const stage = createStage(1, false);
    const draw = (clock: number, calm: boolean) => {
      const { context, drawn } = recorder();
      stage.clock = clock;
      drawOverlay(context, stage, calm);
      return drawn;
    };
    const still = draw(0, false);
    // Three things are laid on the whole pane, each a gradient: the bands, the dust and the line.
    const rects = still.calls.filter((call) => call.name === 'fillRect');
    expect(rects).toHaveLength(3);
    expect(rects[0].args).toEqual([0, 0, VIEW.width, VIEW.height]);
    expect(rects[1].args).toEqual([0, 0, VIEW.width, VIEW.height]);
    // The line is a pixel or so thick, at the top.
    expect(rects[2].args[1]).toBeLessThan(3);
    expect(rects[2].args[3]).toBeLessThan(2);
    // Nothing on the glass is strong: it is seen, not looked at.
    const alphas = still.stops.map((stop) => Number(stop.slice(stop.lastIndexOf(',') + 1, -1)));
    expect(Math.max(...alphas)).toBe(GLASS.line);
    expect(alphas.filter((alpha) => alpha > 0.1)).toHaveLength(1);
    expect(GLASS.dust).toBeLessThan(0.1);
    // The bands slant from where they have drifted to; the dust and the line stay where they are.
    const bandsAt = (drawn: Drawn) => drawn.calls.find((call) => call.name === 'createLinearGradient')?.args;
    expect(bandsAt(still)).toEqual([0, 0, VIEW.width, VIEW.height * 0.9]);
    const later = draw(GLASS.period / 4, false);
    expect(bandsAt(later)?.[0]).toBeCloseTo(GLASS.drift, 9);
    expect(bandsAt(later)?.[2]).toBeCloseTo(VIEW.width + GLASS.drift, 9);
    expect(later.calls.find((call) => call.name === 'createRadialGradient')?.args).toEqual(still.calls.find((call) => call.name === 'createRadialGradient')?.args);
    // With less motion asked for, they are where they were at the start, whenever it is drawn.
    expect(bandsAt(draw(GLASS.period / 4, true))).toEqual(bandsAt(still));
  });

  it('sits over a field whose light falls off from the middle', () => {
    // The shade the canvas renderer lays over its field is clear where the roof's lamps are and never more than a dusk at the edge.
    expect(POOL.from).toBeLessThan(POOL.to);
    expect(POOL.dark).toBeGreaterThan(0.2);
    expect(POOL.dark).toBeLessThan(0.5);
    // The same place the 3D scene has its pool of light: the same depth is in its shader.
    expect(shaders.MEDAL_FRAGMENT).toContain(`, ${POOL.depth.toFixed(1)})) * vec2(1.0, 0.82);`);
  });
});
