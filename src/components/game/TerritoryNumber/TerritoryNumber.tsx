/**
 * Territory Number — mode select.
 */

'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { TerritoryNumberVsAI } from './TerritoryNumberVsAI';
import { TerritoryNumberOnline } from './TerritoryNumberOnline';
import {
  GameLanguageProvider,
  useGameLanguage,
  LanguageSelector,
} from '../contexts/GameLanguageContext';
import { getGameTranslation } from '../constants/gameTranslations';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';

type Mode = 'menu' | 'ai' | 'online';

function TerritoryNumberContent() {
  useFeatureLifecycle('game.territory-number');
  const [mode, setMode] = useState<Mode>('menu');
  const { language } = useGameLanguage();
  const t = getGameTranslation('territory-number', language);

  if (mode === 'ai') return <TerritoryNumberVsAI onBackToMenu={() => setMode('menu')} />;
  if (mode === 'online') return <TerritoryNumberOnline onBackToMenu={() => setMode('menu')} />;

  const ja = language === 'ja';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(to bottom, #020617, #0f172a)',
      overflow: 'auto',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link
          href="/games"
          style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 700 }}
        >
          {ja ? '← ゲーム一覧へ' : '← Back to Games'}
        </Link>
        <LanguageSelector />
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>{t.title}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
        <div style={{
          width: 'min(720px, 100%)',
          background: 'rgba(0, 0, 0, 0.92)',
          border: '2px solid rgba(251, 191, 36, 0.35)',
          borderRadius: '1rem',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.75rem' }}>🎯</div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#fbbf24' }}>
            {t.title}
          </h1>
          <p style={{ marginTop: '0.75rem', color: '#94a3b8', fontSize: '1rem' }}>
            {ja ? 'モードを選んでプレイ開始' : 'Choose a mode to start playing.'}
          </p>

          <div style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: '1.25rem',
          }}>
            <button
              onClick={() => setMode('ai')}
              style={{
                padding: '0.85rem 1.25rem',
                borderRadius: '0.9rem',
                border: '1px solid rgba(55, 65, 81, 1)',
                backgroundColor: '#16a34a',
                color: '#fff',
                fontWeight: 900,
                cursor: 'pointer',
                minWidth: '14rem',
              }}
            >
              {ja ? 'AI対戦' : 'Play vs AI'}
            </button>
            <button
              onClick={() => setMode('online')}
              style={{
                padding: '0.85rem 1.25rem',
                borderRadius: '0.9rem',
                border: '1px solid rgba(55, 65, 81, 1)',
                backgroundColor: '#2563eb',
                color: '#fff',
                fontWeight: 900,
                cursor: 'pointer',
                minWidth: '14rem',
              }}
            >
              {ja ? 'オンライン対戦 (2人)' : 'Online (2 players)'}
            </button>
          </div>

          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '0.75rem',
            textAlign: 'left',
          }}>
            <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: '0.5rem' }}>
              {ja ? '遊び方' : 'How to Play'}
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.6 }}>
              {t.howToPlay.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>{item}</li>
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
