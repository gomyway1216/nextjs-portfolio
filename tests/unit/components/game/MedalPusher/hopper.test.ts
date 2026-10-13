import { describe, expect, it } from 'vitest';

import { HATCH } from '@/components/game/MedalPusher/arms';
import { FALL_TIME, FIELD, LANDING, PAYOUT, RELEASE, buildTowers, createMachine, medalsOnField, queuePayout, step, type FallingMedal, type Machine } from '@/components/game/MedalPusher/engine';
import { CHANNEL_BAND, CHANNEL_ORDER, DOORS, POUR, channelFrom, channelX, doorsOpen, hopperBusy, shutHopper } from '@/components/game/MedalPusher/hopper';
import { pourTime } from '@/components/game/MedalPusher/works';

const DT = 1 / 60;

/**
 * Runs the machine a step at a time until `done`, and gives back every medal the machine itself let go on the way
 * (not what was in the air already), the medals that left the field, and the seconds it took.
 */
function run(machine: Machine, done: (machine: Machine) => boolean, most = 20) {
  const before = new Set(machine.falling.map((medal) => medal.id));
  const seen = new Map<number, FallingMedal>();
  let gone = 0;
  let seconds = 0;
  while (!done(machine) && seconds < most) {
    const events = step(machine, DT);
    gone += events.won + events.lost;
    seconds += DT;
    for (const medal of machine.falling) if (!before.has(medal.id) && !seen.has(medal.id) && medal.source !== 'spill') seen.set(medal.id, { ...medal });
  }
  return { let: [...seen.values()], gone, seconds };
}

