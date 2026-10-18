import { describe, expect, it } from 'vitest';

import { FPS, GRAVITY, TRIES, fieldOf, landingOf, planFlight, poseAt, shotAt, startPlan, type Flight } from '@/components/game/BallBingo/ballPath';
import { ARCH, BALL_R, CUPS, FIELD, FOOT_POCKETS, LANE, PINS, PIN_R, VIEW, restOf } from '@/components/game/BallBingo/field';
import { POCKETS, START, WEIGHT_TOTAL, drawGame, seeded, stateAfter } from '@/components/game/BallBingo/engine';

// A ball's flight: shot up the lane, round the arch, down through the pins, into the pocket drawn for it. The tests
// hold the flights to the field's physics (no jumps, no ball through a pin, every flight ending at rest in its pocket),
// and the field to the published odds closely enough that the flights the machine picks are found within a few shots.

const empty = fieldOf(START);

/** The ball's place at every frame. */
const framesOf = (flight: Flight) => Array.from({ length: flight.frames.length / 2 }, (_, i) => ({ x: flight.frames[2 * i], y: flight.frames[2 * i + 1] }));

describe('the shot', () => {
  it('goes up the lane from the plunger and comes away from the arch on its inside, moving along it', () => {
    for (const power of [0, 0.25, 0.5, 0.75, 1]) {
      const shot = shotAt(power);
      expect(shot.frames[0]).toBe(LANE.x);
      expect(shot.frames[1]).toBeCloseTo(LANE.bottom, 6);
      // Where it comes away is on the arch, and its speed is along the arch (at right angles to the radius).
      const r = Math.hypot(shot.x - ARCH.cx, shot.y - ARCH.cy);
      expect(r).toBeCloseTo(ARCH.run, 6);
      const radial = ((shot.x - ARCH.cx) * shot.vx + (shot.y - ARCH.cy) * shot.vy) / r;
      expect(Math.abs(radial)).toBeLessThan(1e-6);
      // It comes away where it is too slow to hold to the arch: v² = g R cos θ there.
      const cos = (ARCH.cy - shot.y) / ARCH.run;
      if (cos > 0 && cos < 1) expect(shot.vx ** 2 + shot.vy ** 2).toBeCloseTo(GRAVITY * ARCH.run * cos, 3);
    }
    // A harder shot comes away further round.
    const angles = [0, 0.3, 0.6, 0.9].map((p) => Math.atan2(shotAt(p).x - ARCH.cx, ARCH.cy - shotAt(p).y));
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeLessThan(angles[i - 1]);
  });
});

describe('the field', () => {
  it('sends a ball shot at any strength into every pocket, each kind about as often as the published odds say, and almost never holds one', () => {
    const shots = 500;
    const kinds = { number: 0, out: 0, free: 0, chance: 0, stuck: 0 };
    const pockets = new Set<number>();
    for (let i = 0; i < shots; i++) {
      const { pocket } = landingOf(empty, (i + 0.5) / shots);
      if (pocket === null) kinds.stuck += 1;
      else {
        kinds[POCKETS[pocket].kind] += 1;
        pockets.add(pocket);
      }
    }
    expect([...pockets].sort((a, b) => a - b)).toEqual(POCKETS.map((_, i) => i));
    const published = (kind: string) => POCKETS.filter((p) => p.kind === kind).reduce((sum, p) => sum + p.weight, 0) / WEIGHT_TOTAL;
    expect(kinds.stuck / shots).toBeLessThan(0.02);
    // Numbers 61% published, OUT 33%: the field's own shares within a third of them either way.
    expect(kinds.number / shots).toBeGreaterThan(published('number') * 0.66);
    expect(kinds.out / shots).toBeLessThan(published('out') * 1.5);
    expect((kinds.free + kinds.chance) / shots).toBeLessThan(0.16);
  });

  it('has room for a ball everywhere: no two pins, nor a pin and a wall, close enough to hold one between them', () => {
    for (const pin of PINS) {
      const wall = Math.min(pin.x - FIELD.left, FIELD.right - pin.x);
      // A pin is against a wall (a bump), or a ball's width and more from it.
      expect(wall <= PIN_R + 0.01 || wall >= PIN_R + 2 * BALL_R).toBe(true);
    }
    for (let i = 0; i < PINS.length; i++)
      for (let j = i + 1; j < PINS.length; j++) expect(Math.hypot(PINS[i].x - PINS[j].x, PINS[i].y - PINS[j].y)).toBeGreaterThan(2 * PIN_R + 2 * BALL_R);
    // Every pocket at the foot is wide enough for a ball between its posts.
    for (const foot of FOOT_POCKETS) expect(foot.x1 - foot.x0).toBeGreaterThan(2 * BALL_R + 3);
  });
});

/** The fastest a ball can go: the hardest shot's speed at the plunger, with the height of the field fallen on top. */
const FASTEST = Math.sqrt(3 * GRAVITY * ARCH.run * 1.08 + 2 * GRAVITY * LANE.bottom);

