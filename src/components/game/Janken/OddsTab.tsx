'use client';

import { useId, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { LAMPS, MAX_DOUBLES, analyzeMachine, seeded, simulateSessions, spreadOf, valueOf, type Fraction, type SessionSummary } from './engine';
import { CatFace } from './art';
import { lampAt } from './Cabinet';
import { getStrings } from './i18n';
import styles from './Janken.module.css';
import { ScrollArea } from '../common/ScrollArea';

const ODDS = analyzeMachine();
const LAMP_TONE: Readonly<Record<number, string>> = { 1: 'one', 2: 'two', 3: 'three', 5: 'five', 10: 'ten' };

/** The choices the simulation offers. */
export const SIM_MEDALS = [10, 100, 1000] as const;
export const SIM_SESSIONS = [100, 1000, 5000] as const;

/** Sessions' ends gathered into bars: how many ended in each stretch of medals ahead or behind. */
export function histogram(nets: readonly number[], bars = 24): { from: number; to: number; count: number }[] {
  if (nets.length === 0) return [];
  const low = Math.min(...nets);
  const high = Math.max(...nets);
  const width = Math.max(1, Math.ceil((high - low + 1) / bars));
  const out = Array.from({ length: Math.ceil((high - low + 1) / width) }, (_, i) => ({ from: low + i * width, to: low + (i + 1) * width - 1, count: 0 }));
  for (const net of nets) out[Math.floor((net - low) / width)].count += 1;
  return out;
}

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const frac = (f: Fraction) => (f.den === 1 ? String(f.num) : `${f.num}/${f.den}`);
  /** A chance as its fraction, with its percentage under it, so that a column stays narrow on a phone. */
  const chance = (f: Fraction, digits = 2) => (
    <>
      <span className={styles.fraction}>{frac(f)}</span>
      <span className={styles.percent}>{pct(valueOf(f), digits)}</span>
    </>
  );
  const ids = { medals: useId(), sessions: useId(), doubles: useId(), chart: useId() };

  const [medals, setMedals] = useState<number>(100);
  const [sessions, setSessions] = useState<number>(1000);
  const [doubles, setDoubles] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SessionSummary | null>(null);
  const [seed, setSeed] = useState(1);

  const runSim = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the sessions are played.
    window.setTimeout(() => {
      setResult(simulateSessions(medals, sessions, doubles, seeded(20261014 + seed)));
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  const bars = result ? histogram(result.nets) : [];
  const tallest = Math.max(1, ...bars.map((b) => b.count));
  const totalLamps = LAMPS.length;

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.returnValue}</span>
          <span className={styles.statValue} data-testid="janken-rtp">
            {fmt(valueOf(ODDS.rtp) * 100)}
          </span>
          <span className={styles.statNote}>{t.returnNote(ODDS.rtp.num, ODDS.rtp.den)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.keepsLabel}</span>
          <span className={styles.statValue}>{pct(valueOf(ODDS.edge), 0)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.meanWinLabel}</span>
          <span className={styles.statValue}>{fmt(valueOf(ODDS.meanWin), 1)}</span>
          <span className={styles.statNote}>{frac(ODDS.meanWin)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.throwsLabel}</span>
          <span className={styles.statValue}>{fmt(valueOf(ODDS.throwsPerMedal), 1)}</span>
        </div>
      </div>

      <section aria-labelledby="janken-throw-title">
        <h2 id="janken-throw-title" className={styles.blockTitle}>
          {t.throwTitle}
        </h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="janken-throw-table">
            <thead>
              <tr>
                <th>{t.colOutcome}</th>
                <th className={styles.num}>{t.colThrow}</th>
                <th className={styles.num}>{t.colMedal}</th>
              </tr>
            </thead>
            <tbody>
              {(['win', 'draw', 'lose'] as const).map((outcome) => (
                <tr key={outcome} data-outcome={outcome}>
                  <td>{t.outcomeNames[outcome]}</td>
                  <td className={styles.num}>{chance(ODDS.throw[outcome])}</td>
                  <td className={styles.num}>{outcome === 'draw' ? '—' : chance(ODDS.medal[outcome], 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note}>{t.throwNote}</p>
      </section>

      <section aria-labelledby="janken-ring-title">
        <h2 id="janken-ring-title" className={styles.blockTitle}>
          {t.ringTitle}
        </h2>
        <p className={styles.note}>{t.ringIntro}</p>
        <div className={styles.ringFigure}>
          <svg viewBox="0 0 220 220" className={styles.ringMini} aria-hidden focusable="false">
            <circle cx="110" cy="110" r="106" className={styles.ringBezel} />
            <circle cx="110" cy="110" r="80" fill="#1a2d52" />
            <g transform="translate(58 52) scale(0.52)">
              <CatFace mood="idle" clipId="janken-odds-cat" />
            </g>
            {LAMPS.map((value, i) => {
              const { x, y } = lampAt(i, 110, 93);
              return (
                <g key={i} className={styles.lamp} data-tone={LAMP_TONE[value]} data-on="true">
                  <circle cx={x} cy={y} r={value === 10 ? 9 : 7.6} />
                  <text x={x} y={y} dy="0.36em" textAnchor="middle" fontSize="8.5">
                    {value}
                  </text>
                </g>
              );
            })}
          </svg>
          <ScrollArea className={styles.tableWrap}>
            <table className={styles.oddsTable} data-testid="janken-ring-table">
              <thead>
                <tr>
                  <th>{t.colLamp}</th>
                  <th className={styles.num}>{t.colLamps}</th>
                  <th className={styles.num}>{t.colPerWin}</th>
                  <th className={styles.num}>{t.colPerMedal}</th>
                  <th className={styles.num}>{t.colShare}</th>
                </tr>
              </thead>
              <tbody>
                {ODDS.values.map((v) => (
                  <tr key={v.medals} data-medals={v.medals}>
                    <td>
                      <span className={styles.lampChip} data-tone={LAMP_TONE[v.medals]}>
                        {v.medals}
                      </span>
                    </td>
                    <td className={styles.num}>{v.lamps}</td>
                    <td className={styles.num}>{chance(v.perWin)}</td>
                    <td className={styles.num}>{chance(v.perMedal)}</td>
                    <td className={styles.num}>{fmt(valueOf(v.share), 3)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t.total}</td>
                  <td className={styles.num}>{totalLamps}</td>
                  <td className={styles.num}>100%</td>
                  <td className={styles.num}>{pct(valueOf(ODDS.medal.win), 0)}</td>
                  <td className={styles.num}>
                    <b>{fmt(valueOf(ODDS.rtp), 3)}</b>
                  </td>
                </tr>
              </tfoot>
            </table>
          </ScrollArea>
        </div>
      </section>

      <section aria-labelledby="janken-double-title">
        <h2 id="janken-double-title" className={styles.blockTitle}>
          {t.doubleTitle}
        </h2>
        <p className={styles.note}>{t.doubleIntro(MAX_DOUBLES)}</p>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="janken-double-table">
            <thead>
              <tr>
                <th>{t.colDoubles}</th>
                <th className={styles.num}>{t.colTop}</th>
                <th className={styles.num}>{t.colReturn}</th>
                <th className={styles.num}>{t.colSpread}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_DOUBLES + 1 }, (_, k) => {
                const spread = spreadOf(k);
                return (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className={styles.num}>{Math.max(...LAMPS) * 2 ** k}</td>
                    <td className={styles.num}>{fmt(spread.mean * 100)}</td>
                    <td className={styles.num}>{fmt(spread.sd, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section aria-labelledby="janken-compare-title">
        <h2 id="janken-compare-title" className={styles.blockTitle}>
          {t.compareTitle}
        </h2>
        {t.compare.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
      </section>

      <section aria-labelledby="janken-sim-title" className={styles.sim}>
        <h2 id="janken-sim-title" className={styles.blockTitle}>
          {t.simTitle}
        </h2>
        <p className={styles.note}>{t.simIntro}</p>
        <div className={styles.simControls}>
          <label htmlFor={ids.medals}>
            {t.simMedals}
            <select id={ids.medals} value={medals} onChange={(e) => setMedals(Number(e.target.value))} data-testid="janken-sim-medals">
              {SIM_MEDALS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={ids.sessions}>
            {t.simSessions}
            <select id={ids.sessions} value={sessions} onChange={(e) => setSessions(Number(e.target.value))} data-testid="janken-sim-sessions">
              {SIM_SESSIONS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={ids.doubles}>
            {t.simDoubles}
            <select id={ids.doubles} value={doubles} onChange={(e) => setDoubles(Number(e.target.value))} data-testid="janken-sim-doubles">
              {Array.from({ length: MAX_DOUBLES + 1 }, (_, k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.simButton} onClick={runSim} disabled={running} data-testid="janken-sim-run">
            {running ? t.simRunning : t.simRun}
          </button>
        </div>
        <p className={styles.note} data-testid="janken-sim-expected">
          {t.simExpected(fmt(medals * (valueOf(ODDS.rtp) - 1), 1))}
        </p>
        {result && (
          <>
            <p className={styles.simResult} data-testid="janken-sim-result" aria-live="polite">
              {t.simResult(fmt(result.meanNet, 1), pct(result.ahead, 1), pct(result.rtp, 1))}
            </p>
            <figure className={styles.chart}>
              <figcaption id={ids.chart}>{t.simChart}</figcaption>
              <svg viewBox="0 0 300 120" role="img" aria-labelledby={ids.chart} className={styles.chartSvg}>
                {bars.map((bar, i) => {
                  const w = 300 / bars.length;
                  const h = (bar.count / tallest) * 100;
                  return <rect key={i} x={i * w + 0.5} y={104 - h} width={Math.max(1, w - 1)} height={h} className={bar.to < 0 ? styles.barBehind : bar.from > 0 ? styles.barAhead : styles.barEven} />;
                })}
                <line x1="0" x2="300" y1="104.5" y2="104.5" className={styles.chartAxis} />
                <text x="2" y="117" className={styles.chartText}>
                  {fmt(bars[0]?.from ?? 0)} ({t.simBehind})
                </text>
                <text x="298" y="117" textAnchor="end" className={styles.chartText}>
                  +{fmt(bars.at(-1)?.to ?? 0)} ({t.simAhead})
                </text>
              </svg>
            </figure>
          </>
        )}
      </section>
    </div>
  );
};

export default OddsTab;
