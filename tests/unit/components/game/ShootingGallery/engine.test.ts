import { describe, expect, it } from 'vitest';

import {
  BANDS,
  CORKS,
  DRAW_NUMBERS,
  FALLEN,
  KINDS,
  KIND_IDS,
  MOST_WIN,
  OVER,
  PICKS,
  SET_UP,
  SHELF,
  SLOTS,
  STAKE,
  STATES,
  TARGETS,
  TYPICAL_QUARTERS,
  bestShot,
  blindTarget,
  checkPlays,
  drawPlay,
  finishedShots,
  isDraw,
  labelOf,
  numbersFor,
  outcomeOf,
  payOf,
  playOf,
  positionsOf,
  seeded,
  shotsFit,
  slotFor,
  standingOf,
  stateOf,
  valueOf,
  type Outcome,
  type Shot,
} from '@/components/game/ShootingGallery/engine';
import { PUBLISHED_SHOOTING_GALLERY_ODDS } from '@/components/game/ShootingGallery/published';
import {
  CALM_HOLD_MS,
  FLIGHT_MS,
  SLIDE_STEP,
  STAGE_H,
  STAGE_W,
  SWAY_MS,
  TIER_PLACES,
  bandOfSway,
  figureAt,
  figureLayer,
  figureSpot,
  gunAngle,
  muzzleAt,
  restPose,
  shotScene,
  sightAt,
  swayAt,
} from '@/components/game/ShootingGallery/scene';
import { drawFor } from './draws';

// Onsen Shooting Gallery's rules. Its exact returns are worked out in published.test.tsx; here the shelf, the draw, a
// play and the stall's picture are pinned, and the published returns are checked by playing.

const TOP = 1;
const BASE = 4;
/** Six corks at six different small figures' top edges: the bottom tier's boxes, the daruma, a kokeshi. */
const SPREAD: Shot[] = [
  [6, TOP],
  [7, TOP],
  [8, TOP],
  [3, TOP],
  [5, TOP],
  [0, TOP],
];

