'use client';

import { memo, useState, type KeyboardEvent } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { MiniCard } from './Cards';
import { HANDS, cardLabel } from './engine';
import { HISTORY_LIMIT, cardsAt, mistakesOf, type HandRecord } from './history';
import { getStrings } from './i18n';
import styles from './VideoPoker.module.css';

const labels = (list: number[]) => list.map(cardLabel).join(' ');

/**
 * Space pressed on the focused list scrolls it, as it does any scrolling region: it is kept from the machine's keys
 * (MedalCenter/machineKeys.ts), which listen on the window and would deal or draw with it.
 */
export const keepSpace = (event: Pick<KeyboardEvent, 'key' | 'stopPropagation'>) => {
  if (event.key === ' ') event.stopPropagation();
};

/**
 * The hands drawn this session, newest first: what was dealt, what was held, what it won, and how the hold compares
 * with the best play. `startFiltered` opens it on the holds that were not the best.
 */
export const HandHistory = memo(function HandHistory({ log, startFiltered = false }: { log: readonly HandRecord[]; startFiltered?: boolean }) {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const fmt = (n: number) => n.toLocaleString(language === 'ja' ? 'ja-JP' : 'en-US');
  const [mistakesOnly, setMistakesOnly] = useState(startFiltered);
  const mistakes = mistakesOf(log);
  const shownLog = mistakesOnly ? mistakes : log;

  return (
    <>
      <div className={styles.toggleRow} style={{ marginTop: '1rem' }}>
        <h3 className={styles.sectionLabel} style={{ margin: 0 }}>
          {t.historyTitle}
        </h3>
        <label className={styles.toggle}>
          <input type="checkbox" checked={mistakesOnly} onChange={(e) => setMistakesOnly(e.target.checked)} data-testid="vp-history-filter" />
          {t.historyMistakesOnly(mistakes.length)}
        </label>
      </div>
      {shownLog.length === 0 ? (
        <p className={styles.muted} data-testid="vp-history-empty">
          {log.length === 0 ? t.historyEmpty : t.historyNoMistakes}
        </p>
      ) : (
        <div className={styles.historyScroll} role="region" aria-label={t.historyTitle} tabIndex={0} onKeyDown={keepSpace} data-testid="vp-history">
          <ol className={styles.historyList}>
            {shownLog.map((r) => {
              const keptCards = cardsAt(r.dealt, r.held);
              return (
                <li key={r.no} className={styles.historyItem} data-no={r.no} data-good={r.verdict ? (r.verdict.best ? 'true' : 'false') : undefined}>
                  <div className={styles.historyHead}>
                    <span className={styles.historyNo}>{t.historyNo(r.no)}</span>
                    <span className={styles.srOnly}>{t.historyCardsAria(labels(r.dealt), keptCards.length > 0 ? labels(keptCards) : null)}</span>
                    <span className={styles.holdCards} aria-hidden="true">
                      {r.dealt.map((c, i) => (
                        <span key={c} className={styles.historyCard} data-held={r.held & (1 << i) ? 'true' : 'false'}>
                          <MiniCard card={c} />
                        </span>
                      ))}
                    </span>
                    <span className={styles.historyResult} data-win={r.won > 0 ? 'true' : undefined}>
                      {r.won > 0 ? t.historyWin(t.hand[HANDS[r.rank]], fmt(r.won)) : t.resultLose}
                    </span>
                  </div>
                  <div className={styles.historyVerdict}>
                    <span className={styles.historyBet}>{t.historyBet(r.coins, r.payId)}</span>
                    {!r.verdict ? (
                      <span>{t.calculating}</span>
                    ) : r.verdict.best ? (
                      <span className={styles.historyGood}>{t.historyGood}</span>
                    ) : (
                      <>
                        <span className={styles.holdCards}>
                          <span>{t.historyBetter}</span>
                          {r.verdict.bestMask === 0 ? <span>{t.discardAll}</span> : cardsAt(r.dealt, r.verdict.bestMask).map((c) => <MiniCard key={c} card={c} />)}
                        </span>
                        <span className={styles.historyCost}>{t.historyCost(r.verdict.lost.toFixed(3))}</span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <p className={styles.note}>{t.historyNote(HISTORY_LIMIT)}</p>
    </>
  );
});
