'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { KeysHint } from '../MedalCenter/KeysHint';
import { useCountUp } from '../MedalCenter/countUp';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { REFILL } from '../MedalCenter/ledger';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { NOT_MONEY } from '../MedalCenter/strings';
import { FACE_STAR, MEDAL_PAINT } from '../MedalPusher/medalLook';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { analyzeHand, tablesAsync, tablesReady, type HoldValue } from './analysis';
import {
  HANDS,
  MAX_COINS,
  PAY_TABLES,
  PAY_TABLE_IDS,
  ROYAL_SHORT_PAY,
  cardLabel,
  heldFromMask,
  holdMask,
  payout,
  rankCards,
  type HandRank,
  type PayTable,
  type PayTableId,
} from './engine';
import { CardBack, MiniCard, PlayingCard } from './Cards';
import { getStrings } from './i18n';
import { roundOutcome, type DoubleOutcome } from './doubleUp';
import { canDouble, cardsOf, createMedalPlay, deviceStore, doubleOf, doublePending, serializeHand, wonBy, GAME, type MedalPlay, type SavedHand } from './medals';
import { PRECOMPUTED } from './precomputed';
import styles from './VideoPoker.module.css';

/** Animation pacing (ms): the gap between cards turning over and the pause before the result is shown. */
export const TIMING = { step: 90, flip: 340, settle: 200 } as const;
/** How long the member's card may be away for a moment (the medal center borrowing it) before the machine says it is in another tab, in seconds. */
export const CARD_WAIT = 1.5;
/** How many digits the medal counter has: as many as the medal center's own. */
export const MEDAL_PLACES = 7;
/** The win meter's digits: the most a hand wins is 4,000, and four double-ups make that 64,000. */
export const WIN_PLACES = 5;
const TOP_HOLDS = 5;
/** Holds within this of the best expectation count as the best play. */
const EPS = 1e-9;
const NONE = [false, false, false, false, false];

type Phase = 'idle' | 'dealt' | 'drawn';

interface Stats {
  hands: number;
  wagered: number;
  paid: number;
  /** Hands whose hold could be compared with the exact best play. */
  judged: number;
  best: number;
  /** Expected medals given up by holds other than the best. */
  givenUp: number;
}

export const EMPTY_STATS: Stats = { hands: 0, wagered: 0, paid: 0, judged: 0, best: 0, givenUp: 0 };

/** A finished hold, kept until the analysis tables exist to judge it. */
interface Play {
  hand: number[];
  mask: number;
  pays: PayTable;
  coins: number;
}

/** Whose medals the machine plays with: an account's id, or null for a guest's; and whether the site knows yet who is playing. */
export interface SeatedFor {
  uid: string | null;
  settled: boolean;
}

const GUEST_SEAT: SeatedFor = { uid: null, settled: true };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** The pay table as it applies to a bet: below five medals the royal wins 250 per medal. */
export const effectivePays = (pays: PayTable, coins: number): PayTable =>
  coins < MAX_COINS ? pays.map((p, r) => (r === HANDS.length - 1 ? ROYAL_SHORT_PAY : p)) : pays;

/** Adds a finished hold to the session: whether it was the best play, and what it gave up. */
export const judgePlay = (s: Stats, play: Play): Stats => {
  const values = analyzeHand(play.hand, play.pays);
  const mine = values.find((h) => h.mask === play.mask);
  if (!mine) return s;
  const lost = values[0].ev - mine.ev;
  return { ...s, judged: s.judged + 1, best: s.best + (lost < EPS ? 1 : 0), givenUp: s.givenUp + lost * play.coins };
};

const sameHand = (a: SavedHand | null, b: SavedHand | null): boolean => (a === null || b === null ? a === b : serializeHand(a) === serializeHand(b));

/** The star struck on every medal (medalLook.ts), in the counter medal's view box. */
const COUNTER_STAR = FACE_STAR.map(([x, y]) => `${(16 + x * 15).toFixed(2)},${(16 + y * 15).toFixed(2)}`).join(' ');

/** One of the medals the medal center's machines play with, by the counter: copper-nickel, with its raised rim and its star, as the Medal Pusher draws its own. */
const CounterMedal = () => (
  <svg className={styles.counterMedal} viewBox="0 0 32 32" aria-hidden focusable="false">
    <circle cx="16" cy="16" r="15" fill={MEDAL_PAINT.face} stroke={MEDAL_PAINT.edge} strokeWidth="1.4" />
    <circle cx="16" cy="16" r="12.2" fill="none" stroke={MEDAL_PAINT.light} strokeWidth="1.6" />
    <circle cx="16.4" cy="16.5" r="12.2" fill="none" stroke={MEDAL_PAINT.rim} strokeWidth="0.8" opacity="0.7" />
    <polygon points={COUNTER_STAR} fill={MEDAL_PAINT.dark} />
  </svg>
);

