/**
 * Space Invaders - Game Engine
 *
 * The functions at the top of this file are intentionally pure so they can be
 * unit-tested without a canvas/DOM (see the tests in
 * tests/unit/components/game/SpaceInvaders).
 */

import {
  BULLET_HEIGHT,
  BULLET_SPEED,
  BULLET_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DIFFICULTY_SETTINGS,
  Difficulty,
  ENEMY_BULLET_SPEED,
  ENEMY_COLS,
  ENEMY_CONFIGS,
  ENEMY_HEIGHT,
  ENEMY_MOVE_DOWN,
  ENEMY_OFFSET_LEFT,
  ENEMY_OFFSET_TOP,
  ENEMY_PADDING,
  ENEMY_ROWS,
  ENEMY_SHOOT_CHANCE,
  ENEMY_SPEED_INCREASE,
  ENEMY_WIDTH,
  Enemy,
  EnemyFormation,
  EnemyType,
  EXTRA_LIFE_EVERY,
  GameState,
  INITIAL_ENEMY_SPEED,
  INITIAL_LIVES,
  InputState,
  MAX_LIVES,
  MAX_WAVE_DESCENT,
  PLAYER_HEIGHT,
  PLAYER_SHOOT_COOLDOWN,
  PLAYER_SPEED,
  PLAYER_WIDTH,
  PLAYER_Y,
  Player,
  SHIELD_BLOCK_SIZE,
  SHIELD_COUNT,
  SHIELD_HEIGHT,
  SHIELD_WIDTH,
  SHIELD_Y,
  Shield,
  ShieldBlock,
  SoundEvents,
  UFO_HEIGHT,
  UFO_POINTS,
  UFO_SPAWN_CHANCE,
  UFO_SPEED,
  UFO_WIDTH,
  WAVE_DESCENT_STEP,
  createSoundEvents,
} from './types';

const TOTAL_ENEMIES = ENEMY_ROWS * ENEMY_COLS;

// --- Pure helpers (unit-tested) -----------------------------------------

/** AABB collision test between two rectangles. */
export function checkCollision(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number
): boolean {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

/**
 * How much the formation march speeds up as ranks thin out. Starts at 1x with a
 * full formation and ramps to ~2.2x once only a single invader is left, so the
 * classic "last alien sprints" tension is preserved.
 */
export function speedMultiplierForRemaining(remaining: number, total: number = TOTAL_ENEMIES): number {
  if (total <= 0) return 1;
  const cleared = 1 - Math.max(0, Math.min(remaining, total)) / total;
  return 1 + cleared * 1.2;
}

/** March/animation cadence (in ticks) — faster as fewer invaders remain. */
export function marchIntervalForRemaining(remaining: number, total: number = TOTAL_ENEMIES): number {
  if (total <= 0) return 10;
  const cleared = 1 - Math.max(0, Math.min(remaining, total)) / total;
  return Math.max(8, Math.round(48 - cleared * 38));
}

/** Base march speed for a given level and difficulty. */
export function formationSpeedForLevel(level: number, difficulty: Difficulty): number {
  const base = INITIAL_ENEMY_SPEED + (level - 1) * ENEMY_SPEED_INCREASE;
  return base * DIFFICULTY_SETTINGS[difficulty].speedMultiplier;
}

/** Vertical offset each new wave spawns at (descends with level, then clamps). */
export function waveDescentOffset(level: number): number {
  return Math.min((level - 1) * WAVE_DESCENT_STEP, MAX_WAVE_DESCENT);
}

/** Points awarded for destroying an enemy of the given type. */
export function pointsForEnemy(type: EnemyType): number {
  return ENEMY_CONFIGS[type].points;
}

// --- Factory functions ---------------------------------------------------

function createPlayer(): Player {
  return {
    x: (CANVAS_WIDTH - PLAYER_WIDTH) / 2,
    y: PLAYER_Y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    lastShot: 0,
  };
}

/** Build the invader grid for a wave. Later waves start lower on screen. */
export function createFormation(level: number, difficulty: Difficulty = 'normal'): EnemyFormation {
  const enemies: Enemy[] = [];
  const topOffset = ENEMY_OFFSET_TOP + waveDescentOffset(level);

  for (let row = 0; row < ENEMY_ROWS; row++) {
    for (let col = 0; col < ENEMY_COLS; col++) {
      let type: EnemyType;
      if (row === 0) {
        type = EnemyType.SQUID;
      } else if (row <= 2) {
        type = EnemyType.CRAB;
      } else {
        type = EnemyType.OCTOPUS;
      }

      enemies.push({
        x: ENEMY_OFFSET_LEFT + col * (ENEMY_WIDTH + ENEMY_PADDING),
        y: topOffset + row * (ENEMY_HEIGHT + ENEMY_PADDING),
        width: ENEMY_WIDTH,
        height: ENEMY_HEIGHT,
        type,
        config: ENEMY_CONFIGS[type],
        active: true,
        animFrame: 0,
      });
    }
  }

  return {
    enemies,
    direction: 1,
    speed: formationSpeedForLevel(level, difficulty),
    moveDown: false,
  };
}

function createShields(): Shield[] {
  const shields: Shield[] = [];
  const shieldSpacing = (CANVAS_WIDTH - SHIELD_COUNT * SHIELD_WIDTH) / (SHIELD_COUNT + 1);

  for (let i = 0; i < SHIELD_COUNT; i++) {
    const shieldX = shieldSpacing + i * (SHIELD_WIDTH + shieldSpacing);
    const blocks: ShieldBlock[] = [];

    const cols = Math.floor(SHIELD_WIDTH / SHIELD_BLOCK_SIZE);
    const rows = Math.floor(SHIELD_HEIGHT / SHIELD_BLOCK_SIZE);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const isBottomCenter = row >= rows - 3 && col >= Math.floor(cols / 3) && col < Math.ceil(2 * cols / 3);
        const isTopCorner = row < 2 && (col < 2 || col >= cols - 2);

        if (!isBottomCenter && !isTopCorner) {
          blocks.push({
            x: shieldX + col * SHIELD_BLOCK_SIZE,
            y: SHIELD_Y + row * SHIELD_BLOCK_SIZE,
            active: true,
          });
        }
      }
    }

    shields.push({ blocks });
  }

  return shields;
}

