/**
 * Space Invaders - Multiplayer Types
 * Game-specific types that extend shared multiplayer types
 *
 * Sync model (host-authoritative co-op):
 * - The HOST runs the authoritative sim of shared entities (invader
 *   formation, enemy fire, UFO, shields) and publishes it ~10x/sec to
 *   `gameRooms/{roomId}/gameState` via `toNetworkGameState`.
 * - The JOINER applies each snapshot with `applyNetworkGameState` and only
 *   simulates its own ship/bullets in between (see `updateJoinerGame`).
 * - Each client writes its own ship state (x, in-flight bullet, score,
 *   lives) to `gameRooms/{roomId}/players/{playerId}` for the teammate's UI.
 * - Joiner hits on shared entities are resolved locally for instant feedback
 *   and reported through `gameRooms/{roomId}/pendingActions/{playerId}` as a
 *   level-scoped, idempotent `JoinerReport`; the host applies it with
 *   `applyJoinerReport`.
 */

import {
  BULLET_HEIGHT,
  BULLET_WIDTH,
  CANVAS_WIDTH,
  ENEMY_CONFIGS,
  ENEMY_HEIGHT,
  ENEMY_WIDTH,
  EnemyType,
  GameState,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_Y,
  UFO_HEIGHT,
  UFO_WIDTH,
} from './types';
import {
  GameRoom as BaseGameRoom,
  MultiplayerPlayer as BasePlayer,
} from '@/services/gameRoomService';

// Re-export shared types from the service
export {
  generatePlayerId,
  PLAYER_COLORS,
} from '@/services/gameRoomService';
export type { LobbyState } from '@/services/gameRoomService';

// Space Invaders specific player info. The gameplay fields are written by
// each client during play (they don't exist until the first update, hence
// optional).
export interface MultiplayerPlayer extends BasePlayer {
  score?: number;
  lives?: number;
  x?: number; // Player ship position
  /** The player's single in-flight bullet, if any (cosmetic mirror). */
  bullet?: { x: number; y: number } | null;
}

// Space Invaders game room
export interface GameRoom extends BaseGameRoom<MultiplayerGameState> {
  gameType: 'space-invaders';
  players: { [key: string]: MultiplayerPlayer };
  /** Joiner→host event reports, keyed by player id. */
  pendingActions?: { [key: string]: JoinerReport };
}

// Simplified game state for network sync
export interface MultiplayerGameState {
  formation: {
    enemies: NetworkEnemy[];
    direction: number;
    speed: number;
    moveDown: boolean;
  };
  bullets: NetworkBullet[];
  ufo: NetworkUFO | null;
  shields: NetworkShield[];
  level: number;
  animationTick: number;
  marchCounter: number;
  /** Host declared the game over (both ships out, or the invaders landed). */
  gameOver: boolean;
  /** Host wall-clock at publish time; doubles as the snapshot identity. */
  lastUpdate: number;
}

// Network-optimized enemy (minimal data)
export interface NetworkEnemy {
  x: number;
  y: number;
  type: number;
  active: boolean;
  animFrame: number;
}

// Network-optimized bullet
export interface NetworkBullet {
  x: number;
  y: number;
  isEnemy: boolean;
  ownerId?: string;
}

// Network-optimized UFO
export interface NetworkUFO {
  x: number;
  y: number;
  direction: number;
  points: number;
  active: boolean;
}

// Network-optimized shield
export interface NetworkShield {
  blocks: { x: number; y: number; active: boolean }[];
}

// Convert the host's full game state to network state. Player-owned data
// (ship, score, lives) is deliberately excluded — that syncs per-player via
// players/{playerId}.
export function toNetworkGameState(state: GameState): MultiplayerGameState {
  return {
    formation: {
      enemies: state.formation.enemies.map(e => ({
        x: e.x,
        y: e.y,
        type: e.type,
        active: e.active,
        animFrame: e.animFrame,
      })),
      direction: state.formation.direction,
      speed: state.formation.speed,
      moveDown: state.formation.moveDown,
    },
    // `remote` bullets never exist on the host; the filter is defensive.
    bullets: state.bullets.filter(b => !b.remote).map(b => ({
      x: b.x,
      y: b.y,
      isEnemy: b.isEnemy,
    })),
    ufo: state.ufo ? {
      x: state.ufo.x,
      y: state.ufo.y,
      direction: state.ufo.direction,
      points: state.ufo.points,
      active: state.ufo.active,
    } : null,
    shields: state.shields.map(s => ({
      blocks: s.blocks.map(b => ({
        x: b.x,
        y: b.y,
        active: b.active,
      })),
    })),
    level: state.level,
    animationTick: state.animationTick,
    marchCounter: state.marchCounter,
    gameOver: state.gameOver,
    lastUpdate: Date.now(),
  };
}

/**
 * Joiner-side book-keeping for effects it resolved locally but the host has
 * not confirmed yet, so applying a snapshot doesn't resurrect an invader or
 * shield block the local player just destroyed. Entries are pruned once a
 * snapshot confirms them; everything resets on a wave change.
 */
export interface PendingLocalEffects {
  level: number;
  killedEnemies: Set<number>;
  destroyedBlocks: Set<string>; // `<shieldIdx>_<blockIdx>`
  ufoKilled: boolean;
}

export function createPendingLocalEffects(level: number): PendingLocalEffects {
  return { level, killedEnemies: new Set(), destroyedBlocks: new Set(), ufoKilled: false };
}

/**
 * Apply a host snapshot to the joiner's local GameState (mutates `state` and
 * `pending`). Preserves everything player-owned: ship, own bullets, score,
 * lives. Handles RTDB quirks: empty arrays / null values come back as
 * missing keys.
 */
