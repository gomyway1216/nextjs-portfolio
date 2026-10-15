import { describe, expect, it } from 'vitest';

import { TABLES, type TableKind } from '@/components/game/Craps/tableLayout';
import { FRAME_RATE, HAND_TIME, THROW_TIME, diceAt, facesBackFrom, nextTo, planThrow, reach, restOf, seeded, type ThrowPlan } from '@/components/game/Craps/throwPhysics';

// The throw that is shown lands on the roll the game drew, whatever the seed: these run it over every roll and many
// seeds, on both tables, and collect what goes wrong before asserting, so that one run reports every failure.

const KINDS: TableKind[] = ['half', 'full'];
const ROLLS: [number, number][] = Array.from({ length: 36 }, (_, i) => [1 + Math.floor(i / 6), 1 + (i % 6)]);
const SEEDS_PER_ROLL = 12;

function plans(kind: TableKind): ThrowPlan[] {
  const out: ThrowPlan[] = [];
  ROLLS.forEach((roll, r) => {
    for (let s = 0; s < SEEDS_PER_ROLL; s++) out.push(planThrow(roll, TABLES[kind].throw, (r * 1_000_003 + s * 7_919 + 17) >>> 0));
  });
  return out;
}
const ALL = Object.fromEntries(KINDS.map((kind) => [kind, plans(kind)])) as Record<TableKind, ThrowPlan[]>;

describe('a throw lands on the roll that was drawn', () => {
  for (const kind of KINDS) {
    it(`always rests on the drawn faces, on the ${kind} table, for every roll and ${SEEDS_PER_ROLL} seeds each`, () => {
      const wrong = ALL[kind].filter((plan) => {
        const rest = restOf(plan);
        return rest[0].face !== plan.faces[0] || rest[1].face !== plan.faces[1] || diceAt(plan, plan.duration + 5).some((die, i) => die.face !== plan.faces[i]);
      });
      expect(wrong.map((plan) => `${plan.faces} seed ${plan.seed}`)).toEqual([]);
      expect(ALL[kind]).toHaveLength(36 * SEEDS_PER_ROLL);
    });

    it(`hits the far wall with both dice, and takes as long as a real throw to watch, on the ${kind} table`, () => {
      const missed = ALL[kind].filter((plan) => plan.wallHits[0] < 1 || plan.wallHits[1] < 1 || !plan.events.some((event) => event.kind === 'wall'));
      const timing = ALL[kind].filter((plan) => plan.duration < THROW_TIME.least || plan.duration > THROW_TIME.most);
      expect(missed.map((plan) => plan.seed)).toEqual([]);
      expect(timing.map((plan) => `${plan.seed}: ${plan.duration}`)).toEqual([]);
      // The rattle in the hand comes first, then the dice are let go.
      for (const plan of ALL[kind].slice(0, 20)) {
        expect(plan.events[0].kind).toBe('rattle');
        expect(plan.events.find((event) => event.kind === 'release')?.t).toBe(HAND_TIME);
      }
    });

    it(`never passes a die through a rail or through the other die, and ends with both clear and readable, on the ${kind} table`, () => {
      const { felt, die } = TABLES[kind].throw;
      const r = reach(die);
      const problems: string[] = [];
      for (const plan of ALL[kind]) {
        plan.frames.forEach((pair, k) => {
          for (const d of pair) {
            if (d.x < felt.left + r - 1e-6 || d.x > felt.right - r + 1e-6 || d.y < felt.top + r - 1e-6 || d.y > felt.bottom - r + 1e-6) problems.push(`${plan.seed} frame ${k}: through a rail`);
            if (d.z < 0) problems.push(`${plan.seed} frame ${k}: under the felt`);
          }
          if (Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) < 2 * r - 1e-6) problems.push(`${plan.seed} frame ${k}: through the other die`);
          if (k > 0) {
            const before = plan.frames[k - 1];
            for (let i = 0; i < 2; i++) {
              // A die moves no further in a frame than it could fly: no jumps.
              if (Math.hypot(pair[i].x - before[i].x, pair[i].y - before[i].y) > die * 2) problems.push(`${plan.seed} frame ${k}: jumped`);
            }
          }
        });
        const rest = restOf(plan);
        const margin = r + 0.25 * die;
        for (const d of rest) {
          if (d.z !== 0) problems.push(`${plan.seed}: rests in the air`);
          if (d.x < felt.left + margin || d.x > felt.right - margin || d.y < felt.top + margin || d.y > felt.bottom - margin) problems.push(`${plan.seed}: rests against a rail`);
        }
        if (Math.hypot(rest[0].x - rest[1].x, rest[0].y - rest[1].y) < 2 * r + 0.35 * die) problems.push(`${plan.seed}: rests on the other die`);
      }
      expect(problems.slice(0, 20)).toEqual([]);
    });

    it(`turns a die over only onto a face next to the one it shows, as a die rolling over an edge does, on the ${kind} table`, () => {
      const bad: string[] = [];
      for (const plan of ALL[kind]) {
        for (let k = 1; k < plan.frames.length; k++) {
          for (let i = 0; i < 2; i++) {
            const [from, to] = [plan.frames[k - 1][i].face, plan.frames[k][i].face];
            if (from !== to && !nextTo(from).includes(to)) bad.push(`${plan.seed} frame ${k}: ${from} to ${to}`);
          }
        }
      }
      expect(bad.slice(0, 20)).toEqual([]);
    });
  }

  it('gives the same throw for the same roll, table and seed, and another for another seed', () => {
    const a = planThrow([4, 4], TABLES.full.throw, 12345);
    const b = planThrow([4, 4], TABLES.full.throw, 12345);
    const c = planThrow([4, 4], TABLES.full.throw, 54321);
    expect(b).toEqual(a);
    expect(c.frames).not.toEqual(a.frames);
    expect(restOf(c).map((d) => d.face)).toEqual([4, 4]);
  });

  it('plays a throw back between its frames, and holds the dice at rest after its end', () => {
    const plan = planThrow([6, 1], TABLES.half.throw, 99);
    const mid = diceAt(plan, 10.5 / FRAME_RATE);
    const [k, next] = [plan.frames[10], plan.frames[11]];
    expect(mid[0].x).toBeCloseTo((k[0].x + next[0].x) / 2, 6);
    expect(diceAt(plan, plan.duration + 1)).toEqual(restOf(plan));
    expect(diceAt(plan, -1)).toEqual(plan.frames[0]);
  });

  it('chooses faces backwards from the last, each next to the one after it', () => {
    const rng = seeded(7);
    for (let last = 1; last <= 6; last++) {
      const faces = facesBackFrom(last, 25, rng);
      expect(faces).toHaveLength(26);
      expect(faces.at(-1)).toBe(last);
      for (let i = 1; i < faces.length; i++) expect(nextTo(faces[i])).toContain(faces[i - 1]);
    }
  });
});
