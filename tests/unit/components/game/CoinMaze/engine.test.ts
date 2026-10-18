import { describe, expect, it } from 'vitest';

import {
  BLIND,
  DRAW_NUMBERS,
  GATE_KINDS,
  GATE_PATTERNS,
  LIMIT_WINDOWS,
  MOST_WIN,
  PAYS,
  PERFECT,
  PINS_WORTH,
  PIN_ROWS,
  POCKETS,
  POCKET_CHANCES,
  STAGES,
  STAGE_SETTINGS,
  TIMEOUT,
  TYPICAL,
  WINDOWS,
  WINDOW_MS,
  analyze,
  bestWindow,
  checkPlays,
  drawPlay,
  endOf,
  finishedFlicks,
  flicksFit,
  fraction,
  gatePass,
  gateOf,
  isDraw,
  labelOf,
  numbersFor,
  passed,
  playOf,
  seeded,
  slotOf,
  typicalAim,
  valueOf,
  windowAt,
  type Draw,
  type Fraction,
} from '@/components/game/CoinMaze/engine';

// Candy Shop Medal Maze's rules and exact odds. The returns of the three hands are pinned here as fractions; then they
// are worked out again by a different road (every way a play can be drawn, enumerated), and played by a seeded check.

const ratio = (f: Fraction) => `${f.num}/${f.den}`;
const draw = (over: Partial<Draw> = {}): Draw => ({ gates: [0, 0, 0, 0], phases: [0, 0, 0, 0], wobbles: [true, true, true, true], blinds: [2, 2, 2, 2], pins: [true, true, false, false], ...over });

describe('the maze', () => {
  it('has four gates of eight windows each, a turn of 2.4 s, and a medal waits three turns at most', () => {
    expect(STAGES).toBe(4);
    expect(WINDOWS).toBe(8);
    expect(WINDOW_MS * WINDOWS).toBe(2_400);
    expect(LIMIT_WINDOWS * WINDOW_MS).toBe(7_200);
    for (const kind of GATE_KINDS) expect(GATE_PATTERNS[kind]).toHaveLength(WINDOWS);
    for (const stage of STAGE_SETTINGS) expect(stage).toHaveLength(WINDOWS);
    // Later gates open less: the share of their settings that only flutter never falls.
    const flutters = STAGE_SETTINGS.map((settings) => settings.filter((kind) => kind === 'flutter').length);
    for (let s = 1; s < STAGES; s++) expect(flutters[s]).toBeGreaterThanOrEqual(flutters[s - 1]);
  });

  it('pays 2 medals in the middle pocket and 5 at either end, from four rows of pins (1, 4, 6, 4, 1 in 16)', () => {
    expect(POCKETS).toEqual(['big', 'out', 'win', 'out', 'big']);
    expect(POCKET_CHANCES.map(ratio)).toEqual(['1/16', '1/4', '3/8', '1/4', '1/16']);
    expect(PAYS).toEqual({ big: 5, win: 2, out: 0 });
    expect(MOST_WIN).toBe(5);
    expect(ratio(PINS_WORTH)).toBe('11/8');
  });

  it('reads a gate’s window from the time since the medal was dropped and the phase drawn for it', () => {
    expect(windowAt(3, 0)).toBe(3);
    expect(windowAt(3, WINDOW_MS - 1)).toBe(3);
    expect(windowAt(3, WINDOW_MS)).toBe(4);
    expect(windowAt(7, WINDOW_MS)).toBe(0);
    expect(windowAt(0, WINDOWS * WINDOW_MS * 5 + 2 * WINDOW_MS)).toBe(2);
  });
});

describe('the draw', () => {
  it('takes twenty numbers, in order, and a test can rig any play by them', () => {
    expect(DRAW_NUMBERS).toBe(20);
    const wanted = draw({ gates: [7, 1, 6, 5], phases: [3, 0, 7, 2], wobbles: [false, true, false, true], blinds: [0, 4, 7, 1], pins: [false, false, true, false] });
    const numbers = numbersFor(wanted);
    expect(numbers).toHaveLength(DRAW_NUMBERS);
    let i = 0;
    expect(drawPlay(() => numbers[i++])).toEqual(wanted);
    expect(i).toBe(DRAW_NUMBERS);
    // Whatever the numbers, a draw the machine can make.
    const random = seeded(5);
    for (let n = 0; n < 200; n++) expect(isDraw(drawPlay(random))).toBe(true);
    expect(isDraw(drawPlay(() => 0.999999999))).toBe(true);
    expect(isDraw(drawPlay(() => 0))).toBe(true);
    expect(isDraw({ ...wanted, gates: [8, 0, 0, 0] })).toBe(false);
    expect(isDraw({ ...wanted, pins: [true] })).toBe(false);
  });
});

