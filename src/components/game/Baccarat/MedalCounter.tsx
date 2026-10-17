'use client';

import { FACE_STAR, MEDAL_PAINT, SCREEN_STACK } from '../MedalPusher/medalLook';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import styles from './Baccarat.module.css';

/** How many digits each LED window has: the medals up to 9,999,999 (as the Medal Game Center's counter), a bet of up to 300, a hand's win of up to 9,999. */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 3;
export const WIN_PLACES = 4;

/** The star struck on every medal (medalLook.ts), in a 32-unit view box. */
const STAR = FACE_STAR.map(([x, y]) => `${(16 + x * 15).toFixed(2)},${(16 + y * 15).toFixed(2)}`).join(' ');

/** One of the medal floor's medals: copper-nickel with a raised rim and its star, the same silver as the machines'. */
export const MedalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
    <circle cx="16" cy="16" r="15" fill={MEDAL_PAINT.face} stroke={MEDAL_PAINT.edge} strokeWidth="1.4" />
    <circle cx="16" cy="16" r="12.2" fill="none" stroke={MEDAL_PAINT.light} strokeWidth="1.6" />
    <circle cx="16.4" cy="16.5" r="12.2" fill="none" stroke={MEDAL_PAINT.rim} strokeWidth="0.8" opacity="0.7" />
    <polygon points={STAR} fill={MEDAL_PAINT.dark} />
  </svg>
);

/** A stack of `count` of the floor's silver medals, seen from the side: a stake on a spot. */
export const MedalStack = ({ count, className }: { count: number; className?: string }) => (
  <svg className={className} viewBox="0 0 60 64" aria-hidden focusable="false">
    {Array.from({ length: count }, (_, index) => {
      const y = 54 - index * 6;
      return (
        <g key={index}>
          <ellipse cx="30" cy={y + 3} rx="24" ry="7" fill={SCREEN_STACK.line} />
          <rect x="6" y={y} width="48" height="3" fill={SCREEN_STACK.edge} />
          <ellipse cx="30" cy={y} rx="24" ry="7" fill={index === count - 1 ? SCREEN_STACK.face : SCREEN_STACK.edge} stroke={SCREEN_STACK.line} strokeWidth="1" />
          {index === count - 1 && <ellipse cx="25" cy={y - 2} rx="10" ry="2.5" fill={SCREEN_STACK.shine} opacity="0.75" />}
        </g>
      );
    })}
  </svg>
);

export interface MedalCounterProps {
  /** Whether the player's medals have been read. Until then the windows are dark. */
  loaded: boolean;
  /** The medals the player holds, not counting those on the felt. */
  medals: number;
  /** The medals on the felt. */
  onTable: number;
  /** The medals the last hand gave back, or null when no hand has been settled. */
  won: number | null;
  labels: { medals: string; bet: string; win: string; held: (n: string) => string; onTable: (n: string) => string; won: (n: string) => string; waiting: string };
  fmt: (n: number) => string;
  /**
   * What the MEDALS window shows, when it is not `medals`: a win running in (MedalCenter/countUp.ts). The counts in
   * type are the real ones throughout.
   */
  ledMedals?: number | null;
}

/**
 * The table's medal counter, as a medal machine's: the player's medals on a
 * red seven-segment LED window, and the bet and the last win on amber ones.
 * The windows are pictures; the counts are written in type under them for a
 * screen reader and anything else that reads the page.
 */
export const MedalCounter = ({ loaded, medals, onTable, won, labels, fmt, ledMedals = null }: MedalCounterProps) => {
  return (
    <section className={styles.counter} aria-labelledby="baccarat-counter-label" data-testid="baccarat-counter" data-loaded={loaded}>
      <div className={styles.counterMain}>
        <h3 id="baccarat-counter-label" className={styles.counterLabel}>
          <MedalIcon className={styles.counterMedal} />
          {labels.medals}
        </h3>
        <span className={styles.ledBig}>
          <SegmentDisplay value={loaded ? (ledMedals ?? medals) : ''} places={MEDAL_PLACES} />
        </span>
      </div>
      <div className={styles.counterSmall} aria-hidden>
        <span className={styles.ledPair}>
          <span className={styles.ledLabel}>{labels.bet}</span>
          <span className={styles.ledSmall}>
            <SegmentDisplay value={loaded ? onTable : ''} places={BET_PLACES} tone="amber" />
          </span>
        </span>
        <span className={styles.ledPair}>
          <span className={styles.ledLabel}>{labels.win}</span>
          <span className={styles.ledSmall}>
            <SegmentDisplay value={loaded && won !== null ? won : ''} places={WIN_PLACES} tone="amber" />
          </span>
        </span>
      </div>
      <p className={styles.counterText}>
        {loaded ? (
          <strong data-testid="baccarat-medals" data-medals={medals}>
            {labels.held(fmt(medals))}
          </strong>
        ) : (
          <strong data-testid="baccarat-medals">{labels.waiting}</strong>
        )}
        <span aria-hidden> · </span>
        <span data-testid="baccarat-on-table" data-medals={onTable}>
          {labels.onTable(fmt(onTable))}
        </span>
        {won !== null && (
          <>
            <span aria-hidden> · </span>
            <span data-testid="baccarat-won" data-medals={won}>
              {labels.won(fmt(won))}
            </span>
          </>
        )}
      </p>
    </section>
  );
};
