import { describe, expect, it } from 'vitest';

import { AIM, ARM_REACH, ARM_SPEED, CHECKERS, FIELD, ROLL_TIME, createMachine, dropMedal, step, tipOf } from '@/components/game/MedalPusher/engine';
import {
  DEFAULT_FEEL,
  DRAG_SLOP,
  FEEL_KEY,
  FEEL_VERSION,
  SWEEP_PERIOD,
  SWEEP_SPAN,
  SWEEP_SPEED,
  WAKE_IDLE,
  aimsOnContact,
  canFullscreen,
  createWakeKeeper,
  enterFullscreen,
  fullscreenElementOf,
  isSidewaysDrag,
  leaveFullscreen,
  readFeel,
  sweepAims,
  sweepLead,
  sweepPhase,
  sweepTo,
  vibrates,
  writeFeel,
  type WakeEnv,
  type WakeSentinel,
} from '@/components/game/MedalPusher/feel';
import { createSession } from '@/components/game/MedalPusher/session';
import { STORAGE_KEY, restore, serialize } from '@/components/game/MedalPusher/storage';

const DT = 1 / 60;

describe('Sweep: the rails swing by themselves', () => {
  it('swings each tip across its own reach and back at a steady pace, once a period', () => {
    expect(SWEEP_PERIOD).toBe(6);
    expect(SWEEP_SPAN).toBeCloseTo(ARM_REACH[0].max - ARM_REACH[0].min, 9);
    expect(SWEEP_SPAN).toBeCloseTo(ARM_REACH[1].max - ARM_REACH[1].min, 9);
    expect(sweepPhase(0)).toBe(0);
    expect(sweepPhase(SWEEP_PERIOD / 4)).toBeCloseTo(0.5, 9);
    expect(sweepPhase(SWEEP_PERIOD / 2)).toBeCloseTo(1, 9);
    expect(sweepPhase((3 * SWEEP_PERIOD) / 4)).toBeCloseTo(0.5, 9);
    expect(sweepPhase(SWEEP_PERIOD)).toBeCloseTo(0, 9);
    // The ends of the swing are the ends of each arm's reach, to the unit.
    expect(sweepAims(0)).toEqual([ARM_REACH[0].min, ARM_REACH[1].min]);
    const [left, right] = sweepAims(SWEEP_PERIOD / 2);
    expect(left).toBeCloseTo(ARM_REACH[0].max, 9);
    expect(right).toBeCloseTo(ARM_REACH[1].max, 9);
    // A steady pace: the same distance in every sixtieth of a second, there and back.
    for (let i = 0; i < 6 * 60; i++) {
      const moved = Math.abs(sweepAims((i + 1) * DT)[0] - sweepAims(i * DT)[0]);
      // But for the one step in which it turns round.
      if (i % 180 !== 179) expect(moved).toBeCloseTo(SWEEP_SPEED * DT, 6);
      else expect(moved).toBeLessThanOrEqual(SWEEP_SPEED * DT + 1e-9);
    }
  });

  it('is a function of the machine’s clock and of nothing else', () => {
    for (const time of [0, 0.37, 1.5, 2.999, 3, 4.2, 5.999]) {
      expect(sweepAims(time)).toEqual(sweepAims(time));
      // The same a period on, and ten thousand periods on: a machine that has been played for hours swings as a new one does.
      expect(sweepAims(time + SWEEP_PERIOD)[0]).toBeCloseTo(sweepAims(time)[0], 9);
      expect(sweepAims(time + 10_000 * SWEEP_PERIOD)[1]).toBeCloseTo(sweepAims(time)[1], 6);
    }
    expect(() => sweepPhase(Number.NaN)).toThrow();
    expect(() => sweepPhase(Number.POSITIVE_INFINITY)).toThrow();
    // A clock that is read before it starts is still on the swing.
    expect(sweepPhase(-SWEEP_PERIOD / 4)).toBeCloseTo(0.5, 9);
  });

  it('keeps the two rails the same way apart, the left never to the right of the right', () => {
    const apart = ARM_REACH[1].min - ARM_REACH[0].min;
    expect(apart).toBeGreaterThan(0);
    for (let i = 0; i <= 600; i++) {
      const [left, right] = sweepAims(i * 0.01);
      expect(right - left).toBeCloseTo(apart, 9);
      expect(left).toBeGreaterThanOrEqual(ARM_REACH[0].min - 1e-9);
      expect(left).toBeLessThanOrEqual(ARM_REACH[0].max + 1e-9);
      expect(right).toBeGreaterThanOrEqual(ARM_REACH[1].min - 1e-9);
      expect(right).toBeLessThanOrEqual(ARM_REACH[1].max + 1e-9);
    }
    // Each rail passes over the middle pocket on its way, at a moment of its own.
    const middle = CHECKERS.positions[1];
    expect(ARM_REACH[0].min).toBeLessThan(middle);
    expect(ARM_REACH[0].max).toBeGreaterThan(middle);
    expect(ARM_REACH[1].min).toBeLessThan(middle);
    expect(ARM_REACH[1].max).toBeGreaterThan(middle);
  });

  it('makes no aim that a hand on a slider could not make', () => {
    for (let i = 0; i <= 600; i++) {
      const [left, right] = sweepAims(i * 0.01);
      // Each is a spot its own arm points at, exactly, and one within the field's aims.
      expect(tipOf(0, left)).toBe(left);
      expect(tipOf(1, right)).toBe(right);
      expect(left).toBeGreaterThanOrEqual(AIM.min);
      expect(right).toBeLessThanOrEqual(AIM.max);
    }
  });

  it('is slow enough for an arm to follow, with a great deal to spare', () => {
    expect(SWEEP_SPEED).toBeCloseTo((2 * SWEEP_SPAN) / SWEEP_PERIOD, 9);
    expect(SWEEP_SPEED).toBeLessThan(ARM_SPEED / 10);
    // In the time a medal is on its rail the tip goes about a sixth of the way across the field: enough to have to lead it, not enough to lose it.
    expect((SWEEP_SPEED * ROLL_TIME) / FIELD.width).toBeGreaterThan(0.1);
    expect((SWEEP_SPEED * ROLL_TIME) / FIELD.width).toBeLessThan(0.2);
  });

  it('points the rails through aimArm, wherever they were pointed before', () => {
    // Every pair of aims a player can have left the rails at, the ones that would be in each other's way included.
    const starts: [number, number][] = [
      [ARM_REACH[0].min, ARM_REACH[1].min],
      [ARM_REACH[0].max, ARM_REACH[1].max],
      [ARM_REACH[0].max, ARM_REACH[0].max],
      [ARM_REACH[1].min, ARM_REACH[1].min],
      [ARM_REACH[0].min, ARM_REACH[1].max],
      [43, 57],
    ];
    // One machine does for all of them: only its aims are looked at.
    const machine = createMachine(7);
    for (const [left, right] of starts) {
      for (const time of [0, 0.4, 1.5, 2.9, 3, 4.7, 5.99]) {
        machine.aims = [left, right];
        sweepTo(machine, time);
        const want = sweepAims(time);
        expect(machine.aims[0]).toBeCloseTo(want[0], 9);
        expect(machine.aims[1]).toBeCloseTo(want[1], 9);
      }
    }
  });

  it('has each tip exactly where the sweep is, frame after frame, as the cabinet works it', () => {
    const machine = createMachine(11);
    // The first frames bring the tips over from where a new machine has them; after that they never lag.
    for (let i = 0; i < 30; i++) {
      sweepTo(machine, machine.time + DT);
      step(machine, DT);
    }
    for (let i = 0; i < 8 * 60; i++) {
      sweepTo(machine, machine.time + DT);
      step(machine, DT);
      const want = sweepAims(machine.time);
      expect(machine.tips[0]).toBeCloseTo(want[0], 6);
      expect(machine.tips[1]).toBeCloseTo(want[1], 6);
    }
  });

  it('drops a medal where the mark over the slider said it would', () => {
    for (const [arm, fedAt] of [
      [0, 0.7],
      [1, 2.2],
      [0, 3.6],
      [1, 5.1],
    ] as const) {
      const machine = createMachine(3);
      let drop = Number.NaN;
      let fed = -1;
      for (let i = 0; i < 9 * 60 && machine.falling.every((medal) => medal.id !== fed); i++) {
        if (fed < 0 && machine.time >= fedAt) {
          drop = sweepLead(machine.time)[arm];
          fed = machine.nextId;
          expect(dropMedal(machine, arm)).toBe(true);
        }
        sweepTo(machine, machine.time + DT);
        step(machine, DT);
      }
      const medal = machine.falling.find((falling) => falling.id === fed);
      // It leaves the tip within a frame of a roll after it was fed, and a frame of the sweep is a third of a unit.
      expect(medal).toBeDefined();
      expect(Math.abs((medal?.fromX ?? Number.NaN) - drop)).toBeLessThan(SWEEP_SPEED * DT * 2);
    }
    expect(sweepLead(1)).toEqual(sweepAims(1 + ROLL_TIME));
  });

  it('leaves the machine and its save what they were: only the aims move', () => {
    const swept = createSession(21, { balls: 0 });
    const still = createSession(21, { balls: 0 });
    const keys = Object.keys(swept.machine).sort();
    for (let i = 0; i < 120; i++) {
      sweepTo(swept.machine, swept.machine.time + DT);
      step(swept.machine, DT);
      step(still.machine, DT);
    }
    // Nothing is added to the machine, and with no medal fed nothing on the field has moved differently.
    expect(Object.keys(swept.machine).sort()).toEqual(keys);
    expect(swept.machine.medals.length).toBe(still.machine.medals.length);
    expect(swept.machine.time).toBeCloseTo(still.machine.time, 9);
    for (let i = 0; i < swept.machine.medals.length; i += 17) {
      expect(swept.machine.medals[i].x).toBe(still.machine.medals[i].x);
      expect(swept.machine.medals[i].y).toBe(still.machine.medals[i].y);
    }
    // The save reads back as any save does, with the rails where the sweep had them.
    const back = restore(serialize(swept), 1);
    expect(back).not.toBeNull();
    expect(back?.machine.aims[0]).toBeCloseTo(swept.machine.aims[0], 6);
    expect(back?.machine.aims[1]).toBeCloseTo(swept.machine.aims[1], 6);
    // And what the player chose is kept somewhere else.
    expect(FEEL_KEY).not.toBe(STORAGE_KEY);
    expect(serialize(swept)).not.toContain('sweep');
  });
});

