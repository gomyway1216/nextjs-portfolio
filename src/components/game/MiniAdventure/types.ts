/**
 * Mini Adventure - Types and Constants
 * A roguelike game inspired by ラミィの大冒険
 */

// Game constants
export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 25;
export const MAX_FLOORS = 10;
export const TORCH_MAX = 100;
export const TORCH_DECAY_RATE = 1; // Per turn in dungeon
export const HP_REGEN_INTERVAL = 3; // Turns to regen 1 HP
export const EGG_HATCH_TURNS = 60;
export const INVENTORY_MAX = 10;

// Difficulty tiers. Each affects enemy scaling, torch decay and starting supplies.
export type MiniAdventureDifficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyConfig {
  enemyStatMult: number;   // multiplier on enemy hp/attack
  torchDecay: number;      // torch drain per dungeon turn
  startPotions: number;    // health potions granted at start
  startTorches: number;    // spare torches granted at start
  darknessMult: number;    // extra damage multiplier when torch is out
}

export const DIFFICULTY_CONFIGS: Record<MiniAdventureDifficulty, DifficultyConfig> = {
  easy: { enemyStatMult: 0.8, torchDecay: 1, startPotions: 3, startTorches: 2, darknessMult: 1.25 },
  normal: { enemyStatMult: 1.0, torchDecay: 1, startPotions: 2, startTorches: 1, darknessMult: 1.5 },
  hard: { enemyStatMult: 1.25, torchDecay: 2, startPotions: 1, startTorches: 0, darknessMult: 1.75 },
};

// Tile types
export enum TileType {
  WALL = 'wall',
  FLOOR = 'floor',
  STAIRS_DOWN = 'stairs_down',
  DOOR = 'door',
}

// Direction
export enum Direction {
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
  UP_LEFT = 'up_left',
  UP_RIGHT = 'up_right',
  DOWN_LEFT = 'down_left',
  DOWN_RIGHT = 'down_right',
}

export const DIRECTION_OFFSETS: Record<Direction, { dx: number; dy: number }> = {
  [Direction.UP]: { dx: 0, dy: -1 },
  [Direction.DOWN]: { dx: 0, dy: 1 },
  [Direction.LEFT]: { dx: -1, dy: 0 },
  [Direction.RIGHT]: { dx: 1, dy: 0 },
  [Direction.UP_LEFT]: { dx: -1, dy: -1 },
  [Direction.UP_RIGHT]: { dx: 1, dy: -1 },
  [Direction.DOWN_LEFT]: { dx: -1, dy: 1 },
  [Direction.DOWN_RIGHT]: { dx: 1, dy: 1 },
};

// Position
export interface Position {
  x: number;
  y: number;
}

// Tile
export interface Tile {
  type: TileType;
  visible: boolean;
  explored: boolean;
  roomId?: number;
}

// Item types
export enum ItemType {
  WEAPON = 'weapon',
  ARMOR = 'armor',
  TORCH = 'torch',
  SCROLL = 'scroll',
  CARD = 'card',
  EGG = 'egg',
  POTION = 'potion',
}

// Weapon data
export interface WeaponData {
  id: string;
  name: string;
  attack: number;
  level: number;
}

// Armor data
export interface ArmorData {
  id: string;
  name: string;
  defense: number;
  level: number;
}

// Scroll effects
export enum ScrollEffect {
  FIREBALL = 'fireball',      // Damage to enemy
  FREEZE = 'freeze',          // Freeze enemy for turns
  TELEPORT = 'teleport',      // Random teleport
  MAP_REVEAL = 'map_reveal',  // Reveal entire floor
  POWER_UP = 'power_up',      // Temporary attack boost
  SHIELD = 'shield',          // Temporary defense boost
}

// Card effects
export enum CardEffect {
  DAMAGE = 'damage',          // Throwable damage
  SLEEP = 'sleep',            // Put enemy to sleep
  CONFUSE = 'confuse',        // Confuse enemy
  KNOCKBACK = 'knockback',    // Push enemy back
  HEAL = 'heal',              // Restore HP when used on self
}

