'use client';

import { useId, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FishArt } from './art';
import { analyzeMachine, seeded, simulateSessions, valueOf, type Fraction, type SessionSummary } from './engine';
import { getStrings } from './i18n';
import styles from './Fishing.module.css';

const ODDS = analyzeMachine();

/** The choices the simulation offers. */
export const SIM_CASTS = [100, 1_000, 10_000] as const;
export const SIM_SESSIONS = [100, 1_000] as const;

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

/** The machine's exact odds, worked out from its tables (engine.ts), and a simulation to set beside them. */
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
  const ids = { casts: useId(), sessions: useId(), chart: useId() };

  const [casts, setCasts] = useState<number>(1_000);
  const [sessions, setSessions] = useState<number>(1_000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SessionSummary | null>(null);
  const [seed, setSeed] = useState(1);

  const runSim = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the sessions are played.
    window.setTimeout(() => {
      setResult(simulateSessions(casts, sessions, seeded(20261017 + seed)));
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  const bars = result ? histogram(result.nets) : [];
  const tallest = Math.max(1, ...bars.map((b) => b.count));
  const sumOf = (pick: (fish: (typeof ODDS.fish)[number]) => Fraction) => ODDS.fish.reduce((total, fish) => total + valueOf(pick(fish)), 0);

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
          <span className={styles.statValue} data-testid="fishing-rtp">
            {pct(valueOf(ODDS.rtp), 0)}
          </span>
          <span className={styles.statNote}>{t.returnNote(ODDS.rtp.num, ODDS.rtp.den)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.keepsLabel}</span>
          <span className={styles.statValue}>{pct(valueOf(ODDS.edge), 0)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.hitLabel}</span>
          <span className={styles.statValue} data-testid="fishing-hit">
            {pct(valueOf(ODDS.hit))}
          </span>
          <span className={styles.statNote}>{frac(ODDS.hit)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.noBiteLabel}</span>
          <span className={styles.statValue}>{pct(valueOf(ODDS.noBite))}</span>
          <span className={styles.statNote}>{frac(ODDS.noBite)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.awayLabel}</span>
          <span className={styles.statValue}>{pct(valueOf(ODDS.away))}</span>
          <span className={styles.statNote}>{frac(ODDS.away)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t.spreadLabel}</span>
          <span className={styles.statValue}>{fmt(ODDS.sd, 2)}</span>
          <span className={styles.statNote}>{t.spreadNote(fmt(ODDS.castsForOnePoint))}</span>
        </div>
      </div>

      <section aria-labelledby="fishing-draws-title">
        <h2 id="fishing-draws-title" className={styles.blockTitle}>
          {t.drawsTitle}
        </h2>
        <ol className={styles.drawList}>
          {t.draws.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fishing-fish-title">
        <h2 id="fishing-fish-title" className={styles.blockTitle}>
          {t.fishTitle}
        </h2>
        <p className={styles.note}>{t.fishIntro}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="fishing-fish-table">
            <thead>
              <tr>
                <th>{t.colFish}</th>
                <th className={styles.num}>{t.colPays}</th>
                <th className={styles.num}>{t.colBites}</th>
                <th className={styles.num}>{t.colLands}</th>
                <th className={styles.num}>{t.colCaught}</th>
                <th className={styles.num}>{t.colShare}</th>
              </tr>
            </thead>
            <tbody>
              {ODDS.fish.map((fish) => (
                <tr key={fish.id} data-fish={fish.id}>
                  <td className={styles.oddsFish}>
                    <FishArt id={fish.id} className={styles.oddsArt} />
                    <span>{t.fishNames[fish.id]}</span>
                  </td>
                  <td className={styles.num}>{fish.pays === null ? t.chestPays : `×${fish.pays}`}</td>
                  <td className={styles.num}>{chance(fish.bite)}</td>
                  <td className={styles.num}>{chance(fish.land, 1)}</td>
                  <td className={styles.num}>{chance(fish.caught, 3)}</td>
                  <td className={styles.num}>{fmt(valueOf(fish.share), 4)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t.total}</td>
                <td />
                <td className={styles.num}>{pct(sumOf((fish) => fish.bite))}</td>
                <td />
                <td className={styles.num}>{chance(ODDS.hit)}</td>
                <td className={styles.num}>
                  <b data-testid="fishing-share-total">{fmt(valueOf(ODDS.rtp), 4)}</b>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="fishing-chest-title">
        <h2 id="fishing-chest-title" className={styles.blockTitle}>
          {t.chestTitle}
        </h2>
        <p className={styles.note}>{t.chestIntro}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="fishing-chest-table">
            <thead>
              <tr>
                <th>{t.colPrize}</th>
                <th className={styles.num}>{t.colInChest}</th>
                <th className={styles.num}>{t.colPerCast}</th>
                <th className={styles.num}>{t.colShare}</th>
              </tr>
            </thead>
            <tbody>
              {ODDS.chest.map((prize) => (
                <tr key={prize.pays} data-prize={prize.pays}>
                  <td>×{prize.pays}</td>
                  <td className={styles.num}>{chance(prize.inChest, 0)}</td>
                  <td className={styles.num}>{chance(prize.perCast, 4)}</td>
                  <td className={styles.num}>{fmt(valueOf(prize.share), 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="fishing-real-title">
        <h2 id="fishing-real-title" className={styles.blockTitle}>
          {t.realTitle}
        </h2>
        {t.real.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
      </section>

      <section aria-labelledby="fishing-sim-title" className={styles.sim}>
        <h2 id="fishing-sim-title" className={styles.blockTitle}>
          {t.simTitle}
        </h2>
        <p className={styles.note}>{t.simIntro}</p>
        <div className={styles.simControls}>
          <label htmlFor={ids.casts}>
            {t.simCasts}
            <select id={ids.casts} value={casts} onChange={(e) => setCasts(Number(e.target.value))} data-testid="fishing-sim-casts">
              {SIM_CASTS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={ids.sessions}>
            {t.simSessions}
            <select id={ids.sessions} value={sessions} onChange={(e) => setSessions(Number(e.target.value))} data-testid="fishing-sim-sessions">
              {SIM_SESSIONS.map((n) => (
                <option key={n} value={n}>
                  {fmt(n)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.simButton} onClick={runSim} disabled={running} data-testid="fishing-sim-run">
            {running ? t.simRunning : t.simRun}
          </button>
        </div>
        <p className={styles.note} data-testid="fishing-sim-expected">
          {t.simExpected(fmt(casts * (valueOf(ODDS.rtp) - 1), 1))}
        </p>
        {result && (
          <>
            <p className={styles.simResult} data-testid="fishing-sim-result" aria-live="polite">
              {t.simResult(fmt(result.meanNet, 1), pct(result.ahead, 1), pct(result.rtp, 1), fmt(result.lords))}
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