/**
 * The machine. It plays with the player's medals from the medal center
 * (medals.ts says how a bet is taken and a win put back, once each), while
 * this page holds the member's card.
 */
export const PlayTab = ({ seatedFor = GUEST_SEAT, active = true }: { seatedFor?: SeatedFor; active?: boolean } = {}) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);

  const bankState = useBank();
  const [coins, setCoins] = useState(MAX_COINS);
  const [payId, setPayId] = useState<PayTableId>('9/6');
  /** The hand on the machine: as dealt, or as drawn. It is the one kept on this device (medals.ts). */
  const [hand, setHand] = useState<SavedHand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBest, setShowBest] = useState(true);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  /** Changes every deal so each hand's cards mount (and flip) fresh. */
  const [dealNo, setDealNo] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [longWait, setLongWait] = useState(false);
  /**
   * A double-up's picked card still turning over: what it brings back is in the medals already, and is shown (and
   * counted in) once the card is.
   */
  const [reveal, setReveal] = useState<{ back: number; outcome: DoubleOutcome } | null>(null);
  /** Changes with every double-up, so that its cards mount (and flip) fresh. */
  const [doubleNo, setDoubleNo] = useState(0);

  const busyRef = useRef(false);
  const handRef = useRef<SavedHand | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  /** Hands drawn before the tables were ready; judged as soon as they are. */
  const unjudged = useRef<Play[]>([]);
  // The machine's place at the medal center, and its play with the medals.
  const seat = useRef<Seat | null>(null);
  const medals = useRef<MedalPlay | null>(null);

  const commitBusy = (next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  };
  const commitHand = (next: SavedHand | null) => {
    handRef.current = next;
    setHand(next);
  };
  const stopTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current.length = 0;
  };

  /** Whether the medals on the table are the medals of whoever is playing: the site knows who that is, and their medals have been found. */
  const ownMedals = (owner: string | null, loaded: boolean) => loaded && seatedFor.settled && owner === seatedFor.uid;

  /**
   * Shows the hand that is kept on this device for the player whose medals
   * are on the table: the one this page left, or one another tab has dealt or
   * drawn since. After a reset at the medal center the hand is thrown away.
   */
  const resync = () => {
    const play = medals.current;
    const purse = medalBank();
    if (!play || !ownMedals(purse.owner(), purse.getState().loaded)) return;
    if (seat.current?.holding()) play.restartIfDue();
    const reading = play.read();
    // Storage that cannot be read: the page goes on with what it shows.
    if (!reading.ok) return;
    const stored = reading.hand;
    const shown = handRef.current;
    if (sameHand(stored, shown)) return;
    if (!stored) {
      // No hand is kept: one shown as dealt is gone (thrown away by a reset). One shown as drawn stays on show.
      if (shown && !shown.drawn) {
        stopTimers();
        commitBusy(false);
        commitHand(null);
      }
      return;
    }
    stopTimers();
    commitBusy(false);
    setError(null);
    setCoins(stored.coins);
    setPayId(stored.payId);
    commitHand(stored);
    setDealNo((n) => n + 1);
  };

  /** The medal center has been reset: the machine starts over, and the hand on it is gone with the medals it was bet from. */
  const onReset = () => {
    medals.current?.discard();
    medals.current?.restartIfDue();
    stopTimers();
    commitBusy(false);
    commitHand(null);
    setError(null);
    setAnnouncement(t.sayReset);
  };

  // What the bank's events and the card's comings and goings act on: the latest of each, without setting them up again.
  const live = useRef({ resync, onReset, t });
  useEffect(() => {
    live.current = { resync, onReset, t };
  });

  useEffect(() => {
    alive.current = true;
    // Build the analysis tables off the critical path, in small slices.
    const start = setTimeout(() => {
      void tablesAsync().then(() => {
        if (!alive.current) return;
        setReady(true);
        for (const play of unjudged.current.splice(0)) setStats((s) => judgePlay(s, play));
      });
    }, 300);
    const pending = timers.current;
    return () => {
      alive.current = false;
      clearTimeout(start);
      pending.forEach(clearTimeout);
    };
  }, []);

  // The machine's place at the medal center. It asks for the member's card as it is set up, and plays only while it
  // holds it. Everything the machine has is written down as it happens, so it has nothing to write as the card goes;
  // whenever the card comes back, the hand kept on this device is the one shown (another tab may have played it since).
  useEffect(() => {
    const purse = medalBank();
    let mine: Seat | null = null;
    medals.current = createMedalPlay({ bank: purse, holding: () => mine?.holding() ?? false, store: deviceStore });
    mine = purse.sit(GAME, {
      granted: () => queueMicrotask(() => live.current.resync()),
      yielding: () => undefined,
    });
    seat.current = mine;
    const unlisten = purse.listen((event) => {
      if (event.type === 'reset') live.current.onReset();
      else if (event.type === 'refill') setAnnouncement(live.current.t.sayRefill(event.medals));
    });
    return () => {
      unlisten();
      if (seat.current === mine) seat.current = null;
      mine?.leave();
    };
  }, []);

  // The medals on the table change hands (a player signs in, the medals are found, or reset), or the site settles who
  // is playing: the hand kept for them is the one shown. (The card can come before the site knows who is playing, and
  // a hand is not shown until it does.)
  const era = bankState.ledger?.era ?? null;
  const copy = bankState.ledger?.device ?? null;
  useEffect(() => {
    queueMicrotask(() => live.current.resync());
  }, [bankState.loaded, bankState.owner, era, copy, seatedFor.uid, seatedFor.settled]);

  // While the card is in a machine in another tab, the machine says so, a moment after (the medal center borrows the
  // card for a moment whenever it pays the day's bonus or the like, and nothing need be said of that).
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = bankState.card === 'away' || (bankState.card === 'asking' && longWait);
  const mineToPlay = ownMedals(bankState.owner, bankState.loaded);
  const playable = mineToPlay && bankState.card === 'here';

  const phase: Phase = !hand ? 'idle' : hand.drawn ? 'drawn' : 'dealt';
  const cards = hand ? cardsOf(hand) : [];
  const held = hand ? heldFromMask(hand.held) : NONE;
  /** The cards have been drawn and are still turning over: what they won is not shown yet. */
  const revealing = phase === 'drawn' && busy;
  const won = hand && phase === 'drawn' && !revealing ? wonBy(hand) : null;
  const finalRank: HandRank | null = hand && phase === 'drawn' && !revealing ? rankCards(cards) : null;
  // The bet and the pay table on the machine: the hand's while it is being played, and the next hand's once it is over.
  const inPlay = hand !== null && (phase === 'dealt' || revealing);
  const shownCoins = inPlay ? hand.coins : coins;
  // The double-ups of the win (doubleUp.ts): whether one waits for its pick, where the win stands, and the medals on the
  // latest one (what was on offer before it).
  const rounds = hand && phase === 'drawn' ? (hand.doubles ?? []) : [];
  const doubling = hand !== null && doublePending(hand);
  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const lastOutcome = lastRound ? roundOutcome(lastRound) : null;
  const lastStake = hand && rounds.length > 0 ? doubleOf({ ...hand, doubles: rounds.slice(0, -1) }).offer : 0;
  const offer = hand && phase === 'drawn' ? doubleOf(hand).offer : 0;
  const offerOpen = hand !== null && phase === 'drawn' && !revealing && !busy && canDouble(hand);
  // The medals: what the medal center holds, less a win, or what a double-up brings back, that is still being turned over.
  const medalsNow = bankState.loaded ? Math.max(0, bankState.balance - (revealing && hand ? wonBy(hand) : 0) - (reveal?.back ?? 0)) : null;
  // The WIN meter: the win on offer, or, while a double-up waits or its card turns, the medals on it.
  const winShown = !hand || phase !== 'drawn' || revealing ? 0 : doubling || reveal ? lastStake : offer;
  // Once they are, the win runs into the medals on the counter's LEDs, as a machine's credit meter counts it up
  // (countUp.ts); the WIN meter shows the whole win at once.
  // The machine's sound, off until the player switches it on; each medal of a win chirps as it is counted in.
  const sound = useMachineSound();
  const { play: playSound, tick } = sound;
  const medalMeter = useCountUp(medalsNow, tick);
  const { pay: payMedals } = medalMeter;

  /** Every way to play the dealt hand, best first (once the tables are ready), under the rules it was dealt with. */
  const analysis = useMemo<HoldValue[] | null>(
    () => (ready && hand ? analyzeHand(hand.hand, effectivePays(PAY_TABLES[hand.payId], hand.coins)) : null),
    [ready, hand],
  );
  const chosenMask = holdMask(held);
  const chosen = analysis?.find((h) => h.mask === chosenMask) ?? null;
  const best = analysis?.[0] ?? null;
  const bestMask = best?.mask ?? null;
  const pays = PAY_TABLES[inPlay ? hand.payId : payId];

  const startDeal = (bet: number) => {
    const play = medals.current;
    // A hand still dealt is drawn first, and a double-up begun is picked first; a win on offer is the player's already.
    if (busyRef.current || handRef.current?.drawn === false || (handRef.current && doublePending(handRef.current)) || !play || !playable) return;
    if (bet > bankState.balance) {
      setError(t.noMedals);
      return;
    }
    const outcome = play.deal(bet, payId);
    if (outcome.kind === 'away') return;
    if (outcome.kind === 'short' || outcome.kind === 'unsaved') {
      setError(outcome.kind === 'short' ? t.noMedals : t.unsaved);
      return;
    }
    if (outcome.kind === 'inPlay') {
      // Another tab dealt a hand meanwhile: that one is played first, and nothing more was bet.
      resync();
      return;
    }
    setCoins(bet);
    commitHand(outcome.hand);
    setError(null);
    setDealNo((n) => n + 1);
    // The medals go in, and the five cards are dealt.
    for (let i = 0; i < bet; i++) playSound('medal', i * 0.05);
    for (let i = 0; i < 5; i++) playSound('card', 0.2 + (i * TIMING.step) / 1000);
    const wait = prefersReducedMotion() ? 0 : 4 * TIMING.step + TIMING.flip;
    commitBusy(wait > 0);
    if (wait > 0) timers.current.push(setTimeout(() => commitBusy(false), wait));
  };

  const drawNow = () => {
    const play = medals.current;
    const dealt = handRef.current;
    if (busyRef.current || !dealt || dealt.drawn || !play || !playable) return;
    const outcome = play.draw(dealt.id, dealt.held);
    if (outcome.kind === 'away') return;
    if (outcome.kind === 'unsaved') {
      // The hand stays dealt, and nothing is won yet: it is drawn once storage can keep it as drawn.
      setError(t.unsaved);
      return;
    }
    if (outcome.kind === 'gone') {
      // Drawn in another tab, or thrown away by a reset: whatever is kept now is what is shown, and nothing is won here.
      resync();
      return;
    }
    const drawn = outcome.hand;
    const finished: Play = { hand: drawn.hand, mask: drawn.held, pays: effectivePays(PAY_TABLES[drawn.payId], drawn.coins), coins: drawn.coins };
    // Replaced cards turn over left to right, each in its own position. The medals are in already; they are shown once the cards are.
    const lastReplaced = heldFromMask(drawn.held).lastIndexOf(false);
    setError(null);
    commitHand(drawn);
    // The cards drawn turn over left to right, as they are shown.
    heldFromMask(drawn.held).forEach((kept, i) => {
      if (!kept) playSound('card', (i * TIMING.step) / 1000);
    });
    const settle = () => {
      if (outcome.won > 0) {
        payMedals();
        playSound(rankCards(drawn.hand) >= HANDS.indexOf('fourOfAKind') ? 'big' : 'win');
      }
      setStats((s) => ({ ...s, hands: s.hands + 1, wagered: s.wagered + finished.coins, paid: s.paid + outcome.won }));
      // The tables may still be building on the first hands: judge those once they exist.
      if (tablesReady()) setStats((s) => judgePlay(s, finished));
      else unjudged.current.push(finished);
      commitBusy(false);
    };
    const wait = prefersReducedMotion() || lastReplaced < 0 ? 0 : lastReplaced * TIMING.step + TIMING.flip + TIMING.settle;
    if (wait === 0) {
      settle();
      return;
    }
    commitBusy(true);
    timers.current.push(setTimeout(settle, wait));
  };

  /** Holds the cards of `mask`, and notes them with the hand, so that a reload finds them held. */
  const holdCards = (mask: number) => {
    const play = medals.current;
    const dealt = handRef.current;
    if (busyRef.current || !dealt || dealt.drawn || !play || !playable) return;
    const next = play.hold(dealt.id, mask);
    if (next) {
      setError(null);
      commitHand(next);
      playSound('hold');
    } else if (!play.read().ok) setError(t.unsaved);
    else resync();
  };

  const toggle = (i: number) => {
    const dealt = handRef.current;
    if (dealt) holdCards(dealt.held ^ (1 << i));
  };

  /** Puts the win on offer on a double-up: its medals go out, and the dealer's card is turned face up (medals.ts). */
  const startDouble = () => {
    const play = medals.current;
    const won = handRef.current;
    if (busyRef.current || !won || !play || !playable || !canDouble(won)) return;
    const outcome = play.doubleUp(won.id);
    if (outcome.kind === 'away') return;
    if (outcome.kind === 'unsaved' || outcome.kind === 'short') {
      setError(t.unsaved);
      return;
    }
    if (outcome.kind === 'gone') {
      resync();
      return;
    }
    setError(null);
    commitHand(outcome.hand);
    setDoubleNo((n) => n + 1);
    const dealer = outcome.hand.doubles![outcome.hand.doubles!.length - 1].dealer;
    playSound('button');
    playSound('card', 0.12);
    setAnnouncement(t.sayDouble(fmt(outcome.stake), cardLabel(dealer)));
    const wait = prefersReducedMotion() ? 0 : TIMING.flip;
    commitBusy(wait > 0);
    if (wait > 0) timers.current.push(setTimeout(() => commitBusy(false), wait));
  };

  /** Picks face-down card `index` of the double-up waiting: it turns over, and what it brings back goes into the medals. */
  const pickCard = (index: number) => {
    const play = medals.current;
    const waiting = handRef.current;
    if (busyRef.current || !waiting || !play || !playable || !doublePending(waiting)) return;
    const outcome = play.pick(waiting.id, index);
    if (outcome.kind === 'away') return;
    if (outcome.kind === 'unsaved') {
      setError(t.unsaved);
      return;
    }
    if (outcome.kind === 'gone') {
      resync();
      return;
    }
    setError(null);
    commitHand(outcome.hand);
    const round = outcome.hand.doubles![outcome.hand.doubles!.length - 1];
    playSound('card');
    const settle = () => {
      setReveal(null);
      if (outcome.back > 0) payMedals();
      if (outcome.outcome === 'win') playSound(outcome.offer >= 1000 ? 'big' : 'win');
      else if (outcome.outcome === 'push') playSound('hold');
      setStats((s) => ({ ...s, wagered: s.wagered + outcome.stake, paid: s.paid + outcome.back }));
      const said =
        outcome.outcome === 'win' ? t.doubleWon(fmt(outcome.offer)) : outcome.outcome === 'push' ? t.doublePush(fmt(outcome.offer)) : t.doubleLost(fmt(outcome.stake));
      setAnnouncement(t.sayPicked(cardLabel(round.cards![index]), cardLabel(round.dealer), said));
      commitBusy(false);
    };
    if (prefersReducedMotion()) {
      settle();
      return;
    }
    setReveal({ back: outcome.back, outcome: outcome.outcome });
    commitBusy(true);
    timers.current.push(setTimeout(settle, TIMING.flip + TIMING.settle));
  };

  /** Takes the win on offer: no more double-ups for it. The medals are the player's already; nothing moves. */
  const takeWin = () => {
    const play = medals.current;
    const won = handRef.current;
    if (busyRef.current || !won || !play || !playable || !canDouble(won)) return;
    const taken = play.take(won.id);
    if (!taken) {
      resync();
      return;
    }
    commitHand(taken);
    playSound('button');
    setAnnouncement(t.doubleTaken(fmt(doubleOf(taken).offer)));
  };

  const betOne = () => {
    if (busyRef.current || phase === 'dealt') return;
    setCoins((c) => (c >= MAX_COINS ? 1 : c + 1));
    setError(null);
    playSound('button');
  };

  const onRefill = () => {
    if (playable) medalBank().refill();
  };

  // The row to light up: the final hand, or a hand already made on the deal.
  const dealtRank = hand && (phase === 'dealt' || revealing) ? rankCards(hand.hand) : 0;
  const litRank = finalRank ?? dealtRank;
  const message =
    !mineToPlay && phase === 'idle'
      ? { text: t.findingMedals, tone: 'idle' }
      : error
        ? { text: error, tone: 'error' }
        : phase === 'idle'
          ? { text: t.pressDeal, tone: 'idle' }
          : phase === 'dealt' || revealing
            ? { text: t.chooseHolds(shownCoins), tone: 'idle' }
            : doubling || reveal
              ? { text: t.doublePick(fmt(lastStake)), tone: 'idle' }
              : hand?.taken
                ? { text: t.doubleTaken(fmt(offer)), tone: 'win' }
                : lastOutcome === 'win'
                  ? { text: t.doubleWon(fmt(offer)), tone: 'win' }
                  : lastOutcome === 'push'
                    ? { text: t.doublePush(fmt(offer)), tone: 'win' }
                    : lastOutcome === 'lose'
                      ? { text: t.doubleLost(fmt(lastStake)), tone: 'idle' }
                      : won !== null && won > 0 && finalRank !== null
                        ? { text: t.resultWin(t.hand[HANDS[finalRank]], won, fmt(won)), tone: 'win' }
                        : { text: t.resultLose, tone: 'idle' };
  const canChange = phase !== 'dealt' && !busy;
  const net = stats.paid - stats.wagered;

  // On a desktop: 1–5 hold the cards, Space or Enter deals and draws, B bets one more, M bets the most and deals.
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') {
      if (phase === 'dealt') drawNow();
      else if (!doubling) startDeal(coins);
      return true;
    }
    if (/^[1-5]$/.test(key)) {
      if (phase === 'dealt' && !busy && playable) toggle(Number(key) - 1);
      // While a double-up waits, 1–4 pick one of its four cards.
      else if (doubling && key !== '5') pickCard(Number(key) - 1);
      return true;
    }
    if (key === 'd') {
      startDouble();
      return true;
    }
    if (key === 't') {
      takeWin();
      return true;
    }
    if (key === 'b') {
      if (canChange && playable) betOne();
      return true;
    }
    if (key === 'm') {
      if (canChange && playable) startDeal(MAX_COINS);
      return true;
    }
    return false;
  });
  // No refill while medals are on a double-up: they are the player's, and may come back. Nor while they are out on a
  // round at another machine: the line says where.
  const outOfMedals = bankState.loaded && playable && bankState.balance === 0 && phase !== 'dealt' && !doubling;
  const refillDue = outOfMedals && bankState.out.length === 0;

  const describe = (h: HoldValue) => {
    if (!hand) return null;
    const kept = hand.hand.filter((_, i) => h.mask & (1 << i));
    if (kept.length === 0) return <span>{t.discardAll}</span>;
    return kept.map((c) => <MiniCard key={c} card={c} />);
  };
  const top = analysis ? analysis.slice(0, TOP_HOLDS) : [];
  const listed = chosen && !top.includes(chosen) ? [...top, chosen] : top;
  const scale = best && best.ev > 0 ? best.ev : 1;

  return (
    <div className={styles.playGrid}>
      <div className={styles.machine} data-testid="vp-machine" data-playable={playable ? 'true' : 'false'}>
        <div className={styles.screen}>
          <table className={styles.payTable} data-testid="vp-paytable">
            <caption className={styles.srOnly}>{t.payTableLabel}</caption>
            {/* Read by screen readers only: which bet each column pays for, and which one is selected. */}
            <thead className={styles.payHead}>
              <tr>
                <th scope="col">
                  <span className={styles.srOnly}>{t.colHand}</span>
                </th>
                {[1, 2, 3, 4, 5].map((c) => (
                  <th key={c} scope="col" aria-current={c === shownCoins ? 'true' : undefined}>
                    <span className={styles.srOnly}>{t.coinColumn(c, c === shownCoins)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HANDS.slice(1)
                .map((name, i) => ({ name, rank: i + 1 }))
                .reverse()
                .map(({ name, rank }) => (
                  <tr key={name} className={litRank === rank ? styles.payRow : undefined} data-hand={name} data-lit={litRank === rank ? 'true' : undefined}>
                    <th scope="row">{t.hand[name]}</th>
                    {[1, 2, 3, 4, 5].map((c) => (
                      <td key={c} className={c === shownCoins ? styles.payCol : undefined}>
                        {fmt(payout(rank, pays, c))}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>

          {lastRound ? (
            // A double-up, as a Sigma cabinet lays it out: the dealer's card face up on the left, four face down on the
            // right, one to pick. Once picked, all four are turned over, the one picked marked.
            <div className={styles.cardsRow} data-testid="vp-double" data-outcome={reveal ? 'turning' : (lastOutcome ?? 'waiting')}>
              <span className={`${styles.slot} ${styles.dealerSlot}`}>
                <span className={`${styles.heldTag} ${styles.dealerTag}`}>{t.dealer}</span>
                <span aria-label={t.dealerAria(cardLabel(lastRound.dealer))} role="img" data-testid="vp-dealer">
                  <PlayingCard key={`d${doubleNo}-${lastRound.dealer}`} card={lastRound.dealer} />
                </span>
              </span>
              {[0, 1, 2, 3].map((i) => {
                const card = lastRound.cards?.[i];
                const mine = lastRound.pick === i;
                return (
                  <button
                    key={i}
                    type="button"
                    className={styles.slot}
                    onClick={() => pickCard(i)}
                    disabled={!doubling || busy || !playable}
                    aria-label={card === undefined ? t.pickAria(i + 1) : t.pickedAria(cardLabel(card), mine)}
                    data-pick={i}
                    data-picked={mine ? 'true' : undefined}
                  >
                    <span className={styles.heldTag} data-held={mine ? 'true' : undefined}>
                      {mine ? t.picked : doubling ? String(i + 1) : ''}
                    </span>
                    {card === undefined ? (
                      <CardBack label={t.cardBack} />
                    ) : (
                      <PlayingCard key={`p${doubleNo}-${card}`} card={card} delay={mine ? 0 : TIMING.step * 2} />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
          <div className={styles.cardsRow}>
            {[0, 1, 2, 3, 4].map((i) => {
              const card = cards[i] as number | undefined;
              const isHeld = held[i] && phase !== 'idle';
              const suggested = showBest && phase === 'dealt' && bestMask !== null && (bestMask & (1 << i)) !== 0;
              return (
                <button
                  key={i}
                  type="button"
                  className={styles.slot}
                  onClick={() => toggle(i)}
                  disabled={phase !== 'dealt' || busy || !playable}
                  aria-pressed={isHeld}
                  aria-label={card === undefined ? t.cardBack : t.holdAria(cardLabel(card), isHeld)}
                  data-slot={i}
                  data-best={suggested ? 'true' : undefined}
                >
                  <span className={styles.heldTag} data-held={isHeld ? 'true' : undefined}>
                    {isHeld ? t.held : suggested ? t.hold : ''}
                  </span>
                  {card === undefined ? (
                    <CardBack label={t.cardBack} />
                  ) : (
                    <PlayingCard key={`${dealNo}-${card}`} card={card} delay={phase === 'dealt' ? i * TIMING.step : 0} />
                  )}
                </button>
              );
            })}
          </div>
          )}

          <p className={styles.message} role="status" data-tone={message.tone} data-testid="vp-message">
            {message.text}
          </p>

          {/* The member's card is in a machine in another tab: this one waits until it is played here again. */}
          {cardAway && (
            <div className={styles.cardAway} role="status" data-testid="vp-card-away">
              <p>{t.cardAway}</p>
              <button type="button" className={styles.cardAwayButton} data-testid="vp-play-here" onClick={() => seat.current?.play()}>
                {t.playHere}
              </button>
            </div>
          )}
        </div>

        {/* The meters, on LED digits as a machine shows them. The numbers are in type too, for whoever reads the page. */}
        <div className={styles.meters}>
          <div className={`${styles.meter} ${styles.meterMedals}`} data-testid="vp-medal-counter">
            <span className={styles.meterLabel}>
              <CounterMedal />
              {t.medals}
            </span>
            <strong className={`${styles.srOnly} ${styles.meterNumber}`} data-testid="vp-medals" data-loaded={bankState.loaded ? 'true' : 'false'}>
              {medalsNow === null ? '—' : fmt(medalsNow)}
            </strong>
            <span className={styles.meterLed} data-testid="vp-medals-led" data-shown={medalMeter.shown ?? ''}>
              <SegmentDisplay value={medalMeter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <strong className={`${styles.srOnly} ${styles.meterNumber}`} data-testid="vp-bet">
              {shownCoins}
            </strong>
            <span className={styles.meterLed}>
              <SegmentDisplay value={shownCoins} places={1} tone="amber" />
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.win}</span>
            <strong className={`${styles.srOnly} ${styles.meterNumber}`} data-testid="vp-win">
              {fmt(winShown)}
            </strong>
            <span className={styles.meterLed}>
              <SegmentDisplay value={winShown} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>
        <p className={styles.notMoney} data-testid="vp-not-money">
          {NOT_MONEY[language]}
        </p>

        {/* DOUBLE UP and TAKE, always on the cabinet and lit while a win may be doubled up; the next DEAL takes it too. */}
        <div className={styles.doubleRow}>
          <button type="button" className={`${styles.machineBtn} ${styles.doubleBtn}`} onClick={startDouble} disabled={!offerOpen || !playable} data-testid="vp-double-up" aria-keyshortcuts="D">
            {t.doubleUp}
          </button>
          <button type="button" className={`${styles.machineBtn} ${styles.takeBtn}`} onClick={takeWin} disabled={!offerOpen || !playable} data-testid="vp-take" aria-keyshortcuts="T">
            {t.take}
          </button>
        </div>
        {/* What may be done with the win, in a line that keeps its place whether it says anything or not. */}
        <div className={styles.offerSlot}>
          {offerOpen && (
            <p className={styles.offerLine} data-testid="vp-offer">
              {t.doubleOffer(fmt(offer), doubleOf(hand).left)}
            </p>
          )}
        </div>

        <div className={styles.controls}>
          <button type="button" className={styles.machineBtn} onClick={betOne} disabled={!canChange || !playable}>
            {t.betOne}
          </button>
          <button type="button" className={styles.machineBtn} onClick={() => startDeal(MAX_COINS)} disabled={!canChange || doubling || !playable}>
            {t.betMax}
          </button>
          {phase === 'dealt' ? (
            <button type="button" className={`${styles.machineBtn} ${styles.dealBtn}`} onClick={drawNow} disabled={busy || !playable}>
              {t.draw}
            </button>
          ) : (
            <button type="button" className={`${styles.machineBtn} ${styles.dealBtn}`} onClick={() => startDeal(coins)} disabled={busy || doubling || !playable}>
              {t.deal}
            </button>
          )}
        </div>
        {refillDue && (
          <button type="button" className={styles.refill} data-testid="vp-refill" onClick={onRefill}>
            {t.refill(REFILL)}
          </button>
        )}
        {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="vp-out" />}
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="vp-keys" />

        <div className={styles.settingsRow}>
          <label htmlFor="vp-paytable-select">{t.payTableLabel}</label>
          <select id="vp-paytable-select" className={styles.select} value={payId} onChange={(e) => setPayId(e.target.value as PayTableId)} disabled={!canChange}>
            {PAY_TABLE_IDS.map((id) => (
              <option key={id} value={id}>
                {t.payTableOption(id, `${(PRECOMPUTED[id].payback * 100).toFixed(2)}%`)}
              </option>
            ))}
          </select>
          <SoundSwitch control={sound} language={language} className={`${styles.machineBtn} ${styles.soundSwitch}`} testId="vp-sound" />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.toggleRow}>
          <h3 className={styles.blockTitle} style={{ margin: 0 }}>
            {t.bestTitle}
          </h3>
          <label className={styles.toggle}>
            <input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} />
            {t.bestToggle}
          </label>
        </div>

        {phase === 'idle' ? (
          <p className={styles.muted}>{t.pressDeal}</p>
        ) : !analysis ? (
          <p className={styles.muted} data-testid="vp-calculating">
            {t.calculating}
          </p>
        ) : showBest || phase === 'drawn' ? (
          <div data-testid="vp-best">
            <ul className={styles.holdList}>
              {listed.map((h) => (
                <li
                  key={h.mask}
                  className={styles.holdItem}
                  data-best={best && best.ev - h.ev < EPS ? 'true' : undefined}
                  data-yours={h.mask === chosenMask ? 'true' : undefined}
                  data-mask={h.mask}
                >
                  <span className={styles.holdCards}>
                    {describe(h)}
                    {h.mask === chosenMask && <span className={styles.yoursTag}>{t.yourHold}</span>}
                  </span>
                  <span className={styles.evTrack} aria-hidden="true">
                    <span className={styles.evBar} style={{ width: `${Math.max(0, Math.min(1, h.ev / scale)) * 100}%` }} />
                  </span>
                  <span className={styles.evValue}>
                    {h.ev.toFixed(3)} {t.evUnit}
                  </span>
                </li>
              ))}
            </ul>
            {/* Judge the hold once it is final, not while the player is still choosing. */}
            {phase === 'drawn' && !revealing && chosen && best && (
              <p className={styles.verdict} data-good={best.ev - chosen.ev < EPS ? 'true' : 'false'} data-testid="vp-verdict">
                {best.ev - chosen.ev < EPS ? t.perfect : t.mistake((best.ev - chosen.ev).toFixed(3))}
              </p>
            )}
            {phase === 'dealt' && best && (
              <button type="button" className={styles.btn} style={{ marginTop: '0.6rem' }} onClick={() => holdCards(best.mask)} disabled={busy || !playable}>
                {t.holdBest}
              </button>
            )}
            <p className={styles.note}>{t.bestNote}</p>
          </div>
        ) : null}

        <div className={styles.sectionLabel} style={{ marginTop: '1rem' }}>
          {t.statsTitle}
        </div>
        <dl className={styles.statList} data-testid="vp-stats">
          <div>
            <dt>{t.statHands}</dt>
            <dd>{fmt(stats.hands)}</dd>
          </div>
          <div>
            <dt>{t.net}</dt>
            <dd data-testid="vp-net">
              {net > 0 ? '+' : net < 0 ? '−' : ''}
              {fmt(Math.abs(net))}
            </dd>
          </div>
          <div>
            <dt>{t.statReturn}</dt>
            <dd>{stats.wagered > 0 ? `${((stats.paid / stats.wagered) * 100).toFixed(1)}%` : '–'}</dd>
          </div>
          <div>
            <dt>{t.statPerfect}</dt>
            <dd>{stats.judged > 0 ? `${stats.best} / ${stats.judged}` : '–'}</dd>
          </div>
          <div>
            <dt>{t.statMistakeCost}</dt>
            <dd data-testid="vp-given-up">{stats.judged > 0 ? stats.givenUp.toFixed(2) : '–'}</dd>
          </div>
        </dl>

        <ul className={styles.hint}>
          {t.hint.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="vp-announcement">
        {announcement}
      </p>
    </div>
  );
};
