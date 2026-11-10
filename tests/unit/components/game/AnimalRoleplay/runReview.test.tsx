import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import {
  ACTION_DEFINITIONS,
  ANIMAL_PROFILES,
  getEventById,
  predictSuccessChance,
  resolveTurn,
  startGameWithAnimal,
} from '@/components/game/AnimalRoleplay/gameLogic';
import { getLocalStrings } from '@/components/game/AnimalRoleplay/i18n';
import { RunReviewPanel } from '@/components/game/AnimalRoleplay/RunReviewPanel';
import { buildRunReview, LUCK_MARGIN } from '@/components/game/AnimalRoleplay/runReview';
import {
  MAX_HP,
  MAX_HUNGER,
  MAX_TURNS,
  type ActionId,
  type AnimalId,
  type AnimalRoleplayState,
  type Difficulty,
  type Rng,
} from '@/components/game/AnimalRoleplay/types';
import { createI18nInstance } from '@/lib/i18n';

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

const ACTIONS = ACTION_DEFINITIONS.map((action) => action.id);

/** Plays a whole run through the real engine, recording the state before every turn. */
function playRun(
  animalId: AnimalId,
  difficulty: Difficulty,
  seed: number,
  pick: (turn: number) => ActionId = (turn) => ACTIONS[(turn + seed) % ACTIONS.length]!,
) {
  const rng = seededRng(seed);
  let state = startGameWithAnimal(animalId, difficulty, rng);
  const before: AnimalRoleplayState[] = [];
  while (!state.outcome) {
    before.push(state);
    state = resolveTurn(state, pick(state.turn), rng);
  }
  return { state, before };
}

const RUNS: Array<[AnimalId, Difficulty, number]> = [
  ['fox', 'normal', 1],
  ['rabbit', 'hard', 2],
  ['bear', 'easy', 3],
  ['owl', 'hard', 4],
  ['bear', 'hard', 5],
  ['fox', 'easy', 6],
  ['rabbit', 'normal', 7],
  ['owl', 'normal', 8],
];

describe('buildRunReview', () => {
  it('has nothing to review before an animal is chosen or a turn is played', () => {
    expect(buildRunReview({ selectedAnimalId: null, difficulty: 'normal', logs: [] })).toBeNull();
    expect(buildRunReview(startGameWithAnimal('fox', 'normal', seededRng(1)))).toBeNull();
  });

  it('rebuilds the HP and hunger of every turn exactly as the engine had them', () => {
    for (const [animalId, difficulty, seed] of RUNS) {
      const { state, before } = playRun(animalId, difficulty, seed);
      const review = buildRunReview(state)!;
      expect(review.turns).toHaveLength(state.logs.length);
      review.turns.forEach((turn, index) => {
        expect(turn.turn).toBe(index + 1);
        expect(turn.hpBefore).toBe(before[index]!.hp);
        expect(turn.hungerBefore).toBe(before[index]!.hunger);
        const after = before[index + 1] ?? state;
        expect(turn.hpAfter).toBe(after.hp);
        expect(turn.hungerAfter).toBe(after.hunger);
      });
      expect(review.lowestHp).toBe(Math.min(...review.turns.map((turn) => turn.hpAfter)));
      expect(review.lowestHunger).toBe(Math.min(...review.turns.map((turn) => turn.hungerAfter)));
      expect(review.lowestHp).toBeGreaterThanOrEqual(0);
      expect(review.lowestHp).toBeLessThanOrEqual(MAX_HP);
      expect(review.lowestHunger).toBeGreaterThanOrEqual(0);
      expect(review.lowestHunger).toBeLessThanOrEqual(MAX_HUNGER);
    }
  });

  it('names the action whose success chance was highest in the state the turn was played in', () => {
    for (const [animalId, difficulty, seed] of RUNS) {
      const { state, before } = playRun(animalId, difficulty, seed);
      const review = buildRunReview(state)!;
      review.turns.forEach((turn, index) => {
        const prior = before[index]!;
        const chances = ACTIONS.map((actionId) =>
          predictSuccessChance(
            ANIMAL_PROFILES[animalId],
            prior.currentEvent!,
            actionId,
            difficulty,
            prior.hp,
            prior.hunger,
          ),
        );
        const best = Math.max(...chances);
        expect(turn.topChance).toBe(best);
        expect(chances[ACTIONS.indexOf(turn.topActionId)]).toBe(best);
        // The chosen action counts as a highest-chance pick whenever it ties for the highest.
        expect(turn.pickedTop).toBe(turn.chance === best);
        if (turn.pickedTop) expect(turn.topActionId).toBe(turn.actionId);
      });
      expect(review.topPicks).toBe(review.turns.filter((turn) => turn.pickedTop).length);
    }
  });

  it('counts every turn as a highest-chance pick when the player always takes the highest chance', () => {
    const rng = seededRng(11);
    let state = startGameWithAnimal('owl', 'normal', rng);
    while (!state.outcome) {
      const current = state;
      const best = ACTIONS.reduce((top, actionId) => {
        const chance = (id: ActionId) =>
          predictSuccessChance(
            ANIMAL_PROFILES.owl,
            current.currentEvent!,
            id,
            current.difficulty,
            current.hp,
            current.hunger,
          );
        return chance(actionId) > chance(top) ? actionId : top;
      });
      state = resolveTurn(state, best, rng);
    }
    const review = buildRunReview(state)!;
    expect(review.topPicks).toBe(review.turns.length);
    expect(review.turns.every((turn) => turn.pickedTop)).toBe(true);
  });

  it('adds up successes and the chances of the chosen actions', () => {
    for (const [animalId, difficulty, seed] of RUNS) {
      const { state } = playRun(animalId, difficulty, seed);
      const review = buildRunReview(state)!;
      expect(review.successes).toBe(state.logs.filter((log) => log.success).length);
      expect(review.expectedSuccesses).toBeCloseTo(
        state.logs.reduce((sum, log) => sum + log.chance, 0) / 100,
        10,
      );
    }
  });

  it('calls a run lucky or unlucky only when it is a whole success away from the summed chances', () => {
    const lucky = startGameWithAnimal('fox', 'normal', seededRng(1));
    let state = lucky;
    while (!state.outcome) state = resolveTurn(state, 'forage', () => 0);
    const allSucceeded = buildRunReview(state)!;
    expect(allSucceeded.successes).toBe(allSucceeded.turns.length);
    expect(allSucceeded.successes - allSucceeded.expectedSuccesses).toBeGreaterThanOrEqual(LUCK_MARGIN);
    expect(allSucceeded.luck).toBe('lucky');

    state = startGameWithAnimal('fox', 'normal', seededRng(1));
    while (!state.outcome) state = resolveTurn(state, 'forage', () => 0.999999);
    const allFailed = buildRunReview(state)!;
    expect(allFailed.successes).toBe(0);
    expect(allFailed.expectedSuccesses).toBeGreaterThanOrEqual(LUCK_MARGIN);
    expect(allFailed.luck).toBe('unlucky');

    // One success at a 92% chance is 0.08 above the sum: not enough to call it luck.
    const event = getEventById('food');
    const chance = predictSuccessChance(ANIMAL_PROFILES.owl, event, 'forage', 'easy');
    const single = buildRunReview({
      selectedAnimalId: 'owl',
      difficulty: 'easy',
      logs: [
        {
          turn: 1,
          eventId: 'food',
          actionId: 'forage',
          success: true,
          chance,
          hpDelta: 0,
          hungerDelta: 0,
          scoreDelta: 10,
        },
      ],
    })!;
    expect(single.luck).toBe('even');
  });
});

