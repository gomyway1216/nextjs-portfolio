'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank } from '../MedalCenter/bank';
import { REFILL } from '../MedalCenter/ledger';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { FACE_STAR, MEDAL_PAINT } from '../MedalPusher/medalLook';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { rollDice, type BetId } from './engine';
import { crapsTable, mayPlayTable, playTableHere, seatTable, settleTable, tableStore } from './crapsTable';
import { CrapsFelt, type ShownThrow } from './CrapsFelt';
import { BET_SIZES, CRAPS_GAME, lastRoll, onTable, pressAmount, spotLimit, stakeStep, tableKey, type Table, type TableError } from './medalTable';
import { DieFace } from './Dice';
import { getStrings } from './i18n';
import { unlockThrowSounds } from './throwSounds';
import styles from './Craps.module.css';

/** How long the medals may be away for a moment (the hub taking the day's bonus, say) before the table says where they are, in seconds. */
const CARD_WAIT = 1.5;
/** How many digits the medal counter has, and the counter of medals on the table. */
const MEDAL_PLACES = 7;
const TABLE_PLACES = 5;

/** The star struck on every medal of the medal center (medalLook.ts), in a 32-unit view box. */
const STAR = FACE_STAR.map(([x, y]) => `${(16 + x * 15).toFixed(2)},${(16 + y * 15).toFixed(2)}`).join(' ');

/** One of the medal center's medals: copper-nickel with a raised rim and its star. */
const Medal = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
    <circle cx="16" cy="16" r="15" fill={MEDAL_PAINT.face} stroke={MEDAL_PAINT.edge} strokeWidth="1.4" />
    <circle cx="16" cy="16" r="12.2" fill="none" stroke={MEDAL_PAINT.light} strokeWidth="1.6" />
    <circle cx="16.4" cy="16.5" r="12.2" fill="none" stroke={MEDAL_PAINT.rim} strokeWidth="0.8" opacity="0.7" />
    <polygon points={STAR} fill={MEDAL_PAINT.dark} />
  </svg>
);

// ── The note that the table plays with medals now, shown once ───────────────

/** Written once the note has been shown on this device. */
export const NOTICE_KEY = 'craps-medals-note';
/** Whether this page shows the note: decided the first time it is asked, and kept for the page's life. */
let noticeShown: boolean | null = null;
const noticeListeners = new Set<() => void>();
const noticeStore = {
  subscribe: (listener: () => void) => {
    noticeListeners.add(listener);
    return () => noticeListeners.delete(listener);
  },
  snapshot: (): boolean => {
    if (noticeShown === null) {
      try {
        noticeShown = window.localStorage.getItem(NOTICE_KEY) === null;
      } catch {
        // Where nothing can be written down, the note is shown each time: it cannot be known to have been seen.
        noticeShown = true;
      }
    }
    return noticeShown;
  },
  server: (): boolean => false,
  close: () => {
    noticeShown = false;
    for (const listener of [...noticeListeners]) listener();
  },
};

// ── How the dice are thrown: with sound or not, and watched or quick ────────

/** The player's choices for the throw, kept on this device: they belong to it and its speakers, not to the table. */
export const THROW_KEY = 'craps-throw';
interface ThrowChoices {
  sound: boolean;
  quick: boolean;
}
const PLAIN: ThrowChoices = { sound: false, quick: false };
let choices: ThrowChoices | null = null;
const choiceListeners = new Set<() => void>();
const choiceStore = {
  subscribe: (listener: () => void) => {
    choiceListeners.add(listener);
    return () => choiceListeners.delete(listener);
  },
  snapshot: (): ThrowChoices => {
    if (choices === null) {
      try {
        const kept = JSON.parse(window.localStorage.getItem(THROW_KEY) ?? 'null') as unknown;
        const record = typeof kept === 'object' && kept !== null ? (kept as Record<string, unknown>) : {};
        choices = { sound: record.sound === true, quick: record.quick === true };
      } catch {
        choices = PLAIN;
      }
    }
    return choices;
  },
  server: (): ThrowChoices => PLAIN,
  set: (next: Partial<ThrowChoices>) => {
    choices = { ...choiceStore.snapshot(), ...next };
    try {
      window.localStorage.setItem(THROW_KEY, JSON.stringify(choices));
    } catch {
      // Kept for this page only.
    }
    for (const listener of [...choiceListeners]) listener();
  },
};

const prefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The seed a throw kept from before seeds were kept is shown with: the same one every time for the same table. */
const seedOf = (table: Table): number => (table.last?.seed ?? Math.imul(table.stats.rolls + 1, 0x9e3779b1)) >>> 0;

export interface PlayTabProps {
  /** Whether the site knows who is playing. Until it does, no medal is played. */
  settled?: boolean;
}

export const PlayTab = ({ settled = true }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);

  // The medals are the medal center's, and so is the card that lets this table play them (MedalCenter/bank.ts).
  const bankState = useBank();
  // The table as it is kept (medalTable.ts): its bets are medals taken from the player's.
  const table = useSyncExternalStore(tableStore.subscribe, tableStore.snapshot, tableStore.serverSnapshot);
  const noticeOpen = useSyncExternalStore(noticeStore.subscribe, noticeStore.snapshot, noticeStore.server);
  const chosen = useSyncExternalStore(choiceStore.subscribe, choiceStore.snapshot, choiceStore.server);

  const [size, setSize] = useState<number>(BET_SIZES[1]);
  const [rolling, setRolling] = useState(false);
  const [thrown, setThrown] = useState<ShownThrow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // A roll is settled as the dice are thrown, and shown as they land: until then the table as it was is shown, and the
  // medals the roll brought back are kept off the counter.
  const [held, setHeld] = useState<{ table: Table; returned: number } | null>(null);
  const rollingRef = useRef(false);
  const throws = useRef(0);
  const strings = useRef(t);
  useEffect(() => {
    strings.current = t;
  }, [t]);

  // The table's place at the medal center. It asks for the card as it is set up, and plays only while it holds it.
  // Every change to the table is written as it is made, so nothing is left to write when the card goes; when it comes
  // back, the table is read again, as another tab may have played it meanwhile.
  useEffect(() => {
    const purse = medalBank();
    const machine = crapsTable();
    const mine = purse.sit(CRAPS_GAME, {
      granted: () => machine.sync(),
      yielding: () => undefined,
    });
    seatTable(mine);
    const unlisten = purse.listen((event) => {
      if (event.type === 'reset') {
        // A reset at the Medal Game Center: the table is cleared, now if this page may write it, and otherwise as soon as it may.
        if (mayPlayTable()) machine.sync();
        else machine.resetSeen();
        // A roll still in the air belonged to the table before: the cleared table is shown at once.
        setHeld(null);
        if (!rollingRef.current) setThrown(null);
        setMessage(null);
        setAnnouncement(strings.current.sayReset);
      } else if (event.type === 'refill') {
        setAnnouncement(strings.current.sayRefill(event.medals));
      }
    });
    // While another tab plays the table, this one shows it as that tab writes it.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== tableKey(machine.owner())) return;
      if (!mayPlayTable()) machine.sync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unlisten();
      window.removeEventListener('storage', onStorage);
      seatTable(null);
      mine.leave();
    };
  }, []);

  // Whose medals are on the table, and whether they have been read: the table shown is that player's.
  useEffect(() => {
    settleTable(settled);
    crapsTable().sync();
  }, [settled, bankState.loaded, bankState.owner, bankState.where]);

  // The note that the table plays with medals now is written down as seen the first time it is shown.
  useEffect(() => {
    if (!noticeOpen) return;
    try {
      window.localStorage.setItem(NOTICE_KEY, '1');
    } catch {
      // Shown again next time.
    }
  }, [noticeOpen]);

  // While the medals are in another tab's machine, the table says so, a moment after (they go away for a moment
  // whenever another page takes the day's bonus or the like, and nothing need be said of that).
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = bankState.loaded && (bankState.card === 'away' || (bankState.card === 'asking' && longWait));

  const shown = held?.table ?? table;
  const lastRes = useMemo(() => lastRoll(shown), [shown]);
  const point = shown.point;
  const bets = shown.bets;
  const canPlay = bankState.loaded && settled && bankState.where !== 'checking' && bankState.card === 'here' && !rolling;
  const medals = Math.max(0, bankState.balance - (held?.returned ?? 0));
  const staked = onTable(shown);
  const net = shown.stats.net;
  // The dice lie where the last throw left them, a reload or another tab's throw included; before any, in the hand.
  const resting = useMemo<ShownThrow | null>(
    () => (table.last ? { id: -1 - table.stats.rolls, faces: table.last.dice, seed: seedOf(table), mode: 'rest' } : null),
    [table],
  );
  // This page's own throw while it is the table's last; any other (another tab's, or the one before a reload) at rest.
  const onFelt = thrown && thrown.seed === table.last?.seed ? thrown : resting;

  const errorText = (error: TableError, id?: BetId): string => {
    const max = id ? spotLimit(id, table.point, table.bets) : undefined;
    return t.tableError(error, max);
  };

  const press = (id: BetId) => {
    if (rollingRef.current) return;
    const machine = crapsTable();
    machine.sync();
    const now = machine.table();
    const wanted = pressAmount(id, size, now.point, now.bets);
    if ('error' in wanted) {
      setMessage(t.tableError(wanted.error, spotLimit(id, now.point, now.bets)));
      return;
    }
    const done = machine.place(id, wanted.amount);
    if (!done.ok) {
      setMessage(errorText(done.error, id));
      return;
    }
    const step = stakeStep(id, now.point);
    if (wanted.amount < size) setMessage(t.upTo(t.betName[id], spotLimit(id, now.point, now.bets)));
    else if (wanted.amount > size) setMessage(t.stepped(t.betName[id], step));
    else setMessage(null);
  };

  const undo = () => {
    if (rollingRef.current) return;
    const done = crapsTable().undo();
    setMessage(done.ok || done.error === 'nothing' ? null : errorText(done.error));
  };
  const clear = () => {
    if (rollingRef.current) return;
    const done = crapsTable().clear();
    setMessage(done.ok || done.error === 'nothing' ? null : errorText(done.error));
  };
  const takeDown = () => {
    if (rollingRef.current) return;
    const done = crapsTable().takeDown();
    setMessage(done.ok ? null : errorText(done.error));
  };
  const repeat = () => {
    if (rollingRef.current) return;
    const done = crapsTable().repeat();
    setMessage(done.ok ? null : errorText(done.error));
  };

  const roll = () => {
    if (rollingRef.current) return;
    // The roll is drawn first, by the game's own draw; the throw that is shown is then made to land on it.
    const dice = rollDice();
    const seed = Math.floor(Math.random() * 2 ** 32) >>> 0;
    const done = crapsTable().roll(dice, seed);
    if (!done.ok) {
      setMessage(errorText(done.error));
      return;
    }
    const { resolution, before } = done.value;
    if (chosen.sound) void unlockThrowSounds();
    rollingRef.current = true;
    setRolling(true);
    setMessage(null);
    setHeld({ table: before, returned: resolution.returned });
    throws.current += 1;
    setThrown({ id: throws.current, faces: resolution.dice, seed, mode: chosen.quick ? 'quick' : prefersReducedMotion() ? 'calm' : 'animate' });
  };

  const settle = useCallback((id: number) => {
    if (!rollingRef.current || id !== throws.current) return;
    rollingRef.current = false;
    setRolling(false);
    setHeld(null);
  }, []);

  const toggleSound = () => {
    const next = !chosen.sound;
    if (next) void unlockThrowSounds();
    choiceStore.set({ sound: next });
  };

  return (
    <div className={styles.playLayout}>
      {noticeOpen && (
        <section className={styles.notice} aria-labelledby="craps-notice-title" data-testid="craps-notice">
          <Medal className={styles.noticeMedal} />
          <div className={styles.noticeText}>
            <h2 id="craps-notice-title" className={styles.noticeTitle}>
              {t.noticeTitle}
            </h2>
            <p>{t.noticeBody}</p>
            <div className={styles.noticeActions}>
              <Link href={MEDAL_CENTER_PATH} className={styles.noticeLink} data-testid="craps-notice-center">
                {t.noticeLink}
              </Link>
              <button type="button" className={styles.btn} data-testid="craps-notice-close" onClick={noticeStore.close}>
                {t.noticeClose}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* The medal counter, as a medal machine shows it: the player's medals on LED digits, and what is on the table. */}
      <section className={styles.counter} aria-labelledby="craps-counter-label" data-testid="craps-counter" data-loaded={bankState.loaded}>
        <div className={styles.counterMain}>
          <Medal className={styles.counterMedal} />
          <div className={styles.counterBody}>
            <h2 id="craps-counter-label" className={styles.counterLabel}>
              {t.yourMedals}
            </h2>
            <div className={styles.counterLed}>
              <SegmentDisplay value={bankState.loaded ? medals : ''} places={MEDAL_PLACES} />
            </div>
            <p className={styles.counterText}>
              <strong data-testid="craps-medals">{bankState.loaded ? fmt(medals) : '—'}</strong> {t.unit}
            </p>
          </div>
        </div>
        <dl className={styles.counterSide}>
          <div>
            <dt>{t.onTable}</dt>
            <dd>
              <span className={styles.counterSmallLed}>
                <SegmentDisplay value={staked} places={TABLE_PLACES} tone="amber" />
              </span>
              {/* The LEDs are a picture: the number is written for a screen reader. */}
              <span className={styles.srOnly} data-testid="craps-on-table">
                {fmt(staked)}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t.net}</dt>
            <dd className={net > 0 ? styles.pos : net < 0 ? styles.neg : undefined} data-testid="craps-net">
              {net > 0 ? '+' : net < 0 ? '−' : '±'}
              {fmt(Math.abs(net))}
            </dd>
          </div>
        </dl>
        {bankState.loaded && medals === 0 && staked === 0 && bankState.card === 'here' && !rolling && (
          <button type="button" className={styles.refill} data-testid="craps-refill" onClick={() => medalBank().refill()}>
            {t.refill(REFILL)}
          </button>
        )}
        <p className={styles.counterNote} data-testid="craps-not-money">
          {t.notMoney}
        </p>
        <p className={styles.counterNote}>
          {t.centerNote}{' '}
          <Link href={MEDAL_CENTER_PATH} className={styles.inlineLink}>
            {t.centerLink}
          </Link>
        </p>
      </section>

      <div className={styles.tableArea}>
        {/* The table: the layout is where the medals are bet, and the dice are thrown down it. */}
        <CrapsFelt
          bets={bets}
          point={point}
          size={size}
          canPlay={canPlay}
          onPress={press}
          t={t}
          language={language === 'ja' ? 'ja' : 'en'}
          shown={onFelt}
          onSettled={settle}
          sound={chosen.sound}
        />
        <p className={styles.printedNote}>{t.printedNote}</p>

        <div className={styles.callout} aria-live="polite" data-testid="craps-callout">
          {rolling ? (
            <span className={styles.calloutRolling}>{t.rolling}</span>
          ) : lastRes ? (
            <>
              <span className={lastRes.event === 'sevenOut' || lastRes.event === 'craps' ? styles.calloutBad : styles.calloutGood}>
                {t.event(lastRes.event, lastRes.total, lastRes.pointAfter)}
              </span>
              {lastRes.returned > 0 && (
                <span className={styles.calloutWon} data-testid="craps-won">
                  {t.wonMedals(lastRes.returned)}
                </span>
              )}
            </>
          ) : (
            <span>{t.comeOut}</span>
          )}
        </div>

        <div className={styles.controls}>
          <div className={styles.chipRow} role="radiogroup" aria-label={t.betSize}>
            <span className={styles.chipRowLabel} aria-hidden>
              {t.betSize}
            </span>
            {BET_SIZES.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={size === v}
                aria-label={t.betSizeAria(v)}
                onClick={() => setSize(v)}
                disabled={rolling}
                className={styles.betSize}
                data-size={v}
              >
                <Medal className={styles.betSizeMedal} />
                <span className={styles.betSizeValue}>{v}</span>
              </button>
            ))}
          </div>

          <p className={styles.message} role="status" data-testid="craps-message">
            {message ?? (point === null ? t.comeOut : t.pointIs(point))}
          </p>

          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={roll} disabled={!canPlay}>
              {rolling ? t.rolling : t.roll}
            </button>
            <button type="button" className={styles.btn} onClick={undo} disabled={!canPlay}>
              {t.undo}
            </button>
            <button type="button" className={styles.btn} onClick={clear} disabled={!canPlay}>
              {t.clear}
            </button>
            <button type="button" className={styles.btn} onClick={repeat} disabled={!canPlay}>
              {t.repeat}
            </button>
            <button type="button" className={styles.btn} onClick={takeDown} disabled={!canPlay} data-testid="craps-take-down">
              {t.takeDown}
            </button>
          </div>
          <div className={styles.throwChoices}>
            <button type="button" className={styles.toggle} aria-pressed={chosen.sound} onClick={toggleSound} data-testid="craps-sound">
              {chosen.sound ? t.soundOn : t.soundOff}
            </button>
            <button type="button" className={styles.toggle} aria-pressed={chosen.quick} onClick={() => choiceStore.set({ quick: !chosen.quick })} data-testid="craps-quick">
              {t.quickRoll}
            </button>
          </div>
        </div>

        {/* The medals are in a machine in another tab: this table waits, with its bets on it, until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="craps-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="craps-play-here" onClick={playTableHere}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.infoGrid}>
        <div className={styles.panel}>
          {lastRes && !rolling ? (
            <div className={styles.results}>
              <div className={styles.sectionLabel}>{t.rollResults}</div>
              {lastRes.results.length === 0 ? (
                <p className={styles.muted}>{t.noBetsRoll}</p>
              ) : (
                <ul className={styles.resultList}>
                  {lastRes.results.map((r) => (
                    <li key={r.id} data-outcome={r.outcome}>
                      <span>{t.betName[r.id]}</span>
                      <span className={styles.resultAmount}>
                        {r.outcome === 'win' ? `+${fmt(r.profit)}` : r.outcome === 'lose' ? `−${fmt(r.stake)}` : '±0'}{' '}
                        <small>{r.outcome === 'win' ? (r.staysUp ? t.stays : t.won) : r.outcome === 'lose' ? t.lost : t.push}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className={styles.sectionLabel} style={{ marginTop: '0.9rem' }}>
            {t.recentRolls}
          </div>
          <ol className={styles.historyRow} aria-label={t.recentRolls}>
            {shown.history.length === 0 && <li className={styles.muted}>{t.none}</li>}
            {shown.history.map((h, index) => (
              <li key={shown.stats.rolls - index} className={styles.historyItem} data-event={h.event} title={t.diceLabel(h.dice[0], h.dice[1])}>
                <span className={styles.historyDice} aria-hidden="true">
                  <DieFace value={h.dice[0]} className={styles.miniDie} />
                  <DieFace value={h.dice[1]} className={styles.miniDie} />
                </span>
                <span className={styles.historyTotal}>{h.dice[0] + h.dice[1]}</span>
              </li>
            ))}
          </ol>

          <div className={styles.sectionLabel} style={{ marginTop: '0.9rem' }}>
            {t.statsTitle}
          </div>
          <dl className={styles.statList}>
            <div>
              <dt>{t.rolls}</dt>
              <dd>{shown.stats.rolls}</dd>
            </div>
            <div>
              <dt>{t.shooter}</dt>
              <dd>#{shown.stats.shooter}</dd>
            </div>
            <div>
              <dt>{t.handRolls}</dt>
              <dd>{shown.stats.handRolls}</dd>
            </div>
            <div>
              <dt>{t.longestHand}</dt>
              <dd>{shown.stats.longestHand}</dd>
            </div>
            <div>
              <dt>{t.pointsMade}</dt>
              <dd>{shown.stats.pointsMade}</dd>
            </div>
            <div>
              <dt>{t.sevenOuts}</dt>
              <dd>{shown.stats.sevenOuts}</dd>
            </div>
          </dl>
        </div>
        <div className={styles.panel}>
          <ul className={styles.hint}>
            {t.hint.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="craps-announcement">
        {announcement}
      </p>
    </div>
  );
};
