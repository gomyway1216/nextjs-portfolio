import { beforeEach, describe, expect, it } from 'vitest';
import {
  baseDamage,
  calculateDamage,
  cloneGameState,
  createGameState,
  damageRange,
  getPlayerAttack,
  getPlayerDefense,
  processAction,
} from '@/components/game/MiniAdventure/GameEngine';
import { createEnemy, getEnemyMove } from '@/components/game/MiniAdventure/Enemies';
import { generateFloor, generateSurface } from '@/components/game/MiniAdventure/MapGenerator';
import { createPotion, createWeapon, createArmor } from '@/components/game/MiniAdventure/Items';
import {
  ActionType,
  DIFFICULTY_CONFIGS,
  Direction,
  EnemyType,
  GameState,
  getExpForLevel,
  getVisionRadius,
  ItemType,
  MAP_HEIGHT,
  MAP_WIDTH,
  StatusEffect,
  Tile,
  TileType,
  TORCH_MAX,
} from '@/components/game/MiniAdventure/types';

function floorTiles(): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < 10; y++) {
    tiles[y] = [];
    for (let x = 0; x < 10; x++) {
      tiles[y][x] = { type: TileType.FLOOR, visible: true, explored: true };
    }
  }
  return tiles;
}

describe('combat math', () => {
  it('base damage is at least 1 even against high defense', () => {
    expect(baseDamage(3, 100)).toBe(1);
    expect(baseDamage(10, 2)).toBe(8);
  });

  it('calculateDamage never drops below 1 and stays within variance range', () => {
    for (let i = 0; i < 500; i++) {
      const d = calculateDamage(10, 3); // base 7, variance 1 -> [6,8]
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeGreaterThanOrEqual(6);
      expect(d).toBeLessThanOrEqual(8);
    }
  });

  it('damageRange reports the correct min/max', () => {
    expect(damageRange(10, 3)).toEqual({ min: 6, max: 8 });
    expect(damageRange(2, 100)).toEqual({ min: 1, max: 1 });
  });
});

describe('player derived stats', () => {
  it('adds weapon and armor bonuses', () => {
    const state = createGameState('normal');
    const p = state.player;
    const baseAtk = getPlayerAttack(p);
    const baseDef = getPlayerDefense(p);

    p.weapon = createWeapon(2); // WEAPONS[2] = Iron Sword +6
    p.armor = createArmor(2); // ARMORS[2] = Chainmail +5
    expect(getPlayerAttack(p)).toBe(baseAtk + 6);
    expect(getPlayerDefense(p)).toBe(baseDef + 5);
  });

  it('powered up multiplies attack by 1.5', () => {
    const state = createGameState('normal');
    const p = state.player;
    const before = getPlayerAttack(p);
    p.status = StatusEffect.POWERED_UP;
    expect(getPlayerAttack(p)).toBe(Math.floor(before * 1.5));
  });
});

describe('progression / experience', () => {
  it('exp curve is strictly increasing', () => {
    for (let lvl = 1; lvl < 10; lvl++) {
      expect(getExpForLevel(lvl + 1)).toBeGreaterThan(getExpForLevel(lvl));
    }
  });

  it('killing an enemy grants exp and can level up', () => {
    let state = createGameState('normal');
    // Put a weak enemy right next to the player and make it killable in one hit.
    const enemy = createEnemy(EnemyType.SLIME, state.player.x + 1, state.player.y, 1);
    enemy.hp = 1;
    enemy.defense = 0;
    state.floor.enemies.push(enemy);
    state.player.baseAttack = 100;

    const startLevel = state.player.level;
    state = processAction(state, { type: ActionType.MOVE, direction: Direction.RIGHT });

    expect(state.floor.enemies[0].hp).toBeLessThanOrEqual(0);
    expect(state.enemiesDefeated).toBe(1);
    expect(state.player.level).toBeGreaterThanOrEqual(startLevel);
  });
});

