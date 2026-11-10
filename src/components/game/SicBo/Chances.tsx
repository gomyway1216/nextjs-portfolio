import { useMemo } from 'react';
import { MOST_BACK_PER_MEDAL, ROLLS, layoutOdds, valueOf, type Bets } from './engine';
import type { SicBoStrings } from './i18n';
import { SPOT_MAX } from './medalTable';
import styles from './SicBo.module.css';

/**
 * What the medals on the layout can do on the next roll, counted over every
 * way the dice can fall: on how many rolls anything comes back, on how many
 * more comes back than is on the layout, what comes back on average, and the
 * most one roll can bring back.
 *
 * The panel is the same size with nothing on the layout as with every area
 * full, so the panels under it keep their place as medals go on and come off:
 * each figure holds the room of the widest it can show, and both notes (the
 * one for an empty layout and the one for a bet one) take up their lines,
 * with only the one that applies shown.
 */
export const Chances = ({ bets, t, locale }: { bets: Bets; t: SicBoStrings; locale: string }) => {
  const odds = useMemo(() => layoutOdds(bets), [bets]);
  const share = (v: number) => `${(v * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const rolls = (n: number) => t.chancesRolls(n, ROLLS, share(n / ROLLS));
  const figure = (id: string, value: string | null, widest: string) => (
    <dd>
      <span className={styles.chanceRoom} aria-hidden="true">
        {widest}
      </span>
      <span data-testid={`sb-chance-${id}`}>{value ?? '—'}</span>
    </dd>
  );
  return (
    <section className={styles.panel} aria-labelledby="sb-chances-title" data-testid="sb-chances" data-staked={odds?.staked ?? 0}>
      <h2 id="sb-chances-title" className={styles.panelTitle}>
        {t.chancesTitle}
      </h2>
      <dl className={styles.chanceList}>
        <div>
          <dt>{t.chancesWins}</dt>
          {figure('wins', odds && rolls(odds.wins), rolls(ROLLS))}
        </div>
        <div>
          <dt>{t.chancesAhead}</dt>
          {figure('ahead', odds && rolls(odds.ahead), rolls(ROLLS))}
        </div>
        <div>
          <dt>{t.chancesBack}</dt>
          {figure('back', odds && share(valueOf(odds.back)), share(1))}
        </div>
        <div>
          <dt>{t.chancesMost}</dt>
          {figure('most', odds && t.chancesMedals(odds.most), t.chancesMedals(MOST_BACK_PER_MEDAL * SPOT_MAX))}
        </div>
      </dl>
      <div className={styles.chanceNotes}>
        <p className={styles.chanceNote} data-testid="sb-chance-note-none" data-shown={odds ? 'false' : 'true'} aria-hidden={odds ? 'true' : undefined}>
          {t.chancesNone}
        </p>
        <p className={styles.chanceNote} data-testid="sb-chance-note" data-shown={odds ? 'true' : 'false'} aria-hidden={odds ? undefined : 'true'}>
          {t.chancesNote}
        </p>
      </div>
    </section>
  );
};
