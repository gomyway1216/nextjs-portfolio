import { auth } from '@/lib/firebaseConnect';

// Client for /api/game/saves — per-user mid-game save slots. All calls
// require a signed-in Firebase user; callers should gate on auth state
// (guests simply don't get the save/resume UI).

export interface GameSave<T> {
  state: T;
  updatedAt: string | null;
}

async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function getGameSave<T>(gameKey: string): Promise<GameSave<T> | null> {
  const headers = await getAuthHeaders();
  if (!headers) return null;

  const response = await fetch(`/api/game/saves?gameKey=${encodeURIComponent(gameKey)}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to load save (${response.status})`);
  }
  const data = await response.json();
  return data.save ?? null;
}

export async function saveGameSave<T extends object>(gameKey: string, state: T): Promise<void> {
  const headers = await getAuthHeaders();
  if (!headers) throw new Error('Sign in to save your game');

  const response = await fetch('/api/game/saves', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ gameKey, state }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save game (${response.status})`);
  }
}

export async function deleteGameSave(gameKey: string): Promise<void> {
  const headers = await getAuthHeaders();
  if (!headers) return;

  const response = await fetch(`/api/game/saves?gameKey=${encodeURIComponent(gameKey)}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete save (${response.status})`);
  }
}
