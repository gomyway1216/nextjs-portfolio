'use client';

import { useState, type CSSProperties } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { DRAWS, SPOTS, analyzeWheel, checkSpins, seeded, valueOf, type CheckResult, type Fraction } from './engine';
import { getStrings } from './i18n';
import { lookOf } from './Wheel';
import styles from './BigWheel.module.css';
import { ScrollArea } from '../common/ScrollArea';

const ODDS = analyzeWheel();
/** How many spins the check runs. */
export const CHECK_SPINS = 100_000;

/** The wheel's exact odds, worked out from its segments and its lamps (engine.ts), and a check to set beside them. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const frac = (f: Fraction) => (f.den === 1 ? fmt(f.num) : `${fmt(f.num)}/${fmt(f.den)}`);
  /** A chance as its fraction, with its percentage under it, so that a column stays narrow on a phone. */
  const chance = (f: Fraction, digits = 2) => (
    <>
      <span className={styles.fraction}>{frac(f)}</span>
      <span className={styles.percent}>{pct(valueOf(f), digits)}</span>
    </>
  );
  const inEvery = (f: Fraction) => fmt(f.den / f.num, 1);
  const forty = ODDS.spots.find((spot) => spot.spot === 40)!;

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Spinning…" be drawn before the spins are made.
    window.setTimeout(() => {
      setResult(checkSpins(CHECK_SPINS, seeded(20_261_018 + seed)));
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
          <span className={styles.statLabel}>{t.returnLabel}</span>
          <span className={styles.statValue} data-testid="bw-rtp">
            {pct(valueOf(ODDS.rtp), 0)}
          </span>
          <span className={styles.statNote}>{t.returnNote(ODDS.rtp.num, ODDS.rtp.den)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.keepsLabel}</span>
          <span className={styles.statValue}>{pct(valueOf(ODDS.edge), 0)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.bonusLabel}</span>
          <span className={styles.statValue} data-testid="bw-bonus-chance">
            {frac(ODDS.bonus)}
          </span>
          <span className={styles.statNote}>{t.bonusNote(inEvery(ODDS.bonus))}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.lampLabel}</span>
          <span className={styles.statValue}>×{fmt(valueOf(ODDS.lampMean), 4)}</span>
          <span className={styles.statNote}>{frac(ODDS.lampMean)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.topLabel}</span>
          <span className={styles.statValue} data-testid="bw-top-chance">
            {frac(ODDS.top)}
          </span>
          <span className={styles.statNote}>{t.topNote(fmt(ODDS.top.den / ODDS.top.num))}</span>
        </div>
      </div>

      <section aria-labelledby="bw-draws-title">
        <h2 id="bw-draws-title" className={styles.blockTitle}>
          {t.drawsTitle}
        </h2>
        <ol className={styles.drawList}>
          {t.draws.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="bw-numbers-title">
        <h2 id="bw-numbers-title" className={styles.blockTitle}>
          {t.numbersTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="bw-numbers-table">
            <thead>
              <tr>
                <th>{t.colNumber}</th>
                <th className={styles.num}>{t.colFirst}</th>
                <th className={styles.num}>{t.colSecond}</th>
                <th className={styles.num}>{t.colHit}</th>
                <th className={styles.num}>{t.colReturn}</th>
                <th className={styles.num}>{t.colSpread}</th>
              </tr>
            </thead>
            <tbody>
              {ODDS.spots.map((spot) => {
                const look = lookOf(spot.spot);
                return (
                  <tr key={spot.spot} data-spot={spot.spot}>
                    <td>
                      <span className={styles.swatch} style={{ '--fill': look.fill, '--ink': look.ink } as CSSProperties}>
                        ×{spot.spot}
                      </span>
                      <span className={`${styles.percent} ${styles.nowrap}`}>{t.segmentsOf(spot.segments)}</span>
                    </td>
                    <td className={styles.num}>{chance(spot.first)}</td>
                    <td className={styles.num}>{chance(spot.second)}</td>
                    <td className={styles.num}>{chance(spot.hit)}</td>
                    <td className={styles.num} data-testid={`bw-return-${spot.spot}`}>
                      {frac(spot.rtp)}
                    </td>
                    <td className={styles.num}>{fmt(spot.sd, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.spreadNote}</p>
      </section>

      <section aria-labelledby="bw-lamps-title">
        <h2 id="bw-lamps-title" className={styles.blockTitle}>
          {t.lampsTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="bw-lamps-table">
            <thead>
              <tr>
                <th>{t.colLamp}</th>
                <th className={styles.num}>{t.colLamps}</th>
                <th className={styles.num}>{t.colChance}</th>
              </tr>
            </thead>
            <tbody>
              {ODDS.lamps.map((lamp) => (
                <tr key={lamp.multiplier} data-lamp={lamp.multiplier}>
                  <td>×{lamp.multiplier}</td>
                  <td className={styles.num}>{lamp.lamps}</td>
                  <td className={styles.num}>{chance(lamp.chance, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.lampsNote(`${frac(ODDS.lampMean)} = ${fmt(valueOf(ODDS.lampMean), 4)}`)}</p>
      </section>

      <section aria-labelledby="bw-pays-title">
        <h2 id="bw-pays-title" className={styles.blockTitle}>
          {t.paysTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="bw-pays-table">
            <thead>
              <tr>
                <th className={styles.num}>{t.colBack}</th>
                <th className={styles.num}>{t.colPaysChance}</th>
              </tr>
            </thead>
            <tbody>
              {forty.pays.map((pay) => (
                <tr key={pay.multiple} data-pays={pay.multiple}>
                  <td className={styles.num}>{fmt(pay.multiple)}</td>
                  <td className={styles.num}>{chance(pay.chance, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section aria-labelledby="bw-compare-title">
        <h2 id="bw-compare-title" className={styles.blockTitle}>
          {t.compareTitle}
        </h2>
        {t.compare.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
      </section>

      <section className={styles.check} aria-labelledby="bw-check-title">
        <h2 id="bw-check-title" className={styles.blockTitle}>
          {t.checkTitle}
        </h2>
        <button type="button" className={styles.checkButton} data-testid="bw-check" onClick={runCheck} disabled={running}>
          {running ? t.checkRunning : t.checkButton}
        </button>
        {result && (
          <div data-testid="bw-check-result">
            <p className={styles.checkResult}>{t.checkResult(fmt(result.spins))}</p>
            <ul className={styles.checkList}>
              {SPOTS.map((spot) => (
                <li key={spot}>
                  ×{spot}: {pct(result.back[spot])}
                </li>
              ))}
              <li>{t.checkBonus(fmt(result.bonuses), fmt(result.spins * valueOf(ODDS.bonus), 1))}</li>
              <li>{t.checkTop(fmt(result.tops), fmt(result.spins * valueOf(ODDS.top), 1))}</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};

/** The number of equally likely draws the odds are added up over, for the tests. */
export const ODDS_DRAWS = DRAWS;

export default OddsTab;
