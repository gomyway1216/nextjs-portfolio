'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getBanditStrings } from './i18n';
import { StrategyName, chooseArm, mulberry32, wilsonInterval } from './engine';

const ARM_PALETTE = ['#67e8f9', '#a78bfa', '#f472b6', '#4ade80', '#fbbf24'];
const T_DEFAULT = 50;
const K_DEFAULT = 3;
const MIN_K = 2;
const MAX_K = 5;

// Which strategy to show as a live hint, and how to label it.
const HINT_STRATEGY: StrategyName = 'ucb1';
const HINT_LABEL: Record<'ja' | 'en', string> = { ja: 'UCB1', en: 'UCB1' };

interface ArmState { trueP: number; pulls: number; rewards: number }

const randomProbs = (k: number): number[] =>
  Array.from({ length: k }, () => Math.round(Math.random() * 90 + 5) / 100); // 0.05..0.95

const freshArms = (probs: number[]): ArmState[] => probs.map((p) => ({ trueP: p, pulls: 0, rewards: 0 }));

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getBanditStrings(language);

  const [k, setK] = useState(K_DEFAULT);
  const [T, setT] = useState(T_DEFAULT);
  const [probs, setProbs] = useState(() => randomProbs(K_DEFAULT));
  const [arms, setArms] = useState<ArmState[]>(() => freshArms(probs));
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState<{ arm: number; reward: number }[]>([]);
  const [reveal, setReveal] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [flash, setFlash] = useState<{ arm: number; reward: number; id: number } | null>(null);

  const totalReward = useMemo(() => arms.reduce((s, a) => s + a.rewards, 0), [arms]);
  const bestP = useMemo(() => Math.max(...probs), [probs]);
  const optimalReward = bestP * step; // expected reward of always-best-arm
  const regret = optimalReward - totalReward;
  const done = step >= T;

  // Deterministic hint: which arm the UCB1 policy would pull right now. Uses a
  // seeded RNG so the suggestion is stable between renders (only tie-breaks use
  // randomness, and the seed is derived from the current pull counts).
  const hintedArm = useMemo(() => {
    if (!showHint || done) return -1;
    const counts = arms.map((a) => a.pulls);
    const sums = arms.map((a) => a.rewards);
    const seed = counts.reduce((acc, c, i) => acc + c * (i + 1) * 2654435761, 1);
    return chooseArm(HINT_STRATEGY, { counts, sums, total: step }, 0.1, mulberry32(seed >>> 0));
  }, [showHint, done, arms, step]);

  const pull = useCallback((i: number) => {
    if (i < 0 || i >= probs.length) return;
    setStep((s) => {
      if (s >= T) return s;
      const reward = Math.random() < probs[i] ? 1 : 0;
      setArms((a) => a.map((arm, idx) => (idx === i ? { ...arm, pulls: arm.pulls + 1, rewards: arm.rewards + reward } : arm)));
      setHistory((h) => [...h, { arm: i, reward }]);
      setFlash({ arm: i, reward, id: s });
      return s + 1;
    });
  }, [probs, T]);

  const newGame = useCallback((nextK = k) => {
    const np = randomProbs(nextK);
    setProbs(np);
    setArms(freshArms(np));
    setStep(0);
    setHistory([]);
    setReveal(false);
    setFlash(null);
  }, [k]);

  const onKChange = (nextK: number) => {
    setK(nextK);
    newGame(nextK);
  };

  // Keyboard: number keys 1..K pull the corresponding arm; R starts a new game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key >= '1' && e.key <= String(arms.length)) {
        pull(Number(e.key) - 1);
      } else if (e.key.toLowerCase() === 'r') {
        newGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [arms.length, pull, newGame]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{t.armCount}</span>
            <input
              type="number"
              aria-label={t.armCount}
              value={k}
              min={MIN_K}
              max={MAX_K}
              onChange={(e) => onKChange(Math.max(MIN_K, Math.min(MAX_K, Number(e.target.value) || MIN_K)))}
              style={inputStyle(80)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{t.pullLimit}</span>
            <input
              type="number"
              aria-label={t.pullLimit}
              value={T}
              min={10}
              max={500}
              onChange={(e) => setT(Number(e.target.value) || 50)}
              style={inputStyle(80)}
            />
          </label>
          <button onClick={() => newGame()} style={btn('#22c55e')}>{t.newGame}</button>
          <button
            onClick={() => setReveal((r) => !r)}
            aria-pressed={reveal}
            style={btn('#1e293b', false, '#94a3b8', '#334155')}
          >
            {reveal ? t.hideProbs : t.showProbs}
          </button>
          <button
            onClick={() => setShowHint((h) => !h)}
            aria-pressed={showHint}
            style={btn(showHint ? '#f59e0b' : '#1e293b', false, showHint ? '#0f172a' : '#94a3b8', showHint ? '#f59e0b' : '#334155')}
          >
            {showHint ? t.hintOn : t.hintOff}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${arms.length}, 1fr)`, gap: '0.5rem', marginBottom: '0.8rem' }}>
          {arms.map((arm, i) => {
            const empMean = arm.pulls === 0 ? null : arm.rewards / arm.pulls;
            const [lo, hi] = wilsonInterval(arm.rewards, arm.pulls);
            const color = ARM_PALETTE[i % ARM_PALETTE.length];
            const isHinted = i === hintedArm;
            const isFlashing = flash?.arm === i;
            return (
              <button
                key={i}
                onClick={() => pull(i)}
                disabled={done}
                aria-label={`${t.armLabel(i + 1)}, ${t.pulledTimes(arm.pulls, arm.rewards)}${empMean === null ? '' : `, ${t.empMean} ${empMean.toFixed(3)}`}`}
                style={{
                  background: done ? '#1e293b' : '#0f172a',
                  border: `2px solid ${isHinted ? '#f59e0b' : color}`,
                  boxShadow: isHinted ? '0 0 0 3px #f59e0b44' : isFlashing ? `0 0 0 3px ${flash?.reward ? '#4ade8088' : '#64748b55'}` : 'none',
                  borderRadius: 12,
                  padding: '0.75rem 0.5rem 0.6rem',
                  cursor: done ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.3rem',
                  color: '#fff',
                  transition: 'box-shadow 0.15s, transform 0.1s',
                  transform: isFlashing ? 'translateY(-2px)' : 'none',
                }}
              >
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>{t.armLabel(i + 1)}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{t.pulledTimes(arm.pulls, arm.rewards)}</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#cbd5e1' }}>
                  {t.empMean}: {empMean === null ? '—' : empMean.toFixed(3)}
                </div>
                <ConfidenceBar lo={lo} hi={hi} mean={empMean} color={color} pulls={arm.pulls} />
                {reveal && (
                  <div style={{ fontSize: '0.75rem', color: '#fbbf24' }}>{t.trueValue}: {arm.trueP.toFixed(2)}</div>
                )}
                {isHinted && (
                  <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 700 }}>
                    {t.suggestsPull(HINT_LABEL[language])}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', maxHeight: 80, overflowY: 'auto', padding: '0.4rem', background: '#020617', borderRadius: 8, border: '1px solid #1e293b' }} aria-label="history">
          {history.length === 0 && <span style={{ color: '#475569', fontSize: '0.75rem' }}>{t.notPulledYet}</span>}
          {history.map((h, i) => (
            <span
              key={i}
              title={`step ${i + 1}: ${t.armLabel(h.arm + 1)} → ${h.reward}`}
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
        <div style={{ marginTop: '0.4rem', color: '#475569', fontSize: '0.7rem' }}>
          {language === 'ja' ? 'キー: 1〜K で各アーム / R で新ゲーム' : 'Keys: 1–K to pull an arm / R for a new game'}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.6rem', color: '#fbbf24' }}>{t.progress}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label={t.remainingPulls} value={`${T - step} / ${T}`} color="#67e8f9" />
          <Stat label={t.cumReward} value={`${totalReward}`} color="#4ade80" />
          <Stat label={t.optimalReward} value={optimalReward.toFixed(1)} color="#fbbf24" />
          <Stat label={t.cumRegret} value={regret.toFixed(2)} color={regret < 0.5 ? '#4ade80' : '#f472b6'} />
        </div>

        {step > 0 && (
          <div style={{ marginTop: '0.6rem', height: 6, borderRadius: 3, background: '#1e293b', overflow: 'hidden' }} aria-hidden>
            <div style={{ width: `${(step / T) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #67e8f9)', transition: 'width 0.2s' }} />
          </div>
        )}

        {done && (
          <div style={{ marginTop: '0.8rem', padding: '0.7rem 0.9rem', borderRadius: 10, background: '#15803d44', border: '1px solid #4ade80', color: '#4ade80', fontWeight: 700 }} role="status">
            ✓ {t.finished} {t.finishedDetail(totalReward, T, ((totalReward / T) * 100).toFixed(1))}
            <div style={{ fontSize: '0.85rem', fontWeight: 400, color: '#cbd5e1', marginTop: '0.4rem' }}>
              {t.trueProbsAre}: {probs.map((p, i) => `${t.armLabel(i + 1)}=${p.toFixed(2)}`).join(' / ')}
              <br />{t.bestArmExpected(optimalReward.toFixed(1))}。{t.yourRegret(regret.toFixed(2))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#020617', border: '1px solid #1e293b', borderRadius: 10, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <strong style={{ color: '#fbbf24' }}>{t.explainTitle}</strong> {t.explainBody}
        </div>
      </div>
    </div>
  );
};

// Confidence bar: a horizontal track showing the Wilson 95% interval for the
// arm's win-rate, with a marker at the empirical mean. Narrower band = more
// certain (more pulls). Communicates "explore vs exploit" visually.
const ConfidenceBar = ({ lo, hi, mean, color, pulls }: { lo: number; hi: number; mean: number | null; color: string; pulls: number }) => (
  <div
    style={{ width: '100%', height: 8, borderRadius: 4, background: '#1e293b', position: 'relative', marginTop: '0.1rem' }}
    title={pulls === 0 ? 'no data' : `95% CI: ${lo.toFixed(2)}–${hi.toFixed(2)}`}
    aria-hidden
  >
    {pulls > 0 && (
      <>
        <div style={{ position: 'absolute', left: `${lo * 100}%`, width: `${Math.max(2, (hi - lo) * 100)}%`, top: 0, bottom: 0, background: `${color}55`, borderRadius: 4 }} />
        {mean !== null && (
          <div style={{ position: 'absolute', left: `calc(${mean * 100}% - 1px)`, top: -1, bottom: -1, width: 2, background: color }} />
        )}
      </>
    )}
  </div>
);

const inputStyle = (width: number): React.CSSProperties => ({
  background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.9rem', width,
});

const btn = (bg: string, disabled = false, color = '#fff', border?: string): React.CSSProperties => ({
  background: disabled ? '#1e293b' : bg,
  color: disabled ? '#475569' : color,
  border: border ? `1px solid ${border}` : 'none',
  borderRadius: 10,
  padding: '0.55rem 1.1rem',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
});

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div style={{ background: '#020617', border: `1px solid ${color}44`, borderRadius: 10, padding: '0.55rem 0.7rem' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{label}</div>
    <div style={{ color, fontSize: '1.25rem', fontWeight: 800 }}>{value}</div>
  </div>
);
