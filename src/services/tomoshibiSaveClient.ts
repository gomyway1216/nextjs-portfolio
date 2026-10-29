/**
 * Cloud save for the Tomoshibi roguelike.
 *
 * **This does not have its own endpoint.** It goes through the site's existing
 * per-user save slots at `/api/game/saves`, the same ones MedalPusher,
 * StarcatCaravan and ShogiImproved use. An earlier version of this file called
 * a pair of Cloud Functions written specially for it, which was a duplicate of
 * something already built and already deployed.
 *
 * Tomoshibi is a Godot HTML5 build embedded from `public/games/tomoshibi/`. The
 * game keeps its real save in the browser (Godot maps `user://` to IndexedDB)
 * and only mirrors it here, so this exists to let a run continue on another
 * machine — not to make the game playable. Every call is best-effort for that
 * reason, and none of them throw.
 *
 * Godot hands us one opaque JSON string, so it is wrapped in an object: the
 * slot API stores objects, and a bare string is not one.
 *
 * Guests are covered without a signup. `ensureGameSignIn()` returns the real
 * user when there is a session and an anonymous Firebase account when there is
 * not, so `getGameSave` always finds somebody signed in to hang the save off.
 */

import { ensureGameSignIn } from '@/lib/gameAuth';
import { deleteGameSave, getGameSave, saveGameSave } from '@/services/gameSaveService';

/** The slot name. Shared with nothing else; one save per player. */
const GAME_KEY = 'tomoshibi';

interface TomoshibiSlot {
  /** Godot's own save file, as the game wrote it. Opaque to this layer. */
  json: string;
}

/**
 * Read the stored save. Returns '' when there is none, and also when anything
 * goes wrong — the game treats both the same and falls back to its local save.
 */
export async function loadTomoshibiSave(): Promise<string> {
  try {
    await ensureGameSignIn();
    const slot = await getGameSave<TomoshibiSlot>(GAME_KEY);
    return typeof slot?.state?.json === 'string' ? slot.state.json : '';
  } catch (error) {
    console.error('[tomoshibi] loading the cloud save failed:', error);
    return '';
  }
}

/**
 * Store a save, or clear the slot when `save` is ''. Never throws: the local
 * save is the real one, so a failure here must not interrupt play.
 *
 * Returns whether the server took it, so the page can say so. Autosave ignores
 * the answer; the manual button shows it.
 */
export async function saveTomoshibiSave(save: string): Promise<boolean> {
  try {
    await ensureGameSignIn();
    if (save === '') {
      await deleteGameSave(GAME_KEY);
      return true;
    }
    await saveGameSave<TomoshibiSlot>(GAME_KEY, { json: save });
    return true;
  } catch (error) {
    console.error('[tomoshibi] storing the cloud save failed:', error);
    return false;
  }
}

/**
 * Whether the player is on a real account rather than the anonymous one that
 * `ensureGameSignIn` hands guests.
 *
 * Both keep a cloud save, but only a real account can be signed into somewhere
 * else — so this is what decides whether to promise the run will follow them.
 */
export async function isTomoshibiAccountSignedIn(): Promise<boolean> {
  try {
    const user = await ensureGameSignIn();
    return !user.isAnonymous;
  } catch {
    return false;
  }
}
