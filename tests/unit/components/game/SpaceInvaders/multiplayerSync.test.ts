/**
 * Multiplayer sync unit tests: network state serialization round-trip,
 * joiner-side snapshot application, joiner→host event reports, the joiner
 * frame update, and the co-op end condition.
 */
import { describe, it, expect } from 'vitest';
import {
  createGameState,
  updateGame,
  updateJoinerGame,
  pointsForEnemy,
  JOINER_RESPAWN_INVULN_MS,
} from '@/components/game/SpaceInvaders/GameEngine';
import {
  toNetworkGameState,
  applyNetworkGameState,
  applyJoinerReport,
  createPendingLocalEffects,
  isTeammateAlive,
  MultiplayerGameState,
  MultiplayerPlayer,
} from '@/components/game/SpaceInvaders/multiplayerTypes';
import {
  CANVAS_WIDTH,
  PLAYER_WIDTH,
  InputState,
  UFO_WIDTH,
  UFO_HEIGHT,
  GameState,
} from '@/components/game/SpaceInvaders/types';

const NO_INPUT: InputState = { left: false, right: false, shoot: false };

/** Simulate an RTDB round trip: JSON-serializable data, no undefined. */
function overWire(net: MultiplayerGameState): MultiplayerGameState {
  return JSON.parse(JSON.stringify(net)) as MultiplayerGameState;
}

function makeHostState(): GameState {
  const s = createGameState(1, 0, 3, 'normal');
  s.formation.enemies[7].active = false; // host killed one invader
  s.shields[1].blocks[3].active = false; // eroded shield block
  s.bullets = [
    { x: 100, y: 200, width: 4, height: 15, isEnemy: false }, // host's shot
    { x: 300, y: 400, width: 4, height: 20, isEnemy: true },  // enemy fire
  ];
  s.ufo = { x: 50, y: 30, width: UFO_WIDTH, height: UFO_HEIGHT, direction: 1, points: 100, active: true };
  s.score = 170;
  return s;
}

function makePlayer(overrides: Partial<MultiplayerPlayer> = {}): MultiplayerPlayer {
  return { id: 'p2', name: 'Ann', ready: true, lastUpdate: 0, ...overrides };
}

