'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { NOT_MONEY } from '../MedalCenter/strings';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { FIELD, drawOrder, oddsOf, raceCard, ticketFrom, ticketKey, type RaceCard } from './card';
import { gateMark, getStrings, type HorseStrings } from './i18n';
import {
  BET_STEPS,
  HORSE_GAME,
  TICKET_MAX,
  createTable,
  raceId,
  tapAmount,
  type PlacedTicket,
  type RaceRecord,
  type Staked,
  type Table,
} from './medalTable';
import { planRace, planSeed, type MarginId, type RacePlan } from './race';
import { shownCard } from './shownCard';
import { GATE_COLOURS, STABLE, horseById, type Horse } from './stable';
import { GATE_SECONDS, Track, type TrackRun } from './Track';
import styles from './HorseRace.module.css';

/** How long betting stays open once a ticket is on the board, in seconds, and when the bell rings before it closes. */
export const BET_SECONDS = 60;
export const BELL_AT = 10;
/** How long the field stays where it pulled up after a race before the next race's field is in the gate, in seconds. */
export const RESULT_HOLD = 4;
/** How long the machine waits for the card before it says the medals are in another tab, in seconds. */
export const CARD_WAIT = 1.5;
/** A win at least this big is played the big fanfare, as the classic machines played theirs from 200 medals. */
export const BIG_WIN = 200;
/** How many digits the medal counter has (the medal center's own), the bet counter and the win counter. */
export const MEDAL_PLACES = 7;
const BET_PLACES = 4;
const WIN_PLACES = 6;

/** This device's storage for the machine: a race on record, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a race's name, from the browser's crypto: Math.random is the draw's alone. */
const nameRandom = (): number => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  } catch {
    return Date.now() % 1000 / 1000;
  }
};

/** A race running on this page: its stake, its plan, and the card it was bet on (null when that card is not the one on record). */
type InFlight = Staked & { plan: RacePlan; card: RaceCard | null };

/** What the machine shows of a race that has ended. */
interface Outcome {
  race: number;
  field: readonly Horse[];
  order: readonly number[];
  margin: MarginId;
  /** What the winning win ticket and the winning quinella paid on it, odds for a medal: null when the card is not known. */
  pays: { win: number | null; quinella: number | null };
  won: number;
  wagered: number;
  /** The last race from before this page opened. */
  earlier: boolean;
}

/** What the winning tickets of a race paid, from its card (or, when the card is not known, from the tickets bought on it). */
function paysOf(record: RaceRecord, card: RaceCard | null): Outcome['pays'] {
  const [first, second] = record.order;
  const win = ticketKey({ kind: 'win', gate: first });
  const quinella = ticketKey({ kind: 'quinella', gates: [Math.min(first, second), Math.max(first, second)] });
  const odds = (key: string) => (card ? oddsOf(card, ticketFrom(key)!) : (record.bets.find((bet) => bet.key === key)?.odds ?? null));
  return { win: odds(win), quinella: odds(quinella) };
}

interface HistoryEntry {
  id: string;
  race: number;
  first: number;
  second: number;
  wagered: number;
  net: number;
}

const horsesOf = (ids: readonly string[]): Horse[] => ids.map((id) => horseById(id) ?? STABLE[0]);
/** The field shown in the gate before the player's medals (and so their next race) are known. */
const WAITING_FIELD: readonly Horse[] = STABLE.slice(0, FIELD);

/** The card a race on record was bet on, worked out again; null when it is not the one the record names (the cards have changed since). */
function cardOf(record: RaceRecord): RaceCard | null {
  const card = raceCard(record.ledger, record.race);
  return card.field.every((horse, i) => horse.id === record.field[i]) ? card : null;
}

const sumOf = (bets: Readonly<Record<string, number>>): number => Object.values(bets).reduce((sum, n) => sum + n, 0);