// Create initial game state
export function createGameState(
  level: number = 1,
  score: number = 0,
  lives?: number,
  difficulty: Difficulty = 'normal'
): GameState {
  const startingLives = lives ?? DIFFICULTY_SETTINGS[difficulty].startingLives ?? INITIAL_LIVES;
  return {
    player: createPlayer(),
    bullets: [],
    formation: createFormation(level, difficulty),
    ufo: null,
    shields: createShields(),
    score,
    highScore: 0,
    lives: startingLives,
    level,
    difficulty,
    nextExtraLifeAt: EXTRA_LIFE_EVERY,
    gameOver: false,
    isPaused: false,
    animationTick: 0,
    marchCounter: 0,
  };
}

// Reset after death
export function resetAfterDeath(state: GameState): void {
  state.player = createPlayer();
  // Clear enemy fire so the player isn't instantly killed again on respawn.
  state.bullets = state.bullets.filter(b => !b.isEnemy);
}

// Advance to next level
export function nextLevel(state: GameState): void {
  state.level++;
  state.formation = createFormation(state.level, state.difficulty);
  state.bullets = [];
  state.ufo = null;
  state.shields = createShields();
  state.player = createPlayer();
}

// Get bottom-most enemies for each column (the ones that can shoot)
function getShootingEnemies(formation: EnemyFormation): Enemy[] {
  const columnBottomEnemies: Map<number, Enemy> = new Map();

  for (const enemy of formation.enemies) {
    if (!enemy.active) continue;

    const col = Math.round((enemy.x - ENEMY_OFFSET_LEFT) / (ENEMY_WIDTH + ENEMY_PADDING));
    const existing = columnBottomEnemies.get(col);

    if (!existing || enemy.y > existing.y) {
      columnBottomEnemies.set(col, enemy);
    }
  }

  return Array.from(columnBottomEnemies.values());
}

/**
 * Award any extra lives earned by crossing score thresholds. Mutates `state`
 * and returns true if a life was granted (so the caller can play a sound).
 */
export function grantExtraLives(state: GameState): boolean {
  let granted = false;
  while (state.score >= state.nextExtraLifeAt) {
    if (state.lives < MAX_LIVES) {
      state.lives++;
      granted = true;
    }
    state.nextExtraLifeAt += EXTRA_LIFE_EVERY;
  }
  return granted;
}

