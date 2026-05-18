'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Wheel, WHEEL_SPIN_MS } from './Wheel';
import { Bet, colorOf, payoutMultiplier, RED_NUMBERS, spin } from './engine';

const CHIP_VALUES = [1, 5, 10, 25, 100];
const INITIAL_BANKROLL = 1000;

// Number-grid geometry: 12 cols × 3 rows. Row 0 is top (3, 6, 9, ...), row 2 is
// bottom (1, 4, 7, ...). numberAt(col, row) returns the cell's number.
const CELL_W = 100 / 12;
const CELL_H = 100 / 3;
const numberAt = (k: number, r: number) => 3 * k + (3 - r);

// Precompute inside-bet metadata (number sets + grid positions). 0-involving
// splits (0-1, 0-2, 0-3) and trios (0-1-2, 0-2-3) are intentionally omitted —
// would need to bridge the standalone 0 cell to the main grid.
const V_SPLITS: { k: number; r: number; numbers: [number, number] }[] = [];
for (let k = 0; k < 11; k++) {
  for (let r = 0; r < 3; r++) {
    V_SPLITS.push({ k, r, numbers: [numberAt(k, r), numberAt(k + 1, r)] });
  }
}
const H_SPLITS: { k: number; r: number; numbers: [number, number] }[] = [];
for (let k = 0; k < 12; k++) {
  for (let r = 0; r < 2; r++) {
    // Bottom row first so numbers are ascending — lets keyOf skip a runtime sort.
    H_SPLITS.push({ k, r, numbers: [numberAt(k, r + 1), numberAt(k, r)] });
  }
}
const CORNERS: { k: number; r: number; numbers: [number, number, number, number] }[] = [];
for (let k = 0; k < 11; k++) {
  for (let r = 0; r < 2; r++) {
    // Ascending order: bottom-left, top-left, bottom-right, top-right
    // (e.g. for k=0,r=1 → [1, 2, 4, 5]).
    CORNERS.push({
      k,
      r,
      numbers: [numberAt(k, r + 1), numberAt(k, r), numberAt(k + 1, r + 1), numberAt(k + 1, r)],
    });
  }
}
const STREETS: { numbers: [number, number, number] }[] = [];
for (let k = 0; k < 12; k++) {
  STREETS.push({ numbers: [3 * k + 1, 3 * k + 2, 3 * k + 3] });
}
const LINES: { k: number; numbers: [number, number, number, number, number, number] }[] = [];
for (let k = 0; k < 11; k++) {
  LINES.push({ k, numbers: [3 * k + 1, 3 * k + 2, 3 * k + 3, 3 * k + 4, 3 * k + 5, 3 * k + 6] });
}