/** Checks a flight against the field: it ends at rest in its pocket, it never jumps, and it never goes through a pin. */
function physical(flight: Flight, where: string) {
  const frames = framesOf(flight);
  expect(flight.landed, where).toBe(flight.target);
  const rest = restOf(flight.target);
  expect(frames.at(-1)!.x, where).toBeCloseTo(rest.x, 3);
  expect(frames.at(-1)!.y, where).toBeCloseTo(rest.y, 3);
  expect(flight.release, where).toBeGreaterThan(0);
  expect(flight.land, where).toBeGreaterThan(flight.release);
  expect(flight.land, where).toBeLessThan(frames.length);
  let worst = 0;
  let deepest = 0;
  for (let i = 0; i < flight.land; i++) {
    const { x, y } = frames[i];
    expect(Number.isFinite(x) && Number.isFinite(y), where).toBe(true);
    expect(x, where).toBeGreaterThanOrEqual(FIELD.left + BALL_R - 0.01);
    expect(x, where).toBeLessThanOrEqual(LANE.outer);
    expect(y, where).toBeLessThanOrEqual(VIEW.height);
    if (i > 0) worst = Math.max(worst, Math.hypot(x - frames[i - 1].x, y - frames[i - 1].y));
    if (!flight.guided)
      for (const pin of PINS) if (Math.abs(pin.y - y) < 8 && Math.abs(pin.x - x) < 8) deepest = Math.max(deepest, PIN_R + BALL_R - Math.hypot(x - pin.x, y - pin.y));
  }
  // Never faster than the energy it was given allows: the hardest shot's, and the whole height of the field fallen.
  expect(worst, where).toBeLessThan(FASTEST / FPS);
  // Never into a pin by more than a hair (the drawing is sampled between the physics' steps).
  expect(deepest, where).toBeLessThan(0.6);
}

describe('a flight', () => {
  it('ends in every pocket asked for on the empty field, and is the field’s own physics all the way', () => {
    for (let pocket = 0; pocket < POCKETS.length; pocket++) {
      for (const seed of [1, 2, 3]) {
        const flight = planFlight(empty, pocket, seed);
        physical(flight, `${POCKETS[pocket].id} seed ${seed}`);
        expect(flight.steered).toBe(false);
      }
    }
  });

  it('ends in the pocket drawn for every ball of drawn games, as the field fills, and needs a pull toward it only rarely', () => {
    const random = seeded(4242);
    let balls = 0;
    let steered = 0;
    let guided = 0;
    let tries = 0;
    let longest = 0;
    for (let game = 0; game < 24; game++) {
      const draws = drawGame(random);
      draws.forEach((pocket, ball) => {
        const flight = planFlight(fieldOf(stateAfter(draws, ball)), pocket, game * 100 + ball);
        physical(flight, `game ${game} ball ${ball}`);
        balls += 1;
        tries += flight.tries;
        if (flight.steered) steered += 1;
        if (flight.guided) guided += 1;
        longest = Math.max(longest, flight.frames.length / 2 / FPS);
      });
    }
    expect(balls).toBeGreaterThan(120);
    expect(steered / balls).toBeLessThan(0.03);
    expect(guided / balls).toBeLessThan(0.01);
    // Found within a few shots on average, and no flight too long to watch.
    expect(tries / balls).toBeLessThan(TRIES.free / 6);
    expect(longest).toBeLessThan(7);
  });

  it('is the same flight for the same seed, whether planned at once or a slice at a time', () => {
    const state = stateAfter(drawGame(seeded(9)), 2);
    const field = fieldOf(state);
    for (const pocket of [1, 5, 9, POCKETS.findIndex((p) => p.id === 'chance')]) {
      if (field.filled.includes(pocket)) continue;
      const whole = planFlight(field, pocket, 31);
      const plan = startPlan(field, pocket, 31);
      let sliced: Flight | null = null;
      for (let i = 0; i < 10_000 && !sliced; i++) sliced = plan.work(0);
      expect(sliced).not.toBeNull();
      expect(Array.from(sliced!.frames)).toEqual(Array.from(whole.frames));
      expect(planFlight(field, pocket, 31).power).toBe(whole.power);
    }
  });

  it('says where the ball is between frames, and holds it at its rest once the flight is over', () => {
    const flight = planFlight(empty, 5, 7);
    const a = poseAt(flight, 10);
    const b = poseAt(flight, 11);
    const mid = poseAt(flight, 10.5);
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 6);
    expect(poseAt(flight, 1e9)).toEqual(poseAt(flight, flight.frames.length / 2 - 1));
    // Shut cups are shut: a field with CHANCE taken and the FREE cups closed sends no shot into them.
    const shut = { filled: [], freeOpen: false, chanceOpen: false };
    for (let i = 0; i < 200; i++) {
      const { pocket } = landingOf(shut, (i + 0.5) / 200);
      if (pocket !== null) expect(CUPS.some((cup) => cup.pocket === pocket)).toBe(false);
    }
  });
});
