import { beforeEach, describe, expect, it, vi } from 'vitest';

// The service reaches for the Firebase client SDK to attach an ID token when
// one exists. None of the behaviour under test depends on a real user.
vi.mock('@/lib/firebaseConnect', () => ({ auth: { currentUser: null } }));

import {
  claimGameRecord,
  resetSubmittedGameRecords,
  submitShogiGameRecord,
} from '@/services/shogiGameRecordService';
import type { ShogiGameRecordPayload } from '@/components/game/ShogiImproved/gameRecord';

const GAME_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const GAME_B = '9c858901-8a57-4791-81fe-4c455b099bc9';

function payload(overrides: Partial<ShogiGameRecordPayload> = {}): ShogiGameRecordPayload {
  return {
    schema: 'shogi-game-record-v1',
    game_id: GAME_A,
    difficulty: 'medium',
    handicap: 'none',
    outcome: 'player_win',
    end_reason: 'checkmate',
    move_count: 1,
    moves_usi: ['7g7f'],
    kifu: '1. ▲７六歩',
    book_exit_ply: null,
    engine: null,
    started_at: '2026-08-22T11:00:00.000Z',
    ended_at: '2026-08-22T11:10:00.000Z',
    ...overrides,
  };
}

describe('claimGameRecord', () => {
  beforeEach(() => {
    resetSubmittedGameRecords();
  });

  it('lets a game report its result exactly once', () => {
    expect(claimGameRecord(GAME_A, 'final')).toBe(true);
    expect(claimGameRecord(GAME_A, 'final')).toBe(false);
  });

  it('lets a game report abandonment exactly once', () => {
    // pagehide, visibilitychange and unmount all mean the same thing and can
    // fire in sequence; only the first may send.
    expect(claimGameRecord(GAME_A, 'abandoned')).toBe(true);
    expect(claimGameRecord(GAME_A, 'abandoned')).toBe(false);
    expect(claimGameRecord(GAME_A, 'abandoned')).toBe(false);
  });

  it('still sends the result of a game that was reported abandoned first', () => {
    // Switching tabs mid-game and coming back to win is normal play. The
    // result overwrites the partial record (same document id server-side).
    expect(claimGameRecord(GAME_A, 'abandoned')).toBe(true);
    expect(claimGameRecord(GAME_A, 'final')).toBe(true);
  });

  it('refuses to file a finished game as abandoned afterwards', () => {
    // The unmount that follows a checkmate must not downgrade the record.
    expect(claimGameRecord(GAME_A, 'final')).toBe(true);
    expect(claimGameRecord(GAME_A, 'abandoned')).toBe(false);
  });

  it('tracks each game separately', () => {
    expect(claimGameRecord(GAME_A, 'final')).toBe(true);
    expect(claimGameRecord(GAME_B, 'final')).toBe(true);
    expect(claimGameRecord(GAME_B, 'abandoned')).toBe(false);
  });
});

describe('submitShogiGameRecord', () => {
  beforeEach(() => {
    resetSubmittedGameRecords();
    vi.unstubAllGlobals();
    // The service no-ops during SSR, so these tests need a window to exist.
    vi.stubGlobal('window', {});
  });

  it('posts the record as JSON to the shogi records endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitShogiGameRecord(payload());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/game/shogi/records');
    expect(init.method).toBe('POST');
    // keepalive matters: the abandonment path can fire as the tab is hiding.
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body);
    expect(body.game_id).toBe(GAME_A);
    expect(body.moves_usi).toEqual(['7g7f']);
    // Build metadata is filled in here so callers do not have to.
    expect(typeof body.app_version).toBe('string');
    expect(typeof body.app_build_sha).toBe('string');
  });

  it('uses sendBeacon when the page is going away', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { sendBeacon: beacon });

    const sent = await submitShogiGameRecord(payload(), { unloading: true });

    expect(sent).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
    // fetch would be cancelled by the unload; the beacon is the whole point.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(beacon.mock.calls[0][0]).toBe('/api/game/shogi/records');
  });

  it('swallows a failed upload — the game must not break over a saved kifu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(submitShogiGameRecord(payload())).resolves.toBe(false);
  });

  it('falls back to a keepalive fetch when sendBeacon refuses to queue', async () => {
    const beacon = vi.fn().mockReturnValue(false);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const sent = await submitShogiGameRecord(payload(), { unloading: true });

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    expect(sent).toBe(true);
  });
});
