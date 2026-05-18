/**
 * Score Tracker — localStorage layer for the anonymous (not-logged-in) mode.
 *
 * Data shape mirrors the cloud schema so the same UI components work for both.
 * Groups stored locally are flagged isLocal=true; they can be migrated to the
 * cloud after the user logs in via /api/score-tracker/migrate.
 */
import { v4 as uuidv4 } from 'uuid';
import type {
  ScoreGroup,
  ScoreGroupMember,
  ScoreSession,
  ScoreSessionParticipant,
} from '@/types/scoreTracker';

const STORAGE_KEY = 'score_tracker_local_v1';

export interface LocalScoreGroup extends Omit<ScoreGroup, 'shareCode' | 'createdBy'> {
  isLocal: true;
  /** Local groups can't be shared — keep the field for shape compatibility but always empty. */
  shareCode: '';
  createdBy: null;
  sessions: ScoreSession[];
}

interface LocalState {
  groups: LocalScoreGroup[];
}

function read(): LocalState {
  if (typeof window === 'undefined') return { groups: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { groups: [] };
    return JSON.parse(raw) as LocalState;
  } catch {
    return { groups: [] };
  }
}

function write(state: LocalState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function listLocalGroups(): LocalScoreGroup[] {
  return read().groups.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getLocalGroup(groupId: string): LocalScoreGroup | null {
  return read().groups.find((g) => g.id === groupId) || null;
}

export function createLocalGroup(input: {
  name: string;
  description?: string;
  ownerName: string;
  extraMembers?: { name: string }[];
}): LocalScoreGroup {
  const now = new Date().toISOString();
  const owner: ScoreGroupMember = {
    id: uuidv4(),
    name: input.ownerName.trim(),
    role: 'owner',
    joinedAt: now,
  };
  const extras: ScoreGroupMember[] = (input.extraMembers || [])
    .filter((m) => m.name?.trim())
    .map((m) => ({
      id: uuidv4(),
      name: m.name.trim(),
      role: 'member',
      joinedAt: now,
    }));

  const group: LocalScoreGroup = {
    id: uuidv4(),
    name: input.name.trim(),
    description: input.description?.trim(),
    shareCode: '',
    createdBy: null,
    members: [owner, ...extras],
    sessions: [],
    isLocal: true,
    createdAt: now,
    updatedAt: now,
  };
  const state = read();
  state.groups.push(group);
  write(state);
  return group;
}

export function updateLocalGroup(
  groupId: string,
  updates: { name?: string; description?: string },
): LocalScoreGroup | null {
  const state = read();
  const idx = state.groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return null;
  const g = state.groups[idx];
  if (updates.name !== undefined && updates.name.trim()) g.name = updates.name.trim();
  if (updates.description !== undefined) g.description = updates.description.trim();
  g.updatedAt = new Date().toISOString();
  write(state);
  return g;
}

export function deleteLocalGroup(groupId: string): void {
  const state = read();
  state.groups = state.groups.filter((g) => g.id !== groupId);
  write(state);
}

export function addLocalMember(groupId: string, name: string): ScoreGroupMember | null {
  const state = read();
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return null;
  const m: ScoreGroupMember = {
    id: uuidv4(),
    name: name.trim(),
    role: 'member',
    joinedAt: new Date().toISOString(),
  };
  g.members.push(m);
  g.updatedAt = new Date().toISOString();
  write(state);
  return m;
}

export function addLocalSession(
  groupId: string,
  input: {
    date: string;
    participants: { name: string; memberId?: string; score: number }[];
    note?: string;
  },
): ScoreSession | null {
  const state = read();
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return null;
  const validMemberIds = new Set(g.members.map((m) => m.id));
  const participants: ScoreSessionParticipant[] = input.participants
    .filter((p) => p.name?.trim())
    .map((p) => ({
      id: uuidv4(),
      name: p.name.trim(),
      memberId: p.memberId && validMemberIds.has(p.memberId) ? p.memberId : undefined,
      score: Number(p.score) || 0,
    }));
  const now = new Date().toISOString();
  const session: ScoreSession = {
    id: uuidv4(),
    date: input.date,
    participants,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  g.sessions.unshift(session);
  g.updatedAt = now;
  write(state);
  return session;
}

export function updateLocalSession(
  groupId: string,
  sessionId: string,
  updates: {
    date?: string;
    participants?: { id?: string; name: string; memberId?: string; score: number }[];
    note?: string;
  },
): ScoreSession | null {
  const state = read();
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return null;
  const s = g.sessions.find((x) => x.id === sessionId);
  if (!s) return null;
  if (updates.date !== undefined && updates.date) s.date = updates.date;
  if (updates.note !== undefined) s.note = updates.note.trim() || undefined;
  if (updates.participants) {
    const validMemberIds = new Set(g.members.map((m) => m.id));
    s.participants = updates.participants
      .filter((p) => p.name?.trim())
      .map((p) => ({
        id: p.id || uuidv4(),
        name: p.name.trim(),
        memberId: p.memberId && validMemberIds.has(p.memberId) ? p.memberId : undefined,
        score: Number(p.score) || 0,
      }));
  }
  s.updatedAt = new Date().toISOString();
  g.updatedAt = s.updatedAt;
  write(state);
  return s;
}

export function deleteLocalSession(groupId: string, sessionId: string): void {
  const state = read();
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return;
  g.sessions = g.sessions.filter((s) => s.id !== sessionId);
  g.updatedAt = new Date().toISOString();
  write(state);
}

/** Used after a successful cloud migration to drop the local copy. */
export function removeLocalGroup(groupId: string): void {
  deleteLocalGroup(groupId);
}
