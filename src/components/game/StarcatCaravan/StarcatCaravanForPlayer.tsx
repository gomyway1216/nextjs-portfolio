'use client';

import { useAuth } from '@/providers/AuthProvider';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { PROGRESS_GAME_KEY } from './progress';
import StarcatCaravan from './StarcatCaravan';

const STORE = accountStoreFor(PROGRESS_GAME_KEY);
const SIGN_IN = `/signin?redirect=${encodeURIComponent('/games/starcat-caravan')}`;

export default function StarcatCaravanForPlayer() {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  return <StarcatCaravan
    player={{ uid, settled: uid !== null || !resolving, expected: presumedSignedIn }}
    store={STORE}
    signInHref={SIGN_IN}
  />;
}
