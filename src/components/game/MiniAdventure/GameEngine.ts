/**
 * Mini Adventure - Game Engine
 * Core game logic: turns, combat, movement, items
 */

import {
  GameState,
  Player,
  Enemy,
  Item,
  ItemType,
  GameAction,
  ActionType,
  Direction,
  DIRECTION_OFFSETS,
  TileType,
  Position,
  StatusEffect,
  ScrollEffect,
  CardEffect,
  PetType,
  LogMessage,
  TORCH_MAX,
  TORCH_DECAY_RATE,
  HP_REGEN_INTERVAL,
  MAX_FLOORS,
  INVENTORY_MAX,
  getVisionRadius,
  getExpForLevel,
  positionsEqual,
  EGG_HATCH_TURNS,
} from './types';
import { generateFloor, generateSurface, updateVisibility, revealEntireMap } from './MapGenerator';
import { getEnemyMove, isAdjacentToPlayer, getEnemyChar, createBoss } from './Enemies';

// Create initial player
function createPlayer(x: number, y: number): Player {
  return {
    x,
    y,
    hp: 30,
    maxHp: 30,
    baseAttack: 5,
    baseDefense: 2,
    level: 1,
    exp: 0,
    expToNext: getExpForLevel(1),
    torch: TORCH_MAX,
    weapon: null,
    armor: null,
    inventory: [],
    status: StatusEffect.NONE,
    statusTurns: 0,
    turnsSinceRegen: 0,
    pet: null,
  };
}

// Create initial game state
export function createGameState(): GameState {
  const surface = generateSurface();
  const startPos = surface.rooms[0] ? {
    x: Math.floor(surface.rooms[0].x + surface.rooms[0].width / 2),
    y: Math.floor(surface.rooms[0].y + surface.rooms[0].height / 2),
  } : { x: 20, y: 12 };

  const player = createPlayer(startPos.x, startPos.y);

  // Update initial visibility
  updateVisibility(surface.tiles, player.x, player.y, getVisionRadius(player.torch));

  return {
    player,
    floor: surface,
    currentFloor: 0,
    turn: 0,
    gameOver: false,
    victory: false,
    messages: [
      { text: 'Welcome to the dungeon! Find the stairs to descend.', type: 'important', turn: 0 },
      { text: 'Arrow keys or WASD to move. Press "." to wait.', type: 'info', turn: 0 },
    ],
    isOnSurface: true,
  };
}

// Add message to log
function addMessage(state: GameState, text: string, type: LogMessage['type'] = 'info'): void {
  state.messages.push({ text, type, turn: state.turn });
  // Keep only last 50 messages
  if (state.messages.length > 50) {
    state.messages = state.messages.slice(-50);
  }
}

// Get player's total attack
function getPlayerAttack(player: Player): number {
  let attack = player.baseAttack;
  if (player.weapon?.weaponData) {
    attack += player.weapon.weaponData.attack;
  }
  if (player.status === StatusEffect.POWERED_UP) {
    attack = Math.floor(attack * 1.5);
  }
  return attack;
}

// Get player's total defense
function getPlayerDefense(player: Player): number {
  let defense = player.baseDefense;
  if (player.armor?.armorData) {
    defense += player.armor.armorData.defense;
  }
  if (player.status === StatusEffect.SHIELDED) {
    defense = Math.floor(defense * 1.5);
  }
  return defense;
}

// Calculate damage
function calculateDamage(attack: number, defense: number): number {
  const baseDamage = Math.max(1, attack - defense);
  // Add some randomness
  const variance = Math.floor(baseDamage * 0.2);
  return baseDamage + Math.floor(Math.random() * (variance * 2 + 1)) - variance;
}

// Check if position is walkable
function isWalkable(state: GameState, x: number, y: number): boolean {
  const { floor } = state;
  if (x < 0 || x >= floor.tiles[0].length || y < 0 || y >= floor.tiles.length) {
    return false;
  }
  const tile = floor.tiles[y][x];
  return tile.type !== TileType.WALL;
}

// Get enemy at position
function getEnemyAt(state: GameState, x: number, y: number): Enemy | undefined {
  return state.floor.enemies.find(e => e.x === x && e.y === y && e.hp > 0);
}

