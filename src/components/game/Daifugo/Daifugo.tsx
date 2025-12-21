/**
 * Daifugo (大富豪) - Mode Select
 */

'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { DaifugoOnline } from './DaifugoOnline';
import { DaifugoVsAI } from './DaifugoVsAI';
import { GameLanguageProvider, useGameLanguage, LanguageSelector } from '../contexts/GameLanguageContext';
import { getGameTranslation } from '../constants/gameTranslations';

type DaifugoMode = 'menu' | 'ai' | 'online';

function DaifugoContent() {
  const [mode, setMode] = useState<DaifugoMode>('menu');
  const { language } = useGameLanguage();
  const t = getGameTranslation('daifugo', language);

  const labels = {
    backToGames: language === 'ja' ? '← ゲーム一覧へ' : '← Back to Games',
    chooseMode: language === 'ja' ? 'モードを選んでプレイ開始' : 'Choose a mode to start playing.',
    vsAI: language === 'ja' ? 'AI対戦 (3〜6人)' : 'Play vs AI (3–6 players)',
    online: language === 'ja' ? 'オンライン対戦 (3〜6人)' : 'Online Room (3–6 players)',
    aiModeDesc: language === 'ja'
      ? 'AIモードではAI対戦相手の人数を選べます（2〜5人）。オンラインモードではルームコードを共有して友達と対戦できます（3〜6人）。'
      : 'AI mode lets you choose how many AI opponents to include (minimum 2, maximum 5). Online mode uses room codes to play with friends (3–6 players).',
  };

  if (mode === 'ai') {
    return <DaifugoVsAI onBackToMenu={() => setMode('menu')} />;
  }

  if (mode === 'online') {
    return <DaifugoOnline onBackToMenu={() => setMode('menu')} />;
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(to bottom, #111827, #000)',
      overflow: 'auto',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link
          href="/games"
          style={{
            color: '#94a3b8',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 700,
          }}
        >
          {labels.backToGames}
        </Link>
        <LanguageSelector />
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>{t.title}</div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 0',
      }}>
        <div style={{
          width: 'min(720px, 100%)',
          background: 'rgba(0, 0, 0, 0.92)',
          border: '2px solid rgba(251, 191, 36, 0.35)',
          borderRadius: '1rem',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.75rem' }}>🃏</div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#fbbf24' }}>
            {t.title}
          </h1>
          <p style={{ marginTop: '0.75rem', color: '#9ca3af', fontSize: '1rem' }}>
            {labels.chooseMode}
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
                minWidth: '16rem',
              }}
            >
              {labels.vsAI}
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
                minWidth: '16rem',
              }}
            >
              {labels.online}
            </button>
          </div>

          <div style={{ marginTop: '1.25rem', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.6 }}>
            {labels.aiModeDesc}
          </div>

          {/* Game Description */}
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '0.75rem',
            textAlign: 'left',
          }}>
            <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: '0.5rem' }}>
              {language === 'ja' ? '遊び方' : 'How to Play'}
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.6 }}>
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

export function Daifugo() {
  return (
    <GameLanguageProvider>
      <DaifugoContent />
    </GameLanguageProvider>
  );
}
