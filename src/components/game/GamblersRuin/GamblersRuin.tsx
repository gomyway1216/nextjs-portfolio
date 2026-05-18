'use client';

import { useState } from 'react';
import { PlayTab } from './PlayTab';
import { SimTab } from './SimTab';

type Tab = 'play' | 'sim';

export const GamblersRuin = () => {
  const [tab, setTab] = useState<Tab>('play');

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #020617, #111827)', color: '#e2e8f0', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>💸 Gambler&apos;s Ruin</h1>
        <p style={{ marginTop: '0.4rem', color: '#94a3b8' }}>
          公平 (p=0.5) でも有限資金だと破産する確率は (N − a) / N。少しでも p &lt; 0.5 なら破産はほぼ確実 — その閾値を実験で確かめる。
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', margin: '1.25rem 0' }}>
          <TabButton active={tab === 'play'} onClick={() => setTab('play')}>遊ぶ</TabButton>
          <TabButton active={tab === 'sim'} onClick={() => setTab('sim')}>シミュレーション</TabButton>
        </div>

        {tab === 'play' ? <PlayTab /> : <SimTab />}
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? '#f59e0b' : '#1e293b',
      color: active ? '#0f172a' : '#e2e8f0',
      border: `1px solid ${active ? '#f59e0b' : '#334155'}`,
      borderRadius: 10,
      padding: '0.55rem 1.1rem',
      fontWeight: 800,
      cursor: 'pointer',
      fontSize: '0.95rem',
    }}
  >
    {children}
  </button>
);

export default GamblersRuin;
