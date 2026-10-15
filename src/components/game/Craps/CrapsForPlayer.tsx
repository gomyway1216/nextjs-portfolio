'use client';

import { useAuth } from '@/providers/AuthProvider';
import { BANK_GAME_KEY, PUSHER } from '../MedalCenter/bank';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { Craps } from './Craps';

// The page's own table: the medals of whoever is signed in, kept on their account as well as on this device, and a
// guest's medals for everyone else. This is the one place the game asks the site who is playing; the game itself takes
// a player and a store, and is run in its tests without either.

const BANK = accountStoreFor(BANK_GAME_KEY);
// What the Medal Pusher kept on the account before the medals were shared, which the medals read once wherever they
// are first opened (as the Medal Game Center's front does): the machine's purse and the record book's bonus days.
const LEGACY = { machines: accountStoreFor(PUSHER.game), books: accountStoreFor(PUSHER.booksGameKey) };

export const CrapsForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // The medals are an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  return <Craps player={{ uid, settled: uid !== null || !resolving, expected: presumedSignedIn }} bankStore={BANK} legacy={LEGACY} />;
};

export default CrapsForPlayer;