// Egg/Pet types
export enum PetType {
  GRABBER_BIRD = 'grabber_bird',  // Escape to random location
  PYTHON = 'python',              // Reduce all visible enemies to 1 HP
  TEDDY = 'teddy',                // Guide enemies, prevent counterattack
}

// Item
export interface Item {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  // Type-specific data
  weaponData?: WeaponData;
  armorData?: ArmorData;
  torchValue?: number;
  scrollEffect?: ScrollEffect;
  cardEffect?: CardEffect;
  petType?: PetType;
  eggTurns?: number; // Turns until hatching
}

// Enemy types
export enum EnemyType {
  SLIME = 'slime',
  BAT = 'bat',
  GOBLIN = 'goblin',
  SKELETON = 'skeleton',
  ORC = 'orc',
  WORM = 'worm',           // Eats eggs
  IMP = 'imp',             // Disabling scream
  GHOST = 'ghost',         // Can pass through walls
  GOLEM = 'golem',         // High defense
  DRAGON = 'dragon',       // Boss - resists magic
}

// Enemy status effects
export enum StatusEffect {
  NONE = 'none',
  SLEEP = 'sleep',
  FROZEN = 'frozen',
  CONFUSED = 'confused',
  POWERED_UP = 'powered_up',
  SHIELDED = 'shielded',
}

// Enemy
export interface Enemy {
  id: string;
  type: EnemyType;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  expValue: number;
  status: StatusEffect;
  statusTurns: number;
  // Special properties
  resistsMagic?: boolean;
  canPassWalls?: boolean;
  eatsEggs?: boolean;
  canDisable?: boolean;
}

// Player
export interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  baseAttack: number;
  baseDefense: number;
  level: number;
  exp: number;
  expToNext: number;
  torch: number;
  weapon: Item | null;
  armor: Item | null;
  inventory: Item[];
  status: StatusEffect;
  statusTurns: number;
  turnsSinceRegen: number;
  // Active pet
  pet: PetType | null;
}

// Floor item on ground
export interface FloorItem {
  item: Item;
  x: number;
  y: number;
}

// Game floor/level
export interface GameFloor {
  level: number;
  tiles: Tile[][];
  enemies: Enemy[];
  items: FloorItem[];
  stairsPos: Position;
  rooms: Room[];
}

// Room for map generation
export interface Room {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  connected: boolean;
}

// Message log entry
export interface LogMessage {
  text: string;
  type: 'info' | 'combat' | 'item' | 'important';
  turn: number;
}

// Game state
export interface GameState {
  player: Player;
  floor: GameFloor;
  currentFloor: number;
  turn: number;
  gameOver: boolean;
  victory: boolean;
  messages: LogMessage[];
  isOnSurface: boolean; // On surface, torch doesn't decay
  difficulty: MiniAdventureDifficulty;
  bossDefeated: boolean; // Dragon boss on the final floor has been slain
  enemiesDefeated: number; // Total kills, for end-of-run stats
}

// Input action
export enum ActionType {
  MOVE = 'move',
  ATTACK = 'attack',
  USE_ITEM = 'use_item',
  PICK_UP = 'pick_up',
  DROP = 'drop',
  EQUIP = 'equip',
  UNEQUIP = 'unequip',
  USE_STAIRS = 'use_stairs',
  WAIT = 'wait',
  USE_PET = 'use_pet',
}

export interface GameAction {
  type: ActionType;
  direction?: Direction;
  itemIndex?: number;
  targetPos?: Position;
}

// Helper functions
export function createPosition(x: number, y: number): Position {
  return { x, y };
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Experience table
export function getExpForLevel(level: number): number {
  return Math.floor(10 * Math.pow(1.5, level - 1));
}

// Vision radius based on torch
export function getVisionRadius(torch: number): number {
  if (torch <= 0) return 2;
  if (torch < 25) return 4;
  if (torch < 50) return 6;
  return 8;
}
