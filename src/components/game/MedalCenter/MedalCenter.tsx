'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGameCoverPath } from '../constants/games';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { BonusStrip } from '../MedalPusher/DailyBonus';
import { SCREEN_STACK } from '../MedalPusher/medalLook';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { WELCOME } from './ledger';
import { bank as medalBank, useBank } from './bank';
import { MEDAL_PUSHER_PATH } from './paths';
import { getCenterStrings } from './strings';
import styles from './MedalCenter.module.css';

/** How many digits the bank's counter has: up to 9,999,999 medals. */
export const COUNTER_PLACES = 7;

/**
 * The machines on the floor. The Medal Pusher plays from the bank; the
 * casino games are to come onto it, each in a PR of its own, and are shown
 * as not open yet.
 */
export const FLOOR: readonly { id: string; path: string | null }[] = [
  { id: 'medal-pusher', path: MEDAL_PUSHER_PATH },
  { id: 'slot-machine', path: null },
  { id: 'roulette', path: '/games/roulette' },
  { id: 'blackjack', path: null },
  { id: 'video-poker', path: null },
  { id: 'baccarat', path: null },
  { id: 'craps', path: null },
  { id: 'three-card-poker', path: null },
];

/** A stack of medals, in the same silver as the medals on the machines. */
const MedalStack = ({ count }: { count: number }) => (
  <svg className={styles.stack} viewBox="0 0 60 64" aria-hidden focusable="false">
    {Array.from({ length: count }, (_, index) => {
      const y = 54 - index * 6;
      return (
        <g key={index}>
          <ellipse cx="30" cy={y + 3} rx="24" ry="7" fill={SCREEN_STACK.line} />
          <rect x="6" y={y} width="48" height="3" fill={SCREEN_STACK.edge} />
          <ellipse cx="30" cy={y} rx="24" ry="7" fill={index === count - 1 ? SCREEN_STACK.face : SCREEN_STACK.edge} stroke={SCREEN_STACK.line} strokeWidth="1" />
          {index === count - 1 && <ellipse cx="25" cy={y - 2} rx="10" ry="2.5" fill={SCREEN_STACK.shine} opacity="0.75" />}
        </g>
      );
    })}
  </svg>
);

export interface MedalCenterProps {
  /** Where a guest goes to sign in, so that the bank is kept on an account. */
  signInHref?: string;
}

/**
 * The front of the medal center, as a Japanese arcade's medal counter: the
 * medals in the bank on a big LED counter, the daily bonus, the floor of
 * machines that play from the bank, and the one reset.
 */