describe('the shelf', () => {
  it('has nine figures on three tiers: kokeshi and the cat on top, daruma and the manjū box in the middle, sweet boxes at the bottom', () => {
    expect(TARGETS).toBe(9);
    expect(SHELF).toEqual(['kokeshi', 'cat', 'kokeshi', 'daruma', 'manju', 'daruma', 'box', 'box', 'box']);
    expect(KIND_IDS.map((kind) => KINDS[kind].medals)).toEqual([2, 3, 4, 5, 25]);
    expect(STAKE).toBe(6);
    expect(CORKS).toBe(6);
    expect(BANDS).toBe(5);
  });

  it('gives every row of chances 64 slots; over the top always misses; only the manjū box and the cat slide, and their last place does not', () => {
    for (const kind of KIND_IDS) {
      const rows = KINDS[kind].rows;
      expect(rows.length, kind).toBe(kind === 'manju' ? 2 : kind === 'cat' ? 3 : 1);
      rows.forEach((row, position) => {
        expect(row).toHaveLength(BANDS);
        for (const chances of row) expect(chances.reduce((a, b) => a + b, 0), `${kind} ${position}`).toBe(SLOTS);
        expect(row[OVER], kind).toEqual([0, 0, 0, SLOTS]);
        for (const [, slide] of row.slice(1)) expect(slide > 0, `${kind} ${position}`).toBe(position + 1 < rows.length);
      });
    }
  });

  it('is built like a real stall: the top edge topples best and misses most, the centre mostly rocks, small figures are missed more than big ones', () => {
    for (const kind of KIND_IDS) {
      for (const row of KINDS[kind].rows) {
        const falls = row.slice(1).map(([fall]) => fall);
        const misses = row.slice(1).map(([, , , miss]) => miss);
        // Topple: the top edge best, then the upper half, the centre, the base.
        for (let b = 1; b < falls.length; b++) expect(falls[b], kind).toBeLessThanOrEqual(falls[b - 1]);
        // Hit: the top edge is the easiest to miss.
        expect(Math.max(...misses), kind).toBe(misses[0]);
        // A centre hit rocks it more often than it knocks it off.
        expect(row[3][2], kind).toBeGreaterThan(row[3][0]);
      }
    }
    // Small figures are missed more often than big ones, and fall more easily when hit.
    const missAtTop = (kind: (typeof KIND_IDS)[number]) => KINDS[kind].rows[0][TOP][3];
    expect(missAtTop('box')).toBeGreaterThan(missAtTop('manju'));
    expect(missAtTop('kokeshi')).toBeGreaterThan(missAtTop('cat'));
    const fallAtTop = (kind: (typeof KIND_IDS)[number]) => KINDS[kind].rows[0][TOP][0];
    expect(fallAtTop('box')).toBeGreaterThan(fallAtTop('daruma'));
    expect(fallAtTop('daruma')).toBeGreaterThan(fallAtTop('manju'));
    // Nothing knocks the cat off from where it is set; from the brink the top edge does, a seventh of the time or so.
    expect(KINDS.cat.rows[0].every(([fall]) => fall === 0)).toBe(true);
    expect(KINDS.cat.rows[2][TOP][0]).toBe(14);
    // A base hit slides the heavy ones back best.
    for (const kind of ['manju', 'cat'] as const) expect(Math.max(...KINDS[kind].rows[0].map(([, slide]) => slide))).toBe(KINDS[kind].rows[0][BASE][1]);
  });

  it('says what a slot does: a fall first, then a slide, a rock, a miss, as many slots each as its chance', () => {
    // The manjū box as set up, at its top edge: 4 fall, 16 slide, 36 rock, 8 miss.
    const counts = { fall: 0, slide: 0, rock: 0, miss: 0 };
    for (let slot = 0; slot < SLOTS; slot++) counts[outcomeOf(4, 0, TOP, slot)] += 1;
    expect(counts).toEqual({ fall: 4, slide: 16, rock: 36, miss: 8 });
    expect(slotFor(4, 0, TOP, 'fall')).toBe(0);
    expect(slotFor(4, 0, TOP, 'slide')).toBe(4);
    expect(slotFor(4, 0, TOP, 'rock')).toBe(20);
    expect(slotFor(4, 0, TOP, 'miss')).toBe(56);
    expect(slotFor(1, 0, TOP, 'fall')).toBe(-1);
    expect(slotFor(6, 0, TOP, 'slide')).toBe(-1);
  });

  it('numbers every state the shelf can be in, and reads each back', () => {
    expect(STATES).toBe(2 * 4 * 2 * 2 * 3 * 2 * 2 * 2 * 2);
    for (const state of [0, 1, 17, 500, STATES - 1]) expect(stateOf(positionsOf(state))).toBe(state);
    expect(positionsOf(stateOf(SET_UP))).toEqual([...SET_UP]);
    const fallen = SHELF.map(() => FALLEN);
    expect(positionsOf(stateOf(fallen))).toEqual(fallen);
    expect(payOf(fallen)).toBe(2 * 3 + 2 * 3 + 2 * 4 + 5 + 25);
  });

  it('pays at most 41 a play: the cat needs two corks, and six corks knock six figures off at most', () => {
    expect(MOST_WIN).toBe(25 + 5 + 4 + 4 + 3);
    // Two corks slide the cat to its second place, where its top edge can knock it off.
    const play = playOf(drawFor([[1, BASE], [1, TOP], [4, TOP], [0, TOP], [2, TOP], [3, TOP]], ['slide', 'fall', 'fall', 'fall', 'fall', 'fall']), [[1, BASE], [1, TOP], [4, TOP], [0, TOP], [2, TOP], [3, TOP]]);
    expect(play.won).toBe(MOST_WIN);
    expect(labelOf(play)).toBe('gallery-cat');
  });
});

