'use client';

import { useState } from 'react';
import { playGame } from './engine';

interface SessionStats {
  games: number;
  totalPaid: number;     // 累計 entry price (if any)
  totalWon: number;
  maxPayoff: number;
}

const INITIAL: SessionStats = { games: 0, totalPaid: 0, totalWon: 0, maxPayoff: 0 };

export const PlayTab = () => {
  const [entryPrice, setEntryPrice] = useState(5);
  const [stats, setStats] = useState<SessionStats>(INITIAL);
  const [lastGame, setLastGame] = useState<{ n: number; payoff: number } | null>(null);
  const [history, setHistory] = useState<{ n: number; payoff: number }[]>([]);

  const play = (n: number) => {
    let totalWon = 0;
    let maxPayoff = stats.maxPayoff;
    const newHistory: { n: number; payoff: number }[] = [];
    for (let i = 0; i < n; i++) {
      const r = playGame();
      totalWon += r.payoff;
      if (r.payoff > maxPayoff) maxPayoff = r.payoff;
      newHistory.push(r);
    }
    setLastGame(newHistory[newHistory.length - 1] ?? null);
    setHistory((h) => [...h, ...newHistory].slice(-200));
    setStats((s) => ({
      games: s.games + n,
      totalPaid: s.totalPaid + entryPrice * n,
      totalWon: s.totalWon + totalWon,
      maxPayoff,
    }));
  };

  const reset = () => {
    setStats(INITIAL);
    setHistory([]);
    setLastGame(null);
  };

  const meanPayoff = stats.games === 0 ? 0 : stats.totalWon / stats.games;
  const netProfit = stats.totalWon - stats.totalPaid;
  const fairTruncated = stats.games === 0 ? 0 : Math.log2(stats.games) / 2;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.8rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
            参加料 (1 ゲームあたり): <strong style={{ color: '#fbbf24' }}>${entryPrice}</strong>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={entryPrice}
            onChange={(e) => setEntryPrice(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
          <button onClick={() => play(1)} style={btn('#22c55e')}>🎲 1回</button>
          <button onClick={() => play(10)} style={btn('#0ea5e9')}>10 回</button>
          <button onClick={() => play(100)} style={btn('#0ea5e9')}>100 回</button>
          <button onClick={() => play(1000)} style={btn('#0ea5e9')}>1000 回</button>
          <button onClick={reset} style={btn('#1e293b', false, '#94a3b8', '#334155')}>リセット</button>
        </div>

        {lastGame && (
          <div style={{ padding: '0.7rem 0.9rem', borderRadius: 10, background: lastGame.payoff >= entryPrice ? '#15803d44' : '#7f1d1d44', border: `1px solid ${lastGame.payoff >= entryPrice ? '#4ade80' : '#f87171'}`, color: lastGame.payoff >= entryPrice ? '#4ade80' : '#fca5a5', fontWeight: 700 }}>
            最後のゲーム: <strong>{lastGame.n} flips</strong> → 配当 <strong>${lastGame.payoff.toLocaleString()}</strong>
          </div>
        )}

        <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.2rem', maxHeight: 80, overflowY: 'auto' }}>
          {history.slice(-200).map((h, i) => {
            const log2 = h.payoff >= Number.MAX_SAFE_INTEGER ? 50 : Math.floor(Math.log2(Math.max(1, h.payoff)));
            const hue = Math.min(360, 200 - log2 * 18);
            return (
              <span
                key={i}
                title={`flips=${h.n}, payoff=$${h.payoff}`}
                style={{
                  minWidth: 28, height: 22, borderRadius: 3,
                  background: `hsl(${hue}, 70%, 40%)`,
                  color: '#fff', border: `1px solid hsl(${hue}, 70%, 60%)`,
                  fontSize: '0.7rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px',
                }}
              >
                ${h.payoff >= 1000 ? `${(h.payoff / 1000).toFixed(0)}k` : h.payoff}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.6rem', color: '#fbbf24' }}>セッション統計</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label="プレイ数" value={`${stats.games}`} color="#67e8f9" />
          <Stat label="平均配当" value={`$${meanPayoff.toFixed(2)}`} color="#67e8f9" />
          <Stat label="累計配当" value={`$${stats.totalWon.toLocaleString()}`} color="#4ade80" />
          <Stat label="支払い" value={`$${stats.totalPaid.toLocaleString()}`} color="#94a3b8" />
          <Stat label="差し引き" value={`${netProfit >= 0 ? '+' : '−'}$${Math.abs(netProfit).toLocaleString()}`} color={netProfit >= 0 ? '#4ade80' : '#f87171'} />
          <Stat label="最大配当" value={`$${stats.maxPayoff.toLocaleString()}`} color="#f472b6" />
          <Stat label="参加料 (1ゲーム)" value={`$${entryPrice}`} color="#fbbf24" />
          <Stat label="「公正な」価格 ≈ log₂(N)/2" value={`$${fairTruncated.toFixed(2)}`} color="#fbbf24" />
        </div>

        <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#020617', border: '1px solid #1e293b', borderRadius: 10, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <strong style={{ color: '#fbbf24' }}>セントペテルブルクのパラドックス:</strong> コインを連続して投げ、初めて裏が出るまでの表の枚数で配当が決まる。
          表 0 回 (即 T) → $1、HT → $2、HHT → $4、…、表 n-1 回 → $2^(n-1)。<br />
          期待値 = Σ (1/2)^n · 2^(n-1) = Σ 1/2 = <strong>無限大</strong>。
          だが大半の人は数ドル以上払う気にならない。中央値は $1-2 で、平均は N に応じてゆっくり log₂(N)/2 で増える — これが「無限の期待値」と「直感的に妥当な価格」のギャップ。
        </div>
      </div>
    </div>
  );
};

const btn = (bg: string, disabled = false, color = '#fff', border?: string): React.CSSProperties => ({
  background: disabled ? '#1e293b' : bg,
  color: disabled ? '#475569' : color,
  border: border ? `1px solid ${border}` : 'none',
  borderRadius: 10,
  padding: '0.55rem 1.1rem',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}44`, borderRadius: 10, padding: '0.55rem 0.7rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.15rem', fontWeight: 800 }}>{value}</div>
  </div>
);
