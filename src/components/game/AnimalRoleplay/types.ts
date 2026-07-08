/**
 * Animal Roleplay - types and constants
 */

export const MAX_TURNS = 10;
export const MAX_HP = 100;
export const MAX_HUNGER = 100;

/** Score can grow past a fixed cap; this is only used to scale the meter bar. */
export const SCORE_METER_MAX = 150;

export type AnimalId = 'fox' | 'rabbit' | 'bear' | 'owl';

export interface AnimalProfile {
  id: AnimalId;
  emoji: string;
  speed: number; // 1-5
  strength: number; // 1-5
  stealth: number; // 1-5
  intelligence: number; // 1-5
}

export type ActionId = 'hide' | 'escape' | 'forage' | 'hunt' | 'rest';

export interface ActionDefinition {
  id: ActionId;
}

export type EventId = 'predator' | 'storm' | 'food' | 'rival' | 'trap' | 'calm';

export interface TurnEvent {
  id: EventId;
  threat: number; // 0-100
  foodRichness: number; // 0-100
}

/** Difficulty tiers scale threat, success chance, starvation bite, and score reward. */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyConfig {
  /** Multiplier applied to every event's effective threat. */
  threatMultiplier: number;
  /** Flat success-chance bonus (can be negative on hard). */
  chanceBonus: number;
  /** Extra HP lost per turn once hunger hits zero. */
  starvationBite: number;
  /** Multiplier applied to score gains (reward for the harder run). */
  scoreMultiplier: number;
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { threatMultiplier: 0.82, chanceBonus: 10, starvationBite: 10, scoreMultiplier: 0.85 },
  normal: { threatMultiplier: 1.0, chanceBonus: 0, starvationBite: 14, scoreMultiplier: 1.0 },
  hard: { threatMultiplier: 1.18, chanceBonus: -8, starvationBite: 20, scoreMultiplier: 1.25 },
};

export interface TurnLogEntry {
  turn: number;
  eventId: EventId;
  actionId: ActionId;
  success: boolean;
  chance: number; // success chance used this turn (0-100)
  hpDelta: number;
  hungerDelta: number;
  scoreDelta: number;
}

export type GameOutcome = 'win' | 'lose-hp' | 'lose-hunger';

export interface AnimalRoleplayState {
  selectedAnimalId: AnimalId | null;
  difficulty: Difficulty;
  turn: number; // completed turns
  hp: number;
  hunger: number;
  score: number;
  currentEvent: TurnEvent | null;
  lastLog: TurnLogEntry | null;
  logs: TurnLogEntry[];
  outcome: GameOutcome | null;
}

/** Injectable RNG so game logic is deterministic in tests. Defaults to Math.random. */
export type Rng = () => number;
