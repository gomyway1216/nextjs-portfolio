'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint, RefillWords } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { lookUp, type Glance } from '../MedalCenter/lookUp';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { CardBack, CardFace, MiniCard } from './Cards';
import { BETS, TOP, analyzeLadder, drawCard, ladderFor, rankOf, ranksFor, suitOf, valueOf, type Bet, type Card, type Guess } from './engine';
import { getStrings, type HighLowStrings } from './i18n';
import { HIGH_LOW_GAME, createTable, inPlay, lostOf, offerOf, overOf, roundId, rungOf, shownOf, wonOf, type RoundRecord, type Table } from './medalTable';
import styles from './HighLow.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the bet (50) and the ladder (2,000). */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 2;
export const LADDER_PLACES = 4;
/** How long a card takes to turn over, and the turned card to slide across onto the left, in ms. */
export const TURN_MS = 560;
export const SLIDE_MS = 340;
/** How long the first card takes to turn face up at START, in ms. */
export const DEAL_MS = 420;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
/** How long the machine stands unplayed before its ladder runs its attract pattern, in ms. */
export const ATTRACT_AFTER = 12_000;
/** A win this big or bigger gets the big fanfare. */
export const BIG_WIN = 200;
const HISTORY_LIMIT = 12;

/** This device's storage for the machine: the game in play, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a game's name, from the browser's crypto: Math.random is the cards' alone. */
const nameRandom = (): number => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  } catch {
    return (Date.now() % 1000) / 1000;
  }
};

const MOTION = '(prefers-reduced-motion: reduce)';
const prefersCalm = (): boolean => window.matchMedia?.(MOTION).matches === true;
const subscribeToMotion = (listener: () => void): (() => void) => {
  const query = window.matchMedia?.(MOTION);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
};

/**
 * What the cards are doing on the screen: at rest, the first card turning up at START, the next card turning over
 * after a guess (`turn`), or a right guess's card sliding across to be the card to guess from (`slide`).
 */
type Show = 'rest' | 'deal' | 'turn' | 'slide';

interface Ended {
  id: string;
  bet: number;
  rung: number;
  won: number;
  top: boolean;
}

interface SessionStats {
  games: number;
  played: number;
  won: number;
  tops: number;
  highest: number;
}
const EMPTY_STATS: SessionStats = { games: 0, played: 0, won: 0, tops: 0, highest: 0 };

/** Whether two records are the same game at the same point. */
const sameState = (a: RoundRecord | null, b: RoundRecord | null): boolean =>
  a === b || (a !== null && b !== null && a.id === b.id && a.cards.length === b.cards.length && a.taken === b.taken);

/** A card face up or down, in a slot, turning over when told to. */
function CardSlot({ card, up, turning, slide, label, testId, calm }: { card: Card | null; up: boolean; turning: boolean; slide?: boolean; label: string; testId: string; calm: boolean }) {
  return (
    <div className={styles.slot} data-testid={testId} data-card={card ?? ''} data-up={up ? 'true' : 'false'} data-turning={turning ? 'true' : 'false'} data-slide={slide ? 'true' : 'false'} role="img" aria-label={label}>
      <span className={styles.shadow} aria-hidden="true" />
      <span className={styles.flipper} data-calm={calm ? 'true' : 'false'}>
        <span className={styles.cardSide}>
          <CardBack />
        </span>
        <span className={`${styles.cardSide} ${styles.cardFront}`}>{card !== null && <CardFace card={card} />}</span>
      </span>
    </div>
  );
}

