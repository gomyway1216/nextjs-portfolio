'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Wheel, WHEEL_SPIN_MS } from './Wheel';
import { Bet, colorOf, payoutMultiplier, RED_NUMBERS, spin } from './engine';

const CHIP_VALUES = [1, 5, 10, 25, 100];
const INITIAL_BANKROLL = 1000;

type BetKey = string;
const keyOf = (bet: Bet): BetKey => {
  if (bet.kind === 'straight') return `straight:${bet.number}`;
  if (bet.kind === 'dozen') return `dozen:${bet.which}`;
  return bet.kind;
};

interface PlacedBet {
  bet: Bet;
  amount: number;
}

export const PlayTab = () => {
  const [bankroll, setBankroll] = useState(INITIAL_BANKROLL);
  const [chip, setChip] = useState(CHIP_VALUES[1]);
  const [bets, setBets] = useState<Record<BetKey, PlacedBet>>({});
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [spinId, setSpinId] = useState(0);
  const [lastNet, setLastNet] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  // Refs guard against state-lag races: setSpinning(true) doesn't take effect
  // until the next render, so a fast second click would otherwise schedule a
  // duplicate spin. Same for placeBet reading stale totalWagered.
  const spinningRef = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const bankrollRef = useRef(bankroll);
  bankrollRef.current = bankroll;

  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
  }, []);

  const totalWagered = useMemo(
    () => Object.values(bets).reduce((sum, b) => sum + b.amount, 0),
    [bets],
  );

  const placeBet = (bet: Bet) => {
    if (spinningRef.current) return;
    const k = keyOf(bet);
    setBets((prev) => {
      const currentTotal = Object.values(prev).reduce((sum, b) => sum + b.amount, 0);
      if (chip > bankrollRef.current - currentTotal) return prev;
      const existing = prev[k];
      const amount = (existing?.amount ?? 0) + chip;
      return { ...prev, [k]: { bet, amount } };
    });
  };

  const clearBets = () => {
    if (spinningRef.current) return;
    setBets({});
  };

  const doSpin = () => {
    if (spinningRef.current || totalWagered === 0) return;
    spinningRef.current = true;
    setSpinning(true);
    setLastNet(null);
    const wagered = totalWagered;
    const snapshotBets = bets;
    const r = spin();
    setResult(r);
    setSpinId((id) => id + 1);

    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      let winnings = 0;
      for (const { bet, amount } of Object.values(snapshotBets)) {
        winnings += amount * payoutMultiplier(bet, r);
      }
      const net = winnings - wagered;
      setBankroll((b) => b + net);
      setLastNet(net);
      setHistory((h) => [r, ...h].slice(0, 12));
      setBets({});
      spinningRef.current = false;
      setSpinning(false);
    }, WHEEL_SPIN_MS + 100);
  };

  const reset = () => {
    setBankroll(INITIAL_BANKROLL);
    setBets({});
    setLastNet(null);
    setHistory([]);
    setResult(null);
    setSpinId(0);
  };

  const numberGrid: number[][] = useMemo(() => {
    // Standard 3x12 grid (rows 3,2,1 top to bottom)
    const rows: number[][] = [[], [], []];
    for (let n = 1; n <= 36; n++) {
      const row = 2 - ((n - 1) % 3);
      rows[row].push(n);
    }
    return rows;
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
      <div>
        <Wheel result={result} spinId={spinId} />

        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          {result !== null && !spinning && (
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: colorOf(result) === 'red' ? '#f87171' : colorOf(result) === 'green' ? '#4ade80' : '#cbd5e1' }}>
              {result} ({colorOf(result)})
            </div>
          )}
          {lastNet !== null && (
            <div style={{ marginTop: '0.3rem', color: lastNet >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
              {lastNet >= 0 ? `+${lastNet}` : lastNet}
            </div>
          )}
        </div>

        <div style={{ marginTop: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.3rem' }}>直近の出目</div>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {history.length === 0 && <span style={{ color: '#475569', fontSize: '0.85rem' }}>（まだなし）</span>}
            {history.map((n, i) => (
              <span
                key={i}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: colorOf(n) === 'red' ? '#dc2626' : colorOf(n) === 'green' ? '#15803d' : '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <Pill label={`所持金: ${bankroll}`} accent="#fbbf24" />
          <Pill label={`賭け合計: ${totalWagered}`} accent="#67e8f9" />
          <Pill label={`使用可能: ${bankroll - totalWagered}`} accent="#a78bfa" />
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem', alignSelf: 'center' }}>チップ:</span>
          {CHIP_VALUES.map((v) => (
            <button
              key={v}
              onClick={() => setChip(v)}
              disabled={spinning}
              style={{
                background: chip === v ? '#f59e0b' : '#1e293b',
                color: chip === v ? '#0f172a' : '#e2e8f0',
                border: `1px solid ${chip === v ? '#f59e0b' : '#334155'}`,
                borderRadius: '999px',
                padding: '0.35rem 0.75rem',
                fontWeight: 700,
                cursor: spinning ? 'not-allowed' : 'pointer',
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Number grid (0 + 1-36) */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.4rem' }}>
          <BetCell
            label="0"
            bg="#15803d"
            chips={bets['straight:0']?.amount}
            onClick={() => placeBet({ kind: 'straight', number: 0 })}
            disabled={spinning}
            style={{ flex: '0 0 36px', height: 'auto' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.2rem', flex: 1 }}>
            {numberGrid.flat().map((n) => (
              <BetCell
                key={n}
                label={String(n)}
                bg={RED_NUMBERS.has(n) ? '#dc2626' : '#0f172a'}
                chips={bets[`straight:${n}`]?.amount}
                onClick={() => placeBet({ kind: 'straight', number: n })}
                disabled={spinning}
              />
            ))}
          </div>
        </div>

        {/* Dozens */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.2rem', marginBottom: '0.4rem' }}>
          {[1, 2, 3].map((w) => (
            <BetCell
              key={w}
              label={`${(w - 1) * 12 + 1}-${w * 12} (2:1)`}
              bg="#334155"
              chips={bets[`dozen:${w}`]?.amount}
              onClick={() => placeBet({ kind: 'dozen', which: w as 1 | 2 | 3 })}
              disabled={spinning}
            />
          ))}
        </div>

        {/* Outside even-money */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.2rem', marginBottom: '0.75rem' }}>
          <BetCell label="1-18" bg="#334155" chips={bets['low']?.amount} onClick={() => placeBet({ kind: 'low' })} disabled={spinning} />
          <BetCell label="EVEN" bg="#334155" chips={bets['even']?.amount} onClick={() => placeBet({ kind: 'even' })} disabled={spinning} />
          <BetCell label="RED" bg="#dc2626" chips={bets['red']?.amount} onClick={() => placeBet({ kind: 'red' })} disabled={spinning} />
          <BetCell label="BLACK" bg="#0f172a" chips={bets['black']?.amount} onClick={() => placeBet({ kind: 'black' })} disabled={spinning} />
          <BetCell label="ODD" bg="#334155" chips={bets['odd']?.amount} onClick={() => placeBet({ kind: 'odd' })} disabled={spinning} />
          <BetCell label="19-36" bg="#334155" chips={bets['high']?.amount} onClick={() => placeBet({ kind: 'high' })} disabled={spinning} />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={doSpin}
            disabled={spinning || totalWagered === 0}
            style={{
              background: spinning || totalWagered === 0 ? '#1e293b' : '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '0.65rem 1.2rem',
              fontWeight: 800,
              cursor: spinning || totalWagered === 0 ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
            }}
          >
            {spinning ? 'Spinning…' : 'SPIN'}
          </button>
          <button
            onClick={clearBets}
            disabled={spinning || totalWagered === 0}
            style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '10px', padding: '0.55rem 1rem', cursor: 'pointer' }}
          >
            Clear
          </button>
          <button
            onClick={reset}
            disabled={spinning}
            style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '10px', padding: '0.55rem 1rem', cursor: 'pointer', marginLeft: 'auto' }}
          >
            Reset
          </button>
        </div>

        <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.8rem' }}>
          チップを選んでベットエリアをクリック→SPIN。所持金がゼロになったら Reset で再開できます。
        </p>
      </div>
    </div>
  );
};

const Pill = ({ label, accent }: { label: string; accent: string }) => (
  <span style={{ borderRadius: 999, border: `1px solid ${accent}55`, background: '#0f172a', color: accent, padding: '0.35rem 0.8rem', fontWeight: 700, fontSize: '0.9rem' }}>
    {label}
  </span>
);

interface BetCellProps {
  label: string;
  bg: string;
  chips?: number;
  onClick: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}
const BetCell = ({ label, bg, chips, onClick, disabled, style }: BetCellProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      position: 'relative',
      background: bg,
      color: '#fff',
      border: '1px solid #334155',
      borderRadius: 6,
      padding: '0.5rem 0.2rem',
      fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: '0.8rem',
      minHeight: 32,
      ...style,
    }}
  >
    {label}
    {chips !== undefined && chips > 0 && (
      <span
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          background: '#f59e0b',
          color: '#0f172a',
          borderRadius: '50%',
          width: 22,
          height: 22,
          fontSize: '0.7rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          border: '2px solid #0f172a',
        }}
      >
        {chips}
      </span>
    )}
  </button>
);
