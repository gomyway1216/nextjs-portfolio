import { useMemo } from 'react';
import { ROLLS, layoutOdds, valueOf, type Bets } from './engine';
import type { SicBoStrings } from './i18n';
import styles from './SicBo.module.css';

/**
 * What the medals on the layout can do on the next roll, counted over every
 * way the dice can fall: on how many rolls anything comes back, on how many
 * more comes back than is on the layout, what comes back on average, and the
 * most one roll can bring back. Its four lines are there with nothing on the
 * layout too, so the panels under it keep their place as medals go on.
 */
export const Chances = ({ bets, t, locale }: { bets: Bets; t: SicBoStrings; locale: string }) => {
  const odds = useMemo(() => layoutOdds(bets), [bets]);
  const share = (v: number) => `${(v * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const rolls = (n: number) => t.chancesRolls(n, ROLLS, share(n / ROLLS));
  return (
    <section className={styles.panel} aria-labelledby="sb-chances-title" data-testid="sb-chances" data-staked={odds?.staked ?? 0}>
      <h2 id="sb-chances-title" className={styles.panelTitle}>
        {t.chancesTitle}
      </h2>
      <dl className={styles.chanceList}>
        <div>
          <dt>{t.chancesWins}</dt>
          <dd data-testid="sb-chance-wins">{odds ? rolls(odds.wins) : '—'}</dd>
        </div>
        <div>
          <dt>{t.chancesAhead}</dt>
          <dd data-testid="sb-chance-ahead">{odds ? rolls(odds.ahead) : '—'}</dd>
        </div>
        <div>
          <dt>{t.chancesBack}</dt>
          <dd data-testid="sb-chance-back">{odds ? share(valueOf(odds.back)) : '—'}</dd>
        </div>
        <div>
          <dt>{t.chancesMost}</dt>
          <dd data-testid="sb-chance-most">{odds ? t.chancesMedals(odds.most) : '—'}</dd>
        </div>
      </dl>
      <p className={styles.chanceNote}>{odds ? t.chancesNote : t.chancesNone}</p>
    </section>
  );
};
