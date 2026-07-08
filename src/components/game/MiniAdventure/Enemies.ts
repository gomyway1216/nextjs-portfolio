/**
 * Mini Adventure - Enemy Definitions and AI
 */

import {
  Enemy,
  EnemyType,
  StatusEffect,
  Position,
  Direction,
  DIRECTION_OFFSETS,
  TileType,
  Tile,
  chebyshevDistance,
  DifficultyConfig,
} from './types';

// Unique ID generator
let enemyIdCounter = 0;
function generateEnemyId(): string {
  return `enemy_${++enemyIdCounter}`;
}

// Enemy base stats by type
interface EnemyTemplate {
  type: EnemyType;
  name: string;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseExp: number;
  char: string;
  color: string;
  // Special abilities
  resistsMagic?: boolean;
  canPassWalls?: boolean;
  eatsEggs?: boolean;
  canDisable?: boolean;
  // Floor range where this enemy appears
  minFloor: number;
  maxFloor: number;
}

const ENEMY_TEMPLATES: EnemyTemplate[] = [
  {
    type: EnemyType.SLIME,
    name: 'Slime',
    baseHp: 8,
    baseAttack: 2,
    baseDefense: 0,
    baseExp: 5,
    char: 's',
    color: '#4ade80',
    minFloor: 1,
    maxFloor: 4,
  },
  {
    type: EnemyType.BAT,
    name: 'Bat',
    baseHp: 6,
    baseAttack: 3,
    baseDefense: 0,
    baseExp: 6,
    char: 'b',
    color: '#a78bfa',
    minFloor: 1,
    maxFloor: 5,
  },
  {
    type: EnemyType.GOBLIN,
    name: 'Goblin',
    baseHp: 12,
    baseAttack: 4,
    baseDefense: 1,
    baseExp: 10,
    char: 'g',
    color: '#22c55e',
    minFloor: 2,
    maxFloor: 6,
  },
  {
    type: EnemyType.WORM,
    name: 'Worm',
    baseHp: 10,
    baseAttack: 3,
    baseDefense: 0,
    baseExp: 8,
    char: 'w',
    color: '#f472b6',
    eatsEggs: true,
    minFloor: 2,
    maxFloor: 7,
  },
  {
    type: EnemyType.SKELETON,
    name: 'Skeleton',
    baseHp: 15,
    baseAttack: 5,
    baseDefense: 2,
    baseExp: 15,
    char: 'S',
    color: '#e5e5e5',
    minFloor: 3,
    maxFloor: 8,
  },
  {
    type: EnemyType.IMP,
    name: 'Imp',
    baseHp: 12,
    baseAttack: 4,
    baseDefense: 1,
    baseExp: 12,
    char: 'i',
    color: '#ef4444',
    canDisable: true,
    minFloor: 3,
    maxFloor: 8,
  },
  {
    type: EnemyType.ORC,
    name: 'Orc',
    baseHp: 20,
    baseAttack: 6,
    baseDefense: 3,
    baseExp: 20,
    char: 'O',
    color: '#84cc16',
    minFloor: 4,
    maxFloor: 9,
  },
  {
    type: EnemyType.GHOST,
    name: 'Ghost',
    baseHp: 14,
    baseAttack: 5,
    baseDefense: 0,
    baseExp: 18,
    char: 'G',
    color: '#94a3b8',
    canPassWalls: true,
    minFloor: 5,
    maxFloor: 10,
  },
  {
    type: EnemyType.GOLEM,
    name: 'Golem',
    baseHp: 30,
    baseAttack: 7,
    baseDefense: 8,
    baseExp: 30,
    char: 'M',
    color: '#78716c',
    minFloor: 6,
    maxFloor: 10,
  },
  {
    type: EnemyType.DRAGON,
    name: 'Dragon',
    baseHp: 100,
    baseAttack: 15,
    baseDefense: 10,
    baseExp: 100,
    char: 'D',
    color: '#f59e0b',
    resistsMagic: true,
    minFloor: 10,
    maxFloor: 10,
  },
];