export const MedalCenter = ({ signInHref }: MedalCenterProps) => {
  const { language } = useGameLanguage();
  const { t: translate } = useTranslation();
  const t = getCenterStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const state = useBank();
  const [announcement, setAnnouncement] = useState('');
  const [confirming, setConfirming] = useState(false);
  const dialogTitle = useId();
  const dialogBody = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const resetRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  // What the bank does on this page is said out loud: a bonus, a refill.
  useEffect(
    () =>
      medalBank().listen((event) => {
        if (event.type === 'bonus') setAnnouncement(t.sayBonus(event.medals));
        else if (event.type === 'refill') setAnnouncement(t.sayRefill(event.medals));
      }),
    [t],
  );

  // The dialog takes the keyboard while it is open: it starts on the safe choice, Escape closes it, and Tab stays in it.
  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirming(false);
      } else if (event.key === 'Tab') {
        const first = cancelRef.current;
        const last = resetRef.current;
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const opener = openerRef.current;
    return () => {
      window.removeEventListener('keydown', onKey);
      // However it is closed, the keyboard goes back to the button that opened it.
      opener?.focus();
    };
  }, [confirming]);

  const closeDialog = () => setConfirming(false);

  const onReset = () => {
    medalBank().reset();
    setAnnouncement(t.sayReset(WELCOME));
    closeDialog();
  };

  const account = state.owner !== null;
  const member = !state.loaded ? t.memberChecking : account ? t.memberAccount : t.memberGuest;

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <Link href="/games" className={styles.back} data-testid="center-games">
          <span aria-hidden>← </span>
          {t.backToGames}
        </Link>

        {/* The sign over the counter. */}
        <header className={styles.sign}>
          <span className={styles.bulbs} aria-hidden />
          <h1 className={styles.signTitle}>
            <span className={styles.signMain} lang="en">
              {t.sign}
            </span>
            <span className={styles.signSub} lang="ja">
              {t.signSub}
            </span>
            <span className={styles.srOnly}>{t.title}</span>
          </h1>
          <span className={styles.bulbs} aria-hidden />
        </header>
        <p className={styles.lead}>{t.lead}</p>

        {/* The counter: the medals held in the bank, on LED digits, and who the bank is for. */}
        <section className={styles.counter} aria-labelledby="center-counter-label" data-testid="center-counter" data-loaded={state.loaded}>
          <div className={styles.counterHead}>
            <h2 id="center-counter-label" className={styles.counterLabel}>
              {t.counterLabel}
            </h2>
            <span className={styles.member} data-testid="center-member" data-owner={account ? 'account' : 'guest'}>
              {member}
            </span>
          </div>
          <div className={styles.counterBody}>
            <MedalStack count={state.balance === 0 ? 1 : Math.min(6, 2 + Math.floor(Math.log10(state.balance + 1)))} />
            <div className={styles.led}>
              <SegmentDisplay value={state.loaded ? state.balance : ''} places={COUNTER_PLACES} />
            </div>
          </div>
          <p className={styles.balance}>
            <strong data-testid="center-balance">{state.loaded ? fmt(state.balance) : '—'}</strong>
            <span className={styles.balanceUnit}>{t.unit}</span>
          </p>
          {state.owed > 0 && (
            <p className={styles.owed} data-testid="center-owed">
              {t.owed(fmt(state.owed))}
            </p>
          )}
          <p className={styles.where} data-testid="center-where" data-where={state.where} data-kept={state.kept}>
            {state.kept ? t.where[state.where] : t.notKept}
            {state.loaded && !account && state.kept && signInHref && (
              <>
                {' '}
                <a className={styles.link} href={signInHref} data-testid="center-sign-in">
                  {t.signInInvite}
                </a>
              </>
            )}
          </p>
          {state.loaded && state.balance === 0 && (
            <button type="button" className={styles.refill} data-testid="center-refill" onClick={() => medalBank().refill()}>
              {t.refill(WELCOME)}
            </button>
          )}
          <p className={styles.notMoney} data-testid="center-not-money">
            {t.notMoney}
          </p>
        </section>

        {/* The daily bonus is the bank's, for every machine: the same stamp card the machines show. */}
        <div className={styles.bonus} data-testid="center-bonus">
          <BonusStrip />
        </div>

        {/* The floor. */}
        <section className={styles.floor} aria-labelledby="center-floor-title">
          <h2 id="center-floor-title" className={styles.sectionTitle}>
            {t.floorTitle}
          </h2>
          <p className={styles.sectionLead}>{t.floorLead}</p>
          <ul className={styles.machines} data-testid="center-machines">
            {FLOOR.filter(({ path }) => path !== null).map(({ id, path }) => {
              const name = translate(`games.${id}.title`);
              return (
                <li key={id} className={styles.machine} data-open="true" data-machine={id}>
                  <div className={styles.cover}>
                    <Image src={getGameCoverPath(id)} alt="" fill sizes="(min-width: 900px) 520px, 92vw" />
                    <span className={styles.lamp} data-open="true">
                      {t.open}
                    </span>
                  </div>
                  <div className={styles.machineText}>
                    <h3 className={styles.machineName}>{name}</h3>
                    <p className={styles.machineNote}>{t.playsFromBank}</p>
                    {path && (
                      <Link href={path} className={styles.play} data-testid={`center-play-${id}`}>
                        {t.play}
                        <span className={styles.srOnly}>: {name}</span>
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {/* The machines still to come onto the floor, shown honestly as not open yet. */}
          <h3 className={styles.soonTitle}>{t.soon}</h3>
          <p className={styles.sectionLead}>{t.soonNote}</p>
          <ul className={styles.soonList} data-testid="center-soon">
            {FLOOR.filter(({ path }) => path === null).map(({ id }) => (
              <li key={id} className={styles.soonMachine} data-open="false" data-machine={id}>
                <div className={styles.soonCover}>
                  <Image src={getGameCoverPath(id)} alt="" fill sizes="(min-width: 900px) 240px, 45vw" />
                </div>
                <span className={styles.soonName}>{translate(`games.${id}.title`)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* The plate by the counter that says how the bank works. */}
        <section className={styles.rules} aria-labelledby="center-rules-title">
          <h2 id="center-rules-title" className={styles.sectionTitle}>
            {t.rulesTitle}
          </h2>
          <ul className={styles.ruleList}>
            {t.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>

        {/* The one reset of the medals, and of every machine with them. It asks first. */}
        <section className={styles.reset} aria-labelledby="center-reset-title">
          <h2 id="center-reset-title" className={styles.sectionTitle}>
            {t.resetTitle}
          </h2>
          <p className={styles.sectionLead}>{t.resetLead}</p>
          <button ref={openerRef} type="button" className={styles.resetButton} data-testid="center-reset" aria-haspopup="dialog" disabled={!state.loaded} onClick={() => setConfirming(true)}>
            {t.resetButton}
          </button>
        </section>
      </div>

      {confirming && (
        <div className={styles.backdrop} onClick={closeDialog}>
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={dialogTitle}
            aria-describedby={dialogBody}
            data-testid="center-reset-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={dialogTitle} className={styles.dialogTitle}>
              {t.resetDialogTitle}
            </h2>
            <p id={dialogBody} className={styles.dialogBody}>
              {t.resetDialogBody(fmt(state.balance), account)}
            </p>
            <p className={styles.dialogKeeps}>{t.resetKeeps}</p>
            <div className={styles.dialogButtons}>
              <button ref={cancelRef} type="button" className={styles.cancel} data-testid="center-reset-cancel" onClick={closeDialog}>
                {t.resetCancel}
              </button>
              <button ref={resetRef} type="button" className={styles.confirm} data-testid="center-reset-confirm" onClick={onReset}>
                {t.resetConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className={styles.srOnly} aria-live="polite" data-testid="center-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default MedalCenter;
