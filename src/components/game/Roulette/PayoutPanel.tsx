'use client';

import { useMemo } from 'react';
import { colorOf, WHEEL_ORDER } from './engine';
import type { RouletteStrings } from './i18n';
import type { PlacedBet } from './medalTable';
import { payoutMap, pocketShare, signedAverage, signedNet } from './payoutMap';
import styles from './Roulette.module.css';

interface PayoutMapPanelProps {
  /** The bets on the felt. */
  bets: readonly PlacedBet[];
  t: RouletteStrings;
}

const netClass = (net: number): string | undefined => (net > 0 ? styles.netWin : net < 0 ? styles.netLose : undefined);

/**
 * Under the felt: what the bets on it would do on every pocket, before the
 * wheel is spun. How many of the 37 numbers leave the player ahead, the best
 * and the worst of them, the average over all 37, and each pocket's net in the
 * order the pockets sit on the wheel.
 */
export const PayoutMapPanel = ({ bets, t }: PayoutMapPanelProps) => {
  const map = useMemo(() => payoutMap(bets), [bets]);

  return (
    <section className={styles.payout} aria-label={t.payoutTitle} data-testid="roulette-payout">
      <div className={styles.sectionLabel}>{t.payoutTitle}</div>
      {map === null ? (
        <p className={styles.payoutEmpty}>{t.payoutEmpty}</p>
      ) : (
        <>
          <ul className={styles.payoutFacts}>
            <li data-testid="roulette-payout-ahead">
              {t.payoutAhead(map.ahead, pocketShare(map.ahead))}
              {map.level > 0 && ` · ${t.payoutLevel(map.level)}`}
            </li>
            <li data-testid="roulette-payout-best">
              {t.payoutBest}: <b className={netClass(map.best)}>{signedNet(map.best)}</b> {t.payoutOn(map.bestNumbers)}
            </li>
            <li data-testid="roulette-payout-worst">
              {t.payoutWorst}: <b className={netClass(map.worst)}>{signedNet(map.worst)}</b> {t.payoutOn(map.worstNumbers)}
            </li>
            <li>{t.payoutAverage(signedAverage(map.average))}</li>
          </ul>
          <ol className={styles.payoutCells} aria-label={t.payoutMapLabel}>
            {WHEEL_ORDER.map((n) => {
              const net = map.nets[n];
              return (
                <li key={n} className={styles.payoutCell} data-net={net > 0 ? 'ahead' : net < 0 ? 'behind' : 'level'}>
                  <span className={styles.payoutNum} data-color={colorOf(n)}>
                    {n}
                  </span>
                  <span className={styles.srOnly}> {t.colorName(n)}: </span>
                  <span className={styles.payoutNet}>{signedNet(net)}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
};
