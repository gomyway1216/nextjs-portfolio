/**
 * Mini Adventure - Procedural Map Generator
 * Generates dungeon floors with rooms and corridors
 */

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  TileType,
  Tile,
  Room,
  Position,
  GameFloor,
  FloorItem,
  Enemy,
} from './types';
import { generateRandomItem } from './Items';
import { createEnemy, getEnemiesForFloor } from './Enemies';

// Room generation parameters
const MIN_ROOM_SIZE = 4;
const MAX_ROOM_SIZE = 10;
const MAX_ROOMS = 9;
const MIN_ROOMS = 5;

// Create empty tile
function createTile(type: TileType): Tile {
  return {
    type,
    visible: false,
    explored: false,
  };
}

// Initialize empty map
function createEmptyMap(): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    tiles[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      tiles[y][x] = createTile(TileType.WALL);
    }
  }
  return tiles;
}

// Check if room overlaps with existing rooms
function roomOverlaps(room: Room, rooms: Room[]): boolean {
  const padding = 2; // Space between rooms
  for (const other of rooms) {
    if (
      room.x - padding < other.x + other.width &&
      room.x + room.width + padding > other.x &&
      room.y - padding < other.y + other.height &&
      room.y + room.height + padding > other.y
    ) {
      return true;
    }
  }
  return false;
}

// Carve a room into the map
function carveRoom(tiles: Tile[][], room: Room): void {
  for (let y = room.y; y < room.y + room.height; y++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      if (y >= 0 && y < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
        tiles[y][x] = createTile(TileType.FLOOR);
        tiles[y][x].roomId = room.id;
      }
    }
  }
}

// Get room center
function getRoomCenter(room: Room): Position {
  return {
    x: Math.floor(room.x + room.width / 2),
    y: Math.floor(room.y + room.height / 2),
  };
}

// Carve horizontal corridor
function carveHorizontalCorridor(tiles: Tile[][], x1: number, x2: number, y: number): void {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  for (let x = minX; x <= maxX; x++) {
    if (y >= 0 && y < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
      tiles[y][x] = createTile(TileType.FLOOR);
    }
  }
}

// Carve vertical corridor
function carveVerticalCorridor(tiles: Tile[][], y1: number, y2: number, x: number): void {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (let y = minY; y <= maxY; y++) {
    if (y >= 0 && y < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
      tiles[y][x] = createTile(TileType.FLOOR);
    }
  }
}

// Connect two rooms with corridors
function connectRooms(tiles: Tile[][], room1: Room, room2: Room): void {
  const center1 = getRoomCenter(room1);
  const center2 = getRoomCenter(room2);

  // Randomly choose to go horizontal then vertical, or vice versa
  if (Math.random() < 0.5) {
    carveHorizontalCorridor(tiles, center1.x, center2.x, center1.y);
    carveVerticalCorridor(tiles, center1.y, center2.y, center2.x);
  } else {
    carveVerticalCorridor(tiles, center1.y, center2.y, center1.x);
    carveHorizontalCorridor(tiles, center1.x, center2.x, center2.y);
  }
}

// Generate rooms
function generateRooms(): Room[] {
  const rooms: Room[] = [];
  const targetRooms = MIN_ROOMS + Math.floor(Math.random() * (MAX_ROOMS - MIN_ROOMS + 1));
  let attempts = 0;
  const maxAttempts = 100;

  while (rooms.length < targetRooms && attempts < maxAttempts) {
    attempts++;

    const width = MIN_ROOM_SIZE + Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));
    const height = MIN_ROOM_SIZE + Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));
    const x = 1 + Math.floor(Math.random() * (MAP_WIDTH - width - 2));
    const y = 1 + Math.floor(Math.random() * (MAP_HEIGHT - height - 2));

    const room: Room = {
      id: rooms.length,
      x,
      y,
      width,
      height,
      connected: false,
    };

    if (!roomOverlaps(room, rooms)) {
      rooms.push(room);
    }
  }

  return rooms;
}

// Get random floor position in a room
function getRandomPositionInRoom(room: Room): Position {
  return {
    x: room.x + 1 + Math.floor(Math.random() * (room.width - 2)),
    y: room.y + 1 + Math.floor(Math.random() * (room.height - 2)),
  };
}

// Get random floor position on the map
function getRandomFloorPosition(tiles: Tile[][], exclude: Position[] = []): Position | null {
  const floorPositions: Position[] = [];

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (tiles[y][x].type === TileType.FLOOR) {
        const isExcluded = exclude.some(p => p.x === x && p.y === y);
        if (!isExcluded) {
          floorPositions.push({ x, y });
        }
      }
    }
  }

  if (floorPositions.length === 0) return null;
  return floorPositions[Math.floor(Math.random() * floorPositions.length)];
}

// Generate items for the floor
function generateItems(tiles: Tile[][], floorLevel: number, rooms: Room[], exclude: Position[]): FloorItem[] {
  const items: FloorItem[] = [];
  const itemCount = 3 + Math.floor(Math.random() * 4) + Math.floor(floorLevel / 2);

  for (let i = 0; i < itemCount; i++) {
    const pos = getRandomFloorPosition(tiles, [...exclude, ...items.map(it => ({ x: it.x, y: it.y }))]);
    if (pos) {
      items.push({
        item: generateRandomItem(floorLevel),
        x: pos.x,
        y: pos.y,
      });
    }
  }

  return items;
}

