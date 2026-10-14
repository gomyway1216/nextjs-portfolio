'use client';

import { useLayoutEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { BANK_GAME_KEY, PUSHER, bank as medalBank } from './bank';
import { MEDAL_CENTER_PATH } from './paths';
import { MedalCenter } from './MedalCenter';

// The page's own medal center: the bank of whoever is signed in, kept on their account as well as on this device,
// and a guest's bank for everyone else. This is the one place the hub asks the site who is playing.

const BANK = accountStoreFor(BANK_GAME_KEY);
// The Medal Pusher's machine on the account, read once for the purse a machine from before the bank kept.
const PUSHER_MACHINE = accountStoreFor(PUSHER.game);
const SIGN_IN = `/signin?redirect=${encodeURIComponent(MEDAL_CENTER_PATH)}`;

export const MedalCenterForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // The bank is an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  const settled = uid !== null || !resolving;
  // Told before anything on the page listens to the bank (a layout effect runs before the effects that listen), so the first bank it opens is theirs.
  useLayoutEffect(() => {
    medalBank().attend({ uid, settled, expected: presumedSignedIn }, BANK, PUSHER_MACHINE);
  }, [uid, settled, presumedSignedIn]);
  return <MedalCenter signInHref={SIGN_IN} />;
};

export default MedalCenterForPlayer;
