'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { TOTAL_HANDS, analyzeHand, tablesAsync } from './analysis';
import { MiniCard } from './Cards';
import { HANDS, MAX_COINS, PAY_TABLES, PAY_TABLE_IDS, type PayTableId } from './engine';
import { getStrings } from './i18n';
import { CLASSES, DEALT_COUNTS, PRECOMPUTED } from './precomputed';
import styles from './VideoPoker.module.css';

type CallId = 'flushOverPair' | 'pairOverStraight' | 'breakFlush' | 'noKicker' | 'pairOverRoyal3';

/** suit · 13 + rank, rank 0 = deuce … 12 = ace; suits ♠ ♥ ♦ ♣. */
const card = (rank: number, suit: number) => suit * 13 + rank;
const [S, H, D, Cl] = [0, 1, 2, 3];
/** Deals where the tempting play is wrong, and the tempting hold (positions in the hand). */
const CALLS: { id: CallId; hand: number[]; rival: number[] }[] = [
  { id: 'flushOverPair', hand: [card(3, S), card(3, H), card(7, H), card(11, H), card(0, H)], rival: [0, 1] },
  { id: 'pairOverStraight', hand: [card(3, S), card(3, H), card(4, D), card(5, Cl), card(6, S)], rival: [0, 2, 3, 4] },
  { id: 'breakFlush', hand: [card(12, S), card(11, S), card(10, S), card(9, S), card(2, S)], rival: [0, 1, 2, 3, 4] },
  { id: 'noKicker', hand: [card(9, S), card(9, H), card(12, D), card(5, Cl), card(1, S)], rival: [0, 1, 2] },
  { id: 'pairOverRoyal3', hand: [card(11, S), card(10, S), card(9, S), card(9, H), card(2, D)], rival: [0, 1, 2] },
];

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;

  const [payId, setPayId] = useState<PayTableId>('9/6');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const start = setTimeout(() => {
      void tablesAsync().then(() => {
        if (alive) setReady(true);
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(start);
    };
  }, []);

  const pays = PAY_TABLES[payId];
  const data = PRECOMPUTED[payId];
  const order = HANDS.map((name, rank) => ({ name, rank })).reverse();
  const maxShare = Math.max(...data.final.map((p, r) => p * pays[r]));
  const maxHold = Math.max(...data.holdSizes);

  const calls = useMemo(() => {
    if (!ready) return null;
    return CALLS.map((c) => {
      const all = analyzeHand(c.hand, PAY_TABLES[payId]);
      const rivalMask = c.rival.reduce((m, i) => m | (1 << i), 0);
      return { ...c, best: all[0], rival: all.find((h) => h.mask === rivalMask)! };
    });
  }, [ready, payId]);

  const holdCards = (hand: number[], mask: number) => hand.filter((_, i) => mask & (1 << i));

  return (
    <div className={styles.oddsLayout}>
      <p className={styles.intro}>{t.oddsIntro}</p>

      <div className={styles.optionRow} role="radiogroup" aria-label={t.payTableLabel}>
        <span className={styles.muted}>{t.payTableLabel}:</span>
        {PAY_TABLE_IDS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={payId === id} className={styles.optionBtn} onClick={() => setPayId(id)}>
            {id}
          </button>
        ))}
      </div>

      <section className={styles.panel} aria-labelledby="vp-payback-title">
        <h3 id="vp-payback-title" className={styles.blockTitle}>
          {t.paybackTitle}
        </h3>
        <div className={styles.headline}>
          <span className={styles.headlineValue} data-testid="vp-payback">
            {pct(data.payback, 4)}
          </span>
        </div>
        <p className={styles.note}>{t.paybackNote(fmt(CLASSES), fmt(TOTAL_HANDS))}</p>
        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statHouseEdge}</span>
            <span className={styles.statValue} data-testid="vp-edge">
              {pct(1 - data.payback, 4)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statShortCoin}</span>
            <span className={styles.statValue} data-testid="vp-short">
              {pct(data.shortCoinPayback)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statRoyalEvery}</span>
            <span className={styles.statValue} data-testid="vp-royal">
              {fmt(1 / data.final[9])}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statVariance}</span>
            <span className={styles.statValue}>{data.variance.toFixed(2)}</span>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="vp-final-title">
        <h3 id="vp-final-title" className={styles.blockTitle}>
          {t.finalTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.finalIntro}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="vp-final-table">
            <thead>
              <tr>
                <th>{t.colHand}</th>
                <th>{t.colContribution}</th>
                <th className={styles.num}>{t.colPays}</th>
                <th className={styles.num}>{t.colProbability}</th>
                <th className={styles.num}>{t.colOneIn}</th>
                <th className={styles.num}>{t.colDealt}</th>
              </tr>
            </thead>
            <tbody>
              {order.map(({ name, rank }) => (
                <tr key={name} data-hand={name}>
                  <td>{t.hand[name]}</td>
                  <td>
                    {rank === 0 ? (
                      '—'
                    ) : (
                      <span className={styles.shareCell}>
                        <span className={styles.shareBar} style={{ width: `${((data.final[rank] * pays[rank]) / maxShare) * 100}%` }} />
                        <b>{pct((data.final[rank] * pays[rank]) / data.payback, 1)}</b>
                      </span>
                    )}
                  </td>
                  <td className={styles.num}>{pays[rank]}</td>
                  <td className={styles.num}>{pct(data.final[rank], rank >= 8 ? 4 : 2)}</td>
                  <td className={styles.num} data-testid={`one-in-${name}`}>
                    {fmt(1 / data.final[rank], 2)}
                  </td>
                  <td className={styles.num}>{pct(DEALT_COUNTS[rank] / TOTAL_HANDS, rank >= 7 ? 4 : 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="vp-tables-title">
        <h3 id="vp-tables-title" className={styles.blockTitle}>
          {t.tablesTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.tablesIntro}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="vp-tables">
            <thead>
              <tr>
                <th>{t.colPayTable}</th>
                <th className={styles.num}>{t.colPayback}</th>
                <th className={styles.num}>{t.colEdge}</th>
                <th className={styles.num}>{t.colFullHouseFlush}</th>
                <th className={styles.num}>{t.colPer1000}</th>
              </tr>
            </thead>
            <tbody>
              {PAY_TABLE_IDS.map((id) => {
                const d = PRECOMPUTED[id];
                return (
                  <tr key={id} data-table={id} aria-current={id === payId ? 'true' : undefined}>
                    <td>{id}</td>
                    <td className={styles.num} data-testid={`payback-${id}`}>
                      {pct(d.payback, 4)}
                    </td>
                    <td className={styles.num}>{pct(1 - d.payback, 2)}</td>
                    <td className={styles.num}>
                      {PAY_TABLES[id][6]} / {PAY_TABLES[id][5]}
                    </td>
                    <td className={styles.num}>{fmt((1 - d.payback) * 1000 * MAX_COINS, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="vp-hold-title">
        <h3 id="vp-hold-title" className={styles.blockTitle}>
          {t.holdTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.holdIntro}
        </p>
        <div className={styles.holdBars} role="img" aria-label={data.holdSizes.map((p, n) => `${t.holdLabel(n)}: ${pct(p, 1)}`).join(', ')}>
          {data.holdSizes.map((p, n) => (
            <div key={n} className={styles.holdCol}>
              <span>{pct(p, 1)}</span>
              <span className={styles.holdColBar} style={{ height: `${(p / maxHold) * 100}%` }} />
              <span className={styles.holdColLabel}>{t.holdLabel(n)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="vp-calls-title">
        <h3 id="vp-calls-title" className={styles.blockTitle}>
          {t.callsTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.callsIntro}
        </p>
        {!calls ? (
          <p className={styles.muted}>{t.calculating}</p>
        ) : (
          <ul className={styles.callList} data-testid="vp-calls">
            {calls.map((c) => (
              <li key={c.id} className={styles.callItem} data-call={c.id}>
                <h4>{t.callName[c.id]}</h4>
                <div className={styles.callHand}>
                  {c.hand.map((x) => (
                    <MiniCard key={x} card={x} />
                  ))}
                </div>
                <span className={styles.holdCards}>
                  {holdCards(c.hand, c.best.mask).map((x) => (
                    <MiniCard key={x} card={x} />
                  ))}
                  <b>{c.best.ev.toFixed(3)}</b>
                  <span className={styles.muted}>&gt;</span>
                  {holdCards(c.hand, c.rival.mask).map((x) => (
                    <MiniCard key={x} card={x} />
                  ))}
                  <span>{c.rival.ev.toFixed(3)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
