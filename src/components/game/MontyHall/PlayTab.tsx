'use client';

import { useRef, useState } from 'react';
import { Door, Round, playRound, otherDoor, won } from './engine';

type Phase = 'pick' | 'reveal' | 'final';

interface Stats {
  stayWins: number;
  stayTotal: number;
  switchWins: number;
  switchTotal: number;
}

const INITIAL_STATS: Stats = { stayWins: 0, stayTotal: 0, switchWins: 0, switchTotal: 0 };

const doorEmoji = (state: 'closed' | 'goat' | 'prize') =>
  state === 'closed' ? '🚪' : state === 'goat' ? '🐐' : '🎁';

export const PlayTab = () => {
  const [phase, setPhase] = useState<Phase>('pick');
  const [round, setRound] = useState<Round | null>(null);
  const [finalDoor, setFinalDoor] = useState<Door | null>(null);
  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  // Track whether the player's final action was a switch — used to attribute
  // the result to the right strategy counter.
  const switchedRef = useRef(false);

  const pick = (door: Door) => {
    if (phase !== 'pick') return;
    setRound(playRound(door));
    setPhase('reveal');
  };

  const decide = (switchDoor: boolean) => {
    if (phase !== 'reveal' || !round) return;
    const finalChoice = switchDoor ? otherDoor(round.pickedDoor, round.openedDoor) : round.pickedDoor;
    switchedRef.current = switchDoor;
    setFinalDoor(finalChoice);
    setPhase('final');
    const w = won(round, finalChoice);
    setStats((s) => ({
      stayWins: s.stayWins + (!switchDoor && w ? 1 : 0),
      stayTotal: s.stayTotal + (!switchDoor ? 1 : 0),
      switchWins: s.switchWins + (switchDoor && w ? 1 : 0),
      switchTotal: s.switchTotal + (switchDoor ? 1 : 0),
    }));
  };

  const nextRound = () => {
    setPhase('pick');
    setRound(null);
    setFinalDoor(null);
  };

  const resetStats = () => {
    setStats(INITIAL_STATS);
    nextRound();
  };

  const doorState = (i: Door): 'closed' | 'goat' | 'prize' => {
    if (!round) return 'closed';
    if (phase === 'reveal' && i === round.openedDoor) return 'goat';
    if (phase === 'final') {
      if (i === round.prizeDoor) return 'prize';
      return 'goat';
    }
    return 'closed';
  };

  const isPickedNow = (i: Door) => {
    if (!round) return false;
    if (phase === 'final' && finalDoor !== null) return finalDoor === i;
    return round.pickedDoor === i;
  };

  const justWon = phase === 'final' && finalDoor !== null && round !== null && won(round, finalDoor);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
          {[0, 1, 2].map((i) => {
            const state = doorState(i as Door);
            const picked = isPickedNow(i as Door);
            return (
              <button
                key={i}
                onClick={() => pick(i as Door)}
                disabled={phase !== 'pick'}
                style={{
                  fontSize: '3.5rem',
                  height: 130,
                  background: state === 'prize' ? '#15803d' : state === 'goat' ? '#1e293b' : picked ? '#f59e0b' : '#0f172a',
                  color: '#fff',
                  border: `2px solid ${picked ? '#fbbf24' : '#334155'}`,
                  borderRadius: 12,
                  cursor: phase === 'pick' ? 'pointer' : 'default',
                  transition: 'background 0.2s, border-color 0.2s',
                }}
                aria-label={`Door ${i + 1}`}
              >
                {doorEmoji(state)}
              </button>
            );
          })}
        </div>

        <div style={{ minHeight: 56 }}>
          {phase === 'pick' && (
            <p style={{ color: '#cbd5e1', margin: 0 }}>3つのドアのうち1つに🎁、残り2つに🐐がいます。最初に1つ選んでください。</p>
          )}
          {phase === 'reveal' && round && (
            <div>
              <p style={{ color: '#cbd5e1', margin: '0 0 0.5rem' }}>
                ホストがドア{round.openedDoor + 1}を開けて🐐を見せました。残りのドアに変えますか？
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => decide(true)} style={btnStyle('#22c55e')}>変える (Switch)</button>
                <button onClick={() => decide(false)} style={btnStyle('#64748b')}>そのまま (Stay)</button>
              </div>
            </div>
          )}
          {phase === 'final' && round && finalDoor !== null && (
            <div>
              <p style={{ color: justWon ? '#4ade80' : '#f87171', margin: '0 0 0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
                {justWon ? '🎉 当たり！' : '😢 はずれ'} — あなたは{switchedRef.current ? '変えた' : 'そのまま'}
              </p>
              <button onClick={nextRound} style={btnStyle('#22c55e')}>次のラウンド</button>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.6rem', color: '#fbbf24' }}>あなたの戦績</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <StatCard
            label="そのまま (Stay)"
            wins={stats.stayWins}
            total={stats.stayTotal}
            theoretical={1 / 3}
            color="#94a3b8"
          />
          <StatCard
            label="変える (Switch)"
            wins={stats.switchWins}
            total={stats.switchTotal}
            theoretical={2 / 3}
            color="#4ade80"
          />
        </div>
        <p style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5 }}>
          理論値は Stay 1/3 ≈ 33.3%、Switch 2/3 ≈ 66.7%。サンプル数が少ないうちは結果がブレますが、シミュレーションタブで何万回も試すと収束が見えます。
        </p>
        <div style={{ marginTop: '0.8rem' }}>
          <button onClick={resetStats} style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 10, padding: '0.45rem 1rem', cursor: 'pointer' }}>
            戦績リセット
          </button>
        </div>
      </div>
    </div>
  );
};

const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '0.55rem 1.1rem',
  fontWeight: 700,
  cursor: 'pointer',
});

const StatCard = ({ label, wins, total, theoretical, color }: { label: string; wins: number; total: number; theoretical: number; color: string }) => {
  const rate = total === 0 ? null : wins / total;
  return (
    <div style={{ background: '#020617', border: `1px solid ${color}55`, borderRadius: 10, padding: '0.6rem 0.7rem' }}>
      <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}</div>
      <div style={{ color, fontSize: '1.4rem', fontWeight: 800 }}>
        {rate === null ? '—' : `${(rate * 100).toFixed(1)}%`}
      </div>
      <div style={{ color: '#475569', fontSize: '0.7rem' }}>
        {wins} / {total} (理論 {(theoretical * 100).toFixed(1)}%)
      </div>
    </div>
  );
};
