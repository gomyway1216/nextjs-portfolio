'use client';

import { useAuth } from '@/providers/AuthProvider';
import { BANK_GAME_KEY, PUSHER } from '../MedalCenter/bank';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { Fishing } from './Fishing';

// The page's own machine: it plays with the medals of whoever is signed in, kept on their account as well as on this
// device, and with a guest's medals for everyone else. This is the one place the game asks the site who is playing;
// the game itself takes a player and a store, and is run in its tests without either.

const BANK = accountStoreFor(BANK_GAME_KEY);
// The Medal Pusher's machine and record book on the account, read once (as the medal center's front reads them) for
// the medals and the bonus days the pusher held before there was a medal center, whichever page is opened first.
const LEGACY = { machines: accountStoreFor(PUSHER.game), books: accountStoreFor(PUSHER.booksGameKey) };

export const FishingForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // The medals are an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  return <Fishing player={{ uid, settled: uid !== null || !resolving, expected: presumedSignedIn }} bankStore={BANK} legacyStores={LEGACY} />;
};

export default FishingForPlayer;
