'use client';

import { useMemo, useRef, useState } from 'react';

const ARM_PALETTE = ['#67e8f9', '#a78bfa', '#f472b6', '#4ade80', '#fbbf24'];
const T_DEFAULT = 50;
const K_DEFAULT = 2;
const MIN_K = 2;
const MAX_K = 5;

interface ArmState { trueP: number; pulls: number; rewards: number }

const randomProbs = (k: number): number[] =>
  Array.from({ length: k }, () => Math.round(Math.random() * 90 + 5) / 100); // 0.05..0.95

const freshArms = (probs: number[]): ArmState[] => probs.map((p) => ({ trueP: p, pulls: 0, rewards: 0 }));

export const PlayTab = () => {
  const [k, setK] = useState(K_DEFAULT);
  const [T, setT] = useState(T_DEFAULT);
  const [probs, setProbs] = useState(() => randomProbs(K_DEFAULT));
  const [arms, setArms] = useState<ArmState[]>(() => freshArms(probs));
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState<{ arm: number; reward: number }[]>([]);
  const [reveal, setReveal] = useState(false);
  const lastRewardRef = useRef<{ arm: number; reward: number } | null>(null);

  const totalReward = useMemo(() => arms.reduce((s, a) => s + a.rewards, 0), [arms]);
  const bestP = useMemo(() => Math.max(...probs), [probs]);
  const optimalReward = bestP * step; // expected reward of always-best-arm
  const regret = optimalReward - totalReward;
  const done = step >= T;

  const pull = (i: number) => {
    if (done) return;
    const reward = Math.random() < probs[i] ? 1 : 0;
    setArms((a) => a.map((arm, idx) => (idx === i ? { ...arm, pulls: arm.pulls + 1, rewards: arm.rewards + reward } : arm)));
    setHistory((h) => [...h, { arm: i, reward }]);
    setStep((s) => s + 1);
    lastRewardRef.current = { arm: i, reward };
  };

  const newGame = (nextK = k) => {
    const np = randomProbs(nextK);
    setProbs(np);
    setArms(freshArms(np));
    setStep(0);
    setHistory([]);
    setReveal(false);
    lastRewardRef.current = null;
  };

  const onKChange = (nextK: number) => {
    setK(nextK);
    newGame(nextK);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>アーム数 K</span>
            <input
              type="number"
              value={k}
              min={MIN_K}
              max={MAX_K}
              onChange={(e) => onKChange(Math.max(MIN_K, Math.min(MAX_K, Number(e.target.value) || MIN_K)))}
              style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.9rem', width: 80 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>制限回数 T</span>
            <input
              type="number"
              value={T}
              min={10}
              max={500}
              onChange={(e) => setT(Number(e.target.value) || 50)}
              style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.9rem', width: 80 }}
            />
          </label>
          <button onClick={() => newGame()} style={btn('#22c55e')}>🎲 新しいゲーム</button>
          <button onClick={() => setReveal((r) => !r)} style={btn('#1e293b', false, '#94a3b8', '#334155')}>
            {reveal ? '🙈 確率を隠す' : '👀 真の確率を見る'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${arms.length}, 1fr)`, gap: '0.5rem', marginBottom: '0.8rem' }}>
          {arms.map((arm, i) => {
            const empMean = arm.pulls === 0 ? null : arm.rewards / arm.pulls;
            const color = ARM_PALETTE[i % ARM_PALETTE.length];
            return (
              <button
                key={i}
                onClick={() => pull(i)}
                disabled={done}
                style={{
                  background: done ? '#1e293b' : '#0f172a',
                  border: `2px solid ${color}`,
                  borderRadius: 12,
                  padding: '0.75rem 0.5rem',
                  cursor: done ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.3rem',
                  color: '#fff',
                }}
              >
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>Arm {i + 1}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>引いた {arm.pulls} 回 / 当たり {arm.rewards}</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#cbd5e1' }}>
                  実測 p̂: {empMean === null ? '—' : empMean.toFixed(3)}
                </div>
                {reveal && (
                  <div style={{ fontSize: '0.75rem', color: '#fbbf24' }}>真値: {arm.trueP.toFixed(2)}</div>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', maxHeight: 80, overflowY: 'auto', padding: '0.4rem', background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }}>
          {history.length === 0 && <span style={{ color: '#475569', fontSize: '0.75rem' }}>（まだ引いてない）</span>}
          {history.map((h, i) => (
            <span
              key={i}
              title={`step ${i + 1}: Arm ${h.arm + 1} → ${h.reward}`}
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                background: h.reward ? ARM_PALETTE[h.arm % ARM_PALETTE.length] : '#1e293b',
                border: `1px solid ${ARM_PALETTE[h.arm % ARM_PALETTE.length]}88`,
                color: h.reward ? '#0f172a' : '#475569',
                fontSize: '0.65rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
              }}
            >
              {h.reward}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.6rem', color: '#fbbf24' }}>進捗</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label="残り pulls" value={`${T - step} / ${T}`} color="#67e8f9" />
          <Stat label="累計報酬" value={`${totalReward}`} color="#4ade80" />
          <Stat label="最適報酬 (理論)" value={optimalReward.toFixed(1)} color="#fbbf24" />
          <Stat label="累積 regret" value={regret.toFixed(2)} color={regret < 0.5 ? '#4ade80' : '#f472b6'} />
        </div>

        {done && (
          <div style={{ marginTop: '0.8rem', padding: '0.7rem 0.9rem', borderRadius: 10, background: '#15803d44', border: '1px solid #4ade80', color: '#4ade80', fontWeight: 700 }}>
            ✓ 終了！ 累計 {totalReward} / {T} = {((totalReward / T) * 100).toFixed(1)}%
            <div style={{ fontSize: '0.85rem', fontWeight: 400, color: '#cbd5e1', marginTop: '0.4rem' }}>
              真の確率: {probs.map((p, i) => `Arm ${i + 1}=${p.toFixed(2)}`).join(' / ')}
              <br />ベストアームを毎回引いていれば期待 {optimalReward.toFixed(1)}。あなたとの差 (regret) = {regret.toFixed(2)}
            </div>
          </div>
        )}

        <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#020617', border: '1px solid #1e293b', borderRadius: 10, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <strong style={{ color: '#fbbf24' }}>K-armed Bandit:</strong> 各アームには隠された当たり確率 p_i。
          あなたが毎回どのアームを引くか選ぶ。<br />
          <strong>探索 (explore)</strong> = 情報集め (どれが良いか確かめる)、<strong>活用 (exploit)</strong> = 今のところベストっぽいのを引く。
          このバランスをどう取るかがポイント。シミュレーションタブで ε-greedy / UCB1 / Thompson Sampling の比較が見られます。
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
    <div style={{ color, fontSize: '1.25rem', fontWeight: 800 }}>{value}</div>
  </div>
);
