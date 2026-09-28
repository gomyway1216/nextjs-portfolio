'use client';

import { useMemo, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ODDS_BETS, betOdds, expectedCardsPerHand, reduced, shoeOdds, type OddsBet } from './analysis';
import { CUT_CARD_FROM_END, DEFAULT_DECKS, bankerDraws, type Winner } from './engine';
import { getStrings } from './i18n';
import styles from './Baccarat.module.css';

export const DECK_OPTIONS = [1, 2, 4, 6, 8] as const;
const OUTCOMES: Winner[] = ['banker', 'player', 'tie'];
const DECK_TABLE_BETS: OddsBet[] = ['banker', 'player', 'tie', 'pair'];
const PAYS_TEXT: Record<OddsBet, string> = {
  banker: '0.95:1',
  bankerEz: '1:1',
  player: '1:1',
  tie: '8:1',
  tie9: '9:1',
  pair: '11:1',
  dragon7: '40:1',
  panda8: '25:1',
};

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 3) => `${(v * 100).toFixed(digits)}%`;

  const [decks, setDecks] = useState<number>(DEFAULT_DECKS);
  const odds = useMemo(() => shoeOdds(decks), [decks]);
  const bets = useMemo(
    () => ODDS_BETS.map((id) => betOdds(id, odds)).sort((a, b) => b.ev - a.ev),
    [odds],
  );
  const maxEdge = Math.max(...bets.map((b) => -b.ev));
  const counts: Record<Winner, number> = { banker: odds.banker, player: odds.player, tie: odds.tie };
  const decided = odds.banker + odds.player;
  const cardsPerHand = expectedCardsPerHand(odds);
  // Cards dealt before the cut card, less the exposed card and the average burn:
  // A–9 burn their value and tens / faces burn 10, so (1 + … + 9 + 4 × 10) / 13.
  const averageBurn = 85 / 13;
  const handsPerShoe = (decks * 52 - CUT_CARD_FROM_END - 1 - averageBurn) / cardsPerHand;
  const [pairN, pairD] = reduced(odds.pair, odds.pairTotal);
  const pair = betOdds('pair', odds);
  const byDecks = useMemo(() => DECK_OPTIONS.map((d) => ({ decks: d, odds: shoeOdds(d) })), []);

  return (
    <div className={styles.oddsLayout}>
      <p className={styles.intro}>{t.oddsIntro}</p>

      <div className={styles.deckRow} role="radiogroup" aria-label={t.decksLabel}>
        <span className={styles.chipRowLabel}>{t.decksLabel}:</span>
        {DECK_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={decks === d}
            className={styles.modeBtn}
            onClick={() => setDecks(d)}
          >
            {t.deckOption(d)}
          </button>
        ))}
      </div>

      <section className={styles.panel} aria-labelledby="baccarat-outcome-title">
        <h3 id="baccarat-outcome-title" className={styles.blockTitle}>
          {t.outcomeTitle}
        </h3>
        <div className={styles.outcomeBar} aria-hidden="true">
          {OUTCOMES.map((w) => (
            <span key={w} data-winner={w} style={{ flexGrow: counts[w] }}>
              {pct(counts[w] / odds.total, 2)}
            </span>
          ))}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable}>
            <thead>
              <tr>
                <th>{t.colOutcome}</th>
                <th className={styles.num}>{t.colProbability}</th>
                <th className={styles.num}>{t.colWays}</th>
                <th className={styles.num}>{t.colNoTie}</th>
              </tr>
            </thead>
            <tbody>
              {OUTCOMES.map((w) => (
                <tr key={w} data-outcome={w}>
                  <td>{t.outcomeName[w]}</td>
                  <td className={styles.num} data-testid={`p-${w}`}>
                    {pct(counts[w] / odds.total, 4)}
                  </td>
                  <td className={styles.num}>{fmt(counts[w])}</td>
                  <td className={styles.num}>{w === 'tie' ? '—' : pct(counts[w] / decided, 3)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td className={styles.num}>100%</td>
                <td className={styles.num} data-testid="total-ways">
                  {fmt(odds.total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={styles.note}>{t.outcomeNote(fmt(odds.total))}</p>
      </section>

      <section className={styles.panel} aria-labelledby="baccarat-edge-title">
        <h3 id="baccarat-edge-title" className={styles.blockTitle}>
          {t.edgeTitle}
        </h3>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable}>
            <thead>
              <tr>
                <th>{t.colBet}</th>
                <th>{t.colPays}</th>
                <th className={styles.num}>{t.colWin}</th>
                <th className={styles.num}>{t.colPush}</th>
                <th>{t.colHouseEdge}</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.id} data-bet={b.id}>
                  <td>{t.oddsBetName[b.id]}</td>
                  <td>{PAYS_TEXT[b.id]}</td>
                  <td className={styles.num}>{pct(b.win, 3)}</td>
                  <td className={styles.num}>{b.push > 0 ? pct(b.push, 3) : '—'}</td>
                  <td>
                    <span className={styles.edgeCell}>
                      <span className={styles.edgeBar} style={{ width: `${(-b.ev / maxEdge) * 100}%` }} />
                      <b data-testid={`edge-${b.id}`}>{pct(-b.ev)}</b>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t.edgeNote}</p>
      </section>

      <section className={styles.panel} aria-labelledby="baccarat-tableau-title">
        <h3 id="baccarat-tableau-title" className={styles.blockTitle}>
          {t.tableauTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0, marginBottom: '0.6rem' }}>
          {t.tableauIntro}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.tableau} data-testid="tableau">
            <thead>
              <tr>
                <th rowSpan={2}>{t.colBankerTotal}</th>
                <th rowSpan={2}>{t.playerStood}</th>
                <th colSpan={10}>{t.playerThird}</th>
              </tr>
              <tr>
                {Array.from({ length: 10 }, (_, v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }, (_, total) => (
                <tr key={total}>
                  <th>{total}</th>
                  {[null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((third) => {
                    const draw = bankerDraws(total, third);
                    return (
                      <td
                        key={third ?? 'stood'}
                        data-draw={draw ? 'true' : 'false'}
                        title={draw ? t.drawLong : t.standLong}
                      >
                        {draw ? t.drawShort : t.standShort}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="baccarat-why-title">
        <h3 id="baccarat-why-title" className={styles.blockTitle}>
          {t.whyTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.whyBody}
        </p>
        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statNatural}</span>
            <span className={styles.statValue}>{pct(odds.natural / odds.total, 2)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statPlayerDraws}</span>
            <span className={styles.statValue}>{pct(odds.playerDraws / odds.total, 2)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statBankerDraws}</span>
            <span className={styles.statValue}>{pct(odds.bankerDraws / odds.total, 2)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statCardsPerHand}</span>
            <span className={styles.statValue} data-testid="cards-per-hand">
              {cardsPerHand.toFixed(3)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statHandsPerShoe}</span>
            <span className={styles.statValue}>{Math.round(handsPerShoe)}</span>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="baccarat-pair-title">
        <h3 id="baccarat-pair-title" className={styles.blockTitle}>
          {t.pairTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }} data-testid="pair-body">
          {t.pairBody(decks, `${fmt(pairN)}/${fmt(pairD)}`, pct(pair.win, 2), pct(-pair.ev, 2))}
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="baccarat-decks-title">
        <h3 id="baccarat-decks-title" className={styles.blockTitle}>
          {t.decksTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.decksIntro}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="decks-table">
            <thead>
              <tr>
                <th>{t.colDecks}</th>
                {DECK_TABLE_BETS.map((id) => (
                  <th key={id} className={styles.num}>
                    {t.oddsBetName[id]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byDecks.map((row) => (
                <tr key={row.decks} data-decks={row.decks} aria-current={row.decks === decks ? 'true' : undefined}>
                  <td>{row.decks}</td>
                  {DECK_TABLE_BETS.map((id) => (
                    <td key={id} className={styles.num}>
                      {pct(-betOdds(id, row.odds).ev)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
