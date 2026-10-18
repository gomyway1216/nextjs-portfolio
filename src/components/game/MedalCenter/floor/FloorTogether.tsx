'use client';

import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FloorGame } from '@/lib/medalFloor/games';
import { useGameLanguage } from '../../contexts/GameLanguageContext';
import { FLOOR_PLACE_ANCHOR, MEDAL_RANKINGS_PATH } from './paths';
import { FloorJackpotPanel, type JackpotStanding } from './FloorJackpot';
import { BestAtEach, Board, FeedList, PeriodTabs, PlaceCard, placeKey, useServerNow, type FloorWords, type PeriodChoice, type PlaceState } from './FloorParts';
import { getFloorStrings } from './strings';
import { useFloor, type FloorView } from './useFloor';
import { useFloorPlace, type FloorMember } from './useFloorPlace';
import styles from './Floor.module.css';

export interface FloorTogetherProps {
  /** The signed-in account (never a guest), or null. */
  member: FloorMember | null;
  /** Whether the site knows yet who is signed in. */
  settled: boolean;
  signInHref?: string;
}

/** How many of the latest big wins the board by the door shows: the rankings page has the rest. */
export const HUB_MOMENTS_SHOWN = 3;

/** What the floor jackpot's line says, from where the player stands on the floor. */
const standingOf = (state: PlaceState): JackpotStanding => (state.kind === 'guest' ? 'guest' : state.kind === 'off' ? 'off' : state.kind === 'on' ? 'on' : 'none');

/** The two places the floor played together shows on the medal center's front. */
export interface FloorHubParts {
  /** The board by the door: the floor jackpot and the latest big wins, over the machines. */
  now: ReactNode;
  /** Further in, under the machines: the rankings and the player's own place on the floor. */
  together: ReactNode;
}

type Place = ReturnType<typeof useFloorPlace>;

/**
 * The medal center's front, played together. The floor and the player's place
 * on it are asked for once, here, and shown in two places: the floor jackpot
 * and the latest big wins by the door, where every player sees them as they
 * come in, and the rankings and the place card further in, under the machines.
 */
export function FloorHub({ member, settled, signInHref, children }: FloorTogetherProps & { children: (parts: FloorHubParts) => ReactNode }) {
  const { language } = useGameLanguage();
  const { t: translate } = useTranslation();
  const t = getFloorStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const words: FloorWords = { t, fmt: (n: number) => n.toLocaleString(locale), gameName: (game: FloorGame) => translate(`games.${game}.title`) };
  const floor = useFloor('hub', null, HUB_MOMENTS_SHOWN);
  const now = useServerNow(floor.skew);
  const place = useFloorPlace(member, settled, t);
  return (
    <>
      {children({
        now: <FloorNow words={words} floor={floor} now={now} place={place} signInHref={signInHref} />,
        together: <FloorTogether words={words} floor={floor} place={place} signInHref={signInHref} />,
      })}
    </>
  );
}

interface PartProps {
  words: FloorWords;
  floor: FloorView;
  place: Place;
  signInHref?: string;
}

/**
 * The board by the door, as a real floor hangs one: the floor jackpot on its
 * LED counter, and the last few big wins as they happen.
 */
export function FloorNow({ words, floor, now, place, signInHref }: PartProps & { now: number }) {
  const { t } = words;
  return (
    <section className={styles.now} aria-labelledby="floor-now-title" data-testid="floor-now">
      <h2 id="floor-now-title" className={styles.title}>
        {t.nowTitle}
      </h2>
      <div className={styles.nowBoard}>
        <FloorJackpotPanel standing={standingOf(place.state)} signInHref={signInHref} />
        <div className={`${styles.panel} ${styles.ticker}`} style={{ '--moments': HUB_MOMENTS_SHOWN } as CSSProperties}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>{t.feedTitle}</h3>
            <span className={styles.liveBadge} data-live={floor.live} data-testid="floor-live">
              {floor.live ? t.live : t.polling}
            </span>
          </div>
          <FeedList {...words} feed={floor.feed.slice(0, HUB_MOMENTS_SHOWN)} now={now} loading={floor.summary === null && !floor.unavailable} unavailable={floor.unavailable} />
          <Link href={MEDAL_RANKINGS_PATH} className={styles.more} data-testid="floor-more-moments">
            {t.moreMoments}
            <span aria-hidden> →</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Further in, under the machines: today's and this week's rankings, short,
 * and the player's own place on the floor, which they are off until they join.
 */
export function FloorTogether({ words, floor, place, signInHref }: PartProps) {
  const { t } = words;
  const [period, setPeriod] = useState<PeriodChoice>('day');
  const boards = floor.summary ? (period === 'day' ? floor.summary.day : floor.summary.week) : null;

  return (
    <section className={styles.together} aria-labelledby="floor-together-title" data-testid="floor-together">
      <h2 id="floor-together-title" className={styles.title}>
        {t.title}
      </h2>
      <p className={styles.lead}>{t.togetherLead}</p>

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

      <PlaceCard
        key={placeKey(place.state)}
        id={FLOOR_PLACE_ANCHOR}
        t={t}
        state={place.state}
        busy={place.busy}
        problem={place.problem}
        signInHref={signInHref}
        onJoin={place.join}
        onLeave={place.leave}
      />

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

export default FloorHub;
