import type { MemberTotal, ScoreGroupMember, ScoreSession } from '@/types/scoreTracker';

/**
 * Compute running totals per group member from a list of sessions.
 *
 * A participant contributes to a member's total when participant.memberId
 * matches the member's id. Guest participants (no memberId) appear as their
 * own pseudo-row keyed by their session-scoped id, aggregated by name so a
 * recurring guest typed the same way still totals correctly.
 */
export function computeTotals(
  members: ScoreGroupMember[],
  sessions: ScoreSession[],
): MemberTotal[] {
  const byMemberId = new Map<string, MemberTotal>();
  for (const m of members) {
    byMemberId.set(m.id, { memberId: m.id, name: m.name, total: 0, sessionCount: 0 });
  }
  // Guest aggregation key: "guest:<lowercased trimmed name>"
  const byGuest = new Map<string, MemberTotal>();

  for (const s of sessions) {
    for (const p of s.participants) {
      if (p.memberId && byMemberId.has(p.memberId)) {
        const row = byMemberId.get(p.memberId)!;
        row.total += p.score;
        row.sessionCount += 1;
      } else {
        const key = `guest:${p.name.trim().toLowerCase()}`;
        const row = byGuest.get(key) ?? { memberId: key, name: p.name.trim(), total: 0, sessionCount: 0 };
        row.total += p.score;
        row.sessionCount += 1;
        byGuest.set(key, row);
      }
    }
  }

  return [
    ...Array.from(byMemberId.values()),
    ...Array.from(byGuest.values()),
  ].sort((a, b) => b.total - a.total);
}
