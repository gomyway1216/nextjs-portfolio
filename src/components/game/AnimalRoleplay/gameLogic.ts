/**
 * Animal Roleplay - game logic
 *
 * Pure, deterministic-when-seeded turn engine. All randomness flows through an
 * injectable `Rng` so the whole engine is unit-testable without touching Math.random.
 */

import {
  ActionDefinition,
  ActionId,
  AnimalId,
  AnimalProfile,
  AnimalRoleplayState,
  Difficulty,
  DIFFICULTY_CONFIG,
  MAX_HP,
  MAX_HUNGER,
  MAX_TURNS,
  Rng,
  TurnEvent,
  TurnLogEntry,
} from './types';

const BASE_HUNGER_COST = 10;
const DEFAULT_DIFFICULTY: Difficulty = 'normal';

const defaultRng: Rng = () => Math.random();

export const ANIMAL_PROFILES: Record<AnimalId, AnimalProfile> = {
  fox: { id: 'fox', emoji: '🦊', speed: 4, strength: 2, stealth: 5, intelligence: 4 },
  rabbit: { id: 'rabbit', emoji: '🐇', speed: 5, strength: 1, stealth: 3, intelligence: 3 },
  bear: { id: 'bear', emoji: '🐻', speed: 2, strength: 5, stealth: 2, intelligence: 3 },
  owl: { id: 'owl', emoji: '🦉', speed: 3, strength: 2, stealth: 4, intelligence: 5 },
};

export const ACTION_DEFINITIONS: ActionDefinition[] = [
  { id: 'hide' },
  { id: 'escape' },
  { id: 'forage' },
  { id: 'hunt' },
  { id: 'rest' },
];