describe('the draw', () => {
  it('takes eighteen numbers, three a cork, and the numbers it is given draw it back', () => {
    expect(DRAW_NUMBERS).toBe(18);
    const random = seeded(7);
    for (let i = 0; i < 50; i++) {
      const draw = drawPlay(random);
      expect(isDraw(draw)).toBe(true);
      const numbers = numbersFor(draw);
      expect(numbers).toHaveLength(DRAW_NUMBERS);
      let n = 0;
      expect(drawPlay(() => numbers[n++])).toEqual(draw);
    }
    expect(drawPlay(() => 0.999999999)).toEqual({ slots: Array(CORKS).fill(SLOTS - 1), picks: Array(CORKS).fill(PICKS - 1), bands: Array(CORKS).fill(BANDS - 1) });
  });

  it('knows a draw it could have made from one it could not', () => {
    const draw = drawPlay(seeded(1));
    expect(isDraw({ ...draw, slots: [SLOTS, ...draw.slots.slice(1)] })).toBe(false);
    expect(isDraw({ ...draw, picks: [-1, ...draw.picks.slice(1)] })).toBe(false);
    expect(isDraw({ ...draw, bands: [1.5, ...draw.bands.slice(1)] })).toBe(false);
    expect(isDraw({ ...draw, bands: draw.bands.slice(1) })).toBe(false);
    expect(isDraw(null)).toBe(false);
  });

  it('shares a blind shot’s picks out evenly among the figures still up, whichever are', () => {
    for (let fallen = 0; fallen < TARGETS; fallen++) {
      const positions = SHELF.map((_, t) => (t < fallen ? FALLEN : 0));
      const counts = new Map<number, number>();
      for (let pick = 0; pick < PICKS; pick++) counts.set(blindTarget(positions, pick), (counts.get(blindTarget(positions, pick)) ?? 0) + 1);
      expect([...counts.keys()].sort((a, b) => a - b)).toEqual(standingOf(positions));
      for (const n of counts.values()) expect(n).toBe(PICKS / (TARGETS - fallen));
    }
  });
});

describe('a play', () => {
  it('plays each cork at its figure and band, knocks figures off, slides them back, and pays only once all six are fired', () => {
    const draw = drawFor(SPREAD, ['fall', 'rock', 'miss', 'fall', 'miss', 'fall']);
    const partial = playOf(draw, SPREAD.slice(0, 3));
    expect(partial.complete).toBe(false);
    expect(partial.won).toBe(0);
    expect(partial.corks.map((c) => c.outcome)).toEqual(['fall', 'rock', 'miss']);
    const play = playOf(draw, SPREAD);
    expect(play.complete).toBe(true);
    expect(play.fallen).toEqual([6, 3, 0]);
    expect(play.won).toBe(2 + 3 + 4);
    expect(labelOf(play)).toBe('gallery-trio');
    // The manjū box slid back: a slide then a fall from the edge.
    const manju = playOf(drawFor([[4, BASE], [4, TOP], ...SPREAD.slice(2)], ['slide', 'fall', 'miss', 'miss', 'miss', 'miss']), [[4, BASE], [4, TOP], ...SPREAD.slice(2)]);
    expect(manju.corks.map((c) => c.position)).toEqual([0, 1, 0, 0, 0, 0]);
    expect(manju.won).toBe(5);
    expect(labelOf(manju)).toBeNull();
  });

  it('finishes a play left mid-way with the corks fired and the rest blind, at the figures and bands drawn with it', () => {
    const draw = drawFor(SPREAD, ['fall', 'fall', 'fall', 'fall', 'fall', 'fall']);
    expect(finishedShots(draw, SPREAD.slice(0, 2))).toEqual(SPREAD);
    const blind = playOf(draw, SPREAD.slice(0, 2), true);
    expect(blind.corks.map((c) => c.blind)).toEqual([false, false, true, true, true, true]);
    expect(blind.won).toBe(2 + 2 + 2 + 3 + 3 + 4);
    // A shot of the player's own stands: aimed over the top, the first cork missed though the blind one would have hit.
    const own = playOf(draw, [[6, OVER]], true);
    expect(own.corks[0].outcome).toBe('miss');
  });

  it('takes no cork at a figure off the shelf, and no more corks than six', () => {
    const draw = drawFor(SPREAD, ['fall', 'fall', 'fall', 'fall', 'fall', 'fall']);
    expect(shotsFit(draw, SPREAD)).toBe(true);
    expect(shotsFit(draw, [[6, TOP], [6, TOP]])).toBe(false);
    expect(shotsFit(draw, [[9, TOP]])).toBe(false);
    expect(shotsFit(draw, [[6, BANDS]])).toBe(false);
    expect(shotsFit(draw, [[6, 1, 2]])).toBe(false);
    expect(shotsFit(draw, [...SPREAD, [1, TOP]])).toBe(false);
  });
});

