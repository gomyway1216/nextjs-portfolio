'use client';

import { useEffect, type CSSProperties } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { CHAIN_GOAL, CHESTS } from './lottery';
import { BONUS_CARD, MANY_MEDALS, WEEK, cardFor, type AchievementId, type BonusCard } from './records';
import { records, useRecords, type RecordsState } from './recordsStore';
import { getRecordStrings, type AchievementNumbers, type RecordStrings } from './recordsStrings';
import { MAX_STOCK } from './session';
import { AchievementStamp, DateStamp, InkPad, useInk } from './Stamps';
import { VIEW } from './view';
import styles from './Records.module.css';

/** How long a stamp's toast stays up, in seconds. */
export const TOAST_SECONDS = 6;

const TOAST_TIME = { '--mp-toast': `${TOAST_SECONDS}s` } as CSSProperties;
/** The track the toast's rail runs in is the shape of the stage, so it is as tall as the stage whatever the width. */
const TOAST_TRACK: CSSProperties = { aspectRatio: `${VIEW.width} / ${VIEW.height}` };

/** The numbers the achievements' conditions quote, from the game's own tables. */
export const ACHIEVEMENT_NUMBERS: AchievementNumbers = { hold: MAX_STOCK, chest: Math.max(...CHESTS), run: CHAIN_GOAL, medals: MANY_MEDALS, days: WEEK };

/** The card as the page can show it now: null until the book has been read. */
const cardOf = ({ book, day }: RecordsState): BonusCard | null => (book && day ? cardFor(book, day) : null);

/** Whether today's bonus can be taken here and now: it is ready, the browser will remember it, and a machine is there to be paid. */
export const canTake = (state: RecordsState, card: BonusCard | null): boolean => card !== null && card.state === 'ready' && state.kept && state.purse;

/** What the card has to say for itself, in a sentence or two. */
export function bonusStatus(t: RecordStrings, state: RecordsState, card: BonusCard | null): string {
  if (!card) return t.bonusWaiting;
  if (!state.kept) return t.bonusNotKept;
  switch (card.state) {
    case 'ready':
      if (!state.purse) return t.bonusNoMachine;
      return `${card.restarted ? `${t.bonusRestarted} ` : ''}${t.bonusReady(card.today, card.medals)}`;
    case 'taken':
      return `${t.bonusTaken(card.medals)} ${card.stamped === BONUS_CARD.length ? t.bonusNewCard(card.next) : t.bonusTomorrow(card.next)}`;
    case 'later':
      return card.nextDay ? t.bonusLater(t.date(card.nextDay), card.next) : t.bonusNoDay;
    case 'off':
      return t.bonusNoDay;
  }
}

/**
 * The day's bonus, beside the cabinet: a small plate that says whether today's
 * stamp is ready and takes it. Until the book has been read it holds its
 * place and says nothing of the day, so the page the server sent and the page
 * in the browser begin the same.
 */
export const BonusStrip = () => <BonusStripView state={useRecords()} />;

/** The plate for a given state of the book. */
export const BonusStripView = ({ state }: { state: RecordsState }) => {
  const { language } = useGameLanguage();
  const t = getRecordStrings(language);
  const ink = useInk();
  const card = cardOf(state);
  const stampedHere = state.claims > 0 && card?.state === 'taken';

  return (
    <section className={styles.strip} aria-label={t.bonusTitle} data-state={card ? (state.kept ? card.state : 'off') : 'waiting'} data-testid="pusher-bonus">
      <InkPad id={ink} />
      <div className={styles.stripText}>
        <div className={styles.stripHead}>
          <span className={styles.stripTitle}>{t.bonusTitle}</span>
          <span className={styles.pips} role="img" aria-label={t.pipsAria(card?.stamped ?? 0, BONUS_CARD.length)} data-testid="pusher-bonus-pips">
            {BONUS_CARD.map((_, index) => (
              <span key={index} className={styles.pip} data-on={index < (card?.stamped ?? 0)} data-today={card?.state === 'ready' && card.today === index + 1} />
            ))}
          </span>
        </div>
        <p className={styles.stripStatus} data-testid="pusher-bonus-status">
          {bonusStatus(t, state, card)}
        </p>
      </div>
      {card && canTake(state, card) ? (
        <button type="button" className={styles.take} data-testid="pusher-bonus-take" onClick={() => records.claimBonus()}>
          {t.bonusTake(card.medals)}
          <span className={styles.srOnly}>{t.bonusTakeMore}</span>
        </button>
      ) : (
        card?.state === 'taken' && (
          <span className={styles.stripStamp}>
            <DateStamp ink={ink} index={card.stamped - 1} day={card.days[card.stamped - 1]} fresh={stampedHere} />
          </span>
        )
      )}
    </section>
  );
};

