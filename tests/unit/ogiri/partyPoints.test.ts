import { describe, it, expect } from 'vitest';
import { partyPointsForRank, partyStandings } from '@/lib/party/points';
import { settlePartyPoints, gameHighlights } from '@/lib/ogiri/party';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers } from '@/lib/ogiri/engine';
import { snapshotHistory, historyText } from '@/lib/ogiri/history';
import { prompts } from '@/lib/ogiri/prompts';
function room() {
  const room = createRoom('ABC234', newPlayer('a', 'secret', 'ねこ', '🐱', 0), 0);
  joinRoom(room, newPlayer('b', 'secret2', 'いぬ', '🐶', 0));
  joinRoom(room, newPlayer('c', 'secret3', 'ぱんだ', '🐼', 0));
  room.round = 1;
  room.phase = 'finished';
  room.players.a.score = 700;
  room.players.b.score = 300;
  room.players.a.roundScore = 700;
  room.players.b.roundScore = 300;
  room.players.a.previousRank = 3;
  room.matches = [
    {
      id: '1-1-0',
      promptId: prompts[0].id,
      players: ['a', 'b'],
      answers: { a: '公開回答', b: 'もうひとつ' },
      votes: { c: 0 },
      hidden: {},
      scored: true,
      points: [300, 0],
    },
    {
      id: '1-1-1', promptId: prompts[1].id, players: ['b', 'c'],
      answers: {}, votes: {}, hidden: {}, scored: false, points: [0, 0],
    },
  ];
  return room;
}
describe('cross-game party points and highlights', () => {
  it('uses one placement scale across games with different raw score scales, including ties', () => {
    expect([1, 2, 3, 4, 12].map(partyPointsForRank)).toEqual([10, 7, 5, 3, 3]);
    expect([0, -1, NaN, 1.5].map(partyPointsForRank)).toEqual([0, 0, 0, 0]);
    const results = [
      { rank: 1, score: 5000 },
      { rank: 1, score: 5000 },
      { rank: 3, score: 1000 },
    ];
    expect(results.map((r) => partyPointsForRank(r.rank))).toEqual([10, 10, 5]);
  });
  it('awards once, preserves totals on rematch, then accumulates the next game', () => {
    const r = room();
    settlePartyPoints(r, rankPlayers(r));
    settlePartyPoints(r, rankPlayers(r));
    expect(r.partyGames).toBe(1);
    expect(r.players.a.partyPoints).toBe(10);
    expect(r.players.b.partyPoints).toBe(7);
    expect(r.players.c.partyPoints).toBe(5);
    act(r, 'a', { type: 'rematch' }, 1, prompts);
    expect(r.players.a.score).toBe(0);
    expect(r.players.a.partyPoints).toBe(10);
    expect(r.players.a.partyEarned).toBe(0);
    r.matches = room().matches;
    r.phase = 'finished';
    r.players.c.score = 999;
    settlePartyPoints(r, rankPlayers(r));
    expect(r.partyGames).toBe(2);
    expect(r.players.a.partyPoints).toBe(17);
    expect(r.players.c.partyPoints).toBe(15);
    expect(partyStandings(rankPlayers(r))[0].id).toBe('a');
  });
  it('does not count an abandoned game with no revealed matches or include a display host', () => {
    const r = room();
    r.matches[0].scored = false;
    settlePartyPoints(r, rankPlayers(r));
    expect(r.partyGames).toBeUndefined();
    const played = room();
    played.players.a.spectator = true;
    settlePartyPoints(played, rankPlayers(played));
    expect(played.players.a.partyPoints).toBeUndefined();
    expect(played.players.b.partyPoints).toBe(10);
  });

  it('does not award absent members, retaining their totals while counting assigned players who disconnect', () => {
    const r = room();
    r.players.d = { ...newPlayer('d', 'secret4', 'お休み', '🐧', 0), active: false, partyPoints: 17 };
    r.players.c.active = false;
    expect(project(r, 'd', 1, prompts).players.find((p) => p.id === 'd')?.playingThisGame).toBe(false);
    expect(project(r, 'c', 1, prompts).players.find((p) => p.id === 'c')?.playingThisGame).toBe(true);
    settlePartyPoints(r, rankPlayers(r));
    expect(r.players.d.partyPoints).toBe(17);
    expect(r.players.d.partyEarned).toBeUndefined();
    expect(r.players.c.partyEarned).toBe(5);
    expect(snapshotHistory(r, 'a'.repeat(32), 1, prompts).partyRankings?.find((p) => p.name === 'お休み'))
      .toMatchObject({ points: 17, earned: 0 });
    expect(snapshotHistory(r, 'a'.repeat(32), 1, prompts).rankings.some((p) => p.name === 'お休み')).toBe(false);
  });
  it('archives the cumulative scoreboard as it was at each game, retaining a readable export', () => {
    const r = room();
    settlePartyPoints(r, rankPlayers(r));
    const history = snapshotHistory(r, 'a'.repeat(32), 10, prompts);
    expect(history.partyGames).toBe(1);
    expect(history.partyRankings?.[0]).toMatchObject({ name: 'ねこ', points: 10, earned: 10 });
    r.players.a.partyPoints = 999;
    expect(history.partyRankings?.[0].points).toBe(10);
    expect(historyText(history)).toContain('パーティー総合順位');
  });
  it('retains a previous player-host in the party totals after switching to display-only', () => {
    const r = room();
    settlePartyPoints(r, rankPlayers(r));
    act(r, 'a', { type: 'rematch' }, 1, prompts);
    act(r, 'a', { type: 'hostParticipation', participating: false }, 2, prompts);
    const v = project(r, 'a', 2, prompts);
    expect(v.players.some((p) => p.id === 'a')).toBe(false);
    expect(v.partyPlayers?.find((p) => p.id === 'a')?.partyPoints).toBe(10);
    expect(
      snapshotHistory(r, 'a'.repeat(32), 3, prompts).partyRankings?.find((p) => p.name === 'ねこ')
        ?.points,
    ).toBe(10);
  });
  it('shows MVPs, climbers and a best answer only after results, never unrevealed/hidden answers', () => {
    const r = room();
    const h = gameHighlights(r, prompts);
    expect(h.roundMvps).toEqual(['a']);
    expect(h.climbers[0]).toEqual({ id: 'a', places: 2 });
    expect(h.bestAnswer).toMatchObject({ answer: '公開回答', author: 'ねこ', votes: 1 });
    r.phase = 'answering';
    expect(project(r, null, 0, prompts).highlights).toBeNull();
    r.phase = 'voting';
    expect(project(r, null, 0, prompts).highlights).toBeNull();
    r.matches[0].scored = false;
    expect(gameHighlights(r, prompts).bestAnswer).toBeNull();
    r.matches[0].scored = true;
    r.matches[0].hidden.a = true;
    expect(gameHighlights(r, prompts).bestAnswer).toBeNull();
    delete r.matches[0].hidden.a;
    r.players.a.kicked = true;
    expect(gameHighlights(r, prompts).bestAnswer).toBeNull();
  });
});