/** The ladder: twelve rungs from the first right guess at the bottom to the top, each with what it pays on the bet. */
function Ladder({ bet, lit, state, fresh, attract, t }: { bet: number; lit: number; state: 'idle' | 'play' | 'lost' | 'won'; fresh: number; attract: boolean; t: HighLowStrings }) {
  const pays = ladderFor(bet);
  return (
    <ol className={styles.ladder} aria-label={t.ladderLabel} data-testid="hl-ladder" data-lit={lit} data-state={state} data-attract={attract ? 'true' : 'false'}>
      {pays
        .map((medals, i) => ({ rung: i + 1, medals }))
        .reverse()
        .map(({ rung, medals }) => {
          const on = rung <= lit;
          return (
            <li
              key={rung}
              className={styles.rung}
              data-rung={rung}
              data-on={on ? 'true' : 'false'}
              data-next={state === 'play' && rung === lit + 1 ? 'true' : 'false'}
              data-fresh={on && rung === lit && fresh > 0 ? 'true' : 'false'}
              data-top={rung === TOP ? 'true' : 'false'}
              style={{ '--i': TOP - rung } as CSSProperties}
              aria-label={t.rungAria(rung, medals, on)}
            >
              {/* The top's number is its star: its name is in its label, and in the Odds tab's ladder. */}
              <span className={styles.rungNo} aria-hidden="true">
                {rung === TOP ? '★' : rung}
              </span>
              <span className={styles.rungLamp} aria-hidden="true" />
              {/* In plain digits, as a lamp panel prints them: 2000 fits the narrowest ladder where 2,000 did not. */}
              <span className={styles.rungPays} aria-hidden="true">
                {medals}
              </span>
            </li>
          );
        })}
    </ol>
  );
}

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The machine: the ladder, the two cards, the counters and the buttons. What happens to the medals is the table's
 * (medalTable.ts); this draws each card in the press that turns it, and shows it turning over.
 */