describe('the hands', () => {
  it('spreads the everyday hand over the band aimed at and its neighbours, the quarter past an end kept on the end', () => {
    expect(TYPICAL_QUARTERS(2)).toEqual([
      { band: 2, quarters: 2 },
      { band: 1, quarters: 1 },
      { band: 3, quarters: 1 },
    ]);
    expect(TYPICAL_QUARTERS(0)).toEqual([
      { band: 0, quarters: 3 },
      { band: 1, quarters: 1 },
    ]);
    expect(TYPICAL_QUARTERS(BANDS - 1)).toEqual([
      { band: BANDS - 1, quarters: 3 },
      { band: BANDS - 2, quarters: 1 },
    ]);
  });

  it('opens perfect play on the cat’s base: two slides and a top edge are worth more than the small figures, while the corks last', () => {
    expect(bestShot(SET_UP, CORKS)).toEqual([1, BASE]);
    // On the brink with corks to spare, its top edge.
    const brink = [...SET_UP];
    brink[1] = 2;
    expect(bestShot(brink, 3)).toEqual([1, TOP]);
    // With the last cork and the cat still where it was set, a small figure instead.
    expect(SHELF[bestShot(SET_UP, 1)[0]]).not.toBe('cat');
  });

  it('brings back what the exact figures say, played a few thousand times by each hand', () => {
    const random = seeded(2_026);
    const plays = 4_000;
    for (const player of ['perfect', 'typical', 'blind'] as const) {
      const result = checkPlays(plays, player, random);
      // A play's return varies by about 1.3 medals a medal (the cat's 25 at 8%): 4,000 plays are good to about 2% each
      // way at one standard error.
      expect(Math.abs(result.back - valueOf(PUBLISHED_SHOOTING_GALLERY_ODDS[player].back)), player).toBeLessThan(0.08);
      expect(result.fell.reduce((a, b) => a + b, 0)).toBe(plays);
    }
  });
});

