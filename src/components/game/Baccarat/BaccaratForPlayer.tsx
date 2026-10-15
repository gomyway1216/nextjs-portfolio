'use client';

import { useLayoutEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { BANK_GAME_KEY, PUSHER, bank as medalBank } from '../MedalCenter/bank';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { Baccarat } from './Baccarat';

// The page's own table: it plays with the medals of whoever is signed in, kept on their account as well as on this
// device, and with a guest's medals for everyone else. This is the one place the table asks the site who is playing;
// the table itself takes a player, and is run in its tests without one.

const BANK = accountStoreFor(BANK_GAME_KEY);
// As on the Medal Game Center's front: the Medal Pusher's machine and record book on the account, read once for the
// medals and bonus days a machine from before the medal floor kept, so that a player who comes here first is not
// treated as a new member when they were not one.
const PUSHER_MACHINE = accountStoreFor(PUSHER.game);
const PUSHER_BOOK = accountStoreFor(PUSHER.booksGameKey);

export const BaccaratForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // The medals are an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  const settled = uid !== null || !resolving;
  // Told before anything on the page listens to the medals (a layout effect runs before the effects that listen), so
  // the first medals the table opens are the player's.
  useLayoutEffect(() => {
    medalBank().attend({ uid, settled, expected: presumedSignedIn }, BANK, { machines: PUSHER_MACHINE, books: PUSHER_BOOK });
  }, [uid, settled, presumedSignedIn]);
  return <Baccarat player={{ uid, settled }} />;
};

export default BaccaratForPlayer;
