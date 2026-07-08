'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createSeededRng,
  dayLabel,
  findFirstCollision,
  generateBirthdays,
  theoreticalMatchProb,
} from './engine';
import type { BirthdayStrings } from './i18n';
import styles from './BirthdayParadox.module.css';

const DEFAULT_N = 23;
const MIN_N = 2;
const MAX_N = 100;

interface Stats {
  trials: number;
  matches: number;
}

export const PlayTab = ({ t }: { t: BirthdayStrings }) => {
  const [n, setN] = useState(DEFAULT_N);
  const [birthdays, setBirthdays] = useState<number[]>(() =>
    generateBirthdays(DEFAULT_N, createSeededRng(0x5eed1234)),
  );
  // How many chips are currently revealed (drives the "dealing" animation).
  const [revealed, setRevealed] = useState(DEFAULT_N);
  const [stats, setStats] = useState<Record<number, Stats>>({});
  const [autoDeal, setAutoDeal] = useState(false);

  const dealTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const collision = useMemo(() => findFirstCollision(birthdays), [birthdays]);
  const currentStats = stats[n] ?? { trials: 0, matches: 0 };
  const dealing = revealed < birthdays.length;

  const recordDeal = (bd: number[], size: number) => {
    const matched = findFirstCollision(bd) !== null;
    setStats((s) => {
      const prev = s[size] ?? { trials: 0, matches: 0 };
      return {
        ...s,
        [size]: { trials: prev.trials + 1, matches: prev.matches + (matched ? 1 : 0) },
      };
    });
  };

  const clearDealTimer = () => {
    if (dealTimer.current) {
      clearInterval(dealTimer.current);
      dealTimer.current = null;
    }
  };

  // Deal a fresh group, revealing chips one by one for a tactile feel.
  const deal = (animate: boolean) => {
    const bd = generateBirthdays(n);
    setBirthdays(bd);
    recordDeal(bd, n);
    clearDealTimer();
    if (!animate || n <= 12) {
      setRevealed(bd.length);
      return;
    }
    setRevealed(0);
    const step = Math.max(1, Math.round(n / 24));
    dealTimer.current = setInterval(() => {
      setRevealed((r) => {
        const next = r + step;
        if (next >= bd.length) {
          clearDealTimer();
          return bd.length;
        }
        return next;
      });
    }, 24);
  };

  // Auto-deal loop: rapid trials to watch empirical converge on theory.
  useEffect(() => {
    if (!autoDeal) return;
    autoTimer.current = setInterval(() => {
      const bd = generateBirthdays(n);
      setBirthdays(bd);
      setRevealed(bd.length);
      recordDeal(bd, n);
    }, 120);
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      autoTimer.current = null;
    };
  }, [autoDeal, n]);

  useEffect(() => () => {
    clearDealTimer();
    if (autoTimer.current) clearInterval(autoTimer.current);
  }, []);

  // Changing the group size stops any auto-deal loop and clamps the reveal
  // count so we never show more chips than the new group has.
  const changeN = (next: number) => {
    setN(next);
    setAutoDeal(false);
    clearDealTimer();
    setRevealed((r) => Math.min(r, next));
  };

  const reset = () => setStats({});

  const empirical = currentStats.trials === 0 ? null : currentStats.matches / currentStats.trials;
  const theoretical = theoreticalMatchProb(n);
  const visible = birthdays.slice(0, revealed);
  const visibleCollision = findFirstCollision(visible);

  return (
    <div className={styles.grid}>
      {/* Left: controls + birthday chips */}
      <div className={styles.card}>
        <label>
          <div className={styles.labelRow}>
            <span>{t.groupSize}</span>
            <span className={styles.nValue}>n = {n}</span>
          </div>
          <input
            className={styles.slider}
            type="range"
            min={MIN_N}
            max={MAX_N}
            value={n}
            onChange={(e) => changeN(Number(e.target.value))}
            aria-label={`${t.groupSize}: ${n}`}
          />
          <div className={styles.tickRow} aria-hidden>
            <span>{MIN_N}</span>
            <span>23</span>
            <span>50</span>
            <span>{MAX_N}</span>
          </div>
        </label>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => deal(true)}
            disabled={autoDeal}
          >
            🎲 {t.generate}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${autoDeal ? styles.btnActive : styles.btnSecondary}`}
            onClick={() => setAutoDeal((a) => !a)}
            aria-pressed={autoDeal}
          >
            {autoDeal ? `⏹ ${t.stopAuto}` : `⚡ ${t.autoDeal}`}
          </button>
        </div>

        <div
          className={`${styles.status} ${visibleCollision ? styles.statusMatch : ''}`}
          role="status"
          aria-live="polite"
        >
          {dealing
            ? t.dealing
            : visibleCollision
              ? t.matchFound(
                  dayLabel(visibleCollision.day),
                  visibleCollision.indices[0] + 1,
                  visibleCollision.indices[1] + 1,
                )
              : t.noMatch}
        </div>

        <div className={styles.chips} aria-label={`${visible.length} ${t.person}`}>
          {visible.map((d, i) => {
            const isMatch = collision !== null && collision.day === d && i <= revealed;
            return (
              <span
                key={i}
                className={`${styles.chip} ${isMatch ? styles.chipMatch : ''}`}
                title={`${t.person} #${i + 1}`}
              >
                {dayLabel(d)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Right: stats + comparison meter + hint */}
      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>n = {n}</h3>
        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t.yourEmpirical}</div>
            <div className={styles.statValue} style={{ color: 'var(--bp-sim)' }}>
              {empirical === null ? '—' : `${(empirical * 100).toFixed(1)}%`}
            </div>
            <div className={styles.statSub}>{t.trialsLabel(currentStats.matches, currentStats.trials)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>{t.theoretical}</div>
            <div className={styles.statValue} style={{ color: 'var(--bp-accent-strong)' }}>
              {(theoretical * 100).toFixed(2)}%
            </div>
            <div className={styles.statSub}>n = {n}</div>
          </div>
        </div>

        <div className={styles.meter} aria-hidden>
          <div className={styles.meterTrack}>
            <div
              className={styles.meterFill}
              style={{ width: `${(empirical ?? 0) * 100}%` }}
            />
            <div className={styles.meterTheory} style={{ left: `${theoretical * 100}%` }} />
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={reset}>
            {t.reset}
          </button>
        </div>

        <div className={styles.hint}>
          <strong>{t.playHintTitle}: </strong>
          {t.playHint}
        </div>
      </div>
    </div>
  );
};
