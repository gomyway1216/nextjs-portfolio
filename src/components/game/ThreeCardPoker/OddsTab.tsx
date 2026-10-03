'use client';

import { useMemo, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  DEALER_HANDS,
  EV_FOLD,
  HAND_COUNT,
  TOTAL_COMBINATIONS,
  handCounts,
  highCardCurve,
  pairPlusOdds,
  qualifyingHands,
  ranksOdds,
  scoreRanksOf,
  strategyOdds,
} from './analysis';
import {
  ANTE_BONUS_PAYS,
  CATEGORIES,
  PAIR_PLUS_TABLES,
  PLAY_THRESHOLD,
  PLAY_THRESHOLD_SCORE,
  STRATEGY_IDS,
  rankOfValue,
  type Category,
  type PairPlusTableId,
  type Rank,
  type Showdown,
} from './engine';
import { rankLabel } from './Cards';
import { EvCurve, type CurveTick } from './charts';
import { getStrings } from './i18n';
import styles from './ThreeCardPoker.module.css';

const PAY_TABLE_IDS: PairPlusTableId[] = ['standard', 'old'];
/** Best hand first, the way pay tables are printed. */
const BEST_FIRST: Category[] = [...CATEGORIES].reverse();
const BONUS_CATEGORIES = BEST_FIRST.filter((c) => ANTE_BONUS_PAYS[c] > 0);

/** High-card hands around the cut-off, weakest first: the best jack-high up to the best ace-high. */
export const THRESHOLD_HANDS: Rank[][] = [
  ['J', 'T', '8'],
  ['Q', '3', '2'],
  ['Q', '5', '4'],
  ['Q', '6', '2'],
  ['Q', '6', '3'],
  ['Q', '6', '4'],
  ['Q', '6', '5'],
  ['Q', '7', '2'],
  ['Q', 'J', '9'],
  ['K', '3', '2'],
  ['A', 'K', 'J'],
];

/** How the Ante and Play bets can end, with the antes each ending wins. */
const OUTCOMES: { id: Showdown; net: number }[] = [
  { id: 'fold', net: EV_FOLD },
  { id: 'notQualified', net: 1 },
  { id: 'win', net: 2 },
  { id: 'tie', net: 0 },
  { id: 'lose', net: -2 },
];

/** The "vs folding" bars fill up at this many antes, so the close calls around the cut-off stay visible. */
const GAIN_BAR_FULL = 0.15;

