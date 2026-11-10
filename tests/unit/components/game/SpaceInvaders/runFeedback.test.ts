import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  createGameState,
  crossedMarchBeat,
  nextLevel,
  updateGame,
  updateJoinerGame,
} from '@/components/game/SpaceInvaders/GameEngine';
import {
  BULLET_HEIGHT,
  BULLET_WIDTH,
  CANVAS_WIDTH,
  EnemyType,
  GameState,
  InputState,
  UFO_HEIGHT,
  UFO_WIDTH,
  createSoundEvents,
} from '@/components/game/SpaceInvaders/types';
import {
  BURST_MS,
  Effect,
  MAX_EFFECTS,
  POPUP_MS,
  captureFormation,
  createFormationSnapshot,
  destroyedSince,
  effectProgress,
  spawnBurst,
  spawnPopup,
  stepEffects,
} from '@/components/game/SpaceInvaders/effects';
import {
  accuracyPercent,
  createRunStats,
  formatDuration,
  recordFrame,
  totalKills,
} from '@/components/game/SpaceInvaders/runStats';
import { applyNetworkGameState, toNetworkGameState } from '@/components/game/SpaceInvaders/multiplayerTypes';

const NO_INPUT: InputState = { left: false, right: false, shoot: false };
const FRAME_60 = 16.67;

/** Put a player bullet squarely inside the given invader. */
function aimBulletAt(state: GameState, index: number): void {
  const enemy = state.formation.enemies[index];
  state.bullets.push({
    x: enemy.x + enemy.width / 2 - BULLET_WIDTH / 2,
    y: enemy.y + enemy.height / 2,
    width: BULLET_WIDTH,
    height: BULLET_HEIGHT,
    isEnemy: false,
  });
}

function addUfo(state: GameState, points: number): void {
  state.ufo = { x: 300, y: 30, width: UFO_WIDTH, height: UFO_HEIGHT, direction: 1, points, active: true };
  state.bullets.push({
    x: 300 + UFO_WIDTH / 2,
    y: 30 + UFO_HEIGHT / 2,
    width: BULLET_WIDTH,
    height: BULLET_HEIGHT,
    isEnemy: false,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('frame events for own hits', () => {
  it('reports the type of the invader the bullet destroyed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = createGameState(1, 0, 3, 'normal');
    aimBulletAt(state, 0);
    const events = updateGame(state, NO_INPUT, FRAME_60, 1000);
    expect(events.enemyHit).toBe(true);
    expect(events.enemyHitType).toBe(EnemyType.SQUID);
    expect(events.ufoHitPoints).toBe(0);
  });

  it('reports the bonus when the bullet destroys the UFO', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = createGameState(1, 0, 3, 'normal');
    addUfo(state, 150);
    const events = updateGame(state, NO_INPUT, FRAME_60, 1000);
    expect(events.ufoHit).toBe(true);
    expect(events.ufoHitPoints).toBe(150);
    expect(events.enemyHitType).toBeNull();
  });

  it('reports nothing on a frame without a hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = createGameState(1, 0, 3, 'normal');
    const events = updateGame(state, NO_INPUT, FRAME_60, 1000);
    expect(events.enemyHitType).toBeNull();
    expect(events.ufoHitPoints).toBe(0);
  });

  it('reports the same for a co-op joiner', () => {
    const state = createGameState(1, 0, 3, 'normal');
    aimBulletAt(state, state.formation.enemies.length - 1);
    const hit = updateJoinerGame(state, NO_INPUT, FRAME_60, 1000);
    expect(hit.sounds.enemyHitType).toBe(EnemyType.OCTOPUS);

    addUfo(state, 300);
    const ufo = updateJoinerGame(state, NO_INPUT, FRAME_60, 1017);
    expect(ufo.sounds.ufoHitPoints).toBe(300);
  });
});

