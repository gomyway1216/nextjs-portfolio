'use client';

import { useLayoutEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { BANK_GAME_KEY, PUSHER, bank as medalBank } from '../MedalCenter/bank';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { Pachinko } from './Pachinko';

// The page's own machine: it plays with the medals of whoever is signed in, kept on their account as well as on this
// device, and a guest's medals for everyone else. This is the one place the machine asks the site who is playing; the
// game itself takes a player, and is run in its tests without one.

const BANK = accountStoreFor(BANK_GAME_KEY);
// As the medal center's front does: the Medal Pusher's machine and record book on the account, read once for what
// they held before the medals were shared (MedalCenter/bank.ts), whichever page of the medal center opens first.
const PUSHER_MACHINE = accountStoreFor(PUSHER.game);
const PUSHER_BOOK = accountStoreFor(PUSHER.booksGameKey);

export const PachinkoForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // The medals are an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  const settled = uid !== null || !resolving;
  // Told before anything on the page listens to the medals (a layout effect runs before the effects that listen), so
  // the first medals the machine opens are the player's.
  useLayoutEffect(() => {
    medalBank().attend({ uid, settled, expected: presumedSignedIn }, BANK, { machines: PUSHER_MACHINE, books: PUSHER_BOOK });
  }, [uid, settled, presumedSignedIn]);
  return <Pachinko player={{ uid, settled, expected: presumedSignedIn }} />;
};

export default PachinkoForPlayer;
