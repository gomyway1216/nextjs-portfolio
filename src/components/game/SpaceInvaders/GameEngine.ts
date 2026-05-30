/**
 * Space Invaders - Game Engine
 */

import {
BULLET_HEIGHT,
BULLET_SPEED,
BULLET_WIDTH,
CANVAS_HEIGHT,
CANVAS_WIDTH,
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
GameState,
INITIAL_ENEMY_SPEED,
INITIAL_LIVES,
InputState,
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
createSoundEvents
} from './types';

// Create player
function createPlayer(): Player {
  return {
    x: (CANVAS_WIDTH - PLAYER_WIDTH) / 2,
    y: PLAYER_Y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    lastShot: 0,
  };
}

// Create enemy formation
function createFormation(level: number): EnemyFormation {
  const enemies: Enemy[] = [];

  for (let row = 0; row < ENEMY_ROWS; row++) {
    for (let col = 0; col < ENEMY_COLS; col++) {
      // Determine enemy type based on row
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
        y: ENEMY_OFFSET_TOP + row * (ENEMY_HEIGHT + ENEMY_PADDING),
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
    speed: INITIAL_ENEMY_SPEED + (level - 1) * ENEMY_SPEED_INCREASE,
    moveDown: false,
  };
}

// Create shields
function createShields(): Shield[] {
  const shields: Shield[] = [];
  const shieldSpacing = (CANVAS_WIDTH - SHIELD_COUNT * SHIELD_WIDTH) / (SHIELD_COUNT + 1);

  for (let i = 0; i < SHIELD_COUNT; i++) {
    const shieldX = shieldSpacing + i * (SHIELD_WIDTH + shieldSpacing);
    const blocks: ShieldBlock[] = [];

    // Create shield shape (arch-like)
    const cols = Math.floor(SHIELD_WIDTH / SHIELD_BLOCK_SIZE);
    const rows = Math.floor(SHIELD_HEIGHT / SHIELD_BLOCK_SIZE);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Create arch shape - remove bottom center blocks
        const isBottomCenter = row >= rows - 3 && col >= Math.floor(cols / 3) && col < Math.ceil(2 * cols / 3);
        // Round top corners
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
export function createGameState(level: number = 1, score: number = 0, lives: number = INITIAL_LIVES): GameState {
  return {
    player: createPlayer(),
    bullets: [],
    formation: createFormation(level),
    ufo: null,
    shields: createShields(),
    score,
    highScore: 0,
    lives,
    level,
    gameOver: false,
    victory: false,
    isPaused: false,
    animationTick: 0,
    marchCounter: 0,
  };
}

// Reset after death
export function resetAfterDeath(state: GameState): void {
  state.player = createPlayer();
  state.bullets = [];
}

// Advance to next level
export function nextLevel(state: GameState): void {
  state.level++;
  state.formation = createFormation(state.level);
  state.bullets = [];
  state.ufo = null;
  state.shields = createShields();
  state.player = createPlayer();
}

// Check collision between two rectangles
function checkCollision(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number
): boolean {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
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

// Update game state
export function updateGame(state: GameState, input: InputState, deltaTime: number, now: number): SoundEvents {
  const sounds = createSoundEvents();

  if (state.gameOver || state.victory || state.isPaused) return sounds;

  const dt = deltaTime / 16.67; // Normalize to ~60fps
  state.animationTick++;

  // Move player
  if (input.left) {
    state.player.x = Math.max(0, state.player.x - PLAYER_SPEED * dt);
  }
  if (input.right) {
    state.player.x = Math.min(CANVAS_WIDTH - state.player.width, state.player.x + PLAYER_SPEED * dt);
  }

  // Player shooting
  if (input.shoot && now - state.player.lastShot >= PLAYER_SHOOT_COOLDOWN) {
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
      bullet.y += ENEMY_BULLET_SPEED * dt;
    } else {
      bullet.y -= BULLET_SPEED * dt;
    }

    // Remove off-screen bullets
    if (bullet.y < -bullet.height || bullet.y > CANVAS_HEIGHT) {
      state.bullets.splice(i, 1);
      continue;
    }

    // Check bullet-shield collision
    for (const shield of state.shields) {
      for (const block of shield.blocks) {
        if (!block.active) continue;

        if (checkCollision(
          bullet.x, bullet.y, bullet.width, bullet.height,
          block.x, block.y, SHIELD_BLOCK_SIZE, SHIELD_BLOCK_SIZE
        )) {
          block.active = false;
          state.bullets.splice(i, 1);
          break;
        }
      }
      if (!state.bullets[i]) break;
    }
    if (!state.bullets[i]) continue;

    // Player bullet hitting enemies
    if (!bullet.isEnemy) {
      for (const enemy of state.formation.enemies) {
        if (!enemy.active) continue;

        if (checkCollision(
          bullet.x, bullet.y, bullet.width, bullet.height,
          enemy.x, enemy.y, enemy.width, enemy.height
        )) {
          enemy.active = false;
          state.score += enemy.config.points;
          state.bullets.splice(i, 1);
          sounds.enemyHit = true;
          break;
        }
      }

      // Player bullet hitting UFO
      if (state.ufo && state.ufo.active) {
        if (checkCollision(
          bullet.x, bullet.y, bullet.width, bullet.height,
          state.ufo.x, state.ufo.y, state.ufo.width, state.ufo.height
        )) {
          state.score += state.ufo.points;
          state.ufo.active = false;
          state.bullets.splice(i, 1);
          sounds.ufoHit = true;
        }
      }
    } else {
      // Enemy bullet hitting player
      if (checkCollision(
        bullet.x, bullet.y, bullet.width, bullet.height,
        state.player.x, state.player.y, state.player.width, state.player.height
      )) {
        state.lives--;
        state.bullets.splice(i, 1);
        sounds.playerHit = true;

        if (state.lives <= 0) {
          state.gameOver = true;
          sounds.gameOver = true;
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
    // All enemies defeated
    if (state.level >= 5) {
      state.victory = true;
      sounds.levelComplete = true;
    } else {
      nextLevel(state);
      sounds.levelComplete = true;
    }
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

  // Speed increases as fewer enemies remain
  // Speed increases gradually as fewer enemies remain (max 1.5x at the end)
  const speedMultiplier = 1 + (1 - activeEnemies.length / (ENEMY_ROWS * ENEMY_COLS)) * 0.5;
  const currentSpeed = state.formation.speed * speedMultiplier;

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
    // Don't check wall collision this frame - we just dropped and changed direction
  } else {
    const moveX = currentSpeed * state.formation.direction * dt;

    // Check wall collision BEFORE moving
    const willHitRightWall = state.formation.direction > 0 && maxX + moveX >= CANVAS_WIDTH - 5;
    const willHitLeftWall = state.formation.direction < 0 && minX + moveX <= 5;

    if (willHitRightWall || willHitLeftWall) {
      state.formation.moveDown = true;
    } else {
      // Only move if not hitting wall
      for (const enemy of activeEnemies) {
        enemy.x += moveX;
      }
    }
  }

  // Update animation frame and march sound
  // March tempo increases as fewer enemies remain
  const marchInterval = Math.max(10, Math.floor(60 - (1 - activeEnemies.length / (ENEMY_ROWS * ENEMY_COLS)) * 40));
  if (state.animationTick % marchInterval === 0) {
    for (const enemy of activeEnemies) {
      enemy.animFrame = (enemy.animFrame + 1) % 2;
    }
    sounds.enemyMarch = true;
    sounds.marchPitch = state.marchCounter % 4;
    state.marchCounter++;
  }

  // Enemy shooting
  const shootingEnemies = getShootingEnemies(state.formation);
  for (const enemy of shootingEnemies) {
    if (Math.random() < ENEMY_SHOOT_CHANCE * (1 + state.level * 0.2)) {
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

  // Enemy collision with shields
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
  if (!state.ufo && Math.random() < UFO_SPAWN_CHANCE) {
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

    // Remove if off screen
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
