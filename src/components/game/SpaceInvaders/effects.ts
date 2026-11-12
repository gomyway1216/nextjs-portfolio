/**
 * Space Invaders - short-lived hit feedback (bursts and score pop-ups).
 *
 * Purely cosmetic: nothing here feeds back into the simulation. Lifetimes are
 * in milliseconds of simulated time, so effects last equally long on any
 * display refresh rate.
 */

import { CANVAS_WIDTH, ENEMY_CONFIGS, Enemy, EnemyType, GameState } from './types';

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

/**
 * Whether anything is still on screen. With reduced motion the bursts are not
 * drawn at all, so only the pop-ups count.
 */
export function hasVisibleEffects(effects: Effect[], reducedMotion: boolean): boolean {
  return reducedMotion ? effects.some(effect => effect.kind === 'popup') : effects.length > 0;
}

/**
 * One frame of letting the effects play out once the game has ended. Returns
 * whether another frame is needed. Every call ages the effects by at least a
 * millisecond, so the caller's loop ends after a bounded number of frames
 * even if the clock stands still.
 */
export function stepEffectsTail(effects: Effect[], deltaMs: number, reducedMotion: boolean): boolean {
  stepEffects(effects, Math.max(1, deltaMs));
  return hasVisibleEffects(effects, reducedMotion);
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
  /** Position in the formation it belonged to at the start of the frame. */
  index: number;
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
      index: i,
      x: snapshot.x[i] + before.width / 2,
      y: snapshot.y[i] + before.height / 2,
      type: before.type,
    });
  }
  return destroyed;
}

/**
 * Most invaders a co-op joiner will show as "cleared by the host" on a wave
 * change. The host has one bullet in flight and publishes ten times a second,
 * so normally exactly one is left; more than a few means the joiner fell
 * behind and the old formation says nothing about what just happened.
 */
export const WAVE_CLEAR_MAX = 3;

/**
 * Co-op joiner only: the invaders the host destroyed to clear the wave.
 *
 * The host starts the next wave in the same frame as its last kill, so the
 * joiner never receives a snapshot with that invader gone, only the next
 * wave. A wave advances only once every invader is destroyed, so whatever was
 * still standing here at the start of the frame is what the host just shot.
 * Returns nothing unless the level advanced by exactly one.
 */
export function clearedByHostWaveChange(snapshot: FormationSnapshot, state: GameState): DestroyedEnemy[] {
  if (state.level !== snapshot.level + 1) return [];
  const cleared: DestroyedEnemy[] = [];
  for (let i = 0; i < snapshot.enemies.length; i++) {
    const before = snapshot.enemies[i];
    // `before.active` is false for a kill `destroyedSince` already reports.
    if (!snapshot.active[i] || !before.active) continue;
    if (cleared.length === WAVE_CLEAR_MAX) return [];
    cleared.push({
      index: i,
      x: snapshot.x[i] + before.width / 2,
      y: snapshot.y[i] + before.height / 2,
      type: before.type,
    });
  }
  return cleared;
}

/**
 * Feedback for destroyed invaders: a burst for each, and a score pop-up only
 * for those in `ownKills` (formation indices), because only those points went
 * to the local player's score.
 */
export function spawnKillFeedback(
  effects: Effect[],
  destroyed: DestroyedEnemy[],
  ownKills: readonly number[]
): void {
  for (const hit of destroyed) {
    const config = ENEMY_CONFIGS[hit.type];
    spawnBurst(effects, hit.x, hit.y, config.accentColor);
    if (ownKills.includes(hit.index)) {
      spawnPopup(effects, hit.x, hit.y - 12, `+${config.points}`, config.accentColor);
    }
  }
}
