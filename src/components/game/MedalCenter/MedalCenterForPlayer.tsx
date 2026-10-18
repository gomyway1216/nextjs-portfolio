'use client';

import { useLayoutEffect, useMemo } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { BANK_GAME_KEY, PUSHER, bank as medalBank } from './bank';
import { FloorHub } from './floor/FloorTogether';
import type { FloorMember } from './floor/useFloorPlace';
import { MEDAL_CENTER_PATH } from './paths';
import { MedalCenter } from './MedalCenter';

// The page's own medal center: the bank of whoever is signed in, kept on their account as well as on this device,
// and a guest's bank for everyone else. This is the one place the hub asks the site who is playing.

const BANK = accountStoreFor(BANK_GAME_KEY);
// The Medal Pusher's machine and record book on the account, read once for the purse a machine from before the bank
// kept, and for the days the book took the bonus on before the bank paid it.
const PUSHER_MACHINE = accountStoreFor(PUSHER.game);
const PUSHER_BOOK = accountStoreFor(PUSHER.booksGameKey);
const SIGN_IN = `/signin?redirect=${encodeURIComponent(MEDAL_CENTER_PATH)}`;

export const MedalCenterForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // The bank is an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  const settled = uid !== null || !resolving;
  // The same account for the floor: its place on it is asked with its own token.
  const account = currentUser && !currentUser.isAnonymous ? currentUser : null;
  const member = useMemo<FloorMember | null>(() => (account ? { uid: account.uid, token: () => account.getIdToken() } : null), [account]);
  // Told before anything on the page listens to the bank (a layout effect runs before the effects that listen), so the first bank it opens is theirs.
  useLayoutEffect(() => {
    medalBank().attend({ uid, settled, expected: presumedSignedIn }, BANK, { machines: PUSHER_MACHINE, books: PUSHER_BOOK });
  }, [uid, settled, presumedSignedIn]);
  // The floor played together shows in two places on the front: its board by the door, and its rankings under the machines.
  return (
    <FloorHub member={member} settled={settled} signInHref={SIGN_IN}>
      {({ now, together }) => <MedalCenter signInHref={SIGN_IN} presumedMember={presumedSignedIn} now={now} together={together} />}
    </FloorHub>
  );
};

export default MedalCenterForPlayer;
