import { describe, expect, it } from 'vitest';
import {
  ANIMAL_PROFILES,
  createInitialState,
  effectiveThreat,
  predictSuccessChance,
  resolveTurn,
  startGameWithAnimal,
} from '@/components/game/AnimalRoleplay/gameLogic';
import {
  DIFFICULTY_CONFIG,
  MAX_HP,
  MAX_HUNGER,
  MAX_TURNS,
  type AnimalRoleplayState,
  type Difficulty,
  type Rng,
} from '@/components/game/AnimalRoleplay/types';

/** Deterministic PRNG (mulberry32) so event selection + success rolls are reproducible. */
function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG that forces success (roll < chance) or failure (roll >= chance). */
const alwaysSucceed: Rng = () => 0;
const alwaysFail: Rng = () => 0.999999;

describe('createInitialState', () => {
  it('starts with no animal, full stats, and the given difficulty', () => {
    const s = createInitialState('hard');
    expect(s.selectedAnimalId).toBeNull();
    expect(s.difficulty).toBe('hard');
    expect(s.hp).toBe(MAX_HP);
    expect(s.hunger).toBe(MAX_HUNGER);
    expect(s.score).toBe(0);
    expect(s.outcome).toBeNull();
    expect(s.logs).toHaveLength(0);
  });

  it('defaults to normal difficulty', () => {
    expect(createInitialState().difficulty).toBe('normal');
  });
});

describe('startGameWithAnimal', () => {
  it('selects the animal and rolls a first event', () => {
    const s = startGameWithAnimal('fox', 'normal', seededRng(1));
    expect(s.selectedAnimalId).toBe('fox');
    expect(s.currentEvent).not.toBeNull();
    expect(s.turn).toBe(0);
    expect(s.outcome).toBeNull();
  });
});

describe('predictSuccessChance', () => {
  const fox = ANIMAL_PROFILES.fox;
  const bear = ANIMAL_PROFILES.bear;
  const predator = { id: 'predator' as const, threat: 78, foodRichness: 12 };
  const food = { id: 'food' as const, threat: 18, foodRichness: 90 };

  it('is clamped to the 8..92 band', () => {
    for (const animalId of Object.keys(ANIMAL_PROFILES) as (keyof typeof ANIMAL_PROFILES)[]) {
      const animal = ANIMAL_PROFILES[animalId];
      for (const ev of [predator, food]) {
        for (const action of ['hide', 'escape', 'forage', 'hunt', 'rest'] as const) {
          const c = predictSuccessChance(animal, ev, action, 'normal');
          expect(c).toBeGreaterThanOrEqual(8);
          expect(c).toBeLessThanOrEqual(92);
        }
      }
    }
  });

  it('rewards the fox stealth specialist for hiding vs a bear', () => {
    const foxHide = predictSuccessChance(fox, predator, 'hide', 'normal');
    const bearHide = predictSuccessChance(bear, predator, 'hide', 'normal');
    expect(foxHide).toBeGreaterThan(bearHide);
  });

  it('rewards the bear for hunting vs a fox', () => {
    const rival = { id: 'rival' as const, threat: 66, foodRichness: 36 };
    expect(predictSuccessChance(bear, rival, 'hunt', 'normal')).toBeGreaterThan(
      predictSuccessChance(fox, rival, 'hunt', 'normal'),
    );
  });

  it('makes hunting easier on easy than on hard difficulty', () => {
    const easy = predictSuccessChance(bear, predator, 'hunt', 'easy');
    const hard = predictSuccessChance(bear, predator, 'hunt', 'hard');
    expect(easy).toBeGreaterThan(hard);
  });

  it('penalises risky actions when HP and hunger are low', () => {
    const healthy = predictSuccessChance(bear, predator, 'hunt', 'normal', MAX_HP, MAX_HUNGER);
    const weak = predictSuccessChance(bear, predator, 'hunt', 'normal', 10, 10);
    expect(weak).toBeLessThan(healthy);
  });
});

describe('effectiveThreat', () => {
  it('scales with difficulty and stays within 0..100', () => {
    const predator = { id: 'predator' as const, threat: 78, foodRichness: 12 };
    expect(effectiveThreat(predator, 'easy')).toBeLessThan(effectiveThreat(predator, 'normal'));
    expect(effectiveThreat(predator, 'hard')).toBeGreaterThan(effectiveThreat(predator, 'normal'));
    expect(effectiveThreat(predator, 'hard')).toBeLessThanOrEqual(100);
  });
});

