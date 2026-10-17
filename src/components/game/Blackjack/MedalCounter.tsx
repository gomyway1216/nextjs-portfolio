'use client';

import { countedLeds } from '../common/usePayoutCount';
import { SCREEN_STACK } from '../MedalPusher/medalLook';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import type { BlackjackStrings } from './i18n';
import styles from './Blackjack.module.css';

/** How many digits the counter of the player's medals has, as the medal center's: up to 9,999,999. */
export const MEDAL_PLACES = 7;

/** A stack of medals, in the silver of the medals on the medal center's machines. */
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

/** How tall a stack shows `medals`: one medal for none, and one more for every power of ten, up to six. */
export const stackFor = (medals: number) => (medals <= 0 ? 1 : Math.min(6, 2 + Math.floor(Math.log10(medals + 1))));

export interface MedalCounterProps {
  t: BlackjackStrings;
  /** Whether the player's medals have been read: until then nothing is shown on the digits. */
  loaded: boolean;
  /** Whether this browser keeps the medals at all: when it does not, they start again on a reload, and the counter says so. */
  kept: boolean;
  medals: number;
  /** Medals on the table: the bet before a hand, every stake during one. Null until the player's medals are found. */
  onTable: number | null;
  /** Medals the last hand won, or null when there is nothing to show. */
  won: number | null;
  format: (n: number) => string;
  /**
   * A win being counted out (common/usePayoutCount.ts): `counted` of the `medals` the hand gave back so far. The LED
   * digits run up with it; the numbers in type are the real ones throughout.
   */
  counting?: { counted: number; medals: number } | null;
  children?: React.ReactNode;
}

/**
 * The table's counter, as a medal machine's: the player's medals on red LED
 * digits beside a stack of medals, and the bet and the win on amber ones. The
 * digits are a picture; every number is written in type too, for a screen
 * reader and for anything else that reads the page. Under it, always, the
 * note that medals are not money.
 */
export const MedalCounter = ({ t, loaded, kept, medals, onTable, won, format, counting = null, children }: MedalCounterProps) => {
  const led = countedLeds(medals, won, counting);
  return (
    <section className={styles.cabinet} aria-labelledby="bj-medals-label" data-testid="bj-counter" data-loaded={loaded}>
      <div className={styles.cabinetHead}>
        <h2 id="bj-medals-label" className={styles.cabinetLabel}>
          {t.medalsLabel}
        </h2>
        <p className={styles.cabinetCount}>
          {loaded ? (
            <>
              <strong data-testid="bj-medals">{format(medals)}</strong>
              <span>{t.medalUnit(medals)}</span>
            </>
          ) : (
            <span data-testid="bj-medals-finding">{t.findingMedals}</span>
          )}
        </p>
      </div>
      <div className={styles.cabinetBody}>
        <MedalStack count={stackFor(loaded ? medals : 0)} className={styles.cabinetStack} />
        <div className={styles.cabinetLed}>
          <SegmentDisplay value={loaded ? led.medals : ''} places={MEDAL_PLACES} />
        </div>
      </div>
      <div className={styles.smallLeds}>
        <div className={styles.smallLed}>
          <span className={styles.smallLedLabel}>{t.betLabel}</span>
          <strong className={styles.srOnly} data-testid="bj-on-table">
            {onTable ?? ''}
          </strong>
          <SegmentDisplay value={onTable ?? ''} places={2} tone="amber" />
        </div>
        <div className={styles.smallLed}>
          <span className={styles.smallLedLabel}>{t.winLabel}</span>
          <strong className={styles.srOnly} data-testid="bj-won">
            {won ?? 0}
          </strong>
          <SegmentDisplay value={led.won ?? ''} places={3} tone="amber" />
        </div>
      </div>
      {children}
      {loaded && !kept && (
        <p className={styles.notKept} data-testid="bj-not-kept">
          {t.notKept}
        </p>
      )}
      <p className={styles.notMoney} data-testid="bj-not-money">
        {t.notMoney}
      </p>
    </section>
  );
};