// Get enemy template
export function getEnemyTemplate(type: EnemyType): EnemyTemplate | undefined {
  return ENEMY_TEMPLATES.find(t => t.type === type);
}

// Create enemy instance. statMult scales hp/attack for difficulty tiers.
export function createEnemy(
  type: EnemyType,
  x: number,
  y: number,
  floorLevel: number,
  statMult = 1,
): Enemy {
  const template = getEnemyTemplate(type);
  if (!template) {
    throw new Error(`Unknown enemy type: ${type}`);
  }

  // Scale stats with floor level
  const levelBonus = Math.floor((floorLevel - template.minFloor) * 0.5);
  const hp = Math.max(1, Math.round((template.baseHp + levelBonus * 3) * statMult));
  const attack = Math.max(1, Math.round((template.baseAttack + levelBonus) * statMult));
  const defense = template.baseDefense + Math.floor(levelBonus * 0.5);

  return {
    id: generateEnemyId(),
    type,
    name: template.name,
    x,
    y,
    hp,
    maxHp: hp,
    attack,
    defense,
    expValue: template.baseExp + levelBonus * 2,
    status: StatusEffect.NONE,
    statusTurns: 0,
    resistsMagic: template.resistsMagic,
    canPassWalls: template.canPassWalls,
    eatsEggs: template.eatsEggs,
    canDisable: template.canDisable,
  };
}

// Get enemies that can appear on a floor
export function getEnemiesForFloor(floorLevel: number): EnemyType[] {
  return ENEMY_TEMPLATES
    .filter(t => floorLevel >= t.minFloor && floorLevel <= t.maxFloor)
    .map(t => t.type);
}

// Get enemy display character
export function getEnemyChar(enemy: Enemy): string {
  const template = getEnemyTemplate(enemy.type);
  return template?.char || '?';
}

// Get enemy color
export function getEnemyColor(enemy: Enemy): string {
  const template = getEnemyTemplate(enemy.type);
  return template?.color || '#ef4444';
}

// How far an enemy will start actively chasing the player.
const CHASE_RANGE = 10;
// BFS is bounded to this radius so pathfinding stays cheap.
const BFS_RADIUS = 12;

function validDirections(
  enemy: Enemy,
  tiles: Tile[][],
  enemies: Enemy[],
): Direction[] {
  const directions = Object.values(Direction);
  return directions.filter(dir => {
    const offset = DIRECTION_OFFSETS[dir];
    const newX = enemy.x + offset.dx;
    const newY = enemy.y + offset.dy;
    return canEnemyMoveTo(newX, newY, tiles, enemies, enemy.canPassWalls);
  });
}

// Enemy AI: Get next move direction
export function getEnemyMove(
  enemy: Enemy,
  playerPos: Position,
  tiles: Tile[][],
  enemies: Enemy[]
): Direction | null {
  // Skip if enemy has a status effect that prevents movement
  if (enemy.status === StatusEffect.SLEEP || enemy.status === StatusEffect.FROZEN) {
    return null;
  }

  // If confused, move randomly
  if (enemy.status === StatusEffect.CONFUSED) {
    const validDirs = validDirections(enemy, tiles, enemies);
    if (validDirs.length === 0) return null;
    return validDirs[Math.floor(Math.random() * validDirs.length)];
  }

  // Calculate distance to player
  const distToPlayer = chebyshevDistance(enemy, playerPos);

  // If too far, don't chase (enemies only chase within range)
  if (distToPlayer > CHASE_RANGE) {
    // Wander randomly
    if (Math.random() < 0.3) {
      const validDirs = validDirections(enemy, tiles, enemies);
      if (validDirs.length > 0) {
        return validDirs[Math.floor(Math.random() * validDirs.length)];
      }
    }
    return null;
  }

  // Ghosts ignore walls, so a straight greedy step is always optimal for them.
  if (!enemy.canPassWalls) {
    // Try BFS to find the true next step toward the player. This lets enemies
    // navigate around wall corners instead of getting stuck (the old greedy
    // approach only moved when a step strictly reduced distance).
    const bfsDir = bfsNextStep(enemy, playerPos, tiles, enemies);
    if (bfsDir) return bfsDir;
  }

  // Fallback: greedy step. Pick the move that most reduces distance; among
  // equally-good moves choose randomly so enemies don't all hug the same wall.
  let bestDist = Infinity;
  const bestDirs: Direction[] = [];

  for (const dir of validDirections(enemy, tiles, enemies)) {
    const offset = DIRECTION_OFFSETS[dir];
    const newDist = chebyshevDistance(
      { x: enemy.x + offset.dx, y: enemy.y + offset.dy },
      playerPos,
    );
    if (newDist < bestDist) {
      bestDist = newDist;
      bestDirs.length = 0;
      bestDirs.push(dir);
    } else if (newDist === bestDist) {
      bestDirs.push(dir);
    }
  }

  // Only chase if it actually gets us closer than standing still.
  if (bestDirs.length === 0 || bestDist >= distToPlayer) return null;
  return bestDirs[Math.floor(Math.random() * bestDirs.length)];
}