export function applyNetworkGameState(
  state: GameState,
  net: MultiplayerGameState,
  pending?: PendingLocalEffects
): void {
  const netEnemies = net.formation?.enemies ?? [];
  const netBullets = net.bullets ?? [];
  const netShields = net.shields ?? [];
  const levelChanged = net.level !== state.level;

  // Reconcile pending local effects with what the host has confirmed.
  if (pending) {
    if (pending.level !== net.level) {
      pending.level = net.level;
      pending.killedEnemies.clear();
      pending.destroyedBlocks.clear();
      pending.ufoKilled = false;
    } else {
      for (const idx of pending.killedEnemies) {
        if (netEnemies[idx] && !netEnemies[idx].active) pending.killedEnemies.delete(idx);
      }
      for (const key of pending.destroyedBlocks) {
        const [si, bi] = key.split('_').map(Number);
        const block = netShields[si]?.blocks?.[bi];
        if (block && !block.active) pending.destroyedBlocks.delete(key);
      }
      if (!net.ufo) pending.ufoKilled = false;
    }
  }

  state.formation = {
    enemies: netEnemies.map((e, i) => ({
      x: e.x,
      y: e.y,
      width: ENEMY_WIDTH,
      height: ENEMY_HEIGHT,
      type: (e.type as EnemyType) ?? EnemyType.OCTOPUS,
      config: ENEMY_CONFIGS[e.type] ?? ENEMY_CONFIGS[EnemyType.OCTOPUS],
      active: Boolean(e.active) && !pending?.killedEnemies.has(i),
      animFrame: e.animFrame ?? 0,
    })),
    direction: net.formation?.direction ?? 1,
    speed: net.formation?.speed ?? 0,
    moveDown: net.formation?.moveDown ?? false,
  };

  const remoteBullets = netBullets.map(b => ({
    x: b.x,
    y: b.y,
    width: BULLET_WIDTH,
    // Matches the sizes used by the host sim for each bullet kind.
    height: b.isEnemy ? BULLET_HEIGHT + 5 : BULLET_HEIGHT,
    isEnemy: Boolean(b.isEnemy),
    remote: true,
  }));
  const ownBullets = levelChanged ? [] : state.bullets.filter(b => !b.remote);
  state.bullets = [...ownBullets, ...remoteBullets];

  state.ufo = net.ufo && !pending?.ufoKilled
    ? {
      x: net.ufo.x,
      y: net.ufo.y,
      width: UFO_WIDTH,
      height: UFO_HEIGHT,
      direction: net.ufo.direction,
      points: net.ufo.points,
      active: net.ufo.active ?? true,
    }
    : null;

  state.shields = netShields.map((s, si) => ({
    blocks: (s.blocks ?? []).map((b, bi) => ({
      x: b.x,
      y: b.y,
      active: Boolean(b.active) && !pending?.destroyedBlocks.has(`${si}_${bi}`),
    })),
  }));

  if (levelChanged) {
    // New wave: the host recentered its ship and cleared bullets; mirror that.
    state.player = {
      x: (CANVAS_WIDTH - PLAYER_WIDTH) / 2,
      y: PLAYER_Y,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      lastShot: 0,
    };
    state.invulnUntil = undefined;
  }

  state.level = net.level;
  state.animationTick = net.animationTick;
  state.marchCounter = net.marchCounter;
  if (net.gameOver) state.gameOver = true;
}

/**
 * Joiner→host event report, written to
 * `gameRooms/{roomId}/pendingActions/{playerId}`. Level-scoped and
 * append-only within a level so the host can apply it idempotently — keys
 * are prefixed (`e12`, `s0_34`) so RTDB never coerces the maps into arrays.
 */
export interface JoinerReport {
  level: number;
  /** `e<enemyIndex>` → true for invaders the joiner destroyed this level. */
  kills?: { [key: string]: boolean };
  /** `s<shieldIdx>_<blockIdx>` → true for shield blocks destroyed this level. */
  shieldHits?: { [key: string]: boolean };
  /** Monotonic count of UFOs the joiner has destroyed this game. */
  ufoKills?: number;
  lastUpdate?: number;
}

/**
 * Host-side application of a joiner report (mutates `state`). Idempotent:
 * already-inactive targets are ignored, and reports from another level are
 * skipped entirely. Kills give the host no points — the joiner scored them
 * locally. Returns the new applied-UFO-kill count (pass it back next call).
 */
export function applyJoinerReport(
  state: GameState,
  report: JoinerReport | null | undefined,
  appliedUfoKills: number
): number {
  if (!report || report.level !== state.level) return appliedUfoKills;

  for (const key of Object.keys(report.kills ?? {})) {
    const idx = Number(key.slice(1));
    const enemy = state.formation.enemies[idx];
    if (enemy && enemy.active) enemy.active = false;
  }

  for (const key of Object.keys(report.shieldHits ?? {})) {
    const [si, bi] = key.slice(1).split('_').map(Number);
    const block = state.shields[si]?.blocks[bi];
    if (block && block.active) block.active = false;
  }

  const ufoKills = report.ufoKills ?? 0;
  if (ufoKills > appliedUfoKills && state.ufo) {
    state.ufo = null;
  }
  return Math.max(ufoKills, appliedUfoKills);
}

/**
 * Whether the teammate's ship is still in play. Players that haven't
 * reported lives yet count as alive; a missing teammate (left/never joined)
 * counts as not alive so the game can end.
 */
export function isTeammateAlive(other: MultiplayerPlayer | null | undefined): boolean {
  if (!other) return false;
  return (other.lives ?? 1) > 0;
}