describe('a play', () => {
  it('goes through an open window, grazes a half-open one (through or OUT as drawn), and stops at a shut one or a medal left too long', () => {
    // Gate 1's first setting is wide: H O O O O H S S.
    expect(gateOf(0, 0)).toBe('wide');
    const d = draw();
    expect(endOf(d, 0, 1).end).toBe('through');
    expect(endOf(d, 0, 0).end).toBe('graze-through');
    expect(endOf({ ...d, wobbles: [false, true, true, true] }, 0, 0).end).toBe('graze-out');
    expect(endOf(d, 0, 7).end).toBe('shut');
    expect(endOf(d, 0, TIMEOUT)).toEqual({ gate: 'wide', slot: null, end: 'timeout' });
  });

  it('stands where the flicks so far leave it, and with `finish` flicks the rest blind at the windows drawn', () => {
    const d = draw({ blinds: [7, 2, 2, 2] });
    expect(playOf(d, [])).toMatchObject({ stages: [], complete: false, won: 0 });
    expect(playOf(d, [1, 1])).toMatchObject({ outAt: null, complete: false });
    // Through all four, and the pins: right, right, left, left: the middle pocket.
    const through = playOf(d, [1, 1, 1, 1]);
    expect(through).toMatchObject({ outAt: null, bin: 2, pocket: 'win', won: 2, complete: true });
    expect(labelOf(through)).toBe('maze-win');
    // A skip at once: gate 1 flicked blind at window 7, shut.
    const skipped = playOf(d, [], true);
    expect(skipped).toMatchObject({ outAt: 0, complete: true, won: 0 });
    expect(skipped.stages[0]).toMatchObject({ window: 7, end: 'shut', blind: true });
    expect(finishedFlicks(d, [])).toEqual([7]);
    // The flicks made are kept, and only the rest are blind.
    expect(finishedFlicks(d, [1])).toEqual([1, 2, 2, 2]);
    expect(playOf(d, [1], true).stages.map((s) => s.blind)).toEqual([false, true, true, true]);
    // Both ends pay BIG.
    expect(playOf(draw({ pins: [true, true, true, true] }), [1, 1, 1, 1])).toMatchObject({ bin: 4, pocket: 'big', won: 5 });
    expect(labelOf(playOf(draw({ pins: [false, false, false, false] }), [1, 1, 1, 1]))).toBe('maze-big');
    expect(playOf(draw({ pins: [true, false, false, false] }), [1, 1, 1, 1])).toMatchObject({ bin: 1, pocket: 'out', won: 0 });
  });

  it('takes only flicks that could have been made: none after the medal fell OUT', () => {
    const d = draw();
    expect(flicksFit(d, [1, 1, 1, 1])).toBe(true);
    expect(flicksFit(d, [7])).toBe(true);
    expect(flicksFit(d, [7, 1])).toBe(false);
    expect(flicksFit(d, [TIMEOUT, 1])).toBe(false);
    expect(flicksFit(d, [1, 1, 1, 1, 1])).toBe(false);
    expect(flicksFit(d, [9])).toBe(false);
  });
});

