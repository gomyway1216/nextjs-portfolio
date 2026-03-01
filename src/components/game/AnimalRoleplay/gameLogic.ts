/**
 * Animal Roleplay - game logic
 */

import {
  ActionDefinition,
  ActionId,
  AnimalId,
  AnimalProfile,
  AnimalRoleplayState,
  MAX_HP,
  MAX_HUNGER,
  MAX_TURNS,
  TurnEvent,
  TurnLogEntry,
} from './types';

const BASE_HUNGER_COST = 10;

export const ANIMAL_PROFILES: Record<AnimalId, AnimalProfile> = {
  fox: {
    id: 'fox',
    emoji: '🦊',
    speed: 4,
    strength: 2,
    stealth: 5,
    intelligence: 4,
  },
  rabbit: {
    id: 'rabbit',
    emoji: '🐇',
    speed: 5,
    strength: 1,
    stealth: 3,
    intelligence: 3,
  },
  bear: {
    id: 'bear',
    emoji: '🐻',
    speed: 2,
    strength: 5,
    stealth: 2,
    intelligence: 3,
  },
  owl: {
    id: 'owl',
    emoji: '🦉',
    speed: 3,
    strength: 2,
    stealth: 4,
    intelligence: 5,
  },
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

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function getRandomEvent(previousId: TurnEvent['id'] | null): TurnEvent {
  if (TURN_EVENTS.length === 1) return TURN_EVENTS[0]!;
  let next = TURN_EVENTS[randomInt(TURN_EVENTS.length)]!;
  while (previousId && next.id === previousId) {
    next = TURN_EVENTS[randomInt(TURN_EVENTS.length)]!;
  }
  return next;
}

function getSuccessChance(animal: AnimalProfile, event: TurnEvent, actionId: ActionId): number {
  let chance = 40;

  switch (actionId) {
    case 'hide':
      chance += animal.stealth * 8 + animal.intelligence * 3 - event.threat * 0.32 + event.foodRichness * 0.06;
      if (event.id === 'predator') chance += 8;
      break;
    case 'escape':
      chance += animal.speed * 9 + animal.intelligence * 2 - event.threat * 0.28 + event.foodRichness * 0.03;
      break;
    case 'forage':
      chance += animal.intelligence * 7 + animal.stealth * 4 - event.threat * 0.2 + event.foodRichness * 0.2;
      if (event.id === 'food') chance += 10;
      break;
    case 'hunt':
      chance += animal.strength * 8 + animal.speed * 3 - event.threat * 0.2 + event.foodRichness * 0.12;
      if (event.id === 'rival') chance += 6;
      break;
    case 'rest':
      chance += animal.intelligence * 6 + animal.stealth * 2 - event.threat * 0.25;
      if (event.id === 'predator') chance -= 10;
      break;
  }

  return clamp(chance, 15, 90);
}

function resolveSuccess(
  animal: AnimalProfile,
  event: TurnEvent,
  actionId: ActionId
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
  }

  return { hpDelta, hungerDelta, scoreDelta };
}

function resolveFailure(
  event: TurnEvent,
  actionId: ActionId
): { hpDelta: number; hungerDelta: number; scoreDelta: number } {
  let hpDelta = -Math.max(4, Math.round(event.threat / 6));
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
  }

  return { hpDelta, hungerDelta, scoreDelta };
}

export function createInitialState(): AnimalRoleplayState {
  return {
    selectedAnimalId: null,
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

export function startGameWithAnimal(animalId: AnimalId): AnimalRoleplayState {
  return {
    selectedAnimalId: animalId,
    turn: 0,
    hp: MAX_HP,
    hunger: MAX_HUNGER,
    score: 0,
    currentEvent: getRandomEvent(null),
    lastLog: null,
    logs: [],
    outcome: null,
  };
}

export function resolveTurn(state: AnimalRoleplayState, actionId: ActionId): AnimalRoleplayState {
  if (!state.selectedAnimalId || !state.currentEvent || state.outcome) {
    return state;
  }

  const animal = ANIMAL_PROFILES[state.selectedAnimalId];
  const event = state.currentEvent;
  const successChance = getSuccessChance(animal, event, actionId);
  const success = Math.random() * 100 < successChance;
  const effects = success ? resolveSuccess(animal, event, actionId) : resolveFailure(event, actionId);

  let hpDelta = effects.hpDelta;
  const hungerDelta = effects.hungerDelta;
  let scoreDelta = effects.scoreDelta;

  const nextHunger = clamp(state.hunger + hungerDelta, 0, MAX_HUNGER);
  let nextHp = clamp(state.hp + hpDelta, 0, MAX_HP);

  // Starvation penalty once hunger reaches zero.
  if (nextHunger <= 0) {
    nextHp = clamp(nextHp - 14, 0, MAX_HP);
    hpDelta -= 14;
  }

  const nextTurn = state.turn + 1;
  const nextScore = Math.max(
    0,
    state.score + scoreDelta + (success ? 1 : 0) + Math.max(0, Math.floor(hpDelta / 4))
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
    currentEvent: outcome ? null : getRandomEvent(event.id),
    lastLog: logEntry,
    logs: [...state.logs, logEntry],
    outcome,
  };
}
