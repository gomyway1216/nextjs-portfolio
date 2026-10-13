/**
 * The account's side of account.ts, on the site's own save service: one
 * document for a game key, at `game_saves/{uid}/saves/{gameKey}`, behind
 * `/api/game/saves`.
 *
 * Every call names the account it is for and is refused unless that account
 * is the one signed in right now, so that a machine can never be written to
 * an account other than its own, whatever the page believed a moment ago.
 * A read that finds nobody signed in fails; it does not say "no save", which
 * would be taken for an account with nothing on it.
 */

import { getGameSave, getGameSaveCredentials, saveGameSave, saveGameSaveKeepalive } from '@/services/gameSaveService';
import type { AccountStore } from './account';

export function accountStoreFor(gameKey: string): AccountStore {
  // The token kept in hand for the write made as the page is left, and whose it is.
  let inHand: { uid: string; token: string } | null = null;

  /** Fails unless `uid` is the player who is signed in, and keeps their token in hand. */
  const signedInAs = async (uid: string): Promise<void> => {
    const who = await getGameSaveCredentials();
    if (!who || who.uid !== uid) {
      if (inHand?.uid === uid) inHand = null;
      throw new Error('That account is not the one signed in');
    }
    inHand = who;
  };

  return {
    async load(uid) {
      await signedInAs(uid);
      const save = await getGameSave<unknown>(gameKey);
      return save ? { state: save.state, updatedAt: save.updatedAt, serverTime: save.serverTime ?? null } : null;
    },
    async store(uid, state) {
      await signedInAs(uid);
      await saveGameSave(gameKey, state);
    },
    async prepare(uid) {
      try {
        await signedInAs(uid);
      } catch {
        // Nothing in hand for that account: a write made as the page is left is then not sent, and waits for the next visit.
      }
    },
    storeNow(uid, state) {
      return inHand?.uid === uid ? saveGameSaveKeepalive(gameKey, state, inHand.token) : null;
    },
  };
}
