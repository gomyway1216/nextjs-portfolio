'use client';

import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  ODDS_OPTIONS,
  allBetOdds,
  combinedDontPassEdge,
  combinedPassEdge,
  expectedShooterRolls,
  passLineBreakdown,
  shooterSurvival,
  toNumber,
  type Fraction,
} from './analysis';
import { WAYS } from './engine';
import { getStrings } from './i18n';
import styles from './Craps.module.css';

const BETS = [...allBetOdds()].sort((a, b) => toNumber(a.houseEdge) - toNumber(b.houseEdge));
const MAX_EDGE = Math.max(...BETS.map((b) => toNumber(b.houseEdge)));
const PASS = passLineBreakdown();
const STRATEGIES = [
  ...ODDS_OPTIONS.map((o) => ({ id: o.id, edge: combinedPassEdge(o.multiple) })),
  { id: 'dontLay', edge: combinedDontPassEdge() },
];
const MAX_STRATEGY_EDGE = Math.max(...STRATEGIES.map((s) => toNumber(s.edge)));
const EXPECTED_ROLLS = expectedShooterRolls();
const SURVIVAL = shooterSurvival(153);
const SURVIVAL_MARKS = [10, 20, 50, 100, 154];

export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits });
  const pct = (v: number, digits = 3) => `${(v * 100).toFixed(digits)}%`;
  const fr = (f: Fraction) => `${fmt(f.n)}/${fmt(f.d)}`;
  const oneIn = (p: number) => (p >= 0.1 ? pct(p, 1) : `1 / ${fmt(1 / p)}`);

  const chartMax = 40;
  const w = 640;
  const h = 200;
  const pad = { l: 40, r: 10, t: 10, b: 28 };
  const x = (n: number) => pad.l + (n / chartMax) * (w - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - p) * (h - pad.t - pad.b);
  const area = [
    `${x(0)},${y(0)}`,
    ...SURVIVAL.slice(0, chartMax + 1).map((p, n) => `${x(n).toFixed(1)},${y(p).toFixed(1)}`),
    `${x(chartMax)},${y(0)}`,
  ].join(' ');

  return (
    <div className={styles.oddsLayout}>
      <p className={styles.intro}>{t.oddsIntro}</p>

      <section className={styles.panel} aria-labelledby="craps-dice-title">
        <h3 id="craps-dice-title" className={styles.blockTitle}>
          {t.diceTitle}
        </h3>
        <div className={styles.waysChart} role="img" aria-label={Object.entries(WAYS).map(([k, v]) => `${k}: ${t.ways(v)}`).join(', ')}>
          {Object.entries(WAYS).map(([total, ways]) => (
            <div key={total} className={styles.waysCol} data-seven={total === '7' ? 'true' : undefined}>
              <span className={styles.waysValue}>{ways}</span>
              <span className={styles.waysBar} style={{ height: `${(ways / 6) * 100}%` }} />
              <span className={styles.waysTotal}>{total}</span>
            </div>
          ))}
        </div>
        <p className={styles.note}>{t.diceNote}</p>
      </section>

      <section className={styles.panel} aria-labelledby="craps-edge-title">
        <h3 id="craps-edge-title" className={styles.blockTitle}>
          {t.edgeTableTitle}
        </h3>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable}>
            <thead>
              <tr>
                <th>{t.colBet}</th>
                <th>{t.colPays}</th>
                <th className={styles.num}>{t.colWin}</th>
                <th>{t.colEdge}</th>
                <th className={styles.num}>{t.colRolls}</th>
              </tr>
            </thead>
            <tbody>
              {BETS.map((b) => (
                <tr key={b.id} data-bet={b.id}>
                  <td>{t.betName[b.id as keyof typeof t.betName]}</td>
                  <td>{b.pays === 'true' ? t.trueOdds : b.pays}</td>
                  <td className={styles.num}>{pct(toNumber(b.win), 2)}</td>
                  <td>
                    <span className={styles.edgeCell}>
                      <span className={styles.edgeBar} style={{ width: `${(toNumber(b.houseEdge) / MAX_EDGE) * 100}%` }} />
                      <b data-testid={`edge-${b.id}`}>{pct(toNumber(b.houseEdge))}</b>
                      <small>{b.houseEdge.n === 0 ? '0' : fr(b.houseEdge)}</small>
                    </span>
                  </td>
                  <td className={styles.num}>{toNumber(b.rollsPerDecision).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{t.edgeNote}</p>
      </section>

      <section className={styles.panel} aria-labelledby="craps-pass-title">
        <h3 id="craps-pass-title" className={styles.blockTitle}>
          {t.passTitle}
        </h3>
        <p className={styles.note}>{t.passIntro}</p>
        <div className={styles.tableWrap}>
          <table className={styles.oddsTable}>
            <thead>
              <tr>
                <th />
                <th className={styles.num}>{t.colChance}</th>
                <th className={styles.num}>{t.colMake}</th>
                <th className={styles.num}>{t.colContribution}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t.passNatural}</td>
                <td className={styles.num}>{fr(PASS.natural)}</td>
                <td className={styles.num}>1</td>
                <td className={styles.num}>{fr(PASS.natural)}</td>
              </tr>
              <tr className={styles.muted}>
                <td>{t.passCraps}</td>
                <td className={styles.num}>{fr(PASS.craps)}</td>
                <td className={styles.num}>0</td>
                <td className={styles.num}>0</td>
              </tr>
              {PASS.points.map((p) => (
                <tr key={p.point}>
                  <td>{t.passPoint(p.point)}</td>
                  <td className={styles.num}>{fr(p.established)}</td>
                  <td className={styles.num}>{fr(p.made)}</td>
                  <td className={styles.num}>{fr(p.contribution)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t.passTotal}</td>
                <td />
                <td />
                <td className={styles.num} data-testid="pass-win">
                  {fr(PASS.win)} = {pct(toNumber(PASS.win))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="craps-oddsfx-title">
        <h3 id="craps-oddsfx-title" className={styles.blockTitle}>
          {t.oddsEffectTitle}
        </h3>
        <p className={styles.note}>{t.oddsEffectIntro}</p>
        <table className={styles.oddsTable}>
          <thead>
            <tr>
              <th>{t.colStrategy}</th>
              <th>{t.colCombined}</th>
            </tr>
          </thead>
          <tbody>
            {STRATEGIES.map((s) => (
              <tr key={s.id} data-strategy={s.id}>
                <td>{s.id === '0x' ? t.flatOnly : s.id === 'dontLay' ? t.dontWithLay : t.withOdds(s.id)}</td>
                <td>
                  <span className={styles.edgeCell}>
                    <span className={styles.edgeBar} style={{ width: `${(toNumber(s.edge) / MAX_STRATEGY_EDGE) * 100}%` }} />
                    <b>{pct(toNumber(s.edge))}</b>
                    <small>{fr(s.edge)}</small>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.panel} aria-labelledby="craps-shooter-title">
        <h3 id="craps-shooter-title" className={styles.blockTitle}>
          {t.shooterTitle}
        </h3>
        <p className={styles.note}>{t.shooterIntro}</p>
        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t.expectedRolls}</span>
            <span className={styles.statValue} data-testid="expected-rolls">
              {toNumber(EXPECTED_ROLLS).toFixed(2)}
            </span>
            <span className={styles.statNote}>= {fr(EXPECTED_ROLLS)}</span>
          </div>
          {SURVIVAL_MARKS.map((n) => (
            <div key={n} className={styles.stat}>
              <span className={styles.statLabel}>{t.survivalLabel(n)}</span>
              <span className={styles.statValue}>{oneIn(SURVIVAL[n - 1])}</span>
            </div>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          className={styles.chart}
          role="img"
          aria-label={`${t.survivalLabel(1)} … ${t.survivalLabel(chartMax)}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <g key={p}>
              <line x1={pad.l} x2={w - pad.r} y1={y(p)} y2={y(p)} stroke="var(--games-route-border)" strokeDasharray="2 4" />
              <text x={pad.l - 6} y={y(p) + 4} textAnchor="end" fontSize={10} fill="var(--games-route-muted)">
                {p * 100}%
              </text>
            </g>
          ))}
          {[0, 10, 20, 30, 40].map((n) => (
            <text key={n} x={x(n)} y={h - 10} textAnchor="middle" fontSize={10} fill="var(--games-route-muted)">
              {n}
            </text>
          ))}
          <polygon points={area} fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" strokeWidth={1.5} />
          <line x1={x(toNumber(EXPECTED_ROLLS))} x2={x(toNumber(EXPECTED_ROLLS))} y1={pad.t} y2={y(0)} stroke="#f59e0b" strokeDasharray="5 4" />
        </svg>
        <p className={styles.note}>{t.recordNote(fmt(1 / SURVIVAL[153]))}</p>
      </section>
    </div>
  );
};