// Process player movement
function processMovement(state: GameState, direction: Direction): boolean {
  const { player } = state;
  const offset = DIRECTION_OFFSETS[direction];
  const newX = player.x + offset.dx;
  const newY = player.y + offset.dy;

  // Check for enemy at target position
  const enemy = getEnemyAt(state, newX, newY);
  if (enemy) {
    // Attack instead of move
    processPlayerAttack(state, enemy);
    return true;
  }

  // Check if walkable
  if (!isWalkable(state, newX, newY)) {
    return false;
  }

  // Move player
  player.x = newX;
  player.y = newY;

  // Check for items
  const itemOnGround = state.floor.items.find(i => i.x === newX && i.y === newY);
  if (itemOnGround) {
    addMessage(state, `You see a ${itemOnGround.item.name} here. Press 'g' to pick up.`, 'item');
  }

  return true;
}

// Process player attack
function processPlayerAttack(state: GameState, enemy: Enemy): void {
  const { player } = state;
  const playerAttack = getPlayerAttack(player);
  const damage = calculateDamage(playerAttack, enemy.defense);

  enemy.hp -= damage;
  addMessage(state, `You hit the ${enemy.name} for ${damage} damage!`, 'combat');

  if (enemy.hp <= 0) {
    addMessage(state, `You defeated the ${enemy.name}! (+${enemy.expValue} exp)`, 'combat');
    gainExp(state, enemy.expValue);
  }
}

// Gain experience
function gainExp(state: GameState, exp: number): void {
  const { player } = state;
  player.exp += exp;

  while (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level++;
    player.expToNext = getExpForLevel(player.level);

    // Level up bonuses
    const hpGain = 5 + player.level;
    player.maxHp += hpGain;
    player.hp = Math.min(player.hp + hpGain, player.maxHp);
    player.baseAttack += 1;
    player.baseDefense += 1;

    addMessage(state, `Level up! You are now level ${player.level}!`, 'important');
  }
}

// Use stairs
function useStairs(state: GameState): boolean {
  const { player, floor, currentFloor } = state;
  const tile = floor.tiles[player.y][player.x];

  if (tile.type !== TileType.STAIRS_DOWN) {
    addMessage(state, 'There are no stairs here.', 'info');
    return false;
  }

  // Descend to next floor
  const newFloorLevel = currentFloor + 1;

  if (newFloorLevel > MAX_FLOORS) {
    // Victory!
    state.victory = true;
    state.gameOver = true;
    addMessage(state, 'You escaped the dungeon! Victory!', 'important');
    return true;
  }

  // Generate new floor
  const newFloor = generateFloor(newFloorLevel);

  // Find start position (first room)
  const startRoom = newFloor.rooms[0];
  const startPos = {
    x: Math.floor(startRoom.x + startRoom.width / 2),
    y: Math.floor(startRoom.y + startRoom.height / 2),
  };

  // Add boss on final floor
  if (newFloorLevel === MAX_FLOORS) {
    const boss = createBoss(newFloor.stairsPos.x, newFloor.stairsPos.y - 1);
    newFloor.enemies.push(boss);
    addMessage(state, 'You sense a powerful presence on this floor...', 'important');
  }

  // Update state
  state.floor = newFloor;
  state.currentFloor = newFloorLevel;
  state.isOnSurface = false;
  player.x = startPos.x;
  player.y = startPos.y;

  addMessage(state, `You descend to floor ${newFloorLevel}.`, 'important');

  // Update visibility
  updateVisibility(newFloor.tiles, player.x, player.y, getVisionRadius(player.torch));

  return true;
}

// Pick up item
function pickUpItem(state: GameState): boolean {
  const { player, floor } = state;
  const itemIndex = floor.items.findIndex(i => i.x === player.x && i.y === player.y);

  if (itemIndex === -1) {
    addMessage(state, 'There is nothing here to pick up.', 'info');
    return false;
  }

  if (player.inventory.length >= INVENTORY_MAX) {
    addMessage(state, 'Your inventory is full!', 'info');
    return false;
  }

  const floorItem = floor.items[itemIndex];
  player.inventory.push(floorItem.item);
  floor.items.splice(itemIndex, 1);

  addMessage(state, `You picked up the ${floorItem.item.name}.`, 'item');
  return true;
}

