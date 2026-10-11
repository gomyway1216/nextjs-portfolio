import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHECKERS, MEDAL_RADIUS, SWEEP, checkerCentres, createMachine } from '@/components/game/MedalPusher/engine';
import { createStage, drawField, lightGate } from '@/components/game/MedalPusher/render';
import { HEIGHT, project, unprojectPanel } from '@/components/game/MedalPusher/view';

/**
 * A stand-in for a canvas's 2D context. It draws nothing and remembers two
 * things: every piece of text, at the pixel it was drawn, and every point a
 * path was started from.
 */
function recorder() {
  const texts: { text: string; x: number; y: number }[] = [];
  const starts: { x: number; y: number }[] = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const at = (x: number, y: number) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  const gradient = { addColorStop: () => undefined };
  const own: Record<string, unknown> = {
    setTransform: (...values: number[]) => {
      matrix = values;
    },
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, ...at(x, y) });
    },
    moveTo: (x: number, y: number) => {
      starts.push(at(x, y));
    },
  };
  // Everything else a context can do is accepted and ignored; the two calls that return something return a gradient.
  const context = new Proxy(own, {
    get: (target, name: string) => target[name] ?? (() => gradient),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { context, texts, starts };
}

type Recorder = ReturnType<typeof recorder>;

/** Lets the stage make its off-screen canvases without a browser, and hands back what was drawn on them. */
function fakeDocument(): Recorder[] {
  const made: Recorder[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = recorder();
      made.push(canvas);
      return { width: 0, height: 0, getContext: () => canvas.context };
    },
  });
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the gates on the canvas', () => {
  /** One frame of the field at `time`, and what it drew. */
  const frame = (time: number, calm: boolean) => {
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = time;
    const screen = recorder();
    drawField(screen.context, stage, machine, { aim: 50, showGuide: true, calm });
    return screen;
  };
  /** A quarter of the way through the sweep, an eighth, the far left, and somewhere on the way back. */
  const TIMES = [0, SWEEP.period / 8, SWEEP.period / 4, 2.2, (SWEEP.period * 3) / 4, 5.3];

  it('paints no gate sign into the layer that is drawn once', () => {
    const made = fakeDocument();
    createStage(1);
    const once = made.flatMap((canvas) => canvas.texts.map((entry) => entry.text));
    // The words on the table are there, so the layer was recorded; the signs are not.
    expect(once.filter((text) => text === 'GET')).toHaveLength(3);
    expect(once.filter((text) => text === 'OUT')).toHaveLength(2);
    expect(once).not.toContain('START');
  });

  it('draws every START sign over its gate, wherever the sweep has taken it', () => {
    fakeDocument();
    const heights: number[] = [];
    for (const time of TIMES) {
      const signs = frame(time, false).texts.filter((entry) => entry.text === 'START');
      expect(signs).toHaveLength(CHECKERS.positions.length);
      const centres = checkerCentres(time);
      signs.forEach((sign, gate) => {
        // The spot of the back panel the sign was drawn on: straight above the gate's centre.
        const spot = unprojectPanel(sign.x, sign.y);
        expect(spot?.x).toBeCloseTo(centres[gate], 6);
        heights.push(spot?.height ?? Number.NaN);
      });
    }
    // Always at the same height on the panel: above the pusher, below the top of the wall.
    for (const height of heights) {
      expect(height).toBeCloseTo(heights[0], 6);
      expect(height).toBeGreaterThan(HEIGHT.pusher);
      expect(height).toBeLessThan(HEIGHT.wall);
    }
  });

  it('draws every gate where a medal has to land to go through it', () => {
    fakeDocument();
    // A gate's opening is as wide as a medal that just goes through on either side.
    const halfWidth = MEDAL_RADIUS + CHECKERS.halfWidth;
    const near = (points: { x: number; y: number }[], x: number, y: number) => points.some((point) => Math.hypot(point.x - x, point.y - y) < 1e-6);
    for (const time of TIMES) {
      const { starts } = frame(time, false);
      for (const centre of checkerCentres(time)) {
        const corner = project(centre - halfWidth, HEIGHT.pusher, 0);
        expect(near(starts, corner.x, corner.y)).toBe(true);
      }
      // And nowhere else: away from the middle of the sweep, nothing is left behind where the gates used to stand.
      if (Math.abs(checkerCentres(time)[0] - CHECKERS.positions[0]) > 0.5) {
        for (const centre of CHECKERS.positions) {
          const corner = project(centre - halfWidth, HEIGHT.pusher, 0);
          expect(near(starts, corner.x, corner.y)).toBe(false);
        }
      }
    }
  });

  it('moves the gates and their signs with reduced motion too', () => {
    fakeDocument();
    for (const time of TIMES) {
      const moving = frame(time, false).texts.filter((entry) => entry.text === 'START');
      const calm = frame(time, true).texts.filter((entry) => entry.text === 'START');
      expect(calm).toEqual(moving);
    }
    const middle = frame(0, true).texts.find((entry) => entry.text === 'START');
    const right = frame(SWEEP.period / 4, true).texts.find((entry) => entry.text === 'START');
    expect((right?.x ?? 0) - (middle?.x ?? 0)).toBeGreaterThan(SWEEP.amplitude);
  });

  it('lights a gate that a medal has come through, wherever it is', () => {
    fakeDocument();
    const stage = createStage(1);
    const machine = createMachine(3);
    machine.time = SWEEP.period / 4;
    lightGate(stage, 2);
    expect(stage.gateGlow).toEqual([0, 0, expect.any(Number)]);
    expect(stage.gateGlow[2]).toBeGreaterThan(0);
    lightGate(stage, 7);
    expect(stage.gateGlow).toHaveLength(CHECKERS.positions.length);
    const screen = recorder();
    expect(() => drawField(screen.context, stage, machine, { aim: 50, showGuide: false })).not.toThrow();
    expect(screen.texts.filter((entry) => entry.text === 'START')).toHaveLength(3);
  });
});
