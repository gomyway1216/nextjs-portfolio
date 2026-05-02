/**
 * Doubt (ダウト) - Mode Select
 */

'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { DoubtOnline } from './DoubtOnline';
import { DoubtVsAI } from './DoubtVsAI';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
type DoubtMode = 'menu' | 'ai' | 'online';

export function Doubt() {
  useFeatureLifecycle('game.doubt');
  const [mode, setMode] = useState<DoubtMode>('menu');

  if (mode === 'ai') {
    return <DoubtVsAI onBackToMenu={() => setMode('menu')} />;
  }

  if (mode === 'online') {
    return <DoubtOnline onBackToMenu={() => setMode('menu')} />;
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
          ← Back to Games
        </Link>
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Doubt (ダウト)</div>
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
            Doubt (ダウト)
          </h1>
          <p style={{ marginTop: '0.75rem', color: '#9ca3af', fontSize: '1rem' }}>
            Choose a mode to start playing.
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
              Play vs AI (3–6 players)
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
              Online Room (3–6 players)
            </button>
          </div>

          <div style={{ marginTop: '1.25rem', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.6 }}>
            Place 1–4 cards face-down and claim the required rank. If you suspect a bluff, call Doubt!
          </div>
        </div>
      </div>
    </div>
  );
}

