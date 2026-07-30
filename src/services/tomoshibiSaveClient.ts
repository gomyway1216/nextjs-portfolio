/**
 * Client for the Tomoshibi roguelike's cloud save.
 *
 * See the matching backend handlers at:
 *   Yudai-new-portfolio-backend-ts:functions/src/game/tomoshibiSave.ts
 *
 * Tomoshibi is a Godot HTML5 build embedded from `public/games/tomoshibi/`. The game
 * keeps its real save in the browser (Godot maps `user://` to IndexedDB) and
 * only mirrors it here, so this endpoint exists to let a run continue on
 * another machine — not to make the game playable. Every call here is
 * best-effort for that reason.
 *
 * Guests are covered without a signup: `ensureGameSignIn()` returns the real
 * user when there is a session and an anonymous Firebase account when there is
 * not, so there is always one uid for the save to hang off.
 */

import { fetchCloudFunction } from '@/lib/cloudFunctionFetch';
import { ensureGameSignIn } from '@/lib/gameAuth';
import { getCloudFunctionUrl } from '@/app/api/constants';

const SAVE_ENDPOINT = getCloudFunctionUrl('tomoshibiSaveGame');
const LOAD_ENDPOINT = getCloudFunctionUrl('tomoshibiLoadSave');

async function authHeaders(): Promise<Record<string, string>> {
  const user = await ensureGameSignIn();
  // Fetched per call rather than cached: a long session outlives the token.
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

/**
 * Read the stored save. Returns '' when there is none, and also when anything
 * goes wrong — the game treats both the same and falls back to its local save.
 */
export async function loadTomoshibiSave(): Promise<string> {
  try {
    const res = await fetchCloudFunction(LOAD_ENDPOINT, {
      method: 'GET',
      headers: await authHeaders(),
    });
    if (!res.ok) return '';
    const body = (await res.json()) as { save?: unknown };
    return typeof body.save === 'string' ? body.save : '';
  } catch (error) {
    console.error('[tomoshibi] loading the cloud save failed:', error);
    return '';
  }
}

/**
 * Store a save, or delete it when `save` is ''. Never throws: the local save is
 * the real one, so a failure here must not interrupt play.
 */
export async function saveTomoshibiSave(save: string): Promise<void> {
  try {
    await fetchCloudFunction(SAVE_ENDPOINT, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ save }),
    });
  } catch (error) {
    console.error('[tomoshibi] storing the cloud save failed:', error);
  }
}
