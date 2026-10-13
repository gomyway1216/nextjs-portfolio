import { auth } from '@/lib/firebaseConnect';

// Client for /api/game/saves — per-user mid-game save slots. All calls
// require a signed-in Firebase user; callers should gate on auth state
// (guests simply don't get the save/resume UI).

export interface GameSave<T> {
  state: T;
  updatedAt: string | null;
  /**
   * The server's clock when it answered (the response's Date header, as an
   * ISO string), for callers that compare `updatedAt` with a time of their
   * own and cannot trust the device's clock. Null when the header is missing.
   */
  serverTime?: string | null;
}

/** The server answered a save call with an error. `status` is its HTTP status (401, 413, 500 …). */
export class GameSaveError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GameSaveError';
    this.status = status;
  }
}

async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/** A player and a token of that same player's: both are read from one user, so the token is never somebody else's. */
export interface GameSaveCredentials {
  uid: string;
  token: string;
}

/**
 * Who is signed in, with a token for their saves, or null when nobody is.
 * For a caller that has to know whose save it is about to read or write, or
 * that has to send one without waiting for a token, as the page is hidden or
 * left (see `getGameSaveAs`, `saveGameSaveAs` and `saveGameSaveKeepalive`).
 * Firebase hands back the token it already has until that one is about to
 * run out, so this is cheap to call often.
 */
export async function getGameSaveCredentials(): Promise<GameSaveCredentials | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return { uid: user.uid, token: await user.getIdToken() };
}

/**
 * The id of whoever is signed in at this instant, or null for nobody,
 * without waiting for anything. A caller holding a token for a write that
 * cannot wait checks this before it uses it: a token is only to be used
 * while its player is still signed in.
 */
export function currentGameSaveUid(): string | null {
  return auth.currentUser?.uid ?? null;
}

// The two requests themselves. Nothing is awaited in either before `fetch` is called.
async function readSave<T>(gameKey: string, headers: Record<string, string>): Promise<GameSave<T> | null> {
  const response = await fetch(`/api/game/saves?gameKey=${encodeURIComponent(gameKey)}`, {
    headers,
  });
  if (!response.ok) {
    throw new GameSaveError(`Failed to load save (${response.status})`, response.status);
  }
  const data = await response.json();
  if (!data.save) return null;
  const answered = Date.parse(response.headers?.get?.('date') ?? '');
  return { ...data.save, serverTime: Number.isFinite(answered) ? new Date(answered).toISOString() : null };
}

async function writeSave<T extends object>(gameKey: string, state: T, headers: Record<string, string>): Promise<void> {
  const response = await fetch('/api/game/saves', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ gameKey, state }),
  });
  if (!response.ok) {
    throw new GameSaveError(`Failed to save game (${response.status})`, response.status);
  }
}

export async function getGameSave<T>(gameKey: string): Promise<GameSave<T> | null> {
  const headers = await getAuthHeaders();
  if (!headers) return null;
  return readSave<T>(gameKey, headers);
}

export async function saveGameSave<T extends object>(gameKey: string, state: T): Promise<void> {
  const headers = await getAuthHeaders();
  if (!headers) throw new Error('Sign in to save your game');
  return writeSave(gameKey, state, headers);
}

/**
 * The same read as `getGameSave`, made with a token the caller already
 * holds. Who is signed in is not asked again, so the save that comes back is
 * the one of the player the token is for, whoever has signed in or out since
 * the caller got it (see `getGameSaveCredentials`). The request is on its way
 * before this returns: nothing is awaited first.
 */
export function getGameSaveAs<T>(gameKey: string, token: string): Promise<GameSave<T> | null> {
  return readSave<T>(gameKey, { Authorization: `Bearer ${token}` });
}

/** The same write as `saveGameSave`, made with a token the caller already holds: see `getGameSaveAs`. */
export function saveGameSaveAs<T extends object>(gameKey: string, state: T, token: string): Promise<void> {
  return writeSave(gameKey, state, { Authorization: `Bearer ${token}` });
}

/**
 * The same write as `saveGameSave`, with a token already in hand, sent with
 * `keepalive` so that the browser finishes it after the page has been hidden
 * or left. Nothing is awaited before the request is on its way. It never
 * rejects: the promise says whether the server took the save, for a caller
 * that is still there to hear.
 *
 * A browser sends at most 64 KB of body this way; a bigger one is refused by
 * `fetch` itself, and the promise is then false.
 */
export function saveGameSaveKeepalive<T extends object>(gameKey: string, state: T, token: string): Promise<boolean> {
  try {
    return fetch('/api/game/saves', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameKey, state }),
      keepalive: true,
    }).then(
      (response) => response.ok,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
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
    throw new GameSaveError(`Failed to delete save (${response.status})`, response.status);
  }
}
