'use client';

import { useId, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { GrowthCurve } from './charts';
import {
  SCENARIOS,
  SCENARIO_IDS,
  betsToDouble,
  edge,
  everCrosses,
  growthRate,
  kellyFraction,
  outcomeAfter,
  zeroGrowthFraction,
  type Wager,
} from './engine';
import { formatMultiple, percent, signedPercent } from './format';
import { getStrings } from './i18n';
import { HALF, STRATEGY_COLORS, STRATEGY_IDS, strategyFraction } from './sim';
import styles from './KellyCriterion.module.css';

export const PAYOUTS = [0.5, 1, 2, 3, 4, 5, 10] as const;
export const BET_OPTIONS = [100, 300, 1000] as const;
/** The experiment: reach ten times the stake within 300 flips of the 60% coin. */
const EXPERIMENT = { flips: 300, target: 10 } as const;

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const chanceId = useId();
  const payoutId = useId();
  const betsId = useId();

  const [chance, setChance] = useState(Math.round(SCENARIOS.coin60.p * 100));
  const [payout, setPayout] = useState<number>(SCENARIOS.coin60.b);
  const [bets, setBets] = useState<number>(BET_OPTIONS[1]);

  const wager: Wager = { p: chance / 100, b: payout };
  const kelly = kellyFraction(wager);
  const zero = zeroGrowthFraction(wager);
  const peak = growthRate(wager, kelly);
  const doubling = betsToDouble(wager, kelly);
  const multiple = (value: number) => formatMultiple(value, locale);

  const rows = STRATEGY_IDS.map((id) => {
    const fraction = strategyFraction(wager, id);
    return { id, fraction, growth: growthRate(wager, fraction), outcome: outcomeAfter(wager, fraction, bets), everHalf: everCrosses(wager, fraction, bets, HALF) };
  });
  const kellyRow = rows.find((r) => r.id === 'kelly')!;
  const allInRow = rows.find((r) => r.id === 'allIn')!;
  const reach = (fraction: number) => percent(everCrosses(SCENARIOS.coin60, fraction, EXPERIMENT.flips, EXPERIMENT.target), 1);

  return (
    <div className={styles.oddsLayout}>
      <section className={styles.panel} aria-labelledby="kelly-formula-title">
        <h3 id="kelly-formula-title" className={styles.blockTitle}>
          {t.formulaTitle}
        </h3>
        <p className={styles.note}>{t.formulaIntro}</p>

        <div className={styles.formRow}>
          <div className={`${styles.field} ${styles.fieldGrow}`}>
            <label className={styles.fieldLabel} htmlFor={chanceId}>
              {t.winChance}: <strong data-testid="kelly-chance">{chance}%</strong>
            </label>
            <input
              id={chanceId}
              className={styles.slider}
              type="range"
              min={1}
              max={99}
              step={1}
              value={chance}
              onChange={(e) => setChance(Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={payoutId}>
              {t.payout}
            </label>
            <select id={payoutId} className={styles.input} value={payout} onChange={(e) => setPayout(Number(e.target.value))}>
              {PAYOUTS.map((b) => (
                <option key={b} value={b}>
                  {t.payoutOption(b)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.quickRow} role="group" aria-label={t.presets}>
          {SCENARIO_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={styles.chipBtn}
              aria-pressed={chance === Math.round(SCENARIOS[id].p * 100) && payout === SCENARIOS[id].b}
              onClick={() => {
                setChance(Math.round(SCENARIOS[id].p * 100));
                setPayout(SCENARIOS[id].b);
              }}
              data-preset={id}
            >
              {t.scenarioName[id]}
            </button>
          ))}
        </div>

        <p className={styles.formula} data-testid="kelly-formula">
          {t.formulaLine((chance / 100).toFixed(2), (1 - chance / 100).toFixed(2), String(payout), percent(Math.max(0, wager.p - (1 - wager.p) / wager.b)))}
        </p>

        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statEdge}</span>
            <span className={styles.statValue} data-testid="kelly-edge">
              {signedPercent(edge(wager), 1)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statKellyStake}</span>
            <span className={styles.statValue} data-testid="kelly-fraction">
              {percent(kelly)}
            </span>
            <span className={styles.statNote}>{t.ofBankroll}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statGrowth}</span>
            <span className={styles.statValue} data-testid="kelly-growth">
              {signedPercent(peak)}
            </span>
            <span className={styles.statNote}>{t.perBet}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statDouble}</span>
            <span className={styles.statValue} data-testid="kelly-double">
              {doubling === null ? t.never : doubling.toFixed(1)}
            </span>
            {doubling !== null && <span className={styles.statNote}>{t.bets}</span>}
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.statZero}</span>
            <span className={styles.statValue} data-testid="kelly-zero">
              {zero === null ? '–' : percent(zero, 1)}
            </span>
            {zero !== null && <span className={styles.statNote}>{t.timesKelly((zero / kelly).toFixed(2))}</span>}
          </div>
        </div>
        {kelly === 0 && (
          <p className={styles.warning} data-testid="kelly-no-edge">
            {t.noEdge}
          </p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="kelly-curve-title">
        <h3 id="kelly-curve-title" className={styles.blockTitle}>
          {t.curveTitle}
        </h3>
        <p className={styles.note}>{t.curveIntro}</p>
        <div className={styles.chartBlock}>
          <GrowthCurve wager={wager} kelly={kelly} zero={zero} ariaLabel={t.curveAria} xLabel={t.curveX} kellyLabel={t.curveKelly} zeroLabel={t.curveZero} />
        </div>
        {/* The curve as numbers, for screen readers. */}
        <div className={styles.srOnly}>
          <table>
            <caption>{t.curveAria}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colStake}</th>
                <th scope="col">{t.colGrowth}</th>
              </tr>
            </thead>
            <tbody>
              {[0, 0.5, 1, 1.5, 2, 3].map((times) => {
                const fraction = Math.min(1, kelly * times);
                return (
                  <tr key={times}>
                    <th scope="row">
                      {percent(fraction)} ({t.timesKelly(String(times))})
                    </th>
                    <td>{signedPercent(growthRate(wager, fraction))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {kelly > 0 && (
        <section className={styles.panel} aria-labelledby="kelly-after-title">
          <h3 id="kelly-after-title" className={styles.blockTitle}>
            {t.afterTitle}
          </h3>
          <p className={styles.note}>{t.afterIntro(bets.toLocaleString(locale))}</p>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={betsId}>
                {t.betsLabel}
              </label>
              <select id={betsId} className={styles.input} value={bets} onChange={(e) => setBets(Number(e.target.value))}>
                {BET_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString(locale)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.oddsTable} data-testid="kelly-after-table">
              <thead>
                <tr>
                  <th scope="col">{t.colStrategy}</th>
                  <th scope="col" className={styles.num}>
                    {t.colStake}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colGrowth}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colTypical}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colRange}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colAverage}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colBelowStart}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colEverHalf}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-strategy={r.id} data-best={r.id === 'kelly' ? 'true' : undefined}>
                    <th scope="row">
                      <span className={styles.swatch} style={{ background: STRATEGY_COLORS[r.id] }} /> {t.strategyName[r.id]}
                    </th>
                    <td className={styles.num}>{percent(r.fraction)}</td>
                    <td className={styles.num} data-sign={r.growth > 0 ? 'pos' : r.growth < 0 ? 'neg' : undefined}>
                      {signedPercent(r.growth)}
                    </td>
                    <td className={styles.num} data-col="typical">
                      {multiple(r.outcome.median)}
                    </td>
                    <td className={styles.num}>{t.rangeValue(multiple(r.outcome.low), multiple(r.outcome.high))}</td>
                    <td className={styles.num}>{multiple(r.outcome.mean)}</td>
                    <td className={styles.num} data-col="below">
                      {percent(r.outcome.belowStart, 1)}
                    </td>
                    <td className={styles.num} data-col="half">
                      {percent(r.everHalf, 1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>{t.afterNote(multiple(kellyRow.outcome.mean), multiple(kellyRow.outcome.median), multiple(allInRow.outcome.mean))}</p>
        </section>
      )}

      <section className={styles.panel} aria-labelledby="kelly-experiment-title">
        <h3 id="kelly-experiment-title" className={styles.blockTitle}>
          {t.experimentTitle}
        </h3>
        <p className={styles.note}>{t.experimentIntro}</p>
        <ul className={styles.facts}>
          {t.experimentFacts.map((fact, i) => (
            <li key={i}>{fact}</li>
          ))}
        </ul>
        <p className={styles.note} data-testid="kelly-experiment-exact">
          {t.experimentExact(reach(0.1), reach(0.15), reach(0.2))}
        </p>
        <p className={styles.source}>
          <a href="https://arxiv.org/abs/1701.01427" target="_blank" rel="noopener noreferrer">
            {t.experimentSource}
          </a>
        </p>
      </section>
    </div>
  );
};
