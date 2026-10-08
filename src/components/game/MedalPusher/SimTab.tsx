'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { Marker, ReturnChart } from './charts';
import { percent, tidyPercent } from './format';
import { getStrings } from './i18n';
import { JACKPOT_START, spinValue, tierChance, type Tier } from './lottery';
import { AIM_COLORS, AIM_IDS, AIM_MARKERS, PACES, WARM_UP, frontShare, simulate, steadyReturn, type Pace, type SimResult } from './sim';
import styles from './MedalPusher.module.css';

/**
 * Medals per aim on offer. The field is simulated step by step on the main
 * thread, in slices that leave the page responsive, and a run can be
 * cancelled: the largest one is a few hundred thousand steps of physics.
 */
export const MEDAL_OPTIONS = [500, 1_000, 2_000] as const;
export const DEFAULT_PACE: Pace = 5;
/** The slot's lines, best first. */
const LINES: Tier[] = ['seven', 'big', 'small', 'miss'];
/** Rows of the chart's table for screen readers: every few checkpoints, and the last. */
const TABLE_EVERY = 8;

interface Run {
  medals: number;
  pace: number;
  result: SimResult;
}

export const SimTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const paceId = useId();
  const medalsId = useId();

  // A new run cancels the one before it; whatever is running is cancelled on unmount.
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const [pace, setPace] = useState<Pace>(DEFAULT_PACE);
  const [medals, setMedals] = useState<number>(MEDAL_OPTIONS[1]);
  // The result keeps the settings it was run with, so changing the controls afterwards does not relabel it.
  const [run, setRun] = useState<Run | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const start = async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setProgress(0);
    const chosen = { medals, pace };
    let result: SimResult | null = null;
    try {
      result = await simulate(chosen.medals, chosen.pace, {
        signal: c.signal,
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });
    } finally {
      // A failed run must not leave the button stuck on "Running…" (a newer run owns it otherwise).
      if (!result && controller.current === c) setProgress(null);
    }
    if (c.signal.aborted || !result) return;
    setRun({ ...chosen, result });
    setProgress(null);
  };

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setProgress(null);
  };

  const busy = progress !== null;
  const exactPerSpin = spinValue(JACKPOT_START);
  const totalSpins = run ? AIM_IDS.reduce((sum, id) => sum + run.result[id].spins, 0) : 0;
  const tableRows = run
    ? run.result.centre.points.map((_, index) => index).filter((index, _i, all) => index % TABLE_EVERY === TABLE_EVERY - 1 || index === all.length - 1)
    : [];

  return (
    <div className={styles.oddsLayout}>
      <section className={styles.panelBox}>
        <h2 className={styles.blockTitle}>{t.simTitle}</h2>
        <p className={styles.body}>{t.simIntro(WARM_UP)}</p>
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label htmlFor={paceId} className={styles.fieldLabel}>
              {t.paceLabel}
            </label>
            <select id={paceId} className={styles.select} value={pace} disabled={busy} onChange={(event) => setPace(Number(event.target.value) as Pace)}>
              {PACES.map((option) => (
                <option key={option} value={option}>
                  {t.paceOption(option)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formField}>
            <label htmlFor={medalsId} className={styles.fieldLabel}>
              {t.medalsLabel}
            </label>
            <select id={medalsId} className={styles.select} value={medals} disabled={busy} onChange={(event) => setMedals(Number(event.target.value))}>
              {MEDAL_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {fmt(option)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className={`${styles.btn} ${styles.btnRun}`} disabled={busy} onClick={start} data-testid="pusher-sim-run">
            {busy ? t.running(progress ?? 0) : t.run}
          </button>
          {busy && (
            <button type="button" className={styles.btn} onClick={cancel} data-testid="pusher-sim-cancel">
              {t.cancel}
            </button>
          )}
        </div>
      </section>

      {run && (
        <section className={styles.panelBox} data-testid="pusher-sim-result">
          <h2 className={styles.blockTitle}>{t.resultTitle(fmt(run.medals), run.pace)}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.oddsTable} data-testid="pusher-sim-table">
              <caption className={styles.srOnly}>{t.simCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.colAim}</th>
                  <th scope="col" className={styles.num}>
                    {t.colReturn}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colSteady}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colFront}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colGate}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colWasted}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.colSpins}
                  </th>
                </tr>
              </thead>
              <tbody>
                {AIM_IDS.map((id) => {
                  const aim = run.result[id];
                  const returned = aim.won / aim.played;
                  return (
                    <tr key={id} data-aim={id}>
                      <th scope="row" className={styles.aimCell}>
                        <svg className={styles.swatch} viewBox="0 0 14 14" aria-hidden>
                          <Marker shape={AIM_MARKERS[id]} x={7} y={7} color={AIM_COLORS[id]} size={4.5} />
                        </svg>
                        {t.aimName[id]}
                      </th>
                      <td className={styles.num} data-sign={returned >= 1 ? 'pos' : 'neg'}>
                        {percent(returned)}
                      </td>
                      <td className={styles.num}>{percent(steadyReturn(aim))}</td>
                      <td className={styles.num}>{percent(frontShare(aim))}</td>
                      <td className={styles.num}>{percent(aim.hits / aim.played)}</td>
                      <td className={styles.num}>{aim.hits === 0 ? '—' : percent(aim.wasted / aim.hits, 0)}</td>
                      <td className={styles.num}>{fmt(aim.spins)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className={styles.facts}>
            {t.simNotes(exactPerSpin.toFixed(2)).map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>

          <div className={styles.chartBlock}>
            <h3 className={styles.chartTitle}>{t.chartTitle}</h3>
            <ReturnChart
              series={AIM_IDS.map((id) => ({ id, color: AIM_COLORS[id], marker: AIM_MARKERS[id], points: run.result[id].points }))}
              xLabel={t.chartX}
              ariaLabel={t.chartAria}
              formatCount={fmt}
            />
            <ul className={styles.legendList} aria-hidden>
              {AIM_IDS.map((id) => (
                <li key={id}>
                  <svg className={styles.swatch} viewBox="0 0 14 14">
                    <Marker shape={AIM_MARKERS[id]} x={7} y={7} color={AIM_COLORS[id]} size={4.5} />
                  </svg>
                  {t.aimName[id]}
                </li>
              ))}
            </ul>
            <table className={styles.srOnly}>
              <caption>{t.chartCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.chartX}</th>
                  {AIM_IDS.map((id) => (
                    <th key={id} scope="col">
                      {t.aimName[id]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((index) => (
                  <tr key={index}>
                    <th scope="row">{fmt(run.result.centre.points[index].medals)}</th>
                    {AIM_IDS.map((id) => (
                      <td key={id}>{percent(run.result[id].points[index]?.rate ?? 0)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.chartBlock}>
            <h3 className={styles.chartTitle}>{t.slotCheckTitle}</h3>
            <p className={styles.note}>{t.slotCheckIntro(fmt(totalSpins))}</p>
            <div className={styles.tableWrap}>
              <table className={styles.oddsTable} data-testid="pusher-sim-slot">
                <caption className={styles.srOnly}>{t.slotCheckCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.colLine}</th>
                    <th scope="col" className={styles.num}>
                      {t.colSpins}
                    </th>
                    <th scope="col" className={styles.num}>
                      {t.colSeen}
                    </th>
                    <th scope="col" className={styles.num}>
                      {t.colExact}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LINES.map((tier) => {
                    const seen = AIM_IDS.reduce((sum, id) => sum + run.result[id].tiers[tier], 0);
                    const name = tier === 'seven' ? t.lineSeven : tier === 'big' ? t.lineOdd : tier === 'small' ? t.lineEven : t.lineMiss;
                    return (
                      <tr key={tier} data-tier={tier}>
                        <th scope="row">{name}</th>
                        <td className={styles.num}>{fmt(seen)}</td>
                        <td className={styles.num}>{totalSpins === 0 ? '—' : percent(seen / totalSpins, 2)}</td>
                        <td className={styles.num}>{tidyPercent(tierChance(tier))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
