/**
 * The medal floor's routes, from the browser. Every call that is about a player
 * is made with a token of theirs that the caller hands in; nothing here goes
 * and finds whoever is signed in.
 */

import { jackpotViewFrom, type FloorJackpotView } from '@/lib/medalFloor/jackpot';
import type { NameRefusal } from '@/lib/medalFloor/names';
import type { FloorMe, FloorSummary } from '@/lib/medalFloor/types';

export const FLOOR_API = '/api/game/medal-floor';

/** A call the floor refused, with the HTTP status and, for a name, why. */
export class FloorCallError extends Error {
  readonly status: number;
  readonly reason: NameRefusal | null;

  constructor(status: number, reason: NameRefusal | null = null) {
    super(`The medal floor answered ${status}`);
    this.name = 'FloorCallError';
    this.status = status;
    this.reason = reason;
  }
}

async function answer<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let reason: NameRefusal | null = null;
    try {
      const body = (await response.json()) as { reason?: NameRefusal };
      reason = body.reason ?? null;
    } catch {
      // No body worth reading.
    }
    throw new FloorCallError(response.status, reason);
  }
  return (await response.json()) as T;
}

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** What the floor shows now: the hub's short boards, or the rankings page's long ones. */
export const fetchFloor = (view: 'hub' | 'full'): Promise<FloorSummary> => fetch(`${FLOOR_API}?view=${view}`).then((response) => answer<FloorSummary>(response));

/** The floor jackpot as everybody is shown it. */
export async function fetchJackpot(): Promise<FloorJackpotView> {
  const view = jackpotViewFrom(await fetch(`${FLOOR_API}/jackpot`).then((response) => answer<unknown>(response)));
  if (!view) throw new FloorCallError(200);
  return view;
}

export const fetchMe = (token: string): Promise<FloorMe> => fetch(`${FLOOR_API}/me`, { headers: bearer(token), cache: 'no-store' }).then((response) => answer<FloorMe>(response));

/** Joins the floor, or changes the name; null is "Player" and the four digits. */
export const putMe = (token: string, name: string | null): Promise<FloorMe> =>
  fetch(`${FLOOR_API}/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...bearer(token) }, body: JSON.stringify({ name }) }).then((response) => answer<FloorMe>(response));

export const deleteMe = (token: string): Promise<FloorMe> => fetch(`${FLOOR_API}/me`, { method: 'DELETE', headers: bearer(token) }).then((response) => answer<FloorMe>(response));

/** The owner's view: every line, hidden ones marked, with each line's player id. */
export const fetchOwnerFloor = (token: string): Promise<FloorSummary> => fetch(`${FLOOR_API}/admin`, { headers: bearer(token), cache: 'no-store' }).then((response) => answer<FloorSummary>(response));

export type OwnerAction =
  | { action: 'hide-line' | 'show-line'; period: string; board: string; pid: string }
  | { action: 'hide-moment'; id: number }
  | { action: 'block' | 'unblock'; pid: string }
  | { action: 'void-jackpot'; id: string };

export const ownerAct = (token: string, act: OwnerAction): Promise<{ done: true }> =>
  fetch(`${FLOOR_API}/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(token) }, body: JSON.stringify(act) }).then((response) => answer<{ done: true }>(response));
