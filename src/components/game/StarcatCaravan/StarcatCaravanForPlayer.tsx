'use client';

import { useAuth } from '@/providers/AuthProvider';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { accountStoreFor } from '../MedalPusher/accountStore';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { PROGRESS_GAME_KEY } from './progress';
import StarcatCaravan from './StarcatCaravan';
import { loadCharacterCatalog } from './catalogClient';
import type { CharacterCatalog } from './catalog';
import styles from './StarcatCaravan.module.css';

const STORE = accountStoreFor(PROGRESS_GAME_KEY);
const SIGN_IN = `/signin?redirect=${encodeURIComponent('/games/starcat-caravan')}`;

export default function StarcatCaravanForPlayer() {
  const { currentUser, resolving, presumedSignedIn } = useAuth();
  const { language } = useGameLanguage();
  const [catalog, setCatalog] = useState<CharacterCatalog | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void loadCharacterCatalog().then((result) => {
      if (!active) return;
      setCatalog(result.catalog);
      setOffline(result.offline);
      setError(false);
    }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;
  if (!catalog) return <main className={styles.page}><div className={styles.shell}>
    <Link href="/games">← {language === 'ja' ? 'ゲーム一覧' : 'All games'}</Link>
    <h1>{language === 'ja' ? '星ねこキャラバン' : 'Starcat Caravan'}</h1>
    <p className={styles.notice} role={error ? 'alert' : 'status'}>{error
      ? language === 'ja' ? 'キャラ一覧を読み込めません。進行データは保護しています。接続を確認して再試行してください。' : 'Companions could not be loaded. Your progress is protected. Check your connection and try again.'
      : language === 'ja' ? 'キャラ一覧を読み込んでいます…' : 'Loading your companions…'}</p>
    {error && <button className={styles.primary} onClick={() => { setError(false); setAttempt((value) => value + 1); }}>{language === 'ja' ? '再試行' : 'Try again'}</button>}
  </div></main>;
  return <StarcatCaravan
    player={{ uid, settled: uid !== null || !resolving, expected: presumedSignedIn }}
    store={STORE}
    signInHref={SIGN_IN}
    characters={catalog.characters}
    catalogOffline={offline}
  />;
}
