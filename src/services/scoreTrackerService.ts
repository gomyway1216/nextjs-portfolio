import { auth } from '@/lib/firebaseConnect';
import type {
  CreateScoreGroupInput,
  CreateScoreGroupResponse,
  CreateScoreSessionInput,
  JoinScoreGroupResponse,
  ScoreGroup,
  ScoreGroupMember,
  ScoreGroupsResponse,
  ScoreSessionsResponse,
  UpdateScoreSessionInput,
} from '@/types/scoreTracker';

const BASE = '/api/score-tracker';

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with ${res.status}`);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function listGroups(): Promise<ScoreGroupsResponse> {
  return call<ScoreGroupsResponse>(`${BASE}/groups`);
}

export function getGroup(groupId: string): Promise<ScoreGroup> {
  return call<ScoreGroup>(`${BASE}/groups/${groupId}`);
}

export function createGroup(input: CreateScoreGroupInput): Promise<CreateScoreGroupResponse> {
  return call<CreateScoreGroupResponse>(`${BASE}/groups`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateGroup(groupId: string, input: { name?: string; description?: string }) {
  return call<{ success: true }>(`${BASE}/groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteGroup(groupId: string) {
  return call<{ success: true }>(`${BASE}/groups/${groupId}`, { method: 'DELETE' });
}

export function getGroupByShareCode(shareCode: string) {
  return call<{ id: string; name: string; description?: string; memberCount: number }>(
    `${BASE}/groups/share/${shareCode}`,
  );
}

export function joinGroup(
  groupId: string,
  input: { shareCode: string; memberName: string },
): Promise<JoinScoreGroupResponse> {
  return call<JoinScoreGroupResponse>(`${BASE}/groups/${groupId}/join`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addMember(groupId: string, name: string) {
  return call<{ member: ScoreGroupMember }>(`${BASE}/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function listSessions(groupId: string): Promise<ScoreSessionsResponse> {
  return call<ScoreSessionsResponse>(`${BASE}/groups/${groupId}/sessions`);
}

export function createSession(groupId: string, input: CreateScoreSessionInput) {
  return call<{ id: string }>(`${BASE}/groups/${groupId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSession(
  groupId: string,
  sessionId: string,
  input: UpdateScoreSessionInput,
) {
  return call<{ success: true }>(`${BASE}/groups/${groupId}/sessions/${sessionId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteSession(groupId: string, sessionId: string) {
  return call<{ success: true }>(`${BASE}/groups/${groupId}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export function migrateLocalGroup(input: {
  name: string;
  description?: string;
  ownerName: string;
  /** Local owner's member id, used server-side to remap session participants. */
  ownerLocalId?: string;
  members: { id?: string; name: string }[];
  sessions: {
    date: string;
    note?: string;
    participants: { id?: string; name: string; memberId?: string; score: number }[];
  }[];
}) {
  return call<{ id: string; shareCode: string }>(`${BASE}/migrate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
