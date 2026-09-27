'use client';

import { colorOf } from './engine';
import { computeHistoryStats, formatPercent, HOT_COLD_MIN_SPINS, type NumberStat } from './history';
import type { RouletteStrings } from './i18n';
import styles from './Roulette.module.css';

/** Rows shown in the LED column (the statistics use the whole history). */
export const BOARD_ROWS = 14;

interface HistoryBoardProps {
  /** Winning numbers, newest first. */
  results: readonly number[];
  /**
   * Total spins so far (monotonic, not capped) — gives each row a stable key so
   * only the newest number animates in.
   */
  spinCount: number;
  t: RouletteStrings;
  /** Empties the saved history (button hidden when omitted). */
  onClear?: () => void;
  clearDisabled?: boolean;
}

interface Segment {
  key: string;
  label: string;
  count: number;
  className: string;
  /** Omit from the caption (the green zero sliver in two-way bars). */
  silent?: boolean;
}

const StatBar = ({ segments, total }: { segments: Segment[]; total: number }) => (
  <div className={styles.statBar}>
    <div
      className={styles.statBarTrack}
      role="img"
      aria-label={segments.map((s) => `${s.label} ${formatPercent(s.count, total)}`).join(', ')}
    >
      {segments.map((s) =>
        s.count > 0 ? <span key={s.key} className={s.className} style={{ flexGrow: s.count }} /> : null,
      )}
    </div>
    <div className={styles.statBarCaption} aria-hidden="true">
      {segments
        .filter((s) => !s.silent)
        .map((s) => (
          <span key={s.key}>
            {s.label} <b>{formatPercent(s.count, total)}</b>
          </span>
        ))}
    </div>
  </div>
);

const NumberChips = ({ label, icon, items, t }: { label: string; icon: string; items: NumberStat[]; t: RouletteStrings }) => (
  <div className={styles.hcRow}>
    <span className={styles.hcLabel}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
    <ol className={styles.hcList} aria-label={label}>
      {items.map((s) => (
        <li key={s.n} className={styles.hcChip} data-color={colorOf(s.n)}>
          <span className={styles.hcNum}>{s.n}</span>
          <span className={styles.hcCount} aria-hidden="true">
            ×{s.count}
          </span>
          <span className={styles.srOnly}>
            {' '}
            {t.colorName(s.n)}, {t.hitCount(s.count)}
          </span>
        </li>
      ))}
    </ol>
  </div>
);

/**
 * Casino-style results board ("marquee"): the latest winning numbers in an LED
 * column — red on the left, black on the right, zero in the middle, newest on
 * top — next to distribution bars and hot / cold numbers.
 */
export const HistoryBoard = ({ results, spinCount, t, onClear, clearDisabled }: HistoryBoardProps) => {
  const stats = computeHistoryStats(results);
  const shown = results.slice(0, BOARD_ROWS);
  const total = stats.total;
  const zeroSeg: Segment = { key: 'zero', label: t.zero, count: stats.zero, className: styles.segZero, silent: true };

  return (
    <section className={styles.board} aria-label={t.recentResults}>
      <div className={styles.boardHeader}>
        <span className={styles.boardTitle}>{t.recentResults}</span>
        {total > 0 && <span className={styles.boardCount}>{t.boardSpins(total)}</span>}
        {onClear && (
          <button
            type="button"
            className={styles.boardClear}
            onClick={onClear}
            disabled={clearDisabled || total === 0}
            aria-label={t.boardClearAria}
          >
            {t.boardClear}
          </button>
        )}
      </div>

      <div className={styles.boardBody}>
        <ol className={styles.ledList} aria-label={t.ledListLabel}>
          {shown.length === 0 ? (
            <li className={styles.ledEmpty}>{t.none}</li>
          ) : (
            shown.map((n, i) => (
              <li
                key={spinCount - i}
                className={`${styles.ledRow} ${i === 0 ? styles.ledLatest : ''}`}
                data-color={colorOf(n)}
              >
                <span className={styles.ledNum}>{n}</span>
                <span className={styles.srOnly}> {t.colorName(n)}</span>
              </li>
            ))
          )}
        </ol>

        <div className={styles.boardStats}>
          <StatBar
            total={total}
            segments={[
              { key: 'red', label: t.red, count: stats.red, className: styles.segRed },
              { ...zeroSeg, silent: false },
              { key: 'black', label: t.black, count: stats.black, className: styles.segBlack },
            ]}
          />
          <StatBar
            total={total}
            segments={[
              { key: 'even', label: t.even, count: stats.even, className: styles.segA },
              zeroSeg,
              { key: 'odd', label: t.odd, count: stats.odd, className: styles.segB },
            ]}
          />
          <StatBar
            total={total}
            segments={[
              { key: 'low', label: t.low, count: stats.low, className: styles.segA },
              zeroSeg,
              { key: 'high', label: t.high, count: stats.high, className: styles.segB },
            ]}
          />
          <StatBar
            total={total}
            segments={[
              { key: 'd1', label: '1–12', count: stats.dozens[0], className: styles.segD1 },
              { key: 'd2', label: '13–24', count: stats.dozens[1], className: styles.segD2 },
              { key: 'd3', label: '25–36', count: stats.dozens[2], className: styles.segD3 },
              zeroSeg,
            ]}
          />

          {total >= HOT_COLD_MIN_SPINS ? (
            <>
              <NumberChips label={t.hot} icon="🔥" items={stats.hot} t={t} />
              <NumberChips label={t.cold} icon="❄️" items={stats.cold} t={t} />
            </>
          ) : (
            <p className={styles.hcPending}>{t.hotColdPending(HOT_COLD_MIN_SPINS - total)}</p>
          )}
        </div>
      </div>
    </section>
  );
};
