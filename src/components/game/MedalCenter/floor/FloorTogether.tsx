'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FloorGame } from '@/lib/medalFloor/games';
import { useGameLanguage } from '../../contexts/GameLanguageContext';
import { MEDAL_RANKINGS_PATH } from './paths';
import { FloorJackpotPanel, type JackpotStanding } from './FloorJackpot';
import { BestAtEach, Board, FeedList, PeriodTabs, PlaceCard, placeKey, useServerNow, type PeriodChoice, type PlaceState } from './FloorParts';
import { getFloorStrings } from './strings';
import { useFloor } from './useFloor';
import { useFloorPlace, type FloorMember } from './useFloorPlace';
import styles from './Floor.module.css';

export interface FloorTogetherProps {
  /** The signed-in account (never a guest), or null. */
  member: FloorMember | null;
  /** Whether the site knows yet who is signed in. */
  settled: boolean;
  signInHref?: string;
}

/** What the floor jackpot's line says, from where the player stands on the floor. */
const standingOf = (state: PlaceState): JackpotStanding => (state.kind === 'guest' ? 'guest' : state.kind === 'off' ? 'off' : state.kind === 'on' ? 'on' : 'none');

/**
 * The medal center's front, played together: the floor jackpot, live; what is
 * being won on the floor right now, live; today's and this week's rankings,
 * short; and the player's own place on the floor, which they are off until
 * they join.
 */
export function FloorTogether({ member, settled, signInHref }: FloorTogetherProps) {
  const { language } = useGameLanguage();
  const { t: translate } = useTranslation();
  const t = getFloorStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const words = { t, fmt: (n: number) => n.toLocaleString(locale), gameName: (game: FloorGame) => translate(`games.${game}.title`) };
  const floor = useFloor('hub');
  const now = useServerNow(floor.skew);
  const [period, setPeriod] = useState<PeriodChoice>('day');
  const place = useFloorPlace(member, settled, t);
  const boards = floor.summary ? (period === 'day' ? floor.summary.day : floor.summary.week) : null;

  return (
    <section className={styles.together} aria-labelledby="floor-together-title" data-testid="floor-together">
      <h2 id="floor-together-title" className={styles.title}>
        {t.title}
      </h2>
      <p className={styles.lead}>{t.lead}</p>

      <FloorJackpotPanel standing={standingOf(place.state)} signInHref={signInHref} />

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <h3 className={styles.panelTitle}>{t.feedTitle}</h3>
          <span className={styles.liveBadge} data-live={floor.live} data-testid="floor-live">
            {floor.live ? t.live : t.polling}
          </span>
        </div>
        <FeedList {...words} feed={floor.feed} now={now} loading={floor.summary === null && !floor.unavailable} unavailable={floor.unavailable} />
      </div>

      <div className={styles.panel} data-testid="floor-rankings">
        <div className={styles.panelHead}>
          <h3 className={styles.panelTitle}>{t.rankingsTitle}</h3>
          <PeriodTabs value={period} onChange={setPeriod} t={t} />
        </div>
        {boards && (
          <div className={styles.boards} data-period={period}>
            <Board {...words} title={t.wonBoard} rows={boards.won} testId="floor-won" />
            <BestAtEach {...words} boards={boards} />
          </div>
        )}
        <Link href={MEDAL_RANKINGS_PATH} className={styles.more} data-testid="floor-all-rankings">
          {t.allRankings}
          <span aria-hidden> →</span>
        </Link>
      </div>

      <PlaceCard key={placeKey(place.state)} t={t} state={place.state} busy={place.busy} problem={place.problem} signInHref={signInHref} onJoin={place.join} onLeave={place.leave} />

      <p className={styles.honesty} data-testid="floor-honesty">
        {t.honesty}
      </p>
      <p className={styles.honesty} data-testid="jackpot-honesty">
        {t.jackpotHonesty}
      </p>
      <p className={styles.srOnly} aria-live="polite">
        {place.said}
      </p>
    </section>
  );
}

export default FloorTogether;