describe('the stall', () => {
  it('sways the sight through the five bands, each a fifth of the sway, down and back up', () => {
    expect(swayAt(0)).toBe(0);
    expect(swayAt(SWAY_MS)).toBe(1);
    expect(swayAt(SWAY_MS * 1.5)).toBeCloseTo(0.5);
    expect(swayAt(SWAY_MS * 2)).toBeCloseTo(0);
    const time = new Array<number>(BANDS).fill(0);
    for (let ms = 0; ms < 2 * SWAY_MS; ms++) time[bandOfSway(swayAt(ms))] += 1;
    for (const t of time) expect(Math.abs(t - (2 * SWAY_MS) / BANDS)).toBeLessThanOrEqual(2);
  });

  it('puts each band of the sight where it says on the figure: over its top, then each quarter of it, top to foot', () => {
    for (let target = 0; target < TARGETS; target++) {
      for (const position of KINDS[SHELF[target]].rows.map((_, p) => p)) {
        const { top, foot, h, x, w } = figureAt(target, position);
        for (let ms = 0; ms < 2 * SWAY_MS; ms += 7) {
          const sight = sightAt(target, position, ms);
          expect(Math.abs(sight.x - x)).toBeLessThan(w / 2);
          if (sight.band === OVER) expect(sight.y).toBeLessThan(top + 0.01);
          else {
            expect(sight.y).toBeGreaterThanOrEqual(top + ((sight.band - 1) * h) / 4 - 0.01);
            expect(sight.y).toBeLessThanOrEqual(top + (sight.band * h) / 4 + 0.01);
          }
          expect(sight.y).toBeLessThanOrEqual(foot + 0.01);
        }
      }
    }
    // A figure slid back stands nearer the shelf's back edge, and looks a little smaller.
    expect(figureAt(1, 2).foot).toBe(TIER_PLACES[0].y - 2 * SLIDE_STEP);
    expect(figureAt(1, 2).foot).toBeGreaterThan(TIER_PLACES[0].back);
    expect(figureAt(1, 2).h).toBeLessThan(figureAt(1, 0).h);
  });

  it('gives every figure a place to tap at least 44 px each way on the narrowest phone, the places side by side and never on top of each other', () => {
    // At 320 px the stall is some 261 px wide.
    const scale = 261 / STAGE_W;
    const spots = Array.from({ length: TARGETS }, (_, t) => figureSpot(t));
    for (const spot of spots) {
      expect(spot.w * scale).toBeGreaterThanOrEqual(44);
      expect(spot.h * scale).toBeGreaterThanOrEqual(44);
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.x + spot.w).toBeLessThanOrEqual(STAGE_W);
    }
    for (let a = 0; a < TARGETS; a++)
      for (let b = a + 1; b < TARGETS; b++) {
        const overlapX = Math.min(spots[a].x + spots[a].w, spots[b].x + spots[b].w) - Math.max(spots[a].x, spots[b].x);
        const overlapY = Math.min(spots[a].y + spots[a].h, spots[b].y + spots[b].h) - Math.max(spots[a].y, spots[b].y);
        expect(overlapX <= 0.01 || overlapY <= 0.01, `${a} ${b}`).toBe(true);
      }
    // Each figure's layer holds it, its foot inside, with room to tip over a corner.
    for (let t = 0; t < TARGETS; t++) {
      const layer = figureLayer(t);
      const { x, top, foot } = figureAt(t, 0);
      expect(x - layer.x).toBeCloseTo(layer.x + layer.w - x, 6);
      expect(top).toBeGreaterThan(layer.y);
      expect(foot).toBeLessThan(layer.y + layer.h);
      expect(layer.y + layer.h).toBeLessThanOrEqual(STAGE_H + 160);
    }
  });

  it('turns the gun to what it points at, its muzzle on the line to it', () => {
    expect(gunAngle({ x: 180, y: 100 })).toBeCloseTo(0, 9);
    for (const at of [
      { x: 70, y: 260 },
      { x: 290, y: 100 },
    ]) {
      const muzzle = muzzleAt(gunAngle(at));
      // The muzzle, the pivot and the point are on one line.
      const cross = (muzzle.x - 180) * (at.y - 540) - (muzzle.y - 540) * (at.x - 180);
      expect(Math.abs(cross)).toBeLessThan(1e-6);
    }
  });

  it('plays a shot out as the draw says: the cork gets to the sight on a hit, a fall ends off the shelf, a slide a step back, a miss leaves the figure be', () => {
    const muzzle = muzzleAt(0);
    const cases: [Outcome, number][] = [
      ['fall', 0],
      ['slide', 5],
      ['rock', 30],
      ['miss', 63],
    ];
    for (const [outcome, slot] of cases) {
      const cork = { cork: 0, target: 4, band: TOP, blind: false, position: 0, outcome: outcomeOf(4, 0, TOP, slot), slot };
      expect(cork.outcome).toBe(outcome);
      const sight = sightAt(4, 0, 50);
      const scene = shotScene(cork, muzzle, sight, false);
      expect(scene.hitAt).toBe(FLIGHT_MS);
      const at = scene.cork(FLIGHT_MS)!;
      if (outcome !== 'miss') expect(Math.hypot(at.x - sight.x, at.y - sight.y)).toBeLessThan(0.01);
      else expect(Math.abs(at.x - sight.x)).toBeGreaterThan(figureAt(4, 0).w / 2);
      expect(scene.cork(0)).toMatchObject({ x: muzzle.x, y: muzzle.y });
      // Before the cork gets there the figure stands as it was.
      expect(scene.figure(FLIGHT_MS - 1)).toEqual(restPose(0));
      const end = scene.figure(scene.length);
      if (outcome === 'fall') expect(end.shown).toBe(0);
      else if (outcome === 'slide') expect(end).toEqual(restPose(1));
      else expect(end).toEqual(restPose(0));
      // Its moments: the pop, the cork getting there, the fall (on a fall), and the figure still.
      expect(scene.cues[0]).toEqual({ at: 0, sound: 'cork' });
      expect(scene.cues.filter((c) => c.cue === 'down')).toHaveLength(outcome === 'fall' ? 1 : 0);
      expect(scene.cues.at(-1)).toEqual({ at: scene.length, cue: 'still' });
      // A fall goes behind the shelf before it is gone, never through the shelf in front.
      if (outcome === 'fall') {
        for (let ms = FLIGHT_MS; ms <= scene.length; ms += 10) {
          const pose = scene.figure(ms);
          if (!pose.behind) expect(pose.dy).toBeLessThanOrEqual(0.0001);
        }
      }
      // With less motion: put where it ends, at once, and held a moment.
      const calm = shotScene(cork, muzzle, sight, true);
      expect(calm.length).toBe(CALM_HOLD_MS);
      expect(calm.figure(0)).toEqual(end.shown === 0 ? restPose(FALLEN) : end);
    }
  });
});
