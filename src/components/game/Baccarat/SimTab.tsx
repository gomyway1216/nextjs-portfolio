'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { CountBars, EdgeChart, ShoeChart } from './charts';
import { getStrings } from './i18n';
import {
  BET_COLORS,
  PATTERN_IDS,
  SIM_BETS,
  simulateCounting,
  simulateLines,
  simulatePatterns,
  theoreticalEdge,
  type CountingResult,
  type LinesResult,
  type PatternsResult,
} from './sim';
import styles from './Baccarat.module.css';

export const HAND_OPTIONS = [10_000, 100_000, 1_000_000] as const;
export const PATTERN_HAND_OPTIONS = [10_000, 100_000, 1_000_000] as const;
export const SHOE_OPTIONS = [10, 25, 50, 100] as const;

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`;
  const signed = (v: number, digits = 2) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;

  // One controller per section so a run elsewhere never cancels this one; all abort on unmount.
  const controllers = useRef<Record<string, AbortController>>({});
  useEffect(() => () => Object.values(controllers.current).forEach((c) => c.abort()), []);
  const begin = (key: string) => {
    controllers.current[key]?.abort();
    controllers.current[key] = new AbortController();
    return controllers.current[key].signal;
  };

  // --- Every line on the same cards
  const [hands, setHands] = useState<number>(HAND_OPTIONS[1]);
  const [lines, setLines] = useState<LinesResult | null>(null);
  const [linesHands, setLinesHands] = useState(0);
  const [linesProgress, setLinesProgress] = useState<number | null>(null);
  const runLines = async () => {
    const signal = begin('lines');
    setLinesProgress(0);
    const res = await simulateLines(hands, { signal, onProgress: (d, total) => setLinesProgress(Math.round((d / total) * 100)) });
    if (signal.aborted || !res) return;
    setLines(res);
    setLinesHands(hands);
    setLinesProgress(null);
  };

  // --- Road systems
  const [patternHands, setPatternHands] = useState<number>(PATTERN_HAND_OPTIONS[1]);
  const [patterns, setPatterns] = useState<PatternsResult | null>(null);
  const [patternsProgress, setPatternsProgress] = useState<number | null>(null);
  const runPatterns = async () => {
    const signal = begin('patterns');
    setPatternsProgress(0);
    const res = await simulatePatterns(patternHands, {
      signal,
      onProgress: (d, total) => setPatternsProgress(Math.round((d / total) * 100)),
    });
    if (signal.aborted || !res) return;
    setPatterns(res);
    setPatternsProgress(null);
  };

  // --- Counting
  const [shoes, setShoes] = useState<number>(SHOE_OPTIONS[0]);
  const [counting, setCounting] = useState<CountingResult | null>(null);
  const [countingProgress, setCountingProgress] = useState<number | null>(null);
  const runCounting = async () => {
    const signal = begin('counting');
    setCountingProgress(0);
    const res = await simulateCounting(shoes, { signal, onProgress: (d, total) => setCountingProgress(Math.round((d / total) * 100)) });
    if (signal.aborted || !res) return;
    setCounting(res);
    setCountingProgress(null);
  };

  const streaks = patterns?.longestStreaks ?? [];
  const meanStreak = streaks.length > 0 ? streaks.reduce((a, b) => a + b, 0) / streaks.length : 0;
  const eightPlus = streaks.length > 0 ? streaks.filter((s) => s >= 8).length / streaks.length : 0;

  const select = (value: number, options: readonly number[], onChange: (n: number) => void, busy: boolean, label: string) => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <select className={styles.input} value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={busy}>
        {options.map((n) => (
          <option key={n} value={n}>
            {fmt(n)}
          </option>
        ))}
      </select>
    </label>
  );
  const runButton = (progress: number | null, onClick: () => void) => (
    <button type="button" className={`${styles.btn} ${styles.btnRun}`} onClick={onClick} disabled={progress !== null}>
      {progress !== null ? t.running(progress) : t.run}
    </button>
  );

  return (
    <div className={styles.oddsLayout}>
      <section className={styles.panel} aria-labelledby="baccarat-sim-lines-title">
        <h3 id="baccarat-sim-lines-title" className={styles.blockTitle}>
          {t.linesTitle}
        </h3>
        <p className={styles.note}>{t.linesIntro}</p>
        <div className={styles.formRow}>
          {select(hands, HAND_OPTIONS, setHands, linesProgress !== null, t.handsLabel)}
          {runButton(linesProgress, runLines)}
        </div>
        {lines && (
          <>
            <EdgeChart
              xLabel={t.handsLabel}
              series={SIM_BETS.map((id) => ({
                id,
                color: BET_COLORS[id],
                label: t.oddsBetName[id],
                theory: theoreticalEdge(id),
                points: lines[id].points,
              }))}
            />
            <div className={styles.tableWrap}>
              <table className={`${styles.oddsTable} ${styles.simTable}`} data-testid="baccarat-sim-lines">
                <thead>
                  <tr>
                    <th>{t.colBet}</th>
                    <th className={styles.num}>{t.colExact}</th>
                    <th className={styles.num}>{t.colSimulated(fmt(linesHands))}</th>
                  </tr>
                </thead>
                <tbody>
                  {SIM_BETS.map((id) => (
                    <tr key={id} data-line={id}>
                      <td>
                        <span className={styles.swatch} style={{ background: BET_COLORS[id] }} /> {t.oddsBetName[id]}
                      </td>
                      <td className={styles.num}>{pct(theoreticalEdge(id), 3)}</td>
                      <td className={styles.num}>
                        {pct(lines[id].edge, 3)} <small className={styles.muted}>± {pct(1.96 * lines[id].se, 2)}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{t.linesNote}</p>
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="baccarat-sim-patterns-title">
        <h3 id="baccarat-sim-patterns-title" className={styles.blockTitle}>
          {t.patternsTitle}
        </h3>
        <p className={styles.note}>{t.patternsIntro}</p>
        <div className={styles.formRow}>
          {select(patternHands, PATTERN_HAND_OPTIONS, setPatternHands, patternsProgress !== null, t.handsLabel)}
          {runButton(patternsProgress, runPatterns)}
        </div>
        {patterns && (
          <>
            <div className={styles.tableWrap}>
              <table className={`${styles.oddsTable} ${styles.simTable}`} data-testid="baccarat-sim-patterns">
                <thead>
                  <tr>
                    <th>{t.colStrategy}</th>
                    <th className={styles.num}>{t.colBets}</th>
                    <th className={styles.num}>{t.colOnBanker}</th>
                    <th className={styles.num}>{t.colExpected}</th>
                    <th className={styles.num}>{t.colSimulated(fmt(patterns.hands))}</th>
                  </tr>
                </thead>
                <tbody>
                  {PATTERN_IDS.map((id) => {
                    const s = patterns.strategies[id];
                    return (
                      <tr key={id} data-pattern={id}>
                        <td>{t.patternName[id]}</td>
                        <td className={styles.num}>{fmt(s.bets)}</td>
                        <td className={styles.num}>{s.bets > 0 ? pct(s.bankerBets / s.bets, 1) : '—'}</td>
                        <td className={styles.num}>{pct(s.expectedEdge, 3)}</td>
                        <td className={styles.num}>
                          {s.bets > 0 ? pct(s.edge, 3) : '—'} {s.bets > 0 && <small className={styles.muted}>± {pct(1.96 * s.se, 2)}</small>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{t.patternsNote}</p>
            {streaks.length > 0 && (
              <>
                <h4 className={styles.subTitle}>{t.streakTitle}</h4>
                <CountBars values={streaks} xLabel={t.streakAxis} />
                <p className={styles.note} data-testid="baccarat-sim-streaks">
                  {t.streakNote(fmt(streaks.length), meanStreak.toFixed(2), pct(eightPlus, 1))}
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="baccarat-sim-counting-title">
        <h3 id="baccarat-sim-counting-title" className={styles.blockTitle}>
          {t.countingTitle}
        </h3>
        <p className={styles.note}>{t.countingIntro}</p>
        <div className={styles.formRow}>
          {select(shoes, SHOE_OPTIONS, setShoes, countingProgress !== null, t.shoesLabel)}
          {runButton(countingProgress, runCounting)}
        </div>
        {counting && (
          <>
            <div className={styles.tableWrap}>
              <table className={`${styles.oddsTable} ${styles.simTable}`} data-testid="baccarat-sim-counting">
                <thead>
                  <tr>
                    <th>{t.colBet}</th>
                    <th className={styles.num}>{t.colFavorable}</th>
                    <th className={styles.num}>{t.colAvgEdge}</th>
                    <th className={styles.num}>{t.colGainPerShoe}</th>
                    <th className={styles.num}>{t.colRealized}</th>
                  </tr>
                </thead>
                <tbody>
                  {SIM_BETS.map((id) => {
                    const l = counting.lines[id];
                    return (
                      <tr key={id} data-line={id} data-positive={l.positive > 0 ? 'true' : undefined}>
                        <td>
                          <span className={styles.swatch} style={{ background: BET_COLORS[id] }} /> {t.oddsBetName[id]}
                        </td>
                        <td className={styles.num}>{pct(l.positive / counting.hands, 2)}</td>
                        <td className={styles.num}>{l.positive > 0 ? `+${pct(l.gain / l.positive, 2)}` : '—'}</td>
                        <td className={styles.num}>{signed(l.gain / counting.shoes, 3)}</td>
                        <td className={styles.num}>{signed(l.realized / counting.shoes, 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{t.countingNote(fmt(counting.shoes), fmt(counting.hands))}</p>
            <h4 className={styles.subTitle}>{t.sampleShoeTitle}</h4>
            <ShoeChart
              xLabel={t.sampleShoeAxis}
              series={SIM_BETS.filter((id) => id !== 'bankerEz').map((id) => ({
                id,
                color: BET_COLORS[id],
                label: t.oddsBetName[id],
                values: counting.sampleShoe[id],
              }))}
            />
            <div className={styles.legend}>
              {SIM_BETS.filter((id) => id !== 'bankerEz').map((id) => (
                <span key={id} className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: BET_COLORS[id] }} /> {t.oddsBetName[id]}
                </span>
              ))}
            </div>
            <p className={styles.note}>{t.sampleShoeNote}</p>
          </>
        )}
      </section>
    </div>
  );
};
