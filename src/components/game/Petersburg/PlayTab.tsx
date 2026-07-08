'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { fairPriceForN, logUtilityFairPrice, playGame } from './engine';
import { getPetersburgStrings } from './i18n';
import styles from './petersburg.module.css';

interface SessionStats {
  games: number;
  totalPaid: number;
  totalWon: number;
  maxPayoff: number;
}

const INITIAL: SessionStats = { games: 0, totalPaid: 0, totalWon: 0, maxPayoff: 0 };

const fmtMoney = (v: number) =>
  v >= Number.MAX_SAFE_INTEGER ? '$9e15+' : `$${Math.round(v).toLocaleString()}`;

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getPetersburgStrings(language);

  const [entryPrice, setEntryPrice] = useState(5);
  const [wealth, setWealth] = useState(1000);
  const [stats, setStats] = useState<SessionStats>(INITIAL);
  const [lastGame, setLastGame] = useState<{ n: number; payoff: number } | null>(null);
  const [history, setHistory] = useState<{ n: number; payoff: number }[]>([]);
  const [flipping, setFlipping] = useState(false);
  const [flipSeq, setFlipSeq] = useState<boolean[]>([]); // true=heads, false=tails (last)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const applyResults = useCallback(
    (results: { n: number; payoff: number }[]) => {
      let totalWon = 0;
      let maxPayoff = 0;
      for (const r of results) {
        totalWon += r.payoff;
        if (r.payoff > maxPayoff) maxPayoff = r.payoff;
      }
      setLastGame(results[results.length - 1] ?? null);
      setHistory((h) => [...h, ...results].slice(-240));
      setStats((s) => ({
        games: s.games + results.length,
        totalPaid: s.totalPaid + entryPrice * results.length,
        totalWon: s.totalWon + totalWon,
        maxPayoff: Math.max(s.maxPayoff, maxPayoff),
      }));
    },
    [entryPrice],
  );

  // Single flip is animated coin-by-coin for feel; batches resolve instantly.
  const playOne = useCallback(() => {
    if (flipping) return;
    const r = playGame();
    setFlipping(true);
    setFlipSeq([]);
    let shown = 0;
    const total = r.n; // number of flips (n-1 heads + 1 tails)
    const step = () => {
      shown += 1;
      const isTails = shown === total;
      setFlipSeq((seq) => [...seq, !isTails]);
      if (isTails) {
        timerRef.current = setTimeout(() => {
          setFlipping(false);
          applyResults([r]);
        }, 260);
      } else {
        timerRef.current = setTimeout(step, 190);
      }
    };
    timerRef.current = setTimeout(step, 120);
  }, [flipping, applyResults]);

  const playBatch = useCallback(
    (n: number) => {
      if (flipping) return;
      const results: { n: number; payoff: number }[] = [];
      for (let i = 0; i < n; i++) results.push(playGame());
      setFlipSeq([]);
      applyResults(results);
    },
    [flipping, applyResults],
  );

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFlipping(false);
    setFlipSeq([]);
    setStats(INITIAL);
    setHistory([]);
    setLastGame(null);
  };

  const meanPayoff = stats.games === 0 ? 0 : stats.totalWon / stats.games;
  const netProfit = stats.totalWon - stats.totalPaid;
  const fairTruncated = fairPriceForN(stats.games);
  // Bisection is ~4800 iterations; only depends on wealth, so memoize it so it
  // doesn't re-run on every coin-flip animation frame.
  const logPrice = useMemo(() => logUtilityFairPrice(wealth), [wealth]);

  return (
    <div className={styles.grid2}>
      {/* Left: play */}
      <div className={styles.card}>
        <label className={styles.sliderLabel}>
          <span className={styles.sliderLabelRow}>
            <span>{t.entryPrice}</span>
            <span className={styles.sliderValue}>${entryPrice}</span>
          </span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={entryPrice}
            onChange={(e) => setEntryPrice(Number(e.target.value))}
            className={styles.slider}
            aria-label={t.entryPrice}
            disabled={flipping}
          />
        </label>

        <div className={styles.coinStage} aria-live="polite">
          {flipping && flipSeq.length === 0 ? (
            <div className={`${styles.coin} ${styles.coinFlipping}`} aria-hidden>
              ?
            </div>
          ) : flipSeq.length > 0 ? (
            flipSeq.map((isHead, i) => (
              <div
                key={i}
                className={`${styles.coin} ${isHead ? styles.coinHead : styles.coinTail}`}
                title={isHead ? 'H' : 'T'}
              >
                {isHead ? 'H' : 'T'}
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--games-route-muted)', fontSize: '0.85rem' }}>
              {t.flip1} →
            </div>
          )}
        </div>

        <div className={styles.controls}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={playOne} disabled={flipping}>
            🎲 {flipping ? t.flipping : t.flip1}
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => playBatch(10)} disabled={flipping}>
            {t.play10}
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => playBatch(100)} disabled={flipping}>
            {t.play100}
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => playBatch(1000)} disabled={flipping}>
            {t.play1000}
          </button>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={reset}>
            {t.reset}
          </button>
        </div>

        {lastGame && (
          <div
            className={`${styles.lastGame} ${lastGame.payoff >= entryPrice ? styles.lastWin : styles.lastLoss}`}
          >
            {t.lastGame}: <strong>{lastGame.n} {t.flips}</strong> → {t.payout}{' '}
            <strong>{fmtMoney(lastGame.payoff)}</strong>
          </div>
        )}

        {history.length > 0 && (
          <>
            <div className={styles.statLabel} style={{ marginTop: '0.85rem' }}>
              {t.recentPayouts}
            </div>
            <div className={styles.chips}>
              {history.slice(-120).map((h, i) => {
                const log2 = h.payoff >= Number.MAX_SAFE_INTEGER ? 50 : Math.floor(Math.log2(Math.max(1, h.payoff)));
                const hue = Math.max(0, Math.min(280, 200 - log2 * 20));
                return (
                  <span
                    key={i}
                    title={`${h.n} ${t.flips} → $${h.payoff.toLocaleString()}`}
                    className={styles.chip}
                    style={{ background: `hsl(${hue}, 68%, 42%)`, border: `1px solid hsl(${hue}, 68%, 58%)` }}
                  >
                    {h.payoff >= Number.MAX_SAFE_INTEGER
                      ? '∞'
                      : h.payoff >= 1000
                        ? `$${(h.payoff / 1000).toFixed(0)}k`
                        : `$${h.payoff}`}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Right: stats + explorer */}
      <div className={styles.card}>
        <h3 className={styles.sectionTitle} style={{ color: '#f59e0b' }}>
          {t.sessionStats}
        </h3>
        <div className={styles.statGrid}>
          <Stat label={t.played} value={stats.games.toLocaleString()} color="#38bdf8" />
          <Stat label={t.meanPayout} value={`$${meanPayoff.toFixed(2)}`} color="#38bdf8" />
          <Stat label={t.totalWon} value={fmtMoney(stats.totalWon)} color="#22c55e" />
          <Stat label={t.paid} value={fmtMoney(stats.totalPaid)} color="var(--games-route-muted)" />
          <Stat
            label={t.net}
            value={`${netProfit >= 0 ? '+' : '−'}${fmtMoney(Math.abs(netProfit))}`}
            color={netProfit >= 0 ? '#22c55e' : '#ef4444'}
          />
          <Stat label={t.maxPayout} value={fmtMoney(stats.maxPayoff)} color="#ec4899" />
          <Stat label={t.entryPrice} value={`$${entryPrice}`} color="#f59e0b" />
          <Stat label={t.fairPriceLog} value={`$${fairTruncated.toFixed(2)}`} color="#f59e0b" />
        </div>

        {/* Log-utility willingness-to-pay explorer */}
        <div className={styles.explainer}>
          <strong>{t.explorer}</strong>
          <label className={styles.sliderLabel} style={{ margin: '0.65rem 0 0' }}>
            <span className={styles.sliderLabelRow}>
              <span>{t.wealth}</span>
              <span className={styles.sliderValue}>${wealth.toLocaleString()}</span>
            </span>
            <input
              type="range"
              min={10}
              max={1_000_000}
              step={10}
              value={wealth}
              onChange={(e) => setWealth(Number(e.target.value))}
              className={styles.slider}
              aria-label={t.wealth}
            />
          </label>
          <div style={{ marginTop: '0.5rem' }}>
            {t.logUtilityPrice}:{' '}
            <strong style={{ color: '#f59e0b', fontSize: '1.1rem' }}>${logPrice.toFixed(2)}</strong>
          </div>
          <p style={{ margin: '0.55rem 0 0', color: 'var(--games-route-muted)', fontSize: '0.8rem' }}>
            {t.logUtilityHint}
          </p>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className={styles.stat}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color }}>
      {value}
    </div>
  </div>
);