describe('march cadence is independent of the display refresh rate', () => {
  it('detects a beat by crossing a multiple of the interval', () => {
    expect(crossedMarchBeat(47, 48, 48)).toBe(true);
    expect(crossedMarchBeat(47.5, 48.5, 48)).toBe(true);
    expect(crossedMarchBeat(48, 48.5, 48)).toBe(false);
    expect(crossedMarchBeat(10, 10.5, 48)).toBe(false);
    // A slow frame that skips past the exact tick still counts once.
    expect(crossedMarchBeat(46, 49.5, 48)).toBe(true);
    expect(crossedMarchBeat(0, 5, 0)).toBe(false);
  });

  function marchBeats(frameMs: number, totalMs: number): { beats: number; tick: number } {
    const state = createGameState(1, 0, 3, 'normal');
    let beats = 0;
    for (let elapsed = 0; elapsed < totalMs; elapsed += frameMs) {
      if (updateGame(state, NO_INPUT, frameMs, elapsed).enemyMarch) beats++;
    }
    return { beats, tick: state.animationTick };
  }

  it('marches as often at 120 Hz and 30 Hz as at 60 Hz', () => {
    // No enemy fire and no UFO, so the formation stays full throughout.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const at60 = marchBeats(FRAME_60, 4000);
    const at120 = marchBeats(FRAME_60 / 2, 4000);
    const at30 = marchBeats(FRAME_60 * 2, 4000);
    expect(at60.beats).toBeGreaterThan(2);
    expect(Math.abs(at120.beats - at60.beats)).toBeLessThanOrEqual(1);
    expect(Math.abs(at30.beats - at60.beats)).toBeLessThanOrEqual(1);
    expect(at120.tick).toBeCloseTo(at60.tick, 0);
    expect(at30.tick).toBeCloseTo(at60.tick, 0);
  });
});

describe('run stats', () => {
  it('starts empty', () => {
    const stats = createRunStats();
    expect(stats.shots).toBe(0);
    expect(totalKills(stats)).toBe(0);
    expect(accuracyPercent(stats)).toBeNull();
  });

  it('tallies shots, kills by type, UFOs and play time', () => {
    const stats = createRunStats();
    recordFrame(stats, { ...createSoundEvents(), playerShoot: true }, 16);
    recordFrame(stats, { ...createSoundEvents(), enemyHit: true, enemyHitType: EnemyType.CRAB }, 16);
    recordFrame(stats, { ...createSoundEvents(), playerShoot: true }, 16);
    recordFrame(stats, { ...createSoundEvents(), ufoHit: true, ufoHitPoints: 300 }, 16);
    recordFrame(stats, { ...createSoundEvents(), playerShoot: true }, 16);
    recordFrame(stats, createSoundEvents(), 0);

    expect(stats.shots).toBe(3);
    expect(stats.hits).toBe(2);
    expect(stats.kills[EnemyType.CRAB]).toBe(1);
    expect(stats.kills[EnemyType.SQUID]).toBe(0);
    expect(totalKills(stats)).toBe(1);
    expect(stats.ufos).toBe(1);
    expect(stats.ufoPoints).toBe(300);
    expect(stats.activeMs).toBe(80);
    expect(accuracyPercent(stats)).toBe(67);
  });

  it('counts an enemy bullet hitting the ship as neither a shot nor a hit', () => {
    const stats = createRunStats();
    recordFrame(stats, { ...createSoundEvents(), playerHit: true, enemyShoot: true }, 16);
    expect(stats.shots).toBe(0);
    expect(stats.hits).toBe(0);
  });

  it('never rounds accuracy to a misleading 0% or 100%', () => {
    const stats = createRunStats();
    stats.shots = 1000;
    stats.hits = 1;
    expect(accuracyPercent(stats)).toBe(1);
    stats.hits = 999;
    expect(accuracyPercent(stats)).toBe(99);
    stats.hits = 1000;
    expect(accuracyPercent(stats)).toBe(100);
    stats.hits = 0;
    expect(accuracyPercent(stats)).toBe(0);
  });

  it('matches the engine over a real shot', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = createGameState(1, 0, 3, 'normal');
    const stats = createRunStats();
    // Aim straight up a column that has an invader above the ship.
    const target = state.formation.enemies[state.formation.enemies.length - 6];
    state.player.x = target.x + target.width / 2 - state.player.width / 2;
    state.formation.speed = 0;
    let now = 1000;
    recordFrame(stats, updateGame(state, { left: false, right: false, shoot: true }, FRAME_60, now), FRAME_60);
    for (let i = 0; i < 120 && stats.hits === 0; i++) {
      now += FRAME_60;
      recordFrame(stats, updateGame(state, NO_INPUT, FRAME_60, now), FRAME_60);
    }
    expect(stats.shots).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.kills[EnemyType.OCTOPUS]).toBe(1);
    expect(accuracyPercent(stats)).toBe(100);
  });

  it('formats play time as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9_999)).toBe('0:09');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('62:05');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('effects', () => {
  it('ages effects and drops them when their life is over', () => {
    const effects: Effect[] = [];
    spawnBurst(effects, 10, 10, '#fff');
    spawnPopup(effects, 100, 100, '+30', '#fff');
    stepEffects(effects, BURST_MS - 1);
    expect(effects).toHaveLength(2);
    expect(effectProgress(effects[0])).toBeCloseTo((BURST_MS - 1) / BURST_MS);
    stepEffects(effects, 1);
    expect(effects.map(e => e.kind)).toEqual(['popup']);
    stepEffects(effects, POPUP_MS);
    expect(effects).toHaveLength(0);
  });

  it('lasts the same simulated time however the frames are sliced', () => {
    const coarse: Effect[] = [];
    const fine: Effect[] = [];
    spawnBurst(coarse, 0, 0, '#fff');
    spawnBurst(fine, 0, 0, '#fff');
    for (let i = 0; i < 9; i++) stepEffects(coarse, 33.34);
    for (let i = 0; i < 36; i++) stepEffects(fine, 8.335);
    expect(coarse).toHaveLength(1);
    expect(fine).toHaveLength(1);
    expect(fine[0].age).toBeCloseTo(coarse[0].age, 5);
  });

  it('does not age effects on a zero-length frame', () => {
    const effects: Effect[] = [];
    spawnBurst(effects, 0, 0, '#fff');
    stepEffects(effects, 0);
    expect(effects[0].age).toBe(0);
  });

  it('keeps pop-ups on screen and caps the number of live effects', () => {
    const effects: Effect[] = [];
    spawnPopup(effects, -40, -10, '+300', '#fff');
    spawnPopup(effects, CANVAS_WIDTH + 40, 50, '+300', '#fff');
    expect(effects[0].x).toBeGreaterThan(0);
    expect(effects[0].y).toBeGreaterThan(0);
    expect(effects[1].x).toBeLessThan(CANVAS_WIDTH);

    for (let i = 0; i < MAX_EFFECTS + 10; i++) spawnBurst(effects, i, 0, '#fff');
    expect(effects).toHaveLength(MAX_EFFECTS);
    expect(effects[effects.length - 1].x).toBe(MAX_EFFECTS + 9);
  });
});