describe('RunReviewPanel', () => {
  const render = (state: AnimalRoleplayState, lang: 'en' | 'ja') =>
    renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance(lang)}>
        <RunReviewPanel review={buildRunReview(state)!} local={getLocalStrings(lang)} />
      </I18nextProvider>,
    );

  it('lists every turn of the run, not only the last five', () => {
    const { state } = playRun('owl', 'easy', 3, () => 'forage');
    expect(state.logs.length).toBeGreaterThan(5);
    const markup = render(state, 'en');
    expect(markup.match(/data-testid="animal-run-turn"/g)).toHaveLength(state.logs.length);
    for (let turn = 1; turn <= state.logs.length; turn += 1) {
      expect(markup).toContain(`Turn ${turn} / ${MAX_TURNS}`);
    }
    expect(markup).toContain('Run review');
    expect(markup).toContain('aria-label="HP and hunger after each turn"');
    expect(markup.match(/<polyline/g)).toHaveLength(2);
  });

  it('shows the higher-chance action only on turns where the player passed it up', () => {
    const { state } = playRun('bear', 'normal', 5);
    const review = buildRunReview(state)!;
    const passed = review.turns.filter((turn) => !turn.pickedTop);
    expect(passed.length).toBeGreaterThan(0);
    const markup = render(state, 'en');
    expect(markup.match(/Highest chance: /g)).toHaveLength(passed.length);
    expect(markup).toContain(`${review.topPicks} of ${review.turns.length} turns`);
    expect(markup).toContain(`data-luck="${review.luck}"`);
  });

  it('is fully translated in Japanese', () => {
    const { state } = playRun('bear', 'normal', 5);
    const markup = render(state, 'ja');
    const ja = getLocalStrings('ja').review;
    expect(markup).toContain(ja.heading);
    expect(markup).toContain(`aria-label="${ja.chartLabel}"`);
    expect(markup).toContain(ja.turnsLabel);
    expect(markup).toContain(ja.topNote);
    expect(markup).toContain('成功率最高: ');
    expect(markup).not.toMatch(/Highest chance|Lowest HP|Succeeded|Run review|Turn by turn/);
  });

  it('keeps the two languages’ review strings in step', () => {
    const en = getLocalStrings('en').review;
    const ja = getLocalStrings('ja').review;
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ja.luck).sort()).toEqual(Object.keys(en.luck).sort());
  });
});
