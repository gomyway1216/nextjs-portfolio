'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank } from '../MedalCenter/bank';
import { REFILL } from '../MedalCenter/ledger';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { betOdds, exactOdds, oddsBetFor, shoeOdds } from './analysis';
import {
  BET_IDS,
  DEFAULT_DECKS,
  PAYS,
  betAvailable,
  cardsInHand,
  createShoe,
  dealHand,
  dealOrder,
  fullShoeCounts,
  handTotal,
  isDragon7,
  isPanda8,
  settleBet,
  shoeFinished,
  totalOnTable,
  unseenCounts,
  type BetId,
  type BetResult,
  type Bets,
  type Card,
  type Hand,
  type Mode,
  type RoadEntry,
  type Side,
} from './engine';
import {
  BET_STEPS,
  NEW_TABLE,
  NOTICE_KEY,
  SPOT_MAX,
  TABLE_KEY,
  afterCoup,
  browserStore,
  createMedalTable,
  medalsBack,
  parseTable,
  pressAmount,
  refusal,
  serializeTable,
  stepFor,
  tableTakes,
  type MedalTable,
  type Refusal,
  type Stats,
  type TableState,
} from './medals';
import { playTableSound, unlockTableSounds, useSoundSwitch, type TableSound } from '../common/tableSounds';
import { usePayoutCount, type Payout } from '../common/usePayoutCount';
import { MedalCounter, MedalIcon, MedalStack } from './MedalCounter';
import { PlayingCard, cardLabel } from './Cards';
import { BeadPlate, BigRoad } from './Roads';
import { getStrings } from './i18n';
import styles from './Baccarat.module.css';

/**
 * Deal pacing: a card every CARD_MS, an extra beat before each third card, then settle. The result is called once the
 * last card has turned face up and its total is showing (0.46 s into its slide, then 0.18 s to appear: `totalLate`).
 */
const CARD_MS = 340;
const THIRD_CARD_PAUSE_MS = 360;
const SETTLE_MS = 680;

/**
 * How long the table waits for the card before it says that it is in another tab, in seconds. The card is away for
 * a moment whenever another page takes the day's bonus or the like; nothing is said of that. (As the Medal Pusher.)
 */
export const CARD_WAIT = 1.5;