// Use item from inventory
function useItem(state: GameState, itemIndex: number, targetDirection?: Direction): boolean {
  const { player } = state;

  if (itemIndex < 0 || itemIndex >= player.inventory.length) {
    return false;
  }

  const item = player.inventory[itemIndex];

  switch (item.type) {
    case ItemType.TORCH:
      player.torch = Math.min(TORCH_MAX, player.torch + (item.torchValue || 50));
      addMessage(state, `You use the torch. Light restored to ${player.torch}.`, 'item');
      player.inventory.splice(itemIndex, 1);
      return true;

    case ItemType.POTION:
      const heal = 30;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      addMessage(state, `You drink the potion. HP restored by ${heal}.`, 'item');
      player.inventory.splice(itemIndex, 1);
      return true;

    case ItemType.SCROLL:
      return useScroll(state, item, itemIndex);

    case ItemType.CARD:
      return useCard(state, item, itemIndex, targetDirection);

    case ItemType.WEAPON:
    case ItemType.ARMOR:
      return equipItem(state, itemIndex);

    case ItemType.EGG:
      addMessage(state, 'The egg needs more time to hatch.', 'info');
      return false;

    default:
      return false;
  }
}

// Use scroll
function useScroll(state: GameState, scroll: Item, itemIndex: number): boolean {
  const { player, floor } = state;

  switch (scroll.scrollEffect) {
    case ScrollEffect.TELEPORT:
      // Find random floor tile
      const floorTiles: Position[] = [];
      for (let y = 0; y < floor.tiles.length; y++) {
        for (let x = 0; x < floor.tiles[0].length; x++) {
          if (floor.tiles[y][x].type === TileType.FLOOR) {
            const hasEnemy = floor.enemies.some(e => e.x === x && e.y === y && e.hp > 0);
            if (!hasEnemy) {
              floorTiles.push({ x, y });
            }
          }
        }
      }
      if (floorTiles.length > 0) {
        const dest = floorTiles[Math.floor(Math.random() * floorTiles.length)];
        player.x = dest.x;
        player.y = dest.y;
        addMessage(state, 'You teleport to a new location!', 'item');
      }
      break;

    case ScrollEffect.MAP_REVEAL:
      revealEntireMap(floor.tiles);
      addMessage(state, 'The entire floor is revealed!', 'item');
      break;

    case ScrollEffect.POWER_UP:
      player.status = StatusEffect.POWERED_UP;
      player.statusTurns = 10;
      addMessage(state, 'Your attacks are powered up!', 'item');
      break;

    case ScrollEffect.SHIELD:
      player.status = StatusEffect.SHIELDED;
      player.statusTurns = 10;
      addMessage(state, 'A magical shield surrounds you!', 'item');
      break;

    case ScrollEffect.FIREBALL:
      // Damage all visible enemies
      let damaged = 0;
      for (const enemy of floor.enemies) {
        if (enemy.hp > 0 && floor.tiles[enemy.y][enemy.x].visible && !enemy.resistsMagic) {
          const damage = 15 + player.level * 2;
          enemy.hp -= damage;
          damaged++;
          if (enemy.hp <= 0) {
            addMessage(state, `The ${enemy.name} is incinerated! (+${enemy.expValue} exp)`, 'combat');
            gainExp(state, enemy.expValue);
          }
        }
      }
      addMessage(state, damaged > 0 ? `Fireball hits ${damaged} enemies!` : 'No enemies in sight.', 'combat');
      break;

    case ScrollEffect.FREEZE:
      // Freeze all visible enemies
      for (const enemy of floor.enemies) {
        if (enemy.hp > 0 && floor.tiles[enemy.y][enemy.x].visible && !enemy.resistsMagic) {
          enemy.status = StatusEffect.FROZEN;
          enemy.statusTurns = 5;
        }
      }
      addMessage(state, 'Enemies are frozen in place!', 'item');
      break;
  }

  player.inventory.splice(itemIndex, 1);
  return true;
}