describe('toNetworkGameState / applyNetworkGameState round trip', () => {
  it('carries the shared entities to the joiner and preserves the joiner-owned state', () => {
    const host = makeHostState();
    const net = overWire(toNetworkGameState(host));

    const joiner = createGameState(1, 0, 2, 'normal');
    joiner.score = 50;
    joiner.player.x = 123;
    joiner.bullets = [{ x: 10, y: 500, width: 4, height: 15, isEnemy: false }]; // own shot

    applyNetworkGameState(joiner, net);

    // Shared entities mirror the host
    expect(joiner.formation.enemies).toHaveLength(host.formation.enemies.length);
    expect(joiner.formation.enemies[7].active).toBe(false);
    expect(joiner.formation.enemies[0].x).toBeCloseTo(host.formation.enemies[0].x);
    expect(joiner.formation.enemies[0].config).toBeDefined();
    expect(joiner.shields[1].blocks[3].active).toBe(false);
    expect(joiner.ufo).not.toBeNull();
    expect(joiner.ufo!.x).toBe(50);
    expect(joiner.ufo!.width).toBe(UFO_WIDTH);

    // Remote bullets are tagged; the joiner's own bullet survives
    const remote = joiner.bullets.filter(b => b.remote);
    const own = joiner.bullets.filter(b => !b.remote);
    expect(remote).toHaveLength(2);
    expect(remote.some(b => b.isEnemy)).toBe(true);
    expect(own).toHaveLength(1);
    expect(own[0].x).toBe(10);

    // Joiner-owned state is untouched
    expect(joiner.score).toBe(50);
    expect(joiner.lives).toBe(2);
    expect(joiner.player.x).toBe(123);
    expect(joiner.gameOver).toBe(false);
  });

  it('tolerates RTDB-stripped empty containers', () => {
    const host = makeHostState();
    host.bullets = [];
    host.ufo = null;
    const net = overWire(toNetworkGameState(host));
    // RTDB drops empty arrays and null values entirely
    delete (net as Partial<MultiplayerGameState>).bullets;
    delete (net as Partial<MultiplayerGameState>).ufo;

    const joiner = createGameState(1, 0, 3, 'normal');
    applyNetworkGameState(joiner, net);

    expect(joiner.bullets).toHaveLength(0);
    expect(joiner.ufo).toBeNull();
    expect(joiner.formation.enemies.length).toBeGreaterThan(0);
  });

  it('propagates the host-declared game over', () => {
    const host = makeHostState();
    host.gameOver = true;
    const joiner = createGameState(1, 0, 3, 'normal');
    applyNetworkGameState(joiner, overWire(toNetworkGameState(host)));
    expect(joiner.gameOver).toBe(true);
  });

  it('keeps locally-killed targets dead until the host confirms, then prunes', () => {
    const host = makeHostState();
    const joiner = createGameState(1, 0, 3, 'normal');
    const pending = createPendingLocalEffects(1);
    pending.killedEnemies.add(5);
    pending.destroyedBlocks.add('0_2');

    // Host hasn't seen the kill yet — snapshot says alive, pending wins
    applyNetworkGameState(joiner, overWire(toNetworkGameState(host)), pending);
    expect(joiner.formation.enemies[5].active).toBe(false);
    expect(joiner.shields[0].blocks[2].active).toBe(false);
    expect(pending.killedEnemies.has(5)).toBe(true);

    // Host confirms — pending entry is pruned
    host.formation.enemies[5].active = false;
    host.shields[0].blocks[2].active = false;
    applyNetworkGameState(joiner, overWire(toNetworkGameState(host)), pending);
    expect(joiner.formation.enemies[5].active).toBe(false);
    expect(pending.killedEnemies.size).toBe(0);
    expect(pending.destroyedBlocks.size).toBe(0);
  });

  it('resets pending effects and own bullets on a wave change', () => {
    const host = makeHostState();
    host.level = 2;
    const joiner = createGameState(1, 0, 3, 'normal');
    joiner.bullets = [{ x: 10, y: 500, width: 4, height: 15, isEnemy: false }];
    joiner.player.x = 42;
    const pending = createPendingLocalEffects(1);
    pending.killedEnemies.add(9);
    pending.ufoKilled = true;

    applyNetworkGameState(joiner, overWire(toNetworkGameState(host)), pending);

    expect(joiner.level).toBe(2);
    expect(pending.level).toBe(2);
    expect(pending.killedEnemies.size).toBe(0);
    expect(joiner.bullets.every(b => b.remote)).toBe(true); // own bullets cleared
    expect(joiner.player.x).toBe((CANVAS_WIDTH - PLAYER_WIDTH) / 2); // recentered
  });

  it('suppresses a locally-killed UFO until the host removes it', () => {
    const host = makeHostState();
    const joiner = createGameState(1, 0, 3, 'normal');
    const pending = createPendingLocalEffects(1);
    pending.ufoKilled = true;

    applyNetworkGameState(joiner, overWire(toNetworkGameState(host)), pending);
    expect(joiner.ufo).toBeNull();
    expect(pending.ufoKilled).toBe(true); // host snapshot still had a UFO

    host.ufo = null;
    const net = overWire(toNetworkGameState(host));
    delete (net as Partial<MultiplayerGameState>).ufo;
    applyNetworkGameState(joiner, net, pending);
    expect(pending.ufoKilled).toBe(false); // confirmed
  });
});

