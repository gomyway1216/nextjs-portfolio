'use client';

/**
 * The floor jackpot as the floor shows it: an LED counter of the medals in
 * the pool, live, on the medal center's front (`FloorJackpotPanel`) and, small,
 * on every machine (`FloorJackpotStrip`), with a line that tells a guest or a
 * player not on the floor how to take part (or, at a machine that is not
 * linked to it, that play there takes no part in it), and the line every Odds
 * tab gains (`FloorJackpotOddsNote`). The page that shows it also pays the
 * player's floor jackpots into their medals (pagePayer.ts), and says so when
 * it does.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { FloorGame } from '@/lib/medalFloor/games';
import { DAILY_PLAYED_MOST, EXPECTED_PER_MEDAL, JACKPOT_C, JACKPOT_ONE_IN, JACKPOT_SEED, JACKPOT_SHARE, LINKED_GAMES, linked, type JackpotWinShown } from '@/lib/medalFloor/jackpot';
import type { GameLanguage } from '../../constants/gameTranslations';
import { useGameLanguage } from '../../contexts/GameLanguageContext';
import { useBank } from '../bank';
import { MEDAL_CENTER_PATH } from '../paths';
import { FLOOR_PLACE_ANCHOR } from './paths';
import { shownName, useServerNow } from './FloorParts';
import { useJackpotPayer } from './pagePayer';
import { lastKnownPlace, onFloorPlace } from './reporter';
import { getFloorStrings, type FloorStrings } from './strings';
import { useFloorJackpot } from './useFloorJackpot';
import styles from './FloorJackpot.module.css';

const localeOf = (language: GameLanguage): string => (language === 'ja' ? 'ja-JP' : 'en-US');

/** The machines linked to the floor jackpot, by name, in the page's language. */
export function LinkedMachines({ t, testId }: { t: FloorStrings; testId: string }) {
  const { t: translate } = useTranslation();
  const { language } = useGameLanguage();
  const names = LINKED_GAMES.map((game) => translate(`games.${game}.title`)).join(language === 'ja' ? '、' : ', ');
  return (
    <p className={styles.linked} data-testid={testId}>
      {t.jackpotLinked(names)}
    </p>
  );
}

/**
 * What the counter shows until the pool is known: dashes in the shape of the seed's digits ("1,000"), so that the
 * counter is as wide before the amount comes in as after it, and nothing under it moves when it does. Wider dashes
 * wrapped on a phone and made a machine's strip 19 px taller until the amount came in.
 */
const UNKNOWN = '–,–––';

/** The counter: the medals in the pool in lit digits, or dashes until they are known. */
export function JackpotCounter({ amount, t, locale, size, testId }: { amount: number | null; t: FloorStrings; locale: string; size: 'big' | 'small'; testId: string }) {
  const digits = amount === null ? UNKNOWN : amount.toLocaleString(locale);
  return (
    <div className={styles.led} data-size={size} data-testid={testId} data-amount={amount ?? ''}>
      <span className={styles.ledLabel}>{t.jackpotTitle}</span>
      <span className={styles.ledDigits} aria-live="off">
        {digits}
      </span>
      <span className={styles.ledUnit}>{t.jackpotUnit}</span>
    </div>
  );
}

/** Where the player stands as far as the floor jackpot goes, said in a line. */
export type JackpotStanding = 'guest' | 'off' | 'on' | 'unknown' | 'none';

function JoinLine({ standing, t, where, signInHref }: { standing: JackpotStanding; t: FloorStrings; where: 'here' | 'there'; signInHref?: string }) {
  if (standing === 'none') return null;
  // Until the medals have been read, the line a guest is shown, unseen: most visitors are guests, so the line keeps its
  // height as it comes in, and nothing under it moves (a phone at 320 px wraps the other lines differently).
  if (standing === 'unknown')
    return (
      <p className={`${styles.joinLine} ${styles.unseen}`} data-testid="jackpot-join" data-standing="unknown" aria-hidden="true">
        {t.jackpotGuest}
      </p>
    );
  if (standing === 'on') return <p className={styles.joinLine} data-testid="jackpot-join" data-standing="on">{t.jackpotIn}</p>;
  if (standing === 'guest')
    return (
      <p className={styles.joinLine} data-testid="jackpot-join" data-standing="guest">
        {signInHref ? (
          <a className={styles.link} href={signInHref} data-testid="jackpot-sign-in">
            {t.jackpotGuest}
          </a>
        ) : (
          t.jackpotGuest
        )}
      </p>
    );
  return (
    <p className={styles.joinLine} data-testid="jackpot-join" data-standing={standing}>
      {where === 'here' ? (
        // The place card is further down the page, past the machines: the line takes the player there.
        <a className={styles.link} href={`#${FLOOR_PLACE_ANCHOR}`} data-testid="jackpot-join-here">
          {t.jackpotJoinHere}
        </a>
      ) : (
        <Link className={styles.link} href={MEDAL_CENTER_PATH} data-testid="jackpot-join-link">
          {t.jackpotJoinThere}
        </Link>
      )}
    </p>
  );
}