// Bounded BFS returning the first step of the shortest path to the player.
// Treats other living enemies as blockers so they don't stack.
function bfsNextStep(
  enemy: Enemy,
  playerPos: Position,
  tiles: Tile[][],
  enemies: Enemy[],
): Direction | null {
  const startKey = (x: number, y: number) => `${x},${y}`;
  const visited = new Set<string>([startKey(enemy.x, enemy.y)]);
  // Queue holds cells plus the first direction taken to reach them.
  const queue: { x: number; y: number; firstDir: Direction | null }[] = [
    { x: enemy.x, y: enemy.y, firstDir: null },
  ];

  const directions = Object.values(Direction);

  while (queue.length > 0) {
    const cur = queue.shift()!;

    for (const dir of directions) {
      const offset = DIRECTION_OFFSETS[dir];
      const nx = cur.x + offset.dx;
      const ny = cur.y + offset.dy;
      const key = startKey(nx, ny);
      if (visited.has(key)) continue;

      // Stay within a bounded window around the enemy for performance.
      if (Math.abs(nx - enemy.x) > BFS_RADIUS || Math.abs(ny - enemy.y) > BFS_RADIUS) {
        continue;
      }

      // Reaching the player: return the first step of this path.
      if (nx === playerPos.x && ny === playerPos.y) {
        return cur.firstDir ?? dir;
      }

      if (!canEnemyMoveTo(nx, ny, tiles, enemies, enemy.canPassWalls)) continue;

      visited.add(key);
      queue.push({ x: nx, y: ny, firstDir: cur.firstDir ?? dir });
    }
  }

  return null;
}

// Check if enemy can move to position
function canEnemyMoveTo(
  x: number,
  y: number,
  tiles: Tile[][],
  enemies: Enemy[],
  canPassWalls?: boolean
): boolean {
  // Check bounds
  if (x < 0 || x >= tiles[0].length || y < 0 || y >= tiles.length) {
    return false;
  }

  // Check tile type
  const tile = tiles[y][x];
  if (!canPassWalls && tile.type === TileType.WALL) {
    return false;
  }

  // Check for other enemies
  const hasEnemy = enemies.some(e => e.x === x && e.y === y && e.hp > 0);
  if (hasEnemy) {
    return false;
  }

  return true;
}

// Check if enemy is adjacent to player (can attack)
export function isAdjacentToPlayer(enemy: Enemy, playerPos: Position): boolean {
  return chebyshevDistance(enemy, playerPos) <= 1;
}

// Create boss enemy for final floor
export function createBoss(x: number, y: number, config?: DifficultyConfig): Enemy {
  const boss = createEnemy(EnemyType.DRAGON, x, y, 10, config?.enemyStatMult ?? 1);
  boss.name = 'Dragon';
  return boss;
}