/** Options for co-op multiplayer simulation (host side). */
export interface CoopUpdateOptions {
  /**
   * Whether the teammate still has lives. In co-op the shared sim keeps
   * running while either ship is alive; the game only ends when both are out
   * (or the invaders land).
   */
  teammateAlive: boolean;
}

// Update game state
export function updateGame(
  state: GameState,
  input: InputState,
  deltaTime: number,
  now: number,
  coop?: CoopUpdateOptions
): SoundEvents {
  const sounds = createSoundEvents();

  if (state.gameOver || state.isPaused) return sounds;

  // Co-op end condition: this ship is already out, and the teammate has now
  // run out of lives too (reported over the network).
  if (coop && state.lives <= 0 && !coop.teammateAlive) {
    state.gameOver = true;
    sounds.gameOver = true;
    return sounds;
  }

  // In co-op a ship with no lives left is out of the action but the shared
  // sim continues. In single-player lives <= 0 implies gameOver, so this is
  // always true there.
  const playerActive = state.lives > 0;

  const difficulty = DIFFICULTY_SETTINGS[state.difficulty];
  // Normalize to ~60fps and clamp so a long tab-switch stall can't teleport
  // objects through each other.
  const dt = Math.min(deltaTime / 16.67, 2.5);
  state.animationTick++;

  // Move player
  if (playerActive && input.left) {
    state.player.x = Math.max(0, state.player.x - PLAYER_SPEED * dt);
  }
  if (playerActive && input.right) {
    state.player.x = Math.min(CANVAS_WIDTH - state.player.width, state.player.x + PLAYER_SPEED * dt);
  }

  // Player shooting
  if (playerActive && input.shoot && now - state.player.lastShot >= PLAYER_SHOOT_COOLDOWN) {
    // Only allow one player bullet at a time (classic behavior)
    const hasPlayerBullet = state.bullets.some(b => !b.isEnemy);
    if (!hasPlayerBullet) {
      state.bullets.push({
        x: state.player.x + state.player.width / 2 - BULLET_WIDTH / 2,
        y: state.player.y - BULLET_HEIGHT,
        width: BULLET_WIDTH,
        height: BULLET_HEIGHT,
        isEnemy: false,
      });
      state.player.lastShot = now;
      sounds.playerShoot = true;
    }
  }

  // Update bullets
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];

    if (bullet.isEnemy) {
      bullet.y += ENEMY_BULLET_SPEED * difficulty.bulletSpeedMultiplier * dt;
    } else {
      bullet.y -= BULLET_SPEED * dt;
    }

    // Remove off-screen bullets
    if (bullet.y < -bullet.height || bullet.y > CANVAS_HEIGHT) {
      state.bullets.splice(i, 1);
      continue;
    }

    // Check bullet-shield collision
    let hitShield = false;
    for (const shield of state.shields) {
      for (const block of shield.blocks) {
        if (!block.active) continue;

        if (checkCollision(
          bullet.x, bullet.y, bullet.width, bullet.height,
          block.x, block.y, SHIELD_BLOCK_SIZE, SHIELD_BLOCK_SIZE
        )) {
          block.active = false;
          state.bullets.splice(i, 1);
          hitShield = true;
          break;
        }
      }
      if (hitShield) break;
    }
    if (hitShield) continue;

    // Player bullet hitting enemies
    if (!bullet.isEnemy) {
      let hit = false;
      for (const enemy of state.formation.enemies) {
        if (!enemy.active) continue;

        if (checkCollision(
          bullet.x, bullet.y, bullet.width, bullet.height,
          enemy.x, enemy.y, enemy.width, enemy.height
        )) {
          enemy.active = false;
          state.score += pointsForEnemy(enemy.type);
          state.bullets.splice(i, 1);
          sounds.enemyHit = true;
          hit = true;
          break;
        }
      }
      if (hit) {
        if (grantExtraLives(state)) sounds.extraLife = true;
        continue;
      }

      // Player bullet hitting UFO
      if (state.ufo && state.ufo.active) {
        if (checkCollision(
          bullet.x, bullet.y, bullet.width, bullet.height,
          state.ufo.x, state.ufo.y, state.ufo.width, state.ufo.height
        )) {
          state.score += state.ufo.points;
          state.ufo.active = false;
          state.ufo = null;
          state.bullets.splice(i, 1);
          sounds.ufoHit = true;
          if (grantExtraLives(state)) sounds.extraLife = true;
        }
      }
    } else {
      // Enemy bullet hitting player
      if (playerActive && checkCollision(
        bullet.x, bullet.y, bullet.width, bullet.height,
        state.player.x, state.player.y, state.player.width, state.player.height
      )) {
        state.lives--;
        state.bullets.splice(i, 1);
        sounds.playerHit = true;

        if (state.lives <= 0) {
          if (!coop || !coop.teammateAlive) {
            state.gameOver = true;
            sounds.gameOver = true;
          }
          // Co-op with a living teammate: this ship is out, but the shared
          // sim keeps running for the teammate.
        } else {
          resetAfterDeath(state);
        }
        return sounds;
      }
    }
  }

  // Update enemy formation
  const activeEnemies = state.formation.enemies.filter(e => e.active);

  if (activeEnemies.length === 0) {
    // Wave cleared — endless progression, each wave harder than the last.
    nextLevel(state);
    sounds.levelComplete = true;
    return sounds;
  }

  // Calculate formation bounds
  let minX = CANVAS_WIDTH;
  let maxX = 0;
  let maxY = 0;

  for (const enemy of activeEnemies) {
    minX = Math.min(minX, enemy.x);
    maxX = Math.max(maxX, enemy.x + enemy.width);
    maxY = Math.max(maxY, enemy.y + enemy.height);
  }

  // Speed increases as fewer enemies remain.
  const currentSpeed = state.formation.speed * speedMultiplierForRemaining(activeEnemies.length);

  // Move formation
  if (state.formation.moveDown) {
    for (const enemy of activeEnemies) {
      enemy.y += ENEMY_MOVE_DOWN;
    }
    state.formation.direction *= -1;
    state.formation.moveDown = false;

    // Check if enemies reached player level
    if (maxY + ENEMY_MOVE_DOWN >= state.player.y) {
      state.gameOver = true;
      sounds.gameOver = true;
      return sounds;
    }
  } else {
    const moveX = currentSpeed * state.formation.direction * dt;

    const willHitRightWall = state.formation.direction > 0 && maxX + moveX >= CANVAS_WIDTH - 5;
    const willHitLeftWall = state.formation.direction < 0 && minX + moveX <= 5;

    if (willHitRightWall || willHitLeftWall) {
      state.formation.moveDown = true;
    } else {
      for (const enemy of activeEnemies) {
        enemy.x += moveX;
      }
    }
  }

  // Update animation frame and march sound; tempo increases as ranks thin.
  const marchInterval = marchIntervalForRemaining(activeEnemies.length);
  if (state.animationTick % marchInterval === 0) {
    for (const enemy of activeEnemies) {
      enemy.animFrame = (enemy.animFrame + 1) % 2;
    }
    sounds.enemyMarch = true;
    sounds.marchPitch = state.marchCounter % 4;
    state.marchCounter++;
  }

  // Enemy shooting. Only the bottom-most invader in each column can fire, and
  // each rolls independently against `fireChance` per frame. The chance scales
  // with level and difficulty and is normalized by `dt` so the fire rate is
  // frame-rate independent.
  const shootingEnemies = getShootingEnemies(state.formation);
  const fireChance =
    ENEMY_SHOOT_CHANCE *
    (1 + state.level * 0.2) *
    difficulty.fireRateMultiplier *
    dt;
  for (const enemy of shootingEnemies) {
    if (Math.random() < fireChance) {
      state.bullets.push({
        x: enemy.x + enemy.width / 2 - BULLET_WIDTH / 2,
        y: enemy.y + enemy.height,
        width: BULLET_WIDTH,
        height: BULLET_HEIGHT + 5,
        isEnemy: true,
      });
      sounds.enemyShoot = true;
    }
  }

  // Enemy collision with shields (erode blocks they touch)
  for (const enemy of activeEnemies) {
    for (const shield of state.shields) {
      for (const block of shield.blocks) {
        if (!block.active) continue;

        if (checkCollision(
          enemy.x, enemy.y, enemy.width, enemy.height,
          block.x, block.y, SHIELD_BLOCK_SIZE, SHIELD_BLOCK_SIZE
        )) {
          block.active = false;
        }
      }
    }
  }

  // UFO logic
  if (!state.ufo && Math.random() < UFO_SPAWN_CHANCE * dt) {
    const direction = Math.random() < 0.5 ? 1 : -1;
    state.ufo = {
      x: direction === 1 ? -UFO_WIDTH : CANVAS_WIDTH,
      y: 30,
      width: UFO_WIDTH,
      height: UFO_HEIGHT,
      direction,
      points: UFO_POINTS[Math.floor(Math.random() * UFO_POINTS.length)],
      active: true,
    };
    sounds.ufoSpawn = true;
  }

  if (state.ufo && state.ufo.active) {
    state.ufo.x += UFO_SPEED * state.ufo.direction * dt;

    if (state.ufo.x < -UFO_WIDTH || state.ufo.x > CANVAS_WIDTH) {
      state.ufo = null;
    }
  }

  // Update high score
  if (state.score > state.highScore) {
    state.highScore = state.score;
  }

  return sounds;
}

