'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { percent } from '../MedalPusher/format';
import { ACHIEVEMENT_IDS, lifetimeReturn, viewOf } from '../MedalPusher/records';
import { useRecords, type RecordsState } from '../MedalPusher/recordsStore';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useBank, useMedalHistory, type BankState } from './bank';
import { CENTER, FLOOR_JACKPOT, PUSHER_GAME, dayTotals, medalsOverTime, recordsOf, returnOf, totalsOf, type Entry, type GameRecord, type History } from './history';
import type { HistoryState } from './historyStore';
import { COUNTER_PLACES, FLOOR, MedalStack } from './MedalCenter';
import { getMyPageStrings, type MyPageStrings } from './myPageStrings';
import { MEDAL_CENTER_PATH, MEDAL_PUSHER_PATH } from './paths';
import styles from './MyPage.module.css';

/** How many entries the history lists at first, and how many more each press of "Show more" adds. */
export const PAGE_SIZE = 40;

/** A day on the viewer's own calendar, as `2026-10-17`, for grouping the entries. */
const localDayOf = (t: number): string => {
  const date = new Date(t);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
/** A calendar day written as text (`2026-10-17`) as the moment at its noon, so that no time zone moves it to another day. */
const noonOf = (day: string): number => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12).getTime();
};

interface Formats {
  n: (value: number) => string;
  date: (t: number) => string;
  day: (t: number) => string;
  time: (t: number) => string;
}

const formatsFor = (language: 'en' | 'ja'): Formats => {
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  return { n: (value) => value.toLocaleString(locale), date: (t) => date.format(t), day: (t) => day.format(t), time: (t) => time.format(t) };
};

export interface MyPageProps {
  /** Where a guest goes to sign in, so that the history is kept on an account. */
  signInHref?: string;
}

/**
 * The player's own page at the medal center: their medals on the LED
 * counter, a chart of them over time, their records at every machine, the
 * Medal Pusher's own record book, and the history of what happened to the
 * medals. A guest sees this device's; a member, the account's.
 */
export const MyPage = ({ signInHref }: MyPageProps) => <MyPageView bank={useBank()} history={useMedalHistory()} book={useRecords()} signInHref={signInHref} />;

