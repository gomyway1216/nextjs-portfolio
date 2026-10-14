'use client';

import { useEffect, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { ACHIEVEMENT_NUMBERS, StampCard } from './DailyBonus';
import { percent } from './format';
import { RESET_WINDOW, confirmsReset } from './PlayTab';
import { keepNoteFor } from './recordsNote';
import { ACHIEVEMENT_IDS, currentStreak, lifetimeReturn, viewOf, type BookView, type Day } from './records';
import { records, useRecords, type RecordsState } from './recordsStore';
import { BOARD_GROUPS, BOARD_ROWS, getRecordStrings, type BoardRow, type RecordStrings } from './recordsStrings';
import { AchievementMark, AchievementStamp, InkPad, stampDate, useInk } from './Stamps';
import styles from './Records.module.css';

/**
 * What each row of the board shows, from the book as it is on `day`. A row
 * that is a count of something says so in the words of its unit; a figure that
 * has nothing behind it yet, the return before a medal is fed or a best before
 * anything was won, is a dash.
 */
export function boardValue(row: BoardRow, view: BookView, streakNow: number, t: RecordStrings, fmt: (n: number) => string): string {
  const { total, best } = view;
  const orNone = (value: number, shown: string): string => (value > 0 ? shown : t.none);
  switch (row) {
    case 'return': {
      const share = lifetimeReturn(view);
      return share === null ? t.none : percent(share);
    }
    case 'reachWins':
      return fmt(total.small + total.big + total.seven);
    case 'run':
      return orNone(best.run, t.inARow(fmt(best.run)));
    case 'jackpot':
      return orNone(best.jackpot, fmt(best.jackpot));
    case 'prize':
      return orNone(best.prize, fmt(best.prize));
    case 'days':
      return t.daysCount(fmt(view.days));
    case 'streakNow':
      return t.daysCount(fmt(streakNow));
    case 'streak':
      return t.daysCount(fmt(view.streak));
    case 'refills':
    case 'fulls':
    case 'chances':
    case 'spins':
    case 'claims':
      return t.times(fmt(total[row]));
    default:
      return fmt(total[row]);
  }
}

/**
 * The Records tab: the daily stamp card, the board of everything this player
 * has done at the cabinet, and the sheet of achievement stamps. All of it
 * comes out of the browser's storage and depends on the day, so the server,
 * and the first drawing in the browser, show the card unstamped and the board
 * and the sheet with dashes.
 */
export const RecordsTab = () => <RecordsView state={useRecords()} />;

/** The tab for a given state of the book. */
export const RecordsView = ({ state }: { state: RecordsState }) => {
  const { language } = useGameLanguage();
  const t = getRecordStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const ink = useInk();
  const { book, day, kept, where } = state;
  // A player who is signed in clears the book on their account with the one here, and is told so before the second press.
  const confirm = where === 'device' ? t.clearConfirm : t.clearConfirmAccount;
  const view = book ? viewOf(book) : null;
  const streakNow = book && day ? currentStreak(book, day) : 0;
  const shown = (value: (view: BookView) => string): string => (view ? value(view) : t.none);

  // Clearing takes two presses, like resetting the machine: the first arms it and a few seconds later it stands down.
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const armed = armedAt !== null;
  useEffect(() => {
    if (armedAt === null) return;
    const timer = window.setTimeout(() => {
      setArmedAt(null);
      setSaid(getRecordStrings(language).sayClearOff);
    }, RESET_WINDOW * 1000);
    return () => window.clearTimeout(timer);
  }, [armedAt, language]);
  const onClear = () => {
    const now = Date.now();
    if (!confirmsReset(armedAt, now)) {
      setArmedAt(now);
      setSaid(confirm);
      return;
    }
    setArmedAt(null);
    records.clearRecords();
    setSaid(t.sayCleared);
  };

  const names = t.achievement(ACHIEVEMENT_NUMBERS);
  const earned = book ? ACHIEVEMENT_IDS.filter((id) => book.stamps[id] !== undefined).length : 0;
  const stampedOn = (id: (typeof ACHIEVEMENT_IDS)[number]): Day | undefined => book?.stamps[id];

  return (
    <div className={styles.layout} data-loaded={book !== null} data-testid="pusher-records">
      <InkPad id={ink} />
      <StampCard />

      <section className={styles.board} aria-label={t.boardTitle} data-testid="pusher-records-board">
        <div className={styles.boardHead}>
          <h2 className={styles.boardTitle}>
            <span className={styles.boardBrand} aria-hidden>
              RECORD BOARD
            </span>
            <span className={language === 'en' ? styles.srOnly : styles.boardSub}>{t.boardTitle}</span>
          </h2>
        </div>
        <p className={styles.boardLead}>{t.boardLead}</p>
        {/* The four figures the board leads with are also rows further down. Each is found by a name of its own: `headline` here, `record` there. */}
        <dl className={styles.bigs}>
          <div className={styles.big}>
            <dt>{t.bigWon}</dt>
            <dd data-testid="pusher-headline-won">{shown((v) => fmt(v.total.won))}</dd>
          </div>
          <div className={styles.big}>
            <dt>{t.bigReturn}</dt>
            <dd data-testid="pusher-headline-return">{shown((v) => boardValue('return', v, streakNow, t, fmt))}</dd>
          </div>
          <div className={styles.big}>
            <dt>{t.bigPrize}</dt>
            <dd data-testid="pusher-headline-prize">{shown((v) => boardValue('prize', v, streakNow, t, fmt))}</dd>
          </div>
          <div className={styles.big}>
            <dt>{t.bigJackpots}</dt>
            <dd data-testid="pusher-headline-jackpots">{shown((v) => fmt(v.total.jackpots))}</dd>
          </div>
        </dl>
        <div className={styles.groups}>
          {BOARD_GROUPS.map((group) => (
            <section key={group} className={styles.group} aria-label={t.group[group]}>
              <h3 className={styles.groupTitle}>{t.group[group]}</h3>
              <dl className={styles.rows}>
                {BOARD_ROWS[group].map((row) => (
                  <div key={row} className={styles.row}>
                    <dt>{row === 'topChests' ? t.topChestRow(ACHIEVEMENT_NUMBERS.chest) : t.row[row]}</dt>
                    <dd data-testid={`pusher-record-${row}`}>{shown((v) => boardValue(row, v, streakNow, t, fmt))}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>

      <section className={styles.sheet} aria-label={t.sheetTitle} data-testid="pusher-achievements">
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t.sheetTitle}</h2>
          <span className={styles.sheetCount} data-testid="pusher-achievements-count">
            {t.sheetCount(earned, ACHIEVEMENT_IDS.length)}
          </span>
        </div>
        <ul className={styles.stamps}>
          {ACHIEVEMENT_IDS.map((id, index) => {
            const on = stampedOn(id);
            return (
              <li key={id} className={styles.slot} data-earned={on !== undefined} data-achievement={id}>
                <span className={styles.ring}>{on !== undefined ? <AchievementStamp ink={ink} index={index} id={id} /> : <AchievementMark id={id} />}</span>
                <strong className={styles.slotName}>{names[id].name}</strong>
                <span className={styles.slotHow}>{names[id].how}</span>
                <span className={styles.slotDate}>
                  {on !== undefined ? (
                    <>
                      <span aria-hidden>{stampDate(on)}</span>
                      <span className={styles.srOnly}>{t.stampedOn(t.date(on))}</span>
                    </>
                  ) : (
                    t.notYet
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.keeping}>
        <p className={styles.keepNote} data-kept={kept} data-where={where} data-testid="pusher-records-kept">
          {t[keepNoteFor(state)]}
        </p>
        <p className={styles.keepNote}>{t.clearNote}</p>
        {where !== 'device' && (
          <p className={styles.keepNote} data-testid="pusher-records-clear-account">
            {t.clearNoteAccount}
          </p>
        )}
        <button type="button" className={styles.clear} data-armed={armed} data-testid="pusher-records-clear" disabled={book === null} onClick={onClear}>
          {armed ? confirm : t.clear}
        </button>
        <p className={styles.srOnly} aria-live="polite" data-testid="pusher-records-said">
          {said}
        </p>
      </section>
    </div>
  );
};