// --- Multiplayer joiner simulation ---------------------------------------
//
// In co-op the HOST runs the authoritative sim of all shared entities
// (invader formation, enemy fire, UFO, shields) via `updateGame` and
// publishes snapshots. The JOINER applies those snapshots (see
// `applyNetworkGameState` in multiplayerTypes.ts) and runs only this
// local-only frame update in between: own ship, own bullets, and smooth
// extrapolation of the shared entities along their known velocities.
// Hits by the joiner's own bullets are resolved locally (instant feedback,
// local score) and reported to the host as events so the authoritative sim
// removes the same invader/shield block/UFO.

/** Invulnerability window after a joiner respawn (see GameState.invulnUntil). */
export const JOINER_RESPAWN_INVULN_MS = 1500;

/** Events produced by a joiner frame that must be reported to the host. */
export interface JoinerFrameEvents {
  /** Indices (into formation.enemies) of invaders destroyed by the local player. */
  kills: number[];
  /** Shield block keys `<shieldIdx>_<blockIdx>` destroyed by the local player's bullets. */
  shieldHits: string[];
  /** True if the local player's bullet destroyed the UFO this frame. */
  ufoKilled: boolean;
}

/**
 * Per-frame update for the non-host player. Never spawns enemy fire or UFOs,
 * never marches the formation authoritatively, and never sets gameOver from
 * lives (the host decides when the game ends).
 */
