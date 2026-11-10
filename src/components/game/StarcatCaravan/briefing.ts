import { STAGES, type Character, type Element } from './data';
import { ELEMENT_ADVANTAGES } from './elements';
import { createArena, encounterCount } from './arena';
import type { Save } from './engine';

export interface Foe { hp: number; defense: number; hit: number; burst: number }
export interface Briefing {
  stage: number;
  element: Element;
  enemies: number;
  hp: number;
  attack: number;
  defense: number;
  shadow: Foe;
  guardian: Foe;
  /** Party order; `edge` marks a 1.5× normal attack against this island's shadows. */
  party: { id: string; edge: boolean }[];
  /** Owned companions outside the party whose element has that same edge. */
  bench: string[];
}

const reduced = (power: number, defense: number) => Math.max(1, Math.round(power * 100 / (100 + defense)));

/** Read-only numbers for an island's fortress battle, taken from the party the arena would field. */
export function battleBriefing(save: Save, stage: number, characters: readonly Character[]): Briefing | null {
  const known = (id: string) => Object.hasOwn(save.owned, id) && characters.some((cat) => cat.id === id);
  if (!save.team.every(known)) return null;
  const arena = createArena(save, stage, characters);
  if (!arena) return null;
  const { element, strength } = STAGES[stage];
  const edge = (id: string) => ELEMENT_ADVANTAGES[characters.find((cat) => cat.id === id)!.element].includes(element);
  const attack = arena.companions.reduce((sum, cat) => sum + cat.attack, 0);
  const foe = (boss: boolean): Foe => {
    const defense = Math.round((boss ? 18 : 4) * strength);
    return { hp: Math.round((boss ? 750 : 130) * strength), defense, hit: reduced((boss ? 65 : 22) * strength, arena.defense), burst: reduced(attack * 3, defense) };
  };
  return {
    stage, element, enemies: encounterCount(stage), hp: arena.maxHp, attack, defense: arena.defense,
    shadow: foe(false), guardian: foe(true),
    party: save.team.map((id) => ({ id, edge: edge(id) })),
    bench: characters.filter((cat) => known(cat.id) && !save.team.includes(cat.id) && edge(cat.id)).map((cat) => cat.id),
  };
}
