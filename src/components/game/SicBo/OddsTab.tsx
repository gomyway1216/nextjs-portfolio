'use client';

import { useState } from 'react';
import { ScrollArea } from '../common/ScrollArea';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { CHECK_AREAS, PAYTABLE, ROLLS, analyze, betInfo, checkRolls, fraction, seeded, valueOf, type AreaOdds, type BetId, type CheckResult, type Fraction } from './engine';
import { getStrings, type SicBoStrings } from './i18n';
import { paysLabel } from './Layout';
import styles from './SicBo.module.css';

const ODDS = analyze();
/** How many rolls the check makes. */
export const CHECK_ROLLS = 100_000;

const area = (id: BetId): AreaOdds => ODDS.areas.find((odds) => odds.id === id)!;

/** The rows of the table: one for each kind of area, the totals two by two (4 and 17 pay alike). */
export const ROWS: readonly { key: string; id: BetId; name: (t: SicBoStrings) => string }[] = [
  { key: 'small-big', id: 'small', name: (t) => t.groups.smallBig },
  ...([4, 5, 6, 7, 8, 9, 10] as const).map((total) => ({ key: `total-${total}`, id: `total-${total}` as BetId, name: (t: SicBoStrings) => t.groups.total(total, 21 - total) })),
  { key: 'triple', id: 'triple-1', name: (t) => t.groups.triple },
  { key: 'any-triple', id: 'any-triple', name: (t) => t.groups.anyTriple },
  { key: 'double', id: 'double-1', name: (t) => t.groups.double },
  { key: 'pair', id: 'pair-1-2', name: (t) => t.groups.pair },
  { key: 'single', id: 'single-1', name: (t) => t.groups.single },
];

/** Sic Bo's exact odds, worked out over the 216 rolls (engine.ts), and a check to set beside them. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const frac = (f: Fraction) => (f.den === 1 ? fmt(f.num) : `${fmt(f.num)}/${fmt(f.den)}`);
  const single = area('single-1');
  const least = ODDS.least;
  const triple = fraction(6, ROLLS);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Rolling…" be drawn before the rolls are made.
    window.setTimeout(() => {
      setResult(checkRolls(CHECK_ROLLS, seeded(20_261_018 + seed)));
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

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
          <span className={styles.statValue} data-testid="sb-best">
            {pct(valueOf(ODDS.best))}
          </span>
          <span className={styles.statNote}>{t.bestNote(ODDS.best.num, ODDS.best.den)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.leastLabel}</span>
          <span className={styles.statValue}>{pct(valueOf(least))}</span>
          <span className={styles.statNote}>{frac(least)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.tripleLabel}</span>
          <span className={styles.statValue}>{frac(triple)}</span>
          <span className={styles.statNote}>{t.tripleNote}</span>
        </div>
      </div>

      <section aria-labelledby="sb-draws-title">
        <h2 id="sb-draws-title" className={styles.blockTitle}>
          {t.drawsTitle}
        </h2>
        <ol className={styles.drawList}>
          {t.draws.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="sb-areas-title">
        <h2 id="sb-areas-title" className={styles.blockTitle}>
          {t.areasTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="sb-odds-table">
            <thead>
              <tr>
                <th>{t.colArea}</th>
                <th className={styles.num}>{t.colPays}</th>
                <th className={styles.num}>{t.colWins}</th>
                <th className={styles.num}>{t.colReturn}</th>
                <th className={styles.num}>{t.colKeeps}</th>
                <th className={styles.num}>{t.colSpread}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const odds = area(row.id);
                const info = betInfo(row.id);
                return (
                  <tr key={row.key} data-row={row.key}>
                    <td>{row.name(t)}</td>
                    <td className={styles.num}>{info.kind === 'single' ? '1:1–3:1' : paysLabel(info)}</td>
                    <td className={styles.num}>{odds.wins}</td>
                    <td className={styles.num} data-testid={`sb-return-${row.key}`}>
                      <span className={styles.fraction}>{frac(odds.back)}</span>
                      <span className={styles.percent}>{pct(valueOf(odds.back))}</span>
                    </td>
                    <td className={styles.num}>{pct(valueOf(odds.edge))}</td>
                    <td className={styles.num}>{fmt(odds.sd, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.singleNote(single.matches![0], single.matches![1], single.matches![2])}</p>
        <p className={styles.note}>{t.spreadNote}</p>
      </section>

      <section aria-labelledby="sb-source-title">
        <h2 id="sb-source-title" className={styles.blockTitle}>
          {t.sourceTitle}
        </h2>
        {t.source.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
        <p className={styles.note}>
          <a className={styles.sourceLink} href={PAYTABLE.source} target="_blank" rel="noopener noreferrer" data-testid="sb-source">
            {t.sourceLink}
          </a>
        </p>
      </section>

      <section className={styles.check} aria-labelledby="sb-check-title">
        <h2 id="sb-check-title" className={styles.blockTitle}>
          {t.checkTitle}
        </h2>
        <button type="button" className={styles.checkButton} data-testid="sb-check" onClick={runCheck} disabled={running}>
          {running ? t.checkRunning : t.checkButton}
        </button>
        {result && (
          <div data-testid="sb-check-result">
            <p className={styles.checkResult}>{t.checkResult(fmt(result.rolls))}</p>
            <ul className={styles.checkList}>
              {CHECK_AREAS.map((id) => (
                <li key={id}>
                  {t.areaName(betInfo(id))}: {pct(result.back[id] ?? 0)} ({pct(valueOf(area(id).back))})
                </li>
              ))}
              <li>{t.checkTriples(fmt(result.triples), fmt((result.rolls * 6) / ROLLS, 1))}</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};

export default OddsTab;
