/**
 * The account's side of account.ts, on the site's own save service: one
 * document for a game key, at `game_saves/{uid}/saves/{gameKey}`, behind
 * `/api/game/saves`.
 *
 * Every call names the account it is for, and a machine can never be read
 * from or written to an account other than the one named, whoever signs in
 * or out while the call is being made. That rests on one thing: the player's
 * id and their token are read from the same user, once, and the request is
 * made with that very token. The service is not asked again who is signed
 * in, so there is no second look that could find somebody else.
 *
 * A call is refused unless that player is the one signed in, asked when the
 * token is fetched and again in the same breath as the request is sent:
 * nothing is sent as a player who is no longer signed in. A read that finds
 * nobody signed in fails; it does not say "no save", which would be taken
 * for an account with nothing on it.
 *
 * The token kept in hand for the write made as the page is left is the
 * player's only while they are signed in. It is let go when they sign out,
 * and one that arrives after they have signed out is not kept.
 */

import { currentGameSaveUid, getGameSaveAs, getGameSaveCredentials, saveGameSaveAs, saveGameSaveKeepalive, type GameSaveCredentials } from '@/services/gameSaveService';
import type { AccountStore } from './account';

export function accountStoreFor(gameKey: string): AccountStore {
  // The token kept in hand for the write made as the page is left, and whose it is.
  let inHand: GameSaveCredentials | null = null;

  /**
   * Does `act` as `uid`, with a token that is `uid`'s own, and keeps that
   * token in hand; or fails without doing it. `uid` has to be the player the
   * token was fetched for and the player signed in at the instant `act`
   * begins, since they may have signed out while the token was on its way.
   * `act` is called in the same breath as that is asked, and is given the
   * token to send: it must not go and find one of its own.
   */
  const signedInAs = async <T>(uid: string, act: (token: string) => T | Promise<T>): Promise<T> => {
    const who = await getGameSaveCredentials();
    if (!who || who.uid !== uid || currentGameSaveUid() !== uid) {
      if (inHand?.uid === uid) inHand = null;
      throw new Error('That account is not the one signed in');
    }
    inHand = who;
    return act(who.token);
  };

  return {
    load(uid) {
      return signedInAs(uid, async (token) => {
        const save = await getGameSaveAs<unknown>(gameKey, token);
        return save ? { state: save.state, updatedAt: save.updatedAt, serverTime: save.serverTime ?? null } : null;
      });
    },
    store(uid, state) {
      return signedInAs(uid, (token) => saveGameSaveAs(gameKey, state, token));
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