describe('the exact odds', () => {
  it('pins each hand’s return: perfect timing 92.53%, an everyday hand 75.81%, blind presses 4.97%', () => {
    const odds = analyze();
    expect(ratio(odds.perfect.back)).toBe('121275/131072');
    expect(ratio(odds.typical.back)).toBe('50873163/67108864');
    expect(ratio(odds.blind.back)).toBe('3333275/67108864');
    expect(valueOf(odds.perfect.back)).toBeCloseTo(0.925255, 6);
    expect(valueOf(odds.typical.back)).toBeCloseTo(0.758069, 6);
    expect(valueOf(odds.blind.back)).toBeCloseTo(0.049670, 6);
    // Skill never beats the machine; a typical hand gets noticeably less, and a blind one less still.
    expect(valueOf(odds.perfect.back)).toBeLessThanOrEqual(0.95);
    expect(valueOf(odds.typical.back)).toBeGreaterThanOrEqual(0.7);
    expect(valueOf(odds.typical.back)).toBeLessThanOrEqual(0.85);
    expect(valueOf(odds.blind.back)).toBeLessThan(valueOf(odds.typical.back));
    // Each gate passed, reached, by each hand.
    expect(odds.perfect.stages.map(ratio)).toEqual(['15/16', '15/16', '7/8', '7/8']);
    expect(odds.typical.stages.map(ratio)).toEqual(['59/64', '29/32', '53/64', '51/64']);
    expect(odds.blind.stages.map(ratio)).toEqual(['17/32', '31/64', '25/64', '23/64']);
    expect(ratio(odds.perfect.reach)).toBe('11025/16384');
    // Skipping at gate s (perfect before it, blind from it): the blind figure at the first, perfect play never.
    expect(odds.skipAt[0]).toEqual(odds.blind.back);
    expect(odds.skipAt[STAGES]).toEqual(odds.perfect.back);
    for (let s = 1; s <= STAGES; s++) expect(valueOf(odds.skipAt[s])).toBeGreaterThan(valueOf(odds.skipAt[s - 1]));
  });

  it('times each kind of gate as the hands do: perfect never misses an open gate, the everyday hand aims at the middle', () => {
    expect(GATE_KINDS.map((kind) => ratio(gatePass(kind, PERFECT)))).toEqual(['1/1', '1/1', '1/1', '1/1', '1/2']);
    expect(GATE_KINDS.map((kind) => ratio(gatePass(kind, TYPICAL)))).toEqual(['1/1', '1/1', '7/8', '3/4', '3/8']);
    expect(GATE_KINDS.map((kind) => ratio(gatePass(kind, BLIND)))).toEqual(['5/8', '1/2', '3/8', '1/4', '1/8']);
    for (const kind of GATE_KINDS) {
      expect(slotOf(kind, bestWindow(kind))).toBe(kind === 'flutter' ? 'half' : 'open');
      expect(slotOf(kind, typicalAim(kind))).toBe(kind === 'flutter' ? 'half' : 'open');
    }
    // The wide gate's middle is aimed at, so that a window early or late is still open.
    expect(typicalAim('wide')).toBe(2);
  });

  it('works out the same returns by enumerating every way a play can be drawn, the wobbles known', () => {
    // Every gate setting, wobble and pin there is: 8^4 × 2^4 × 2^4 draws, each as likely. Perfect timing knows where
    // each gate stands and, here, even whether a graze gets through: a medal that can get through a gate does. That
    // it brings back no more than the perfect hand above shows that knowing the wobble (which the machine draws as
    // the medal drops in) is worth nothing to a perfect hand: it grazes only where the gate never opens.
    let perfect = 0;
    let blindNum = 0;
    for (let g = 0; g < WINDOWS ** STAGES; g++) {
      const gates = [g & 7, (g >> 3) & 7, (g >> 6) & 7, (g >> 9) & 7];
      for (let w = 0; w < 2 ** STAGES; w++) {
        const wobbles = [0, 1, 2, 3].map((s) => ((w >> s) & 1) === 1);
        let pass = true;
        let blindPass = 1;
        for (let s = 0; s < STAGES; s++) {
          const kind = gateOf(s, gates[s]);
          const pattern = GATE_PATTERNS[kind];
          if (!pattern.some((slot) => slot === 'open' || (slot === 'half' && wobbles[s]))) pass = false;
          blindPass *= pattern.filter((slot) => slot === 'open' || (slot === 'half' && wobbles[s])).length;
        }
        if (pass) perfect += 1;
        blindNum += blindPass;
      }
    }
    // Times what the pins are worth (11/8), over every draw.
    const draws = WINDOWS ** STAGES * 2 ** STAGES;
    const odds = analyze();
    expect(fraction(BigInt(perfect) * BigInt(11), BigInt(draws) * BigInt(8))).toEqual(odds.perfect.back);
    expect(fraction(BigInt(blindNum) * BigInt(11), BigInt(draws) * BigInt(WINDOWS ** STAGES) * BigInt(8))).toEqual(odds.blind.back);
  });

  it('plays the same, near enough, by a seeded check', () => {
    const odds = analyze();
    for (const player of ['perfect', 'typical', 'blind'] as const) {
      const seen = checkPlays(30_000, player, seeded(77));
      expect(Math.abs(seen.back - valueOf(odds[player].back)), player).toBeLessThan(0.025);
    }
  });

  it('plays a full draw as playOf says, flick by flick', () => {
    const random = seeded(9);
    for (let n = 0; n < 500; n++) {
      const d = drawPlay(random);
      const flicks: number[] = [];
      let play = playOf(d, flicks);
      while (!play.complete) {
        flicks.push(bestWindow(gateOf(flicks.length, d.gates[flicks.length])));
        play = playOf(d, flicks);
      }
      expect(play.stages.every((s, i) => i === play.stages.length - 1 || passed(s.end))).toBe(true);
      expect(play.won).toBe(play.pocket ? PAYS[play.pocket] : 0);
      expect(play.bin === null || play.bin === d.pins.filter(Boolean).length).toBe(true);
      expect(flicks.length).toBeLessThanOrEqual(STAGES);
      if (play.bin !== null) expect(PIN_ROWS).toBe(4);
    }
  });
});
