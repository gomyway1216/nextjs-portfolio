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
 *
 * The token kept in hand for the write made as the page is left is the
 * player's only while they are signed in. It is let go when they sign out,
 * a token that arrives after they have signed out is not kept, and whether
 * they are signed in is asked again at the instant anything would be sent:
 * nothing is sent as a player who is no longer signed in.
 */

import { currentGameSaveUid, getGameSave, getGameSaveCredentials, saveGameSave, saveGameSaveKeepalive } from '@/services/gameSaveService';
import type { AccountStore } from './account';

export function accountStoreFor(gameKey: string): AccountStore {
  // The token kept in hand for the write made as the page is left, and whose it is.
  let inHand: { uid: string; token: string } | null = null;

  /**
   * Does `act` as `uid`, keeping their token in hand, or fails without doing
   * it: `uid` has to be the player who is signed in, both when the token is
   * asked for and at the instant `act` begins, since they may have signed out
   * while the token was on its way.
   */
  const signedInAs = async <T>(uid: string, act: () => T | Promise<T>): Promise<T> => {
    const who = await getGameSaveCredentials();
    if (!who || who.uid !== uid || currentGameSaveUid() !== uid) {
      if (inHand?.uid === uid) inHand = null;
      throw new Error('That account is not the one signed in');
    }
    inHand = who;
    return act();
  };

  return {
    load(uid) {
      return signedInAs(uid, async () => {
        const save = await getGameSave<unknown>(gameKey);
        return save ? { state: save.state, updatedAt: save.updatedAt, serverTime: save.serverTime ?? null } : null;
      });
    },
    store(uid, state) {
      return signedInAs(uid, () => saveGameSave(gameKey, state));
    },
    async prepare(uid) {
      try {
        await signedInAs(uid, () => undefined);
      } catch {
        // Nothing in hand for that account: a write made as the page is left is then not sent, and waits for the next visit.
      }
    },
    storeNow(uid, state) {
      if (inHand?.uid !== uid) return null;
      if (currentGameSaveUid() !== uid) {
        // They have signed out since the token was fetched. It is not theirs to be used any more.
        inHand = null;
        return null;
      }
      return saveGameSaveKeepalive(gameKey, state, inHand.token);
    },
    forget(uid) {
      if (inHand?.uid === uid) inHand = null;
    },
  };
}