describe('applyJoinerReport (host side)', () => {
  it('applies kills and shield hits idempotently without granting the host points', () => {
    const host = makeHostState();
    const scoreBefore = host.score;
    const report = { level: 1, kills: { e3: true, e7: true }, shieldHits: { s0_1: true } };

    applyJoinerReport(host, report, 0);
    expect(host.formation.enemies[3].active).toBe(false);
    expect(host.formation.enemies[7].active).toBe(false); // was already dead — no-op
    expect(host.shields[0].blocks[1].active).toBe(false);
    expect(host.score).toBe(scoreBefore);

    // Re-applying the same report changes nothing
    applyJoinerReport(host, report, 0);
    expect(host.formation.enemies.filter(e => !e.active)).toHaveLength(2);
  });

  it('ignores reports from another wave', () => {
    const host = makeHostState();
    applyJoinerReport(host, { level: 2, kills: { e0: true } }, 0);
    expect(host.formation.enemies[0].active).toBe(true);
  });

  it('removes the UFO only when the kill counter advances', () => {
    const host = makeHostState();
    let applied = applyJoinerReport(host, { level: 1, ufoKills: 1 }, 0);
    expect(host.ufo).toBeNull();
    expect(applied).toBe(1);

    // Same counter again: a newly spawned UFO must survive
    host.ufo = { x: 0, y: 30, width: UFO_WIDTH, height: UFO_HEIGHT, direction: 1, points: 50, active: true };
    applied = applyJoinerReport(host, { level: 1, ufoKills: 1 }, applied);
    expect(host.ufo).not.toBeNull();
    expect(applied).toBe(1);
  });

  it('ignores a missing report', () => {
    const host = makeHostState();
    expect(applyJoinerReport(host, null, 3)).toBe(3);
    expect(applyJoinerReport(host, undefined, 3)).toBe(3);
  });
});

describe('co-op end condition', () => {
  it('isTeammateAlive treats unreported lives as alive and missing teammates as dead', () => {
    expect(isTeammateAlive(null)).toBe(false);
    expect(isTeammateAlive(undefined)).toBe(false);
    expect(isTeammateAlive(makePlayer())).toBe(true); // no lives reported yet
    expect(isTeammateAlive(makePlayer({ lives: 2 }))).toBe(true);
    expect(isTeammateAlive(makePlayer({ lives: 0 }))).toBe(false);
  });

  it('keeps the shared sim running while the teammate is alive', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.lives = 0;
    const tickBefore = s.animationTick;
    const xBefore = s.player.x;
    const sounds = updateGame(s, { left: false, right: true, shoot: true }, 16.67, 1000, { teammateAlive: true });
    expect(s.gameOver).toBe(false);
    expect(sounds.gameOver).toBe(false);
    expect(s.animationTick).toBe(tickBefore + 1); // sim advanced
    expect(s.player.x).toBe(xBefore); // dead ship ignores input
    expect(s.bullets.some(b => !b.isEnemy)).toBe(false); // dead ship can't shoot
  });

  it('ends the game once both ships are out', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.lives = 0;
    const sounds = updateGame(s, NO_INPUT, 16.67, 1000, { teammateAlive: false });
    expect(s.gameOver).toBe(true);
    expect(sounds.gameOver).toBe(true);
  });

  it('a lethal hit does not end the game while the teammate is alive', () => {
    const s = createGameState(1, 0, 1, 'normal');
    s.bullets = [{
      x: s.player.x + s.player.width / 2,
      y: s.player.y + s.player.height / 2,
      width: 4, height: 20, isEnemy: true,
    }];
    updateGame(s, NO_INPUT, 16.67, 1000, { teammateAlive: true });
    expect(s.lives).toBe(0);
    expect(s.gameOver).toBe(false);
  });
});