describe('where the hopper is', () => {
  it('pours across the very band the slot throws across, a sixth of it to a channel', () => {
    expect([POUR.from, POUR.to]).toEqual([PAYOUT.from, PAYOUT.to]);
    expect(CHANNEL_BAND * POUR.channels).toBeCloseTo(PAYOUT.to - PAYOUT.from, 12);
    expect(channelFrom(0)).toBe(PAYOUT.from);
    expect(channelFrom(POUR.channels - 1) + CHANNEL_BAND).toBeCloseTo(PAYOUT.to, 12);
    // Every channel has its turn, one door and then the other.
    expect([...CHANNEL_ORDER].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(CHANNEL_ORDER.map((channel) => (channel < 3 ? 0 : 1))).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('has a door to either side of the ball hatch, three channels to each, inside the cabinet', () => {
    const [left, right] = DOORS;
    expect(left.from).toBeGreaterThan(0);
    expect(right.to).toBeLessThan(FIELD.width);
    expect(left.to).toBeLessThan(HATCH.x - HATCH.radius);
    expect(right.from).toBeGreaterThan(HATCH.x + HATCH.radius);
    // The two are mirror images about the middle of the field.
    expect(left.from + right.to).toBeCloseTo(FIELD.width, 9);
    expect(left.to + right.from).toBeCloseTo(FIELD.width, 9);
    for (let channel = 0; channel < POUR.channels; channel++) {
      const door = DOORS[channel < 3 ? 0 : 1];
      expect(channelX(channel)).toBeGreaterThan(door.from);
      expect(channelX(channel)).toBeLessThan(door.to);
    }
    expect([0, 1, 2, 3, 4, 5].map(channelX)).toEqual([...[0, 1, 2, 3, 4, 5].map(channelX)].sort((a, b) => a - b));
  });
});

describe('a small win', () => {
  it('is thrown out of the slot a medal at a time, and the doors stay shut', () => {
    const machine = createMachine(7);
    const start = medalsOnField(machine);
    queuePayout(machine, POUR.threshold - 1);
    expect(machine.hopper).toEqual(shutHopper());
    const { let: thrown, gone, seconds } = run(machine, (m) => m.payoutQueue === 0 && m.falling.length === 0);
    expect(machine.hopper).toEqual(shutHopper());
    expect(thrown).toHaveLength(POUR.threshold - 1);
    expect(thrown.every((medal) => medal.source === 'payout' && medal.duration === FALL_TIME)).toBe(true);
    // At the slot's pace: a few a second.
    expect(seconds).toBeGreaterThan((POUR.threshold - 2) / PAYOUT.perSecond);
    expect(medalsOnField(machine) + gone).toBe(start + POUR.threshold - 1);
  });
});

describe('a prize big enough to pour', () => {
  it('opens the doors, pours every medal of it, and shuts them again', () => {
    const machine = createMachine(7);
    const start = medalsOnField(machine);
    const prize = 60;
    queuePayout(machine, prize);
    // The doors begin to drop open in the very next step, and nothing comes out until they are down.
    step(machine, DT);
    expect(machine.hopper.phase).toBe('opening');
    expect(hopperBusy(machine.hopper)).toBe(true);
    const opening = run(machine, (m) => m.hopper.phase !== 'opening');
    expect(opening.seconds + DT).toBeCloseTo(POUR.opens, 1);
    expect(opening.let).toHaveLength(0);
    expect(machine.payoutQueue).toBe(prize);
    expect(doorsOpen(machine.hopper)).toBe(1);
    // Then all of it, at the hopper's pace, and the doors begin to shut as the last one goes.
    const pouring = run(machine, (m) => m.hopper.phase !== 'pouring');
    expect(pouring.let).toHaveLength(prize);
    expect(pouring.let.every((medal) => medal.source === 'pour' && medal.duration === POUR.fall && medal.level === 1 && !medal.ball)).toBe(true);
    expect(pouring.seconds).toBeCloseTo(prize / POUR.perSecond, 1);
    expect(pouring.seconds).toBeLessThan(prize / PAYOUT.perSecond / 3);
    expect(machine.hopper).toMatchObject({ phase: 'closing', poured: prize });
    expect(machine.payoutQueue).toBe(0);
    const closing = run(machine, (m) => m.hopper.phase === 'shut');
    expect(closing.seconds).toBeCloseTo(POUR.closes, 1);
    // Shut, it still says how many it poured.
    expect(machine.hopper).toEqual({ phase: 'shut', clock: 0, poured: prize });
    expect(opening.seconds + pouring.seconds + closing.seconds + DT).toBeCloseTo(pourTime(prize), 1);
    // Every one of them is a medal on the field or one that has left it since.
    const rest = run(machine, (m) => m.falling.length === 0);
    expect(medalsOnField(machine) + opening.gone + pouring.gone + closing.gone + rest.gone).toBe(start + prize);
  });

  it('comes down as a sheet: each medal out of its own channel, into that channel’s sixth of the band', () => {
    const machine = createMachine(11);
    queuePayout(machine, 240);
    const { let: poured } = run(machine, (m) => m.hopper.phase === 'closing');
    expect(poured).toHaveLength(240);
    const counts = [0, 0, 0, 0, 0, 0];
    poured.forEach((medal, index) => {
      const channel = CHANNEL_ORDER[index % POUR.channels];
      counts[channel] += 1;
      expect(medal.fromX).toBe(channelX(channel));
      expect(medal.x).toBeGreaterThanOrEqual(channelFrom(channel));
      expect(medal.x).toBeLessThanOrEqual(channelFrom(channel) + CHANNEL_BAND);
      expect(medal.y).toBeGreaterThanOrEqual(LANDING.from);
      expect(medal.y).toBeLessThanOrEqual(LANDING.to);
      expect(medal.fromY).toBe(RELEASE.depth);
    });
    expect(counts).toEqual([40, 40, 40, 40, 40, 40]);
    // Evenly across the band, as the slot throws them: the middle of it, and as wide.
    const mean = poured.reduce((sum, medal) => sum + medal.x, 0) / poured.length;
    const spread = Math.sqrt(poured.reduce((sum, medal) => sum + (medal.x - mean) ** 2, 0) / poured.length);
    expect(mean).toBeGreaterThan(48.5);
    expect(mean).toBeLessThan(51.5);
    expect(spread).toBeCloseTo((PAYOUT.to - PAYOUT.from) / Math.sqrt(12), 0);
  });

  it('lands where a prize thrown from the slot lands, on average', () => {
    const thrown = createMachine(3);
    const xs: number[] = [];
    for (let batch = 0; batch < 12; batch++) {
      queuePayout(thrown, POUR.threshold - 1);
      xs.push(...run(thrown, (m) => m.payoutQueue === 0).let.map((medal) => medal.x));
    }
    const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
    const spread = Math.sqrt(xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length);
    expect(xs.length).toBeGreaterThan(300);
    expect(xs.every((x) => x >= POUR.from && x <= POUR.to)).toBe(true);
    expect(mean).toBeGreaterThan(47);
    expect(mean).toBeLessThan(53);
    expect(Math.abs(spread - (POUR.to - POUR.from) / Math.sqrt(12))).toBeLessThan(2.5);
  });

  it('keeps the slot idle while the doors are anything but shut', () => {
    const machine = createMachine(7);
    queuePayout(machine, POUR.threshold);
    run(machine, (m) => m.hopper.phase === 'closing');
    // A few more medals while the doors are being drawn shut wait for them, and are then thrown from the slot.
    queuePayout(machine, 5);
    const closing = run(machine, (m) => m.hopper.phase === 'shut');
    expect(closing.let).toHaveLength(0);
    expect(machine.payoutQueue).toBe(5);
    const after = run(machine, (m) => m.payoutQueue === 0);
    expect(after.let.map((medal) => medal.source)).toEqual(['payout', 'payout', 'payout', 'payout', 'payout']);
    expect(machine.hopper.phase).toBe('shut');
  });

  it('pours whatever else is paid while the doors are open, however little', () => {
    const machine = createMachine(7);
    queuePayout(machine, POUR.threshold);
    run(machine, (m) => m.hopper.phase === 'pouring');
    queuePayout(machine, 3);
    const { let: poured } = run(machine, (m) => m.hopper.phase === 'closing');
    expect(poured).toHaveLength(POUR.threshold + 3);
    expect(poured.every((medal) => medal.source === 'pour')).toBe(true);
    expect(machine.hopper.poured).toBe(POUR.threshold + 3);
  });

  it('drops the doors open again from where they have got to when another big prize comes as they shut', () => {
    const machine = createMachine(7);
    queuePayout(machine, POUR.threshold);
    run(machine, (m) => m.hopper.phase === 'closing');
    // A third of the way shut.
    run(machine, (m) => m.hopper.clock >= POUR.closes / 3);
    const before = doorsOpen(machine.hopper);
    expect(before).toBeGreaterThan(0.5);
    expect(before).toBeLessThan(0.75);
    queuePayout(machine, POUR.threshold);
    step(machine, DT);
    expect(machine.hopper.phase).toBe('opening');
    expect(doorsOpen(machine.hopper)).toBeCloseTo(before, 6);
    // It is the same pour going on: the count carries on from where it was.
    const { let: poured } = run(machine, (m) => m.hopper.phase === 'closing');
    expect(poured).toHaveLength(POUR.threshold);
    expect(machine.hopper.poured).toBe(POUR.threshold * 2);
    // A new pour, from shut, starts its count again.
    run(machine, (m) => m.hopper.phase === 'shut');
    queuePayout(machine, POUR.threshold);
    step(machine, DT);
    expect(machine.hopper).toMatchObject({ phase: 'opening', poured: 0 });
  });

  it('pours what the towers could not hold', () => {
    const machine = createMachine(13);
    // Every place taken, and a jackpot's worth more than they can hold.
    buildTowers(machine, 18 * 25 + 80);
    expect(machine.payoutQueue).toBe(80);
    step(machine, DT);
    expect(machine.hopper.phase).toBe('opening');
  });
});
