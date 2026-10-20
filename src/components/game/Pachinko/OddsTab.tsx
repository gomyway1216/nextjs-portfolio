'use client';

import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ScrollArea } from '../common/ScrollArea';
import { ratioOf, valueOf, type Hand } from './analysis';
import { ATTACKER, DENCHU, FATE_SLOTS, FIRST_RIGHT, HESO, SIDE, STRENGTHS } from './engine';
import { SOURCES, getStrings } from './i18n';
import { PUBLISHED_PACHINKO_FIGURES, PUBLISHED_PACHINKO_ODDS } from './published';
import styles from './Pachinko.module.css';

/** Goldfish Lantern Pachinko's exact returns (analysis.ts, written out in published.ts), its spec, its strengths and its sources. */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const pct = (v: number, digits = 2) => `${fmt(v * 100, digits)}%`;
  const odds = PUBLISHED_PACHINKO_ODDS;

  const hands: { key: Hand; label: string; note: string; testId: string }[] = [
    { key: 'perfect', label: t.perfectLabel, note: t.perfectNote, testId: 'pk-perfect' },
    { key: 'typical', label: t.typicalLabel, note: t.typicalNote, testId: 'pk-typical' },
    { key: 'blind', label: t.blindLabel, note: t.blindNote, testId: 'pk-blind' },
  ];
  const shown = PUBLISHED_PACHINKO_FIGURES;
  const figures: { label: string; value: string }[] = [
    { label: t.stHit, value: pct(valueOf(shown.stHit), 1) },
    { label: t.jitanHit, value: pct(valueOf(shown.jitanHit), 1) },
    { label: t.leftHit, value: pct(valueOf(shown.leftHit), 1) },
    { label: t.spinsPer250, value: fmt(valueOf(shown.spinsPer250), 1) },
    { label: t.nonstopLabel, value: pct(valueOf(shown.nonstop)) },
  ];

  return (
    <div className={styles.odds}>
      <div className={styles.intro}>
        {t.oddsIntro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={styles.statGrid}>
        {hands.map((hand) => {
          const back = odds[hand.key].back;
          const text = ratioOf(back);
          return (
            <div className={styles.stat} key={hand.key}>
              <span className={styles.statLabel}>{hand.label}</span>
              <span className={styles.statValue} data-testid={hand.testId}>
                {pct(valueOf(back))}
              </span>
              <span className={styles.statNote}>{hand.note}</span>
              {text.length <= 40 ? (
                <span className={styles.statFraction}>{t.fractionNote(text)}</span>
              ) : (
                <details className={styles.fractionDetails}>
                  <summary>{t.fractionDigits(back.num.toString().length + back.den.toString().length)}</summary>
                  <span className={styles.statFraction} data-testid={`${hand.testId}-fraction`}>
                    {text}
                  </span>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <section>
        <h2 className={styles.blockTitle}>{t.specTitle}</h2>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="pk-spec-table">
            <tbody>
              {t.specRows.map(([name, value]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.figuresTitle}</h2>
        <dl className={styles.figureList}>
          {figures.map((figure) => (
            <div key={figure.label}>
              <dt>{figure.label}</dt>
              <dd>{figure.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.rulesTitle}</h2>
        <ul className={styles.ruleList}>
          {t.rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.strengthsTitle}</h2>
        <p className={styles.note}>{t.strengthsNote}</p>
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.oddsTable} data-testid="pk-strengths-table">
            <thead>
              <tr>
                <th scope="col">{t.colStrength}</th>
                <th scope="col" className={styles.num}>
                  {t.colHeso}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colSide}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colTulip}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colAttacker}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colOut}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colPerfect}
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: STRENGTHS }, (_, s) => (
                <tr key={s} data-strength={s}>
                  <th scope="row">{t.strengthName(s)}</th>
                  <td className={styles.num}>{HESO[s]}</td>
                  <td className={styles.num}>{SIDE[s]}</td>
                  <td className={styles.num}>{DENCHU[s]}</td>
                  <td className={styles.num}>{ATTACKER[s]}</td>
                  <td className={styles.num}>{s < FIRST_RIGHT ? FATE_SLOTS - HESO[s] - SIDE[s] : '—'}</td>
                  <td className={styles.num}>{pct(valueOf(shown.strengths[s]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section>
        <h2 className={styles.blockTitle}>{t.sourcesTitle}</h2>
        <ul className={styles.sourceList} data-testid="pk-sources">
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