describe('updateJoinerGame', () => {
  it('resolves an own-bullet invader kill locally and reports it', () => {
    const s = createGameState(1, 0, 3, 'normal');
    const target = s.formation.enemies[0];
    s.bullets = [{
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
      width: 4, height: 15, isEnemy: false,
    }];
    const { events } = updateJoinerGame(s, NO_INPUT, 16.67, 1000);
    expect(target.active).toBe(false);
    expect(s.score).toBe(pointsForEnemy(target.type));
    expect(events.kills).toEqual([0]);
  });

  it('never spawns enemy fire or UFOs (host-owned randomness)', () => {
    const s = createGameState(1, 0, 3, 'normal');
    for (let i = 0; i < 300; i++) {
      updateJoinerGame(s, NO_INPUT, 16.67, 1000 + i * 16);
    }
    expect(s.bullets.filter(b => b.isEnemy)).toHaveLength(0);
    expect(s.ufo).toBeNull();
  });

  it('a remote enemy bullet hits the ship, starts invulnerability, and never sets gameOver', () => {
    const s = createGameState(1, 0, 1, 'normal');
    s.bullets = [{
      x: s.player.x + s.player.width / 2,
      y: s.player.y + s.player.height / 2,
      width: 4, height: 20, isEnemy: true, remote: true,
    }];
    const { sounds } = updateJoinerGame(s, NO_INPUT, 16.67, 1000);
    expect(s.lives).toBe(0);
    expect(sounds.playerHit).toBe(true);
    expect(s.gameOver).toBe(false); // the host decides when the game ends
  });

  it('sets a respawn invulnerability window when lives remain', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.bullets = [{
      x: s.player.x + s.player.width / 2,
      y: s.player.y + s.player.height / 2,
      width: 4, height: 20, isEnemy: true, remote: true,
    }];
    updateJoinerGame(s, NO_INPUT, 16.67, 1000);
    expect(s.lives).toBe(2);
    expect(s.invulnUntil).toBe(1000 + JOINER_RESPAWN_INVULN_MS);

    // A hit during the window is ignored
    s.bullets = [{
      x: s.player.x + s.player.width / 2,
      y: s.player.y + s.player.height / 2,
      width: 4, height: 20, isEnemy: true, remote: true,
    }];
    updateJoinerGame(s, NO_INPUT, 16.67, 1200);
    expect(s.lives).toBe(2);
  });

  it("the host's mirrored bullets never destroy invaders on the joiner", () => {
    const s = createGameState(1, 0, 3, 'normal');
    const target = s.formation.enemies[0];
    s.bullets = [{
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
      width: 4, height: 15, isEnemy: false, remote: true,
    }];
    const { events } = updateJoinerGame(s, NO_INPUT, 16.67, 1000);
    expect(target.active).toBe(true);
    expect(events.kills).toHaveLength(0);
    expect(s.score).toBe(0);
  });

  it('the one-bullet rule counts only own bullets', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.bullets = [{ x: 100, y: 100, width: 4, height: 15, isEnemy: false, remote: true }];
    updateJoinerGame(s, { left: false, right: false, shoot: true }, 16.67, 1000);
    expect(s.bullets.filter(b => !b.isEnemy && !b.remote)).toHaveLength(1); // fired despite host's bullet on screen

    // ...but a second own shot is still blocked
    updateJoinerGame(s, { left: false, right: false, shoot: true }, 16.67, 2000);
    expect(s.bullets.filter(b => !b.isEnemy && !b.remote)).toHaveLength(1);
  });

  it('extrapolates the formation along the published velocity', () => {
    const s = createGameState(1, 0, 3, 'normal');
    const xBefore = s.formation.enemies[0].x;
    updateJoinerGame(s, NO_INPUT, 16.67, 1000);
    expect(s.formation.enemies[0].x).toBeGreaterThan(xBefore);
  });

  it('reports shield erosion from own bullets', () => {
    const s = createGameState(1, 0, 3, 'normal');
    const block = s.shields[0].blocks[0];
    s.bullets = [{ x: block.x, y: block.y, width: 4, height: 15, isEnemy: false }];
    const { events } = updateJoinerGame(s, NO_INPUT, 16.67, 1000);
    expect(block.active).toBe(false);
    expect(events.shieldHits).toEqual(['0_0']);
  });

  it('resolves a UFO kill locally and reports it', () => {
    const s = createGameState(1, 0, 3, 'normal');
    s.ufo = { x: 200, y: 30, width: UFO_WIDTH, height: UFO_HEIGHT, direction: 1, points: 150, active: true };
    s.bullets = [{ x: 210, y: 35, width: 4, height: 15, isEnemy: false }];
    const { events } = updateJoinerGame(s, NO_INPUT, 16.67, 1000);
    expect(s.ufo).toBeNull();
    expect(s.score).toBe(150);
    expect(events.ufoKilled).toBe(true);
  });
});