describe('a touch on the field', () => {
  it('is a sideways drag once it has gone far enough, and more across than up or down', () => {
    expect(DRAG_SLOP).toBeGreaterThanOrEqual(4);
    expect(DRAG_SLOP).toBeLessThanOrEqual(12);
    expect(isSidewaysDrag(0, 0)).toBe(false);
    expect(isSidewaysDrag(DRAG_SLOP - 1, 0)).toBe(false);
    expect(isSidewaysDrag(DRAG_SLOP, 0)).toBe(true);
    expect(isSidewaysDrag(-DRAG_SLOP, 0)).toBe(true);
    expect(isSidewaysDrag(30, 10)).toBe(true);
    expect(isSidewaysDrag(-30, -29)).toBe(true);
    // The start of a scroll: up or down, however far, and a diagonal that is more down than across.
    expect(isSidewaysDrag(0, 15)).toBe(false);
    expect(isSidewaysDrag(0, -200)).toBe(false);
    expect(isSidewaysDrag(3, -30)).toBe(false);
    expect(isSidewaysDrag(20, 20)).toBe(false);
    expect(isSidewaysDrag(20, -40)).toBe(false);
  });

  it('aims the moment it lands only where it cannot be the start of a scroll', () => {
    // A mouse never scrolls by dragging.
    expect(aimsOnContact('mouse', 'pan-y')).toBe(true);
    expect(aimsOnContact('mouse', 'auto')).toBe(true);
    // A finger or a pen on the page may be scrolling it, so it waits; with the cabinet filling the screen it cannot be.
    expect(aimsOnContact('touch', 'pan-y')).toBe(false);
    expect(aimsOnContact('pen', 'pan-y')).toBe(false);
    expect(aimsOnContact('touch', 'auto')).toBe(false);
    expect(aimsOnContact('touch', 'none')).toBe(true);
    expect(aimsOnContact('pen', 'none')).toBe(true);
    expect(aimsOnContact('', 'pan-y')).toBe(false);
  });
});

