'use client';

/**
 * The medal floor's pieces, as plain components of what they are given: the
 * moments on show, a ranking board, and a player's place on the floor. The hub
 * and the rankings page put them together (FloorTogether.tsx, FloorRankings.tsx).
 */

import { useEffect, useId, useState } from 'react';
import { FLOOR_GAMES, type FloorGame } from '@/lib/medalFloor/games';
import { NAME_MAX, checkName } from '@/lib/medalFloor/names';
import type { FloorBoards, FloorFeedEntry, FloorRow } from '@/lib/medalFloor/types';
import type { FloorStrings } from './strings';
import styles from './Floor.module.css';

export interface FloorWords {
  t: FloorStrings;
  /** A machine's name, in the page's language. */
  gameName: (game: FloorGame) => string;
  /** A number, in the page's language. */
  fmt: (n: number) => string;
}

/** The name a player goes by: the one they chose, or "Player" and their four digits. */
export const shownName = (t: FloorStrings, entry: { name: string | null; tag: string }): string => entry.name ?? t.defaultName(entry.tag);

/** The time now, by the server's clock (`skew` is the server's less this device's), ticking every half minute so that "2 min ago" stays true. */
export function useServerNow(skew: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now + skew;
}

export interface FeedListProps extends FloorWords {
  feed: FloorFeedEntry[];
  now: number;
  /** Shown before anything has been heard. */
  loading: boolean;
  unavailable: boolean;
  /** The owner's control: take a moment off the floor. */
  onHide?: (id: number) => void;
}