export function updateJoinerGame(
  state: GameState,
  input: InputState,
  deltaTime: number,
  now: number
): { sounds: SoundEvents; events: JoinerFrameEvents } {
  const sounds = createSoundEvents();
  const events: JoinerFrameEvents = { kills: [], shieldHits: [], ufoKilled: false };

  if (state.gameOver || state.isPaused) return { sounds, events };

  const difficulty = DIFFICULTY_SETTINGS[state.difficulty];
  const dt = Math.min(deltaTime / 16.67, 2.5);
  // Advance the tick locally for smooth star parallax; the host's
  // authoritative tick overwrites this on the next snapshot.
  state.animationTick++;

  const playerActive = state.lives > 0;

  // Move own ship
  if (playerActive && input.left) {
    state.player.x = Math.max(0, state.player.x - PLAYER_SPEED * dt);
  }
  if (playerActive && input.right) {
    state.player.x = Math.min(CANVAS_WIDTH - state.player.width, state.player.x + PLAYER_SPEED * dt);
  }

  // Own shooting — classic one-bullet rule, counting only own bullets.
  if (playerActive && input.shoot && now - state.player.lastShot >= PLAYER_SHOOT_COOLDOWN) {
    const hasOwnBullet = state.bullets.some(b => !b.isEnemy && !b.remote);
    if (!hasOwnBullet) {
      state.bullets.push({
        x: state.player.x + state.player.width / 2 - BULLET_WIDTH / 2,
        y: state.player.y - BULLET_HEIGHT,
        width: BULLET_WIDTH,
        height: BULLET_HEIGHT,
        isEnemy: false,
      });
      state.player.lastShot = now;
      sounds.playerShoot = true;
    }
  }

  // Move bullets and resolve what the joiner is allowed to resolve.
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];

    if (bullet.isEnemy) {
      bullet.y += ENEMY_BULLET_SPEED * difficulty.bulletSpeedMultiplier * dt;
    } else {
      bullet.y -= BULLET_SPEED * dt;
    }

    if (bullet.y < -bullet.height || bullet.y > CANVAS_HEIGHT) {
      state.bullets.splice(i, 1);
      continue;
    }

    if (bullet.remote) {
      // Host-owned bullet. Enemy fire can hit the local ship; the host's own
      // bullets are cosmetic here (their hits resolve on the host).
      if (
        bullet.isEnemy &&
        playerActive &&
        now >= (state.invulnUntil ?? 0) &&
        checkCollision(
          bullet.x, bullet.y, bullet.width, bullet.height,
          state.player.x, state.player.y, state.player.width, state.player.height
        )
      ) {
        state.lives--;
        state.bullets.splice(i, 1);
        sounds.playerHit = true;
        if (state.lives > 0) {
          resetAfterDeath(state);
          state.invulnUntil = now + JOINER_RESPAWN_INVULN_MS;
        }
        // lives <= 0: ship is out; the host ends the game once both are out.
        return { sounds, events };
      }
      continue;
    }

    // Own bullet: shields first (matches host ordering), then invaders, UFO.
    let hitShield = false;
    for (let si = 0; si < state.shields.length; si++) {
      const blocks = state.shields[si].blocks;
      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];
        if (!block.active) continue;
        if (checkCollision(
          bullet.x, bullet.y, bullet.width, bullet.height,
          block.x, block.y, SHIELD_BLOCK_SIZE, SHIELD_BLOCK_SIZE
        )) {
          block.active = false;
          events.shieldHits.push(`${si}_${bi}`);
          state.bullets.splice(i, 1);
          hitShield = true;
          break;
        }
      }
      if (hitShield) break;
    }
    if (hitShield) continue;

    let hit = false;
    for (let ei = 0; ei < state.formation.enemies.length; ei++) {
      const enemy = state.formation.enemies[ei];
      if (!enemy.active) continue;
      if (checkCollision(
        bullet.x, bullet.y, bullet.width, bullet.height,
        enemy.x, enemy.y, enemy.width, enemy.height
      )) {
        enemy.active = false;
        state.score += pointsForEnemy(enemy.type);
        events.kills.push(ei);
        state.bullets.splice(i, 1);
        sounds.enemyHit = true;
        hit = true;
        break;
      }
    }
    if (hit) {
      if (grantExtraLives(state)) sounds.extraLife = true;
      continue;
    }

    if (state.ufo && state.ufo.active) {
      if (checkCollision(
        bullet.x, bullet.y, bullet.width, bullet.height,
        state.ufo.x, state.ufo.y, state.ufo.width, state.ufo.height
      )) {
        state.score += state.ufo.points;
        state.ufo = null;
        events.ufoKilled = true;
        state.bullets.splice(i, 1);
        sounds.ufoHit = true;
        if (grantExtraLives(state)) sounds.extraLife = true;
      }
    }
  }

  // Extrapolate the shared entities between snapshots so they move smoothly
  // at the host's published velocity; the next snapshot corrects any drift.
  const activeEnemies = state.formation.enemies.filter(e => e.active);
  if (activeEnemies.length > 0 && !state.formation.moveDown) {
    let minX = CANVAS_WIDTH;
    let maxX = 0;
    for (const enemy of activeEnemies) {
      minX = Math.min(minX, enemy.x);
      maxX = Math.max(maxX, enemy.x + enemy.width);
    }
    const currentSpeed = state.formation.speed * speedMultiplierForRemaining(activeEnemies.length);
    const moveX = currentSpeed * state.formation.direction * dt;
    const willHitRightWall = state.formation.direction > 0 && maxX + moveX >= CANVAS_WIDTH - 5;
    const willHitLeftWall = state.formation.direction < 0 && minX + moveX <= 5;
    // Don't extrapolate through a wall — the host resolves the bounce/descent.
    if (!willHitRightWall && !willHitLeftWall) {
      for (const enemy of activeEnemies) {
        enemy.x += moveX;
      }
    }
  }

  if (state.ufo && state.ufo.active) {
    state.ufo.x += UFO_SPEED * state.ufo.direction * dt;
    if (state.ufo.x < -UFO_WIDTH || state.ufo.x > CANVAS_WIDTH) {
      state.ufo = null;
    }
  }

  if (state.score > state.highScore) {
    state.highScore = state.score;
  }

  return { sounds, events };
}
