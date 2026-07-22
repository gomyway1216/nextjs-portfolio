import { describe, it, expect } from 'vitest';
import {
  checkCollision,
  speedMultiplierForRemaining,
  marchIntervalForRemaining,
  formationSpeedForLevel,
  waveDescentOffset,
  pointsForEnemy,
  createFormation,
  createGameState,
  grantExtraLives,
  nextLevel,
  resetAfterDeath,
  updateGame,
} from '@/components/game/SpaceInvaders/GameEngine';
import {
  EnemyType,
  ENEMY_ROWS,
  ENEMY_COLS,
  ENEMY_OFFSET_TOP,
  INITIAL_ENEMY_SPEED,
  MAX_LIVES,
  MAX_WAVE_DESCENT,
  WAVE_DESCENT_STEP,
  DIFFICULTY_SETTINGS,
  InputState,
} from '@/components/game/SpaceInvaders/types';

const NO_INPUT: InputState = { left: false, right: false, shoot: false };

describe('checkCollision', () => {
  it('detects overlapping rectangles', () => {
    expect(checkCollision(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
  });

  it('returns false for separated rectangles', () => {
    expect(checkCollision(0, 0, 10, 10, 20, 20, 5, 5)).toBe(false);
  });

  it('treats touching edges as non-overlapping', () => {
    // right edge of A exactly at left edge of B
    expect(checkCollision(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
  });
});

describe('speedMultiplierForRemaining', () => {
  it('is 1x with a full formation', () => {
    expect(speedMultiplierForRemaining(100, 100)).toBeCloseTo(1);
  });

  it('accelerates as ranks thin', () => {
    const full = speedMultiplierForRemaining(100, 100);
    const half = speedMultiplierForRemaining(50, 100);
    const last = speedMultiplierForRemaining(1, 100);
    expect(half).toBeGreaterThan(full);
    expect(last).toBeGreaterThan(half);
  });

  it('peaks above 2x with one enemy left', () => {
    expect(speedMultiplierForRemaining(1, 55)).toBeGreaterThan(2);
  });

  it('guards against a zero total', () => {
    expect(speedMultiplierForRemaining(0, 0)).toBe(1);
  });
});

describe('marchIntervalForRemaining', () => {
  it('shrinks (faster march) as fewer enemies remain', () => {
    const many = marchIntervalForRemaining(55, 55);
    const few = marchIntervalForRemaining(1, 55);
    expect(few).toBeLessThan(many);
  });

  it('never drops below the floor', () => {
    expect(marchIntervalForRemaining(0, 55)).toBeGreaterThanOrEqual(8);
  });
});

describe('formationSpeedForLevel', () => {
  it('increases with level', () => {
    expect(formationSpeedForLevel(3, 'normal')).toBeGreaterThan(formationSpeedForLevel(1, 'normal'));
  });

  it('applies difficulty multiplier', () => {
    const normal = formationSpeedForLevel(1, 'normal');
    expect(formationSpeedForLevel(1, 'hard')).toBeCloseTo(normal * DIFFICULTY_SETTINGS.hard.speedMultiplier);
    expect(formationSpeedForLevel(1, 'easy')).toBeCloseTo(normal * DIFFICULTY_SETTINGS.easy.speedMultiplier);
  });

  it('level 1 normal equals the base initial speed', () => {
    expect(formationSpeedForLevel(1, 'normal')).toBeCloseTo(INITIAL_ENEMY_SPEED);
  });
});

describe('waveDescentOffset', () => {
  it('is zero on the first wave', () => {
    expect(waveDescentOffset(1)).toBe(0);
  });

  it('descends by a step each wave', () => {
    expect(waveDescentOffset(2)).toBe(WAVE_DESCENT_STEP);
    expect(waveDescentOffset(3)).toBe(WAVE_DESCENT_STEP * 2);
  });

  it('clamps to the maximum descent', () => {
    expect(waveDescentOffset(999)).toBe(MAX_WAVE_DESCENT);
  });
});

describe('pointsForEnemy', () => {
  it('scores each enemy type correctly', () => {
    expect(pointsForEnemy(EnemyType.SQUID)).toBe(30);
    expect(pointsForEnemy(EnemyType.CRAB)).toBe(20);
    expect(pointsForEnemy(EnemyType.OCTOPUS)).toBe(10);
  });
});

describe('createFormation', () => {
  it('creates a full grid', () => {
    const f = createFormation(1);
    expect(f.enemies).toHaveLength(ENEMY_ROWS * ENEMY_COLS);
    expect(f.enemies.every(e => e.active)).toBe(true);
  });

  it('assigns squid to the top row and octopus to the bottom', () => {
    const f = createFormation(1);
    expect(f.enemies[0].type).toBe(EnemyType.SQUID);
    expect(f.enemies[f.enemies.length - 1].type).toBe(EnemyType.OCTOPUS);
  });

  it('spawns later waves lower on screen', () => {
    const w1 = createFormation(1);
    const w3 = createFormation(3);
    expect(w1.enemies[0].y).toBe(ENEMY_OFFSET_TOP);
    expect(w3.enemies[0].y).toBeGreaterThan(w1.enemies[0].y);
  });
});

describe('grantExtraLives', () => {
  it('awards a life when a threshold is crossed', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.score = 1500;
    const granted = grantExtraLives(s);
    expect(granted).toBe(true);
    expect(s.lives).toBe(4);
    expect(s.nextExtraLifeAt).toBe(3000);
  });

  it('does not award below the threshold', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.score = 1499;
    expect(grantExtraLives(s)).toBe(false);
    expect(s.lives).toBe(3);
  });

  it('caps at MAX_LIVES but still advances the threshold', () => {
    const s = createGameState(1, 0, MAX_LIVES, 'normal');
    s.score = 3000;
    grantExtraLives(s);
    expect(s.lives).toBe(MAX_LIVES);
    expect(s.nextExtraLifeAt).toBe(4500);
  });
});

describe('createGameState / difficulty', () => {
  it('uses difficulty starting lives when lives are unspecified', () => {
    expect(createGameState(1, 0, undefined, 'easy').lives).toBe(DIFFICULTY_SETTINGS.easy.startingLives);
    expect(createGameState(1, 0, undefined, 'hard').lives).toBe(DIFFICULTY_SETTINGS.hard.startingLives);
  });
});

describe('nextLevel', () => {
  it('advances the level and rebuilds a full formation', () => {
    const s = createGameState(1, 100, 3, 'normal');
    s.formation.enemies.forEach(e => (e.active = false));
    nextLevel(s);
    expect(s.level).toBe(2);
    expect(s.formation.enemies.every(e => e.active)).toBe(true);
    expect(s.score).toBe(100); // score is preserved across waves
    expect(s.bullets).toHaveLength(0);
  });
});

describe('resetAfterDeath', () => {
  it('clears enemy bullets but keeps player bullets', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.bullets = [
      { x: 0, y: 0, width: 4, height: 15, isEnemy: true },
      { x: 0, y: 0, width: 4, height: 15, isEnemy: false },
    ];
    resetAfterDeath(s);
    expect(s.bullets.every(b => !b.isEnemy)).toBe(true);
    expect(s.bullets).toHaveLength(1);
  });
});

describe('updateGame integration', () => {
  it('does nothing when paused', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.isPaused = true;
    const before = s.player.x;
    updateGame(s, { left: false, right: true, shoot: false }, 16.67, 1000);
    expect(s.player.x).toBe(before);
  });

  it('moves the player right on input', () => {
    const s = createGameState(1, 0, 3, 'normal');
    const before = s.player.x;
    updateGame(s, { left: false, right: true, shoot: false }, 16.67, 1000);
    expect(s.player.x).toBeGreaterThan(before);
  });

  it('advances to the next wave when all enemies are cleared', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.formation.enemies.forEach(e => (e.active = false));
    const sounds = updateGame(s, NO_INPUT, 16.67, 1000);
    expect(sounds.levelComplete).toBe(true);
    expect(s.level).toBe(2);
    expect(s.gameOver).toBe(false); // endless — clearing a wave never ends the game
  });

  it('a player bullet destroys an enemy and scores it', () => {
    const s = createGameState(1, 0, 3, 'normal');
    // keep exactly one enemy, place a bullet on top of it
    const target = s.formation.enemies[0];
    s.formation.enemies.forEach((e, i) => (e.active = i === 0));
    s.bullets = [{
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
      width: 4, height: 15, isEnemy: false,
    }];
    updateGame(s, NO_INPUT, 16.67, 1000);
    expect(target.active).toBe(false);
    expect(s.score).toBe(pointsForEnemy(target.type));
  });

  it('an enemy bullet hitting the player costs a life', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.bullets = [{
      x: s.player.x + s.player.width / 2,
      y: s.player.y + s.player.height / 2,
      width: 4, height: 20, isEnemy: true,
    }];
    updateGame(s, NO_INPUT, 16.67, 1000);
    expect(s.lives).toBe(2);
    expect(s.gameOver).toBe(false);
  });

  it('game over when the last life is lost', () => {
    const s = createGameState(1, 0, 1, 'normal');
    s.bullets = [{
      x: s.player.x + s.player.width / 2,
      y: s.player.y + s.player.height / 2,
      width: 4, height: 20, isEnemy: true,
    }];
    const sounds = updateGame(s, NO_INPUT, 16.67, 1000);
    expect(s.lives).toBe(0);
    expect(s.gameOver).toBe(true);
    expect(sounds.gameOver).toBe(true);
  });

  it('only allows one player bullet on screen at a time', () => {
    const s = createGameState(1, 0, 3, 'normal');
    updateGame(s, { left: false, right: false, shoot: true }, 16.67, 1000);
    updateGame(s, { left: false, right: false, shoot: true }, 16.67, 2000);
    const playerBullets = s.bullets.filter(b => !b.isEnemy);
    expect(playerBullets.length).toBeLessThanOrEqual(1);
  });
});
