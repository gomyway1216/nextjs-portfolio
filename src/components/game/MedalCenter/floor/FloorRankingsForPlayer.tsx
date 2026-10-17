'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { FloorRankings } from './FloorRankings';
import { MEDAL_RANKINGS_PATH } from './paths';
import type { FloorMember } from './useFloorPlace';

const SIGN_IN = `/signin?redirect=${encodeURIComponent(MEDAL_RANKINGS_PATH)}`;

/** The rankings page for whoever is signed in: their place on the floor, and the owner's controls for the owner. */
export const FloorRankingsForPlayer = () => {
  const { currentUser, resolving, isAdmin } = useAuth();
  const account = currentUser && !currentUser.isAnonymous ? currentUser : null;
  const member = useMemo<FloorMember | null>(() => (account ? { uid: account.uid, token: () => account.getIdToken() } : null), [account]);
  const owner = useMemo(() => (account && isAdmin ? () => account.getIdToken() : null), [account, isAdmin]);
  return <FloorRankings member={member} settled={account !== null || !resolving} signInHref={SIGN_IN} owner={owner} />;
};

export default FloorRankingsForPlayer;