export const PlayTab = ({ player = GUEST, active = true }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

  const bankState = useBank();
  const mine = bankState.loaded && player.settled && bankState.owner === player.uid;
  const here = bankState.card === 'here';
  const calm = useSyncExternalStore(subscribeToMotion, prefersCalm, () => false);

  const [bet, setBetState] = useState<Bet>(BETS[0]);
  const betRef = useRef<Bet>(BETS[0]);
  const setBet = useCallback((next: Bet) => {
    betRef.current = next;
    setBetState(next);
  }, []);
  const [record, setRecordState] = useState<RoundRecord | null>(null);
  const recordRef = useRef<RoundRecord | null>(null);
  const setRecord = useCallback((next: RoundRecord | null) => {
    recordRef.current = next;
    setRecordState(next);
  }, []);
  const [show, setShowState] = useState<Show>('rest');
  const showRef = useRef<Show>('rest');
  const setShow = useCallback((next: Show) => {
    showRef.current = next;
    setShowState(next);
  }, []);
  // The rung that has just lit, to flash it: counted up each time one does.
  const [fresh, setFresh] = useState(0);
  // The game's end, as this page shows it: whether it was shown here (not found ended on a reload).
  const [earlier, setEarlier] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [history, setHistory] = useState<Ended[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  // The top's medals, paid in the press, kept off the counter until its card has turned on the screen.
  const [hiddenWin, setHiddenWin] = useState(0);
  const [attract, setAttract] = useState(false);
  const [touched, setTouched] = useState(0);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const timers = useRef<number[]>([]);
  const finishRef = useRef<(() => void) | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const playRef = useRef<HTMLDivElement | null>(null);
  const glance = useRef<Glance | null>(null);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);

  const sound = useMachineSound();
  const { play, tick } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance - hiddenWin) : null;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  const later = (run: () => void, ms: number) => {
    timers.current.push(window.setTimeout(run, ms));
  };
  useEffect(() => () => clearTimers(), []);

  const animating = show !== 'rest';
  const playing = record !== null && (inPlay(record) || animating);
  const canPress = mine && here && !animating;

  /** A game has ended on this page: it goes into the history and the visit's figures. */
  const ended = useCallback((done: RoundRecord) => {
    const won = wonOf(done);
    const rung = rungOf(done);
    const top = rung >= TOP;
    setHistory((before) => (before.some((entry) => entry.id === done.id) ? before : [{ id: done.id, bet: done.bet, rung, won, top }, ...before].slice(0, HISTORY_LIMIT)));
    setStats((s) => ({ games: s.games + 1, played: s.played + done.bet, won: s.won + won, tops: s.tops + (top ? 1 : 0), highest: Math.max(s.highest, rung) }));
  }, []);

  /** Ends whatever the cards are doing at once: the card turned, the slide done, the counters told. */
  const finish = useCallback(() => {
    clearTimers();
    const step = finishRef.current;
    finishRef.current = null;
    step?.();
  }, []);

  /** After a guess has been written down: the next card turns over, and what it meant is shown as it lands. */
  const showGuess = useCallback(
    (next: RoundRecord, outcome: 'right' | 'top' | 'lost') => {
      const words = live.current.t;
      setRecord(next);
      setResumed(false);
      setEarlier(false);
      setMessage('');
      setShow('turn');
      play('card');
      const turned = shownOf(next);
      const land = () => {
        if (outcome === 'lost') {
          setAnnouncement(words.status.lost(rankOf(turned), rankOf(next.cards[next.cards.length - 2]) === rankOf(turned)));
          setShow('rest');
          ended(next);
          return;
        }
        setFresh((n) => n + 1);
        if (outcome === 'top') {
          payMedals();
          setHiddenWin(0);
          play('big', 0.05);
          setAnnouncement(words.status.top(wonOf(next)));
          setShow('rest');
          ended(next);
          return;
        }
        play('rung');
        setAnnouncement(words.sayRight(rankOf(turned), rungOf(next), offerOf(next)));
        // The card just turned slides across: it is the card to guess from now.
        setShow('slide');
        finishRef.current = () => setShow('rest');
        if (live.current.calm) finish();
        else later(finish, SLIDE_MS);
      };
      finishRef.current = land;
      if (live.current.calm) finish();
      else later(finish, TURN_MS);
    },
    [ended, finish, payMedals, play, setRecord, setShow],
  );

  /** START: the bet goes in and the first card, drawn here in the press, turns face up. */
  const start = (from?: HTMLElement | null) => {
    if (!canPressRef.current || (recordRef.current && inPlay(recordRef.current))) return;
    const card = drawCard(Math.random);
    const amount = betRef.current;
    const outcome = table.current?.start(amount, card) ?? { kind: 'away' as const };
    if (outcome.kind === 'inPlay') {
      setRecord(outcome.record);
      return;
    }
    if (outcome.kind !== 'started') {
      setMessage(outcome.kind === 'unsaved' ? live.current.t.unsaved : live.current.t.notEnough);
      return;
    }
    setMessage('');
    setAttract(false);
    setResumed(false);
    setEarlier(false);
    setHiddenWin(0);
    setRecord(outcome.record);
    for (let i = 0; i < Math.min(amount / 5, 6); i++) play('medal', i * 0.06);
    play('card', 0.2);
    setAnnouncement(live.current.t.sayStart(amount, rankOf(card)));
    glance.current?.drop();
    glance.current = lookUp(playRef.current, from ?? null);
    setShow('deal');
    finishRef.current = () => setShow('rest');
    if (live.current.calm) finish();
    else later(finish, DEAL_MS);
  };

  /** HIGH or LOW: the next card is drawn here, in the press, and written down before it is shown. */
  const guess = (side: Guess) => {
    const current = recordRef.current;
    if (!canPressRef.current || !current || !inPlay(current)) return;
    const card = drawCard(Math.random);
    const outcome = table.current?.guess(current.id, side, card) ?? { kind: 'away' as const };
    if (outcome.kind === 'unsaved') {
      setMessage(live.current.t.unsaved);
      return;
    }
    if (outcome.kind === 'away') return;
    if (outcome.kind === 'gone') {
      // Played on in another tab, or thrown away: what the medals hold now is shown.
      syncNow.current?.();
      return;
    }
    play('button');
    if (outcome.kind === 'top') setHiddenWin(outcome.won);
    showGuess(outcome.record, outcome.kind);
  };

  /** TAKE: what the rung lit shows comes into the medals, counted up. */
  const take = () => {
    const current = recordRef.current;
    if (!canPressRef.current || !current || !inPlay(current) || rungOf(current) < 1) return;
    payMedals();
    const outcome = table.current?.take(current.id) ?? { kind: 'away' as const };
    if (outcome.kind === 'unsaved') {
      setMessage(live.current.t.unsaved);
      return;
    }
    if (outcome.kind !== 'taken') {
      if (outcome.kind === 'gone') syncNow.current?.();
      return;
    }
    setMessage('');
    setRecord(outcome.record);
    setEarlier(false);
    setFresh(0);
    play(outcome.won >= BIG_WIN ? 'big' : 'win', 0.02);
    setAnnouncement(live.current.t.status.taken(outcome.won));
    ended(outcome.record);
  };

  const skip = () => {
    if (showRef.current !== 'rest') finish();
  };

  const canPressRef = useRef(canPress);
  useEffect(() => {
    canPressRef.current = canPress;
  }, [canPress]);

  /** The medals have been reset at the medal center: the machine starts over. */
  const startOver = useCallback(
    (said: boolean) => {
      clearTimers();
      finishRef.current = null;
      setShow('rest');
      setRecord(null);
      setHiddenWin(0);
      setHistory([]);
      setStats(EMPTY_STATS);
      setMessage('');
      setResumed(false);
      // The game in play went with the medals it was bet from (it no longer belongs to the medals on the table).
      medalBank().restarted(HIGH_LOW_GAME);
      if (said) setAnnouncement(live.current.t.sayRestart);
    },
    [setRecord, setShow],
  );

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. A game in play needs nothing done as the card goes: it is written down, and waits.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => roundId(Date.now(), nameRandom),
    });
    const placed = purse.sit(HIGH_LOW_GAME, { granted: () => undefined, yielding: () => undefined });
    seat.current = placed;

    let syncing = false;
    let again = false;
    const sync = () => {
      if (syncing) {
        again = true;
        return;
      }
      syncing = true;
      try {
        do {
          again = false;
          const tab = table.current;
          const { player: who } = live.current;
          const state = purse.getState();
          if (!tab || !placed.holding() || !state.loaded || !who.settled || state.owner !== who.uid) break;
          if (tab.restartIfDue()) startOver(false);
          // A card still turning on the screen is this page's own game: it is left to land.
          if (showRef.current !== 'rest') break;
          const now = tab.read();
          const shown = recordRef.current;
          if (sameState(now, shown)) break;
          setRecord(now);
          setFresh(0);
          setHiddenWin(0);
          if (now) setBet(now.bet);
          if (now && inPlay(now)) {
            // A game begun before this page opened (or played on in another tab): the same card and rung, waiting.
            setResumed(true);
            setEarlier(false);
            setAnnouncement(live.current.t.sayResumed);
          } else {
            setResumed(false);
            setEarlier(now !== null);
          }
        } while (again);
      } finally {
        syncing = false;
      }
    };
    syncNow.current = sync;
    const unsubscribe = purse.subscribe(sync);
    const unlisten = purse.listen((event) => {
      if (event.type === 'reset') startOver(true);
      else if (event.type === 'refill') setAnnouncement(live.current.t.sayRefill(event.medals));
    });
    return () => {
      unlisten();
      unsubscribe();
      placed.leave();
      if (seat.current === placed) seat.current = null;
      if (syncNow.current === sync) syncNow.current = null;
      table.current = null;
    };
  }, [setBet, setRecord, startOver]);

  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // A game that has ended no longer needs the view held up at the cards.
  useEffect(() => {
    if (record && overOf(record) && show === 'rest') glance.current?.drop();
  }, [record, show]);

  // The attract lights: a machine left standing with no game runs them, as cabinets on a real floor do, until the next press.
  useEffect(() => {
    if (playing || !active) return;
    const timer = window.setTimeout(() => setAttract(true), ATTRACT_AFTER);
    return () => window.clearTimeout(timer);
  }, [playing, active, touched, record]);

  // While the medals are in another tab's game, the machine says so, a moment after.
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = mine && (bankState.card === 'away' || (bankState.card === 'asking' && longWait));
  const outOfMedals = mine && here && !playing && bankState.balance === 0;
  const refillDue = outOfMedals && bankState.out.length === 0;

  const cycleBet = () => {
    if (playing) return;
    const at = BETS.indexOf(betRef.current);
    setBet(BETS[(at + 1) % BETS.length]);
    play('button');
  };

  // On a desktop: H high, L low, T take, Space or Enter starts (or skips a card turning), S skips, B changes the bet.
  useMachineKeys(active, (key) => {
    if (key === 'h') guess('high');
    else if (key === 'l') guess('low');
    else if (key === 't') take();
    else if (key === 's') skip();
    else if (key === 'b') cycleBet();
    else if (key === ' ' || key === 'Enter') {
      if (showRef.current !== 'rest') skip();
      else if (!recordRef.current || !inPlay(recordRef.current)) start(null);
      else return false;
    } else return false;
    return true;
  });

  // ── What is on the screen ──
  const n = record?.cards.length ?? 0;
  // While a card turns, everything but the card itself still shows the game as it was before it: the ladder, the
  // buttons and their chances, the counters and the words. Nothing gives the card away before it is face up.
  const view: RoundRecord | null = record && show === 'turn' ? { ...record, cards: record.cards.slice(0, -1), guesses: record.guesses.slice(0, -1), taken: false } : record;
  const lost = view !== null && lostOf(view);
  const top = view !== null && !lost && rungOf(view) >= TOP;
  const over = view !== null && overOf(view);
  const rungNow = view ? rungOf(view) : 0;
  const lit = rungNow;
  const open = view !== null && inPlay(view);
  // The pair a game was decided by stays up once it has ended on a guess; otherwise the card to guess from is on the left.
  const pairUp = record !== null && (show === 'turn' || show === 'slide' || (over && (lost || top)));
  const leftCard: Card | null = record ? (pairUp ? record.cards[n - 2] : record.cards[n - 1]) : null;
  const rightCard: Card | null = record && pairUp ? record.cards[n - 1] : null;
  const pastCards = record ? record.cards.slice(0, Math.max(0, pairUp ? n - 2 : n - 1)) : [];
  const chances = view && open ? ranksFor(rankOf(shownOf(view))) : null;
  const offer = view ? (over ? wonOf(view) : offerOf(view)) : 0;
  const takeable = view !== null && open && rungNow > 0;
  const ladderState: 'idle' | 'play' | 'lost' | 'won' = !view ? 'idle' : lost ? 'lost' : over ? 'won' : 'play';

  const statusText = (() => {
    if (!view) return outOfMedals ? t.outOfMedals : t.status.idle;
    if (show === 'turn' || show === 'deal') return t.status.turning;
    const m = view.cards.length;
    if (lost) return t.status.lost(rankOf(view.cards[m - 1]), rankOf(view.cards[m - 2]) === rankOf(view.cards[m - 1]));
    if (top) return t.status.top(wonOf(view));
    if (over) return t.status.taken(wonOf(view));
    const rank = rankOf(shownOf(view));
    return rungNow === 0 ? t.status.first(rank) : t.status.climbing(rungNow, offerOf(view), rank);
  })();
  const banner = (() => {
    if (!view || earlier || show === 'turn' || show === 'deal') return null;
    if (lost) return { kind: 'lost', text: t.banner.lost };
    if (top) return { kind: 'top', text: t.banner.top };
    if (over) return { kind: 'won', text: t.banner.taken(wonOf(view)) };
    if (show === 'slide') return { kind: 'right', text: t.banner.right };
    return null;
  })();
  const shownBet = record && (inPlay(record) || animating) ? record.bet : bet;
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  const net = stats.won - stats.played;
  const best = valueOf(analyzeLadder().best);
  const leftLabel = leftCard === null || show === 'deal' ? (leftCard === null ? t.noCard : t.faceDown) : t.cardName(rankOf(leftCard), suitOf(leftCard));
  const rightLabel = rightCard === null || show === 'turn' ? t.faceDown : t.cardName(rankOf(rightCard), suitOf(rightCard));

  return (
    <div
      className={styles.machine}
      data-testid="hl-machine"
      data-show={show}
      data-playable={mine && here ? 'true' : 'false'}
      data-card={bankState.card}
      data-state={!view ? 'idle' : !over ? 'play' : lost ? 'lost' : top ? 'top' : 'taken'}
      data-rung={rungNow}
      data-won={view && over ? wonOf(view) : ''}
      data-round={record?.id ?? ''}
      onPointerDown={() => {
        setAttract(false);
        setTouched((count) => count + 1);
      }}
    >
      <div className={styles.cabinet}>
        <div className={styles.marquee} aria-hidden="true" data-chase={animating || attract ? 'true' : 'false'}>
          <span className={styles.marqueeSuits}>♠♥</span>
          <span className={styles.marqueeText}>
            <span className={styles.marqueeMain}>{t.sign}</span>
            <span className={styles.marqueeSub}>{t.signSub}</span>
          </span>
          <span className={styles.marqueeSuits}>♦♣</span>
        </div>

        <div className={styles.play} ref={playRef}>
          <div className={styles.table}>
            <Ladder bet={shownBet} lit={lit} state={ladderState} fresh={fresh} attract={attract && !playing} t={t} />
            {/* The cards, with skip by a tap on them while one turns. */}
            <div className={styles.cards} onClick={skip} data-testid="hl-cards">
              <div className={styles.past} aria-label={t.pastCards} role="list" data-testid="hl-past">
                {pastCards.map((card, i) => (
                  <span key={`${i}-${card}`} role="listitem" aria-label={t.cardName(rankOf(card), suitOf(card))}>
                    <MiniCard card={card} />
                  </span>
                ))}
              </div>
              <div className={styles.pair}>
                <CardSlot card={leftCard} up={leftCard !== null} turning={show === 'deal'} label={leftLabel} testId="hl-card" calm={calm} />
                <CardSlot
                  card={rightCard}
                  up={rightCard !== null}
                  turning={show === 'turn'}
                  slide={show === 'slide'}
                  label={rightLabel}
                  testId="hl-next"
                  calm={calm}
                />
              </div>
              <div className={styles.slotNames} aria-hidden="true">
                <span>{t.nowCard}</span>
                <span>{t.nextCard}</span>
              </div>
              {/* Words over the cards, always there and only shown when they have something to say: nothing moves when they do. */}
              <span className={styles.banner} data-testid="hl-banner" data-show={banner ? 'true' : 'false'} data-kind={banner?.kind ?? ''} aria-hidden="true">
                {banner?.text ?? ''}
              </span>
              {(resumed || earlier) && record && (
                <span className={styles.resumedBadge} data-testid="hl-resumed">
                  {t.resumed}
                </span>
              )}
            </div>
          </div>

          <p className={styles.status} data-testid="hl-status">
            {statusText}
          </p>

          {/* The medals, the bet and what the ladder shows, on LED counters. The numbers are in type beside them. */}
          <div className={styles.meters}>
            <div className={`${styles.meterCell} ${styles.meterMedals}`}>
              <span className={styles.meterLabel}>{t.medals}</span>
              <span className={styles.meterValue} data-testid="hl-medals" data-loaded={medalsShown !== null}>
                {medalsShown === null ? '—' : fmt(medalsShown)}
              </span>
              <span className={styles.led} data-testid="hl-medals-led" data-shown={meter.shown ?? ''}>
                <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
              </span>
            </div>
            <div className={styles.meterCell}>
              <span className={styles.meterLabel}>{t.bet}</span>
              <span className={styles.meterValue} data-testid="hl-bet">
                {shownBet}
              </span>
              <span className={styles.led}>
                <SegmentDisplay value={shownBet} places={BET_PLACES} tone="amber" />
              </span>
            </div>
            <div className={`${styles.meterCell} ${view && over && !lost ? styles.meterWin : ''}`}>
              <span className={styles.meterLabel}>{t.ladderMeter}</span>
              <span className={styles.meterValue} data-testid="hl-offer">
                {offer}
              </span>
              <span className={styles.led}>
                <SegmentDisplay value={offer} places={LADDER_PLACES} tone="amber" />
              </span>
            </div>
          </div>

          {/* The buttons: HIGH, LOW and TAKE while a game is played, the bet and START between games, in the same place. */}
          <div className={styles.controls} data-mode={playing ? 'play' : 'bet'}>
            {playing ? (
              <>
                <div className={styles.guesses}>
                  {(['high', 'low'] as const).map((side) => {
                    const ranks = chances ? chances[side] : 0;
                    return (
                      <button
                        key={side}
                        type="button"
                        className={styles.guessButton}
                        data-side={side}
                        data-testid={`hl-${side}`}
                        aria-label={t.guessAria(side, ranks)}
                        disabled={!canPress || !open}
                        onClick={() => guess(side)}
                      >
                        <span className={styles.guessWord}>
                          <span aria-hidden="true">{side === 'high' ? '▲' : '▼'}</span> {side === 'high' ? t.high : t.low}
                        </span>
                        <span className={styles.guessChance}>{chances ? t.chanceOn(ranks) : ' '}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={styles.takeButton}
                  data-testid="hl-take"
                  aria-label={takeable ? t.takeAria(offer) : t.take}
                  disabled={!canPress || !takeable}
                  onClick={take}
                >
                  {takeable ? t.takeAmount(offer) : t.take}
                </button>
              </>
            ) : (
              <>
                <div className={styles.bets} role="radiogroup" aria-label={t.betGroup}>
                  <span className={styles.betsLabel} aria-hidden="true">
                    {t.betGroup}
                  </span>
                  {BETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={bet === value}
                      aria-label={t.betAria(value)}
                      className={styles.betButton}
                      data-testid={`hl-bet-${value}`}
                      onClick={() => {
                        setBet(value);
                        play('button');
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <button type="button" className={styles.startButton} data-testid="hl-start" onClick={(event) => start(event.currentTarget)} disabled={!mine || !here || bankState.balance < bet}>
                  {t.start}
                </button>
              </>
            )}
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="hl-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="hl-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="hl-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <button type="button" className={styles.btn} data-testid="hl-skip" onClick={skip} disabled={!animating}>
            {t.skip}
          </button>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="hl-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="hl-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="hl-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="hl-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="hl-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="hl-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="hl-history-title">
          <h2 id="hl-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="hl-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-won={entry.won > 0 ? 'true' : 'false'} data-top={entry.top ? 'true' : 'false'}>
                  {t.historyEntry(entry.rung, entry.won)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="hl-session-title">
          <h2 id="hl-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.games}</dt>
              <dd data-testid="hl-stat-games">{fmt(stats.games)}</dd>
            </div>
            <div>
              <dt>{t.played}</dt>
              <dd>{fmt(stats.played)}</dd>
            </div>
            <div>
              <dt>{t.won}</dt>
              <dd>{fmt(stats.won)}</dd>
            </div>
            <div>
              <dt>{t.net}</dt>
              <dd className={net >= 0 ? styles.pos : styles.neg}>
                {net > 0 ? '+' : ''}
                {fmt(net)}
              </dd>
            </div>
            <div>
              <dt>{t.tops}</dt>
              <dd>{fmt(stats.tops)}</dd>
            </div>
            <div>
              <dt>{t.highest}</dt>
              <dd>{fmt(stats.highest)}</dd>
            </div>
            <div>
              <dt>{t.cameBack}</dt>
              <dd>{observed === null ? '—' : pct(observed)}</dd>
            </div>
            <div>
              <dt>{t.bestReturn}</dt>
              <dd>{pct(best, 2)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="hl-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
