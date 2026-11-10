/**
 * Space Invaders - short-lived hit feedback (bursts and score pop-ups).
 *
 * Purely cosmetic: nothing here feeds back into the simulation. Lifetimes are
 * in milliseconds of simulated time, so effects last equally long on any
 * display refresh rate.
 */

import { CANVAS_WIDTH, Enemy, EnemyType, GameState } from './types';

export const BURST_MS = 320;
export const PLAYER_BURST_MS = 520;
export const POPUP_MS = 750;
/** Upper bound on live effects; the oldest are dropped first. */
export const MAX_EFFECTS = 48;

export interface Effect {
  kind: 'burst' | 'popup';
  x: number;
  y: number;
  color: string;
  /** Burst reach in logical pixels (bursts only). */
  radius: number;
  /** Text to show (pop-ups only). */
  text: string;
  age: number;
  life: number;
}

function push(effects: Effect[], effect: Effect): void {
  effects.push(effect);
  if (effects.length > MAX_EFFECTS) effects.splice(0, effects.length - MAX_EFFECTS);
}

export function spawnBurst(
  effects: Effect[],
  x: number,
  y: number,
  color: string,
  radius: number = 24,
  life: number = BURST_MS
): void {
  push(effects, { kind: 'burst', x, y, color, radius, text: '', age: 0, life });
}

export function spawnPopup(effects: Effect[], x: number, y: number, text: string, color: string): void {
  // Keep the label fully on screen near the side walls.
  const clampedX = Math.max(24, Math.min(CANVAS_WIDTH - 24, x));
  push(effects, { kind: 'popup', x: clampedX, y: Math.max(16, y), color, radius: 0, text, age: 0, life: POPUP_MS });
}

/** Age every effect by `deltaMs` and drop the expired ones (in place). */
export function stepEffects(effects: Effect[], deltaMs: number): void {
  if (deltaMs <= 0) return;
  let kept = 0;
  for (const effect of effects) {
    effect.age += deltaMs;
    if (effect.age < effect.life) effects[kept++] = effect;
  }
  effects.length = kept;
}

/** 0 at spawn → 1 at expiry. */
export function effectProgress(effect: Effect): number {
  if (effect.life <= 0) return 1;
  return Math.max(0, Math.min(1, effect.age / effect.life));
}

/** What the formation looked like at the start of a frame. */
export interface FormationSnapshot {
  level: number;
  enemies: Enemy[];
  active: boolean[];
  x: number[];
  y: number[];
}

export function createFormationSnapshot(): FormationSnapshot {
  return { level: 0, enemies: [], active: [], x: [], y: [] };
}

/** Record the formation into `snapshot`, reusing its arrays. */
export function captureFormation(state: GameState, snapshot: FormationSnapshot): void {
  const enemies = state.formation.enemies;
  snapshot.level = state.level;
  snapshot.enemies = enemies;
  snapshot.active.length = enemies.length;
  snapshot.x.length = enemies.length;
  snapshot.y.length = enemies.length;
  for (let i = 0; i < enemies.length; i++) {
    snapshot.active[i] = enemies[i].active;
    snapshot.x[i] = enemies[i].x;
    snapshot.y[i] = enemies[i].y;
  }
}

export interface DestroyedEnemy {
  /** Centre of the invader where it was at the start of the frame. */
  x: number;
  y: number;
  type: EnemyType;
}

/**
 * Invaders that were alive in `snapshot` and are gone now, whoever shot them.
 *
 * Within a wave the comparison is by index, because a co-op joiner rebuilds
 * the enemy objects from every host snapshot. When the wave changed during the
 * frame the new formation is unrelated, so the old objects are consulted
 * instead: the shot that cleared the wave flipped `active` on one of them.
 */
export function destroyedSince(snapshot: FormationSnapshot, state: GameState): DestroyedEnemy[] {
  const current = state.level === snapshot.level ? state.formation.enemies : snapshot.enemies;
  const destroyed: DestroyedEnemy[] = [];
  for (let i = 0; i < snapshot.enemies.length; i++) {
    if (!snapshot.active[i]) continue;
    const now = current[i];
    if (!now || now.active) continue;
    const before = snapshot.enemies[i];
    destroyed.push({
      x: snapshot.x[i] + before.width / 2,
      y: snapshot.y[i] + before.height / 2,
      type: before.type,
    });
  }
  return destroyed;
}
