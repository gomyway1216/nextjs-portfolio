'use client';

import { useGameLanguage } from '../contexts/GameLanguageContext';
import { LEVELS, type Run } from './engine';
import { getStrings } from './i18n';
import { percentOf, routeOf } from './route';
import styles from './BallTower.module.css';

export interface RunRouteProps {
  /** The run looked back at: none before the first ball, or while a ball is in play with no earlier run picked. */
  entry: { run: Run; bet: number } | null;
  /** A ball is in play. */
  running: boolean;
}

/**
 * The way a ball came down: a row a disc, top first, with the pocket it settled in and that pocket's chance (route.ts),
 * and under them the chance of the whole way. It only looks back at a run that has ended: nothing of a ball in play is
 * shown before the tower shows it. Every disc has its row whether the ball reached it or not, and the lines over and
 * under the rows keep their room, so the panel is as tall for any run and nothing under it moves.
 */
export const RunRoute = ({ entry, running }: RunRouteProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const route = entry ? routeOf(entry.run) : null;
  const whole = (n: bigint) => n.toLocaleString(locale);

  return (
    <section className={styles.panel} aria-labelledby="bt-route-title" data-testid="bt-route" data-shown={entry ? 'true' : 'false'}>
      <h2 id="bt-route-title" className={styles.panelTitle}>
        {t.routeTitle}
      </h2>
      <p className={styles.routeWhich} data-testid="bt-route-which">
        {entry ? (
          <>
            <span className={styles.routeWhat}>{t.historyEntryLabel(entry.run, entry.bet)}</span> <span className={styles.routeBet}>{t.routeBet(entry.bet)}</span>
          </>
        ) : (
          <span className={styles.routeNone}>{running ? t.routeWaiting : t.routeEmpty}</span>
        )}
      </p>
      <table className={`${styles.oddsTable} ${styles.routeTable}`} aria-labelledby="bt-route-title">
        <thead>
          <tr>
            <th scope="col">{t.colDisc}</th>
            <th scope="col">{t.colPocket}</th>
            <th scope="col" className={styles.num}>
              {t.colChance}
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: LEVELS }, (_, level) => {
            const step = route?.steps[level];
            return (
              <tr key={level} data-testid={`bt-route-${level}`} data-kind={step?.kind ?? ''} data-reached={step ? 'true' : 'false'}>
                <th scope="row">{t.discName(level)}</th>
                {step ? (
                  <>
                    <td className={styles.routePocket} data-kind={step.kind}>
                      {t.routePocket(step)}
                    </td>
                    <td className={styles.num}>
                      {step.pockets}/{step.of}
                      {step.lamps && ` × ${step.lamps.count}/${step.lamps.of}`}
                    </td>
                  </>
                ) : (
                  <td colSpan={2} className={styles.routeNone}>
                    {entry ? t.routeNotReached : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.routeSum} data-testid="bt-route-chance">
        {route && t.routeChance(percentOf(route.chance, locale), `${whole(route.chance.num)}/${whole(route.chance.den)}`)}
      </p>
      <p className={styles.routeNote}>{t.routeNote}</p>
    </section>
  );
};

export default RunRoute;