describe('what the player has chosen', () => {
  it('is nothing until something is', () => {
    expect(DEFAULT_FEEL).toEqual({ vibration: null, sweep: false });
    expect(readFeel(null)).toEqual(DEFAULT_FEEL);
    expect(readFeel(undefined)).toEqual(DEFAULT_FEEL);
    expect(readFeel('')).toEqual(DEFAULT_FEEL);
    // Each reading is the caller's own to change.
    expect(readFeel(null)).not.toBe(DEFAULT_FEEL);
  });

  it('comes back as it was written', () => {
    for (const vibration of [null, true, false]) {
      for (const sweep of [true, false]) {
        expect(readFeel(writeFeel({ vibration, sweep }))).toEqual({ vibration, sweep });
      }
    }
    expect(JSON.parse(writeFeel({ vibration: true, sweep: true }))).toEqual({ v: FEEL_VERSION, vibration: true, sweep: true });
    expect(FEEL_KEY).toBe('medal-pusher-feel');
  });

  it('reads anything else as nothing chosen, and never throws', () => {
    const nonsense = [
      'not json {',
      'null',
      'true',
      '42',
      '"sweep"',
      '[1,2,3]',
      '{}',
      JSON.stringify({ v: FEEL_VERSION + 1, vibration: false, sweep: true }),
      JSON.stringify({ v: '1', vibration: false, sweep: true }),
      JSON.stringify({ vibration: false, sweep: true }),
      `{"v":1,"sweep":true,"pad":"${'x'.repeat(2000)}"}`,
    ];
    for (const text of nonsense) expect(readFeel(text)).toEqual(DEFAULT_FEEL);
    // A value of the wrong kind is that choice not made; the other stands.
    expect(readFeel(JSON.stringify({ v: 1, vibration: 'yes', sweep: true }))).toEqual({ vibration: null, sweep: true });
    expect(readFeel(JSON.stringify({ v: 1, vibration: false, sweep: 1 }))).toEqual({ vibration: false, sweep: false });
    expect(readFeel(JSON.stringify({ v: 1, vibration: 0, sweep: 'true' }))).toEqual(DEFAULT_FEEL);
    // Something a save could not hold is not carried over either.
    expect(readFeel(JSON.stringify({ v: 1, vibration: true, sweep: true, uid: 'x' }))).toEqual({ vibration: true, sweep: true });
  });

  it('vibrates as chosen, and until then unless the device asks for less motion', () => {
    expect(vibrates({ vibration: null, sweep: false }, false)).toBe(true);
    expect(vibrates({ vibration: null, sweep: false }, true)).toBe(false);
    expect(vibrates({ vibration: true, sweep: false }, true)).toBe(true);
    expect(vibrates({ vibration: false, sweep: false }, false)).toBe(false);
  });
});

