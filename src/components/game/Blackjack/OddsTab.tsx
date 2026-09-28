'use client';

import { useMemo, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  P,
  TABLE_RULES,
  VALUES,
  dealerOutcome,
  gameValue,
  optimalChart,
  policyValue,
  type Action,
  type ChartCell,
  type Rules,
  type Value,
} from './analysis';
import { HARD_CHART, PAIR_CHART, SOFT_CHART } from './engine';
import { getStrings } from './i18n';
import styles from './Blackjack.module.css';

const RULE_VARIANTS: { id: 'table' | 'h17' | 'sixFive' | 'noDas' | 'splitOnce' | 'surrender'; rules: Rules }[] = [
  { id: 'table', rules: TABLE_RULES },
  { id: 'surrender', rules: { ...TABLE_RULES, surrender: true } },
  { id: 'splitOnce', rules: { ...TABLE_RULES, maxHands: 2 } },
  { id: 'noDas', rules: { ...TABLE_RULES, doubleAfterSplit: false } },
  { id: 'h17', rules: { ...TABLE_RULES, hitSoft17: true } },
  { id: 'sixFive', rules: { ...TABLE_RULES, blackjackPays: 1.2 } },
];

const CODE: Record<Action, string> = { hit: 'H', stand: 'S', double: 'D', split: 'P', surrender: 'R' };
const upLabel = (v: Value) => (v === 11 ? 'A' : String(v));