describe('destroyedSince', () => {
  it('finds the invader destroyed during the frame, at its pre-frame centre', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = createGameState(1, 0, 3, 'normal');
    const snapshot = createFormationSnapshot();
    const target = state.formation.enemies[12];
    const centre = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    aimBulletAt(state, 12);

    captureFormation(state, snapshot);
    updateGame(state, NO_INPUT, FRAME_60, 1000);

    expect(destroyedSince(snapshot, state)).toEqual([{ ...centre, type: EnemyType.CRAB }]);

    // Already gone at the start of the next frame, so not reported twice.
    captureFormation(state, snapshot);
    updateGame(state, NO_INPUT, FRAME_60, 1017);
    expect(destroyedSince(snapshot, state)).toEqual([]);
  });

  it('still reports the shot that cleared the wave', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = createGameState(1, 0, 3, 'normal');
    state.formation.enemies.forEach((e, i) => { e.active = i === 3; });
    const snapshot = createFormationSnapshot();
    aimBulletAt(state, 3);

    captureFormation(state, snapshot);
    updateGame(state, NO_INPUT, FRAME_60, 1000); // destroys the last invader
    expect(destroyedSince(snapshot, state)).toHaveLength(1);

    captureFormation(state, snapshot);
    updateGame(state, NO_INPUT, FRAME_60, 1017); // wave rolls over
    expect(state.level).toBe(2);
    expect(destroyedSince(snapshot, state)).toEqual([]);
  });

  it('does not mistake a fresh wave for destroyed invaders', () => {
    const state = createGameState(1, 0, 3, 'normal');
    const snapshot = createFormationSnapshot();
    captureFormation(state, snapshot);
    nextLevel(state);
    expect(destroyedSince(snapshot, state)).toEqual([]);
  });

  it('sees a teammate kill that arrives in a host snapshot', () => {
    const host = createGameState(1, 0, 3, 'normal');
    const joiner = createGameState(1, 0, 3, 'normal');
    applyNetworkGameState(joiner, toNetworkGameState(host));

    const snapshot = createFormationSnapshot();
    captureFormation(joiner, snapshot);
    host.formation.enemies[20].active = false;
    applyNetworkGameState(joiner, toNetworkGameState(host));

    const destroyed = destroyedSince(snapshot, joiner);
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0].type).toBe(host.formation.enemies[20].type);
  });
});
