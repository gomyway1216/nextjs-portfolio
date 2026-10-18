'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameLanguage } from '../constants/gameTranslations';
import { machinePath } from './paths';
import { getCenterStrings } from './strings';
import styles from './MedalsOut.module.css';

/**
 * Why a player with no medals is offered no free refill: some of their medals
 * are out on a round at the machines named (`out` in bank.ts), to come back
 * when the round is finished there. Each name goes to its machine.
 */
export const MedalsOut = ({ games, language, className, testId }: { games: readonly string[]; language: GameLanguage; className?: string; testId: string }) => {
  const { t: translate } = useTranslation();
  const t = getCenterStrings(language);
  const [before, after = ''] = t.outAt.split('{games}');
  return (
    <p className={className} data-testid={testId} data-out={games.join(' ')}>
      {before}
      {games.map((game, index) => (
        <Fragment key={game}>
          {index > 0 && t.outJoin}
          <Link href={machinePath(game)} className={styles.machine}>
            {translate(`games.${game}.title`)}
          </Link>
        </Fragment>
      ))}
      {after}
    </p>
  );
};