// Use card (throwable)
function useCard(state: GameState, card: Item, itemIndex: number, direction?: Direction): boolean {
  const { player, floor } = state;

  // Heal card can be used on self
  if (card.cardEffect === CardEffect.HEAL) {
    const heal = 20;
    player.hp = Math.min(player.maxHp, player.hp + heal);
    addMessage(state, `The heal card restores ${heal} HP!`, 'item');
    player.inventory.splice(itemIndex, 1);
    return true;
  }

  // Other cards need a direction
  if (!direction) {
    addMessage(state, 'Choose a direction to throw the card.', 'info');
    return false;
  }

  const offset = DIRECTION_OFFSETS[direction];
  let x = player.x;
  let y = player.y;

  // Throw card in direction until it hits something
  for (let i = 0; i < 8; i++) {
    x += offset.dx;
    y += offset.dy;

    if (x < 0 || x >= floor.tiles[0].length || y < 0 || y >= floor.tiles.length) break;
    if (floor.tiles[y][x].type === TileType.WALL) break;

    const enemy = getEnemyAt(state, x, y);
    if (enemy) {
      applyCardEffect(state, card, enemy);
      player.inventory.splice(itemIndex, 1);
      return true;
    }
  }

  addMessage(state, 'The card flies off into the darkness...', 'info');
  player.inventory.splice(itemIndex, 1);
  return true;
}

// Apply card effect to enemy
function applyCardEffect(state: GameState, card: Item, enemy: Enemy): void {
  switch (card.cardEffect) {
    case CardEffect.DAMAGE:
      const damage = 10 + state.player.level * 2;
      enemy.hp -= damage;
      addMessage(state, `The card hits ${enemy.name} for ${damage} damage!`, 'combat');
      if (enemy.hp <= 0) {
        addMessage(state, `You defeated the ${enemy.name}! (+${enemy.expValue} exp)`, 'combat');
        gainExp(state, enemy.expValue);
      }
      break;

    case CardEffect.SLEEP:
      enemy.status = StatusEffect.SLEEP;
      enemy.statusTurns = 5;
      addMessage(state, `${enemy.name} falls asleep!`, 'combat');
      break;

    case CardEffect.CONFUSE:
      enemy.status = StatusEffect.CONFUSED;
      enemy.statusTurns = 8;
      addMessage(state, `${enemy.name} is confused!`, 'combat');
      break;

    case CardEffect.KNOCKBACK:
      // Push enemy back
      const dx = enemy.x - state.player.x;
      const dy = enemy.y - state.player.y;
      const pushX = enemy.x + Math.sign(dx) * 3;
      const pushY = enemy.y + Math.sign(dy) * 3;
      if (isWalkable(state, pushX, pushY) && !getEnemyAt(state, pushX, pushY)) {
        enemy.x = pushX;
        enemy.y = pushY;
      }
      addMessage(state, `${enemy.name} is pushed back!`, 'combat');
      break;
  }
}

// Equip item
function equipItem(state: GameState, itemIndex: number): boolean {
  const { player } = state;
  const item = player.inventory[itemIndex];

  if (item.type === ItemType.WEAPON) {
    // Swap with current weapon
    const oldWeapon = player.weapon;
    player.weapon = item;
    player.inventory.splice(itemIndex, 1);
    if (oldWeapon) {
      player.inventory.push(oldWeapon);
    }
    addMessage(state, `You equip the ${item.name}.`, 'item');
    return true;
  }

  if (item.type === ItemType.ARMOR) {
    // Swap with current armor
    const oldArmor = player.armor;
    player.armor = item;
    player.inventory.splice(itemIndex, 1);
    if (oldArmor) {
      player.inventory.push(oldArmor);
    }
    addMessage(state, `You equip the ${item.name}.`, 'item');
    return true;
  }

  return false;
}

