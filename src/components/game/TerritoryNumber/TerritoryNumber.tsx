/**
 * Territory Number — mode select.
 */

'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { Bot, Users } from 'lucide-react';
import { TerritoryNumberVsAI } from './TerritoryNumberVsAI';
import { TerritoryNumberOnline } from './TerritoryNumberOnline';
import {
  GameLanguageProvider,
  useGameLanguage,
  LanguageSelector,
} from '../contexts/GameLanguageContext';
import { getGameTranslation } from '../constants/gameTranslations';
import { getTerritoryNumberStrings } from './i18n';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import styles from './TerritoryNumber.module.css';

type Mode = 'menu' | 'ai' | 'online';

function TerritoryNumberContent() {
  useFeatureLifecycle('game.territory-number');
  const [mode, setMode] = useState<Mode>('menu');
  const { language } = useGameLanguage();
  const t = getGameTranslation('territory-number', language);
  const s = getTerritoryNumberStrings(language);

  if (mode === 'ai') return <TerritoryNumberVsAI onBackToMenu={() => setMode('menu')} />;
  if (mode === 'online') return <TerritoryNumberOnline onBackToMenu={() => setMode('menu')} />;

  const ja = language === 'ja';

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <Link href="/games" className={styles.ghostButton}>
          ← {s.backToGames}
        </Link>
        <LanguageSelector />
        <span className={styles.headerTitle}>{t.title}</span>
      </div>

      <div className={styles.setupScroll}>
        <div className={styles.setupCard} style={{ textAlign: 'center', alignItems: 'center' }}>
          <div className={styles.setupIcon} style={{ fontSize: '3.5rem' }}>🎯</div>
          <h1 className={styles.setupTitle}>{t.title}</h1>
          <p className={styles.setupSubtitle}>
            {ja ? 'モードを選んでプレイ開始' : 'Choose a mode to start playing.'}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
            <button
              type="button"
              onClick={() => setMode('ai')}
              className={styles.optionButton}
              style={{ flex: '1 1 12rem', alignItems: 'center', textAlign: 'center' }}
            >
              <Bot size={26} aria-hidden />
              <span className={styles.optionLabel}>{s.vsAi}</span>
              <span className={styles.optionDesc}>
                {ja ? '3段階のAIと1対1' : 'One-on-one against a tiered AI'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('online')}
              className={styles.optionButton}
              style={{ flex: '1 1 12rem', alignItems: 'center', textAlign: 'center' }}
            >
              <Users size={26} aria-hidden />
              <span className={styles.optionLabel}>
                {ja ? 'オンライン対戦' : 'Online (2 players)'}
              </span>
              <span className={styles.optionDesc}>
                {ja ? 'ルームコードで友達と' : 'Play a friend with a room code'}
              </span>
            </button>
          </div>

          <div className={styles.setupHint} style={{ textAlign: 'left', width: '100%' }}>
            <div style={{ fontWeight: 800, marginBottom: '0.5rem', color: 'var(--games-route-fg)' }}>
              {s.howToPlayTitle}
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.7 }}>
              {t.howToPlay.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TerritoryNumber() {
  return (
    <GameLanguageProvider>
      <TerritoryNumberContent />
    </GameLanguageProvider>
  );
}