type BetKey = string;
// All bet metadata is built with `numbers` already sorted ascending, so keyOf
// can join directly without a per-call sort.
const keyOf = (bet: Bet): BetKey => {
  if (bet.kind === 'straight') return `straight:${bet.number}`;
  if (bet.kind === 'dozen') return `dozen:${bet.which}`;
  if (bet.kind === 'split' || bet.kind === 'street' || bet.kind === 'corner' || bet.kind === 'line') {
    return `${bet.kind}:${bet.numbers.join('-')}`;
  }
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

        {/* Number grid (0 + 1-36) with overlaid Split / Corner hit zones */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.4rem' }}>
          <BetCell
            label="0"
            bg="#15803d"
            chips={bets['straight:0']?.amount}
            onClick={() => placeBet({ kind: 'straight', number: 0 })}
            disabled={spinning}
            style={{ flex: '0 0 36px', height: 'auto' }}
          />
          <div style={{ position: 'relative', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 0 }}>
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

            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {V_SPLITS.map(({ k, r, numbers }) => {
                const bet = { kind: 'split', numbers } as const;
                return (
                  <HitZone
                    key={keyOf(bet)}
                    chips={bets[keyOf(bet)]?.amount}
                    disabled={spinning}
                    onClick={() => placeBet(bet)}
                    title={`Split ${numbers.join(', ')} (17:1)`}
                    style={{ left: `${(k + 1) * CELL_W}%`, top: `${(r + 0.5) * CELL_H}%`, width: 14, height: `${CELL_H * 0.55}%`, transform: 'translate(-50%, -50%)' }}
                  />
                );
              })}
              {H_SPLITS.map(({ k, r, numbers }) => {
                const bet = { kind: 'split', numbers } as const;
                return (
                  <HitZone
                    key={keyOf(bet)}
                    chips={bets[keyOf(bet)]?.amount}
                    disabled={spinning}
                    onClick={() => placeBet(bet)}
                    title={`Split ${numbers.join(', ')} (17:1)`}
                    style={{ left: `${(k + 0.5) * CELL_W}%`, top: `${(r + 1) * CELL_H}%`, width: `${CELL_W * 0.55}%`, height: 14, transform: 'translate(-50%, -50%)' }}
                  />
                );
              })}
              {CORNERS.map(({ k, r, numbers }) => {
                const bet = { kind: 'corner', numbers } as const;
                return (
                  <HitZone
                    key={keyOf(bet)}
                    chips={bets[keyOf(bet)]?.amount}
                    disabled={spinning}
                    onClick={() => placeBet(bet)}
                    title={`Corner ${numbers.join(', ')} (8:1)`}
                    style={{ left: `${(k + 1) * CELL_W}%`, top: `${(r + 1) * CELL_H}%`, width: 18, height: 18, borderRadius: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Streets (1 per column, 11:1) */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.4rem' }}>
          <div style={{ flex: '0 0 36px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 0, flex: 1 }}>
            {STREETS.map(({ numbers }, k) => {
              const bet = { kind: 'street', numbers } as const;
              return (
                <BetCell
                  key={keyOf(bet)}
                  label={`${3 * k + 1}-${3 * k + 3}`}
                  bg="#1e293b"
                  chips={bets[keyOf(bet)]?.amount}
                  onClick={() => placeBet(bet)}
                  disabled={spinning}
                  style={{ fontSize: '0.65rem', minHeight: 24, color: '#94a3b8' }}
                />
              );
            })}
          </div>
        </div>

        {/* Lines (2 streets = 6 nums, 5:1) — centered on column boundaries */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.4rem' }}>
          <div style={{ flex: '0 0 36px' }} />
          <div style={{ position: 'relative', flex: 1, height: 24 }}>
            {LINES.map(({ k, numbers }) => {
              const bet = { kind: 'line', numbers } as const;
              return (
                <BetCell
                  key={keyOf(bet)}
                  label={`${numbers[0]}-${numbers[5]}`}
                  bg="#1e293b"
                  chips={bets[keyOf(bet)]?.amount}
                  onClick={() => placeBet(bet)}
                  disabled={spinning}
                  style={{
                    position: 'absolute',
                    left: `${(k + 1) * CELL_W}%`,
                    top: 0,
                    width: `${CELL_W}%`,
                    height: '100%',
                    transform: 'translateX(-50%)',
                    fontSize: '0.65rem',
                    minHeight: 24,
                    color: '#94a3b8',
                  }}
                />
              );
            })}
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
          チップを選んでベットエリアをクリック→SPIN。所持金がゼロになったら Reset で再開できます。<br />
          <strong style={{ color: '#94a3b8' }}>インサイドベット:</strong> 数字グリッドの境界線をクリック = Split (17:1)、交点 = Corner (8:1)、グリッド下の行 = Street (11:1) / Line (5:1)。
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

interface HitZoneProps {
  chips?: number;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  style: React.CSSProperties;
}

/**
 * Small invisible-by-default clickable region overlaid on the number grid for
 * Split / Corner bets. Becomes visible (orange tint) on hover and stays filled
 * when a chip has been placed on it.
 *
 * Hover state lives in React state rather than direct DOM mutation so a parent
 * re-render (e.g. bankroll change mid-hover) doesn't flicker the highlight.
 */
const HitZone = ({ chips, onClick, disabled, title, style }: HitZoneProps) => {
  const [hover, setHover] = useState(false);
  const isPlaced = chips !== undefined && chips > 0;
  const background = isPlaced
    ? '#f59e0b'
    : hover && !disabled
      ? 'rgba(245, 158, 11, 0.55)'
      : 'transparent';
  const borderColor = isPlaced
    ? '#0f172a'
    : hover && !disabled
      ? '#fbbf24'
      : 'transparent';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        pointerEvents: 'auto',
        background,
        color: '#0f172a',
        border: isPlaced ? '2px solid' : '1px dashed',
        borderColor,
        borderRadius: style.borderRadius ?? 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        fontSize: '0.65rem',
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.08s, border-color 0.08s',
        zIndex: 2,
        ...style,
      }}
    >
      {isPlaced ? chips : ''}
    </button>
  );
};