export function revealSchedule(cards: number): { reveal: number[]; settle: number } {
  const reveal = Array.from({ length: cards }, (_, k) => k * CARD_MS + Math.max(0, k - 3) * THIRD_CARD_PAUSE_MS);
  return { reveal, settle: reveal[cards - 1] + SETTLE_MS };
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Where the sound switch is kept on this device. */
export const SOUND_KEY = 'baccarat-sound';

/** How many medals high a stake is drawn: one for one medal, then one more each time it doubles, up to five. */
export const stackHeight = (medals: number) => Math.max(1, Math.min(5, Math.ceil(Math.log2(medals + 1))));

/** The side bets: a win on one of them, or a natural, gets the bigger fanfare. */
const BIG_WINS: readonly BetId[] = ['tie', 'playerPair', 'bankerPair', 'dragon7', 'panda8'];

/** Who is playing: an account's id, or null for a guest; and whether the site has finished finding out. */
export interface TablePlayer {
  uid: string | null;
  settled: boolean;
}
export const GUEST_PLAYER: TablePlayer = { uid: null, settled: true };

interface Round {
  id: number;
  hand: Hand;
  /** Cards turned over so far, in dealing order. */
  shown: number;
  settled: boolean;
  results: BetResult[];
  mode: Mode;
  /** Medals the hand gives back. */
  returned: number;
  /** Whether they went back before the cards were all turned over (the card was leaving the page). */
  paidEarly: boolean;
}

interface ShoeView {
  number: number;
  hand: number;
  cardsLeft: number;
  burnCard: Card | null;
  burned: number;
  finished: boolean;
}

const NO_SHOE: ShoeView = { number: 0, hand: 0, cardsLeft: 0, burnCard: null, burned: 0, finished: false };

const shoeViewOf = (table: TableState): ShoeView =>
  table.shoe
    ? {
        number: table.shoeNumber,
        hand: table.hand,
        cardsLeft: table.shoe.cards.length - table.shoe.next,
        burnCard: table.shoe.burnCard,
        burned: table.shoe.burned,
        finished: shoeFinished(table.shoe),
      }
    : NO_SHOE;

/** The cards nobody at the table has seen: after the cut card, the next hand comes from a new, unseen shoe. */
const unseenOf = (table: TableState): number[] =>
  table.shoe && !shoeFinished(table.shoe) ? unseenCounts(table.shoe) : fullShoeCounts(table.shoe?.decks ?? DEFAULT_DECKS);

const pct = (p: number, digits = 2) => `${(p * 100).toFixed(digits)}%`;
const paysText = (id: BetId) => `${PAYS[id][0]}:${PAYS[id][1]}`;

export interface PlayTabProps {
  player?: TablePlayer;
}

export const PlayTab = ({ player = GUEST_PLAYER }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);

  // The medals are the player's, from the Medal Game Center (MedalCenter/bank.ts); so is the card that lets this
  // table take and give them.
  const bankState = useBank();
  const [chip, setChip] = useState<number>(NEW_TABLE.chip);
  const [bets, setBets] = useState<Bets>({});
  const [mode, setMode] = useState<Mode>(NEW_TABLE.mode);
  const [dealing, setDealing] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [roads, setRoads] = useState<RoadEntry[]>([]);
  const [stats, setStats] = useState<Stats>(NEW_TABLE.stats);
  const [shoeView, setShoeView] = useState<ShoeView>(NO_SHOE);
  const [unseen, setUnseen] = useState<number[]>(() => fullShoeCounts(DEFAULT_DECKS));
  const [notice, setNotice] = useState(false);
  /** The win being counted out on the counter's windows, if any: a new id for every hand settled on this page. */
  const [payout, setPayout] = useState<Payout | null>(null);
  const [sound, toggleSound] = useSoundSwitch(SOUND_KEY);
  const soundOn = useRef(sound);
  useEffect(() => {
    soundOn.current = sound;
  });
  /** A sound of the table, `delay` ms from now, when the sound is on. */
  const play = (name: TableSound, delay = 0) => {
    if (soundOn.current) playTableSound(name, delay / 1000);
  };
  const counted = usePayoutCount(payout, () => play('payout'));

  // Refs mirror state that click handlers, timers and the bank's calls must read synchronously.
  const betsRef = useRef<Bets>({});
  const modeRef = useRef<Mode>(NEW_TABLE.mode);
  const chipRef = useRef<number>(NEW_TABLE.chip);
  const dealingRef = useRef(false);
  // The table as this device keeps it: as it will stand once the hand being dealt has settled.
  const tableRef = useRef<TableState>(NEW_TABLE);
  // What this page last read or wrote under TABLE_KEY. When the card comes back and storage holds something else, a
  // table in another tab has played since, and its table is the one to carry on with.
  const seenTable = useRef<string | null>(null);
  const undoStack = useRef<{ id: BetId; amount: number }[]>([]);
  const roundId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const medalTable = useRef<MedalTable | null>(null);
  // The felt, which takes the keyboard when the player comes back from another tab (the button they pressed goes).
  const feltRef = useRef<HTMLDivElement | null>(null);
  const store = useMemo(() => (typeof window === 'undefined' ? null : browserStore()), []);
  const live = useRef({ t });

  useEffect(() => {
    live.current = { t };
  });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const commitBets = (next: Bets) => {
    betsRef.current = next;
    setBets(next);
  };
  const commitMode = (next: Mode) => {
    modeRef.current = next;
    setMode(next);
  };
  const commitChip = (next: number) => {
    chipRef.current = next;
    setChip(next);
  };

  /** Writes the table down. Only the page that holds the card does: another tab's table is never written over. */
  const keepTable = (table: TableState) => {
    tableRef.current = table;
    if (!store || !medalTable.current?.holding()) return;
    const text = serializeTable(table);
    if (store.write(TABLE_KEY, text)) seenTable.current = text;
  };

  const stopReveal = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    dealingRef.current = false;
    setDealing(false);
  };

  /** Shows a table as it stands: its shoe, its scoreboards and its last hand, settled. */
  const showTable = (table: TableState) => {
    tableRef.current = table;
    setPayout(null);
    commitMode(table.mode);
    commitChip(table.chip);
    setRoads(table.roads);
    setStats(table.stats);
    setShoeView(shoeViewOf(table));
    setUnseen(unseenOf(table));
    if (table.last) {
      const { results, returned } = medalsBack(table.last.bets, table.last.hand, table.last.mode);
      const id = ++roundId.current;
      setRound({ id, hand: table.last.hand, shown: cardsInHand(table.last.hand), settled: true, results, mode: table.last.mode, returned, paidEarly: false });
    } else {
      setRound(null);
    }
  };

  /** The table starts over (after the Medal Game Center's reset): a new shoe, empty scoreboards, nothing on the felt. */
  const startOver = () => {
    stopReveal();
    commitBets({});
    undoStack.current = [];
    showTable({ ...NEW_TABLE, mode: modeRef.current, chip: chipRef.current });
    keepTable(tableRef.current);
  };

  // The table this device keeps is put out before the card arrives, so the scoreboards are there at once. Nothing is
  // written until the card is here. A table that cannot be read (a newer version's, or damaged) gives a new one.
  useEffect(() => {
    if (!store) return;
    const text = store.read(TABLE_KEY);
    seenTable.current = text;
    const table = parseTable(text);
    // Storage is read only in the browser, after the first drawing matches the server's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (table) showTable(table);
    // Told once that the table plays with the player's medals now.
    if (store.read(NOTICE_KEY) === null) {
      setNotice(true);
      store.write(NOTICE_KEY, '1');
    }
    // Once, on opening: the functions it calls only set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // The table's place at the medal bank. It asks for the card as it opens, and takes and gives medals only while it
  // holds it. As the card goes, a hand in flight is paid first (its cards are decided already).
  useEffect(() => {
    if (!store) return;
    const purse = medalBank();
    const table = createMedalTable(purse, store, {
      granted: (moved) => {
        const { t: strings } = live.current;
        // The Medal Game Center has been reset since this table last started over: it starts over now.
        if (table.restartIfDue()) {
          startOver();
          setMessage(strings.sayRestart);
          return;
        }
        // Another tab's table has played since: its table is the one to carry on with.
        const text = store.read(TABLE_KEY);
        if (moved || text !== seenTable.current) {
          seenTable.current = text;
          stopReveal();
          commitBets({});
          undoStack.current = [];
          showTable(parseTable(text) ?? { ...NEW_TABLE, mode: modeRef.current, chip: chipRef.current });
        }
      },
      yielding: () => {
        // The hand in flight was paid as the card went (medals.ts); its cards go on being turned over here.
      },
      paid: (coup, early) => {
        if (early) setRound((r) => (r && !r.settled ? { ...r, paidEarly: true } : r));
      },
      resumed: (coup, paid) => {
        if (paid) setMessage(live.current.t.sayResumed(coup.returned));
      },
    });
    medalTable.current = table;
    table.sit();
    // A reset at the Medal Game Center, here or in another tab: the table starts over. It is written down as such
    // when this page next holds the card (`restartIfDue` above).
    const unlisten = purse.listen((event) => {
      if (event.type !== 'reset') return;
      startOver();
      setMessage(live.current.t.sayRestart);
    });
    return () => {
      unlisten();
      table.leave();
      if (medalTable.current === table) medalTable.current = null;
    };
    // Once, on opening: the functions it calls read what they need from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // The medals on the table are the player's only once the site knows who is playing, and the bank on the table is
  // theirs. When that changes under a page that holds the card (signing in or out), a hand left unpaid for them is
  // paid, and a reset is caught up with.
  const playable = bankState.loaded && bankState.card === 'here' && player.settled && bankState.owner === player.uid;
  useEffect(() => {
    const table = medalTable.current;
    if (!playable || !table) return;
    table.resume();
    if (table.restartIfDue()) {
      startOver();
      setMessage(live.current.t.sayRestart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playable, bankState.owner]);

  // While the card is in another tab's table, this one says so, a moment after (it is away for a moment whenever the
  // Medal Game Center takes it for the daily bonus or the like, and nothing need be said of that).
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = bankState.card === 'away' || (bankState.card === 'asking' && longWait);

  const say = (why: Refusal, id: BetId) => {
    if (why === 'medals') setMessage(t.noMedals);
    else if (why === 'max') setMessage(t.spotMax(t.betName[id], SPOT_MAX[id]));
    else if (why === 'step') setMessage(t.bankerStep(stepFor(id, modeRef.current)));
  };

  /** Puts medals on a spot. They stay the player's until DEAL: the counter shows them on the felt. */
  const place = (id: BetId, amount: number = pressAmount(id, modeRef.current, chipRef.current)): boolean => {
    if (dealingRef.current || !playable) return false;
    const why = refusal(betsRef.current, id, amount, modeRef.current, medalBank().balance());
    if (why) {
      say(why, id);
      return false;
    }
    commitBets({ ...betsRef.current, [id]: (betsRef.current[id] ?? 0) + amount });
    undoStack.current.push({ id, amount });
    setMessage(null);
    // A bet for the next coup ends the count of the last one's win at once, as on a machine.
    setPayout(null);
    if (soundOn.current) void unlockTableSounds();
    play('medal');
    return true;
  };

  const undo = () => {
    if (dealingRef.current) return;
    const last = undoStack.current.pop();
    if (!last) return;
    const next = { ...betsRef.current };
    const remaining = (next[last.id] ?? 0) - last.amount;
    if (remaining > 0) next[last.id] = remaining;
    else delete next[last.id];
    commitBets(next);
  };

  const clear = () => {
    if (dealingRef.current) return;
    undoStack.current = [];
    commitBets({});
    setMessage(null);
  };

  const rebet = () => {
    for (const [id, amount] of Object.entries(tableRef.current.lastBets) as [BetId, number][]) {
      const missing = amount - (betsRef.current[id] ?? 0);
      if (missing > 0 && betAvailable(id, modeRef.current) && !place(id, missing)) break;
    }
  };

  const switchMode = (next: Mode) => {
    if (next === modeRef.current || dealingRef.current) return;
    if (totalOnTable(betsRef.current) > 0) {
      setMessage(t.modeLocked);
      return;
    }
    commitMode(next);
    keepTable({ ...tableRef.current, mode: next });
    setMessage(null);
  };

  const pickChip = (value: number) => {
    commitChip(value);
    keepTable({ ...tableRef.current, chip: value });
  };

  const deal = () => {
    const table = medalTable.current;
    if (dealingRef.current || !table || !playable) return;
    const placed = betsRef.current;
    const atMode = modeRef.current;
    if (!tableTakes(placed, atMode)) {
      setMessage(t.bankerStep(stepFor('banker', atMode)));
      return;
    }
    const stake = totalOnTable(placed);
    let shoe = tableRef.current.shoe;
    const fresh = shoe === null || shoeFinished(shoe);
    if (fresh) shoe = createShoe(DEFAULT_DECKS);
    const { hand, shoe: after } = dealHand(shoe!);
    const { results, returned } = medalsBack(placed, hand, atMode);
    // The stake is taken and the coup written down in one step; nothing is dealt if the medals are not there.
    const coup = table.deal(stake, returned);
    if (!coup) {
      // Not enough medals; or the card is elsewhere; or, holding it, this browser would not keep the coup written down.
      setMessage(stake > medalBank().balance() ? t.noMedals : table.holding() ? t.notKept : t.cardAway);
      return;
    }
    const before = tableRef.current;
    const next = afterCoup(before, hand, after, fresh, placed, atMode);
    keepTable(next);
    dealingRef.current = true;
    setDealing(true);
    setMessage(null);
    if (fresh) setRoads([]);
    // "Cards left" still shows the count before this hand; it only drops when the hand settles. Dropping it now
    // would give away whether third cards are coming before they are turned over.
    setShoeView((v) => ({
      number: next.shoeNumber,
      hand: next.hand,
      cardsLeft: fresh ? after.cards.length - shoe!.next : v.cardsLeft,
      burnCard: after.burnCard,
      burned: after.burned,
      finished: false,
    }));
    const id = ++roundId.current;
    setRound({ id, hand, shown: 0, settled: false, results, mode: atMode, returned, paidEarly: false });
    setPayout(null);

    const finish = () => {
      // What the hand won goes back now, unless it went back already as the card left the page.
      medalTable.current?.settle(coup.id);
      commitBets({});
      undoStack.current = [];
      setRoads(next.roads);
      setStats(next.stats);
      setUnseen(unseenOf(next));
      setShoeView(shoeViewOf(next));
      setRound((r) => (r && r.id === id ? { ...r, shown: cardsInHand(hand), settled: true } : r));
      dealingRef.current = false;
      setDealing(false);
      // The medals that come back are counted out on the counter, to a fanfare: a bigger one for a natural or a side bet.
      if (returned > 0) setPayout({ id, medals: returned });
      const wins = results.filter((r) => r.outcome === 'win');
      if (wins.length > 0) play(hand.natural || wins.some((r) => BIG_WINS.includes(r.id)) ? 'big' : 'win');
      else play(results.some((r) => r.outcome === 'lose') ? 'lose' : 'medal');
    };

    const count = cardsInHand(hand);
    const { reveal, settle } = prefersReducedMotion() ? { reveal: new Array<number>(count).fill(0), settle: 0 } : revealSchedule(count);
    play('medal');
    // Each card slides out of the shoe as it is turned over; a third card a beat later, with a flick as it lands.
    reveal.forEach((ms, k) => play(k < 4 ? 'card' : 'flip', ms));
    timers.current.forEach(clearTimeout);
    timers.current = reveal.map((ms, k) =>
      setTimeout(() => setRound((r) => (r && r.id === id ? { ...r, shown: Math.max(r.shown, k + 1) } : r)), ms),
    );
    timers.current.push(setTimeout(finish, settle));
  };

  const nextOdds = useMemo(() => exactOdds(unseen), [unseen]);
  const unseenTotal = nextOdds.cards;
  const freshShoe = unseenTotal === DEFAULT_DECKS * 52;
  const exact = shoeOdds(DEFAULT_DECKS);

  const onTable = totalOnTable(bets);
  const settledHand = round?.settled ? round.hand : null;
  // What the last coup did on the felt, shown until a new bet goes down.
  const lastResults = round?.settled && onTable === 0 && !dealing ? round.results : null;
  // The counter shows the medals still in hand: those on the felt are shown in the BET window until the deal takes
  // them, and a hand paid early is not shown before its cards are.
  const hiddenWin = round && !round.settled && round.paidEarly ? round.returned : 0;
  const shownMedals = Math.max(0, bankState.balance - (dealing ? 0 : onTable) - hiddenWin);
  const won = round?.settled ? round.returned : null;

  const handView = (side: Side) => {
    const cards = round ? round.hand[side] : [];
    const order = round ? dealOrder(round.hand)[side] : [];
    const visible = cards.filter((_, i) => order[i] < (round?.shown ?? 0));
    const total = visible.length > 0 ? handTotal(visible) : null;
    const wonSide = settledHand?.winner === side;
    const natural = settledHand?.natural === true && visible.length === 2 && total !== null && total >= 8;
    return (
      <div
        className={styles.handBox}
        data-hand={side}
        data-won={wonSide ? 'true' : undefined}
        role="group"
        aria-label={t.handAria(t.side[side], total)}
      >
        <div className={styles.handHead}>
          <span className={styles.handName}>{t.side[side]}</span>
          {/* The total changes as the card it counts shows its face, not as the card leaves the shoe. */}
          <span key={`${round?.id ?? 0}-${visible.length}`} className={`${styles.handTotal} ${visible.length > 0 ? styles.totalLate : ''}`} data-testid={`${side}-total`}>
            {total ?? '–'}
          </span>
        </div>
        <div className={styles.handCards}>
          {visible.map((card, i) => (
            <PlayingCard key={`${round!.id}-${i}`} card={card} sideways={i === 2} />
          ))}
        </div>
        {natural && <span className={styles.naturalTag}>{t.natural}</span>}
      </div>
    );
  };

  const spot = (id: BetId, pays: string, extraClass = '') => {
    const amount = bets[id] ?? 0;
    const lit = settledHand !== null && settleBet(id, 1, settledHand, round!.mode).outcome === 'win';
    // The last coup stays on the felt until the next bet goes down: a winning stake with the medals paid beside it, a
    // pushed one as it was, a losing one taken away.
    const last = lastResults?.find((r) => r.id === id) ?? null;
    return (
      <button
        key={id}
        type="button"
        className={`${styles.spot} ${extraClass}`}
        onClick={() => place(id)}
        disabled={dealing || !playable}
        aria-label={t.betAria(t.betName[id], pays)}
        data-bet={id}
        data-lit={lit ? 'true' : undefined}
      >
        <span className={styles.spotLabel}>{t.betName[id]}</span>
        <span className={styles.spotPays}>{pays}</span>
        {amount > 0 && (
          <span className={styles.spotStake} data-testid={`stake-${id}`}>
            <MedalStack count={stackHeight(amount)} className={styles.spotStack} />
            <span className={styles.spotCount}>{amount}</span>
          </span>
        )}
        {amount === 0 && last && last.outcome !== 'lose' && (
          <span className={styles.spotStake} aria-hidden="true">
            <MedalStack count={stackHeight(last.stake)} className={styles.spotStack} />
            <span className={styles.spotCount}>{last.stake}</span>
          </span>
        )}
        {amount === 0 && last?.outcome === 'win' && (
          <span className={`${styles.spotStake} ${styles.spotPaid}`} aria-hidden="true" data-testid={`paid-${id}`}>
            <MedalStack count={stackHeight(last.profit)} className={styles.spotStack} />
            <span className={styles.spotCount}>+{last.profit}</span>
          </span>
        )}
      </button>
    );
  };

  const calloutText = () => {
    if (dealing || !round) return dealing ? t.dealing : t.placeBets;
    const h = round.hand;
    const extra = isDragon7(h) ? ` · ${t.dragon7Hit}` : isPanda8(h) ? ` · ${t.panda8Hit}` : '';
    return t.result(h.winner, h.playerTotal, h.bankerTotal, h.natural) + extra;
  };

  const liveRows = BET_IDS.filter((id) => betAvailable(id, mode) && id !== 'bankerPair').map((id) => ({
    id,
    odds: betOdds(oddsBetFor(id, mode), nextOdds),
  }));

  const statRow = (label: string, n: number, exactP: number, key: string) => (
    <div key={key}>
      <dt>{label}</dt>
      <dd>
        {n}
        <small>
          {' '}
          {stats.hands > 0 ? pct(n / stats.hands, 1) : '–'} · {pct(exactP)}
        </small>
      </dd>
    </div>
  );

  const busy = dealing || !playable;
  const outOfMedals = bankState.loaded && playable && !dealing && bankState.balance === 0 && onTable === 0;

  return (
    <div>
      {notice && (
        <aside className={styles.notice} aria-labelledby="baccarat-notice-title" data-testid="baccarat-notice">
          <MedalIcon className={styles.noticeMedal} />
          <div className={styles.noticeText}>
            <h3 id="baccarat-notice-title" className={styles.noticeTitle}>
              {t.noticeTitle}
            </h3>
            <p>
              {t.noticeBody}{' '}
              <a className={styles.link} href={MEDAL_CENTER_PATH}>
                {t.centerLink}
              </a>
            </p>
          </div>
          <button type="button" className={styles.btn} onClick={() => setNotice(false)} data-testid="baccarat-notice-ok">
            {t.noticeOk}
          </button>
        </aside>
      )}
      <div className={styles.playGrid}>
        {/*
          The table's side: the cards, then the scoreboards. On a desk it is one panel. On a phone its two parts are
          panels of their own, so the felt and the buttons can come straight under the cards, as a machine's buttons sit
          under its screen, and the scoreboards follow them.
        */}
        <div className={styles.tableSide}>
          <div className={`${styles.part} ${styles.cardsPart}`}>
            <div className={styles.tableTop}>
              <div className={styles.shoeBar} data-testid="shoe-info">
                {shoeView.number === 0 ? (
                  <span>{t.shoeWaiting}</span>
                ) : (
                  <>
                    <span className={styles.shoeStrong}>{t.shoeLabel(shoeView.number)}</span>
                    <span>{t.handInShoe(shoeView.hand)}</span>
                    <span data-testid="cards-left">{t.cardsLeft(shoeView.cardsLeft)}</span>
                    {shoeView.burnCard && <span className={styles.muted}>{t.burnInfo(cardLabel(shoeView.burnCard), shoeView.burned)}</span>}
                  </>
                )}
              </div>
              <button type="button" className={styles.soundToggle} aria-pressed={sound} onClick={toggleSound} data-testid="baccarat-sound">
                {sound ? t.soundOn : t.soundOff}
              </button>
            </div>

            <div className={styles.table}>
              <div className={styles.shoeBox} aria-hidden="true">
                <span className={styles.shoeCards} />
              </div>
              <div className={styles.hands}>
                {handView('player')}
                {handView('banker')}
              </div>
            </div>

            <div className={styles.callout} aria-live="polite" data-testid="baccarat-callout">
              <span
                className={
                  round?.settled
                    ? round.hand.winner === 'banker'
                      ? styles.calloutBanker
                      : round.hand.winner === 'player'
                        ? styles.calloutPlayer
                        : styles.calloutTie
                    : styles.calloutIdle
                }
              >
                {calloutText()}
              </span>
            </div>
            {shoeView.finished && !dealing && <p className={styles.cutNote}>{t.cutCardOut}</p>}
          </div>

          <div className={`${styles.part} ${styles.roadsPart}`}>
            {round?.settled && (
              <div className={styles.results}>
                <div className={styles.sectionLabel}>{t.handResults}</div>
                {round.results.length === 0 ? (
                  <p className={styles.muted}>{t.noBetsHand}</p>
                ) : (
                  <ul className={styles.resultList}>
                    {round.results.map((r) => (
                      <li key={r.id} data-outcome={r.outcome}>
                        <span>{t.betName[r.id]}</span>
                        <span className={styles.resultAmount}>
                          {r.outcome === 'win' ? `+${r.profit}` : r.outcome === 'lose' ? `−${r.stake}` : '±0'} <small>{t.outcome[r.outcome]}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className={styles.roads}>
              <BeadPlate
                entries={roads}
                name={t.beadPlate}
                letters={t.roadLetter}
                ariaLabel={t.roadAria(
                  t.beadPlate,
                  roads.filter((r) => r.winner === 'banker').length,
                  roads.filter((r) => r.winner === 'player').length,
                  roads.filter((r) => r.winner === 'tie').length,
                )}
              />
              <BigRoad
                entries={roads}
                name={t.bigRoad}
                ariaLabel={t.roadAria(
                  t.bigRoad,
                  roads.filter((r) => r.winner === 'banker').length,
                  roads.filter((r) => r.winner === 'player').length,
                  roads.filter((r) => r.winner === 'tie').length,
                )}
              />
              <p className={styles.note}>{t.roadNote}</p>
            </div>

            <div className={styles.sectionLabel} style={{ marginTop: '0.9rem' }}>
              {t.statsTitle} <small className={styles.muted}>({t.observedVsExact})</small>
            </div>
            <dl className={styles.statList} data-testid="session-stats">
              <div>
                <dt>{t.hands}</dt>
                <dd>{stats.hands}</dd>
              </div>
              {statRow(t.betName.banker, stats.banker, exact.banker / exact.total, 'banker')}
              {statRow(t.betName.player, stats.player, exact.player / exact.total, 'player')}
              {statRow(t.betName.tie, stats.tie, exact.tie / exact.total, 'tie')}
              <div>
                <dt>{t.pairs}</dt>
                <dd>
                  {stats.playerPairs} / {stats.bankerPairs}
                </dd>
              </div>
              <div>
                <dt>{t.naturals}</dt>
                <dd>{stats.naturals}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* The machine's front: the counter, the felt and its buttons, then the odds. On a phone the felt and the buttons come first. */}
        <div className={styles.front}>
          <div className={`${styles.part} ${styles.counterPart}`}>
            <MedalCounter
              loaded={bankState.loaded}
              medals={shownMedals}
              onTable={onTable}
              won={won}
              fmt={fmt}
              counting={payout && counted !== null ? { counted, medals: payout.medals } : null}
              labels={{
                medals: t.medalsLed,
                bet: t.betLed,
                win: t.winLed,
                held: t.medalsHeld,
                onTable: t.medalsOnTable,
                won: t.medalsWon,
                waiting: t.medalsWaiting,
              }}
            />
            <p className={styles.notMoney} data-testid="baccarat-not-money">
              {t.notMoney}
            </p>
            <p className={`${styles.note} ${styles.medalsFrom}`} data-testid="baccarat-medals-from">
              {t.medalsFrom}{' '}
              <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="baccarat-center-note-link">
                {t.centerLink}
              </a>
            </p>
            <div className={styles.modeRow} role="radiogroup" aria-label={t.tableMode}>
              {(['ez', 'commission'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className={styles.modeBtn}
                  onClick={() => switchMode(m)}
                  disabled={busy}
                >
                  {t.modeName[m]}
                </button>
              ))}
            </div>
          </div>

          <div className={`${styles.part} ${styles.buttonsPart}`} data-testid="baccarat-buttons">
            {/* Out of medals: the medal center's free refill, right by the felt it lets the player bet on again. */}
            {outOfMedals && (
              <button type="button" className={`${styles.btn} ${styles.refill}`} data-testid="baccarat-refill" onClick={() => medalBank().refill()}>
                {t.refill(REFILL)}
              </button>
            )}
            <div className={styles.chipRow} role="radiogroup" aria-label={t.betButtons}>
              <span className={styles.chipRowLabel} aria-hidden>
                {t.betButtons}
              </span>
              {BET_STEPS.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={chip === v}
                  aria-label={t.betButtonAria(v)}
                  onClick={() => pickChip(v)}
                  disabled={dealing}
                  className={styles.chip}
                  data-step={v}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className={styles.feltArea} ref={feltRef} tabIndex={-1}>
              <div className={styles.felt}>
                <div className={styles.sideRow}>
                  {spot('playerPair', paysText('playerPair'), styles.playerPairSpot)}
                  {spot('tie', paysText('tie'), styles.tieSpot)}
                  {spot('bankerPair', paysText('bankerPair'), styles.bankerPairSpot)}
                </div>
                <div className={styles.mainRow}>
                  {spot('player', paysText('player'), styles.playerSpot)}
                  {spot('banker', t.bankerPays(mode), styles.bankerSpot)}
                </div>
                {mode === 'ez' && (
                  <div className={styles.sideRow} data-testid="ez-bets">
                    {spot('panda8', paysText('panda8'), styles.pandaSpot)}
                    {spot('dragon7', paysText('dragon7'), styles.dragonSpot)}
                  </div>
                )}
              </div>
              {/* The player's card is in a table or machine in another tab: this table waits until it is played here again. */}
              {cardAway && (
                <div className={styles.cardAway} role="status" data-testid="baccarat-card-away">
                  <p>{t.cardAway}</p>
                  <button
                    type="button"
                    className={styles.cardAwayButton}
                    data-testid="baccarat-play-here"
                    onClick={() => {
                      medalTable.current?.play();
                      feltRef.current?.focus();
                    }}
                  >
                    {t.playHere}
                  </button>
                </div>
              )}
            </div>

            <p className={styles.message} role="status" data-testid="baccarat-message">
              {message ?? ''}
            </p>

            <div className={styles.actions}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={deal} disabled={busy}>
                {dealing ? t.dealing : t.deal}
              </button>
              <button type="button" className={styles.btn} onClick={undo} disabled={busy}>
                {t.undo}
              </button>
              <button type="button" className={styles.btn} onClick={clear} disabled={busy}>
                {t.clear}
              </button>
              <button type="button" className={styles.btn} onClick={rebet} disabled={busy}>
                {t.rebet}
              </button>
            </div>

          </div>

          <div className={`${styles.part} ${styles.morePart}`}>
            <section className={styles.live} aria-labelledby="baccarat-live-title">
              <div className={styles.liveHead}>
                <h3 id="baccarat-live-title" className={styles.liveTitle}>
                  {t.liveTitle}
                </h3>
                {freshShoe && <span className={styles.liveBadge}>{t.liveFresh}</span>}
              </div>
              <table className={styles.liveTable} data-testid="live-odds">
                <thead>
                  <tr>
                    <th>{t.colBet}</th>
                    <th className={styles.num}>{t.colWin}</th>
                    <th className={styles.num}>{t.colEdge}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Green only while the bet favors the player for the next hand. */}
                  {liveRows.map(({ id, odds }) => (
                    <tr key={id} data-live={id} data-positive={odds.ev > 0 ? 'true' : undefined}>
                      <td>{id === 'playerPair' ? `${t.betName.playerPair} / ${t.betName.bankerPair}` : t.betName[id]}</td>
                      <td className={styles.num}>{pct(odds.win, 3)}</td>
                      <td className={styles.num}>
                        {odds.ev > 0 ? (
                          <b>
                            +{pct(odds.ev, 3)} {t.playerEdge}
                          </b>
                        ) : (
                          pct(-odds.ev, 3)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.note}>{t.liveNote(unseenTotal)}</p>
            </section>

            <ul className={styles.hint}>
              {t.hint.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
