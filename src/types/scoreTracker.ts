/**
 * Score Tracker — shared session-based score recording.
 *
 * A group holds members and a list of sessions. Each session represents one
 * day/sitting and contains the final raw score for each participant. Cumulative
 * totals are computed client-side by summing session scores per participant.
 *
 * Designed primarily for mahjong daily totals (素点) but intentionally generic:
 * any "N players play, each ends with a number" scenario fits (golf, poker
 * nights, board game club, etc.).
 */

export interface ScoreGroupMember {
  id: string;
  name: string;
  /** Firebase UID if the member is a logged-in user, undefined otherwise. */
  userId?: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface ScoreSessionParticipant {
  /** Stable id within the session — references a member.id when matched, else a fresh uuid for guests. */
  id: string;
  name: string;
  /** Optional link to a group member; absent for ad-hoc guest entries. */
  memberId?: string;
  score: number;
}

export interface ScoreSession {
  id: string;
  /** ISO date (YYYY-MM-DD) — the session date as displayed; not a timestamp. */
  date: string;
  participants: ScoreSessionParticipant[];
  note?: string;
  /** Firebase UID of the entrant if logged in. */
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreGroup {
  id: string;
  name: string;
  description?: string;
  shareCode: string;
  /** Firebase UID of the creator. null for cloud groups created anonymously (rare; allowed for parity with settli). */
  createdBy: string | null;
  members: ScoreGroupMember[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API input / response shapes
// ---------------------------------------------------------------------------

export interface CreateScoreGroupInput {
  name: string;
  description?: string;
  /** Display name for the creator's member entry. */
  ownerName: string;
  /** Optional additional initial members (no userId — added as guests). */
  members?: { name: string }[];
}

export interface CreateScoreGroupResponse {
  id: string;
  shareCode: string;
}

export interface JoinScoreGroupInput {
  shareCode: string;
  memberName: string;
}

export interface JoinScoreGroupResponse {
  groupId: string;
  member: ScoreGroupMember;
}

export interface AddMemberInput {
  name: string;
}

export interface CreateScoreSessionInput {
  date: string;
  participants: { name: string; memberId?: string; score: number }[];
  note?: string;
}

export interface UpdateScoreSessionInput {
  date?: string;
  participants?: { id?: string; name: string; memberId?: string; score: number }[];
  note?: string;
}

export interface ScoreGroupsResponse {
  groups: ScoreGroup[];
}

export interface ScoreSessionsResponse {
  sessions: ScoreSession[];
}

// ---------------------------------------------------------------------------
// Computed view shape (cumulative totals)
// ---------------------------------------------------------------------------

export interface MemberTotal {
  memberId: string;
  name: string;
  total: number;
  sessionCount: number;
}