describe('map rules', () => {
  it('generated floors have correct dimensions and downstairs', () => {
    for (let f = 1; f <= 10; f++) {
      const floor = generateFloor(f);
      expect(floor.tiles.length).toBe(MAP_HEIGHT);
      expect(floor.tiles[0].length).toBe(MAP_WIDTH);
      const stairs = floor.tiles[floor.stairsPos.y][floor.stairsPos.x];
      expect(stairs.type).toBe(TileType.STAIRS_DOWN);
    }
  });

  it('every floor tile is reachable from the start room (no soft-lock)', () => {
    for (let attempt = 0; attempt < 15; attempt++) {
      const floor = generateFloor(3);
      const start = {
        x: Math.floor(floor.rooms[0].x + floor.rooms[0].width / 2),
        y: Math.floor(floor.rooms[0].y + floor.rooms[0].height / 2),
      };
      // Flood fill over walkable tiles.
      const seen = new Set<string>();
      const stack = [start];
      seen.add(`${start.x},${start.y}`);
      while (stack.length) {
        const c = stack.pop()!;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
          const key = `${nx},${ny}`;
          if (seen.has(key)) continue;
          if (floor.tiles[ny][nx].type === TileType.WALL) continue;
          seen.add(key);
          stack.push({ x: nx, y: ny });
        }
      }
      // The stairs must be reachable from the start.
      expect(seen.has(`${floor.stairsPos.x},${floor.stairsPos.y}`)).toBe(true);
    }
  });

  it('surface has no enemies and torch does not decay there', () => {
    const surface = generateSurface();
    expect(surface.enemies.length).toBe(0);
    let state = createGameState('normal');
    expect(state.isOnSurface).toBe(true);
    const torchBefore = state.player.torch;
    state = processAction(state, { type: ActionType.WAIT });
    expect(state.player.torch).toBe(torchBefore);
  });

  it('vision radius shrinks as torch dies', () => {
    expect(getVisionRadius(TORCH_MAX)).toBeGreaterThan(getVisionRadius(0));
    expect(getVisionRadius(0)).toBe(2);
  });
});

describe('enemy AI pathfinding', () => {
  it('steps closer to the player on an open floor', () => {
    const tiles = floorTiles();
    const enemy = createEnemy(EnemyType.GOBLIN, 0, 0, 3);
    const dir = getEnemyMove(enemy, { x: 5, y: 5 }, tiles, [enemy]);
    expect(dir).not.toBeNull();
  });

  it('navigates around a wall instead of getting stuck', () => {
    const tiles = floorTiles();
    // Build a vertical wall between enemy (left) and player (right) with one gap.
    for (let y = 0; y < 10; y++) tiles[y][5].type = TileType.WALL;
    tiles[0][5].type = TileType.FLOOR; // gap at the top

    const enemy = createEnemy(EnemyType.GOBLIN, 2, 5, 3);
    const player = { x: 8, y: 5 };

    // Simulate several turns; a stuck greedy AI would never cross the wall.
    let crossed = false;
    for (let i = 0; i < 40; i++) {
      const dir = getEnemyMove(enemy, player, tiles, [enemy]);
      if (!dir) break;
      const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], up_left: [-1, -1], up_right: [1, -1], down_left: [-1, 1], down_right: [1, 1] } as const;
      const [dx, dy] = off[dir];
      const nx = enemy.x + dx;
      const ny = enemy.y + dy;
      if (tiles[ny]?.[nx]?.type === TileType.WALL) throw new Error('AI walked into a wall');
      enemy.x = nx;
      enemy.y = ny;
      if (enemy.x > 5) { crossed = true; break; }
    }
    expect(crossed).toBe(true);
  });

  it('ghosts can path through walls', () => {
    const tiles = floorTiles();
    for (let y = 0; y < 10; y++) tiles[y][5].type = TileType.WALL;
    const ghost = createEnemy(EnemyType.GHOST, 2, 5, 5);
    const dir = getEnemyMove(ghost, { x: 8, y: 5 }, tiles, [ghost]);
    expect(dir).not.toBeNull();
  });
});

describe('movement & collision', () => {
  let state: GameState;
  beforeEach(() => { state = createGameState('normal'); });

  it('does not move into a wall', () => {
    const { player } = state;
    // Put a wall directly to the player's right and try to walk into it.
    state.floor.tiles[player.y][player.x + 1].type = TileType.WALL;
    const next = processAction(state, { type: ActionType.MOVE, direction: Direction.RIGHT });
    expect(next.player.x).toBe(player.x);
    expect(next.player.y).toBe(player.y);
  });

  it('moving onto an adjacent enemy attacks instead of moving', () => {
    const { player } = state;
    const enemy = createEnemy(EnemyType.SLIME, player.x + 1, player.y, 1);
    enemy.hp = 50;
    state.floor.enemies.push(enemy);
    const px = player.x;
    const next = processAction(state, { type: ActionType.MOVE, direction: Direction.RIGHT });
    expect(next.player.x).toBe(px); // did not step onto the enemy
    expect(next.floor.enemies[0].hp).toBeLessThan(50); // dealt damage
  });
});

