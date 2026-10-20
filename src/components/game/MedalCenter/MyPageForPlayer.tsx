'use client';

import { useLayoutEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { RECORDS_GAME_KEY, records } from '../MedalPusher/recordsStore';
import { BANK_GAME_KEY, PUSHER, bank as medalBank } from './bank';
import { MY_PAGE_PATH } from './paths';
import { MyPage } from './MyPage';

// The page's own "my page": the medals, their history and the records of whoever is signed in, kept on their account
// as well as on this device, and a guest's for everyone else. Like the hub, this is the one place it asks the site
// who is playing.

const BANK = accountStoreFor(BANK_GAME_KEY);
// The Medal Pusher's machine on the account, read once for the purse a machine from before the bank kept.
const PUSHER_MACHINE = accountStoreFor(PUSHER.game);
// The Medal Pusher's record book, shown here as the cabinet has it, and read once by the bank for its bonus days.
const PUSHER_BOOK = accountStoreFor(RECORDS_GAME_KEY);
const SIGN_IN = `/signin?redirect=${encodeURIComponent(MY_PAGE_PATH)}`;

export const MyPageForPlayer = () => {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  // The medals are an account's. A visitor Firebase knows only as anonymous is a guest here.
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  const settled = uid !== null || !resolving;
  // Told before anything on the page listens (a layout effect runs before the effects that listen), so the first
  // medals, history and book it opens are theirs.
  useLayoutEffect(() => {
    const player = { uid, settled, expected: presumedSignedIn };
    records.attend(player, PUSHER_BOOK);
    medalBank().attend(player, BANK, { machines: PUSHER_MACHINE, books: PUSHER_BOOK });
  }, [uid, settled, presumedSignedIn]);
  return <MyPage signInHref={SIGN_IN} presumedMember={presumedSignedIn} />;
};

export default MyPageForPlayer;
