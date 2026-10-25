'use client';

import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { type AccountStore, type Player } from '../MedalPusher/account';
import { createProgress } from './progress';

export function useProgress(player: Player, store: AccountStore | null) {
  const progress = useMemo(() => createProgress({ store, slots: () => localStorage }), [store]);
  const snapshot = useSyncExternalStore(progress.subscribe, progress.getSnapshot, progress.getServerSnapshot);
  const { uid, settled, expected } = player;

  // Match the account before paint, including when another member signs in.
  useLayoutEffect(() => {
    progress.attend({ uid, settled, expected });
  }, [progress, uid, settled, expected]);

  useEffect(() => {
    progress.start();
    const timer = window.setInterval(() => progress.save(), 5000);
    const hidden = () => { if (document.hidden) progress.save('hidden'); };
    const leaving = () => progress.save('hidden');
    const online = () => progress.save();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leaving);
    window.addEventListener('online', online);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('online', online);
      progress.close();
    };
  }, [progress]);

  return { progress, snapshot };
}