export function FeedList({ feed, now, loading, unavailable, onHide, t, gameName, fmt }: FeedListProps) {
  if (feed.length === 0) {
    // While the floor is being read, the quiet floor's line holds its place unseen under the dots: it is what comes in
    // most often, and then nothing under it moves.
    return loading ? (
      <p className={`${styles.empty} ${styles.holder}`} data-testid="floor-feed-empty">
        <span>…</span>
        <span className={styles.unseen} aria-hidden="true">
          {t.feedEmpty}
        </span>
      </p>
    ) : (
      <p className={styles.empty} data-testid="floor-feed-empty">
        {unavailable ? t.feedUnavailable : t.feedEmpty}
      </p>
    );
  }
  return (
    <ol className={styles.feed} data-testid="floor-feed" aria-live="polite" aria-relevant="additions">
      {feed.map((entry) => (
        <li key={entry.id} className={styles.moment} data-testid="floor-moment" data-game={entry.game} data-label={entry.label ?? ''} data-big={entry.label === 'jackpot' || entry.label === 'seven3' || entry.label === 'royal' || entry.label === 'floor-jackpot'}>
          <span className={styles.momentText}>
            <bdi className={styles.who}>{shownName(t, entry)}</bdi> <span>{t.moment(entry.label, fmt(entry.medals))}</span>
          </span>
          <span className={styles.momentWhere}>
            {gameName(entry.game)} · <time dateTime={new Date(entry.at).toISOString()}>{t.ago(Math.max(0, Math.round((now - entry.at) / 1000)))}</time>
          </span>
          {onHide && (
            <button type="button" className={styles.ownerButton} onClick={() => onHide(entry.id)} data-testid="floor-hide-moment">
              {t.hideMoment}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

export interface BoardProps extends FloorWords {
  title: string;
  rows: FloorRow[];
  testId: string;
  /** While the floor is being read: the board is drawn empty, its line held unseen, so it comes in where it was held. */
  holding?: boolean;
  /** The owner's controls on each line. */
  owner?: { hide: (row: FloorRow, hidden: boolean) => void; block: (row: FloorRow, blocked: boolean) => void };
}

export function Board({ title, rows, testId, holding = false, owner, t, fmt }: BoardProps) {
  return (
    <div className={styles.board} data-testid={testId}>
      <h4 className={styles.boardTitle}>{title}</h4>
      {rows.length === 0 ? (
        <p className={holding ? `${styles.empty} ${styles.unseen}` : styles.empty} aria-hidden={holding || undefined}>
          {t.boardEmpty}
        </p>
      ) : (
        <ol className={styles.rows}>
          {rows.map((row, index) => (
            <li key={`${row.pid ?? ''}${row.rank}-${index}`} className={styles.row} data-testid="floor-row" data-rank={row.rank} data-hidden={row.hidden ? 'true' : undefined}>
              <span className={styles.rank}>{row.hidden ? t.hidden : t.rank(row.rank)}</span>
              <bdi className={styles.rowName}>{shownName(t, row)}</bdi>
              <span className={styles.score}>{t.medals(fmt(row.score))}</span>
              {owner && row.pid && (
                <span className={styles.ownerButtons}>
                  {!row.blocked && (
                    <button type="button" className={styles.ownerButton} onClick={() => owner.hide(row, !row.hidden)} data-testid="floor-hide-line">
                      {row.hidden ? t.show : t.hide}
                    </button>
                  )}
                  <button type="button" className={styles.ownerButton} onClick={() => owner.block(row, !row.blocked)} data-testid="floor-block">
                    {row.blocked ? t.unblock : t.block}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export interface BestAtEachProps extends FloorWords {
  boards: Pick<FloorBoards, 'best'>;
  /** While the floor is being read: the board is drawn empty, its line held unseen, so it comes in where it was held. */
  holding?: boolean;
}

/** The hub's short board: the biggest win at each machine that has one, the machine's name with it. */
export function BestAtEach({ boards, holding = false, t, gameName, fmt }: BestAtEachProps) {
  const lines = FLOOR_GAMES.flatMap((game) => {
    const top = boards.best[game]?.[0];
    return top ? [{ game, top }] : [];
  });
  return (
    <div className={styles.board} data-testid="floor-best">
      <h4 className={styles.boardTitle}>{t.bestBoard}</h4>
      {lines.length === 0 ? (
        <p className={holding ? `${styles.empty} ${styles.unseen}` : styles.empty} aria-hidden={holding || undefined}>
          {t.boardEmpty}
        </p>
      ) : (
        <ul className={styles.rows}>
          {lines.map(({ game, top }) => (
            <li key={game} className={`${styles.row} ${styles.bestRow}`} data-testid="floor-best-row" data-game={game}>
              <span className={styles.bestGame}>{gameName(game)}</span>
              <bdi className={styles.rowName}>{shownName(t, top)}</bdi>
              <span className={styles.score}>{t.medals(fmt(top.score))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type PeriodChoice = 'day' | 'week';

export function PeriodTabs({ value, onChange, t }: { value: PeriodChoice; onChange: (value: PeriodChoice) => void; t: FloorStrings }) {
  return (
    <div className={styles.tabs} role="group" aria-label={t.rankingsTitle}>
      {(['day', 'week'] as const).map((choice) => (
        <button key={choice} type="button" className={styles.tab} aria-pressed={value === choice} onClick={() => onChange(choice)} data-testid={`floor-period-${choice}`}>
          {choice === 'day' ? t.today : t.thisWeek}
        </button>
      ))}
    </div>
  );
}

/** Where a signed-in player stands on the floor, as the place card shows it. */
export type PlaceState =
  | { kind: 'guest' }
  | { kind: 'checking' }
  | { kind: 'off' }
  | { kind: 'on'; name: string | null; tag: string }
  | { kind: 'blocked' }
  | { kind: 'unavailable' };

export interface PlaceCardProps {
  t: FloorStrings;
  state: PlaceState;
  busy: boolean;
  /** What went wrong with the last try, said in the player's words. */
  problem: string | null;
  signInHref?: string;
  onJoin: (name: string | null) => void;
  onLeave: () => void;
  /** An id for the card, for a link on the same page to come to it. */
  id?: string;
}

/** The card's key: it starts over (its field showing the name the player has) whenever where they stand changes. */
export const placeKey = (state: PlaceState): string => (state.kind === 'on' ? `on:${state.tag}:${state.name ?? ''}` : state.kind);

export function PlaceCard({ t, state, busy, problem, signInHref, onJoin, onLeave, id }: PlaceCardProps) {
  const inputId = useId();
  const hintId = useId();
  const [name, setName] = useState(state.kind === 'on' ? (state.name ?? '') : '');
  const [local, setLocal] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const typed = name.trim();
    if (typed === '') {
      setLocal(null);
      onJoin(null);
      return;
    }
    const checked = checkName(typed);
    if (!checked.ok) {
      setLocal(t.refusals[checked.reason]);
      return;
    }
    setLocal(null);
    onJoin(checked.name);
  };

  const said = local ?? problem;
  return (
    <div id={id} className={styles.place} data-testid="floor-place" data-state={state.kind}>
      <h3 className={styles.placeTitle}>{t.placeTitle}</h3>
      {state.kind === 'guest' && (
        <p className={styles.placeText}>
          {signInHref ? (
            <a className={styles.link} href={signInHref} data-testid="floor-sign-in">
              {t.signInToJoin}
            </a>
          ) : (
            t.signInToJoin
          )}
        </p>
      )}
      {/* While it is asked, a guest's line holds its place unseen under the question: most visitors are guests. */}
      {state.kind === 'checking' && (
        <p className={`${styles.placeText} ${styles.holder}`}>
          <span>{t.checking}</span>
          <span className={styles.unseen} aria-hidden="true">
            {t.signInToJoin}
          </span>
        </p>
      )}
      {state.kind === 'unavailable' && <p className={styles.placeText}>{t.feedUnavailable}</p>}
      {state.kind === 'blocked' && <p className={styles.placeText}>{t.blocked}</p>}
      {(state.kind === 'off' || state.kind === 'on') && (
        <>
          <p className={styles.placeText} data-testid="floor-place-text">
            {state.kind === 'off' ? t.offIntro : t.joined(state.name ?? t.defaultName(state.tag))}
          </p>
          <form className={styles.placeForm} onSubmit={submit}>
            <label htmlFor={inputId} className={styles.placeLabel}>
              {t.nameLabel}
            </label>
            <input
              id={inputId}
              className={styles.placeInput}
              value={name}
              maxLength={NAME_MAX * 2}
              autoComplete="off"
              spellCheck={false}
              placeholder={state.kind === 'on' ? t.defaultName(state.tag) : t.namePlaceholder}
              aria-describedby={hintId}
              aria-invalid={said ? true : undefined}
              onChange={(event) => setName(event.target.value)}
              data-testid="floor-name"
            />
            <p id={hintId} className={styles.placeHint}>
              {t.nameHint}
            </p>
            {said && (
              <p className={styles.problem} role="alert" data-testid="floor-place-problem">
                {said}
              </p>
            )}
            <div className={styles.placeButtons}>
              <button type="submit" className={styles.join} disabled={busy} data-testid="floor-join">
                {busy ? t.saving : state.kind === 'off' ? t.join : t.rename}
              </button>
              {state.kind === 'on' && (
                <button type="button" className={styles.leave} disabled={busy} onClick={onLeave} data-testid="floor-leave">
                  {t.leave}
                </button>
              )}
            </div>
            {state.kind === 'on' && <p className={styles.placeHint}>{t.leaveNote}</p>}
          </form>
        </>
      )}
    </div>
  );
}