const TURN_EVENTS: TurnEvent[] = [
  { id: 'predator', threat: 78, foodRichness: 12 },
  { id: 'storm', threat: 62, foodRichness: 18 },
  { id: 'food', threat: 18, foodRichness: 90 },
  { id: 'rival', threat: 66, foodRichness: 36 },
  { id: 'trap', threat: 54, foodRichness: 22 },
  { id: 'calm', threat: 14, foodRichness: 48 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

function getRandomEvent(rng: Rng, previousId: TurnEvent['id'] | null): TurnEvent {
  if (TURN_EVENTS.length === 1) return TURN_EVENTS[0]!;
  let next = TURN_EVENTS[randomInt(rng, TURN_EVENTS.length)]!;
  // Avoid immediately repeating the same event twice in a row.
  let guard = 0;
  while (previousId && next.id === previousId && guard < 20) {
    next = TURN_EVENTS[randomInt(rng, TURN_EVENTS.length)]!;
    guard += 1;
  }
  return next;
}

/**
 * Effective threat of an event given difficulty. Kept as a helper so the UI can
 * show the same number the engine uses.
 */
export function effectiveThreat(event: TurnEvent, difficulty: Difficulty): number {
  return clamp(Math.round(event.threat * DIFFICULTY_CONFIG[difficulty].threatMultiplier), 0, 100);
}

/**
 * Success chance (0-100) for an action. Deterministic given inputs so both the
 * engine and the UI's "predicted %" use the exact same formula.
 *
 * Beyond raw stats it now factors:
 *  - difficulty (threat multiplier + flat chance bonus)
 *  - current condition: a weak/hungry animal is more likely to fumble risky moves,
 *    while resting/hiding gets slightly easier when desperate.
 */
export function predictSuccessChance(
  animal: AnimalProfile,
  event: TurnEvent,
  actionId: ActionId,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  hp: number = MAX_HP,
  hunger: number = MAX_HUNGER,
): number {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const threat = event.threat * cfg.threatMultiplier;
  let chance = 40 + cfg.chanceBonus;

  switch (actionId) {
    case 'hide':
      chance += animal.stealth * 8 + animal.intelligence * 3 - threat * 0.32 + event.foodRichness * 0.06;
      if (event.id === 'predator') chance += 8;
      if (event.id === 'trap') chance += animal.stealth * 2; // spotting/avoiding traps
      break;
    case 'escape':
      chance += animal.speed * 9 + animal.intelligence * 2 - threat * 0.28 + event.foodRichness * 0.03;
      if (event.id === 'trap') chance -= 6; // fleeing blindly can trip a trap
      break;
    case 'forage':
      chance += animal.intelligence * 7 + animal.stealth * 4 - threat * 0.2 + event.foodRichness * 0.2;
      if (event.id === 'food') chance += 10;
      break;
    case 'hunt':
      chance += animal.strength * 8 + animal.speed * 3 - threat * 0.2 + event.foodRichness * 0.12;
      if (event.id === 'rival') chance += 6;
      break;
    case 'rest':
      chance += animal.intelligence * 6 + animal.stealth * 2 - threat * 0.25;
      if (event.id === 'predator') chance -= 10;
      if (event.id === 'calm') chance += 8;
      break;
  }

  // Condition modifiers. Low HP makes aggressive actions riskier; low hunger saps
  // the energy needed for physical actions. Passive actions are barely affected.
  const hpFactor = hp / MAX_HP; // 0..1
  const hungerFactor = hunger / MAX_HUNGER; // 0..1
  if (actionId === 'hunt' || actionId === 'escape') {
    chance -= (1 - hpFactor) * 10;
    chance -= (1 - hungerFactor) * 12;
  } else if (actionId === 'forage') {
    chance -= (1 - hungerFactor) * 6;
  } else if (actionId === 'hide' || actionId === 'rest') {
    // Desperation focus: a cornered animal hides/rests a touch more reliably.
    chance += (1 - hpFactor) * 4;
  }

  return Math.round(clamp(chance, 8, 92));
}

function resolveSuccess(
  animal: AnimalProfile,
  event: TurnEvent,
  actionId: ActionId,
): { hpDelta: number; hungerDelta: number; scoreDelta: number } {
  let hpDelta = 0;
  let hungerDelta = -BASE_HUNGER_COST;
  let scoreDelta = 3;

  switch (actionId) {
    case 'hide':
      hungerDelta -= 2;
      scoreDelta += 2;
      break;
    case 'escape':
      hungerDelta -= 3;
      scoreDelta += 2;
      break;
    case 'forage':
      hungerDelta += 24 + animal.intelligence * 2 + Math.floor(event.foodRichness / 3);
      scoreDelta += 6;
      break;
    case 'hunt':
      hpDelta -= 2;
      hungerDelta += 18 + animal.strength * 2 + Math.floor(event.foodRichness / 4);
      scoreDelta += 7;
      break;
    case 'rest':
      hpDelta += 12 + animal.intelligence;
      hungerDelta -= 4;
      scoreDelta += 4;
      break;
  }

  if (event.id === 'calm') {
    hpDelta += 4;
    hungerDelta += 6;
    scoreDelta += 2;
  } else if (event.id === 'storm') {
    hungerDelta -= 2;
  } else if (event.id === 'food' && (actionId === 'forage' || actionId === 'hunt')) {
    hungerDelta += 8;
  } else if (event.id === 'trap' && (actionId === 'hide' || actionId === 'escape')) {
    // Successfully slipping a trap is worth a little extra.
    scoreDelta += 3;
  }

  return { hpDelta, hungerDelta, scoreDelta };
}

function resolveFailure(
  event: TurnEvent,
  actionId: ActionId,
  difficulty: Difficulty,
): { hpDelta: number; hungerDelta: number; scoreDelta: number } {
  const threat = event.threat * DIFFICULTY_CONFIG[difficulty].threatMultiplier;
  let hpDelta = -Math.max(4, Math.round(threat / 6));
  let hungerDelta = -BASE_HUNGER_COST - 4;
  const scoreDelta = -2;

  switch (actionId) {
    case 'hide':
      hpDelta -= 2;
      break;
    case 'escape':
      hpDelta -= 1;
      break;
    case 'forage':
      hpDelta += 2;
      break;
    case 'hunt':
      hpDelta -= 4;
      break;
    case 'rest':
      hpDelta -= 3;
      hungerDelta -= 3;
      break;
  }

  if (event.id === 'predator') {
    hpDelta -= 4;
  } else if (event.id === 'storm') {
    hpDelta -= 2;
  } else if (event.id === 'food') {
    hungerDelta += 5;
  } else if (event.id === 'calm') {
    hpDelta += 3;
  } else if (event.id === 'trap') {
    hpDelta -= 3; // sprung trap
  }

  return { hpDelta, hungerDelta, scoreDelta };
}

export function createInitialState(difficulty: Difficulty = DEFAULT_DIFFICULTY): AnimalRoleplayState {
  return {
    selectedAnimalId: null,
    difficulty,
    turn: 0,
    hp: MAX_HP,
    hunger: MAX_HUNGER,
    score: 0,
    currentEvent: null,
    lastLog: null,
    logs: [],
    outcome: null,
  };
}

export function startGameWithAnimal(
  animalId: AnimalId,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  rng: Rng = defaultRng,
): AnimalRoleplayState {
  return {
    selectedAnimalId: animalId,
    difficulty,
    turn: 0,
    hp: MAX_HP,
    hunger: MAX_HUNGER,
    score: 0,
    currentEvent: getRandomEvent(rng, null),
    lastLog: null,
    logs: [],
    outcome: null,
  };
}

export function resolveTurn(
  state: AnimalRoleplayState,
  actionId: ActionId,
  rng: Rng = defaultRng,
): AnimalRoleplayState {
  if (!state.selectedAnimalId || !state.currentEvent || state.outcome) {
    return state;
  }

  const animal = ANIMAL_PROFILES[state.selectedAnimalId];
  const event = state.currentEvent;
  const cfg = DIFFICULTY_CONFIG[state.difficulty];
  const successChance = predictSuccessChance(
    animal,
    event,
    actionId,
    state.difficulty,
    state.hp,
    state.hunger,
  );
  const success = rng() * 100 < successChance;
  const effects = success
    ? resolveSuccess(animal, event, actionId)
    : resolveFailure(event, actionId, state.difficulty);

  let hpDelta = effects.hpDelta;
  const hungerDelta = effects.hungerDelta;
  let scoreDelta = Math.round(effects.scoreDelta * (effects.scoreDelta > 0 ? cfg.scoreMultiplier : 1));

  const nextHunger = clamp(state.hunger + hungerDelta, 0, MAX_HUNGER);
  let nextHp = clamp(state.hp + hpDelta, 0, MAX_HP);

  // Starvation penalty once hunger reaches zero (scaled by difficulty).
  if (nextHunger <= 0) {
    const bite = cfg.starvationBite;
    nextHp = clamp(nextHp - bite, 0, MAX_HP);
    hpDelta -= bite;
  }

  const nextTurn = state.turn + 1;
  const nextScore = Math.max(
    0,
    state.score + scoreDelta + (success ? 1 : 0) + Math.max(0, Math.floor(hpDelta / 4)),
  );
  scoreDelta = nextScore - state.score;

  let outcome: AnimalRoleplayState['outcome'] = null;
  if (nextHp <= 0) {
    outcome = 'lose-hp';
  } else if (nextHunger <= 0) {
    outcome = 'lose-hunger';
  } else if (nextTurn >= MAX_TURNS) {
    outcome = 'win';
  }

  const logEntry: TurnLogEntry = {
    turn: nextTurn,
    eventId: event.id,
    actionId,
    success,
    chance: successChance,
    hpDelta,
    hungerDelta,
    scoreDelta,
  };

  return {
    ...state,
    turn: nextTurn,
    hp: nextHp,
    hunger: nextHunger,
    score: nextScore,
    currentEvent: outcome ? null : getRandomEvent(rng, event.id),
    lastLog: logEntry,
    logs: [...state.logs, logEntry],
    outcome,
  };
}
