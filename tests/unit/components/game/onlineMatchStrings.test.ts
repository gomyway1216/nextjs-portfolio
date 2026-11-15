import { describe, expect, it } from 'vitest';

import { getDaifugoLobbyStrings } from '@/components/game/Daifugo/lobbyStrings';
import { formatDoubtLog, getDoubtLobbyStrings, getDoubtStrings } from '@/components/game/Doubt/i18n';
import type { DoubtLogEntry } from '@/components/game/Doubt/multiplayerTypes';
import {
  formatShichinarabeLog,
  getShichinarabeLobbyStrings,
  getShichinarabeStrings,
} from '@/components/game/Shichinarabe/i18n';
import type { ShichinarabeLogEntry } from '@/components/game/Shichinarabe/multiplayerTypes';

// The online match screens' own strings (the rest are shared with the vs-AI tables). Every one must exist, filled in,
// in both languages, and the Japanese must not be the English left in place.

/** A string, or what a string function gives for sample arguments. */
function sample(value: unknown): string {
  if (typeof value === 'function') return String((value as (...args: unknown[]) => unknown)(3, 'K7Q2'));
  return String(value);
}

const MATCH_KEYS = {
  Shichinarabe: {
    get: getShichinarabeLobbyStrings,
    keys: ['roomBadge', 'matchTitle', 'playerCount', 'lastPlayed', 'cardNotInHand', 'cardNotAdjacent',
      'needPlayers', 'startFailed', 'moveRejected', 'passRejected'] as const,
  },
  Doubt: {
    get: getDoubtLobbyStrings,
    keys: ['roomBadge', 'matchTitle', 'phase', 'cardNotInHand', 'notPlayPhase', 'needPlayers', 'startFailed',
      'playRejected', 'acceptRejected', 'doubtRejected', 'gameFinished'] as const,
  },
  Daifugo: {
    get: getDaifugoLobbyStrings,
    keys: ['roomBadge', 'startFailed', 'playRejected', 'passRejected'] as const,
  },
};

describe.each(Object.entries(MATCH_KEYS))('%s online match strings', (_name, { get, keys }) => {
  const ja = get('ja') as unknown as Record<string, unknown>;
  const en = get('en') as unknown as Record<string, unknown>;

  it.each(keys)('%s exists in Japanese and English', (key) => {
    expect(sample(en[key]).trim().length).toBeGreaterThan(0);
    expect(sample(ja[key]).trim().length).toBeGreaterThan(0);
    expect(sample(ja[key])).not.toBe(sample(en[key]));
    // No English words left in the Japanese (the room code and a card label are data, not words).
    expect(sample(ja[key]).replace('K7Q2', '')).not.toMatch(/[A-Za-z]{2,}/);
  });

  it("translates the room hook's own 'No room' message, and leaves a server's message for the caller to show", () => {
    expect((ja.errors as Record<string, string>)['No room']).toBe('ルームに入っていません');
    expect((ja.errors as Record<string, string>)['Network error']).toBeTruthy();
    expect((ja.errors as Record<string, string>)['Card is not playable']).toBeUndefined();
  });
});

describe('Doubt log', () => {
  const names: Record<string, string> = { a: 'Aki', b: 'Ben' };
  const nameOf = (id: string) => names[id] ?? id;
  const entry = (e: Partial<DoubtLogEntry>): DoubtLogEntry => ({ id: 'x', type: 'play', playerId: 'a', timestamp: 0, ...e });

  it('shows the opening entry ("Game started") in the page language, not the engine\'s English', () => {
    const start = entry({ type: 'start', detail: 'Game started' });
    expect(formatDoubtLog(getDoubtStrings('ja'), start, nameOf)).toBe('ゲーム開始');
    expect(formatDoubtLog(getDoubtStrings('en'), start, nameOf)).toBe('Game started');
  });

  it('never shows an engine detail in Japanese', () => {
    const ja = getDoubtStrings('ja');
    const lines = [
      entry({ type: 'play', declaredRank: 11, count: 2 }),
      entry({ type: 'accept', detail: 'Auto-accepted (no challengers)' }),
      entry({ type: 'doubt', playerId: 'b' }),
      entry({ type: 'resolve', playerId: 'b', claimTruth: false, pileTakerId: 'a', detail: 'Lie (claimant takes pile)' }),
      entry({ type: 'resolve', detail: 'Player finished' }),
      entry({ type: 'finish', detail: 'Game finished' }),
    ].map((e) => formatDoubtLog(ja, e, nameOf));
    expect(lines).toEqual([
      'Aki が J を 2 枚出した',
      'Aki が受け入れた',
      'Ben がダウト！',
      '嘘！ — Aki が山札を引き取り',
      'Aki が上がり',
      'Aki が上がり',
    ]);
  });
});

describe('Shichinarabe log', () => {
  const entry = (e: Partial<ShichinarabeLogEntry>): ShichinarabeLogEntry => ({ id: 'x', type: 'play', playerId: 'a', timestamp: 0, ...e });

  it('shows every kind of entry in Japanese, with the engine\'s English details resolved', () => {
    const ja = getShichinarabeStrings('ja');
    const lines = [
      entry({ type: 'start', detail: 'Game started' }),
      entry({ card: { suit: 'S', rank: 8 } }),
      entry({ type: 'pass', passCount: 2 }),
      entry({ type: 'eliminate', detail: 'Eliminated (pass limit)' }),
      entry({ card: { suit: 'C', rank: 6 }, detail: 'Revealed on elimination' }),
      entry({ type: 'finish', detail: 'Game finished' }),
    ].map((e) => formatShichinarabeLog(ja, e, 'Aki', 3));
    expect(lines).toEqual([
      'ゲーム開始',
      'Aki が 8♠ を出しました',
      'Aki がパス（2/3）',
      'Aki が脱落しました',
      'Aki の 6♣ が場に出ました',
      'ゲーム終了',
    ]);
  });
});
