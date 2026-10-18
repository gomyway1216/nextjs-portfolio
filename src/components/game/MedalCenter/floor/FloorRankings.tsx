'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FLOOR_GAMES, type FloorGame } from '@/lib/medalFloor/games';
import { FLOOR_TIME_ZONE } from '@/lib/medalFloor/periods';
import type { FloorBoards, FloorRow } from '@/lib/medalFloor/types';
import { useGameLanguage } from '../../contexts/GameLanguageContext';
import { MEDAL_CENTER_PATH } from '../paths';
import { ownerAct, type OwnerAction } from './api';
import { JackpotCounter, JackpotWins, LinkedMachines } from './FloorJackpot';
import { Board, FeedList, PeriodTabs, PlaceCard, placeKey, useServerNow, type PeriodChoice } from './FloorParts';
import { getFloorStrings } from './strings';
import { useFloor } from './useFloor';
import { useFloorJackpot } from './useFloorJackpot';
import { useFloorPlace, type FloorMember } from './useFloorPlace';
import styles from './Floor.module.css';

export interface FloorRankingsProps {
  member: FloorMember | null;
  settled: boolean;
  signInHref?: string;
  /** The owner's token, when the owner is signed in: the page then shows every line, hidden ones marked, with the owner's controls. */
  owner: (() => Promise<string>) | null;
}

/** The boards as they are drawn while the floor is being read: empty, every line held unseen. */
const HELD: Pick<FloorBoards, 'won' | 'best'> = { won: [], best: {} };

/**
 * When the floor's day starts, as a time of day, held in the note's place until the floor has been read: the same on
 * the server and in the browser, and about as wide as the time that comes in.
 */
const heldTime = (locale: string): string => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, 12, 0));

/**
 * The medal floor's rankings in full: every machine's board for today and this week, and every moment on show. While
 * the floor is being read, the boards and the note on when its days start are drawn as they will be, empty and unseen,
 * so that nothing under them moves when it comes in (the page jumped by its whole height on a phone).
 */
export function FloorRankings({ member, settled, signInHref, owner }: FloorRankingsProps) {
  const { language } = useGameLanguage();
  const { t: translate } = useTranslation();
  const t = getFloorStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const words = { t, fmt: (n: number) => n.toLocaleString(locale), gameName: (game: FloorGame) => translate(`games.${game}.title`) };
  const floor = useFloor('full', owner);
  const now = useServerNow(floor.skew);
  const jackpot = useFloorJackpot();
  const ownedWins = owner ? floor.summary?.jackpot?.owned : undefined;
  const [period, setPeriod] = useState<PeriodChoice>('day');
  const place = useFloorPlace(member, settled, t);
  const boards = floor.summary ? (period === 'day' ? floor.summary.day : floor.summary.week) : null;
  const holding = floor.summary === null && !floor.unavailable;
  const shown = boards ?? (holding ? HELD : null);
  const periodId = boards ? `${boards.kind}-${boards.key}` : '';
  // When the floor's day starts, in this viewer's own time (shown only once the floor has been read, so never in the server's render).
  const startsAt = floor.summary
    ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(floor.summary.day.start))
    : null;

  const act = (action: OwnerAction) => {
    if (!owner) return;
    void (async () => {
      try {
        await ownerAct(await owner(), action);
      } finally {
        floor.refresh();
      }
    })();
  };
  const ownerControls = owner
    ? (board: string) => ({
        hide: (row: FloorRow, hidden: boolean) => {
          if (row.pid) act({ action: hidden ? 'hide-line' : 'show-line', period: periodId, board, pid: row.pid });
        },
        block: (row: FloorRow, blocked: boolean) => {
          if (row.pid) act({ action: blocked ? 'block' : 'unblock', pid: row.pid });
        },
      })
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.pageShell}>
        <Link href={MEDAL_CENTER_PATH} className={styles.back} data-testid="rankings-back">
          <span aria-hidden>← </span>
          {t.backToCenter}
        </Link>
        <h1 className={styles.pageTitle}>{t.rankingsTitle}</h1>
        <p className={styles.lead}>{t.lead}</p>
        {(startsAt || holding) && (
          <p className={startsAt ? styles.note : `${styles.note} ${styles.unseen}`} data-testid="rankings-period-note" data-time-zone={FLOOR_TIME_ZONE} aria-hidden={!startsAt || undefined}>
            {t.periodNote(startsAt ?? heldTime(locale))}
          </p>
        )}

        <div className={styles.panelHead}>
          <PeriodTabs value={period} onChange={setPeriod} t={t} />
          {owner && <span className={styles.ownerBadge}>{t.ownerTitle}</span>}
        </div>

        {/* `data-floor-read`, not `data-loaded`: that one says the page has read the player's own medals. */}
        {shown && (
          <div className={styles.fullBoards} data-period={period} data-testid="rankings-boards" data-floor-read={boards !== null}>
            <section className={styles.panel} aria-label={t.wonBoard}>
              <Board {...words} title={t.wonBoard} rows={shown.won} testId="rankings-won" holding={!boards} owner={ownerControls?.('won')} />
              <p className={styles.note}>{t.wonNote}</p>
            </section>
            <section className={styles.panel} aria-label={t.bestBoard}>
              <h3 className={styles.panelTitle}>{t.bestBoard}</h3>
              <p className={styles.note}>{t.bestNote}</p>
              <div className={styles.gameBoards}>
                {FLOOR_GAMES.map((game) => (
                  <Board
                    key={game}
                    {...words}
                    title={words.gameName(game)}
                    rows={shown.best[game] ?? []}
                    testId={`rankings-best-${game}`}
                    holding={!boards}
                    owner={ownerControls?.(`best:${game}`)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        <section className={styles.panel} aria-labelledby="rankings-jackpot-title" data-testid="rankings-jackpot">
          <h2 id="rankings-jackpot-title" className={styles.panelTitle}>
            {t.jackpotWinsTitle}
          </h2>
          <JackpotCounter amount={jackpot.unavailable ? null : jackpot.amount} t={t} locale={locale} size="small" testId="rankings-jackpot-amount" />
          <LinkedMachines t={t} testId="rankings-jackpot-linked" />
          <JackpotWins wins={ownedWins ?? jackpot.wins} t={t} fmt={words.fmt} gameName={words.gameName} now={now} owner={ownedWins ? (id) => act({ action: 'void-jackpot', id }) : undefined} />
          {ownedWins && <p className={styles.note}>{t.jackpotVoidNote}</p>}
        </section>

        <section className={styles.panel} aria-labelledby="rankings-feed-title">
          <div className={styles.panelHead}>
            <h2 id="rankings-feed-title" className={styles.panelTitle}>
              {t.feedTitle}
            </h2>
            <span className={styles.liveBadge} data-live={floor.live} data-testid="floor-live">
              {floor.live ? t.live : t.polling}
            </span>
          </div>
          <FeedList
            {...words}
            feed={floor.feed}
            now={now}
            loading={floor.summary === null && !floor.unavailable}
            unavailable={floor.unavailable}
            onHide={owner ? (id) => act({ action: 'hide-moment', id }) : undefined}
          />
        </section>

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
      </div>
    </div>
  );
}

export default FloorRankings;
