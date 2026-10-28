/** Common placement points for every game in a party, independent of its raw score scale. */
export function partyPointsForRank(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) return 0;
  return [10, 7, 5][rank - 1] ?? 3;
}
export function partyStandings<T extends { id: string; partyPoints?: number }>(players: T[]) {
  return [...players]
    .sort((a, b) => (b.partyPoints ?? 0) - (a.partyPoints ?? 0) || a.id.localeCompare(b.id))
    .map((player) => ({
      ...player,
      partyRank: 1 + players.filter((p) => (p.partyPoints ?? 0) > (player.partyPoints ?? 0)).length,
    }));
}