/** The page for a given state of the medals, their history and the Medal Pusher's book. */
export const MyPageView = ({ bank, history, book, signInHref }: { bank: BankState; history: HistoryState; book: RecordsState } & MyPageProps) => {
  const { language } = useGameLanguage();
  const { t: translate } = useTranslation();
  const t = getMyPageStrings(language);
  const f = formatsFor(language);
  const nameOf = (game: string): string => (game === CENTER ? t.centerName : game === FLOOR_JACKPOT ? t.floorName : translate(`games.${game}.title`));
  const account = bank.owner !== null;
  const member = !bank.loaded ? t.memberChecking : account ? t.memberAccount : t.memberGuest;
  const doc = history.loaded ? history.history : null;
  const since = doc && doc.since > 0 ? f.date(doc.since) : null;

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <Link href={MEDAL_CENTER_PATH} className={styles.back} data-testid="mypage-center">
          <span aria-hidden>← </span>
          {t.backToCenter}
        </Link>

        <header className={styles.sign}>
          <h1 className={styles.signTitle}>
            <span className={styles.signMain} lang="en" aria-hidden>
              {t.sign}
            </span>
            <span className={styles.signSub} lang="ja" aria-hidden>
              {t.signSub}
            </span>
            <span className={styles.srOnly}>{t.title}</span>
          </h1>
        </header>
        <p className={styles.lead}>{t.lead}</p>
        <nav className={styles.jumps} aria-label={t.jumpLabel}>
          <a href="#mypage-records" className={styles.jump}>
            {t.recordsTitle}
          </a>
          <a href="#mypage-history" className={styles.jump}>
            {t.historyTitle}
          </a>
        </nav>

        {/* The medals, on the counter's LED digits, and whose and where they are. */}
        <section className={styles.counter} aria-labelledby="mypage-counter-label" data-testid="mypage-counter" data-loaded={bank.loaded}>
          <div className={styles.counterHead}>
            <h2 id="mypage-counter-label" className={styles.counterLabel}>
              {t.counterLabel}
            </h2>
            <span className={styles.member} data-testid="mypage-member" data-owner={account ? 'account' : 'guest'}>
              {member}
            </span>
          </div>
          <div className={styles.counterBody}>
            <MedalStack count={bank.balance === 0 ? 1 : Math.min(6, 2 + Math.floor(Math.log10(bank.balance + 1)))} />
            <div className={styles.led}>
              <SegmentDisplay value={bank.loaded ? bank.balance : ''} places={COUNTER_PLACES} />
            </div>
          </div>
          <p className={styles.balance}>
            <strong data-testid="mypage-medals">{bank.loaded ? f.n(bank.balance) : '—'}</strong>
            <span className={styles.unit}>{t.unit}</span>
          </p>
          <p className={styles.where} data-testid="mypage-where" data-where={history.where} data-kept={history.kept}>
            {account ? t.whose.account : t.whose.guest} {history.kept ? t.where[history.where] : t.notKept}
            {bank.loaded && !account && signInHref && (
              <>
                {' '}
                <a className={styles.link} href={signInHref} data-testid="mypage-sign-in">
                  {t.signInInvite}
                </a>
              </>
            )}
          </p>
          <p className={styles.notMoney} data-testid="mypage-not-money">
            {t.notMoney}
          </p>
        </section>

        <MedalsChart doc={doc} now={bank.loaded && doc ? bank.balance : null} t={t} f={f} />

        <RecordsSection doc={doc} since={since} t={t} f={f} nameOf={nameOf} />
        <BookCard book={book} t={t} f={f} />

        <HistorySection doc={doc} since={since} t={t} f={f} nameOf={nameOf} />
      </div>
    </div>
  );
};

// ── The chart ───────────────────────────────────────────────────────────────

/** The chart's own units: the line is drawn in these, and the box is stretched to the page's width. */
const CHART = { width: 400, height: 150, pad: 6 } as const;

/** The medals over time, as a line on the counter's dark glass: after each thing in the history, and now. */
const MedalsChart = ({ doc, now, t, f }: { doc: History | null; now: number | null; t: MyPageStrings; f: Formats }) => {
  const title = useId();
  const said = useId();
  const points = doc ? medalsOverTime(doc) : [];
  // The line ends on the medals as the counter shows them now, whatever the history last saw.
  if (now !== null && points.length > 0 && points[points.length - 1].left !== now) points.push({ t: points[points.length - 1].t, left: now });
  const first = points[0];
  const last = points[points.length - 1];
  const [from, to] = points.length > 0 ? [first.t, last.t] : [0, 0];
  // A line needs two moments to run between.
  const enough = points.length >= 2 && to > from;
  const high = points.reduce((most, point) => Math.max(most, point.left), 0);
  const top = Math.max(1, high);
  const x = (time: number) => CHART.pad + ((time - from) / Math.max(1, to - from)) * (CHART.width - 2 * CHART.pad);
  const y = (left: number) => CHART.pad + (1 - left / top) * (CHART.height - 2 * CHART.pad);
  // The medals stay as they were until the next thing happens: a step, not a slope.
  const path = enough ? points.map((point, index) => (index === 0 ? `M${x(point.t).toFixed(1)},${y(point.left).toFixed(1)}` : `H${x(point.t).toFixed(1)}V${y(point.left).toFixed(1)}`)).join('') : '';
  const floor = y(0).toFixed(1);
  const area = enough ? `${path}V${floor}H${x(from).toFixed(1)}Z` : '';

  return (
    <section className={styles.chart} aria-labelledby={title} data-testid="mypage-chart" data-points={points.length}>
      <h2 id={title} className={styles.sectionTitle}>
        {t.chartTitle}
      </h2>
      {enough ? (
        <figure className={styles.chartFigure} aria-labelledby={said}>
          {/* The figures beside the line are type, not drawing, so that they are the same size at any width. */}
          <div className={styles.chartPlot} aria-hidden>
            <div className={styles.chartY}>
              <span>{f.n(top)}</span>
              <span>0</span>
            </div>
            <div className={styles.chartBox}>
              <svg className={styles.chartSvg} viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="none" focusable="false">
                <line x1="0" x2={CHART.width} y1={y(top).toFixed(1)} y2={y(top).toFixed(1)} className={styles.chartGrid} />
                <line x1="0" x2={CHART.width} y1={floor} y2={floor} className={styles.chartAxis} />
                <path d={area} className={styles.chartArea} />
                <path d={path} className={styles.chartLine} />
              </svg>
              <span className={styles.chartDot} style={{ left: `${(x(last.t) / CHART.width) * 100}%`, top: `${(y(last.left) / CHART.height) * 100}%` }} />
            </div>
            <div className={styles.chartX}>
              {/* A chart of one day is marked with the time it begins; a longer one, with the day. */}
              <span>{localDayOf(from) === localDayOf(to) ? f.time(from) : f.date(from)}</span>
              <span>{t.chartNow}</span>
            </div>
          </div>
          <figcaption id={said} className={styles.chartCaption}>
            {t.chartSays(t.medals(f.n(first.left)), f.date(first.t), t.medals(f.n(last.left)), t.medals(f.n(high)))}
          </figcaption>
        </figure>
      ) : (
        <p className={styles.sectionLead}>{t.chartEmpty}</p>
      )}
    </section>
  );
};