// Use pet ability
function usePet(state: GameState): boolean {
  const { player, floor } = state;

  if (!player.pet) {
    addMessage(state, 'You have no pet.', 'info');
    return false;
  }

  switch (player.pet) {
    case PetType.GRABBER_BIRD:
      // Teleport to random location
      const floorTiles: Position[] = [];
      for (let y = 0; y < floor.tiles.length; y++) {
        for (let x = 0; x < floor.tiles[0].length; x++) {
          if (floor.tiles[y][x].type === TileType.FLOOR) {
            const hasEnemy = floor.enemies.some(e => e.x === x && e.y === y && e.hp > 0);
            if (!hasEnemy) {
              floorTiles.push({ x, y });
            }
          }
        }
      }
      if (floorTiles.length > 0) {
        const dest = floorTiles[Math.floor(Math.random() * floorTiles.length)];
        player.x = dest.x;
        player.y = dest.y;
        addMessage(state, 'The Grabber Bird carries you away!', 'important');
      }
      player.pet = null;
      return true;

    case PetType.PYTHON:
      // Reduce all visible enemies to 1 HP
      for (const enemy of floor.enemies) {
        if (enemy.hp > 0 && floor.tiles[enemy.y][enemy.x].visible && enemy.hp > 1) {
          enemy.hp = 1;
        }
      }
      addMessage(state, 'The Python weakens all visible enemies!', 'important');
      player.pet = null;
      return true;

    case PetType.TEDDY:
      // Make enemies move away
      for (const enemy of floor.enemies) {
        if (enemy.hp > 0 && floor.tiles[enemy.y][enemy.x].visible) {
          enemy.status = StatusEffect.CONFUSED;
          enemy.statusTurns = 5;
        }
      }
      addMessage(state, 'The Teddy confuses nearby enemies!', 'important');
      player.pet = null;
      return true;
  }

  return false;
}

// Process enemy turns
function processEnemyTurns(state: GameState): void {
  const { player, floor } = state;

  for (const enemy of floor.enemies) {
    if (enemy.hp <= 0) continue;

    // Process status effects
    if (enemy.statusTurns > 0) {
      enemy.statusTurns--;
      if (enemy.statusTurns === 0) {
        enemy.status = StatusEffect.NONE;
      }
    }

    // Skip if frozen or asleep
    if (enemy.status === StatusEffect.FROZEN || enemy.status === StatusEffect.SLEEP) {
      continue;
    }

    // Check if adjacent to player - attack
    if (isAdjacentToPlayer(enemy, player)) {
      // Special ability: Imp can disable
      if (enemy.canDisable && Math.random() < 0.3) {
        player.status = StatusEffect.FROZEN;
        player.statusTurns = 2;
        addMessage(state, `The ${enemy.name}'s scream freezes you!`, 'combat');
        continue;
      }

      // Special ability: Worm eats eggs
      if (enemy.eatsEggs) {
        const eggIndex = player.inventory.findIndex(i => i.type === ItemType.EGG);
        if (eggIndex !== -1) {
          player.inventory.splice(eggIndex, 1);
          addMessage(state, `The ${enemy.name} ate your egg!`, 'combat');
          continue;
        }
      }

      // Normal attack
      const damage = calculateDamage(enemy.attack, getPlayerDefense(player));
      // Extra damage if torch is out
      const finalDamage = player.torch <= 0 ? Math.floor(damage * 1.5) : damage;
      player.hp -= finalDamage;
      addMessage(state, `The ${enemy.name} hits you for ${finalDamage} damage!`, 'combat');

      if (player.hp <= 0) {
        state.gameOver = true;
        addMessage(state, 'You have been defeated...', 'important');
        return;
      }
    } else {
      // Move towards player
      const moveDir = getEnemyMove(enemy, player, floor.tiles, floor.enemies);
      if (moveDir) {
        const offset = DIRECTION_OFFSETS[moveDir];
        enemy.x += offset.dx;
        enemy.y += offset.dy;
      }
    }
  }
}

