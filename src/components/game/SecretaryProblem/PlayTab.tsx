'use client';

import { useMemo, useState } from 'react';
import { generateCandidates, SUGGESTED_R_RATIO } from './engine';

const DEFAULT_N = 20;
const MIN_N = 5;
const MAX_N = 50;

interface Stats {
  games: number;
  wins: number;
}

const INITIAL_STATS: Stats = { games: 0, wins: 0 };

type Phase = 'idle' | 'interviewing' | 'done';

interface RoundState {
  candidates: number[];
  current: number; // index of next reveal
  rejected: number[];
  picked: number | null;
  pickedIndex: number | null;
  forcedLast: boolean;
}

const freshRound = (n: number): RoundState => ({
  candidates: generateCandidates(n),
  current: 0,
  rejected: [],
  picked: null,
  pickedIndex: null,
  forcedLast: false,
});

export const PlayTab = () => {
  const [n, setN] = useState(DEFAULT_N);
  const [round, setRound] = useState<RoundState>(() => freshRound(DEFAULT_N));
  const [phase, setPhase] = useState<Phase>('idle');
  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  const [showHint, setShowHint] = useState(true);

  const suggestedR = Math.round(n * SUGGESTED_R_RATIO);
  const bestSoFarInSkip = useMemo(() => {
    if (round.current < suggestedR) return null;
    let m = -Infinity;
    for (let i = 0; i < suggestedR; i++) m = Math.max(m, round.candidates[i]);
    return m === -Infinity ? null : m;
  }, [round.candidates, round.current, suggestedR]);

  const start = () => {
    setRound(freshRound(n));
    setPhase('interviewing');
  };

  const onNChange = (next: number) => {
    setN(next);
    setRound(freshRound(next));
    setPhase('idle');
  };

  const revealed = round.candidates.slice(0, round.current);
  const currentVal = round.current < round.candidates.length ? round.candidates[round.current] : null;
  const isCurrentBestSoFar = currentVal !== null && revealed.every((v) => v < currentVal);

  const recommendation: 'reject' | 'accept' | null = useMemo(() => {
    if (phase !== 'interviewing' || currentVal === null) return null;
    // Skip phase: always reject.
    if (round.current < suggestedR) return 'reject';
    // Decision phase: accept iff strictly greater than all previously seen.
    return isCurrentBestSoFar ? 'accept' : 'reject';
  }, [phase, round.current, suggestedR, currentVal, isCurrentBestSoFar]);

  const accept = () => {
    if (phase !== 'interviewing' || currentVal === null) return;
    const isBest = currentVal === Math.max(...round.candidates);
    setRound((r) => ({ ...r, picked: currentVal, pickedIndex: r.current }));
    setStats((s) => ({ games: s.games + 1, wins: s.wins + (isBest ? 1 : 0) }));
    setPhase('done');
  };

  const reject = () => {
    if (phase !== 'interviewing' || currentVal === null) return;
    setRound((r) => {
      const nextRejected = [...r.rejected, currentVal];
      const nextCurrent = r.current + 1;
      if (nextCurrent >= r.candidates.length) {
        // forced last
        const last = r.candidates[r.candidates.length - 1];
        const isBest = last === Math.max(...r.candidates);
        setStats((s) => ({ games: s.games + 1, wins: s.wins + (isBest ? 1 : 0) }));
        setPhase('done');
        return { ...r, rejected: nextRejected.slice(0, -1), picked: last, pickedIndex: r.candidates.length - 1, forcedLast: true, current: r.candidates.length };
      }
      return { ...r, rejected: nextRejected, current: nextCurrent };
    });
  };

  const resetStats = () => setStats(INITIAL_STATS);
  const won = phase === 'done' && round.picked !== null && round.picked === Math.max(...round.candidates);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>候補者数 n</span>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>n = {n}</span>
          </div>
          <input
            type="range"
            min={MIN_N}
            max={MAX_N}
            value={n}
            onChange={(e) => onNChange(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b' }}
            disabled={phase === 'interviewing'}
          />
          <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '0.2rem' }}>
            推奨スキップ: 最初の <strong style={{ color: '#fbbf24' }}>{suggestedR}</strong> 人 (n/e ≈ {(SUGGESTED_R_RATIO * 100).toFixed(1)}%)
          </div>
        </label>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
          {phase === 'idle' && <button onClick={start} style={btn('#22c55e')}>▶ 面接開始</button>}
          {phase === 'interviewing' && (
            <>
              <button onClick={accept} style={btn('#22c55e')}>採用 ({currentVal}){showHint && recommendation === 'accept' ? ' 💡' : ''}</button>
              <button onClick={reject} style={btn('#f97316')}>見送り{showHint && recommendation === 'reject' ? ' 💡' : ''}</button>
            </>
          )}
          {phase === 'done' && (
            <button onClick={start} style={btn('#22c55e')}>次のラウンド</button>
          )}
          <button onClick={() => onNChange(n)} disabled={phase === 'interviewing'} style={btn('#1e293b', phase === 'interviewing', '#94a3b8', '#334155')}>
            リセット
          </button>
        </div>

        <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: '0.6rem 0.7rem', marginBottom: '0.8rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.3rem' }}>現在のスコア</div>
          {phase === 'interviewing' && currentVal !== null ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <div style={{ color: isCurrentBestSoFar ? '#4ade80' : '#e2e8f0', fontSize: '2.2rem', fontWeight: 800 }}>{currentVal}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                ({round.current + 1} / {n} 人目{isCurrentBestSoFar ? ' · これまでで最高' : ''})
              </div>
            </div>
          ) : (
            <div style={{ color: '#475569', fontSize: '1rem' }}>—</div>
          )}
          {bestSoFarInSkip !== null && phase === 'interviewing' && (
            <div style={{ marginTop: '0.3rem', color: '#fbbf24', fontSize: '0.78rem' }}>
              スキップ期の最高スコア: <strong>{bestSoFarInSkip}</strong> (これを超えたら採用が基本戦略)
            </div>
          )}
        </div>

        <div>
          <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginBottom: '0.3rem' }}>これまでの候補者</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {round.candidates.map((v, i) => {
              const inSkip = i < suggestedR;
              const isCurrent = i === round.current && phase === 'interviewing';
              const isPicked = round.pickedIndex === i;
              const isRejected = i < round.current;
              const visible = isRejected || isCurrent || (phase === 'done' && i === round.pickedIndex);
              const bg = isPicked ? (won ? '#15803d' : '#7f1d1d') : isCurrent ? '#f59e0b' : isRejected ? '#0f172a' : '#1e293b';
              const color = isPicked ? '#fff' : isCurrent ? '#0f172a' : isRejected ? '#64748b' : '#475569';
              const border = inSkip ? '#475569' : '#334155';
              return (
                <span
                  key={i}
                  style={{
                    minWidth: 30,
                    textAlign: 'center',
                    padding: '0.2rem 0.4rem',
                    background: bg,
                    color,
                    border: `1px solid ${border}`,
                    borderTop: inSkip ? `3px solid #fbbf24` : `1px solid ${border}`,
                    borderRadius: 4,
                    fontSize: '0.78rem',
                    fontWeight: isCurrent || isPicked ? 800 : 500,
                  }}
                  title={inSkip ? `スキップ期 (第 ${i + 1} 候補)` : `決定期 (第 ${i + 1} 候補)`}
                >
                  {visible ? v : '?'}
                </span>
              );
            })}
          </div>
          <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: '0.3rem' }}>
            上端の黄ライン = スキップ期 (n/e 人)。?= 未公開。
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.6rem', color: '#fbbf24' }}>結果 & あなたの戦績</h3>

        {phase === 'done' && round.picked !== null && (
          <div style={{ marginBottom: '0.8rem', padding: '0.7rem 0.9rem', borderRadius: 10, background: won ? '#15803d44' : '#7f1d1d44', border: `1px solid ${won ? '#4ade80' : '#f87171'}`, color: won ? '#4ade80' : '#fca5a5', fontWeight: 700 }}>
            {won ? '🏆 大正解！' : '😅 ハズレ'} あなたが採用したのはスコア {round.picked}
            {round.forcedLast && ' (最後まで誰も超えず、最終候補を強制採用)'}
            。実際の最高スコア: <strong>{Math.max(...round.candidates)}</strong>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <Stat label="プレイ回数" value={`${stats.games}`} color="#67e8f9" />
          <Stat label="正解率" value={stats.games === 0 ? '—' : `${((stats.wins / stats.games) * 100).toFixed(1)}%`} color="#4ade80" />
          <Stat label="正解数" value={`${stats.wins}`} color="#4ade80" />
          <Stat label="理論最大 (n→∞)" value={`${(SUGGESTED_R_RATIO * 100).toFixed(1)}%`} color="#fbbf24" />
        </div>

        <div style={{ marginTop: '0.8rem' }}>
          <button onClick={resetStats} style={btn('#1e293b', false, '#94a3b8', '#334155')}>戦績リセット</button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.8rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} /> 最適戦略のヒント (💡) を表示
        </label>

        <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: '#020617', border: '1px solid #1e293b', borderRadius: 10, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <strong style={{ color: '#fbbf24' }}>秘書問題:</strong> 候補者を1人ずつ面接し、その場で <strong>採用 / 見送り</strong> を決める。
          見送った候補には戻れない。<strong>最高スコアの 1 人</strong>を当てるのが目標。<br />
          <strong>37% ルール:</strong> 最初の n/e 人は無条件で見送って「観測期」とする。
          以後、<strong>観測期の最高を超えた最初の候補</strong>を採用する。これで <strong>~36.8%</strong> の確率で正解できる。
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
    <div style={{ color, fontSize: '1.3rem', fontWeight: 800 }}>{value}</div>
  </div>
);