function LastWin({ last, t, fmt, now }: { last: JackpotWinShown | undefined; t: FloorStrings; fmt: (n: number) => string; now: number }) {
  if (!last) return <p className={styles.last} data-testid="jackpot-last">{t.jackpotNever}</p>;
  return (
    <p className={styles.last} data-testid="jackpot-last">
      {t.jackpotLast(shownName(t, last), fmt(last.medals), t.ago(Math.max(0, Math.round((now - last.at) / 1000))))}
    </p>
  );
}

/** Says, for a moment, that a floor jackpot has just gone into the player's medals on this page. */
function Paid({ medals, t, fmt }: { medals: number | null; t: FloorStrings; fmt: (n: number) => string }) {
  return (
    <p className={styles.paid} role="status" data-testid="jackpot-paid" hidden={medals === null}>
      {medals === null ? '' : t.jackpotPaid(fmt(medals))}
    </p>
  );
}

/** The last medals paid on this page, shown until the player has had a minute to see them. */
function usePaidShown(owner: string | null): number | null {
  const paid = useJackpotPayer(owner);
  const [gone, setGone] = useState<string | null>(null);
  useEffect(() => {
    if (!paid) return;
    const timer = window.setTimeout(() => setGone(paid.id), 60_000);
    return () => window.clearTimeout(timer);
  }, [paid]);
  return paid && paid.id !== gone ? paid.medals : null;
}

/** What this device last heard of an account's place on the floor, kept up to date as this page or another tab hears more. */
function useKnownPlace(owner: string | null): boolean | null {
  const subscribe = useCallback((changed: () => void) => onFloorPlace(() => changed()), []);
  const read = useCallback(() => (owner ? lastKnownPlace(owner) : null), [owner]);
  return useSyncExternalStore(subscribe, read, () => null);
}

export interface FloorJackpotPanelProps {
  /** Where the signed-in player stands on the floor, as the place card below knows it. */
  standing: JackpotStanding;
  signInHref?: string;
}

/**
 * The medal center's front: the floor jackpot, big, with its last win and how
 * to take part, as the board by the door shows it. How it works, and which
 * machines are linked to it, open under it.
 */
export function FloorJackpotPanel({ standing, signInHref }: FloorJackpotPanelProps) {
  const { language } = useGameLanguage();
  const t = getFloorStrings(language);
  const locale = localeOf(language);
  const fmt = (n: number) => n.toLocaleString(locale);
  const jackpot = useFloorJackpot();
  const now = useServerNow(jackpot.skew);
  const { owner } = useBank();
  const paid = usePaidShown(owner);
  return (
    <div className={styles.panel} data-testid="floor-jackpot" data-live={jackpot.live}>
      <JackpotCounter amount={jackpot.unavailable ? null : jackpot.amount} t={t} locale={locale} size="big" testId="floor-jackpot-amount" />
      <Paid medals={paid} t={t} fmt={fmt} />
      {/* Each line keeps the room of two while the pool and the player's place are read, so nothing under it moves when they arrive. */}
      <div className={styles.slot}>{jackpot.unavailable ? <p className={styles.last}>{t.jackpotUnavailable}</p> : <LastWin last={jackpot.wins[0]} t={t} fmt={fmt} now={now} />}</div>
      <div className={styles.slot}>
        <JoinLine standing={standing} t={t} where="here" signInHref={signInHref} />
      </div>
      <details className={styles.how} data-testid="jackpot-how">
        <summary className={styles.howSummary}>{t.jackpotMore}</summary>
        <p className={styles.lead}>{t.jackpotLead}</p>
        <LinkedMachines t={t} testId="jackpot-linked" />
      </details>
    </div>
  );
}

