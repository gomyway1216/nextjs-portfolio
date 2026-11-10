'use client';

import type { GameLanguage } from '../constants/gameTranslations';
import type { MachineOdds } from './engine';
import { getStrings } from './i18n';
import { chartScale, expectedHits, expectedNet, type SessionLog, type SessionPoint } from './sessionLog';
import { SlotSymbol } from './Symbols';
import styles from './SlotMachine.module.css';

const WIDTH = 320;
const HEIGHT = 170;
const PAD = { top: 10, right: 10, bottom: 28, left: 44 };
/** Tick labels closer than this (in chart units) to the zero line's are left out, so they never overlap. */
const LABEL_GAP = 12;

interface SessionRecordProps {
  log: SessionLog;
  odds: MachineOdds;
  language: GameLanguage;
}

/**
 * The session drawn: the net medals spin by spin against what the medals bet come to on average, and each line's hits
 * beside how many the exact odds give for as many spins.
 */
export const SessionRecord = ({ log, odds, language }: SessionRecordProps) => {
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const signed = (n: number, digits = 0) => {
    const text = Math.abs(n).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    // Nothing that rounds to zero is given a sign.
    if (Number(Math.abs(n).toFixed(digits)) === 0) return text;
    return `${n > 0 ? '+' : '−'}${text}`;
  };
  /** One decimal, and a count too small for it is said to be small, not none. */
  const expectedCount = (v: number) =>
    v === 0 ? '0' : v < 0.05 ? `<${(0.1).toLocaleString(locale)}` : v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const { points, spins } = log;
  const last = points[points.length - 1];
  const scale = chartScale(points, odds.houseEdge);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (n: number) => PAD.left + (n / scale.maxSpins) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - scale.low) / (scale.high - scale.low)) * innerH;
  const path = (value: (p: SessionPoint) => number) => points.map((p) => `${x(p.spins).toFixed(1)},${y(value(p)).toFixed(1)}`).join(' ');
  const average = expectedNet(last.wagered, odds.houseEdge);
  const ticks = [scale.high, scale.low].filter((v) => Math.abs(y(v) - y(0)) >= LABEL_GAP);
  const edge = `${(odds.houseEdge * 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

  return (
    <section className={styles.panel} aria-labelledby="slot-record-title" data-testid="slot-record">
      <h2 id="slot-record-title" className={styles.panelTitle}>
        {t.recordTitle}
      </h2>
      <svg
        className={styles.sessionChart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={spins === 0 ? t.chartEmpty : t.chartAria(fmt(spins), signed(last.net), signed(average, 2))}
        data-testid="slot-session-chart"
        data-points={points.length}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className={styles.chartGrid} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} />
            <text className={styles.chartLabel} x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end">
              {signed(Math.round(v))}
            </text>
          </g>
        ))}
        <line className={styles.chartZero} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} />
        <text className={styles.chartLabel} x={PAD.left - 6} y={y(0) + 3.5} textAnchor="end">
          0
        </text>
        <text className={styles.chartLabel} x={PAD.left} y={HEIGHT - PAD.bottom + 13} textAnchor="start">
          0
        </text>
        <text className={styles.chartLabel} x={WIDTH - PAD.right} y={HEIGHT - PAD.bottom + 13} textAnchor="end">
          {fmt(scale.maxSpins)}
        </text>
        <text className={styles.chartLabel} x={PAD.left + innerW / 2} y={HEIGHT - 4} textAnchor="middle">
          {t.spins}
        </text>
        {spins === 0 ? (
          <text className={styles.chartLabel} x={PAD.left + innerW / 2} y={PAD.top + innerH / 2 - 8} textAnchor="middle">
            {t.chartEmpty}
          </text>
        ) : (
          <>
            <polyline className={styles.chartAverage} points={path((p) => expectedNet(p.wagered, odds.houseEdge))} />
            <polyline className={styles.chartNet} points={path((p) => p.net)} />
            <circle className={styles.chartNetDot} cx={x(last.spins)} cy={y(last.net)} r={3} />
          </>
        )}
      </svg>
      <ul className={styles.chartLegend}>
        <li>
          <span className={styles.chartSwatch} aria-hidden="true" />
          <span>{t.chartNet}</span>
          <b className={last.net > 0 ? styles.pos : last.net < 0 ? styles.neg : undefined} data-testid="slot-chart-net">
            {signed(last.net)}
          </b>
        </li>
        <li>
          <span className={`${styles.chartSwatch} ${styles.chartSwatchAverage}`} aria-hidden="true" />
          <span>{t.chartAverage(edge)}</span>
          <b data-testid="slot-chart-average">{signed(average, 2)}</b>
        </li>
      </ul>

      <table className={`${styles.miniPaytable} ${styles.tally}`} data-testid="slot-tally">
        <caption className={styles.tallyCaption}>{t.tallyTitle}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.paytableLineHead}>
              {t.payColLine}
            </th>
            <th scope="col" className={styles.paytableBetHead}>
              {t.tallyYours}
            </th>
            <th scope="col" className={styles.paytableBetHead}>
              {t.tallyExpected}
            </th>
          </tr>
        </thead>
        <tbody>
          {odds.rules.map(({ rule, probability }) => (
            <tr key={rule.id}>
              <th scope="row" className={styles.paytableLine}>
                <span className={styles.paytableSymbols}>
                  {rule.pattern.map((p, i) =>
                    p === 'any' ? (
                      <span key={i} className={styles.anySymbol}>
                        –
                      </span>
                    ) : (
                      <SlotSymbol key={i} id={p} className={styles.miniSymbol} />
                    ),
                  )}
                </span>
                <span className={styles.srOnly}>{t.ruleName[rule.id]}</span>
              </th>
              <td className={styles.paytablePays} data-testid={`slot-tally-${rule.id}`}>
                {fmt(log.hits[rule.id])}
              </td>
              <td className={styles.tallyExpected}>{expectedCount(expectedHits(spins, probability))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>{t.tallyNote(fmt(spins))}</p>
    </section>
  );
};