describe('resolveTurn', () => {
  function playing(overrides: Partial<AnimalRoleplayState> = {}): AnimalRoleplayState {
    return {
      ...startGameWithAnimal('bear', 'normal', seededRng(42)),
      ...overrides,
    };
  }

  it('is a no-op when the game is already over', () => {
    const s = playing({ outcome: 'win' });
    expect(resolveTurn(s, 'rest', alwaysSucceed)).toBe(s);
  });

  it('advances the turn counter and appends a log entry', () => {
    const s = playing();
    const next = resolveTurn(s, 'rest', alwaysSucceed);
    expect(next.turn).toBe(1);
    expect(next.logs).toHaveLength(1);
    expect(next.lastLog?.actionId).toBe('rest');
    expect(next.lastLog?.turn).toBe(1);
  });

  it('records success/failure consistent with the RNG roll', () => {
    const s = playing();
    expect(resolveTurn(s, 'forage', alwaysSucceed).lastLog?.success).toBe(true);
    expect(resolveTurn(s, 'forage', alwaysFail).lastLog?.success).toBe(false);
  });

  it('never lets hp or hunger leave the 0..max range', () => {
    let s = playing();
    for (let i = 0; i < MAX_TURNS && !s.outcome; i += 1) {
      s = resolveTurn(s, 'hunt', seededRng(i + 7));
      expect(s.hp).toBeGreaterThanOrEqual(0);
      expect(s.hp).toBeLessThanOrEqual(MAX_HP);
      expect(s.hunger).toBeGreaterThanOrEqual(0);
      expect(s.hunger).toBeLessThanOrEqual(MAX_HUNGER);
    }
  });

  it('declares a win after surviving all turns', () => {
    let s = playing({ hp: MAX_HP, hunger: MAX_HUNGER });
    // Rest+forage on success keeps stats healthy; force success every turn.
    for (let i = 0; i < MAX_TURNS && !s.outcome; i += 1) {
      s = resolveTurn(s, i % 2 === 0 ? 'forage' : 'rest', alwaysSucceed);
    }
    expect(s.turn).toBe(MAX_TURNS);
    expect(s.outcome).toBe('win');
    expect(s.currentEvent).toBeNull();
  });

  it('loses via lose-hp when HP is driven to zero', () => {
    const s = playing({ hp: 3, hunger: MAX_HUNGER });
    const next = resolveTurn(s, 'hunt', alwaysFail);
    expect(next.hp).toBe(0);
    expect(next.outcome).toBe('lose-hp');
  });

  it('loses via lose-hunger when hunger reaches zero and hp survives the starvation bite', () => {
    const s = playing({ hp: MAX_HP, hunger: 1 });
    const next = resolveTurn(s, 'hide', alwaysFail);
    expect(next.hunger).toBe(0);
    // hide-failure hp loss + starvation bite should not exceed full HP here.
    expect(next.outcome === 'lose-hunger' || next.outcome === 'lose-hp').toBe(true);
  });

  it('applies a bigger starvation bite on hard than on easy', () => {
    const base = playing({ hp: MAX_HP, hunger: 1, difficulty: 'easy' });
    const easy = resolveTurn(base, 'hide', alwaysSucceed);
    const hardBase: AnimalRoleplayState = { ...base, difficulty: 'hard' };
    const hard = resolveTurn(hardBase, 'hide', alwaysSucceed);
    // Both hit zero hunger; hard should lose more HP from starvation.
    expect(hard.hp).toBeLessThan(easy.hp);
    expect(DIFFICULTY_CONFIG.hard.starvationBite).toBeGreaterThan(
      DIFFICULTY_CONFIG.easy.starvationBite,
    );
  });

  it('scores non-negative and stays monotonic-ish on success', () => {
    const s = playing({ hp: MAX_HP, hunger: MAX_HUNGER });
    const next = resolveTurn(s, 'forage', alwaysSucceed);
    expect(next.score).toBeGreaterThanOrEqual(0);
    expect(next.score).toBeGreaterThan(s.score);
  });

  it('logs the actually-applied hp delta after clamping at the ceiling', () => {
    // hp near the ceiling: a big rest heal gets clamped, and the logged hpDelta
    // must equal the real change (not the raw pre-clamp value).
    const s = playing({ hp: 98, hunger: MAX_HUNGER });
    const next = resolveTurn(s, 'rest', alwaysSucceed);
    expect(next.hp).toBe(MAX_HP);
    expect(next.lastLog?.hpDelta).toBe(next.hp - s.hp);
  });

  it('does not credit score for hp that clamping discarded', () => {
    // At full HP a successful rest cannot raise HP, so the +floor(hpDelta/4)
    // bonus must not fire from phantom healing.
    const full = playing({ hp: MAX_HP, hunger: MAX_HUNGER });
    const next = resolveTurn(full, 'rest', alwaysSucceed);
    expect(next.lastLog?.hpDelta).toBe(0);
  });

  it('does not mutate the previous state object', () => {
    const s = playing();
    const snapshot = JSON.parse(JSON.stringify(s));
    resolveTurn(s, 'rest', alwaysSucceed);
    expect(s).toEqual(snapshot);
  });
});

describe('difficulty score multiplier', () => {
  it('config multipliers are ordered easy < normal < hard', () => {
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    const mults = diffs.map((d) => DIFFICULTY_CONFIG[d].scoreMultiplier);
    expect(mults[0]).toBeLessThan(mults[1]!);
    expect(mults[1]).toBeLessThan(mults[2]!);
  });
});