// Generate enemies for the floor
function generateEnemies(tiles: Tile[][], floorLevel: number, exclude: Position[]): Enemy[] {
  const enemies: Enemy[] = [];
  const enemyTypes = getEnemiesForFloor(floorLevel);
  const enemyCount = 4 + Math.floor(Math.random() * 3) + Math.floor(floorLevel / 2);

  // Generate regular enemies
  for (let i = 0; i < enemyCount; i++) {
    const pos = getRandomFloorPosition(tiles, [...exclude, ...enemies.map(e => ({ x: e.x, y: e.y }))]);
    if (pos) {
      const enemyType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
      const enemy = createEnemy(enemyType, pos.x, pos.y, floorLevel);
      enemies.push(enemy);
    }
  }

  return enemies;
}

// Generate a complete floor
export function generateFloor(floorLevel: number, playerStartPos?: Position): GameFloor {
  const tiles = createEmptyMap();
  const rooms = generateRooms();

  // Carve rooms
  for (const room of rooms) {
    carveRoom(tiles, room);
  }

  // Connect rooms
  for (let i = 1; i < rooms.length; i++) {
    connectRooms(tiles, rooms[i - 1], rooms[i]);
    rooms[i].connected = true;
    rooms[i - 1].connected = true;
  }

  // Player start position (first room center if not provided)
  const startRoom = rooms[0];
  const startPos = playerStartPos || getRoomCenter(startRoom);

  // Stairs in last room (or random room far from start)
  let stairsRoom = rooms[rooms.length - 1];
  // Try to find a room far from start
  for (const room of rooms) {
    const roomCenter = getRoomCenter(room);
    const stairsCenter = getRoomCenter(stairsRoom);
    const distToStart = Math.abs(roomCenter.x - startPos.x) + Math.abs(roomCenter.y - startPos.y);
    const currentDist = Math.abs(stairsCenter.x - startPos.x) + Math.abs(stairsCenter.y - startPos.y);
    if (distToStart > currentDist) {
      stairsRoom = room;
    }
  }

  const stairsPos = getRoomCenter(stairsRoom);
  tiles[stairsPos.y][stairsPos.x].type = TileType.STAIRS_DOWN;

  // Generate items (excluding player start and stairs)
  const exclude = [startPos, stairsPos];
  const items = generateItems(tiles, floorLevel, rooms, exclude);

  // Generate enemies (excluding player start, stairs, and items)
  const enemyExclude = [...exclude, ...items.map(it => ({ x: it.x, y: it.y }))];
  const enemies = generateEnemies(tiles, floorLevel, enemyExclude);

  return {
    level: floorLevel,
    tiles,
    enemies,
    items,
    stairsPos,
    rooms,
  };
}

// Generate surface (safe starting area)
export function generateSurface(): GameFloor {
  const tiles = createEmptyMap();

  // Create a simple open area
  const room: Room = {
    id: 0,
    x: Math.floor(MAP_WIDTH / 2) - 5,
    y: Math.floor(MAP_HEIGHT / 2) - 3,
    width: 10,
    height: 6,
    connected: true,
  };

  carveRoom(tiles, room);

  // Stairs down in center
  const stairsPos = getRoomCenter(room);
  tiles[stairsPos.y][stairsPos.x].type = TileType.STAIRS_DOWN;

  return {
    level: 0,
    tiles,
    enemies: [],
    items: [],
    stairsPos,
    rooms: [room],
  };
}

// Update tile visibility based on player position and torch
export function updateVisibility(
  tiles: Tile[][],
  playerX: number,
  playerY: number,
  visionRadius: number
): void {
  // Reset visibility
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      tiles[y][x].visible = false;
    }
  }

  // Simple circular visibility
  for (let dy = -visionRadius; dy <= visionRadius; dy++) {
    for (let dx = -visionRadius; dx <= visionRadius; dx++) {
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= visionRadius) {
        const x = playerX + dx;
        const y = playerY + dy;
        if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
          // Basic line-of-sight check
          if (hasLineOfSight(tiles, playerX, playerY, x, y)) {
            tiles[y][x].visible = true;
            tiles[y][x].explored = true;
          }
        }
      }
    }
  }
}

// Simple line-of-sight check using Bresenham's algorithm
function hasLineOfSight(tiles: Tile[][], x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    // Check if we've reached the destination
    if (x === x1 && y === y1) return true;

    // Check if current tile blocks vision (walls block, but we can see the wall itself)
    if (tiles[y][x].type === TileType.WALL && !(x === x1 && y === y1)) {
      // We can see this wall tile but not beyond
      if (x !== x0 || y !== y0) {
        return false;
      }
    }

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// Reveal entire map (for map scroll)
export function revealEntireMap(tiles: Tile[][]): void {
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      tiles[y][x].explored = true;
    }
  }
}
