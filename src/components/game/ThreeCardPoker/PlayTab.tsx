'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { REFILL } from '../MedalCenter/ledger';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { NOT_MONEY } from '../MedalCenter/strings';
import { FACE_STAR, MEDAL_PAINT } from '../MedalPusher/medalLook';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { DEALER_HANDS, HAND_COUNT, handOdds, qualifyingHands, strategyOdds } from './analysis';
import {
  HAND_SIZE,
  NO_BETS,
  QUALIFY_SCORE,
  dealRound,
  decide,
  evaluate,
  rankOfValue,
  settle,
  type Bets,
  type Card,
  type Decision,
  type HandValue,
  type Settlement,
} from './engine';
import { HoleCard, PlayingCard, rankLabel } from './Cards';
import { getStrings, type ThreeCardPokerStrings } from './i18n';
import {
  BET_STEPS,
  NOTICE_KEY,
  SPOT_MAX,
  TCP_GAME,
  createTable,
  handStage,
  serializeHand,
  type Refusal,
  type SavedHand,
  type Table,
  type TableMedals,
  type TableStore,
} from './medalTable';
import styles from './ThreeCardPoker.module.css';

/** How many digits the medal counter has, as the Medal Game Center's own. */
export const COUNTER_PLACES = 7;

/** Pacing (ms): each card of the deal, the beat before the player may act, each dealer card turning over, the pause before paying. */
export const TIMING = { card: 220, ready: 500, flip: 380, settle: 600 } as const;

/**
 * How long the table waits for the member's card before it says that the medals are being played in another tab, in
 * seconds. The card is away for a moment whenever another page takes the day's bonus or the like; nothing is said of that.
 */
export const CARD_WAIT = 1.5;

const CARDS_DEALT = 2 * HAND_SIZE;

/** When each of the six cards lands (the player's three, then the dealer's three face down) and when the player may act. */
export function dealSchedule(fast = false): { cards: number[]; ready: number } {
  const step = fast ? 0 : TIMING.card;
  return { cards: Array.from({ length: CARDS_DEALT }, (_, k) => k * step), ready: fast ? 0 : (CARDS_DEALT - 1) * step + TIMING.ready };
}