// Process turn end
function processTurnEnd(state: GameState): void {
  const { player, floor, isOnSurface } = state;

  state.turn++;

  // HP regeneration (every 3 turns of moving/attacking)
  player.turnsSinceRegen++;
  if (player.turnsSinceRegen >= HP_REGEN_INTERVAL) {
    player.turnsSinceRegen = 0;
    if (player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 1);
    }
  }

  // Torch decay (only in dungeon)
  if (!isOnSurface && player.torch > 0) {
    player.torch = Math.max(0, player.torch - TORCH_DECAY_RATE);
    if (player.torch === 0) {
      addMessage(state, 'Your torch has gone out! Danger increases!', 'important');
    } else if (player.torch === 20) {
      addMessage(state, 'Your torch is flickering...', 'info');
    }
  }

  // Player status effect decay
  if (player.statusTurns > 0) {
    player.statusTurns--;
    if (player.statusTurns === 0) {
      player.status = StatusEffect.NONE;
    }
  }

  // Egg hatching
  for (const item of player.inventory) {
    if (item.type === ItemType.EGG && item.eggTurns !== undefined) {
      item.eggTurns++;
      if (item.eggTurns >= EGG_HATCH_TURNS && item.petType) {
        // Hatch!
        if (!player.pet) {
          player.pet = item.petType;
          const idx = player.inventory.indexOf(item);
          player.inventory.splice(idx, 1);
          addMessage(state, `Your egg hatched into a ${getPetName(item.petType)}!`, 'important');
        }
      }
    }
  }

  // Update visibility
  updateVisibility(floor.tiles, player.x, player.y, getVisionRadius(player.torch));
}

function getPetName(pet: PetType): string {
  switch (pet) {
    case PetType.GRABBER_BIRD: return 'Grabber Bird';
    case PetType.PYTHON: return 'Python';
    case PetType.TEDDY: return 'Teddy';
  }
}

// Process game action
export function processAction(state: GameState, action: GameAction): GameState {
  if (state.gameOver) return state;

  // Create new state
  const newState = { ...state };
  let turnTaken = false;

  switch (action.type) {
    case ActionType.MOVE:
      if (action.direction) {
        // Check if player is frozen
        if (state.player.status === StatusEffect.FROZEN) {
          addMessage(newState, 'You are frozen and cannot move!', 'info');
          turnTaken = true;
        } else {
          turnTaken = processMovement(newState, action.direction);
        }
      }
      break;

    case ActionType.USE_STAIRS:
      turnTaken = useStairs(newState);
      break;

    case ActionType.PICK_UP:
      turnTaken = pickUpItem(newState);
      break;

    case ActionType.USE_ITEM:
      if (action.itemIndex !== undefined) {
        turnTaken = useItem(newState, action.itemIndex, action.direction);
      }
      break;

    case ActionType.EQUIP:
      if (action.itemIndex !== undefined) {
        turnTaken = equipItem(newState, action.itemIndex);
      }
      break;

    case ActionType.USE_PET:
      turnTaken = usePet(newState);
      break;

    case ActionType.WAIT:
      addMessage(newState, 'You wait...', 'info');
      turnTaken = true;
      break;

    case ActionType.DROP:
      if (action.itemIndex !== undefined) {
        const item = newState.player.inventory[action.itemIndex];
        if (item) {
          newState.floor.items.push({
            item,
            x: newState.player.x,
            y: newState.player.y,
          });
          newState.player.inventory.splice(action.itemIndex, 1);
          addMessage(newState, `You dropped the ${item.name}.`, 'item');
          turnTaken = true;
        }
      }
      break;
  }

  if (turnTaken && !newState.gameOver) {
    processEnemyTurns(newState);
    processTurnEnd(newState);
  }

  return newState;
}

// Get direction from key
export function getDirectionFromKey(key: string): Direction | null {
  switch (key.toLowerCase()) {
    case 'arrowup':
    case 'w':
    case 'k':
      return Direction.UP;
    case 'arrowdown':
    case 's':
    case 'j':
      return Direction.DOWN;
    case 'arrowleft':
    case 'a':
    case 'h':
      return Direction.LEFT;
    case 'arrowright':
    case 'd':
    case 'l':
      return Direction.RIGHT;
    case 'y':
      return Direction.UP_LEFT;
    case 'u':
      return Direction.UP_RIGHT;
    case 'b':
      return Direction.DOWN_LEFT;
    case 'n':
      return Direction.DOWN_RIGHT;
    default:
      return null;
  }
}
