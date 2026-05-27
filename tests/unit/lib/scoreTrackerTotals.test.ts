import { describe, expect, it } from 'vitest';
import { computeTotals } from '@/lib/scoreTrackerTotals';
import type { ScoreGroupMember, ScoreSession } from '@/types/scoreTracker';

const members: ScoreGroupMember[] = [
  { id: 'm1', name: 'Alice', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'm2', name: 'Bob', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z' },
];

function session(id: string, participants: ScoreSession['participants']): ScoreSession {
  return {
    id,
    date: '2026-01-01',
    participants,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('computeTotals', () => {
  it('aggregates scores and session counts for known members', () => {
    const totals = computeTotals(members, [
      session('s1', [
        { id: 'p1', memberId: 'm1', name: 'Alice', score: 10 },
        { id: 'p2', memberId: 'm2', name: 'Bob', score: -3 },
      ]),
      session('s2', [
        { id: 'p3', memberId: 'm1', name: 'Alice', score: 5 },
      ]),
    ]);

    expect(totals).toEqual([
      { memberId: 'm1', name: 'Alice', total: 15, sessionCount: 2 },
      { memberId: 'm2', name: 'Bob', total: -3, sessionCount: 1 },
    ]);
  });

  it('aggregates recurring guests by normalized name', () => {
    const totals = computeTotals(members, [
      session('s1', [
        { id: 'g1', name: '  Guest  ', score: 8 },
        { id: 'g2', name: 'guest', score: 4 },
      ]),
    ]);

    expect(totals).toContainEqual({
      memberId: 'guest:guest',
      name: 'Guest',
      total: 12,
      sessionCount: 2,
    });
  });

  it('keeps zero rows for members without sessions and sorts by total descending', () => {
    const totals = computeTotals(members, [
      session('s1', [{ id: 'g1', name: 'Guest', score: 20 }]),
    ]);

    expect(totals.map((row) => row.memberId)).toEqual(['guest:guest', 'm1', 'm2']);
    expect(totals.find((row) => row.memberId === 'm1')).toMatchObject({ total: 0, sessionCount: 0 });
  });
});
