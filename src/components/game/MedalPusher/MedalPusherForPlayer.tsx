'use client';

import { useAuth } from '@/providers/AuthProvider';
import { BANK_GAME_KEY } from '../MedalCenter/bank';
import { accountStoreFor } from './accountStore';
import { MedalPusher } from './MedalPusher';
import { RECORDS_GAME_KEY } from './recordsStore';
import { MACHINE_GAME_KEY } from './savedMachine';

// The page's own game: the machine of whoever is signed in, kept on their
// account as well as on this device, and a guest's machine for everyone else.
// This is the one place the game asks the site who is playing; the game
// itself takes a player and a store, and is run in its tests without either.

const STORE = accountStoreFor(MACHINE_GAME_KEY);
// The record book is a second document on the same account, with a store of its own.
const RECORDS = accountStoreFor(RECORDS_GAME_KEY);
// And the medals are the medal bank's, a third document, which every game at the medal center plays from.
const BANK = accountStoreFor(BANK_GAME_KEY);
const SIGN_IN = `/signin?redirect=${encodeURIComponent('/games/medal-pusher')}`;

export const MedalPusherForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // Saves are an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  // While the site is still restoring a session, `currentUser` is null even for a player who is signed in. The
  // game then opens with the machine of whoever played on this device last, if the site expects somebody, and
  // touches no account until the site is sure.
  return <MedalPusher player={{ uid, settled: uid !== null || !resolving, expected: presumedSignedIn }} store={STORE} recordsStore={RECORDS} bankStore={BANK} signInHref={SIGN_IN} />;
};

export default MedalPusherForPlayer;
