'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Wheel, WHEEL_SPIN_MS } from './Wheel';
import { Bet, colorOf, payoutMultiplier, RED_NUMBERS, spin } from './engine';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import styles from './Roulette.module.css';

const CHIP_VALUES = [1, 5, 10, 25, 100];
const INITIAL_BANKROLL = 1000;
const CHIP_COLORS: Record<number, string> = {
  1: '#e2e8f0',
  5: '#ef4444',
  10: '#3b82f6',
  25: '#22c55e',
  100: '#1a1a1f',
};

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
  if (bet.kind === 'column') return `column:${bet.which}`;
  if (bet.kind === 'split' || bet.kind === 'street' || bet.kind === 'corner' || bet.kind === 'line') {
    return `${bet.kind}:${bet.numbers.join('-')}`;
  }
  return bet.kind;
};

interface PlacedBet {
  bet: Bet;
  amount: number;
}

interface HistoryEntry {
  id: number;
  result: number;
  net: number;
  wagered: number;
}

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [bankroll, setBankroll] = useState(INITIAL_BANKROLL);
  const [chip, setChip] = useState(CHIP_VALUES[1]);
  const [bets, setBets] = useState<Record<BetKey, PlacedBet>>({});
  const [placeOrder, setPlaceOrder] = useState<BetKey[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [spinId, setSpinId] = useState(0);
  const [lastNet, setLastNet] = useState<number | null>(null);
  const [recent, setRecent] = useState<number[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyId = useRef(0);

  // Refs guard against state-lag races: setSpinning(true) doesn't take effect
  // until the next render, so a fast second click would otherwise schedule a
  // duplicate spin. Same for placeBet reading stale totalWagered.
  const spinningRef = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const bankrollRef = useRef(bankroll);
  useEffect(() => {
    bankrollRef.current = bankroll;
  }, [bankroll]);

  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
  }, []);

  const totalWagered = useMemo(
    () => Object.values(bets).reduce((sum, b) => sum + b.amount, 0),
    [bets],
  );

  // Delta-aware placement + undo: remember the chip amount used for each
  // placement so undo is exact regardless of chip switching.
  const undoStack = useRef<{ key: BetKey; amount: number }[]>([]);
  const placeBetTracked = (bet: Bet) => {
    if (spinningRef.current) return;
    const k = keyOf(bet);
    // Guard inside the functional updater so rapid consecutive clicks within a
    // single render can't collectively exceed the bankroll (avoids stale-read
    // race). Only record the undo/order entries when the chip actually landed.
    let placed = false;
    setBets((prev) => {
      const currentTotal = Object.values(prev).reduce((sum, b) => sum + b.amount, 0);
      if (chip > bankrollRef.current - currentTotal) return prev;
      placed = true;
      const existing = prev[k];
      return { ...prev, [k]: { bet, amount: (existing?.amount ?? 0) + chip } };
    });
    if (placed) {
      undoStack.current.push({ key: k, amount: chip });
      setPlaceOrder((prev) => [...prev, k]);
    }
  };
  const undoTracked = () => {
    if (spinningRef.current || undoStack.current.length === 0) return;
    const last = undoStack.current.pop()!;
    setPlaceOrder((prev) => prev.slice(0, -1));
    setBets((prev) => {
      const existing = prev[last.key];
      if (!existing) return prev;
      const remaining = existing.amount - last.amount;
      const next = { ...prev };
      if (remaining <= 0) delete next[last.key];
      else next[last.key] = { ...existing, amount: remaining };
      return next;
    });
  };

  const clearBets = () => {
    if (spinningRef.current) return;
    undoStack.current = [];
    setPlaceOrder([]);
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
      setRecent((h) => [r, ...h].slice(0, 14));
      const entry: HistoryEntry = { id: historyId.current++, result: r, net, wagered };
      setHistory((h) => [entry, ...h].slice(0, 40));
      undoStack.current = [];
      setPlaceOrder([]);
      setBets({});
      spinningRef.current = false;
      setSpinning(false);
    }, WHEEL_SPIN_MS + 100);
  };

  const reset = () => {
    setBankroll(INITIAL_BANKROLL);
    undoStack.current = [];
    setPlaceOrder([]);
    setBets({});
    setLastNet(null);
    setRecent([]);
    setHistory([]);
    setResult(null);
    setSpinId(0);
  };

  const numberGrid: number[] = useMemo(() => {
    // Standard 3x12 grid (rows 3,2,1 top to bottom), flattened row-major.
    const rows: number[][] = [[], [], []];
    for (let n = 1; n <= 36; n++) {
      const row = 2 - ((n - 1) % 3);
      rows[row].push(n);
    }
    return rows.flat();
  }, []);

  const resultColor = (n: number) =>
    colorOf(n) === 'red' ? 'var(--rl-red)' : colorOf(n) === 'green' ? 'var(--rl-green)' : 'var(--rl-black)';

  return (
    <div className={styles.playGrid}>
      {/* ---- Left column: wheel + recent + history ---- */}
      <div className={styles.panel}>
        <div className={styles.wheelWrap}>
          <Wheel result={result} spinId={spinId} />

          <div className={styles.resultBadge} aria-live="polite">
            {result !== null && !spinning && (
              <>
                <span className={styles.resultChip} style={{ background: resultColor(result) }}>
                  {result}
                </span>
                <span style={{ color: resultColor(result) }}>{colorOf(result)}</span>
              </>
            )}
          </div>
          <div className={styles.netLine}>
            {lastNet !== null && (
              <span className={lastNet >= 0 ? styles.netWin : styles.netLose}>
                {lastNet >= 0 ? `+${lastNet}` : lastNet}{' '}
                {lastNet > 0 ? t.win : lastNet < 0 ? t.lose : t.push}
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: '0.6rem' }}>
          <div className={styles.sectionLabel}>{t.recentResults}</div>
          <div className={styles.recentRow}>
            {recent.length === 0 && (
              <span style={{ color: 'var(--games-route-muted)', fontSize: '0.85rem' }}>{t.none}</span>
            )}
            {recent.map((n, i) => (
              <span key={i} className={styles.recentPip} style={{ background: resultColor(n) }}>
                {n}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: '0.9rem' }}>
          <div className={styles.sectionLabel}>{t.betHistory}</div>
          {history.length === 0 ? (
            <span style={{ color: 'var(--games-route-muted)', fontSize: '0.85rem' }}>{t.noBets}</span>
          ) : (
            <div className={styles.histWrap}>
              <table className={styles.histTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t.wagered}</th>
                    <th>{t.net}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <span className={styles.histResultDot} style={{ background: resultColor(h.result) }}>
                          {h.result}
                        </span>
                      </td>
                      <td>{h.wagered}</td>
                      <td className={h.net >= 0 ? styles.histNetWin : styles.histNetLose}>
                        {h.net >= 0 ? `+${h.net}` : h.net}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ---- Right column: bankroll, chips, felt, actions ---- */}
      <div className={styles.panel}>
        <div className={styles.pillRow}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.balance}</span>
            <span className={styles.pillValue} style={{ color: 'var(--rl-gold)' }}>{bankroll}</span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.wagered}</span>
            <span className={styles.pillValue}>{totalWagered}</span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.available}</span>
            <span className={styles.pillValue}>{bankroll - totalWagered}</span>
          </div>
        </div>

        <div className={styles.chipRow} role="radiogroup" aria-label={t.chip}>
          <span className={styles.chipRowLabel}>{t.chip}:</span>
          {CHIP_VALUES.map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={chip === v}
              aria-label={`${t.chip} ${v}`}
              onClick={() => setChip(v)}
              disabled={spinning}
              className={styles.chip}
              style={{ ['--c' as string]: CHIP_COLORS[v], color: v === 100 ? '#fff' : '#1a1200' }}
            >
              {v}
            </button>
          ))}
        </div>

        <div className={styles.felt}>
          {/* Number grid (0 + 1-36) with overlaid Split / Corner hit zones */}
          <div className={styles.gridRow}>
            <BetCell
              label="0"
              variant="green"
              chips={bets['straight:0']?.amount}
              onClick={() => placeBetTracked({ kind: 'straight', number: 0 })}
              disabled={spinning}
              ariaLabel="Straight up 0"
              className={styles.zeroCell}
              style={{ height: 'auto' }}
            />
            <div className={styles.numGridWrap}>
              <div className={styles.numGrid}>
                {numberGrid.map((n) => (
                  <BetCell
                    key={n}
                    label={String(n)}
                    variant={RED_NUMBERS.has(n) ? 'red' : 'black'}
                    chips={bets[`straight:${n}`]?.amount}
                    onClick={() => placeBetTracked({ kind: 'straight', number: n })}
                    disabled={spinning}
                    ariaLabel={`Straight up ${n}`}
                  />
                ))}
              </div>

              <div className={styles.overlay}>
                {V_SPLITS.map(({ k, r, numbers }) => {
                  const bet = { kind: 'split', numbers } as const;
                  return (
                    <HitZone
                      key={keyOf(bet)}
                      chips={bets[keyOf(bet)]?.amount}
                      disabled={spinning}
                      onClick={() => placeBetTracked(bet)}
                      title={`Split ${numbers.join(', ')} (17:1)`}
                      style={{ left: `${(k + 1) * CELL_W}%`, top: `${(r + 0.5) * CELL_H}%`, width: 14, height: `${CELL_H * 0.55}%`, transform: 'translate(-50%, -50%)', borderRadius: 4 }}
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
                      onClick={() => placeBetTracked(bet)}
                      title={`Split ${numbers.join(', ')} (17:1)`}
                      style={{ left: `${(k + 0.5) * CELL_W}%`, top: `${(r + 1) * CELL_H}%`, width: `${CELL_W * 0.55}%`, height: 14, transform: 'translate(-50%, -50%)', borderRadius: 4 }}
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
                      onClick={() => placeBetTracked(bet)}
                      title={`Corner ${numbers.join(', ')} (8:1)`}
                      style={{ left: `${(k + 1) * CELL_W}%`, top: `${(r + 1) * CELL_H}%`, width: 18, height: 18, borderRadius: '50%', transform: 'translate(-50%, -50%)' }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Streets (1 per column, 11:1) */}
          <div className={styles.gridRow}>
            <div className={styles.zeroCell} />
            <div className={styles.numGrid} style={{ flex: 1 }}>
              {STREETS.map(({ numbers }, k) => {
                const bet = { kind: 'street', numbers } as const;
                return (
                  <BetCell
                    key={keyOf(bet)}
                    label={`${3 * k + 1}-${3 * k + 3}`}
                    variant="outside"
                    small
                    chips={bets[keyOf(bet)]?.amount}
                    onClick={() => placeBetTracked(bet)}
                    disabled={spinning}
                    ariaLabel={`Street ${numbers.join(', ')} (11:1)`}
                  />
                );
              })}
            </div>
          </div>

          {/* Lines (2 streets = 6 nums, 5:1) — centered on column boundaries */}
          <div className={styles.gridRow}>
            <div className={styles.zeroCell} />
            <div style={{ position: 'relative', flex: 1, height: 24 }}>
              {LINES.map(({ k, numbers }) => {
                const bet = { kind: 'line', numbers } as const;
                return (
                  <BetCell
                    key={keyOf(bet)}
                    label={`${numbers[0]}-${numbers[5]}`}
                    variant="outside"
                    small
                    chips={bets[keyOf(bet)]?.amount}
                    onClick={() => placeBetTracked(bet)}
                    disabled={spinning}
                    ariaLabel={`Line ${numbers.join(', ')} (5:1)`}
                    style={{
                      position: 'absolute',
                      left: `${(k + 1) * CELL_W}%`,
                      top: 0,
                      width: `${CELL_W}%`,
                      height: '100%',
                      transform: 'translateX(-50%)',
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Dozens (left) + Columns (right, 2:1) */}
          <div className={styles.dozenColRow}>
            <div className={styles.dozens}>
              {[1, 2, 3].map((w) => (
                <BetCell
                  key={w}
                  label={t.dozenLabel((w - 1) * 12 + 1, w * 12)}
                  variant="outside"
                  chips={bets[`dozen:${w}`]?.amount}
                  onClick={() => placeBetTracked({ kind: 'dozen', which: w as 1 | 2 | 3 })}
                  disabled={spinning}
                  ariaLabel={`Dozen ${(w - 1) * 12 + 1}-${w * 12} (2:1)`}
                />
              ))}
            </div>
            <div className={styles.columns}>
              {[1, 2, 3].map((w) => (
                <BetCell
                  key={w}
                  label={t.columnLabel(w)}
                  variant="outside"
                  small
                  chips={bets[`column:${w}`]?.amount}
                  onClick={() => placeBetTracked({ kind: 'column', which: w as 1 | 2 | 3 })}
                  disabled={spinning}
                  ariaLabel={`Column ${w} (2:1)`}
                />
              ))}
            </div>
          </div>

          {/* Outside even-money */}
          <div className={styles.outsideSix}>
            <BetCell label={t.low} variant="outside" chips={bets['low']?.amount} onClick={() => placeBetTracked({ kind: 'low' })} disabled={spinning} ariaLabel="Low 1-18 (1:1)" />
            <BetCell label={t.even} variant="outside" chips={bets['even']?.amount} onClick={() => placeBetTracked({ kind: 'even' })} disabled={spinning} ariaLabel="Even (1:1)" />
            <BetCell label={t.red} variant="red" chips={bets['red']?.amount} onClick={() => placeBetTracked({ kind: 'red' })} disabled={spinning} ariaLabel="Red (1:1)" />
            <BetCell label={t.black} variant="black" chips={bets['black']?.amount} onClick={() => placeBetTracked({ kind: 'black' })} disabled={spinning} ariaLabel="Black (1:1)" />
            <BetCell label={t.odd} variant="outside" chips={bets['odd']?.amount} onClick={() => placeBetTracked({ kind: 'odd' })} disabled={spinning} ariaLabel="Odd (1:1)" />
            <BetCell label={t.high} variant="outside" chips={bets['high']?.amount} onClick={() => placeBetTracked({ kind: 'high' })} disabled={spinning} ariaLabel="High 19-36 (1:1)" />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            onClick={doSpin}
            disabled={spinning || totalWagered === 0}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            {spinning ? t.spinning : t.spin}
          </button>
          <button onClick={undoTracked} disabled={spinning || placeOrder.length === 0} className={styles.btn}>
            {t.undo}
          </button>
          <button onClick={clearBets} disabled={spinning || totalWagered === 0} className={styles.btn}>
            {t.clear}
          </button>
          <button onClick={reset} disabled={spinning} className={`${styles.btn} ${styles.spacerLeft}`}>
            {t.reset}
          </button>
        </div>

        <p className={styles.hint}>
          {t.outsideHint}
          <br />
          <strong>{t.insideHint}</strong>
        </p>
      </div>
    </div>
  );
};

type CellVariant = 'red' | 'black' | 'green' | 'outside';

interface BetCellProps {
  label: string;
  variant: CellVariant;
  chips?: number;
  onClick: () => void;
  disabled?: boolean;
  small?: boolean;
  ariaLabel: string;
  className?: string;
  style?: React.CSSProperties;
}
const variantClass: Record<CellVariant, string> = {
  red: styles.cellRed,
  black: styles.cellBlack,
  green: styles.cellGreen,
  outside: styles.cellOutside,
};
const BetCell = ({ label, variant, chips, onClick, disabled, small, ariaLabel, className, style }: BetCellProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className={`${styles.betCell} ${variantClass[variant]} ${small ? styles.cellSmall : ''} ${className ?? ''}`}
    style={style}
  >
    {label}
    {chips !== undefined && chips > 0 && <span className={styles.chipBadge}>{chips}</span>}
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
 * Split / Corner bets. Becomes visible (gold tint) on hover/focus and stays
 * filled when a chip has been placed on it.
 */
const HitZone = ({ chips, onClick, disabled, title, style }: HitZoneProps) => {
  const isPlaced = chips !== undefined && chips > 0;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`${styles.hitZone} ${isPlaced ? styles.hitZonePlaced : ''}`}
      style={style}
    >
      {isPlaced ? chips : ''}
    </button>
  );
};
