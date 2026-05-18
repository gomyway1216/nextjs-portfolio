'use client';

import { useMemo, useState } from 'react';
import { PosteriorChart } from './charts';
import {
  Posterior,
  UNIFORM_PRIOR,
  credibleInterval,
  flip,
  posteriorMean,
  posteriorStd,
  update,
} from './engine';

const DEFAULT_TRUE_P = 0.7;
const HISTORY_DISPLAY_MAX = 100;

export const PlayTab = () => {
  const [trueP, setTrueP] = useState(DEFAULT_TRUE_P);
  const [reveal, setReveal] = useState(false);
  const [posterior, setPosterior] = useState<Posterior>(UNIFORM_PRIOR);
  const [history, setHistory] = useState<(0 | 1)[]>([]);
  const [guess, setGuess] = useState(0.5);

  const doFlip = (n: number) => {
    let p = posterior;
    const flips: (0 | 1)[] = [];
    for (let i = 0; i < n; i++) {
      const obs = flip(trueP);
      flips.push(obs);
      p = update(p, obs);
    }
    setPosterior(p);
    setHistory((h) => [...h, ...flips].slice(-1000));
  };

  const reset = () => {
    setPosterior(UNIFORM_PRIOR);
    setHistory([]);
  };

  const onTruePChange = (np: number) => {
    setTrueP(np);
    reset();
  };

  const stats = useMemo(() => {
    const mean = posteriorMean(posterior);
    const std = posteriorStd(posterior);
    const ci = credibleInterval(posterior);
    // Derive counts from the posterior (Beta(1+H, 1+T) prior is Beta(1, 1))
    // not from `history`, which is capped at 1000 for display purposes.
    const heads = Math.round(posterior.alpha - 1);
    const tails = Math.round(posterior.beta - 1);
    return { mean, std, ci, heads, tails };
  }, [posterior]);

  const guessError = Math.abs(guess - trueP);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.8rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>真の確率 p (隠されている)</span>
            <span style={{ color: reveal ? '#fbbf24' : '#475569', fontWeight: 700 }}>{reveal ? trueP.toFixed(2) : '???'}</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={0.99}
            step={0.01}
            value={trueP}
            onChange={(e) => onTruePChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b' }}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
          <button onClick={() => doFlip(1)} style={btn('#22c55e')}>🪙 1回</button>
          <button onClick={() => doFlip(10)} style={btn('#0ea5e9')}>10 回</button>
          <button onClick={() => doFlip(100)} style={btn('#0ea5e9')}>100 回</button>
          <button onClick={() => doFlip(1000)} style={btn('#0ea5e9')}>1000 回</button>
          <button onClick={() => setReveal((r) => !r)} style={btn('#1e293b', false, '#94a3b8', '#334155')}>{reveal ? '🙈 隠す' : '👀 真値表示'}</button>
          <button onClick={reset} style={btn('#1e293b', false, '#94a3b8', '#334155')}>リセット</button>
        </div>

        <PosteriorChart posterior={posterior} trueP={reveal ? trueP : null} credInterval={stats.ci} />

        <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.2rem', maxHeight: 56, overflowY: 'auto' }}>
          {history.slice(-HISTORY_DISPLAY_MAX).map((h, i) => (
            <span
              key={i}
              style={{
                width: 18, height: 18, borderRadius: 3,
                background: h === 1 ? '#fbbf24' : '#1e293b',
                color: h === 1 ? '#0f172a' : '#475569',
                border: `1px solid ${h === 1 ? '#fbbf24' : '#334155'}`,
                fontSize: '0.65rem', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {h === 1 ? 'H' : 'T'}
            </span>
          ))}
        </div>
        {history.length > HISTORY_DISPLAY_MAX && (
          <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: '0.2rem' }}>
            (直近 {HISTORY_DISPLAY_MAX} 回のみ表示)
          </div>
        )}
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.6rem', color: '#fbbf24' }}>事後分布の要約</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label="観測 (H / T)" value={`${stats.heads} / ${stats.tails}`} color="#67e8f9" />
          <Stat label="推定値 p̂ (posterior mean)" value={stats.mean.toFixed(3)} color="#fbbf24" />
          <Stat label="不確かさ σ" value={stats.std.toFixed(3)} color="#a78bfa" />
          <Stat label="95% 信用区間" value={`[${stats.ci[0].toFixed(2)}, ${stats.ci[1].toFixed(2)}]`} color="#a78bfa" />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem' }}>あなたの予想 p</div>
          <input type="range" min={0} max={1} step={0.01} value={guess} onChange={(e) => setGuess(Number(e.target.value))} style={{ width: '100%', accentColor: '#4ade80' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#cbd5e1' }}>
            <span>予想: <strong style={{ color: '#4ade80' }}>{guess.toFixed(2)}</strong></span>
            {reveal && (
              <span>真値との差: <strong style={{ color: guessError < 0.05 ? '#4ade80' : guessError < 0.15 ? '#fbbf24' : '#f87171' }}>{guessError.toFixed(3)}</strong></span>
            )}
          </div>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#020617', border: '1px solid #1e293b', borderRadius: 10, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <strong style={{ color: '#fbbf24' }}>ベイズ更新:</strong> コインの真の確率 p は不明。一様事前分布 Beta(1, 1) からスタート。
          <strong>1回コインを振るたびに事後分布が鋭くなる</strong>: H なら α 加算、T なら β 加算。<br />
          観測が増えると分布の山が真の p に寄っていきます (シミュレーションタブで多数試行を見ると一目瞭然)。
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
