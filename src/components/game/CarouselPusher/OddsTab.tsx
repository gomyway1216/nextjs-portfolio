'use client';

import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import { SOURCES, getStrings } from './i18n';
import { OUTCOME_IDS, PRIZES, WEIGHTS, WEIGHT_TOTAL, trayValue } from './lottery';
import { PUBLISHED_CAROUSEL, familyTops, type WayFigures } from './published';
import styles from './CarouselPusher.module.css';

type Way = keyof typeof PUBLISHED_CAROUSEL.ways;

/** Cherry Blossom Carousel's measured returns (published.ts), where they come from, its counter, its dish and its sources. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const o = t.odds;
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const figures = PUBLISHED_CAROUSEL.ways;

  const ways: { key: Way; label: string; note: string; testId: string }[] = [
    { key: 'timed', label: o.bestLabel, note: o.bestNote, testId: 'cp-best' },
    { key: 'steady', label: o.steadyLabel, note: o.steadyNote, testId: 'cp-steady' },
    { key: 'held', label: o.heldLabel, note: o.heldNote, testId: 'cp-held' },
  ];
  const per100 = (w: WayFigures, key: 'front' | 'prizes' | 'thrownIn' | 'pockets') => fmt(w[key] * 100, 1);
  const { scan } = PUBLISHED_CAROUSEL;
  /** A play as the scan names it (`lead -3`, `phase@120+1`, `dish@150`), in words. */
  const playName = (play: string): string => {
    const lead = /^lead (-?\d+)$/.exec(play);
    if (lead) return o.scanLead(Number(lead[1]));
    const phase = /^phase@(\d+)\+(\d+)$/.exec(play);
    if (phase) return phase[2] === '1' ? o.scanAngle(Number(phase[1])) : o.scanSwing(Number(phase[1]), Number(phase[1]) + Number(phase[2]) - 1);
    const dish = /^dish@(\d+)$/.exec(play);
    return dish ? o.scanDish(Number(dish[1])) : play;
  };
  const { best } = PUBLISHED_CAROUSEL;

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {o.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        {ways.map((way) => {
          const w = figures[way.key];
          return (
            <div className={styles.stat} key={way.key}>
              <span className={styles.statLabel}>{way.label}</span>
              <span className={styles.statValue} data-testid={way.testId}>
                {pct(w.return)}
              </span>
              <span className={styles.statFraction}>
                {o.interval(pct(w.half))} · {o.measured(fmt(w.medals))}
              </span>
              <span className={styles.statNote}>{way.note}</span>
            </div>
          );
        })}
      </div>

      <section>
        <h2 className={styles.blockTitle}>{o.whereTitle}</h2>
        <p className={styles.note}>{o.whereNote}</p>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="cp-where-table">
            <thead>
              <tr>
                <th scope="col">{o.colWay}</th>
                <th scope="col" className={styles.num}>
                  {o.colFront}
                </th>
                <th scope="col" className={styles.num}>
                  {o.colPrizes}
                </th>
                <th scope="col" className={styles.num}>
                  {o.colThrown}
                </th>
                <th scope="col" className={styles.num}>
                  {o.colPockets}
                </th>
                <th scope="col" className={styles.num}>
                  {o.colShare}
                </th>
                <th scope="col" className={styles.num}>
                  {o.colJackpots}
                </th>
              </tr>
            </thead>
            <tbody>
              {ways.map((way) => {
                const w = figures[way.key];
                return (
                  <tr key={way.key} data-way={way.key}>
                    <th scope="row">{way.label}</th>
                    <td className={styles.num}>{per100(w, 'front')}</td>
                    <td className={styles.num}>{per100(w, 'prizes')}</td>
                    <td className={styles.num}>{per100(w, 'thrownIn')}</td>
                    <td className={styles.num}>{per100(w, 'pockets')}</td>
                    <td className={styles.num}>{pct(w.fieldShare, 1)}</td>
                    <td className={styles.num}>{fmt(w.jackpotsPer1000, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{o.scanTitle}</h2>
        <p className={styles.note}>{o.scanNote}</p>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="cp-scan-table">
            <thead>
              <tr>
                <th scope="col">{o.colFamily}</th>
                <th scope="col" className={styles.num}>
                  {o.colPlays}
                </th>
                <th scope="col" className={styles.num}>
                  {o.colHighest}
                </th>
                <th scope="col">{o.colAt}</th>
              </tr>
            </thead>
            <tbody>
              {familyTops(scan.plays).map((family) => (
                <tr key={family.id} data-family={family.id}>
                  <th scope="row">{o.familyName[family.id]}</th>
                  <td className={styles.num}>{fmt(family.plays)}</td>
                  <td className={styles.num}>
                    {pct(family.top.return)} ±{pct(family.top.half)}
                  </td>
                  <td>{playName(family.top.play)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <p className={styles.note} data-testid="cp-best-of-all">
          {o.againNote(playName(best.play), pct(best.return), pct(best.half), fmt(best.medals))}
        </p>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{o.counterTitle}</h2>
        <p className={styles.note}>{o.counterNote(fmt(trayValue(), 3))}</p>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="cp-counter-table">
            <thead>
              <tr>
                <th scope="col">{o.colShows}</th>
                <th scope="col" className={styles.num}>
                  {o.colChance}
                </th>
                <th scope="col" className={styles.num}>
                  {o.colOneIn}
                </th>
                <th scope="col">{o.colPays}</th>
              </tr>
            </thead>
            <tbody>
              {OUTCOME_IDS.map((id) => (
                <tr key={id} data-outcome={id}>
                  <th scope="row">{t.outcomeName[id]}</th>
                  <td className={styles.num}>
                    {fmt(WEIGHTS[id])}/{fmt(WEIGHT_TOTAL)}
                  </td>
                  <td className={styles.num}>{fmt(WEIGHT_TOTAL / WEIGHTS[id], 1)}</td>
                  <td>{id === 'jackpot' ? o.jackpotPays : PRIZES[id] > 0 ? t.medalsWord(PRIZES[id]) : o.nothing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{o.dishTitle}</h2>
        {o.dish.map((p, i) => (
          <p key={i} className={styles.note}>
            {p}
          </p>
        ))}
      </section>

      <section>
        <h2 className={styles.blockTitle}>{o.rulesTitle}</h2>
        <ul className={styles.ruleList}>
          {o.rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{o.sourcesTitle}</h2>
        <p className={styles.note}>{o.sourcesNote}</p>
        <ul className={styles.sourceList} data-testid="cp-sources">
          {SOURCES.map((source) => (
            <li key={source.url}>
              <a className={styles.link} href={source.url} rel="noopener noreferrer" target="_blank">
                {source.label[language]}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default OddsTab;
