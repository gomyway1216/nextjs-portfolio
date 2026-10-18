'use client';

import { useGameLanguage } from '../contexts/GameLanguageContext';
import { CARD, FULL_CARD_LINES, POCKETS, WEIGHT_TOTAL, analyzeMachine } from './engine';
import { getStrings } from './i18n';
import styles from './BallBingo.module.css';

/**
 * The machine's exact odds: its return, the chance of every count of lines,
 * every pocket's weight, and the rules the figures follow. Nothing here is
 * counted from games played: it is the dynamic programming of engine.ts. This
 * tab never touches the player's medals.
 */
export const OddsTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const odds = analyzeMachine();
  const num = (v: number, digits = 0) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pct = (v: number, digits = 3) => `${num(v * 100, digits)}%`;
  /** A small chance, with enough places to read: 0.00784% rather than 0.008%. */
  const chance = (v: number) => (v === 0 ? '—' : v >= 0.01 ? pct(v, 3) : `${(v * 100).toLocaleString(locale, { maximumSignificantDigits: 3 })}%`);
  const oneIn = (v: number) => (v === 0 ? '—' : num(1 / v, 1 / v >= 100 ? 0 : 1));
  const total = odds.lines.reduce((sum, row) => sum + row.chance, 0);

  return (
    <div className={styles.odds} data-testid="bingo-odds">
      <section className={styles.panel} aria-labelledby="bingo-odds-title">
        <h2 id="bingo-odds-title" className={styles.panelTitle}>
          {t.oddsTitle}
        </h2>
        {t.oddsIntro.map((p, i) => (
          <p key={i} className={styles.oddsP}>
            {p}
          </p>
        ))}
        <dl className={styles.figures}>
          <div className={styles.figureBig}>
            <dt>{t.rtp}</dt>
            <dd data-testid="bingo-odds-rtp">{pct(odds.rtp, 3)}</dd>
          </div>
          <div>
            <dt>{t.edge}</dt>
            <dd>{pct(odds.edge, 3)}</dd>
          </div>
          <div>
            <dt>{t.hit}</dt>
            <dd>{pct(odds.hit, 2)}</dd>
          </div>
          <div>
            <dt>{t.fullCardOdds}</dt>
            <dd data-testid="bingo-odds-full">
              {chance(odds.fullCard)} <small>(1 / {oneIn(odds.fullCard)})</small>
            </dd>
          </div>
          <div>
            <dt>{t.chanceOdds}</dt>
            <dd>{pct(odds.chanceTime, 2)}</dd>
          </div>
          <div>
            <dt>{t.freeOdds}</dt>
            <dd>{pct(odds.anyFree, 2)}</dd>
          </div>
          <div>
            <dt>{t.meanShots}</dt>
            <dd>{num(odds.meanShots, 2)}</dd>
          </div>
          <div>
            <dt>{t.meanMarks}</dt>
            <dd>{num(odds.meanMarks, 2)}</dd>
          </div>
          <div>
            <dt>{t.spread}</dt>
            <dd>{num(odds.sd, 2)}</dd>
          </div>
          <div title={t.gamesForOnePercentNote}>
            <dt>{t.gamesForOnePercent}</dt>
            <dd>{num(odds.gamesForOnePercent)}</dd>
          </div>
        </dl>
        <p className={styles.oddsNote}>{t.gamesForOnePercentNote}</p>
        <p className={styles.oddsNote}>{t.chanceShare(pct(odds.chanceShare, 1))}</p>
      </section>

      <section className={styles.panel} aria-labelledby="bingo-lines-title">
        <h2 id="bingo-lines-title" className={styles.panelTitle}>
          {t.linesTitle}
        </h2>
        <p className={styles.oddsP}>{t.linesIntro}</p>
        <div className={styles.tableScroll}>
          <table className={styles.oddsTable} data-testid="bingo-odds-lines">
            <thead>
              <tr>
                <th scope="col">{t.colLines}</th>
                <th scope="col">{t.colChance}</th>
                <th scope="col">{t.colOneIn}</th>
                <th scope="col">{t.colPays}</th>
                <th scope="col">{t.colShare}</th>
              </tr>
            </thead>
            <tbody>
              {odds.lines.map((row) => (
                <tr key={row.lines} data-lines={row.lines} data-impossible={row.lines === 7}>
                  <th scope="row">{row.lines === FULL_CARD_LINES ? `${t.fullCard} (8)` : row.lines}</th>
                  {row.lines === 7 ? (
                    <td colSpan={4} className={styles.impossible}>
                      {t.impossible}
                    </td>
                  ) : (
                    <>
                      <td>{chance(row.chance)}</td>
                      <td>{oneIn(row.chance)}</td>
                      <td>{row.pays > 0 ? `×${row.pays}` : '0'}</td>
                      <td>{row.share > 0 ? pct(row.share, 2) : '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t.total}</th>
                <td>{pct(total, 3)}</td>
                <td />
                <td />
                <td>{pct(odds.rtp, 3)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="bingo-pockets-title">
        <h2 id="bingo-pockets-title" className={styles.panelTitle}>
          {t.pocketsTitle}
        </h2>
        <p className={styles.oddsP}>{t.pocketsIntro}</p>
        <div className={styles.tableScroll}>
          <table className={styles.oddsTable} data-testid="bingo-odds-pockets">
            <thead>
              <tr>
                <th scope="col">{t.colPocket}</th>
                <th scope="col">{t.colWeight}</th>
                <th scope="col">{t.colEach}</th>
              </tr>
            </thead>
            <tbody>
              {POCKETS.map((pocket) => (
                <tr key={pocket.id}>
                  <th scope="row">
                    {t.pocketKind[pocket.kind]}
                    {pocket.kind === 'number' ? ` ${pocket.number}` : pocket.id.endsWith('-l') ? ' ←' : pocket.id.endsWith('-r') ? ' →' : ''}
                  </th>
                  <td>
                    {pocket.weight} / {WEIGHT_TOTAL}
                  </td>
                  <td>{pct(pocket.weight / WEIGHT_TOTAL, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="bingo-rules-title">
        <h2 id="bingo-rules-title" className={styles.panelTitle}>
          {t.rulesTitle}
        </h2>
        <ul className={styles.ruleList}>
          {t.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <h3 className={styles.panelSub}>{t.cardTitle}</h3>
        <div className={styles.miniCard} aria-hidden>
          {CARD.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <p className={styles.oddsP}>{t.cardIntro}</p>
      </section>

      <section className={styles.panel} aria-labelledby="bingo-how-title">
        <h2 id="bingo-how-title" className={styles.panelTitle}>
          {t.howTitle}
        </h2>
        {t.how.map((p, i) => (
          <p key={i} className={styles.oddsP}>
            {p}
          </p>
        ))}
        <h3 className={styles.panelSub}>{t.sourcesTitle}</h3>
        <ul className={styles.ruleList}>
          {t.sources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      </section>
    </div>
  );
};