/** When each dealer card turns over and when the bets are paid. */
export function revealSchedule(fast = false): { flips: number[]; paid: number } {
  const step = fast ? 0 : TIMING.flip;
  return { flips: Array.from({ length: HAND_SIZE }, (_, k) => k * step), paid: fast ? 0 : (HAND_SIZE - 1) * step + TIMING.settle };
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** idle: bets may be placed · dealing: cards coming out · decision: play or fold · revealing: the dealer turns over. */
type Phase = 'idle' | 'dealing' | 'decision' | 'revealing';
type Spot = 'ante' | 'pairPlus';
const SPOTS: readonly Spot[] = ['ante', 'pairPlus'];

interface Round {
  id: number;
  player: Card[];
  dealer: Card[];
  bets: Bets;
  /** Cards on the table so far: the player's three, then the dealer's three face down. */
  dealt: number;
  /** Dealer cards turned face up. */
  revealed: number;
  decision: Decision | null;
  /** Set once the dealer's cards are shown and the bets are paid. */
  settlement: Settlement | null;
}

interface Stats {
  hands: number;
  played: number;
  dealerQualified: number;
  wins: number;
  pushes: number;
  losses: number;
  agreed: number;
  /** The medals this session's hands won, less those they cost. */
  net: number;
}

const EMPTY_STATS: Stats = { hands: 0, played: 0, dealerQualified: 0, wins: 0, pushes: 0, losses: 0, agreed: 0, net: 0 };

const signedCount = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
const signed = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const pct = (p: number, digits = 2) => `${(p * 100).toFixed(digits)}%`;

/** The table as the stored hand has it, with every card dealt; the dealer's are up once the hand has been paid. */
const roundOf = (hand: SavedHand, id: number): Round => ({
  id,
  player: hand.player,
  dealer: hand.dealer,
  bets: hand.bets,
  dealt: CARDS_DEALT,
  revealed: hand.paid ? HAND_SIZE : 0,
  decision: hand.decision,
  settlement: hand.paid && hand.decision ? settle(hand.bets, hand.decision, hand.player, hand.dealer) : null,
});
const sameCards = (round: Round, hand: SavedHand) =>
  [...round.player, ...round.dealer].every((card, i) => {
    const other = i < HAND_SIZE ? hand.player[i] : hand.dealer[i - HAND_SIZE];
    return card.rank === other.rank && card.suit === other.suit;
  });

// ── The notice that the table plays with medals now, shown until it has been read ──

let noticeRead = false;
const noticeHearers = new Set<() => void>();
const hearNotice = (hearer: () => void) => {
  noticeHearers.add(hearer);
  return () => {
    noticeHearers.delete(hearer);
  };
};
/** Whether the notice is still to be read: nothing written down on this device says it has been. */
const noticeDue = (): boolean => {
  if (noticeRead) return false;
  try {
    return window.localStorage.getItem(NOTICE_KEY) === null;
  } catch {
    return true;
  }
};
/** The notice has been read: on this page at once, and on this device from then on where it keeps anything. */
const readNotice = (): void => {
  noticeRead = true;
  try {
    window.localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    // Read on this page; it may be shown again on the next.
  }
  for (const hearer of [...noticeHearers]) hearer();
};

// ── What the table needs of the browser ──

const browserStore: TableStore = {
  read: (key) => window.localStorage.getItem(key),
  write: (key, text) => window.localStorage.setItem(key, text),
  remove: (key) => window.localStorage.removeItem(key),
};

/** The medal center's medals, as this table's seat sees them. */
const medalsFor = (seat: { current: Seat | null }): TableMedals => ({
  holding: () => seat.current?.holding() ?? false,
  ledger: () => {
    const ledger = medalBank().getState().ledger;
    return ledger ? { era: ledger.era, device: ledger.device } : null;
  },
  balance: () => medalBank().balance(),
  apply: (move) => medalBank().apply(move),
  applied: (move) => medalBank().applied(move),
  forget: (game, keep) => medalBank().forget(game, keep),
});

/** A medal of the medal center's own, in its silver: copper-nickel with a raised rim and its star. */
const MedalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden focusable="false">
    <circle cx="16" cy="16" r="15" fill={MEDAL_PAINT.face} stroke={MEDAL_PAINT.edge} strokeWidth="1.4" />
    <circle cx="16" cy="16" r="12.2" fill="none" stroke={MEDAL_PAINT.light} strokeWidth="1.6" />
    <circle cx="16.4" cy="16.5" r="12.2" fill="none" stroke={MEDAL_PAINT.rim} strokeWidth="0.8" opacity="0.7" />
    <polygon points={FACE_STAR.map(([x, y]) => `${(16 + x * 15).toFixed(2)},${(16 + y * 15).toFixed(2)}`).join(' ')} fill={MEDAL_PAINT.dark} />
  </svg>
);

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);

  // The medals are the medal center's (MedalCenter/bank.ts), and so is the card that lets this table bet them.
  const medals = useBank();
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const notice = useSyncExternalStore(hearNotice, noticeDue, () => false);

  const [step, setStep] = useState<number>(BET_STEPS[0]);
  const [bets, setBets] = useState<Bets>(NO_BETS);
  const badgeId = useId();
  const noticeId = useId();
  const counterId = useId();
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState<Round | null>(null);
  // What the table has to say: a bet it cannot take (`warn`), or news of the medals (`info`).
  const [message, setMessage] = useState<{ text: string; tone: 'warn' | 'info' } | null>(null);
  const warn = (text: string) => setMessage({ text, tone: 'warn' });
  const [showHint, setShowHint] = useState(true);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  // Refs mirror state that click handlers and timers must read synchronously.
  const betsRef = useRef<Bets>(NO_BETS);
  const phaseRef = useRef<Phase>('idle');
  const roundRef = useRef<Round | null>(null);
  const statsRef = useRef<Stats>(EMPTY_STATS);
  const undoStack = useRef<{ spot: Spot; amount: number }[]>([]);
  const lastBets = useRef<Bets>(NO_BETS);
  const roundId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Whether the dealer's cards are being turned over, the hand to be paid when they are. */
  const revealing = useRef(false);
  /** The hand this page shows, as text: what it last read from storage or wrote there. */
  const shown = useRef<string | null>(null);
  /** The medals this page last saw: whose they were, and their era, to tell when they have been reset since. */
  const seen = useRef<{ owner: string | null; era: number } | null>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const commitBets = (next: Bets) => {
    betsRef.current = next;
    setBets(next);
  };
  const commitPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const commitRound = (next: Round | null) => {
    roundRef.current = next;
    setRound(next);
  };
  const commitStats = (next: Stats) => {
    statsRef.current = next;
    setStats(next);
  };
  /** Updates the round a timer was scheduled for — a no-op if another round has replaced it. */
  const patchRound = (id: number, patch: (r: Round) => Partial<Round>) => {
    const r = roundRef.current;
    if (r && r.id === id) commitRound({ ...r, ...patch(r) });
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const holding = () => seat.current?.holding() ?? false;

  /** Shows a stored hand as it stands, with nothing acted out: as the page opens, or as another tab left it. */
  const show = (hand: SavedHand | null) => {
    clearTimers();
    revealing.current = false;
    undoStack.current = [];
    shown.current = hand ? serializeHand(hand) : null;
    const stage = handStage(hand);
    if (!hand) {
      commitRound(null);
      commitBets(NO_BETS);
      commitPhase('idle');
      return;
    }
    commitRound(roundOf(hand, ++roundId.current));
    commitBets(stage === 'over' ? NO_BETS : hand.bets);
    commitPhase(stage === 'deciding' ? 'decision' : stage === 'unpaid' ? 'revealing' : 'idle');
  };

  /** A hand has been paid: the dealer's cards are up, what it won is back in the medals, and the table is open again. */
  const finish = (hand: SavedHand, settlement: Settlement) => {
    const r = roundRef.current;
    const id = r && sameCards(r, hand) ? r.id : ++roundId.current;
    shown.current = serializeHand(hand);
    commitBets(NO_BETS);
    commitRound({ ...roundOf(hand, id), revealed: HAND_SIZE, settlement });
    const s = statsRef.current;
    commitStats({
      hands: s.hands + 1,
      played: s.played + (settlement.decision === 'play' ? 1 : 0),
      dealerQualified: s.dealerQualified + (settlement.dealerQualifies ? 1 : 0),
      wins: s.wins + (settlement.net > 0 ? 1 : 0),
      pushes: s.pushes + (settlement.net === 0 ? 1 : 0),
      losses: s.losses + (settlement.net < 0 ? 1 : 0),
      agreed: s.agreed + (decide('optimal', hand.player) === settlement.decision ? 1 : 0),
      net: s.net + settlement.net,
    });
    commitPhase('idle');
  };

  /** Pays the decided hand on the table now, if this page holds the card: otherwise it is paid as soon as it does. */
  const payNow = () => {
    clearTimers();
    revealing.current = false;
    const at = table.current;
    const paid = at?.pay();
    if (paid) finish(paid.hand, paid.settlement);
    // Held, and still not paid: the browser would not write it down as paid. It is paid when it can be.
    else if (at && holding() && handStage(at.open()) === 'unpaid') warn(live.current.t.notKept);
  };

  /** Starts the table over after the medal center's reset: no hand, nothing to rebet, a new session. */
  const startOver = (say: boolean, strings: ThreeCardPokerStrings) => {
    show(null);
    lastBets.current = NO_BETS;
    commitStats(EMPTY_STATS);
    setMessage(say ? { text: strings.sayCenterReset, tone: 'info' } : null);
  };

  /**
   * Brings the table into line with the medals and with storage: after a reset of the medals it starts over, a hand
   * another tab has played since this one last looked is shown as that tab left it, and a decided hand nobody has
   * paid yet is paid, once, by the page that holds the card.
   */
  const sync = (strings: ThreeCardPokerStrings, heardReset = false) => {
    const at = table.current;
    if (!at) return;
    const purse = medalBank();
    const { owner, ledger } = purse.getState();
    // A reset of the medals, heard of or seen in their era, starts this page's table over whoever holds the card: the
    // session and the bets to repeat are this page's own.
    const before = seen.current;
    const reset = heardReset || (before !== null && ledger !== null && before.owner === owner && ledger.era > before.era);
    if (ledger) seen.current = { owner, era: ledger.era };
    if (reset) startOver(true, strings);
    // Storage, and the mark that this device's table has started over, are the business of the page with the card.
    if (holding() && purse.restartDue(TCP_GAME)) {
      at.restart();
      purse.restarted(TCP_GAME);
    }
    const stored = at.open();
    const text = stored ? serializeHand(stored) : null;
    if (text !== shown.current) {
      show(stored);
      if (handStage(stored) === 'deciding') setMessage({ text: strings.resumed, tone: 'info' });
    }
    if (holding() && handStage(stored) === 'unpaid' && !revealing.current) payNow();
  };

  /** The card is about to go elsewhere: a decided hand is paid while it is still here, and a deal being shown is shown at once. */
  const yielding = () => {
    if (handStage(table.current?.open() ?? null) === 'unpaid') payNow();
    if (phaseRef.current === 'dealing') {
      clearTimers();
      const r = roundRef.current;
      if (r) commitRound({ ...r, dealt: CARDS_DEALT });
      commitPhase('decision');
    }
  };

  // What the bank's callbacks reach: this render's functions, with this render's words.
  const live = useRef({ sync, yielding, t });
  useEffect(() => {
    live.current = { sync, yielding, t };
  });

  // The table's place at the medal center. It asks for the member's card as it is set up and bets from the medals while
  // it holds it. What the bank does that the table acts out: a refill taken here, and a reset, here or anywhere, after
  // which the table starts over.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable(medalsFor(seat), browserStore);
    const mine = purse.sit(TCP_GAME, {
      // The bank publishes what it has just read once this returns: the table looks a moment later.
      granted: () => queueMicrotask(() => live.current.sync(live.current.t)),
      yielding: () => live.current.yielding(),
    });
    seat.current = mine;
    const unlisten = purse.listen((event) => {
      if (event.type === 'reset') queueMicrotask(() => live.current.sync(live.current.t, true));
      else if (event.type === 'refill') setMessage({ text: live.current.t.sayRefill(event.medals), tone: 'info' });
    });
    return () => {
      unlisten();
      // The seat is left while this table still holds it: a decided hand still to be paid is paid as the card goes.
      mine.leave();
      if (seat.current === mine) seat.current = null;
    };
  }, []);

  // Whatever the bank on the table is, the hand kept for it is the one shown: when the medals have been read, when a
  // player signs in or out, and after a reset.
  const era = medals.ledger?.era ?? null;
  useEffect(() => {
    if (medals.loaded) live.current.sync(live.current.t);
  }, [medals.loaded, medals.owner, era]);

  // While the card is in another tab, the table says so, a moment after (the card goes away for a moment whenever
  // another page takes the day's bonus or the like, and nothing need be said of that).
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (medals.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [medals.card]);
  const cardAway = medals.card === 'away' || (medals.card === 'asking' && longWait);
  /** Medals may be bet: they have been read, this table holds the card, and a signed-in player's are not still being looked for. */
  const ready = medals.loaded && medals.card === 'here' && medals.where !== 'checking';

  const refused = (why: Refusal, short: string) => {
    if (why === 'short') warn(short);
    else if (why === 'kept') warn(t.notKept);
    else if (why === 'bets') warn(t.spotFull(SPOT_MAX));
    else if (why === 'busy') {
      sync(t);
      warn(t.handBusy);
    } else if (why === 'none' || why === 'decided') sync(t);
  };

  const place = (spot: Spot, amount: number = step): boolean => {
    if (phaseRef.current !== 'idle' || !ready) return false;
    const on = betsRef.current[spot];
    const add = Math.min(amount, SPOT_MAX - on);
    if (add <= 0) {
      warn(t.spotFull(SPOT_MAX));
      return false;
    }
    // Nothing is taken until the deal, but nothing can be bet that is not there.
    if (betsRef.current.ante + betsRef.current.pairPlus + add > medalBank().balance()) {
      warn(t.noFunds);
      return false;
    }
    commitBets({ ...betsRef.current, [spot]: on + add });
    undoStack.current.push({ spot, amount: add });
    if (add < amount) warn(t.spotFull(SPOT_MAX));
    else setMessage(null);
    return true;
  };

  const undo = () => {
    if (phaseRef.current !== 'idle') return;
    const last = undoStack.current.pop();
    if (!last) return;
    commitBets({ ...betsRef.current, [last.spot]: betsRef.current[last.spot] - last.amount });
    setMessage(null);
  };

  const clear = () => {
    while (undoStack.current.length > 0) undo();
  };

  const rebet = () => {
    for (const spot of SPOTS) {
      const missing = lastBets.current[spot] - betsRef.current[spot];
      if (missing > 0) place(spot, missing);
    }
  };

  const deal = () => {
    if (phaseRef.current !== 'idle' || !ready) return;
    const at = table.current;
    const placed = betsRef.current;
    if (!at) return;
    if (placed.ante <= 0) {
      warn(t.needAnte);
      return;
    }
    // The Play bet matches the Ante, so that much has to stay behind.
    if (medalBank().balance() < placed.ante * 2 + placed.pairPlus) {
      warn(t.needPlayFunds(placed.ante));
      return;
    }
    const dealt = at.deal(placed, dealRound());
    if (!dealt.ok) {
      refused(dealt.why, t.noFunds);
      return;
    }
    // A hand has been dealt with medals: the notice that the table plays with them has done its work.
    if (noticeDue()) readNotice();
    const { hand } = dealt;
    shown.current = serializeHand(hand);
    const id = ++roundId.current;
    lastBets.current = { ...placed };
    undoStack.current = [];
    commitPhase('dealing');
    commitRound({ id, player: hand.player, dealer: hand.dealer, bets: { ...placed }, dealt: 0, revealed: 0, decision: null, settlement: null });
    setMessage(null);
    clearTimers();
    const { cards, ready: canAct } = dealSchedule(prefersReducedMotion());
    cards.forEach((ms, k) => later(ms, () => patchRound(id, (r) => ({ dealt: Math.max(r.dealt, k + 1) }))));
    later(canAct, () => {
      if (roundRef.current?.id !== id) return;
      patchRound(id, () => ({ dealt: CARDS_DEALT }));
      commitPhase('decision');
    });
  };

  const act = (decision: Decision) => {
    const r = roundRef.current;
    const at = table.current;
    if (phaseRef.current !== 'decision' || !r || !at || !ready) return;
    const decided = decision === 'play' ? at.play() : at.fold();
    if (!decided.ok) {
      refused(decided.why, t.playShort);
      return;
    }
    shown.current = serializeHand(decided.hand);
    commitPhase('revealing');
    revealing.current = true;
    commitRound({ ...r, decision });
    setMessage(null);
    const { flips, paid } = revealSchedule(prefersReducedMotion());
    flips.forEach((ms, k) => later(ms, () => patchRound(r.id, (cur) => ({ revealed: Math.max(cur.revealed, k + 1) }))));
    later(paid, payNow);
  };

  const idle = phase === 'idle';
  const deciding = phase === 'decision';
  const settled = round?.settlement ?? null;
  const playBet = round && !settled && round.decision === 'play' ? round.bets.ante : 0;
  const onTable = bets.ante + bets.pairPlus + playBet;

  const playerCards = round?.player ?? null;
  const playerShown = round ? Math.min(HAND_SIZE, round.dealt) : 0;
  const dealerShown = round ? Math.max(0, round.dealt - HAND_SIZE) : 0;
  /** The deal has finished: the player can see the whole hand and may act (or already has). */
  const handReady = round !== null && phase !== 'dealing';
  const playerValue = round && playerShown === HAND_SIZE ? evaluate(round.player) : null;
  const dealerValue = round && round.revealed >= HAND_SIZE ? evaluate(round.dealer) : null;
  const handName = (v: HandValue) => t.handName(v.category, rankLabel(rankOfValue(v.tiebreak[0])));

  // The exact value of playing or folding, from the moment the player may act.
  const odds = useMemo(() => (handReady && playerCards ? handOdds(playerCards) : null), [handReady, playerCards]);
  const hintDecision = deciding && round ? decide('optimal', round.player) : null;

  const exactQualify = qualifyingHands() / HAND_COUNT;
  const exactPlayRate = strategyOdds('optimal').playRate;

  const calloutText = !round
    ? t.placeBets
    : settled
      ? t.result(settled.showdown, settled.net)
      : phase === 'dealing'
        ? t.dealing
        : deciding
          ? t.yourMove
          : t.revealing;
  const calloutClass = !settled ? styles.calloutIdle : settled.net > 0 ? styles.calloutWin : settled.net < 0 ? styles.calloutLose : styles.calloutPush;

  const lit = (id: 'ante' | 'play' | 'pairPlus') => settled?.lines.some((l) => l.id === id && l.outcome === 'win') === true;

  const spot = (id: Spot, pays: string, extraClass: string) => (
    <button
      type="button"
      className={`${styles.spot} ${extraClass}`}
      onClick={() => place(id)}
      disabled={!idle || !ready}
      aria-label={t.spotAria(t.lineName[id], pays)}
      // The label names the bet; the medal badge tells screen readers how many medals are on it.
      aria-describedby={bets[id] > 0 ? `${badgeId}-${id}` : undefined}
      data-bet={id}
      data-lit={lit(id) ? 'true' : undefined}
    >
      <span className={styles.spotLabel}>{t.lineName[id]}</span>
      <span className={styles.spotPays}>{pays}</span>
      {bets[id] > 0 && (
        <span id={`${badgeId}-${id}`} className={styles.chipBadge}>
          {bets[id]}
        </span>
      )}
    </button>
  );

  const statRow = (label: string, count: number, exact: number, key: string) => (
    <div key={key}>
      <dt>{label}</dt>
      <dd>
        {count}
        <small>
          {' '}
          {stats.hands > 0 ? pct(count / stats.hands, 1) : '–'} · {pct(exact)}
        </small>
      </dd>
    </div>
  );

  // The bet per press is one choice of three: one tab stop, and the arrow keys move between them, as radio buttons do.
  const stepButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const onStepKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + BET_STEPS.length) % BET_STEPS.length;
    setStep(BET_STEPS[next]);
    stepButtons.current[next]?.focus();
  };

  const refillDue = medals.loaded && medals.balance === 0 && idle && ready && (round === null || settled !== null);

  return (
    <div className={styles.playGrid}>
      {notice && (
        <section className={styles.notice} aria-labelledby={noticeId} data-testid="tcp-medals-notice">
          <h2 id={noticeId} className={styles.noticeTitle}>
            <MedalIcon className={styles.noticeMedal} /> {t.noticeTitle}
          </h2>
          <p className={styles.noticeBody}>{t.noticeBody}</p>
          <div className={styles.noticeActions}>
            <a className={styles.noticeLink} href={MEDAL_CENTER_PATH} data-testid="tcp-notice-center">
              {t.noticeLink}
            </a>
            <button type="button" className={styles.btn} data-testid="tcp-notice-ok" onClick={readNotice}>
              {t.noticeOk}
            </button>
          </div>
        </section>
      )}
      <div className={styles.panel}>
        <div className={styles.table}>
          <div className={styles.shoeBox} aria-hidden="true">
            <span className={styles.shoeCards} />
          </div>

          <div
            className={styles.area}
            data-hand="dealer"
            data-won={settled?.showdown === 'lose' ? 'true' : undefined}
            role="group"
            aria-label={t.dealer}
          >
            <div className={styles.areaHead}>
              <span className={styles.areaName}>{t.dealer}</span>
              {dealerValue && (
                <span className={styles.handBadge} data-testid="dealer-hand" data-qualifies={dealerValue.score >= QUALIFY_SCORE ? 'true' : 'false'}>
                  {handName(dealerValue)} · {dealerValue.score >= QUALIFY_SCORE ? t.qualifies : t.notQualifies}
                </span>
              )}
            </div>
            <div className={styles.cardRow}>
              {round?.dealer
                .slice(0, dealerShown)
                .map((card, i) =>
                  i < round.revealed ? (
                    <PlayingCard key={`${round.id}-d${i}-up`} card={card} flip />
                  ) : (
                    <HoleCard key={`${round.id}-d${i}-down`} label={t.holeCard} />
                  ),
                )}
            </div>
          </div>

          <div className={styles.feltPrint} aria-hidden="true">
            <span className={styles.feltQualify}>{t.feltQualify}</span>
            <span className={styles.feltBonus}>{t.feltBonus}</span>
          </div>

          <div
            className={styles.area}
            data-hand="player"
            data-won={settled && (settled.showdown === 'win' || settled.showdown === 'notQualified') ? 'true' : undefined}
            role="group"
            aria-label={t.you}
          >
            <div className={styles.cardRow}>
              {round?.player.slice(0, playerShown).map((card, i) => <PlayingCard key={`${round.id}-p${i}`} card={card} />)}
            </div>
            <div className={styles.areaHead}>
              <span className={styles.areaName}>{t.you}</span>
              {playerValue && (
                <span className={styles.handBadge} data-testid="player-hand">
                  {handName(playerValue)}
                </span>
              )}
            </div>
          </div>

          {/* The member's card is in a game in another tab: this table stands still until it is played here again. */}
          {cardAway && (
            <div className={styles.cardAway} role="status" data-testid="tcp-card-away">
              <p>{t.cardAway}</p>
              <button type="button" className={styles.cardAwayButton} data-testid="tcp-play-here" onClick={() => seat.current?.play()}>
                {t.playHere}
              </button>
            </div>
          )}
        </div>

        <div className={styles.callout} aria-live="polite" data-testid="tcp-callout">
          <span className={calloutClass}>{calloutText}</span>
        </div>

        {settled && (
          <div className={styles.results}>
            <div className={styles.sectionLabel}>{t.handResults}</div>
            <ul className={styles.resultList} data-testid="tcp-results">
              {settled.lines.map((l) => (
                <li key={l.id} data-line={l.id} data-outcome={l.outcome}>
                  <span>{t.lineName[l.id]}</span>
                  <span className={styles.resultAmount}>
                    {l.outcome === 'win' ? `+${l.profit}` : l.outcome === 'lose' ? `−${l.stake}` : '±0'} <small>{t.outcome[l.outcome]}</small>
                  </span>
                </li>
              ))}
              <li data-line="total" className={styles.resultTotal}>
                <span>{t.handTotal}</span>
                <span className={styles.resultAmount} data-testid="tcp-hand-net">
                  {signedCount(settled.net)}
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        {/* The medal counter: the player's medals on LED digits, as a medal cabinet shows them, and what they are. */}
        <section className={styles.counter} aria-labelledby={counterId} data-testid="tcp-counter" data-loaded={medals.loaded}>
          <div className={styles.counterHead}>
            <MedalIcon className={styles.counterMedal} />
            <h2 id={counterId} className={styles.counterLabel}>
              {t.medals}
            </h2>
            <p className={styles.counterCount}>
              <strong data-testid="tcp-medals">{medals.loaded ? fmt(medals.balance) : '—'}</strong>{' '}
              <span className={styles.counterUnit}>{medals.loaded ? t.medalsUnit : <span className={styles.srOnly}>{t.medalsWaiting}</span>}</span>
            </p>
          </div>
          <div className={styles.counterLed}>
            <SegmentDisplay value={medals.loaded ? medals.balance : ''} places={COUNTER_PLACES} />
          </div>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="tcp-refill" onClick={() => medalBank().refill()}>
              {t.refill(REFILL)}
            </button>
          )}
          <p className={styles.notMoney} data-testid="tcp-not-money">
            {NOT_MONEY[language]}
          </p>
          <p className={styles.counterNote}>
            {t.medalsFrom[0]}
            <a className={styles.counterLink} href={MEDAL_CENTER_PATH} data-testid="tcp-counter-center">
              {t.centerLink}
            </a>
            {t.medalsFrom[1]}
          </p>
        </section>

        <div className={styles.pillRow}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.onTable}</span>
            <span className={styles.pillValue} data-testid="tcp-on-table">
              {onTable}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.net}</span>
            <span className={`${styles.pillValue} ${stats.net > 0 ? styles.pos : stats.net < 0 ? styles.neg : ''}`} data-testid="tcp-net">
              {stats.net === 0 ? '0' : signedCount(stats.net)}
            </span>
          </div>
        </div>

        <div className={styles.chipRow} role="radiogroup" aria-label={t.step}>
          <span className={styles.chipRowLabel}>{t.step}:</span>
          {BET_STEPS.map((v, index) => (
            <button
              key={v}
              ref={(element) => {
                stepButtons.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={step === v}
              aria-label={t.stepAria(v)}
              tabIndex={step === v ? 0 : -1}
              onClick={() => setStep(v)}
              onKeyDown={(event) => onStepKey(event, index)}
              disabled={!idle}
              className={styles.medalStep}
              data-step={v}
            >
              {v}
            </button>
          ))}
        </div>

        <div className={styles.felt}>
          <div className={styles.spotRow}>
            {spot('pairPlus', t.pairPlusPays, styles.pairPlusSpot)}
            {spot('ante', t.antePays, styles.anteSpot)}
            <div className={`${styles.spot} ${styles.playSpot}`} data-bet="play" data-lit={lit('play') ? 'true' : undefined}>
              <span className={styles.spotLabel}>{t.lineName.play}</span>
              <span className={styles.spotPays}>{t.playPays}</span>
              {playBet > 0 && <span className={styles.chipBadge}>{playBet}</span>}
            </div>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="tcp-message" data-tone={message?.tone}>
          {message?.text ?? ''}
        </p>

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={deal} disabled={!idle || !ready}>
            {phase === 'dealing' ? t.dealing : t.deal}
          </button>
          <button type="button" className={styles.btn} onClick={undo} disabled={!idle || !ready}>
            {t.undo}
          </button>
          <button type="button" className={styles.btn} onClick={clear} disabled={!idle || !ready}>
            {t.clear}
          </button>
          <button type="button" className={styles.btn} onClick={rebet} disabled={!idle || !ready}>
            {t.rebet}
          </button>
        </div>

        <div className={styles.actionRow} role="group" aria-label={t.yourMove}>
          {(['play', 'fold'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={styles.actionBtn}
              data-action={d}
              data-hint={showHint && hintDecision === d ? 'true' : undefined}
              onClick={() => act(d)}
              disabled={!deciding || !ready}
            >
              {t[d]}
            </button>
          ))}
        </div>

        <div className={styles.hintRow}>
          <label className={styles.hintToggle}>
            <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
            {t.hintToggle}
          </label>
          {showHint && hintDecision && (
            <span className={styles.hintText} data-testid="tcp-hint" data-decision={hintDecision}>
              {t.hintSays(hintDecision)}
            </span>
          )}
        </div>

        {odds && (
          <section className={styles.evPanel} aria-labelledby="tcp-ev-title" data-testid="tcp-ev">
            <h3 id="tcp-ev-title" className={styles.evTitle}>
              {t.evTitle}
            </h3>
            <ul className={styles.evList}>
              {(['play', 'fold'] as const).map((d) => {
                const ev = d === 'play' ? odds.evPlay : odds.evFold;
                const clamped = Math.max(-2, Math.min(2, ev));
                return (
                  <li key={d} className={styles.evItem} data-ev={d} data-best={odds.best === d ? 'true' : undefined}>
                    <span>{t.decisionName[d]}</span>
                    <span className={styles.evTrack} aria-hidden="true">
                      <span
                        className={styles.evBar}
                        style={{
                          left: `${50 + Math.min(0, clamped) * 25}%`,
                          width: `${Math.abs(clamped) * 25}%`,
                          background: ev >= 0 ? 'var(--tcp-win)' : 'var(--tcp-lose)',
                        }}
                      />
                    </span>
                    <span className={styles.evValue}>{signed(ev, 3)}</span>
                  </li>
                );
              })}
            </ul>
            <p className={styles.note}>{t.evAgainst(DEALER_HANDS.toLocaleString(locale))}</p>
            <dl className={styles.breakdown} data-testid="tcp-ev-breakdown">
              {(
                [
                  ['notQualified', t.evNotQualified],
                  ['win', t.evWin],
                  ['tie', t.evTie],
                  ['lose', t.evLose],
                ] as const
              ).map(([key, label]) => (
                <div key={key} data-case={key}>
                  <dt>{label}</dt>
                  <dd>{pct(odds[key] / DEALER_HANDS)}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.note}>{t.evNote}</p>
          </section>
        )}

        <ul className={styles.hint}>
          {t.hint.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>

        {/* Session stats sit below the controls, so on a phone the table is followed by the buttons. */}
        <div className={styles.sectionLabel} style={{ marginTop: '0.9rem' }}>
          {t.statsTitle} <small className={styles.muted}>({t.observedVsExact})</small>
        </div>
        <dl className={styles.statList} data-testid="tcp-stats">
          <div>
            <dt>{t.hands}</dt>
            <dd>{stats.hands}</dd>
          </div>
          {statRow(t.played, stats.played, exactPlayRate, 'played')}
          {statRow(t.dealerQualified, stats.dealerQualified, exactQualify, 'qualified')}
          <div>
            <dt>{t.winsPushesLosses}</dt>
            <dd>
              {stats.wins} / {stats.pushes} / {stats.losses}
            </dd>
          </div>
          <div>
            <dt>{t.agreement}</dt>
            <dd>{stats.hands > 0 ? `${Math.round((stats.agreed / stats.hands) * 100)}%` : '–'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
};
