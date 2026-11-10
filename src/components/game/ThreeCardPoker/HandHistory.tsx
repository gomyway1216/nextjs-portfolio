'use client';

import { forwardRef } from 'react';
import { DEALER_HANDS } from './analysis';
import { rankOfValue, type Card, type HandValue } from './engine';
import { rankLabel } from './Cards';
import { HISTORY_LIMIT, type History } from './history';
import type { ThreeCardPokerStrings } from './i18n';
import styles from './ThreeCardPoker.module.css';

const signedCount = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

const Cards = ({ cards }: { cards: readonly Card[] }) => (
  <span className={styles.historyCards}>
    {cards.map((card) => (
      <span key={`${card.rank}${card.suit}`} data-red={card.suit === '♥' || card.suit === '♦' ? 'true' : undefined}>
        {rankLabel(card.rank)}
        {card.suit}
      </span>
    ))}
  </span>
);

export interface HandHistoryProps {
  history: History;
  t: ThreeCardPokerStrings;
  locale: string;
}

/**
 * The session's hands, newest first: the cards, what each came to, and the decision against the best one. The list
 * scrolls, so it takes the keyboard's focus; the table's own keys are not acted on while it has it (PlayTab).
 */
export const HandHistory = forwardRef<HTMLDivElement, HandHistoryProps>(function HandHistory({ history, t, locale }, ref) {
  const medals = (cost: number) => cost.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const handName = (v: HandValue) => t.handName(v.category, rankLabel(rankOfValue(v.tiebreak[0])));
  return (
    <section className={styles.history} data-testid="tcp-history">
      <div className={styles.sectionLabel}>
        {t.historyTitle} <small className={styles.muted}>({t.historyKept(HISTORY_LIMIT)})</small>
      </div>
      {history.hands === 0 ? (
        <p className={styles.note}>{t.historyEmpty}</p>
      ) : (
        <>
          <p className={styles.historySummary} data-testid="tcp-history-summary">
            {t.historySummary(history.mistakes, history.hands, medals(history.cost))}
          </p>
          <div ref={ref} className={styles.historyScroll} tabIndex={0} role="region" aria-label={t.historyAria}>
            <ul className={styles.historyList}>
              {history.entries.map((entry) => {
                const { settlement } = entry;
                const agreed = settlement.decision === entry.best;
                return (
                  <li key={entry.number} className={styles.historyItem} data-hand={entry.number} data-agreed={agreed ? 'true' : 'false'}>
                    <span className={styles.historyNumber}>#{entry.number}</span>
                    <span className={styles.historyHands}>
                      <span>
                        <span className={styles.historyWho}>{t.you}</span> <Cards cards={entry.player} /> {handName(settlement.player)}
                      </span>
                      <span>
                        <span className={styles.historyWho}>{t.dealer}</span> <Cards cards={entry.dealer} /> {handName(settlement.dealer)}
                        {!settlement.dealerQualifies && ` · ${t.notQualifies}`}
                      </span>
                    </span>
                    <span className={`${styles.historyNet} ${settlement.net > 0 ? styles.pos : settlement.net < 0 ? styles.neg : ''}`}>
                      <span aria-hidden="true">{signedCount(settlement.net)}</span>
                      <span className={styles.srOnly}>{t.historyNet(settlement.net)}</span>
                    </span>
                    <span className={styles.historyVerdict}>
                      <span aria-hidden="true">{agreed ? '✓' : '✗'} </span>
                      {t.historyVerdict(settlement.decision, entry.best, medals(entry.cost))}
                      <span className={styles.historyBets}> · {t.historyBets(entry.bets.ante, entry.bets.pairPlus)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className={styles.note}>{t.historyNote(DEALER_HANDS.toLocaleString(locale))}</p>
        </>
      )}
    </section>
  );
});
