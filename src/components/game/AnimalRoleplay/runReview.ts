/**
 * Animal Roleplay - post-run review
 *
 * Rebuilds the whole run from the turn log: the HP/hunger the animal had going
 * into each turn, and which action had the highest success chance at that moment.
 */

import { ACTION_DEFINITIONS, ANIMAL_PROFILES, getEventById, predictSuccessChance } from './gameLogic';
import { ActionId, AnimalRoleplayState, MAX_HP, MAX_HUNGER, TurnLogEntry } from './types';

/** A run counts as lucky/unlucky once it is a whole success away from the summed chances. */
export const LUCK_MARGIN = 1;

export type RunLuck = 'lucky' | 'unlucky' | 'even';

export interface ReviewTurn extends TurnLogEntry {
  hpBefore: number;
  hpAfter: number;
  hungerBefore: number;
  hungerAfter: number;
  /** Action with the highest success chance this turn; the chosen one when it ties for it. */
  topActionId: ActionId;
  topChance: number;
  /** True when the chosen action's chance equals the highest one. */
  pickedTop: boolean;
}

export interface RunReview {
  turns: ReviewTurn[];
  successes: number;
  /** Sum of the chosen actions' success chances, in successes (e.g. 5.4). */
  expectedSuccesses: number;
  luck: RunLuck;
  topPicks: number;
  lowestHp: number;
  lowestHunger: number;
}

export function buildRunReview(
  state: Pick<AnimalRoleplayState, 'selectedAnimalId' | 'difficulty' | 'logs'>,
): RunReview | null {
  if (!state.selectedAnimalId || state.logs.length === 0) return null;
  const animal = ANIMAL_PROFILES[state.selectedAnimalId];

  let hp = MAX_HP;
  let hunger = MAX_HUNGER;
  const turns = state.logs.map((log): ReviewTurn => {
    const event = getEventById(log.eventId);
    let topActionId: ActionId = log.actionId;
    let topChance = log.chance;
    for (const action of ACTION_DEFINITIONS) {
      const chance = predictSuccessChance(animal, event, action.id, state.difficulty, hp, hunger);
      if (chance > topChance) {
        topChance = chance;
        topActionId = action.id;
      }
    }
    const turn: ReviewTurn = {
      ...log,
      hpBefore: hp,
      hpAfter: hp + log.hpDelta,
      hungerBefore: hunger,
      hungerAfter: hunger + log.hungerDelta,
      topActionId,
      topChance,
      pickedTop: topActionId === log.actionId,
    };
    hp = turn.hpAfter;
    hunger = turn.hungerAfter;
    return turn;
  });

  const successes = turns.filter((turn) => turn.success).length;
  const expectedSuccesses = turns.reduce((sum, turn) => sum + turn.chance, 0) / 100;
  const diff = successes - expectedSuccesses;
  const luck: RunLuck = diff >= LUCK_MARGIN ? 'lucky' : diff <= -LUCK_MARGIN ? 'unlucky' : 'even';

  return {
    turns,
    successes,
    expectedSuccesses,
    luck,
    topPicks: turns.filter((turn) => turn.pickedTop).length,
    lowestHp: Math.min(...turns.map((turn) => turn.hpAfter)),
    lowestHunger: Math.min(...turns.map((turn) => turn.hungerAfter)),
  };
}
