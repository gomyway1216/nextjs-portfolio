/**
 * Animal Roleplay - types and constants
 */

export const MAX_TURNS = 10;
export const MAX_HP = 100;
export const MAX_HUNGER = 100;

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

export interface TurnLogEntry {
  turn: number;
  eventId: EventId;
  actionId: ActionId;
  success: boolean;
  hpDelta: number;
  hungerDelta: number;
  scoreDelta: number;
}

export type GameOutcome = 'win' | 'lose-hp' | 'lose-hunger';

export interface AnimalRoleplayState {
  selectedAnimalId: AnimalId | null;
  turn: number; // completed turns
  hp: number;
  hunger: number;
  score: number;
  currentEvent: TurnEvent | null;
  lastLog: TurnLogEntry | null;
  logs: TurnLogEntry[];
  outcome: GameOutcome | null;
}