// ── The records ─────────────────────────────────────────────────────────────

const returned = (bet: number, won: number, t: MyPageStrings): string => {
  const share = returnOf(bet, won);
  return share === null ? t.none : percent(share);
};

/** Every machine's records, every device's together, and all of them added up. */
const RecordsSection = ({ doc, since, t, f, nameOf }: { doc: History | null; since: string | null; t: MyPageStrings; f: Formats; nameOf: (game: string) => string }) => {
  const records = doc ? recordsOf(doc) : [];
  const byGame = new Map(records.map((row) => [row.game, row]));
  const totals = totalsOf(records);
  // The machines played since the history began, the one played last first; then the rest of the floor, in its order.
  const playedHere = (id: string): boolean => {
    const row = byGame.get(id);
    return row !== undefined && (row.rounds > 0 || row.bet > 0 || row.won > 0);
  };
  const played = FLOOR.filter(({ id }) => playedHere(id)).sort((a, b) => (byGame.get(b.id)?.last ?? 0) - (byGame.get(a.id)?.last ?? 0));
  const rest = FLOOR.filter(({ id }) => !playedHere(id));
  const shown = (value: string): string => (doc ? value : t.none);

  return (
    <section id="mypage-records" className={styles.records} aria-labelledby="mypage-records-title" data-testid="mypage-records">
      <h2 id="mypage-records-title" className={styles.sectionTitle}>
        {t.recordsTitle}
      </h2>
      <p className={styles.sectionLead}>{since ? t.recordsLead(since) : t.sinceUnknown}</p>
      <div className={styles.totals} data-testid="mypage-totals">
        <h3 className={styles.cardTitle}>{t.totalsTitle}</h3>
        <dl className={styles.figures}>
          <div>
            <dt>{t.rounds}</dt>
            <dd data-testid="mypage-total-rounds">{shown(f.n(totals.rounds))}</dd>
          </div>
          <div>
            <dt>{t.bet}</dt>
            <dd data-testid="mypage-total-bet">{shown(f.n(totals.bet))}</dd>
          </div>
          <div>
            <dt>{t.won}</dt>
            <dd data-testid="mypage-total-won">{shown(f.n(totals.won))}</dd>
          </div>
          <div>
            <dt>{t.return}</dt>
            <dd data-testid="mypage-total-return">{shown(returned(totals.bet, totals.won, t))}</dd>
          </div>
        </dl>
      </div>
      <FloorJackpotCard row={byGame.get(FLOOR_JACKPOT) ?? null} t={t} f={f} />
      {played.length > 0 && (
        <ul className={styles.games}>
          {played.map(({ id, path }) => (
            <GameCard key={id} id={id} path={path} row={byGame.get(id) ?? null} t={t} f={f} name={nameOf(id)} />
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <div className={styles.unplayed}>
          <h3 className={styles.cardTitle}>{t.notPlayedTitle}</h3>
          <p className={styles.sectionLead}>{doc ? t.notPlayed : t.none}</p>
          <ul className={styles.unplayedList}>
            {rest.map(({ id, path }) => (
              <li key={id} data-game={id} data-played="false" data-testid={`mypage-game-${id}`}>
                {path ? (
                  <Link href={path} className={styles.unplayedLink}>
                    {nameOf(id)}
                    <span aria-hidden> →</span>
                    <span className={styles.srOnly}> ({t.play})</span>
                  </Link>
                ) : (
                  nameOf(id)
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

/** The floor jackpot's own records, once one has been won: how many, how many medals, the biggest, the last. */
const FloorJackpotCard = ({ row, t, f }: { row: GameRecord | null; t: MyPageStrings; f: Formats }) => {
  if (!row || row.rounds === 0) return null;
  return (
    <div className={styles.totals} data-testid="mypage-floor-jackpot">
      <h3 className={styles.cardTitle}>{t.floorTitle}</h3>
      <p className={styles.sectionLead}>{t.floorLead}</p>
      <dl className={styles.figures}>
        <div>
          <dt>{t.floorWins}</dt>
          <dd data-testid="mypage-floor-wins">{f.n(row.rounds)}</dd>
        </div>
        <div>
          <dt>{t.floorMedals}</dt>
          <dd data-testid="mypage-floor-medals">{f.n(row.won)}</dd>
        </div>
        <div>
          <dt>{t.floorBiggest}</dt>
          <dd data-testid="mypage-floor-biggest">{f.n(row.top)}</dd>
        </div>
        <div>
          <dt>{t.floorLast}</dt>
          <dd data-testid="mypage-floor-last">{row.last > 0 ? f.date(row.last) : t.none}</dd>
        </div>
      </dl>
    </div>
  );
};

/** A machine played since the history began, with its records. */
const GameCard = ({ id, path, row, t, f, name }: { id: string; path: string | null; row: GameRecord | null; t: MyPageStrings; f: Formats; name: string }) => {
  // The Medal Pusher plays no rounds: medals go in and come out as the field moves.
  const pusher = id === PUSHER_GAME;
  return (
    <li className={styles.game} data-game={id} data-played="true" data-testid={`mypage-game-${id}`}>
      <div className={styles.gameHead}>
        <h3 className={styles.gameName}>{name}</h3>
        {path && (
          <Link href={path} className={styles.play}>
            {t.play}
            <span className={styles.srOnly}>: {name}</span>
          </Link>
        )}
      </div>
      {row && (
        <dl className={styles.figures}>
          {!pusher && (
            <div>
              <dt>{t.rounds}</dt>
              <dd data-testid={`mypage-${id}-rounds`}>{f.n(row.rounds)}</dd>
            </div>
          )}
          <div>
            <dt>{pusher ? t.fed : t.bet}</dt>
            <dd data-testid={`mypage-${id}-bet`}>{f.n(row.bet)}</dd>
          </div>
          <div>
            <dt>{t.won}</dt>
            <dd data-testid={`mypage-${id}-won`}>{f.n(row.won)}</dd>
          </div>
          <div>
            <dt>{t.return}</dt>
            <dd data-testid={`mypage-${id}-return`}>{returned(row.bet, row.won, t)}</dd>
          </div>
          <div>
            <dt>{pusher ? t.topPrize : t.top}</dt>
            <dd data-testid={`mypage-${id}-top`}>{row.top > 0 ? f.n(row.top) : t.none}</dd>
          </div>
          {!pusher && (
            <div>
              <dt>{t.best}</dt>
              <dd data-testid={`mypage-${id}-best`}>{row.best > 0 ? t.inARow(row.best, f.n(row.best)) : t.none}</dd>
            </div>
          )}
          <div>
            <dt>{t.last}</dt>
            <dd data-testid={`mypage-${id}-last`}>{row.last > 0 ? f.date(row.last) : t.none}</dd>
          </div>
        </dl>
      )}
    </li>
  );
};

/** The Medal Pusher's own record book: its board's headline figures and its stamps, as the cabinet shows them, with a way to the whole book. */
const BookCard = ({ book, t, f }: { book: RecordsState; t: MyPageStrings; f: Formats }) => {
  const view = book.book ? viewOf(book.book) : null;
  const share = view ? lifetimeReturn(view) : null;
  const earned = book.book ? ACHIEVEMENT_IDS.filter((id) => book.book?.stamps[id] !== undefined).length : 0;
  const shown = (value: string): string => (view ? value : t.none);
  return (
    <section className={styles.book} aria-labelledby="mypage-book-title" data-testid="mypage-book" data-loaded={view !== null}>
      <h2 id="mypage-book-title" className={styles.bookTitle}>
        {t.bookTitle}
      </h2>
      <p className={styles.bookLead}>{t.bookLead}</p>
      <dl className={styles.figures}>
        <div>
          <dt>{t.bookWon}</dt>
          <dd data-testid="mypage-book-won">{shown(f.n(view?.total.won ?? 0))}</dd>
        </div>
        <div>
          <dt>{t.bookReturn}</dt>
          <dd data-testid="mypage-book-return">{shown(share === null ? t.none : percent(share))}</dd>
        </div>
        <div>
          <dt>{t.bookPrize}</dt>
          <dd data-testid="mypage-book-prize">{shown(view && view.best.prize > 0 ? f.n(view.best.prize) : t.none)}</dd>
        </div>
        <div>
          <dt>{t.bookJackpots}</dt>
          <dd data-testid="mypage-book-jackpots">{shown(f.n(view?.total.jackpots ?? 0))}</dd>
        </div>
        <div>
          <dt>{t.bookStamps}</dt>
          <dd data-testid="mypage-book-stamps">{shown(t.stampsOf(earned, ACHIEVEMENT_IDS.length))}</dd>
        </div>
      </dl>
      <Link href={MEDAL_PUSHER_PATH} className={styles.bookOpen} data-testid="mypage-book-open">
        {t.bookOpen}
      </Link>
    </section>
  );
};

// ── The history ─────────────────────────────────────────────────────────────

/** What an entry says happened. */
function whatHappened(entry: Entry, t: MyPageStrings, f: Formats): string {
  switch (entry.k) {
    case 'round':
      return t.round(f.n(entry.bet), f.n(entry.won));
    case 'play':
      return t.playVisit(f.n(entry.bet), f.n(entry.won));
    case 'jackpot':
      return t.jackpot(f.n(entry.won));
    case 'bonus':
      return t.bonus(f.n(entry.won));
    case 'refill':
      return t.refill(f.n(entry.won));
    case 'reset':
      return t.reset(f.n(entry.bet), f.n(entry.won));
    case 'floor':
      return t.floorJackpot(f.n(entry.won));
  }
}

/** The medals an entry left the player up or down, for a round or a visit; nothing to say for the rest. */
const NetBadge = ({ entry, t, f }: { entry: Entry; t: MyPageStrings; f: Formats }) => {
  if (entry.k !== 'round' && entry.k !== 'play') return null;
  const net = entry.won - entry.bet;
  const sign = net > 0 ? 'up' : net < 0 ? 'down' : 'even';
  return (
    <span className={styles.net} data-net={sign}>
      <span aria-hidden>{net > 0 ? `+${f.n(net)}` : net < 0 ? `−${f.n(-net)}` : '±0'}</span>
      <span className={styles.srOnly}>{net > 0 ? t.up(f.n(net)) : net < 0 ? t.down(f.n(-net)) : t.even}</span>
    </span>
  );
};

const HistorySection = ({ doc, since, t, f, nameOf }: { doc: History | null; since: string | null; t: MyPageStrings; f: Formats; nameOf: (game: string) => string }) => {
  const [count, setCount] = useState(PAGE_SIZE);
  const entries = doc ? doc.entries : [];
  const listed = entries.slice(0, count);
  // The entries, a day at a time, the latest day first.
  const groups: { day: string; entries: Entry[] }[] = [];
  for (const entry of listed) {
    const day = localDayOf(entry.t);
    if (groups.length === 0 || groups[groups.length - 1].day !== day) groups.push({ day, entries: [] });
    groups[groups.length - 1].entries.push(entry);
  }
  // The days the entries no longer reach, by their totals.
  const oldest = entries.length > 0 ? localDayOf(entries[entries.length - 1].t) : null;
  const older = doc ? dayTotals(doc).filter((total) => oldest !== null && total.day < oldest) : [];

  return (
    <section id="mypage-history" className={styles.history} aria-labelledby="mypage-history-title" data-testid="mypage-history" data-loaded={doc !== null} data-entries={entries.length}>
      <h2 id="mypage-history-title" className={styles.sectionTitle}>
        {t.historyTitle}
      </h2>
      <p className={styles.sectionLead} data-testid="mypage-since">
        {since ? t.since(since) : t.sinceUnknown}
      </p>
      {doc && entries.length === 0 && (
        <p className={styles.empty} data-testid="mypage-empty">
          {t.empty}
        </p>
      )}
      {groups.map((group) => (
        <div key={group.day} className={styles.day}>
          <h3 className={styles.dayTitle}>{f.day(noonOf(group.day))}</h3>
          <ol className={styles.entries}>
            {group.entries.map((entry) => (
              <li key={`${entry.d} ${entry.g} ${entry.r}`} className={styles.entry} data-kind={entry.k} data-game={entry.g} data-testid="mypage-entry">
                <time className={styles.entryTime} dateTime={new Date(entry.t).toISOString()}>
                  {f.time(entry.t)}
                </time>
                <span className={styles.entryGame}>{nameOf(entry.g)}</span>
                <span className={styles.entryWhat}>{whatHappened(entry, t, f)}</span>
                <NetBadge entry={entry} t={t} f={f} />
                {entry.left >= 0 && (
                  <span className={styles.entryLeft}>
                    <span aria-hidden>→ {f.n(entry.left)}</span>
                    <span className={styles.srOnly}>{t.after(f.n(entry.left))}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {entries.length > count && (
        <div className={styles.more}>
          <p className={styles.sectionLead}>{t.shownOf(listed.length, entries.length)}</p>
          <button type="button" className={styles.moreButton} data-testid="mypage-more" onClick={() => setCount((shown) => shown + PAGE_SIZE)}>
            {t.showMore(Math.min(PAGE_SIZE, entries.length - count))}
          </button>
        </div>
      )}
      {older.length > 0 && (
        <div className={styles.older} data-testid="mypage-older">
          <h3 className={styles.cardTitle}>{t.olderTitle}</h3>
          <p className={styles.sectionLead}>{t.olderLead}</p>
          <ul className={styles.olderList}>
            {older.map((total) => (
              <li key={total.day} className={styles.olderDay}>
                <strong>{f.day(noonOf(total.day))}</strong>
                <span>{t.dayLine(f.n(total.bet), f.n(total.won), f.n(total.free), f.n(total.rounds))}</span>
                {total.left !== null && <span className={styles.entryLeft}>{t.dayLeft(f.n(total.left))}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default MyPage;
