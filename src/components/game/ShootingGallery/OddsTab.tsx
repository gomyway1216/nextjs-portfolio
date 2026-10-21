'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import { BANDS, CORKS, KINDS, KIND_IDS, PLAYERS, checkPlays, ratioOf, seeded, valueOf, type Player } from './engine';
import { getStrings } from './i18n';
import { PUBLISHED_SHOOTING_GALLERY_ODDS } from './published';
import styles from './ShootingGallery.module.css';

/** How many plays the check plays for each hand. */
export const CHECK_PLAYS = 20_000;

/** Onsen Shooting Gallery's exact odds (engine.ts, written out in published.ts): the three hands, the figures off the shelf, each figure's chances, and a check by play. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const odds = PUBLISHED_SHOOTING_GALLERY_ODDS;

  const [running, setRunning] = useState(false);
  const [seen, setSeen] = useState<Record<Player, number> | null>(null);
  const [seed, setSeed] = useState(1);
  const runCheck = () => {
    setRunning(true);
    // Let "Playing…" be drawn before the plays are played.
    window.setTimeout(() => {
      const random = seeded(20_261_020 + seed);
      setSeen({ perfect: checkPlays(CHECK_PLAYS, 'perfect', random).back, typical: checkPlays(CHECK_PLAYS, 'typical', random).back, blind: checkPlays(CHECK_PLAYS, 'blind', random).back });
      setSeed((s) => s + 1);
      setRunning(false);
    }, 30);
  };

  const hands: { key: Player; label: string; note: string; column: string; testId: string }[] = [
    { key: 'perfect', label: t.perfectLabel, note: t.perfectNote, column: t.colPerfect, testId: 'sg-perfect' },
    { key: 'typical', label: t.typicalLabel, note: t.typicalNote, column: t.colTypical, testId: 'sg-typical' },
    { key: 'blind', label: t.blindLabel, note: t.blindNote, column: t.colBlind, testId: 'sg-blind' },
  ];

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        {hands.map((hand) => (
          <div className={styles.stat} key={hand.key}>
            <span className={styles.statLabel}>{hand.label}</span>
            <span className={styles.statValue} data-testid={hand.testId}>
              {pct(valueOf(odds[hand.key].back))}
            </span>
            <span className={styles.statNote}>{hand.note}</span>
            <span className={styles.statFraction}>{t.fractionNote(ratioOf(odds[hand.key].back))}</span>
          </div>
        ))}
      </div>

      <section>
        <h2 className={styles.blockTitle}>{t.rulesTitle}</h2>
        <ul className={styles.ruleList}>
          {t.rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.fellTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="sg-fell-table">
            <thead>
              <tr>
                <th scope="col">{t.colFell}</th>
                {hands.map((hand) => (
                  <th scope="col" className={styles.num} key={hand.key}>
                    {hand.column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: CORKS + 1 }, (_, n) => (
                <tr key={n} data-fell={n}>
                  <th scope="row">{t.fellCount(n)}</th>
                  {PLAYERS.map((player) => (
                    <td className={styles.num} key={player}>
                      {pct(valueOf(odds[player].fell[n]), 2)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr data-fell="cat">
                <th scope="row">{t.grandRow}</th>
                {PLAYERS.map((player) => (
                  <td className={styles.num} key={player}>
                    {pct(valueOf(odds[player].grand), 2)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.chancesTitle}</h2>
        <p className={styles.note}>{t.chancesNote}</p>
        {KIND_IDS.map((kind) => (
          <div key={kind} className={styles.kindBlock} data-kind={kind}>
            <h3 className={styles.kindTitle}>{t.kindHeading(kind)}</h3>
            {KINDS[kind].rows.map((rows, position) => (
              <ScrollArea className={styles.tableWrap} key={position}>
                <table className={styles.oddsTable} data-testid={`sg-chances-${kind}-${position}`}>
                  {KINDS[kind].rows.length > 1 && <caption className={styles.placeCaption}>{t.placeHeading(position)}</caption>}
                  <thead>
                    <tr>
                      <th scope="col">{t.colBand}</th>
                      <th scope="col" className={styles.num}>
                        {t.colFall}
                      </th>
                      <th scope="col" className={styles.num}>
                        {t.colSlide}
                      </th>
                      <th scope="col" className={styles.num}>
                        {t.colRock}
                      </th>
                      <th scope="col" className={styles.num}>
                        {t.colMiss}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: BANDS - 1 }, (_, i) => i + 1).map((band) => (
                      <tr key={band} data-band={band}>
                        <th scope="row">{t.bandName(band)}</th>
                        {rows[band].map((n, i) => (
                          <td className={styles.num} key={i}>
                            {n}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            ))}
          </div>
        ))}
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.checkTitle}</h2>
        <p className={styles.note}>{t.checkNote(fmt(CHECK_PLAYS))}</p>
        <button type="button" className={styles.btn} onClick={runCheck} disabled={running} data-testid="sg-check">
          {running ? t.checkRunning : t.checkRun}
        </button>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="sg-check-table">
            <thead>
              <tr>
                <th scope="col">{t.colHand}</th>
                <th scope="col" className={styles.num}>
                  {t.colExact}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colSeen}
                </th>
              </tr>
            </thead>
            <tbody>
              {hands.map((hand) => (
                <tr key={hand.key}>
                  <th scope="row">{hand.label}</th>
                  <td className={styles.num}>{pct(valueOf(odds[hand.key].back))}</td>
                  <td className={styles.num}>{seen ? pct(seen[hand.key]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>
    </div>
  );
};

export default OddsTab;
