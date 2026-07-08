'use client';

import { useMemo, useState } from 'react';
import { UniqueCurveChart } from './charts';
import { RunResult, expectedDraws } from './engine';
import type { CouponStrings } from './i18n';
import styles from './CouponCollector.module.css';

const DEFAULT_N = 20;
const MIN_N = 3;
const MAX_N = 100;

interface PlayState extends RunResult {
  lastIdx: number | null;
}

const emptyRun = (n: number): PlayState => ({
  draws: 0,
  counts: new Array(n).fill(0),
  uniqueCurve: [],
  lastIdx: null,
});

export const PlayTab = ({ t }: { t: CouponStrings }) => {
  const [n, setN] = useState(DEFAULT_N);
  const [run, setRun] = useState<PlayState>(() => emptyRun(DEFAULT_N));

  const drawOne = () => {
    setRun((prev) => {
      const counts = prev.counts.slice();
      const idx = Math.floor(Math.random() * counts.length);
      const wasNew = counts[idx] === 0;
      counts[idx]++;
      const lastUnique = prev.uniqueCurve[prev.uniqueCurve.length - 1] ?? 0;
      const unique = wasNew ? lastUnique + 1 : lastUnique;
      return {
        draws: prev.draws + 1,
        counts,
        uniqueCurve: [...prev.uniqueCurve, unique],
        lastIdx: idx,
      };
    });
  };

  /** Finish the current collection in one synchronous batch (continues from current counts). */
  const completeNow = () => {
    setRun((prev) => {
      const counts = prev.counts.slice();
      const curve = prev.uniqueCurve.slice();
      let unique = curve[curve.length - 1] ?? 0;
      let draws = prev.draws;
      let lastIdx = prev.lastIdx;
      // Safety cap: extremely unlikely to need more than 100 * n * H_n extra draws.
      const cap = draws + Math.ceil(n * Math.log(Math.max(2, n)) * 100) + 1000;
      while (unique < n && draws < cap) {
        const idx = Math.floor(Math.random() * counts.length);
        if (counts[idx] === 0) unique++;
        counts[idx]++;
        draws++;
        curve.push(unique);
        lastIdx = idx;
      }
      return { draws, counts, uniqueCurve: curve, lastIdx };
    });
  };

  const onNChange = (next: number) => {
    setN(next);
    setRun(emptyRun(next));
  };

  const uniqueCount = useMemo(
    () => run.counts.reduce((acc, c) => acc + (c > 0 ? 1 : 0), 0),
    [run.counts],
  );
  const complete = uniqueCount === n;
  const expected = expectedDraws(n);
  const ratio = run.draws === 0 ? null : run.draws / expected;

  const cols = Math.min(n, 12);

  const pace = (() => {
    if (ratio === null) return null;
    if (ratio < 0.9) return { text: t.luckyFast, color: '#22c55e' };
    if (ratio > 1.15) return { text: t.unlucky, color: '#f472b6' };
    return { text: t.onTrack, color: '#38bdf8' };
  })();

  return (
    <div className={styles.playGrid}>
      <div>
        <label className={styles.sliderLabel}>
          <span className={styles.sliderTop}>
            <span>{t.sizeLabel}</span>
            <span className={styles.sliderValue}>n = {n}</span>
          </span>
          <input
            type="range"
            className={styles.slider}
            min={MIN_N}
            max={MAX_N}
            value={n}
            onChange={(e) => onNChange(Number(e.target.value))}
            aria-label={t.sizeLabel}
            aria-valuetext={`n = ${n}`}
          />
          <span className={styles.sliderScale}>
            <span>{MIN_N}</span>
            <span>{MAX_N}</span>
          </span>
        </label>

        <div className={styles.actionRow}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDraw}`}
            onClick={drawOne}
            disabled={complete}
          >
            🎲 {t.drawOne}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnComplete}`}
            onClick={completeNow}
            disabled={complete}
          >
            ⚡ {t.completeNow}
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnReset}`} onClick={() => onNChange(n)}>
            {t.reset}
          </button>
        </div>

        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          role="list"
          aria-label={t.gridHint}
        >
          {run.counts.map((c, i) => (
            <div
              key={i}
              role="listitem"
              title={`#${i + 1}: ${c}`}
              className={`${styles.cell} ${c === 0 ? styles.cellEmpty : styles.cellFilled} ${
                run.lastIdx === i ? styles.cellJustDrawn : ''
              }`}
            >
              {i + 1}
              <div className={styles.cellCount}>{c}</div>
            </div>
          ))}
        </div>
        <p className={styles.gridHint}>{t.gridHint}</p>
      </div>

      <div>
        <h3 className={styles.statsHeading}>{t.statusHeading}</h3>
        <div className={styles.statGrid}>
          <Stat label={t.collected} value={`${uniqueCount} / ${n}`} color={complete ? '#4ade80' : '#38bdf8'} />
          <Stat label={t.totalDraws} value={`${run.draws}`} color="#38bdf8" />
          <Stat label={t.expected} value={expected.toFixed(1)} color="#f59e0b" />
          <Stat label={t.youVsExpected} value={ratio === null ? '—' : `${ratio.toFixed(2)}×`} color="#a78bfa" />
        </div>

        <div className={styles.progressWrap}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${(uniqueCount / n) * 100}%` }} />
          </div>
        </div>

        {pace && (
          <span className={styles.paceTag} style={{ background: `${pace.color}22`, color: pace.color }}>
            {pace.text}
          </span>
        )}

        {complete && ratio !== null && (
          <div className={styles.banner}>{t.completeBanner(n, run.draws, ratio.toFixed(2))}</div>
        )}

        <div className={styles.chartBlock}>
          <h4 className={styles.chartTitle}>{t.curveTitle}</h4>
          <UniqueCurveChart
            curve={run.uniqueCurve}
            n={n}
            labelUnique={t.uniqueAxis(n)}
            labelStart={t.drawsAxisStart}
            labelEnd={t.drawsAxisEnd(run.draws.toLocaleString())}
          />
          <p className={styles.note}>{t.curveNote}</p>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className={styles.statCard} style={{ borderColor: `${color}55` }}>
    <div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue} style={{ color }}>
      {value}
    </div>
  </div>
);