/** A world for the keeper of the wake lock: a clock, one timer at a time, and a browser that hands out locks. */
function world(options: { locks?: boolean; refuse?: boolean; throws?: boolean; slow?: boolean } = {}) {
  const state = { now: 0, visible: true, asked: 0, released: 0, timers: [] as { at: number; run: () => void; id: number }[], nextId: 1 };
  const waiting: (() => void)[] = [];
  const taken: (() => void)[] = [];
  const lock = (): WakeSentinel => {
    const listeners: (() => void)[] = [];
    const sentinel: WakeSentinel = {
      release: async () => {
        state.released++;
      },
      addEventListener: (_type, listener) => {
        listeners.push(listener);
      },
    };
    taken.push(() => listeners.forEach((listener) => listener()));
    return sentinel;
  };
  const env: WakeEnv = {
    request:
      options.locks === false
        ? null
        : () => {
            state.asked++;
            if (options.throws) throw new Error('not allowed');
            if (options.refuse) return Promise.reject(new Error('NotAllowedError'));
            if (options.slow) return new Promise<WakeSentinel>((resolve) => waiting.push(() => resolve(lock())));
            return Promise.resolve(lock());
          },
    visible: () => state.visible,
    now: () => state.now,
    setTimer: (run, ms) => {
      const id = state.nextId++;
      state.timers.push({ at: state.now + ms, run, id });
      return id;
    },
    clearTimer: (timer) => {
      state.timers = state.timers.filter((entry) => entry.id !== timer);
    },
  };
  /** Moves the clock on, running whatever timers fall due on the way. */
  const pass = (ms: number) => {
    const until = state.now + ms;
    for (;;) {
      const due = state.timers.filter((entry) => entry.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      state.timers = state.timers.filter((entry) => entry !== due);
      state.now = due.at;
      due.run();
    }
    state.now = until;
  };
  /** Lets the browser's answers arrive. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { state, env, pass, settle, grant: () => waiting.splice(0).forEach((resolve) => resolve()), takeAway: () => taken.splice(0).forEach((take) => take()) };
}

describe('the screen kept awake', () => {
  it('asks for a lock when a medal goes in, once, and gives it back when play has been idle for two minutes', async () => {
    expect(WAKE_IDLE).toBe(120);
    const { state, env, pass, settle } = world();
    const keeper = createWakeKeeper(env);
    expect(state.asked).toBe(0);
    expect(keeper.held).toBe(false);
    keeper.played();
    await settle();
    expect(state.asked).toBe(1);
    expect(keeper.held).toBe(true);
    // A medal a moment asks for nothing more and sets no more timers.
    for (let i = 0; i < 50; i++) {
      pass(200);
      keeper.played();
    }
    await settle();
    expect(state.asked).toBe(1);
    expect(state.timers.length).toBe(1);
    // Two minutes after the last medal, to the second, it goes back.
    pass(WAKE_IDLE * 1000 - 1);
    expect(keeper.held).toBe(true);
    expect(state.released).toBe(0);
    pass(1);
    expect(keeper.held).toBe(false);
    expect(state.released).toBe(1);
    expect(state.timers.length).toBe(0);
    // And the next medal asks again.
    keeper.played();
    await settle();
    expect(state.asked).toBe(2);
    expect(keeper.held).toBe(true);
  });

  it('gives the lock back when the page is hidden and asks again when it comes back in time', async () => {
    const { state, env, pass, settle, takeAway } = world();
    const keeper = createWakeKeeper(env);
    keeper.played();
    await settle();
    state.visible = false;
    keeper.hidden();
    expect(keeper.held).toBe(false);
    expect(state.released).toBe(1);
    // Back within two minutes of the last medal: the screen is kept on again.
    pass(30_000);
    state.visible = true;
    keeper.shown();
    await settle();
    expect(state.asked).toBe(2);
    expect(keeper.held).toBe(true);
    // The browser taking the lock itself is noticed, and nothing is given back twice.
    takeAway();
    expect(keeper.held).toBe(false);
    keeper.hidden();
    expect(state.released).toBe(1);
    // Back after the two minutes: nobody is playing, and nothing is asked for.
    state.visible = false;
    pass(WAKE_IDLE * 1000);
    state.visible = true;
    keeper.shown();
    await settle();
    expect(state.asked).toBe(2);
    expect(keeper.held).toBe(false);
  });

  it('asks for nothing while the page is hidden, and hands straight back a lock that arrives too late', async () => {
    const hiddenWorld = world();
    hiddenWorld.state.visible = false;
    const hiddenKeeper = createWakeKeeper(hiddenWorld.env);
    hiddenKeeper.played();
    await hiddenWorld.settle();
    expect(hiddenWorld.state.asked).toBe(0);

    const { state, env, settle, grant } = world({ slow: true });
    const keeper = createWakeKeeper(env);
    keeper.played();
    keeper.played();
    expect(state.asked).toBe(1);
    // The page is hidden while the browser is still making up its mind.
    state.visible = false;
    keeper.hidden();
    grant();
    await settle();
    expect(keeper.held).toBe(false);
    expect(state.released).toBe(1);
  });

  it('is silent where the browser has no wake locks, says no, or throws', async () => {
    for (const options of [{ locks: false }, { refuse: true }, { throws: true }]) {
      const { state, env, pass, settle } = world(options);
      const keeper = createWakeKeeper(env);
      expect(() => keeper.played()).not.toThrow();
      await settle();
      expect(keeper.held).toBe(false);
      // It may be asked again later: a refusal is not remembered against the player.
      pass(1000);
      expect(() => keeper.played()).not.toThrow();
      await settle();
      expect(state.asked).toBe(options.locks === false ? 0 : 2);
      expect(() => keeper.hidden()).not.toThrow();
      expect(() => keeper.shown()).not.toThrow();
      expect(() => keeper.stop()).not.toThrow();
      expect(state.released).toBe(0);
    }
  });

  it('gives everything back when the cabinet is taken down', async () => {
    const { state, env, settle } = world();
    const keeper = createWakeKeeper(env);
    keeper.played();
    await settle();
    keeper.stop();
    expect(keeper.held).toBe(false);
    expect(state.released).toBe(1);
    expect(state.timers.length).toBe(0);
    keeper.played();
    keeper.shown();
    await settle();
    expect(state.asked).toBe(1);
    expect(state.timers.length).toBe(0);
  });
});

describe('the cabinet filling the screen', () => {
  it('is offered only where an element can, which an iPhone’s cannot', () => {
    expect(canFullscreen({ fullscreenEnabled: true })).toBe(true);
    // An iPhone: Safari there has no element fullscreen at all.
    expect(canFullscreen({})).toBe(false);
    expect(canFullscreen({ fullscreenEnabled: false })).toBe(false);
    // A browser that has it only under old WebKit's names would not lay the cabinet out: no button there either.
    expect(canFullscreen({ webkitFullscreenEnabled: true } as { fullscreenEnabled?: boolean })).toBe(false);
    expect(canFullscreen({ fullscreenEnabled: 'yes' as unknown as boolean })).toBe(false);
    expect(canFullscreen(null)).toBe(false);
    expect(canFullscreen(undefined)).toBe(false);
  });

  it('knows what fills the screen', () => {
    const cabinet = { id: 'cabinet' };
    expect(fullscreenElementOf({ fullscreenElement: cabinet })).toBe(cabinet);
    expect(fullscreenElementOf({ fullscreenElement: null })).toBeNull();
    expect(fullscreenElementOf({})).toBeNull();
    expect(fullscreenElementOf(null)).toBeNull();
  });

  it('asks without the browser’s own bars, and never rejects', async () => {
    const asked: unknown[] = [];
    await enterFullscreen({
      requestFullscreen: (options) => {
        asked.push(options);
      },
    });
    expect(asked).toEqual([{ navigationUI: 'hide' }]);
    await expect(enterFullscreen({ requestFullscreen: () => Promise.reject(new TypeError('not allowed')) })).resolves.toBeUndefined();
    await expect(
      enterFullscreen({
        requestFullscreen: () => {
          throw new Error('no');
        },
      }),
    ).resolves.toBeUndefined();
    await expect(enterFullscreen({})).resolves.toBeUndefined();
    await expect(enterFullscreen(null)).resolves.toBeUndefined();
  });

  it('leaves only when something is in it, and never rejects', async () => {
    let left = 0;
    await leaveFullscreen({ fullscreenElement: null, exitFullscreen: () => void left++ });
    expect(left).toBe(0);
    await leaveFullscreen({ fullscreenElement: {}, exitFullscreen: () => void left++ });
    expect(left).toBe(1);
    await expect(leaveFullscreen({ fullscreenElement: {} })).resolves.toBeUndefined();
    await expect(leaveFullscreen({ fullscreenElement: {}, exitFullscreen: () => Promise.reject(new Error('gone')) })).resolves.toBeUndefined();
    await expect(leaveFullscreen(null)).resolves.toBeUndefined();
  });
});
