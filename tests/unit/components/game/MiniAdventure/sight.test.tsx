import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEnemy } from '@/components/game/MiniAdventure/Enemies';
import { createGameState, processAction } from '@/components/game/MiniAdventure/GameEngine';
import { getMiniAdventureStrings } from '@/components/game/MiniAdventure/i18n';
import { createArmor, createWeapon } from '@/components/game/MiniAdventure/Items';
import { damageDealtTo, damageTakenFrom, describeSight } from '@/components/game/MiniAdventure/Sight';
import { SIGHT_MAX_ROWS, SightPanel } from '@/components/game/MiniAdventure/SightPanel';
import {
  ActionType,
  Direction,
  Enemy,
  EnemyType,
  GameState,
  MAP_HEIGHT,
  MAP_WIDTH,
  MiniAdventureDifficulty,
  StatusEffect,
  Tile,
  TileType,
} from '@/components/game/MiniAdventure/types';

// An open, fully lit room with the player in the middle at (5, 5).
function arena(difficulty: MiniAdventureDifficulty = 'normal', enemies: Enemy[] = []): GameState {
  const state = createGameState(difficulty);
  const tiles: Tile[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    tiles[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) tiles[y][x] = { type: TileType.FLOOR, visible: true, explored: true };
  }
  state.floor = { level: 3, tiles, enemies, items: [], stairsPos: { x: 0, y: 0 }, rooms: [] };
  state.currentFloor = 3;
  state.isOnSurface = false;
  state.player.x = 5;
  state.player.y = 5;
  return state;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('describeSight', () => {
  it('lists living enemies on visible tiles only, nearest first', () => {
    const far = createEnemy(EnemyType.SLIME, 9, 5, 3);
    const near = createEnemy(EnemyType.GOBLIN, 6, 6, 3);
    const hidden = createEnemy(EnemyType.BAT, 5, 3, 3);
    const dead = createEnemy(EnemyType.ORC, 4, 5, 3);
    dead.hp = 0;
    const state = arena('normal', [far, near, hidden, dead]);
    state.floor.tiles[3][5].visible = false;

    const sight = describeSight(state);
    expect(sight.map(e => e.id)).toEqual([near.id, far.id]);
    expect(sight.map(e => e.distance)).toEqual([1, 4]);
    expect(sight[0]).toMatchObject({ type: EnemyType.GOBLIN, char: 'g', hp: near.hp, maxHp: near.maxHp, status: StatusEffect.NONE });
  });

  it('keeps the floor order for enemies at the same distance', () => {
    const a = createEnemy(EnemyType.SLIME, 7, 5, 3);
    const b = createEnemy(EnemyType.BAT, 5, 7, 3);
    const c = createEnemy(EnemyType.GOBLIN, 3, 3, 3);
    expect(describeSight(arena('normal', [a, b, c])).map(e => e.id)).toEqual([a.id, b.id, c.id]);
  });

  it('reports each special ability the engine acts on, and the current status', () => {
    const enemies = [
      createEnemy(EnemyType.WORM, 6, 5, 3),
      createEnemy(EnemyType.IMP, 7, 5, 4),
      createEnemy(EnemyType.GHOST, 8, 5, 5),
      createEnemy(EnemyType.DRAGON, 9, 5, 10),
      createEnemy(EnemyType.SLIME, 10, 5, 3),
    ];
    enemies[4].status = StatusEffect.SLEEP;
    const sight = describeSight(arena('normal', enemies));
    expect(sight.map(e => e.traits)).toEqual([['eatsEggs'], ['canDisable'], ['canPassWalls'], ['resistsMagic'], []]);
    expect(sight[4].status).toBe(StatusEffect.SLEEP);
  });

  it('does not change the state it reads', () => {
    const state = arena('hard', [createEnemy(EnemyType.GOBLIN, 6, 5, 3)]);
    const before = JSON.stringify(state);
    describeSight(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('damage spans match what the engine rolls', () => {
  // Math.random at its lowest and (just under) its highest give the two ends of a damage roll.
  const ROLLS = [0, 0.999999];

  function playerHits(state: GameState, enemy: Enemy): number[] {
    return ROLLS.map(roll => {
      vi.spyOn(Math, 'random').mockReturnValue(roll);
      const next = processAction(state, { type: ActionType.MOVE, direction: Direction.RIGHT });
      vi.restoreAllMocks();
      return enemy.hp - next.floor.enemies.find(e => e.id === enemy.id)!.hp;
    });
  }

  function enemyHits(state: GameState): number[] {
    return ROLLS.map(roll => {
      vi.spyOn(Math, 'random').mockReturnValue(roll);
      const next = processAction(state, { type: ActionType.WAIT });
      vi.restoreAllMocks();
      return state.player.hp - next.player.hp;
    });
  }

  it('a player hit, with a weapon and a power-up', () => {
    const golem = createEnemy(EnemyType.GOLEM, 6, 5, 8);
    const state = arena('normal', [golem]);
    state.player.weapon = createWeapon(5);
    state.player.status = StatusEffect.POWERED_UP;
    state.player.statusTurns = 5;

    const span = damageDealtTo(state, golem);
    expect(span.max).toBeGreaterThan(span.min);
    expect(playerHits(state, golem)).toEqual([span.min, span.max]);
    expect(describeSight(state)[0].dealt).toEqual(span);
  });

  it('a player hit that armour reduces to the minimum of 1', () => {
    const golem = createEnemy(EnemyType.GOLEM, 6, 5, 10);
    golem.defense = 999;
    const state = arena('normal', [golem]);
    expect(damageDealtTo(state, golem)).toEqual({ min: 1, max: 1 });
    expect(playerHits(state, golem)).toEqual([1, 1]);
  });

  it('an enemy hit with the torch lit, armour included', () => {
    const orc = createEnemy(EnemyType.ORC, 6, 5, 8);
    orc.attack = 40;
    const state = arena('normal', [orc]);
    state.player.hp = state.player.maxHp = 500;
    state.player.armor = createArmor(1);

    const span = damageTakenFrom(state, orc);
    expect(span.max).toBeGreaterThan(span.min);
    expect(enemyHits(state)).toEqual([span.min, span.max]);
    expect(describeSight(state)[0].taken).toEqual(span);
  });

  it.each(['easy', 'normal', 'hard'] as const)('an enemy hit in the dark on %s', difficulty => {
    const orc = createEnemy(EnemyType.ORC, 6, 5, 8);
    orc.attack = 40;
    const state = arena(difficulty, [orc]);
    state.player.hp = state.player.maxHp = 500;
    const lit = damageTakenFrom(state, orc);
    state.player.torch = 0;

    const dark = damageTakenFrom(state, orc);
    expect(dark.min).toBeGreaterThan(lit.min);
    expect(enemyHits(state)).toEqual([dark.min, dark.max]);
  });
});

describe('SightPanel', () => {
  const render = (state: GameState, lang: 'en' | 'ja', open = true) =>
    renderToStaticMarkup(
      <SightPanel enemies={describeSight(state)} open={open} onToggle={() => {}} t={getMiniAdventureStrings(lang)} />,
    );
  const rows = (html: string) => html.match(/<li/g)?.length ?? 0;

  it('shows the letter, name, HP and both damage spans of an enemy in both languages', () => {
    const imp = createEnemy(EnemyType.IMP, 6, 5, 4);
    imp.hp = imp.maxHp - 1;
    imp.status = StatusEffect.CONFUSED;
    const state = arena('normal', [imp]);
    const [e] = describeSight(state);
    const range = (s: { min: number; max: number }) => (s.min === s.max ? `${s.min}` : `${s.min}–${s.max}`);

    const en = render(state, 'en');
    expect(en).toContain('>i</span>');
    expect(en).toContain('Imp');
    expect(en).toContain('Confused');
    expect(en).toContain(`HP ${imp.hp}/${imp.maxHp}`);
    expect(en).toContain(`Deal ${range(e.dealt)} · Take ${range(e.taken)} · Freezing scream`);

    const ja = render(state, 'ja');
    expect(ja).toContain('インプ');
    expect(ja).toContain('混乱');
    expect(ja).toContain(`与ダメ ${range(e.dealt)} · 被ダメ ${range(e.taken)} · 凍結の叫び`);
    expect(ja).not.toMatch(/Imp|Confused|Deal|Take|scream|In sight/);
  });

  it('lists only the nearest rows it has room for and says how many there are', () => {
    const enemies = [9, 8, 7, 6, 10].map(x => createEnemy(EnemyType.SLIME, x, 5, 2));
    const state = arena('normal', enemies);
    expect(enemies.length).toBeGreaterThan(SIGHT_MAX_ROWS);

    const en = render(state, 'en');
    expect(rows(en)).toBe(SIGHT_MAX_ROWS);
    expect(en).toContain(`nearest ${SIGHT_MAX_ROWS} of 5`);
    expect(render(state, 'ja')).toContain(`5体中 近い${SIGHT_MAX_ROWS}体`);

    state.floor.enemies = enemies.slice(0, 2);
    const two = render(state, 'en');
    expect(rows(two)).toBe(2);
    expect(two).not.toContain('nearest');
  });

  it('says so when nothing is in sight, and hides the body when collapsed', () => {
    const state = arena('normal', []);
    expect(render(state, 'en')).toContain('No enemies in sight.');
    expect(render(state, 'ja')).toContain('視界に敵はいません。');

    const closed = render(arena('normal', [createEnemy(EnemyType.SLIME, 6, 5, 2)]), 'en', false);
    expect(closed).toContain('aria-expanded="false"');
    expect(rows(closed)).toBe(0);
    expect(closed).toContain('In sight');
  });

  it('draws the HP bar as a share of max HP, and empty rather than broken if max HP were 0', () => {
    const slime = createEnemy(EnemyType.SLIME, 6, 5, 2);
    slime.maxHp = 8;
    slime.hp = 2;
    const state = arena('normal', [slime]);
    expect(render(state, 'en')).toContain('width:25%');

    slime.maxHp = 0;
    const broken = render(state, 'en');
    expect(broken).toContain('width:0%');
    expect(broken).not.toContain('NaN');
  });

  it('has a name for every enemy type, status and trait in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      const s = getMiniAdventureStrings(lang).sight;
      for (const type of Object.values(EnemyType)) expect(s.enemyNames[type], `${lang} ${type}`).toBeTruthy();
      for (const status of Object.values(StatusEffect)) {
        if (status !== StatusEffect.NONE) expect(s.status[status], `${lang} ${status}`).toBeTruthy();
      }
      for (const trait of ['resistsMagic', 'canPassWalls', 'eatsEggs', 'canDisable'] as const) {
        expect(s.traits[trait], `${lang} ${trait}`).toBeTruthy();
      }
    }
  });

  it('reserves a fixed body height for exactly the rows it can list', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/game/MiniAdventure/MiniAdventure.module.css'), 'utf8');
    const body = css.match(/\.sightBody \{[^}]*\}/)?.[0] ?? '';
    expect(body).toContain(`height: calc(${SIGHT_MAX_ROWS} * var(--ma-sight-row))`);
    const row = css.match(/\.sightRow \{[^}]*\}/)?.[0] ?? '';
    expect(row).toContain('height: var(--ma-sight-row)');
  });
});