/**
 * A machine's page: the floor jackpot, small, over the machine. Whether the
 * player takes part is what this device last heard of their place on the
 * floor; the medal center's front is where they join. A machine that is not
 * linked to the floor jackpot says so instead: play there takes no part in it.
 */
export function FloorJackpotStrip({ game }: { game: FloorGame }) {
  const { language } = useGameLanguage();
  const t = getFloorStrings(language);
  const locale = localeOf(language);
  const fmt = (n: number) => n.toLocaleString(locale);
  const jackpot = useFloorJackpot();
  const { owner, loaded } = useBank();
  const joined = useKnownPlace(owner);
  const paid = usePaidShown(owner);
  const standing: JackpotStanding = !loaded ? 'unknown' : !owner ? 'guest' : joined ? 'on' : 'off';
  const isLinked = linked(game);
  return (
    <div className={styles.strip} data-testid="floor-jackpot-strip" data-live={jackpot.live} data-linked={isLinked}>
      <JackpotCounter amount={jackpot.unavailable ? null : jackpot.amount} t={t} locale={locale} size="small" testId="floor-jackpot-strip-amount" />
      <div className={styles.stripText}>
        <Paid medals={paid} t={t} fmt={fmt} />
        {isLinked ? (
          <JoinLine standing={standing} t={t} where="there" signInHref={`/signin?redirect=${encodeURIComponent(MEDAL_CENTER_PATH)}`} />
        ) : (
          <p className={styles.joinLine} data-testid="jackpot-not-linked">
            {t.jackpotNotLinked}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The line every machine's Odds tab gains: what the floor jackpot adds, and on
 * what terms; or, at a machine that is not linked to it, that play there takes
 * no part in it.
 */
export function FloorJackpotOddsNote({ game }: { game: FloorGame }) {
  const { language } = useGameLanguage();
  const t = getFloorStrings(language);
  const locale = localeOf(language);
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = `${(JACKPOT_C * 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const back = (EXPECTED_PER_MEDAL * 100).toLocaleString(locale, { maximumFractionDigits: 2 });
  const isLinked = linked(game);
  return (
    <section className={styles.odds} aria-labelledby="floor-jackpot-odds-title" data-testid="floor-jackpot-odds" data-linked={isLinked}>
      <h3 id="floor-jackpot-odds-title" className={styles.oddsTitle}>
        {t.jackpotTitle}
      </h3>
      {isLinked ? (
        <>
          {t.jackpotRules(pct, fmt(JACKPOT_SHARE.per), fmt(JACKPOT_ONE_IN), fmt(JACKPOT_SEED), back, fmt(DAILY_PLAYED_MOST)).map((line) => (
            <p key={line} className={styles.oddsLine}>
              {line}
            </p>
          ))}
          <p className={styles.oddsHonesty}>{t.jackpotHonesty}</p>
        </>
      ) : (
        <p className={styles.oddsLine}>{t.jackpotRulesOut}</p>
      )}
      <LinkedMachines t={t} testId="floor-jackpot-odds-linked" />
    </section>
  );
}

/** The floor jackpot's last wins, for the rankings page; with the owner's void on each when the owner is looking. */
export function JackpotWins({
  wins,
  t,
  fmt,
  gameName,
  now,
  owner,
}: {
  wins: (JackpotWinShown & { id?: string; state?: 'pending' | 'paid' | 'void' })[];
  t: FloorStrings;
  fmt: (n: number) => string;
  gameName: (game: JackpotWinShown['game']) => string;
  now: number;
  owner?: (id: string) => void;
}) {
  if (wins.length === 0) return <p className={styles.last}>{t.jackpotNever}</p>;
  return (
    <ol className={styles.wins} data-testid="jackpot-wins">
      {wins.map((win, index) => (
        <li key={win.id ?? `${win.at}-${index}`} className={styles.win} data-testid="jackpot-win" data-state={win.state}>
          <span className={styles.winText}>
            <bdi>{shownName(t, win)}</bdi> {t.moment('floor-jackpot', fmt(win.medals))}
          </span>
          <span className={styles.winWhere}>
            {gameName(win.game)} · <time dateTime={new Date(win.at).toISOString()}>{t.ago(Math.max(0, Math.round((now - win.at) / 1000)))}</time>
            {win.state && <> · {t.jackpotState[win.state]}</>}
          </span>
          {owner && win.id && win.state !== 'void' && (
            <button type="button" className={styles.ownerButton} onClick={() => owner(win.id!)} data-testid="jackpot-void">
              {t.jackpotVoid}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