describe('state purity / clone', () => {
  it('processAction does not mutate the previous state', () => {
    const state = createGameState('normal');
    const snapshot = cloneGameState(state);
    processAction(state, { type: ActionType.WAIT });
    // Turn on the original must be unchanged.
    expect(state.turn).toBe(snapshot.turn);
    expect(state.player.hp).toBe(snapshot.player.hp);
  });

  it('gameOver states are returned unchanged', () => {
    const state = createGameState('normal');
    state.gameOver = true;
    const result = processAction(state, { type: ActionType.WAIT });
    expect(result).toBe(state);
  });
});

describe('victory gating & progression', () => {
  it('stairs on the final floor refuse to work until the boss is dead', () => {
    let state = createGameState('normal');
    state.currentFloor = 10;
    state.isOnSurface = false;
    state.bossDefeated = false;
    // Stand on stairs.
    state.floor.tiles[state.player.y][state.player.x].type = TileType.STAIRS_DOWN;

    state = processAction(state, { type: ActionType.USE_STAIRS });
    expect(state.victory).toBe(false);
    expect(state.gameOver).toBe(false);

    state.bossDefeated = true;
    state.floor.tiles[state.player.y][state.player.x].type = TileType.STAIRS_DOWN;
    state = processAction(state, { type: ActionType.USE_STAIRS });
    expect(state.victory).toBe(true);
    expect(state.gameOver).toBe(true);
  });

  it('descending advances the floor and leaves the surface', () => {
    let state = createGameState('normal');
    // Move player onto the surface stairs.
    state.player.x = state.floor.stairsPos.x;
    state.player.y = state.floor.stairsPos.y;
    state = processAction(state, { type: ActionType.USE_STAIRS });
    expect(state.currentFloor).toBe(1);
    expect(state.isOnSurface).toBe(false);
  });
});

describe('items', () => {
  it('using a potion heals but not above max hp', () => {
    let state = createGameState('easy'); // easy starts with potions
    state.player.hp = 5;
    const potionIdx = state.player.inventory.findIndex(i => i.type === ItemType.POTION);
    expect(potionIdx).toBeGreaterThanOrEqual(0);
    state = processAction(state, { type: ActionType.USE_ITEM, itemIndex: potionIdx });
    // maxHp is 30 at level 1, so healing 30 from 5 caps at maxHp.
    expect(state.player.hp).toBe(state.player.maxHp);
  });

  it('a potion heals exactly 30 HP when there is headroom', () => {
    let state = createGameState('easy');
    state.player.maxHp = 100;
    state.player.hp = 40;
    const potionIdx = state.player.inventory.findIndex(i => i.type === ItemType.POTION);
    expect(potionIdx).toBeGreaterThanOrEqual(0);
    state = processAction(state, { type: ActionType.USE_ITEM, itemIndex: potionIdx });
    expect(state.player.hp).toBe(70); // 40 + 30
  });

  it('a fresh potion object is a potion with a 30 HP description', () => {
    const potion = createPotion();
    expect(potion.type).toBe(ItemType.POTION);
    expect(potion.description).toContain('30');
  });
});

describe('difficulty tiers', () => {
  it('harder tiers grant fewer supplies and drain torch faster', () => {
    expect(DIFFICULTY_CONFIGS.easy.startPotions).toBeGreaterThan(DIFFICULTY_CONFIGS.hard.startPotions);
    expect(DIFFICULTY_CONFIGS.hard.torchDecay).toBeGreaterThanOrEqual(DIFFICULTY_CONFIGS.normal.torchDecay);
    expect(DIFFICULTY_CONFIGS.hard.enemyStatMult).toBeGreaterThan(DIFFICULTY_CONFIGS.easy.enemyStatMult);
  });

  it('enemy stat multiplier scales hp', () => {
    const weak = createEnemy(EnemyType.ORC, 0, 0, 4, DIFFICULTY_CONFIGS.easy.enemyStatMult);
    const strong = createEnemy(EnemyType.ORC, 0, 0, 4, DIFFICULTY_CONFIGS.hard.enemyStatMult);
    expect(strong.maxHp).toBeGreaterThan(weak.maxHp);
  });
});
