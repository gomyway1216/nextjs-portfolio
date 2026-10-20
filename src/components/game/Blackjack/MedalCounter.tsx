'use client';

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
  medals: number;
  /** Medals on the table: the bet before a hand, every stake during one. Null until the player's medals are found. */
  onTable: number | null;
  /** Medals the last hand won, or null when there is nothing to show. */
  won: number | null;
  format: (n: number) => string;
  /**
   * What the MEDALS digits show, when it is not `medals`: a win running in (MedalCenter/countUp.ts). The numbers in
   * type are the real ones throughout.
   */
  ledMedals?: number | null;
  children?: React.ReactNode;
}

/**
 * The table's counter, as a medal machine's: the player's medals on red LED
 * digits beside a stack of medals, and the bet and the win on amber ones. The
 * digits are a picture; every number is written in type too, for a screen
 * reader and for anything else that reads the page. It stands on the machine's
 * panel over its buttons; the note that medals are not money (`MedalNotes`)
 * follows the buttons.
 */
export const MedalCounter = ({ t, loaded, medals, onTable, won, format, ledMedals = null, children }: MedalCounterProps) => {
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
          <SegmentDisplay value={loaded ? (ledMedals ?? medals) : ''} places={MEDAL_PLACES} />
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
          <SegmentDisplay value={won ?? ''} places={3} tone="amber" />
        </div>
      </div>
      {children}
    </section>
  );
};

/**
 * What the counter's medals are, said under the table's buttons: that they are not money, and, where this browser
 * does not keep them, that they start again on a reload.
 */
export const MedalNotes = ({
  t,
  loaded,
  kept,
}: {
  t: BlackjackStrings;
  loaded: boolean;
  /** Whether this browser keeps the medals at all: when it does not, they start again on a reload, and the note says so. */
  kept: boolean;
}) => (
  <>
    {loaded && !kept && (
      <p className={styles.notKept} data-testid="bj-not-kept">
        {t.notKept}
      </p>
    )}
    <p className={styles.notMoney} data-testid="bj-not-money">
      {t.notMoney}
    </p>
  </>
);
