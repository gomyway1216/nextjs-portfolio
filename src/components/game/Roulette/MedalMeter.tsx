'use client';

import type { ReactNode } from 'react';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { FACE_STAR, MEDAL_PAINT } from '../MedalPusher/medalLook';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import type { RouletteStrings } from './i18n';
import styles from './Roulette.module.css';

/** How many digits the medal counter has (as the medal center's: up to 9,999,999), and the bet counter. */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 5;

/** The star on the medal, in its view box: the one struck on every medal of the medal center (medalLook.ts). */
const STAR = FACE_STAR.map(([x, y]) => `${(16 + x * 15).toFixed(2)},${(16 + y * 15).toFixed(2)}`).join(' ');

/** One of the medal center's medals: copper-nickel, with a raised rim and its star. */
export const MedalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
    <circle cx="16" cy="16" r="15" fill={MEDAL_PAINT.face} stroke={MEDAL_PAINT.edge} strokeWidth="1.4" />
    <circle cx="16" cy="16" r="12.2" fill="none" stroke={MEDAL_PAINT.light} strokeWidth="1.6" />
    <circle cx="16.4" cy="16.5" r="12.2" fill="none" stroke={MEDAL_PAINT.rim} strokeWidth="0.8" opacity="0.7" />
    <polygon points={STAR} fill={MEDAL_PAINT.dark} />
  </svg>
);

export interface MedalMeterProps {
  /** The player's medals that are not on the felt, or null until they have been found. */
  medals: number | null;
  /** The medals on the felt. */
  bet: number;
  t: RouletteStrings;
  /** What stands under the counters for the moment: the free cupful, when the player has run out. */
  children?: ReactNode;
}

/**
 * The table's medal counter, as a medal machine's: the player's medals and
 * the medals bet, each on LED digits behind smoked acrylic (the Medal
 * Pusher's own display), on a plate with one of the medals beside them. The
 * numbers are written in type for a screen reader; the digits are a picture.
 * Under them, always, the note that medals are not money, and where the
 * medals belong.
 */
export const MedalMeter = ({ medals, bet, t, children }: MedalMeterProps) => (
  <section className={styles.meter} aria-label={t.medals} data-testid="roulette-meter" data-loaded={medals !== null} data-medals={medals ?? ''} data-bet={bet}>
    <div className={styles.meterRow}>
      <MedalIcon className={styles.meterMedal} />
      <div className={styles.meterCell}>
        <span className={styles.meterLabel} aria-hidden>
          {t.medals}
        </span>
        <span className={styles.meterLed}>
          <SegmentDisplay value={medals ?? ''} places={MEDAL_PLACES} />
        </span>
        <span className={styles.srOnly} data-testid="roulette-medals">
          {medals === null ? t.finding : t.medalsSr(medals)}
        </span>
      </div>
      <div className={`${styles.meterCell} ${styles.meterBet}`}>
        <span className={styles.meterLabel} aria-hidden>
          {t.bet}
        </span>
        <span className={styles.meterLed}>
          <SegmentDisplay value={bet} places={BET_PLACES} tone="amber" />
        </span>
        <span className={styles.srOnly} data-testid="roulette-bet">
          {t.betSr(bet)}
        </span>
      </div>
    </div>
    {medals === null && (
      <p className={styles.meterFinding} aria-hidden>
        {t.finding}
      </p>
    )}
    {children}
    <p className={styles.meterNote} data-testid="roulette-not-money">
      {t.notMoney}
    </p>
    <p className={styles.meterNote}>
      {t.centerNote}{' '}
      <a className={styles.meterLink} href={MEDAL_CENTER_PATH} data-testid="roulette-center-note-link">
        {t.centerNoteLink}
      </a>
    </p>
  </section>
);
