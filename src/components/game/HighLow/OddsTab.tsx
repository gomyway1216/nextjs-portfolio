'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import { LADDER, RANKS, RANK_NAMES, TOP, UNIT, analyzeLadder, checkGames, likelier, ranksFor, seeded, valueOf, type CheckResult, type Fraction } from './engine';
import { getStrings } from './i18n';
import styles from './HighLow.module.css';

/** How many games the check plays. */
export const CHECK_GAMES = 100_000;

/** The ladder's exact odds (engine.ts): best play card by card and rung by rung, the simple ways of playing beside it, and a check by play. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const odds = analyzeLadder();
  const best = valueOf(odds.best);
  const inEvery = (f: Fraction) => fmt(1 / valueOf(f));
  /** A small chance to four significant figures, so that the rare endings still say something. */
  const small = (f: Fraction) => {
    const v = valueOf(f) * 100;
    return `${v.toLocaleString(locale, { maximumSignificantDigits: 4, minimumSignificantDigits: 2 })}%`;
  };

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the games are played.
    window.setTimeout(() => {
      setResult(checkGames(CHECK_GAMES, seeded(20_261_018 + seed)));
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  const ways: { key: string; label: string; value: Fraction }[] = [
    { key: 'best', label: t.wayBest, value: odds.best },
    { key: 'thumb', label: t.wayThumb, value: odds.thumb },
    ...odds.takeAfter.map((value, i) => ({ key: `take-${i + 1}`, label: t.wayTakeAfter(i + 1), value })),
  ];
  const sign = (move: string) => (move === 'take' ? t.chartTake : move === 'high' ? '▲' : '▼');

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.bestLabel}</span>
          <span className={styles.statValue} data-testid="hl-rtp">
            {pct(best)}
          </span>
          <span className={styles.statNote}>{t.bestNote}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.keepsLabel}</span>
          <span className={styles.statValue}>{pct(1 - best)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.thumbLabel}</span>
          <span className={styles.statValue} data-testid="hl-thumb">
            {pct(valueOf(odds.thumb))}
          </span>
          <span className={styles.statNote}>{t.thumbNote}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.topLabel}</span>
          <span className={styles.statValue}>{small(odds.bestEndings.take[TOP - 1])}</span>
          <span className={styles.statNote}>{t.topNote(inEvery(odds.bestEndings.take[TOP - 1]))}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.climbLabel}</span>
          <span className={styles.statValue} data-testid="hl-climb-top">
            {pct(valueOf(odds.climbTop))}
          </span>
          <span className={styles.statNote}>{t.climbNote(inEvery(odds.climbTop), pct(valueOf(odds.takeAfter[TOP - 1])))}</span>
        </div>
      </div>

      <section aria-labelledby="hl-rules-title">
        <h2 id="hl-rules-title" className={styles.blockTitle}>
          {t.rulesTitle}
        </h2>
        <ol className={styles.drawList}>
          {t.rules.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="hl-cards-title">
        <h2 id="hl-cards-title" className={styles.blockTitle}>
          {t.cardsTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="hl-cards-table">
            <thead>
              <tr>
                <th>{t.colCard}</th>
                <th className={styles.num}>{t.colHigh}</th>
                <th className={styles.num}>{t.colLow}</th>
                <th className={styles.num}>{t.colTie}</th>
                <th>{t.colBetter}</th>
              </tr>
            </thead>
            <tbody>
              {RANK_NAMES.map((name, rank) => {
                const { high, low, tie } = ranksFor(rank);
                const side = likelier(rank);
                const even = high === low;
                return (
                  <tr key={name} data-rank={name}>
                    <td className={styles.rankCell}>{name}</td>
                    <td className={styles.num} data-better={!even && side === 'high' ? 'true' : 'false'}>
                      <span className={styles.fraction}>{high}/13</span>
                      <span className={styles.percent}>{pct(high / RANKS, 1)}</span>
                    </td>
                    <td className={styles.num} data-better={!even && side === 'low' ? 'true' : 'false'}>
                      <span className={styles.fraction}>{low}/13</span>
                      <span className={styles.percent}>{pct(low / RANKS, 1)}</span>
                    </td>
                    <td className={styles.num}>
                      <span className={styles.fraction}>{tie}/13</span>
                      <span className={styles.percent}>{pct(tie / RANKS, 1)}</span>
                    </td>
                    <td>{even ? `${t.high} = ${t.low}` : side === 'high' ? `▲ ${t.high}` : `▼ ${t.low}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.cardsNote}</p>
      </section>

      <section aria-labelledby="hl-ladder-title">
        <h2 id="hl-ladder-title" className={styles.blockTitle}>
          {t.ladderTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="hl-ladder-table">
            <thead>
              <tr>
                <th>{t.colRung}</th>
                <th className={styles.num}>{t.colPays}</th>
                <th className={styles.num}>{t.colTimes}</th>
              </tr>
            </thead>
            <tbody>
              {LADDER.map((medals, i) => (
                <tr key={i} data-rung={i + 1}>
                  <td>{i + 1 === TOP ? `${i + 1} (${t.topLamp})` : i + 1}</td>
                  <td className={styles.num}>{fmt(medals)}</td>
                  <td className={styles.num}>×{fmt(medals / UNIT, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.ladderNote}</p>
      </section>

      <section aria-labelledby="hl-chart-title">
        <h2 id="hl-chart-title" className={styles.blockTitle}>
          {t.chartTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={`${styles.oddsTable} ${styles.chart}`} data-testid="hl-chart">
            <thead>
              <tr>
                <th>{t.colRung}</th>
                {RANK_NAMES.map((name) => (
                  <th key={name} className={styles.chartHead}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {odds.moves.map((row, rung) => (
                <tr key={rung} data-rung={rung}>
                  <th scope="row" className={styles.chartRow}>
                    {t.chartRung(rung)}
                  </th>
                  {row.map((move, rank) => (
                    <td key={rank} className={styles.chartCell} data-move={move}>
                      {sign(move)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.chartNote}</p>
      </section>

      <section aria-labelledby="hl-ways-title">
        <h2 id="hl-ways-title" className={styles.blockTitle}>
          {t.strategiesTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="hl-ways">
            <thead>
              <tr>
                <th>{t.colWay}</th>
                <th className={styles.num}>{t.colReturn}</th>
              </tr>
            </thead>
            <tbody>
              {ways.map((way) => (
                <tr key={way.key} data-way={way.key}>
                  <td>{way.label}</td>
                  <td className={styles.num} data-testid={`hl-way-${way.key}`}>
                    {pct(valueOf(way.value), 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.waysNote}</p>
      </section>

      <section aria-labelledby="hl-endings-title">
        <h2 id="hl-endings-title" className={styles.blockTitle}>
          {t.endingsTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="hl-endings">
            <thead>
              <tr>
                <th>{t.colEnding}</th>
                <th className={styles.num}>{t.colChance}</th>
              </tr>
            </thead>
            <tbody>
              <tr data-ending="lost">
                <td>{t.endLost}</td>
                <td className={styles.num}>{small(odds.bestEndings.lose)}</td>
              </tr>
              {odds.bestEndings.take.map((chance, i) => (
                <tr key={i} data-ending={i + 1}>
                  <td>{t.endTaken(i + 1)}</td>
                  <td className={styles.num}>{small(chance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section aria-labelledby="hl-compare-title">
        <h2 id="hl-compare-title" className={styles.blockTitle}>
          {t.compareTitle}
        </h2>
        {t.compare.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
      </section>

      <section className={styles.check} aria-labelledby="hl-check-title">
        <h2 id="hl-check-title" className={styles.blockTitle}>
          {t.checkTitle}
        </h2>
        <button type="button" className={styles.checkButton} data-testid="hl-check" onClick={runCheck} disabled={running}>
          {running ? t.checkRunning : t.checkButton}
        </button>
        {result && (
          <div data-testid="hl-check-result">
            <p className={styles.checkResult}>{t.checkResult(fmt(result.games))}</p>
            <ul className={styles.checkList}>
              <li>{t.checkBack(pct(result.back), pct(best, 3))}</li>
              <li>{t.checkTops(fmt(result.tops), fmt(result.games * valueOf(odds.bestEndings.take[TOP - 1]), 1))}</li>
              <li>{t.checkLost(fmt(result.lost), fmt(result.games * valueOf(odds.bestEndings.lose), 0))}</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};

export default OddsTab;
