import { partyPointsForRank } from '../party/points';
import type { GameHighlights, Prompt, Room } from './types';

/** Assignment to any round counts, including a pass or a later disconnect. */
export function gamePlayerIds(room: Room): Set<string> {
  return new Set(
    [...(room.pastRounds ?? []).flatMap((r) => r.matches), ...room.matches]
      .flatMap((match) => match.players).concat((room.sideRounds ?? []).flatMap(round => round.players)),
  );
}

/** Called inside the same conditional commit as the game result and immutable archive. */
export function settlePartyPoints(room: Room, standings: { id: string; rank: number }[]) {
  if (room.phase !== 'finished' || room.partyAwardedGame === room.game) return;
  const played = (room.sideRounds ?? []).some(round => round.results.length > 0) || [...(room.pastRounds ?? []).flatMap((r) => r.matches), ...room.matches].some(
    (m) => m.scored,
  );
  room.partyAwardedGame = room.game;
  if (!played) return;
  const participants = gamePlayerIds(room);
  for (const { id, rank } of standings) {
    if (!participants.has(id)) continue;
    const player = room.players[id];
    player.partyEarned = partyPointsForRank(rank);
    player.partyPoints = (player.partyPoints ?? 0) + player.partyEarned;
  }
  room.partyGames = (room.partyGames ?? 0) + 1;
}

export function gameHighlights(room: Room, prompts: Prompt[]): GameHighlights {
  const players = Object.values(room.players).filter((p) => !p.kicked && !p.spectator);
  const maxRound = Math.max(0, ...players.map((p) => p.roundScore));
  const climbers = players
    .map((p) => ({
      id: p.id,
      places: p.previousRank - (1 + players.filter((other) => other.score > p.score).length),
    }))
    .filter((p) => p.places > 0)
    .sort((a, b) => b.places - a.places || a.id.localeCompare(b.id));
  let bestAnswer: GameHighlights['bestAnswer'] = null;
  for (const match of [...(room.pastRounds ?? []).flatMap((r) => r.matches), ...room.matches]) {
    if (!match.scored) continue;
    for (const [index, id] of match.players.entries()) {
      const player = room.players[id];
      if (!player || player.kicked || match.hidden[id] || !match.answers[id]) continue;
      const votes = Object.values(match.votes).filter((v) => v === index).length;
      if (votes > (bestAnswer?.votes ?? 0))
        bestAnswer = {
          text: prompts.find((p) => p.id === match.promptId)?.text ?? 'お題',
          answer: match.answers[id],
          author: player.name,
          avatar: player.avatar,
          votes,
          points: match.points[index],
        };
    }
  }
  return {
    roundMvps:
      maxRound > 0 ? players.filter((p) => p.roundScore === maxRound).map((p) => p.id) : [],
    climbers,
    bestAnswer,
  };
}
