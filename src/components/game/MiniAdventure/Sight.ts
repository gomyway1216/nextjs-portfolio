/**
 * Mini Adventure - what the player can currently see of the enemies.
 * Pure read-only helpers for the "in sight" panel; nothing here changes the game state.
 */

import { getEnemyChar, getEnemyColor } from './Enemies';
import { damageRange, getPlayerAttack, getPlayerDefense } from './GameEngine';
import {
  chebyshevDistance, DIFFICULTY_CONFIGS, Enemy, EnemyType, GameState, StatusEffect,
} from './types';

export type EnemyTrait = 'resistsMagic' | 'canPassWalls' | 'eatsEggs' | 'canDisable';

const TRAITS: EnemyTrait[] = ['resistsMagic', 'canPassWalls', 'eatsEggs', 'canDisable'];

export interface DamageSpan {
  min: number;
  max: number;
}

export interface SightEnemy {
  id: string;
  type: EnemyType;
  char: string;
  color: string;
  hp: number;
  maxHp: number;
  status: StatusEffect;
  /** Steps away, counting a diagonal as one step. */
  distance: number;
  /** Damage one of the player's melee hits does to it right now. */
  dealt: DamageSpan;
  /** Damage one of its hits does to the player right now, darkness included. */
  taken: DamageSpan;
  traits: EnemyTrait[];
}

/** Damage of one player melee hit on this enemy, as processPlayerAttack would roll it. */
export function damageDealtTo(state: GameState, enemy: Enemy): DamageSpan {
  return damageRange(getPlayerAttack(state.player), enemy.defense);
}

/** Damage of one hit by this enemy, as processEnemyTurns would roll it (extra in the dark). */
export function damageTakenFrom(state: GameState, enemy: Enemy): DamageSpan {
  const span = damageRange(enemy.attack, getPlayerDefense(state.player));
  if (state.player.torch > 0) return span;
  const mult = DIFFICULTY_CONFIGS[state.difficulty].darknessMult;
  return { min: Math.floor(span.min * mult), max: Math.floor(span.max * mult) };
}

/** Living enemies standing on a tile the player can see, nearest first. */
export function describeSight(state: GameState): SightEnemy[] {
  const { floor, player } = state;
  return floor.enemies
    .filter(e => e.hp > 0 && floor.tiles[e.y]?.[e.x]?.visible)
    .map(e => ({
      id: e.id,
      type: e.type,
      char: getEnemyChar(e),
      color: getEnemyColor(e),
      hp: e.hp,
      maxHp: e.maxHp,
      status: e.status,
      distance: chebyshevDistance(e, player),
      dealt: damageDealtTo(state, e),
      taken: damageTakenFrom(state, e),
      traits: TRAITS.filter(trait => e[trait]),
    }))
    // Array.prototype.sort is stable, so equally distant enemies keep the floor's order.
    .sort((a, b) => a.distance - b.distance);
}
