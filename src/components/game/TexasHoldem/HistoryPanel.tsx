'use client';

import { History } from 'lucide-react';
import type { Card } from './engine';
import { chips, fill, formatLog, playerName, signedChips, signedRate } from './format';
import { cardsDealtOn, summarizeSession, type HandOutcome, type HandRecord } from './history';
import type { HoldemStrings } from './i18n';
import styles from './texas-holdem.module.css';

export const HISTORY_VISIBLE_HANDS = 30;

const percent = (rate: number): string => `${Math.round(rate * 100)}%`;

const outcomeClass: Record<HandOutcome, string> = {
  won: styles.outcomeWon,
  split: styles.outcomeSplit,
  lost: styles.outcomeLost,
  folded: '',
};

function MiniCards({ cards }: { cards: readonly Card[] }) {
  return (
    <span className={styles.miniCards}>
      {cards.map((card) => {
        const red = card.suit === '♥' || card.suit === '♦';
        return (
          <span key={`${card.rank}${card.suit}`} className={`${styles.miniCard} ${red ? styles.miniCardRed : ''}`}>
            {card.rank === 'T' ? '10' : card.rank}{card.suit}
          </span>
        );
      })}
    </span>
  );
}

function netClass(amount: number): string {
  return amount > 0 ? styles.netUp : amount < 0 ? styles.netDown : styles.netEven;
}

function HandEntry({ record, strings }: { record: HandRecord; strings: HoldemStrings }) {
  const text = strings.history;
  return (
    <li>
      <details className={styles.historyHand}>
        <summary>
          <span className={styles.historyNumber}>#{record.handNumber}</span>
          <MiniCards cards={record.heroHole} />
          <span className={styles.historyBoard}>
            {record.board.length > 0 ? <MiniCards cards={record.board} /> : <small>{text.noFlop}</small>}
          </span>
          <span className={`${styles.historyOutcome} ${outcomeClass[record.outcome]}`}>{text.outcomes[record.outcome]}</span>
          <strong className={netClass(record.heroNet)}>{signedChips(record.heroNet)}</strong>
        </summary>
        <div className={styles.historyDetail}>
          <p className={styles.historyPot}>{strings.table.pot}: {chips(record.pot)}</p>
          {record.shownHands.length > 0 && (
            <div className={styles.historyShown}>
              <h3>{text.shownHands}</h3>
              <ul>
                {record.shownHands.map((shown) => (
                  <li key={shown.seatIndex} className={shown.won ? styles.historyShownWinner : ''}>
                    <span>{playerName(record.players[shown.seatIndex], strings)}</span>
                    <MiniCards cards={shown.hole} />
                    <small>{strings.hands[shown.rank]}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ol className={styles.historyLog}>
            {record.log.map((entry) => (
              <li key={entry.id} className={entry.type === 'street' ? styles.historyStreet : ''}>
                {formatLog(entry, record.players, strings)}
                {entry.type === 'street' && entry.street && <MiniCards cards={cardsDealtOn(record.board, entry.street)} />}
              </li>
            ))}
          </ol>
        </div>
      </details>
    </li>
  );
}

export function HistoryPanel({ records, bigBlind, strings }: {
  records: readonly HandRecord[];
  bigBlind: number;
  strings: HoldemStrings;
}) {
  const text = strings.history;
  const stats = summarizeSession(records, bigBlind);
  const visible = records.slice(-HISTORY_VISIBLE_HANDS).reverse();
  return (
    <section className={styles.historyPanel} aria-labelledby="holdem-history-title">
      <div className={styles.historyHeading}>
        <h2 id="holdem-history-title"><History size={16} aria-hidden="true" />{text.title}</h2>
        {records.length > visible.length && <small>{fill(text.latest, { amount: visible.length })}</small>}
      </div>
      <dl className={styles.historyStats}>
        <div><dt>{text.stats.hands}</dt><dd>{stats.hands}</dd></div>
        <div><dt>{text.stats.net}</dt><dd className={netClass(stats.net)}>{signedChips(stats.net)}</dd></div>
        <div><dt>{text.stats.bbPer100}</dt><dd className={netClass(Math.round(stats.bbPer100 * 10))}>{stats.hands ? signedRate(stats.bbPer100) : '–'}</dd></div>
        <div><dt>{text.stats.won}</dt><dd>{stats.hands ? `${stats.handsWon} · ${percent(stats.wonRate)}` : '–'}</dd></div>
        <div><dt title={text.stats.vpipHint}>{text.stats.vpip}</dt><dd>{stats.hands ? percent(stats.vpipRate) : '–'}</dd></div>
        <div><dt>{text.stats.biggestPot}</dt><dd>{stats.biggestPotWon ? chips(stats.biggestPotWon) : '–'}</dd></div>
      </dl>
      {visible.length === 0
        ? <p className={styles.historyEmpty}>{text.empty}</p>
        : <ol className={styles.historyList}>{visible.map((record) => <HandEntry key={record.handNumber} record={record} strings={strings} />)}</ol>}
    </section>
  );
}