/** The stamp card itself, on the Records tab: the week's seven squares, what each gives, and the stamps so far. */
export const StampCard = ({ state }: { state: RecordsState }) => {
  const { language } = useGameLanguage();
  const t = getRecordStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const ink = useInk();
  const card = cardOf(state);
  const stampedHere = state.claims > 0 && card?.state === 'taken';

  return (
    <section className={styles.card} aria-label={t.cardTitle} data-state={card ? (state.kept ? card.state : 'off') : 'waiting'} data-testid="pusher-card">
      <InkPad id={ink} />
      <div className={styles.cardHead}>
        <span className={styles.cardBrand} aria-hidden>
          GOLDEN FEVER
        </span>
        <h2 className={styles.cardTitle}>{t.cardTitle}</h2>
      </div>
      <p className={styles.cardLead}>{t.cardLead(BONUS_CARD.length)}</p>
      <ol className={styles.squares} data-testid="pusher-card-squares">
        {BONUS_CARD.map((medals, index) => {
          const square = index + 1;
          const day = card?.days[index];
          const today = card?.state === 'ready' && card.today === square;
          return (
            <li key={square} className={styles.square} data-stamped={day !== undefined} data-today={today} data-last={square === BONUS_CARD.length}>
              <span className={styles.squareDay} aria-hidden>
                {t.dayN(square)}
              </span>
              <span className={styles.squareMedals} aria-hidden>
                {t.medals(medals.toLocaleString(locale))}
              </span>
              {today && (
                <span className={styles.squareToday} aria-hidden>
                  {t.today}
                </span>
              )}
              {day !== undefined && <DateStamp ink={ink} index={index} day={day} fresh={stampedHere && card?.today === square} />}
              <span className={styles.srOnly}>
                {day !== undefined ? t.squareStamped(square, medals, t.date(day)) : today ? t.squareToday(square, medals) : t.squareBlank(square, medals)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.cardAction}>
        {card && canTake(state, card) && (
          <button type="button" className={styles.take} data-testid="pusher-card-take" onClick={() => records.claimBonus()}>
            {t.bonusTake(card.medals)}
            <span className={styles.srOnly}>{t.bonusTakeMore}</span>
          </button>
        )}
        <p className={styles.cardStatus} role="status" data-testid="pusher-card-status">
          {bonusStatus(t, state, card)}
        </p>
      </div>
      <p className={styles.cardNote}>{t.cardNote}</p>
      <p className={styles.cardNote}>{t.clockNote}</p>
    </section>
  );
};

/** A dot on the Records tab while today's bonus is waiting to be taken. */
export const BonusDot = () => <BonusDotView state={useRecords()} />;

export const BonusDotView = ({ state }: { state: RecordsState }) => {
  const card = cardOf(state);
  return card?.state === 'ready' && state.kept ? <span className={styles.dot} aria-hidden data-testid="pusher-bonus-dot" /> : null;
};

/**
 * The toast for a stamp that has just been earned. It hangs at the top of the
 * cabinet, over the sign, and stays at the top of what can be seen of the
 * cabinet when the page is scrolled down: never over the controls. It is read
 * out once, and the cabinet rings for it if the sound is on.
 */
export const AchievementToast = ({ sound }: { sound: boolean }) => {
  const { fresh } = useRecords();
  const id = fresh.length > 0 ? fresh[0] : null;

  useEffect(() => {
    records.setSound(sound);
  }, [sound]);

  // Each toast has its few seconds, and then the next one in the queue has its own.
  useEffect(() => {
    if (id === null) return;
    const timer = window.setTimeout(() => records.shown(id), TOAST_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [id]);

  return <ToastView id={id} />;
};

/** The toast for a given stamp, or its empty place when there is none to show. */
export const ToastView = ({ id }: { id: AchievementId | null }) => {
  const { language } = useGameLanguage();
  const t = getRecordStrings(language);
  const ink = useInk();
  const earned = id === null ? null : t.achievement(ACHIEVEMENT_NUMBERS)[id];
  return (
    <div className={styles.toastAnchor}>
      <InkPad id={ink} />
      <div className={styles.toastTrack} style={TOAST_TRACK}>
        <div className={styles.toastRail}>
          <div className={styles.toastSlot} role="status" data-testid="pusher-toast">
            {id !== null && earned && (
              <div key={id} className={styles.toast} style={TOAST_TIME} data-achievement={id}>
                <span className={styles.toastStamp}>
                  <AchievementStamp ink={ink} index={0} id={id} fresh />
                </span>
                <span className={styles.toastText}>
                  <span className={styles.toastTitle} aria-hidden>
                    {t.toastTitle}
                  </span>
                  <span className={styles.srOnly}>{t.sayStamp(earned.name)}</span>
                  <strong className={styles.toastName} aria-hidden>
                    {earned.name}
                  </strong>
                  <span className={styles.toastHow}>{earned.how}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
