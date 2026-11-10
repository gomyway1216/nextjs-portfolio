'use client';

import { memo } from 'react';
import { BankrollTrack, probPayoffAtLeast, trackPoints } from './bankroll';
import type { PetersburgStrings } from './i18n';
import styles from './petersburg.module.css';

/** Vertical band of the plot (in %) the balance range is mapped onto, leaving room for the markers. */
const PLOT_TOP = 8;
const PLOT_BOTTOM = 92;

const fmtAmount = (abs: number): string => {
  if (abs < 1000) return `$${Math.round(abs)}`;
  if (abs < 999_950) return `$${(abs / 1e3).toFixed(1)}k`;
  if (abs < 999_950_000) return `$${(abs / 1e6).toFixed(1)}M`;
  return `$${abs.toExponential(1)}`;
};

/** Signed balance: −$120, $0, +$1.2k. */
export const fmtSigned = (v: number): string => {
  const rounded = Math.round(v);
  if (rounded === 0) return '$0';
  return `${rounded < 0 ? '−' : '+'}${fmtAmount(Math.abs(rounded))}`;
};

/** Percentage with up to two decimals; a non-zero share never prints as 0%. */
export const fmtPercent = (p: number): string => {
  const pct = p * 100;
  if (pct <= 0) return '0%';
  if (pct < 0.01) return '<0.01%';
  return `${parseFloat(pct.toFixed(2))}%`;
};

interface BankrollPanelProps {
  track: BankrollTrack;
  entryPrice: number;
  t: PetersburgStrings;
}

export const BankrollPanel = memo(function BankrollPanel({ track, entryPrice, t }: BankrollPanelProps) {
  const played = track.games > 0;
  const yMin = played ? Math.min(track.low, 0) : -1;
  const yMax = played ? Math.max(track.high, 0) : 1;
  const span = yMax - yMin || 1;
  const xPct = (game: number) => (played ? (game / track.games) * 100 : 0);
  const yPct = (net: number) => PLOT_BOTTOM - ((net - yMin) / span) * (PLOT_BOTTOM - PLOT_TOP);

  const zeroY = yPct(0);
  const line = trackPoints(track)
    .map((p) => `${xPct(p.game).toFixed(2)},${yPct(p.net).toFixed(2)}`)
    .join(' ');
  // The $0 label is only drawn when it would not sit on top of the top/bottom labels.
  const showZeroLabel = played && zeroY - PLOT_TOP > 12 && PLOT_BOTTOM - zeroY > 12;

  return (
    <div className={styles.card}>
      <h3 className={styles.sectionTitle}>{t.bankrollTitle}</h3>

      <div className={styles.bankrollChart}>
        <div className={styles.bankrollYAxis} aria-hidden>
          {played && (
            <>
              <span style={{ top: `${PLOT_TOP}%` }}>{fmtSigned(yMax)}</span>
              {showZeroLabel && <span style={{ top: `${zeroY}%` }}>$0</span>}
              <span style={{ top: `${PLOT_BOTTOM}%` }}>{fmtSigned(yMin)}</span>
            </>
          )}
        </div>
        <div
          className={styles.bankrollPlot}
          role="img"
          aria-label={
            played
              ? t.bankrollAria(
                  track.games.toLocaleString(),
                  fmtSigned(track.net),
                  fmtSigned(track.low),
                  fmtSigned(track.high),
                )
              : t.bankrollEmpty
          }
        >
          <svg className={styles.bankrollSvg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <line
              x1={0}
              x2={100}
              y1={zeroY}
              y2={zeroY}
              className={styles.bankrollZero}
              vectorEffect="non-scaling-stroke"
            />
            {played && (
              <polyline points={line} className={styles.bankrollLine} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {played && track.low < 0 && (
            <span
              className={`${styles.bankrollDot} ${styles.bankrollDotLow}`}
              style={{ left: `${xPct(track.lowAt)}%`, top: `${yPct(track.low)}%` }}
              aria-hidden
            />
          )}
          {played && track.high > 0 && (
            <span
              className={`${styles.bankrollDot} ${styles.bankrollDotHigh}`}
              style={{ left: `${xPct(track.highAt)}%`, top: `${yPct(track.high)}%` }}
              aria-hidden
            />
          )}
          {!played && (
            <span className={styles.bankrollEmpty} aria-hidden>
              {t.bankrollEmpty}
            </span>
          )}
        </div>
        <div className={styles.bankrollXAxis} aria-hidden>
          <span>0</span>
          <span>{t.bankrollAxis}</span>
          <span>{played ? track.games.toLocaleString() : ''}</span>
        </div>
      </div>

      <div className={styles.readoutGrid}>
        <Readout
          label={t.bankrollLow}
          value={played ? fmtSigned(track.low) : '—'}
          sub={played && track.low < 0 ? t.bankrollAtGame(track.lowAt.toLocaleString()) : ''}
          tone={played && track.low < 0 ? styles.bankrollNeg : ''}
        />
        <Readout
          label={t.bankrollHigh}
          value={played ? fmtSigned(track.high) : '—'}
          sub={played && track.high > 0 ? t.bankrollAtGame(track.highAt.toLocaleString()) : ''}
          tone={played && track.high > 0 ? styles.bankrollPos : ''}
        />
        <Readout
          label={t.bankrollPaidBack}
          value={played ? `${track.paidBack.toLocaleString()} / ${track.games.toLocaleString()}` : '—'}
          sub={played ? fmtPercent(track.paidBack / track.games) : ''}
        />
        <Readout
          label={t.bankrollChance(`$${entryPrice}`)}
          value={fmtPercent(probPayoffAtLeast(entryPrice))}
          sub={t.bankrollChanceSub}
        />
      </div>

      <p className={styles.caption}>{t.bankrollCaption}</p>
    </div>
  );
});

const Readout = ({ label, value, sub, tone = '' }: { label: string; value: string; sub: string; tone?: string }) => (
  <div className={styles.stat}>
    <div className={styles.statLabel}>{label}</div>
    <div className={`${styles.statValue} ${tone}`}>{value}</div>
    <div className={styles.bankrollSub}>{sub || ' '}</div>
  </div>
);