/** Brings the track on screen as a race starts (on a phone the tickets are under it), unless most of it is there already. */
function revealTrack(element: HTMLElement | null): void {
  if (!element || typeof window === 'undefined') return;
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const visible = Math.min(rect.bottom, viewport) - Math.max(rect.top, 0);
  if (visible >= rect.height * 0.6) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

export const PlayTab = ({ player = GUEST, active = true }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const bankState = useBank();
  const mine = bankState.loaded && player.settled && bankState.owner === player.uid;
  const here = bankState.card === 'here';
  const device = mine ? (bankState.ledger?.device ?? null) : null;

  const [raceNo, setRaceNo] = useState(1);
  const card = useMemo(() => (device ? raceCard(device, raceNo) : null), [device, raceNo]);
  const [step, setStep] = useState<number>(BET_STEPS[0]);
  const [bets, setBets] = useState<Record<string, number>>({});
  const betsRef = useRef<Record<string, number>>({});
  const undoStack = useRef<{ key: string; amount: number }[]>([]);
  const [running, setRunning] = useState<InFlight | null>(null);
  const runningRef = useRef<InFlight | null>(null);
  const [trackRun, setTrackRun] = useState<TrackRun | null>(null);
  // The race just run, held on the board for a moment with its winning tickets lit (確定), before the next race's card.
  const [holdRace, setHoldRace] = useState<{ card: RaceCard | null; record: RaceRecord } | null>(null);
  const [trackField, setTrackField] = useState<readonly Horse[] | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [lastBets, setLastBets] = useState<{ key: string; amount: number }[]>([]);
  const lastBetsRef = useRef<{ key: string; amount: number }[]>([]);
  const [hiddenWin, setHiddenWin] = useState(0);
  // Betting's countdown: the time left, while a ticket is on the board and the machine can take it.
  const [left, setLeft] = useState<number | null>(null);
  const leftMs = useRef<number | null>(null);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const shownLast = useRef<string | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const holdTimer = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const live = useRef({ t, player, card });
  useEffect(() => {
    live.current = { t, player, card };
  }, [t, player, card]);

  const canBet = mine && here && running === null && holdRace === null && card !== null;
  const canBetRef = useRef(canBet);
  useEffect(() => {
    canBetRef.current = canBet;
  }, [canBet]);
  const totalBet = useMemo(() => sumOf(bets), [bets]);

  // The medals not on the board: while a race runs, its tickets' medals are out of them already.
  const medalsShown = mine ? Math.max(0, bankState.balance - hiddenWin - (running || holdRace ? 0 : totalBet)) : null;
  const sound = useMachineSound();
  const { play, tick } = sound;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;

  // The board's card (and the Odds tab's): the race being run or just run, or the next one.
  const boardCard = running ? running.card : holdRace ? holdRace.card : card;
  useEffect(() => {
    shownCard.set(boardCard ?? null);
  }, [boardCard]);
  useEffect(() => () => shownCard.set(null), []);

  const setBoard = useCallback((next: Record<string, number>) => {
    betsRef.current = next;
    setBets(next);
  }, []);

  const clearBoard = useCallback(() => {
    undoStack.current = [];
    leftMs.current = null;
    setLeft(null);
    setBoard({});
  }, [setBoard]);

  /** Starts the countdown to the close of betting, as the first ticket goes on the board. */
  const openBetting = () => {
    if (leftMs.current !== null) return;
    leftMs.current = BET_SECONDS * 1000;
    setLeft(BET_SECONDS);
  };

  const addTicket = (key: string) => {
    if (runningRef.current || !canBetRef.current) return;
    const onTicket = betsRef.current[key] ?? 0;
    const free = medalBank().balance() - sumOf(betsRef.current);
    const add = tapAmount(step, onTicket, free);
    if (add <= 0) {
      setMessage(onTicket >= TICKET_MAX ? t.ticketFull(TICKET_MAX) : t.noneLeft);
      return;
    }
    setMessage('');
    play('chip');
    setBoard({ ...betsRef.current, [key]: onTicket + add });
    undoStack.current.push({ key, amount: add });
    openBetting();
  };

  const undo = () => {
    if (runningRef.current || !canBetRef.current || undoStack.current.length === 0) return;
    const last = undoStack.current.pop()!;
    const remaining = (betsRef.current[last.key] ?? 0) - last.amount;
    const next = { ...betsRef.current };
    if (remaining <= 0) delete next[last.key];
    else next[last.key] = remaining;
    setMessage('');
    setBoard(next);
    if (sumOf(next) === 0) {
      leftMs.current = null;
      setLeft(null);
    }
  };

  const clear = () => {
    if (runningRef.current || !canBetRef.current) return;
    setMessage('');
    clearBoard();
  };

  /** The last race's tickets back on an empty board, all of them or none. */
  const rebet = () => {
    const last = lastBetsRef.current;
    if (runningRef.current || !canBetRef.current || last.length === 0 || sumOf(betsRef.current) > 0) return;
    const total = last.reduce((sum, bet) => sum + bet.amount, 0);
    if (total > medalBank().balance()) {
      setMessage(t.rebetShort(total));
      return;
    }
    setMessage('');
    setBoard(Object.fromEntries(last.map((bet) => [bet.key, bet.amount])));
    undoStack.current = last.map((bet) => ({ ...bet }));
    openBetting();
  };

  const rememberBets = useCallback((placed: readonly { key: string; amount: number }[]) => {
    const copy = placed.map(({ key, amount }) => ({ key, amount }));
    lastBetsRef.current = copy;
    setLastBets(copy);
  }, []);

  /** Sets a race going on the track: one bought now, or one this device left unfinished. */
  const begin = useCallback(
    (staked: Staked, raceCardFor: RaceCard | null, resumed: boolean) => {
      const { record } = staked;
      const field = horsesOf(record.field);
      const plan = planRace(record.order, field.map((horse) => horse.style), planSeed(record.id));
      const flight: InFlight = Object.assign(staked, { plan, card: raceCardFor });
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      setHoldRace(null);
      runningRef.current = flight;
      setRunning(flight);
      setSkipped(false);
      setOutcome(null);
      setTrackField(field);
      setTrackRun({ id: record.id, plan, opensAt: performance.now() + (resumed ? 800 : GATE_SECONDS * 1000) });
      leftMs.current = null;
      setLeft(null);
      setBoard(Object.fromEntries(record.bets.map((bet) => [bet.key, bet.amount])));
      undoStack.current = [];
      // A race bought now: the fanfare, and the track brought on screen. (One picked up again after a reload is not
      // scrolled to: the page has only just opened.)
      if (!resumed) {
        play('fanfare');
        revealTrack(stageRef.current);
      }
    },
    [play, setBoard],
  );

  /** START: betting closes, the result is drawn here, in the press, and the tickets are bought. */
  const start = () => {
    const raceFor = live.current.card;
    if (runningRef.current || !canBetRef.current || !raceFor || sumOf(betsRef.current) === 0) return;
    const order = drawOrder(raceFor, Math.random);
    const placed: PlacedTicket[] = Object.entries(betsRef.current)
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => ({ key, amount, odds: oddsOf(raceFor, ticketFrom(key)!) }));
    const staked = table.current?.stake(raceFor, placed, order) ?? null;
    if (!staked) {
      setMessage(live.current.t.tooFew);
      return;
    }
    setMessage('');
    rememberBets(staked.record.bets);
    setAnnouncement(live.current.t.sayStake(staked.record.wagered));
    begin(staked, raceFor, false);
  };
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  const skip = () => {
    if (runningRef.current) setSkipped(true);
  };

  // The race has been run to its end on the track: it is settled, if it was not already, and shown.
  const finished = useCallback(() => {
    const flight = runningRef.current;
    if (!flight) return;
    runningRef.current = null;
    const { record } = flight;
    if (!flight.void) {
      if (record.won > 0) payMedals();
      setHiddenWin(0);
      if (!flight.paid) table.current?.settle(flight);
      if (record.won > 0) play(record.won >= BIG_WIN ? 'big' : 'win', 0.1);
      setOutcome({ race: record.race, field: horsesOf(record.field), order: record.order, margin: flight.plan.margins[1], pays: paysOf(record, flight.card), won: record.won, wagered: record.wagered, earlier: false });
      setHistory((before) => [{ id: record.id, race: record.race, first: record.order[0], second: record.order[1], wagered: record.wagered, net: record.won - record.wagered }, ...before].slice(0, 30));
      const { t: words } = live.current;
      const field = horsesOf(record.field);
      const name = (gate: number) => `${gate} ${field[gate - 1].name[language]}`;
      setAnnouncement(words.sayResult(name(record.order[0]), name(record.order[1]), record.won, record.wagered));
      setRaceNo(record.race + 1);
      shownLast.current = record.id;
    }
    setRunning(null);
    undoStack.current = [];
    // The result is held on the board for a moment, the winning tickets lit and the field where it pulled up (確定);
    // then the next race's card is up, its field in the gate, and betting opens.
    const close = () => {
      holdTimer.current = null;
      setHoldRace(null);
      setTrackRun(null);
      setTrackField(null);
      setBoard({});
    };
    if (flight.void) {
      close();
      return;
    }
    setHoldRace({ card: flight.card, record });
    holdTimer.current = window.setTimeout(close, RESULT_HOLD * 1000);
  }, [payMedals, play, setBoard, language]);

  /** The medals have been reset at the medal center: the machine starts over at race 1. */
  const startOver = useCallback(
    (said: boolean) => {
      const flight = runningRef.current;
      if (flight) flight.void = true;
      setHiddenWin(0);
      table.current?.clear();
      shownLast.current = null;
      setHoldRace(null);
      setOutcome(null);
      setHistory([]);
      setMessage('');
      setRaceNo(1);
      rememberBets([]);
      clearBoard();
      medalBank().restarted(HORSE_GAME);
      if (said) setAnnouncement(live.current.t.sayReset);
    },
    [clearBoard, rememberBets],
  );

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. As the card goes, a race still running is settled at once (its result is drawn already), so that its
  // winnings are in before anyone else plays the medals or the page is gone.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => raceId(Date.now(), nameRandom),
    });
    const settleNow = () => {
      const flight = runningRef.current;
      if (!flight || flight.void || !table.current) return;
      const settled = flight.paid ? 'already' : table.current.settle(flight);
      // Paid now, before the race is over on the track: what it won stays off the counter until it is.
      if (settled === 'paid' && flight.record.won > 0) setHiddenWin(flight.record.won);
    };
    const placed = purse.sit(HORSE_GAME, { granted: () => undefined, yielding: settleNow });
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
          if (purse.restartDue(HORSE_GAME)) startOver(false);
          if (runningRef.current) break;
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            rememberBets(left.bets);
            begin({ record: left, stored: true, paid: false, void: false }, cardOf(left), true);
            break;
          }
          setRaceNo(tab.nextRace());
          const last = tab.last();
          if (last && shownLast.current !== last.id) {
            shownLast.current = last.id;
            rememberBets(last.bets);
            const field = horsesOf(last.field);
            const plan = planRace(last.order, field.map((horse) => horse.style), planSeed(last.id));
            setOutcome({ race: last.race, field, order: last.order, margin: plan.margins[1], pays: paysOf(last, cardOf(last)), won: last.won, wagered: last.wagered, earlier: true });
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
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    };
  }, [begin, startOver, rememberBets]);

  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // Betting's countdown runs while a ticket is on the board and the machine can take it; it stands still otherwise (the
  // page hidden, the medals in another tab). The bell rings ten seconds before it closes, and at nothing it closes: the
  // race is off, as START would set it off.
  const counting = canBet && totalBet > 0 && left !== null;
  useEffect(() => {
    if (!counting) return;
    let before = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const was = leftMs.current;
      if (was === null) return;
      const next = Math.max(0, was - (now - before));
      before = now;
      leftMs.current = next;
      const seconds = Math.ceil(next / 1000);
      if (Math.ceil(was / 1000) > BELL_AT && seconds <= BELL_AT) play('bell');
      setLeft(seconds);
      if (next <= 0) startRef.current();
    }, 250);
    return () => window.clearInterval(timer);
  }, [counting, play]);

  // While the medals are in another tab's game, the machine says so, a moment after.
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = mine && (bankState.card === 'away' || (bankState.card === 'asking' && longWait));
  const outOfMedals = mine && here && !running && bankState.balance === 0 && totalBet === 0;

  // On a desktop: Space or Enter starts (or skips a race running), 1 to 6 a win ticket, S skips, R the same tickets, U undo.
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') {
      if (runningRef.current) skip();
      else start();
    } else if (key === 's') skip();
    else if (key === 'r') rebet();
    else if (key === 'u') undo();
    else if (/^[1-6]$/.test(key)) addTicket(`win:${key}`);
    else return false;
    return true;
  });

  const phase = running ? 'running' : 'betting';
  const status = running ? t.statusRunning : holdRace ? t.statusResult : left !== null ? t.statusCloses(left) : t.statusOpen;
  const raceShown = running ? running.record.race : holdRace ? holdRace.record.race : raceNo;
  const shownRecord = running ? running.record : (holdRace?.record ?? null);
  const shownBet = shownRecord ? shownRecord.wagered : totalBet;
  /** The first two of the race held on the board, whose tickets are lit. */
  const lit = holdRace ? holdRace.record.order.slice(0, 2) : null;
  const fieldShown = trackField ?? card?.field ?? WAITING_FIELD;
  const lastBetTotal = lastBets.reduce((sum, bet) => sum + bet.amount, 0);
  const oddsFor = (key: string): number | null => {
    const ticket = ticketFrom(key);
    if (!ticket) return null;
    if (boardCard) return oddsOf(boardCard, ticket);
    return shownRecord?.bets.find((bet) => bet.key === key)?.odds ?? null;
  };
  const boardField = shownRecord ? horsesOf(shownRecord.field) : (card?.field ?? null);
  const winsShown = outcome && !running ? outcome.won : 0;
  const nameOf = (field: readonly Horse[], gate: number) => field[gate - 1]?.name[language] ?? '';

  return (
    <div className={styles.machine} data-testid="hr-machine" data-phase={phase} data-playable={canBet ? 'true' : 'false'} data-race={raceShown}>
      <div className={styles.stage} ref={stageRef}>
        {/* The board over the track: the race's number, the field, and whether betting is open. */}
        <div className={styles.marquee} data-testid="hr-board" data-chase={running || holdRace ? "false" : "true"}>
          <span className={styles.raceNo} data-testid="hr-race">
            {t.raceNo(raceShown)}
          </span>
          <span className={styles.runners}>{t.runners}</span>
          <span className={styles.status} data-testid="hr-status" data-left={left ?? ''}>
            {status}
          </span>
        </div>
        <div className={styles.ticker} aria-hidden data-on={!running && totalBet === 0 ? 'true' : 'false'}>
          <span className={styles.tickerText}>{t.ticker.join('　◆　')}</span>
        </div>
        <Track
          field={fieldShown}
          run={trackRun}
          skipped={skipped}
          onPost={() => undefined}
          onFinished={finished}
          onStride={() => play('hooves')}
          onOff={() => play('gate')}
          t={t}
          language={language}
        />
        <ResultPanel outcome={outcome} running={running !== null} t={t} nameOf={nameOf} />
      </div>

      <div className={styles.side}>
        <section className={styles.meter} aria-label={t.medals} data-testid="hr-meter" data-loaded={medalsShown !== null} data-medals={medalsShown ?? ''} data-bet={shownBet} data-win={winsShown}>
          <div className={styles.meterRow}>
            <div className={`${styles.meterCell} ${styles.meterMain}`}>
              <span className={styles.meterLabel} aria-hidden>
                {t.medals}
              </span>
              <span className={styles.meterLed} data-testid="hr-medals-led" data-shown={meter.shown ?? ''}>
                <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
              </span>
              <span className={styles.srOnly} data-testid="hr-medals">
                {medalsShown === null ? t.finding : t.medalsSr(medalsShown)}
              </span>
            </div>
            <div className={styles.meterCell}>
              <span className={styles.meterLabel} aria-hidden>
                {t.bet}
              </span>
              <span className={styles.meterLed}>
                <SegmentDisplay value={shownBet} places={BET_PLACES} tone="amber" />
              </span>
              <span className={styles.srOnly}>{t.betSr(shownBet)}</span>
            </div>
            <div className={`${styles.meterCell} ${winsShown > 0 ? styles.meterWon : ''}`}>
              <span className={styles.meterLabel} aria-hidden>
                {t.won}
              </span>
              <span className={styles.meterLed}>
                <SegmentDisplay value={winsShown} places={WIN_PLACES} tone="amber" />
              </span>
              <span className={styles.srOnly} data-testid="hr-won">
                {t.wonSr(winsShown)}
              </span>
            </div>
          </div>
          {medalsShown === null && (
            <p className={styles.meterNote} aria-hidden>
              {t.finding}
            </p>
          )}
          {outOfMedals && (
            <button type="button" className={styles.refill} data-testid="hr-refill" onClick={() => medalBank().refill()}>
              {t.refill(REFILL)}
            </button>
          )}
          <p className={styles.meterNote} data-testid="hr-not-money">
            {NOT_MONEY[language]}
          </p>
          <p className={styles.meterNote}>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="hr-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </section>

        <div className={styles.boardArea} data-card={bankState.card}>
          <div className={styles.steps} role="radiogroup" aria-label={t.stepGroup}>
            <span className={styles.stepsLabel}>{t.stepGroup}</span>
            {BET_STEPS.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={step === value} aria-label={t.stepAria(value)} className={styles.stepButton} disabled={running !== null} onClick={() => setStep(value)}>
                {value}
              </button>
            ))}
            <SoundSwitch control={sound} language={language} className={`${styles.btn} ${styles.soundSwitch}`} testId="hr-sound" />
          </div>

          {/* The win tickets: one a horse, with its gate, name, way of running and odds. */}
          <section className={styles.tickets} aria-labelledby="hr-win-title" data-testid="hr-win-tickets">
            <h3 id="hr-win-title" className={styles.ticketsTitle}>
              {t.win} <span className={styles.ticketsHelp}>{t.winHelp}</span>
            </h3>
            <ul className={styles.winList}>
              {Array.from({ length: FIELD }, (_, i) => {
                const gate = i + 1;
                const key = ticketKey({ kind: 'win', gate });
                const horse = boardField?.[i] ?? null;
                const odds = oddsFor(key);
                const medals = bets[key] ?? 0;
                const won = lit !== null && lit[0] === gate;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={styles.winTicket}
                      data-testid={`hr-ticket-${key}`}
                      data-medals={medals}
                      data-odds={odds ?? ''}
                      data-won={won ? 'true' : undefined}
                      disabled={!canBet || !horse}
                      aria-label={horse && odds !== null ? t.winAria(gate, horse.name[language], odds, medals) : gateMark(gate)}
                      onClick={() => addTicket(key)}
                    >
                      <span className={styles.gateBadge} style={{ background: GATE_COLOURS[i].cloth, color: GATE_COLOURS[i].number }} aria-hidden>
                        {gate}
                      </span>
                      <span className={styles.horseName}>
                        <span className={styles.horseNameText}>{horse?.name[language] ?? '—'}</span>
                        <span className={styles.horseStyle}>{horse ? t.styleName[horse.style] : ''}</span>
                      </span>
                      <span className={styles.odds}>{odds !== null ? t.oddsUnit(odds) : '—'}</span>
                      <span className={styles.stake} data-on={medals > 0 ? 'true' : 'false'}>
                        {medals > 0 ? medals : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* The quinellas, as the board sets them out: a triangle of pairs, the lower gate down the side. */}
          <section className={styles.tickets} aria-labelledby="hr-quinella-title" data-testid="hr-quinella-tickets">
            <h3 id="hr-quinella-title" className={styles.ticketsTitle}>
              {t.quinella} <span className={styles.ticketsHelp}>{t.quinellaHelp}</span>
            </h3>
            <div className={styles.quinellaGrid} role="group" aria-labelledby="hr-quinella-title">
              <span className={styles.gridCorner} aria-hidden />
              {Array.from({ length: FIELD - 1 }, (_, j) => (
                <span key={`col-${j}`} className={styles.gridHead} style={{ background: GATE_COLOURS[j + 1].cloth, color: GATE_COLOURS[j + 1].number }} aria-hidden>
                  {j + 2}
                </span>
              ))}
              {Array.from({ length: FIELD - 1 }, (_, i) => (
                <QuinellaRow key={`row-${i}`} row={i} bets={bets} oddsFor={oddsFor} canBet={canBet && boardField !== null} onPick={addTicket} t={t} winning={lit} />
              ))}
            </div>
          </section>

          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnStart}`} data-testid="hr-start" onClick={start} disabled={!canBet || totalBet === 0}>
              {running ? t.running : t.start}
            </button>
            <button type="button" className={styles.btn} data-testid="hr-skip" onClick={skip} disabled={!running || skipped}>
              {t.skip}
            </button>
            <button type="button" className={styles.btn} data-testid="hr-rebet" onClick={rebet} disabled={!canBet || lastBets.length === 0 || totalBet > 0}>
              {t.rebet(lastBetTotal)}
            </button>
            <button type="button" className={styles.btn} data-testid="hr-undo" onClick={undo} disabled={!canBet || totalBet === 0}>
              {t.undo}
            </button>
            <button type="button" className={styles.btn} data-testid="hr-clear" onClick={clear} disabled={!canBet || totalBet === 0}>
              {t.clear}
            </button>
          </div>

          {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
          {cardAway && (
            <div className={styles.cardAway} role="status" data-testid="hr-card-away">
              <p>{t.cardAway}</p>
              <button type="button" className={styles.cardAwayButton} data-testid="hr-play-here" onClick={() => seat.current?.play()}>
                {t.playHere}
              </button>
            </div>
          )}
        </div>

        <p className={styles.message} role="status" data-testid="hr-message">
          {message}
        </p>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="hr-keys" />

        <section className={styles.history} aria-labelledby="hr-history-title">
          <h3 id="hr-history-title" className={styles.ticketsTitle}>
            {t.historyTitle}
          </h3>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <table className={styles.historyTable} data-testid="hr-history">
              <thead>
                <tr>
                  <th>{t.historyRace}</th>
                  <th>{t.historyResult}</th>
                  <th>{t.bet}</th>
                  <th>{t.historyNet}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.race}</td>
                    <td>
                      {entry.first}-{entry.second}
                    </td>
                    <td>{entry.wagered}</td>
                    <td className={entry.net > 0 ? styles.pos : entry.net < 0 ? styles.neg : ''}>{entry.net > 0 ? `+${entry.net}` : entry.net < 0 ? `−${-entry.net}` : '±0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <p className={styles.srOnly} aria-live="polite" data-testid="hr-announcement">
        {announcement}
      </p>
    </div>
  );
};

/** One row of the quinella triangle: the pairs whose lower gate is `row + 1`, an empty cell under the diagonal. */
function QuinellaRow({
  row,
  bets,
  oddsFor,
  canBet,
  onPick,
  t,
  winning,
}: {
  row: number;
  bets: Readonly<Record<string, number>>;
  oddsFor: (key: string) => number | null;
  canBet: boolean;
  onPick: (key: string) => void;
  t: HorseStrings;
  winning: readonly number[] | null;
}) {
  const a = row + 1;
  return (
    <>
      <span className={styles.gridHead} style={{ background: GATE_COLOURS[row].cloth, color: GATE_COLOURS[row].number }} aria-hidden>
        {a}
      </span>
      {Array.from({ length: FIELD - 1 }, (_, j) => {
        const b = j + 2;
        if (b <= a) return <span key={b} className={styles.gridEmpty} aria-hidden />;
        const key = ticketKey({ kind: 'quinella', gates: [a, b] });
        const odds = oddsFor(key);
        const medals = bets[key] ?? 0;
        const won = winning !== null && winning.includes(a) && winning.includes(b);
        return (
          <button
            key={b}
            type="button"
            className={styles.quinellaTicket}
            data-testid={`hr-ticket-${key}`}
            data-medals={medals}
            data-odds={odds ?? ''}
            data-won={won ? 'true' : undefined}
            disabled={!canBet}
            aria-label={odds !== null ? t.quinellaAria(a, b, odds, medals) : `${a}-${b}`}
            onClick={() => onPick(key)}
          >
            <span className={styles.qOdds}>{odds ?? '—'}</span>
            <span className={styles.qStake} data-on={medals > 0 ? 'true' : 'false'}>
              {medals > 0 ? medals : ''}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** The result of the last race: the first two, the margin, what the winning tickets paid, and what the player's brought back. */
function ResultPanel({
  outcome,
  running,
  t,
  nameOf,
}: {
  outcome: Outcome | null;
  running: boolean;
  t: HorseStrings;
  nameOf: (field: readonly Horse[], gate: number) => string;
}) {
  if (!outcome || running) {
    return (
      <section className={styles.result} data-testid="hr-result" data-shown="false">
        <p className={styles.resultEmpty}>{running ? t.statusRunning : t.resultIdle}</p>
      </section>
    );
  }
  const { field, order, pays } = outcome;
  const pair = [Math.min(order[0], order[1]), Math.max(order[0], order[1])] as const;
  const net = outcome.won - outcome.wagered;
  return (
    <section className={styles.result} data-testid="hr-result" data-shown="true" data-order={order.join('')} data-won={outcome.won} data-net={net} data-earlier={outcome.earlier}>
      <p className={styles.resultHead}>
        <span className={styles.confirmed}>{t.confirmed}</span> {outcome.earlier ? t.lastRace : t.resultTitle(outcome.race)}
      </p>
      <ol className={styles.resultPlaces}>
        {order.slice(0, 2).map((gate, i) => (
          <li key={gate}>
            <span className={styles.resultPlace}>{t.place(i + 1)}</span>
            <span className={styles.gateBadge} style={{ background: GATE_COLOURS[gate - 1].cloth, color: GATE_COLOURS[gate - 1].number }} aria-hidden>
              {gate}
            </span>
            <span className={styles.resultName}>{nameOf(field, gate)}</span>
            {i === 1 && <span className={styles.resultMargin}>{t.margin[outcome.margin]}</span>}
          </li>
        ))}
      </ol>
      {/* What the winning tickets paid, as the board shows the 払戻: the win and the quinella. */}
      <p className={styles.resultPays} data-testid="hr-result-pays">
        {pays.win !== null && <span>{`${t.win} ${order[0]} ${t.oddsUnit(pays.win)}`}</span>}
        {pays.quinella !== null && <span>{`${t.quinella} ${pair[0]}-${pair[1]} ${t.oddsUnit(pays.quinella)}`}</span>}
      </p>
      <p className={styles.resultLine} data-testid="hr-result-line" data-net={net}>
        {outcome.won > 0 ? t.paid(outcome.won, net) : t.lost(outcome.wagered)}
      </p>
    </section>
  );
}
