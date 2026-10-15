'use client';

import { useAuth } from '@/providers/AuthProvider';
import { BANK_GAME_KEY, PUSHER } from '../MedalCenter/bank';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { VideoPoker } from './VideoPoker';

// The page's own machine: it plays with the medals of whoever is signed in, kept on their account as well as on this
// device, and with a guest's medals for everyone else. This is the one place the game asks the site who is playing.

const BANK = accountStoreFor(BANK_GAME_KEY);
// As at the medal center: the Medal Pusher's machine and record book on the account, which the medals look at once
// (for the purse a machine from before the medal center kept, and the days its book took the bonus on).
const LEGACY = { machines: accountStoreFor(PUSHER.game), books: accountStoreFor(PUSHER.booksGameKey) };

export const VideoPokerForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // The medals are an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  return <VideoPoker player={{ uid, settled: uid !== null || !resolving, expected: presumedSignedIn }} bankStore={BANK} legacy={LEGACY} />;
};

export default VideoPokerForPlayer;