type Section = 'hard' | 'soft' | 'pairs';
interface Picked {
  section: Section;
  row: number;
  up: number;
}

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const pct = (v: number, digits = 3) => `${(v * 100).toFixed(digits)}%`;
  const signed = (v: number, digits = 3) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

  const value = useMemo(() => gameValue(), []);
  const dealer = useMemo(() => VALUES.map((up) => ({ up, d: dealerOutcome(up) })), []);
  const chart = useMemo(() => optimalChart(), []);
  const variants = useMemo(() => RULE_VARIANTS.map((v) => ({ ...v, edge: gameValue(v.rules).houseEdge })), []);
  const players = useMemo(
    () => [
      { id: 'optimal' as const, edge: value.houseEdge },
      { id: 'mimic' as const, edge: -policyValue((h) => h.total < 17) },
      { id: 'neverBust' as const, edge: -policyValue((h) => h.total <= 11 || (h.soft && h.total < 18)) },
    ],
    [value],
  );
  const [picked, setPicked] = useState<Picked | null>({ section: 'hard', row: 16, up: 8 });

  const handName = (section: Section, row: number) =>
    section === 'hard' ? String(row) : section === 'soft' ? `A,${row - 11}` : `${upLabel(row as Value)},${upLabel(row as Value)}`;

  /** Where the six-deck chart used for the table's hints disagrees with the infinite-deck best play. */
  const sixDeck = (section: Section, row: number, i: number): Action | null => {
    // Both charts list the dealer's up card in the same order: 2…10, A.
    const play = section === 'hard' ? HARD_CHART[row]?.[i] : section === 'soft' ? SOFT_CHART[row]?.[i] : PAIR_CHART[row]?.[i];
    return play ?? null;
  };

  const renderChart = (section: Section, rows: Record<number, ChartCell[]>, title: string) => (
    <div className={styles.chartBlock}>
      <h4 className={styles.subTitle}>{title}</h4>
      <div className={styles.tableWrap}>
        <table className={styles.chart} data-chart={section}>
          <thead>
            <tr>
              <th />
              {VALUES.map((up) => (
                <th key={up}>{upLabel(up)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(rows).map(([rowKey, cells]) => {
              const row = Number(rowKey);
              return (
                <tr key={row}>
                  <th>{handName(section, row)}</th>
                  {cells.map((cell, i) => {
                    const table = sixDeck(section, row, i);
                    const differs = table !== null && table !== cell.best;
                    const isPicked = picked?.section === section && picked.row === row && picked.up === i;
                    return (
                      <td key={i}>
                        <button
                          type="button"
                          className={styles.chartCell}
                          data-play={cell.best}
                          data-cell={`${section}-${row}-${VALUES[i]}`}
                          aria-pressed={isPicked}
                          aria-label={`${t.cellDetail(handName(section, row), upLabel(VALUES[i]))}: ${t.action[cell.best]}`}
                          onClick={() => setPicked({ section, row, up: i })}
                        >
                          {CODE[cell.best]}
                          {differs && <sup aria-hidden="true">*</sup>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const pickedCell = picked ? chart[picked.section][picked.row]?.[picked.up] : null;
  const ranked = pickedCell ? (Object.entries(pickedCell.evs) as [Action, number][]).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className={styles.oddsLayout}>
      <p className={styles.intro}>{t.oddsIntro}</p>

      <section className={styles.panel} aria-labelledby="bj-edge-title">
        <h3 id="bj-edge-title" className={styles.blockTitle}>
          {t.edgeHeadline}
        </h3>
        <div className={styles.headline}>
          <span className={styles.headlineValue} data-testid="bj-house-edge">
            {pct(value.houseEdge)}
          </span>
        </div>
        <p className={styles.note}>{t.edgeHeadlineNote}</p>
        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statPlayerBj}</span>
            <span className={styles.statValue}>{pct(value.playerBlackjack, 2)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statDealerBj}</span>
            <span className={styles.statValue}>{pct(value.dealerBlackjack, 2)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statInsurance}</span>
            {/* Insurance wins 2:1 when the hole card is a ten: 2·(4/13) − 9/13 = −1/13. */}
            <span className={styles.statValue} data-testid="bj-insurance-edge">
              {pct(-(2 * P[10] - (1 - P[10])), 2)}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="bj-dealer-title">
        <h3 id="bj-dealer-title" className={styles.blockTitle}>
          {t.dealerTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.dealerIntro}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="bj-dealer-table">
            <thead>
              <tr>
                <th>{t.colUp}</th>
                {[17, 18, 19, 20, 21].map((k) => (
                  <th key={k} className={styles.num}>
                    {k}
                  </th>
                ))}
                <th className={styles.num}>{t.colBlackjack}</th>
                <th>{t.colBust}</th>
              </tr>
            </thead>
            <tbody>
              {dealer.map(({ up, d }) => (
                <tr key={up} data-up={up}>
                  <td>{upLabel(up)}</td>
                  {([17, 18, 19, 20, 21] as const).map((k) => (
                    <td key={k} className={styles.num}>
                      {pct(d[k], 1)}
                    </td>
                  ))}
                  <td className={styles.num}>{d.blackjack > 0 ? pct(d.blackjack, 1) : '—'}</td>
                  <td>
                    <span className={styles.bustBar} style={{ width: `${d.bust * 150}px` }} />
                    <b data-testid={`bust-${up}`}>{pct(d.bust, 1)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="bj-chart-title">
        <h3 id="bj-chart-title" className={styles.blockTitle}>
          {t.chartTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.chartIntro}
        </p>
        <p className={styles.chartLegend}>
          {(['hit', 'stand', 'double', 'split'] as const).map((a) => (
            <span key={a}>{t.chartLegend[a]}</span>
          ))}
        </p>
        {renderChart('hard', chart.hard, t.chartHard)}
        {renderChart('soft', chart.soft, t.chartSoft)}
        {renderChart('pairs', chart.pairs, t.chartPairs)}
        <div className={styles.cellInfo} aria-live="polite" data-testid="bj-cell-info">
          {picked && pickedCell ? (
            <>
              <h4>{t.cellDetail(handName(picked.section, picked.row), upLabel(VALUES[picked.up]))}</h4>
              <ul className={styles.evList}>
                {ranked.map(([a, ev]) => (
                  <li key={a} className={styles.evItem} data-best={a === pickedCell.best ? 'true' : undefined}>
                    <span>{t.action[a]}</span>
                    <span className={styles.evTrack} aria-hidden="true">
                      <span
                        className={styles.evBar}
                        style={{
                          left: `${50 + Math.min(0, Math.max(-2, ev)) * 25}%`,
                          width: `${Math.min(2, Math.abs(ev)) * 25}%`,
                          background: ev >= 0 ? 'var(--bj-win)' : 'var(--bj-lose)',
                        }}
                      />
                    </span>
                    <span className={styles.evValue}>{signed(ev)}</span>
                  </li>
                ))}
              </ul>
              {ranked.length > 1 && (
                <p className={styles.note}>
                  {t.cellMargin(t.action[ranked[0][0]], t.action[ranked[1][0]], (ranked[0][1] - ranked[1][1]).toFixed(4))}
                </p>
              )}
            </>
          ) : (
            t.pickCell
          )}
        </div>
        <p className={styles.note}>{t.chartDiffers}</p>
      </section>

      <section className={styles.panel} aria-labelledby="bj-rules-title">
        <h3 id="bj-rules-title" className={styles.blockTitle}>
          {t.rulesTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.rulesIntro}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="bj-rules-table">
            <thead>
              <tr>
                <th>{t.colRule}</th>
                <th className={styles.num}>{t.colEdge}</th>
                <th className={styles.num}>{t.colChange}</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} data-rule={v.id} aria-current={v.id === 'table' ? 'true' : undefined}>
                  <td>{t.ruleName[v.id]}</td>
                  <td className={styles.num} data-testid={`rule-${v.id}`}>
                    {pct(v.edge)}
                  </td>
                  <td className={styles.num}>{v.id === 'table' ? '—' : `${v.edge > value.houseEdge ? '+' : '−'}${pct(Math.abs(v.edge - value.houseEdge))}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="bj-players-title">
        <h3 id="bj-players-title" className={styles.blockTitle}>
          {t.playersTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.playersIntro}
        </p>
        <table className={styles.oddsTable} data-testid="bj-players-table">
          <tbody>
            {players.map((p) => (
              <tr key={p.id} data-player={p.id}>
                <td>{t.strategyName[p.id]}</td>
                <td className={styles.num}>
                  <b>{pct(p.edge)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};
