/**
 * Space Invaders - per-run tally shown in the end-of-run debrief.
 *
 * Everything here is counted from the local player's own frame events, so in
 * co-op it describes this ship only (the teammate keeps their own tally).
 */

import { EnemyType, SoundEvents } from './types';

export interface RunStats {
  /** Bullets the local player fired. */
  shots: number;
  /** Shots that destroyed an invader or the UFO. */
  hits: number;
  /** Invaders destroyed by the local player, per type. */
  kills: Record<EnemyType, number>;
  /** UFOs destroyed by the local player. */
  ufos: number;
  /** Bonus points those UFOs were worth. */
  ufoPoints: number;
  /** Simulated play time in ms (paused time is not counted). */
  activeMs: number;
}

export function createRunStats(): RunStats {
  return {
    shots: 0,
    hits: 0,
    kills: { [EnemyType.SQUID]: 0, [EnemyType.CRAB]: 0, [EnemyType.OCTOPUS]: 0 },
    ufos: 0,
    ufoPoints: 0,
    activeMs: 0,
  };
}

/** Fold one simulated frame into the tally (mutates `stats`). */
export function recordFrame(stats: RunStats, events: SoundEvents, deltaMs: number): void {
  if (deltaMs > 0) stats.activeMs += deltaMs;
  if (events.playerShoot) stats.shots++;
  if (events.enemyHitType !== null) {
    stats.hits++;
    stats.kills[events.enemyHitType]++;
  }
  if (events.ufoHitPoints > 0) {
    stats.hits++;
    stats.ufos++;
    stats.ufoPoints += events.ufoHitPoints;
  }
}

export function totalKills(stats: RunStats): number {
  return stats.kills[EnemyType.SQUID] + stats.kills[EnemyType.CRAB] + stats.kills[EnemyType.OCTOPUS];
}

/**
 * Whole-number hit rate, or null before the first shot. Never rounds a run
 * with at least one hit down to 0, nor one with at least one miss up to 100.
 */
export function accuracyPercent(stats: RunStats): number | null {
  if (stats.shots <= 0) return null;
  const hits = Math.min(stats.hits, stats.shots);
  if (hits <= 0) return 0;
  if (hits === stats.shots) return 100;
  return Math.min(99, Math.max(1, Math.round((hits / stats.shots) * 100)));
}

/** `m:ss` (minutes are not capped). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