const handText = (ranks: readonly Rank[]) => ranks.map(rankLabel).join('-');

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;
  const signed = (v: number, digits = 3) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
  const signedPct = (v: number, digits = 2) => `${signed(v * 100, digits)}%`;

  const [payTable, setPayTable] = useState<PairPlusTableId>('standard');
  const counts = handCounts();
  const pairPlus = useMemo(() => pairPlusOdds(PAIR_PLUS_TABLES[payTable]), [payTable]);
  const pairPlusEdges = useMemo(() => PAY_TABLE_IDS.map((id) => ({ id, edge: -pairPlusOdds(PAIR_PLUS_TABLES[id]).ev })), []);

  const optimal = strategyOdds('optimal');
  const outcomeCounts: Record<Showdown, number> = {
    fold: optimal.fold,
    notQualified: optimal.notQualified,
    win: optimal.win,
    tie: optimal.tie,
    lose: optimal.lose,
  };
  const bonusTotal = BONUS_CATEGORIES.reduce((sum, c) => sum + optimal.bonus[c], 0) / TOTAL_COMBINATIONS;
  const qualifyRate = qualifyingHands() / HAND_COUNT;

  const threshold = useMemo(() => THRESHOLD_HANDS.map((ranks) => ({ ranks, odds: ranksOdds(ranks) })), []);
  const worstPlay = ranksOdds(PLAY_THRESHOLD).evMin;
  const bestFold = ranksOdds(['Q', '6', '3']).evMax;

  const curve = useMemo(() => {
    const points = highCardCurve();
    const ticks: CurveTick[] = [];
    points.forEach((p, index) => {
      const top = scoreRanksOf(p.score)[0];
      // The few 5-, 6- and 7-high hands are too cramped to label.
      if (top >= 8 && (index === 0 || scoreRanksOf(points[index - 1].score)[0] !== top)) ticks.push({ index, label: rankLabel(rankOfValue(top)) });
    });
    return { values: points.map((p) => p.evPlay), threshold: points.findIndex((p) => p.score >= PLAY_THRESHOLD_SCORE), ticks };
  }, []);

  const strategies = useMemo(() => STRATEGY_IDS.map((id) => ({ id, odds: strategyOdds(id) })).sort((a, b) => a.odds.houseEdge - b.odds.houseEdge), []);
  const maxEdge = Math.max(...strategies.map((s) => s.odds.houseEdge));
  const mimicExtra = strategyOdds('mimic').played - optimal.played;
  const alwaysExtra = HAND_COUNT - optimal.played;
  const hopeless = HAND_COUNT - qualifyingHands();

  return (
    <div className={styles.oddsLayout}>
      <p className={styles.intro}>{t.oddsIntro(fmt(HAND_COUNT), fmt(DEALER_HANDS), fmt(TOTAL_COMBINATIONS))}</p>

      <section className={styles.panel} aria-labelledby="tcp-hands-title">
        <h3 id="tcp-hands-title" className={styles.blockTitle}>
          {t.handsTitle}
        </h3>
        <div className={styles.modeRow} role="radiogroup" aria-label={t.payTableLabel}>
          <span className={styles.chipRowLabel}>{t.payTableLabel}:</span>
          {PAY_TABLE_IDS.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={payTable === id} className={styles.modeBtn} onClick={() => setPayTable(id)}>
              {t.payTableName[id]}
            </button>
          ))}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="tcp-hand-table">
            <thead>
              <tr>
                <th>{t.colHand}</th>
                <th className={styles.num}>{t.colWays}</th>
                <th className={styles.num}>{t.colProbability}</th>
                <th className={styles.num}>{t.colPays}</th>
                <th className={styles.num}>{t.colReturn}</th>
              </tr>
            </thead>
            <tbody>
              {BEST_FIRST.map((category) => {
                const row = pairPlus.rows.find((r) => r.category === category)!;
                return (
                  <tr key={category} data-category={category}>
                    <td>{t.category[category]}</td>
                    <td className={styles.num} data-testid={`ways-${category}`}>
                      {fmt(counts[category])}
                    </td>
                    <td className={styles.num}>{pct(counts[category] / HAND_COUNT, 4)}</td>
                    <td className={styles.num}>{row.pays > 0 ? `${row.pays}:1` : t.loses}</td>
                    <td className={styles.num}>{signedPct(row.contribution)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t.total}</td>
                <td className={styles.num} data-testid="total-hands">
                  {fmt(HAND_COUNT)}
                </td>
                <td className={styles.num}>100%</td>
                <td />
                <td className={styles.num} data-testid="pairplus-return">
                  {signedPct(pairPlus.ev)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className={styles.statGrid}>
          {pairPlusEdges.map(({ id, edge }) => (
            <div key={id} className={styles.stat} data-current={id === payTable ? 'true' : undefined}>
              <span className={styles.statLabel}>{t.statPairPlusEdge(t.payTableName[id])}</span>
              <span className={styles.statValue} data-testid={`edge-pairplus-${id}`}>
                {pct(edge)}
              </span>
            </div>
          ))}
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statPairPlusWin}</span>
            <span className={styles.statValue}>{pct(pairPlus.win)}</span>
          </div>
        </div>
        <p className={styles.note}>{t.handsNote}</p>
      </section>

      <section className={styles.panel} aria-labelledby="tcp-ante-title">
        <h3 id="tcp-ante-title" className={styles.blockTitle}>
          {t.anteTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0 }}>
          {t.anteIntro(fmt(TOTAL_COMBINATIONS))}
        </p>
        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statEdge}</span>
            <span className={styles.statValue} data-testid="edge-ante">
              {pct(optimal.houseEdge)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statRisk}</span>
            <span className={styles.statValue} data-testid="element-of-risk">
              {pct(optimal.elementOfRisk)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statQualify}</span>
            <span className={styles.statValue} data-testid="dealer-qualifies">
              {pct(qualifyRate)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statPlayRate}</span>
            <span className={styles.statValue} data-testid="play-rate">
              {pct(optimal.playRate)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statWager}</span>
            <span className={styles.statValue} data-testid="average-wager">
              {optimal.averageWager.toFixed(3)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statCombinations}</span>
            <span className={styles.statValue} data-testid="total-combinations">
              {fmt(TOTAL_COMBINATIONS)}
            </span>
          </div>
        </div>
        <div className={styles.tableWrap} style={{ marginTop: '0.8rem' }}>
          <table className={styles.oddsTable} data-testid="tcp-outcome-table">
            <thead>
              <tr>
                <th>{t.colOutcome}</th>
                <th className={styles.num}>{t.colNet}</th>
                <th className={styles.num}>{t.colProbability}</th>
                <th className={styles.num}>{t.colCombinations}</th>
                <th className={styles.num}>{t.colReturn}</th>
              </tr>
            </thead>
            <tbody>
              {OUTCOMES.map(({ id, net }) => (
                <tr key={id} data-outcome={id}>
                  <td>{t.outcomeName[id]}</td>
                  <td className={styles.num}>{signed(net, 0)}</td>
                  <td className={styles.num}>{pct(outcomeCounts[id] / TOTAL_COMBINATIONS, 3)}</td>
                  <td className={styles.num}>{fmt(outcomeCounts[id])}</td>
                  <td className={styles.num}>{signedPct((net * outcomeCounts[id]) / TOTAL_COMBINATIONS, 3)}</td>
                </tr>
              ))}
              <tr data-outcome="bonus">
                <td>{t.anteBonusRow}</td>
                <td className={styles.num}>+1 / +4 / +5</td>
                <td className={styles.num}>{pct(BONUS_CATEGORIES.reduce((sum, c) => sum + counts[c], 0) / HAND_COUNT, 3)}</td>
                <td className={styles.num}>—</td>
                <td className={styles.num}>{signedPct(bonusTotal, 3)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>{t.total}</td>
                <td />
                <td className={styles.num}>100%</td>
                <td className={styles.num}>{fmt(TOTAL_COMBINATIONS)}</td>
                <td className={styles.num} data-testid="ante-return">
                  {signedPct(optimal.ev, 3)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={styles.note}>{t.anteNote(pct(optimal.houseEdge), optimal.averageWager.toFixed(3), pct(optimal.elementOfRisk))}</p>
      </section>

      <section className={styles.panel} aria-labelledby="tcp-threshold-title">
        <h3 id="tcp-threshold-title" className={styles.blockTitle}>
          {t.thresholdTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0, marginBottom: '0.7rem' }}>
          {t.thresholdIntro}
        </p>
        <EvCurve
          values={curve.values}
          threshold={curve.threshold}
          thresholdLabel={handText(PLAY_THRESHOLD)}
          foldLabel={t.curveFold}
          xLabel={t.curveAxis}
          ariaLabel={t.curveAria}
          ticks={curve.ticks}
        />
        <div className={styles.tableWrap} style={{ marginTop: '0.8rem' }}>
          <table className={styles.oddsTable} data-testid="tcp-threshold-table">
            <thead>
              <tr>
                <th>{t.colHand}</th>
                <th className={styles.num}>{t.colEvPlay}</th>
                <th>{t.colVsFold}</th>
                <th className={styles.num}>{t.colDealerOut}</th>
                <th className={styles.num}>{t.colYouWin}</th>
                <th>{t.colBest}</th>
              </tr>
            </thead>
            <tbody>
              {threshold.map(({ ranks, odds }) => {
                const gain = odds.evPlay - EV_FOLD;
                const best = gain > 0 ? 'play' : 'fold';
                const dealerHands = odds.hands * DEALER_HANDS;
                return (
                  <tr key={handText(ranks)} data-hand={ranks.join('')} data-best={best}>
                    <td>{handText(ranks)}</td>
                    <td className={styles.num}>{signed(odds.evPlay, 4)}</td>
                    <td>
                      <span className={styles.edgeCell}>
                        <span
                          className={styles.edgeBar}
                          data-sign={gain > 0 ? 'pos' : 'neg'}
                          style={{ width: `${Math.min(1, Math.abs(gain) / GAIN_BAR_FULL) * 100}%` }}
                        />
                        <b>{signed(gain, 4)}</b>
                      </span>
                    </td>
                    <td className={styles.num}>{pct(odds.notQualified / dealerHands)}</td>
                    <td className={styles.num}>{pct(odds.win / dealerHands)}</td>
                    <td>{t.decisionName[best]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.note} data-testid="tcp-threshold-note">
          {t.thresholdNote(signed(worstPlay, 4), signed(bestFold, 4))}
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="tcp-bonus-title">
        <h3 id="tcp-bonus-title" className={styles.blockTitle}>
          {t.bonusTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0, marginBottom: '0.6rem' }}>
          {t.bonusIntro}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="tcp-bonus-table">
            <thead>
              <tr>
                <th>{t.colHand}</th>
                <th className={styles.num}>{t.colReturn}</th>
                <th className={styles.num}>{t.colPays}</th>
                <th className={styles.num}>{t.colProbability}</th>
              </tr>
            </thead>
            <tbody>
              {BONUS_CATEGORIES.map((category) => (
                <tr key={category} data-category={category}>
                  <td>{t.category[category]}</td>
                  <td className={styles.num}>{signedPct(optimal.bonus[category] / TOTAL_COMBINATIONS, 3)}</td>
                  <td className={styles.num}>{ANTE_BONUS_PAYS[category]}:1</td>
                  <td className={styles.num}>{pct(counts[category] / HAND_COUNT, 4)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t.total}</td>
                <td className={styles.num} data-testid="bonus-return">
                  {signedPct(bonusTotal, 3)}
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={styles.note}>{t.bonusNote(pct(bonusTotal), pct(optimal.houseEdge + bonusTotal))}</p>
      </section>

      <section className={styles.panel} aria-labelledby="tcp-strategy-title">
        <h3 id="tcp-strategy-title" className={styles.blockTitle}>
          {t.strategyTitle}
        </h3>
        <p className={styles.note} style={{ marginTop: 0, marginBottom: '0.6rem' }}>
          {t.strategyIntro}
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="tcp-strategy-table">
            <thead>
              <tr>
                <th>{t.colStrategy}</th>
                <th>{t.colHouseEdge}</th>
                <th className={styles.num}>{t.colRisk}</th>
                <th className={styles.num}>{t.colPlayed}</th>
                <th className={styles.num}>{t.colWager}</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map(({ id, odds }) => (
                <tr key={id} data-strategy={id}>
                  <td>{t.strategyName[id]}</td>
                  <td>
                    <span className={styles.edgeCell}>
                      <span className={styles.edgeBar} style={{ width: `${(odds.houseEdge / maxEdge) * 100}%` }} />
                      <b data-testid={`edge-strategy-${id}`}>{pct(odds.houseEdge)}</b>
                    </span>
                  </td>
                  <td className={styles.num}>{pct(odds.elementOfRisk)}</td>
                  <td className={styles.num}>{pct(odds.playRate)}</td>
                  <td className={styles.num}>{odds.averageWager.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t.strategyNote(fmt(mimicExtra), fmt(alwaysExtra), fmt(hopeless))}</p>
      </section>
    </div>
  );
};
