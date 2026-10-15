'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { REFILL } from '../MedalCenter/ledger';
import { GUEST, type Player } from '../MedalPusher/account';
import { Wheel } from './Wheel';
import { HistoryBoard } from './HistoryBoard';
import { resultsStore } from './resultsStore';
import { Bet, BET_ODDS, colorOf, RED_NUMBERS, spin } from './engine';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getStrings } from './i18n';
import { MedalMeter } from './MedalMeter';
import { putNoticeAway } from './notice';
import { BET_STEPS, ROULETTE_GAME, SPOT_MAX, createTable, spinId as newSpinId, tapAmount, type PlacedBet, type SpinRecord, type Staked, type Table } from './medalTable';
import styles from './Roulette.module.css';

/**
 * How long the table waits for the card before it says that the medals are in another tab, in seconds. The card is
 * away for a moment whenever another page takes the day's bonus or the like; nothing is said of that.
 */
export const CARD_WAIT = 1.5;

// Number-grid geometry: 12 cols × 3 rows. Row 0 is top (3, 6, 9, ...), row 2 is
// bottom (1, 4, 7, ...). numberAt(col, row) returns the cell's number.
const CELL_W = 100 / 12;
const CELL_H = 100 / 3;
const numberAt = (k: number, r: number) => 3 * k + (3 - r);

// Precompute inside-bet metadata (number sets + grid positions). 0-involving
// splits (0-1, 0-2, 0-3) and trios (0-1-2, 0-2-3) are intentionally omitted —
// would need to bridge the standalone 0 cell to the main grid.
const V_SPLITS: { k: number; r: number; numbers: [number, number] }[] = [];
for (let k = 0; k < 11; k++) {
  for (let r = 0; r < 3; r++) {
    V_SPLITS.push({ k, r, numbers: [numberAt(k, r), numberAt(k + 1, r)] });
  }
}
const H_SPLITS: { k: number; r: number; numbers: [number, number] }[] = [];
for (let k = 0; k < 12; k++) {
  for (let r = 0; r < 2; r++) {
    // Bottom row first so numbers are ascending — lets keyOf skip a runtime sort.
    H_SPLITS.push({ k, r, numbers: [numberAt(k, r + 1), numberAt(k, r)] });
  }
}
const CORNERS: { k: number; r: number; numbers: [number, number, number, number] }[] = [];
for (let k = 0; k < 11; k++) {
  for (let r = 0; r < 2; r++) {
    // Ascending order: bottom-left, top-left, bottom-right, top-right
    // (e.g. for k=0,r=1 → [1, 2, 4, 5]).
    CORNERS.push({
      k,
      r,
      numbers: [numberAt(k, r + 1), numberAt(k, r), numberAt(k + 1, r + 1), numberAt(k + 1, r)],
    });
  }
}
const STREETS: { numbers: [number, number, number] }[] = [];
for (let k = 0; k < 12; k++) {
  STREETS.push({ numbers: [3 * k + 1, 3 * k + 2, 3 * k + 3] });
}
const LINES: { k: number; numbers: [number, number, number, number, number, number] }[] = [];
for (let k = 0; k < 11; k++) {
  LINES.push({ k, numbers: [3 * k + 1, 3 * k + 2, 3 * k + 3, 3 * k + 4, 3 * k + 5, 3 * k + 6] });
}

type BetKey = string;
// All bet metadata is built with `numbers` already sorted ascending, so keyOf
// can join directly without a per-call sort.
const keyOf = (bet: Bet): BetKey => {
  if (bet.kind === 'straight') return `straight:${bet.number}`;
  if (bet.kind === 'dozen') return `dozen:${bet.which}`;
  if (bet.kind === 'column') return `column:${bet.which}`;
  if (bet.kind === 'split' || bet.kind === 'street' || bet.kind === 'corner' || bet.kind === 'line') {
    return `${bet.kind}:${bet.numbers.join('-')}`;
  }
  return bet.kind;
};

interface HistoryEntry {
  id: number;
  result: number;
  net: number;
  wagered: number;
}

/** A spin of this page's whose ball is still rolling: settled once, whenever the medals are to be settled first. */
type InFlight = Staked & {
  /** Whether its number has gone onto the results board. */
  boarded: boolean;
};

/** What the table shows of a spin that has ended: what it won, what it cost, and whether it is the last one from before this page opened. */
interface Outcome {
  result: number;
  won: number;
  wagered: number;
  earlier: boolean;
}

const sumOf = (bets: Record<BetKey, PlacedBet>): number => Object.values(bets).reduce((sum, b) => sum + b.amount, 0);

/** Brings the wheel on screen (single-column mobile layout) so the spin is visible. */
function revealWheel(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  const rect = el.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const visible = Math.min(rect.bottom, viewport) - Math.max(rect.top, 0);
  if (visible >= rect.height * 0.6) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

/** This device's storage for the table: a spin on record, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

export interface PlayTabProps {
  /** Who is playing: whose medals the table plays with. A guest when not given. */
  player?: Player;
}

export const PlayTab = ({ player = GUEST }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);

  // The medals are the medal center's (MedalCenter/bank.ts), and so is the card that lets this table bet them.
  const bankState = useBank();
  const [step, setStep] = useState<number>(BET_STEPS[0]);
  const [bets, setBets] = useState<Record<BetKey, PlacedBet>>({});
  const [placeOrder, setPlaceOrder] = useState<BetKey[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [spinId, setSpinId] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  // Winning numbers for the results board, newest first, saved in
  // localStorage (survives reloads and tab switches). Kept across a reset of
  // the medals: like a casino marquee it describes the wheel, not the player.
  const { results, spinCount } = useSyncExternalStore(
    resultsStore.subscribe,
    resultsStore.getSnapshot,
    resultsStore.getServerSnapshot,
  );
  // Winning number marked on the felt (the "dolly") until the next spin.
  const [winning, setWinning] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyId = useRef(0);
  const wheelAreaRef = useRef<HTMLDivElement>(null);

  // Refs guard against state-lag races: setSpinning(true) doesn't take effect
  // until the next render, so a fast second click would otherwise schedule a
  // duplicate spin.
  const spinningRef = useRef(false);
  const inFlight = useRef<InFlight | null>(null);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  // The last spin on record that the table has shown, so that it is shown once.
  const shownLast = useRef<string | null>(null);
  // Looks again at what the bank holds for the table (see the seat below): when the bank changes, and when the medals
  // on the table become this player's.
  const syncNow = useRef<(() => void) | null>(null);
  // What the bank's callbacks need of the latest render.
  const live = useRef({ t, player });
  useEffect(() => {
    live.current = { t, player };
  }, [t, player]);

  // Whether the medals on the table are this player's, found and read: until then nothing is bet.
  const mine = bankState.loaded && player.settled && bankState.owner === player.uid;
  const here = bankState.card === 'here';
  const canBet = mine && here && !spinning;

  const totalWagered = useMemo(() => sumOf(bets), [bets]);
  // The medals not on the felt: while the ball rolls, the bets on the felt have been taken out of them already.
  const medalsShown = mine ? Math.max(0, bankState.balance - (spinning ? 0 : totalWagered)) : null;

  // Delta-aware placement + undo. betsRef mirrors the bets state synchronously
  // so rapid consecutive clicks (before React commits) validate against the
  // real running total, and the undo stack / placeOrder can never desync from
  // bets. All ref/state mutation happens OUTSIDE the setBets updater (updaters
  // must be pure and may run twice under Strict Mode).
  const undoStack = useRef<{ key: BetKey; amount: number }[]>([]);
  const betsRef = useRef<Record<BetKey, PlacedBet>>({});
  const canBetRef = useRef(canBet);
  useEffect(() => {
    canBetRef.current = canBet;
  }, [canBet]);

  const setFelt = useCallback((next: Record<BetKey, PlacedBet>) => {
    undoStack.current = [];
    setPlaceOrder([]);
    betsRef.current = next;
    setBets(next);
  }, []);

  const placeBetTracked = (bet: Bet) => {
    if (spinningRef.current || !canBetRef.current) return;
    const k = keyOf(bet);
    const onSpot = betsRef.current[k]?.amount ?? 0;
    const left = medalBank().balance() - sumOf(betsRef.current);
    // A tap adds its step, or as many medals as still fit on the spot and in the player's medals.
    const add = tapAmount(step, onSpot, left);
    if (add <= 0) {
      setMessage(onSpot >= SPOT_MAX ? t.spotFull(SPOT_MAX) : t.noneLeft);
      return;
    }
    setMessage('');
    const nextBets = { ...betsRef.current, [k]: { bet, amount: onSpot + add } };
    betsRef.current = nextBets;
    setBets(nextBets);
    undoStack.current.push({ key: k, amount: add });
    setPlaceOrder((prev) => [...prev, k]);
  };

  const undoTracked = () => {
    if (spinningRef.current || undoStack.current.length === 0) return;
    const last = undoStack.current.pop()!;
    setPlaceOrder((prev) => prev.slice(0, -1));
    setMessage('');
    const existing = betsRef.current[last.key];
    if (!existing) return;
    const remaining = existing.amount - last.amount;
    const nextBets = { ...betsRef.current };
    if (remaining <= 0) delete nextBets[last.key];
    else nextBets[last.key] = { ...existing, amount: remaining };
    betsRef.current = nextBets;
    setBets(nextBets);
  };

  const clearBets = () => {
    if (spinningRef.current) return;
    setMessage('');
    setFelt({});
  };

  /** Sets the wheel going to a spin's number: one bet now, or one this device left unfinished. */
  const roll = useCallback((spun: InFlight) => {
    inFlight.current = spun;
    spinningRef.current = true;
    setSpinning(true);
    setOutcome(null);
    setWinning(null);
    setResult(spun.record.result);
    setSpinId((id) => id + 1);
    revealWheel(wheelAreaRef.current);
  }, []);

  const doSpin = () => {
    if (spinningRef.current || !canBetRef.current || sumOf(betsRef.current) === 0) return;
    // The number is drawn as the bet is made, as on a wheel once the ball is in the bowl: the spin is written down
    // with it and its medals are taken (medalTable.ts).
    const staked = table.current?.stake(Object.values(betsRef.current), spin()) ?? null;
    if (!staked) {
      setMessage(t.tooFew);
      return;
    }
    setMessage('');
    putNoticeAway();
    setAnnouncement(t.sayStake(staked.record.wagered));
    roll(Object.assign(staked, { boarded: false }));
  };

  // The ball has dropped and the wheel has stopped: the spin is settled, if it was not settled already, and shown.
  const settleSpin = useCallback(() => {
    const spun = inFlight.current;
    if (!spun) return;
    inFlight.current = null;
    if (!spun.void) {
      if (!spun.paid) table.current?.settle(spun);
      const { record } = spun;
      if (!spun.boarded) resultsStore.record(record.result);
      setOutcome({ result: record.result, won: record.won, wagered: record.wagered, earlier: false });
      setWinning(record.result);
      const entry: HistoryEntry = { id: historyId.current++, result: record.result, net: record.won - record.wagered, wagered: record.wagered };
      setHistory((h) => [entry, ...h].slice(0, 40));
      const { t: strings } = live.current;
      const said = record.won > 0 ? strings.wonLine(record.won, record.won - record.wagered) : strings.lostLine(record.wagered);
      setAnnouncement(`${record.result} ${strings.colorName(record.result)}. ${said}`);
    } else {
      // A reset came while the ball rolled: now that it has stopped, its number goes too, as everything else did.
      setResult(null);
    }
    setFelt({});
    spinningRef.current = false;
    setSpinning(false);
  }, [setFelt]);

  /** The medals have been reset at the medal center: the table starts over, and so does this device's copy of it. */
  const startOver = useCallback(
    (said: boolean) => {
      const spun = inFlight.current;
      // A spin still rolling was settled before the reset could be made (the card went to the medal center for it), or
      // its stake went with every other medal: either way it shows nothing now.
      if (spun) spun.void = true;
      // The number under the wheel goes too; a ball still rolling is left to stop (taking its number away would stop
      // the wheel's animation before it could say that it has stopped).
      else setResult(null);
      table.current?.clear();
      shownLast.current = null;
      setFelt({});
      setHistory([]);
      setOutcome(null);
      setWinning(null);
      setMessage('');
      medalBank().restarted(ROULETTE_GAME);
      if (said) setAnnouncement(live.current.t.sayReset);
    },
    [setFelt],
  );

  // The table's place at the medal center. It asks for the card as it is set up, and bets the player's medals while it
  // holds it. As the card goes, a spin whose ball is still rolling is settled at once, so that its winnings are in
  // before anyone else plays the medals or the page is gone.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => newSpinId(Date.now(), Math.random),
    });
    const settleNow = (why: 'moment' | 'hidden' | 'left') => {
      const spun = inFlight.current;
      if (!spun || spun.void || !table.current) return;
      // Settled already when the card went for a moment, perhaps; it may still have to go on the board.
      const settled = spun.paid ? 'already' : table.current.settle(spun);
      // A page that is hidden or left will not show the number when the ball stops: it goes on the board now.
      if ((settled === 'paid' || settled === 'already') && why !== 'moment' && !spun.boarded) {
        resultsStore.record(spun.record.result);
        spun.boarded = true;
      }
    };
    const placed = purse.sit(ROULETTE_GAME, {
      granted: () => undefined,
      yielding: settleNow,
    });
    seat.current = placed;

    // Whenever the bank changes: once this page holds the card for its player's medals, a reset since this device's
    // table last started over starts it over, and a spin left unfinished on this device is finished (medalTable.ts),
    // or the last spin is shown.
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
          if (purse.restartDue(ROULETTE_GAME)) startOver(false);
          if (inFlight.current) break;
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            setFelt(Object.fromEntries(left.bets.map((pb) => [keyOf(pb.bet), pb])));
            roll({ record: left, stored: true, paid: false, void: false, boarded: false });
            break;
          }
          const last: SpinRecord | null = tab.last();
          if (last && shownLast.current !== last.id && !spinningRef.current) {
            shownLast.current = last.id;
            setOutcome({ result: last.result, won: last.won, wagered: last.wagered, earlier: true });
            setWinning(last.result);
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
      // Left while it still holds the card, and before the table is put away: a spin still rolling is settled now.
      placed.leave();
      if (seat.current === placed) seat.current = null;
      if (syncNow.current === sync) syncNow.current = null;
      table.current = null;
    };
  }, [roll, setFelt, startOver]);

  // The medals on the table have become this player's (the site has found out who is playing), or the card has come:
  // whatever the bank holds for the table is looked at again.
  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // While the medals are in another tab's game, the table says so, a moment after (the card goes away for a moment
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
  const cardAway = mine && (bankState.card === 'away' || (bankState.card === 'asking' && longWait));
  const outOfMedals = mine && here && !spinning && bankState.balance === 0 && totalWagered === 0;

  const numberGrid: number[] = useMemo(() => {
    // Standard 3x12 grid (rows 3,2,1 top to bottom), flattened row-major.
    const rows: number[][] = [[], [], []];
    for (let n = 1; n <= 36; n++) {
      const row = 2 - ((n - 1) % 3);
      rows[row].push(n);
    }
    return rows.flat();
  }, []);

  const resultColor = (n: number) =>
    colorOf(n) === 'red' ? 'var(--rl-red)' : colorOf(n) === 'green' ? 'var(--rl-green)' : 'var(--rl-black)';
  // Text colour for the colour name: the black swatch colour is unreadable on
  // the dark theme, so black results use the foreground colour instead.
  const resultTextColor = (n: number) => (colorOf(n) === 'black' ? 'var(--games-route-fg)' : resultColor(n));

  // Localized aria-label for a multi-number bet: "<name> (<odds>:1) — n, n, …".
  const numAria = (kind: string, odds: number, numbers: readonly number[]) =>
    `${t.betAria(kind, odds)} — ${numbers.join(', ')}`;

  // The number shown under the wheel: the one just settled, or the last spin from before this page opened.
  const shownNumber = spinning ? null : (result ?? (outcome?.earlier ? outcome.result : null));
  const outcomeText = outcome && (outcome.won > 0 ? t.wonLine(outcome.won, outcome.won - outcome.wagered) : t.lostLine(outcome.wagered));
  const net = outcome ? outcome.won - outcome.wagered : 0;

  return (
    <div className={styles.playGrid}>
      {/* ---- Left column: wheel + results board ---- */}
      <div className={styles.panel}>
        <div className={styles.wheelWrap} ref={wheelAreaRef}>
          <Wheel
            result={result}
            spinId={spinId}
            onSettled={settleSpin}
            size={360}
            resultLabel={t.wheelResult}
            idleLabel={t.wheelIdle}
          />

          <div className={styles.resultBadge} aria-live="polite" data-testid="roulette-result">
            {spinning ? (
              <span className={styles.noMoreBets}>{t.noMoreBets}</span>
            ) : (
              shownNumber !== null && (
                <>
                  <span className={styles.resultChip} style={{ background: resultColor(shownNumber) }}>
                    {shownNumber}
                  </span>
                  <span style={{ color: resultTextColor(shownNumber) }}>{t.colorName(shownNumber)}</span>
                </>
              )
            )}
          </div>
          <div className={styles.netLine} data-testid="roulette-outcome" data-won={outcome?.won ?? ''} data-net={outcome ? net : ''}>
            {outcome && !spinning && (
              <span className={net >= 0 ? styles.netWin : styles.netLose}>
                {outcome.earlier && <span className={styles.netEarlier}>{t.lastSpin}: </span>}
                {outcomeText}
              </span>
            )}
          </div>
        </div>

        <HistoryBoard
          results={results}
          spinCount={spinCount}
          t={t}
          onClear={() => {
            if (window.confirm(t.boardClearConfirm)) resultsStore.clear();
          }}
          clearDisabled={spinning}
        />
      </div>

      {/* ---- Right column: the medals, the bet per tap, the felt, actions ---- */}
      <div className={styles.panel}>
        <MedalMeter medals={medalsShown} bet={totalWagered} t={t}>
          {outOfMedals && (
            <button type="button" className={styles.refill} data-testid="roulette-refill" onClick={() => medalBank().refill()}>
              {t.refill(REFILL)}
            </button>
          )}
        </MedalMeter>

        <div className={styles.chipRow} role="radiogroup" aria-label={t.stepGroup}>
          <span className={styles.chipRowLabel}>{t.stepGroup}:</span>
          {BET_STEPS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={step === v}
              aria-label={t.stepAria(v)}
              onClick={() => setStep(v)}
              disabled={spinning}
              className={`${styles.chip} ${styles.stepMedal}`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* The felt and its buttons, with the plate that stands over them while the medals are in another tab. */}
        <div className={styles.tableArea} data-card={bankState.card}>
          <div className={styles.felt}>
            {/* Number grid (0 + 1-36) with overlaid Split / Corner hit zones */}
            <div className={styles.gridRow}>
              <BetCell
                label="0"
                variant="green"
                winning={winning === 0}
                chips={bets['straight:0']?.amount}
                onClick={() => placeBetTracked({ kind: 'straight', number: 0 })}
                disabled={!canBet}
                ariaLabel={`${t.betAria('straight', BET_ODDS.straight)} — 0`}
                className={styles.zeroCell}
                style={{ height: 'auto' }}
              />
              <div className={styles.numGridWrap}>
                <div className={styles.numGrid}>
                  {numberGrid.map((n) => (
                    <BetCell
                      key={n}
                      label={String(n)}
                      variant={RED_NUMBERS.has(n) ? 'red' : 'black'}
                      winning={winning === n}
                      chips={bets[`straight:${n}`]?.amount}
                      onClick={() => placeBetTracked({ kind: 'straight', number: n })}
                      disabled={!canBet}
                      ariaLabel={`${t.betAria('straight', BET_ODDS.straight)} — ${n}`}
                    />
                  ))}
                </div>

                <div className={styles.overlay}>
                  {V_SPLITS.map(({ k, r, numbers }) => {
                    const bet = { kind: 'split', numbers } as const;
                    return (
                      <HitZone
                        key={keyOf(bet)}
                        chips={bets[keyOf(bet)]?.amount}
                        disabled={!canBet}
                        onClick={() => placeBetTracked(bet)}
                        title={numAria('split', BET_ODDS.split, numbers)}
                        style={{ left: `${(k + 1) * CELL_W}%`, top: `${(r + 0.5) * CELL_H}%`, width: 14, height: `${CELL_H * 0.55}%`, transform: 'translate(-50%, -50%)', borderRadius: 4 }}
                      />
                    );
                  })}
                  {H_SPLITS.map(({ k, r, numbers }) => {
                    const bet = { kind: 'split', numbers } as const;
                    return (
                      <HitZone
                        key={keyOf(bet)}
                        chips={bets[keyOf(bet)]?.amount}
                        disabled={!canBet}
                        onClick={() => placeBetTracked(bet)}
                        title={numAria('split', BET_ODDS.split, numbers)}
                        style={{ left: `${(k + 0.5) * CELL_W}%`, top: `${(r + 1) * CELL_H}%`, width: `${CELL_W * 0.55}%`, height: 14, transform: 'translate(-50%, -50%)', borderRadius: 4 }}
                      />
                    );
                  })}
                  {CORNERS.map(({ k, r, numbers }) => {
                    const bet = { kind: 'corner', numbers } as const;
                    return (
                      <HitZone
                        key={keyOf(bet)}
                        chips={bets[keyOf(bet)]?.amount}
                        disabled={!canBet}
                        onClick={() => placeBetTracked(bet)}
                        title={numAria('corner', BET_ODDS.corner, numbers)}
                        style={{ left: `${(k + 1) * CELL_W}%`, top: `${(r + 1) * CELL_H}%`, width: 18, height: 18, borderRadius: '50%', transform: 'translate(-50%, -50%)' }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Streets (1 per column, 11:1) */}
            <div className={styles.gridRow}>
              <div className={styles.zeroCell} />
              <div className={styles.numGrid} style={{ flex: 1 }}>
                {STREETS.map(({ numbers }, k) => {
                  const bet = { kind: 'street', numbers } as const;
                  return (
                    <BetCell
                      key={keyOf(bet)}
                      label={`${3 * k + 1}-${3 * k + 3}`}
                      variant="outside"
                      small
                      chips={bets[keyOf(bet)]?.amount}
                      onClick={() => placeBetTracked(bet)}
                      disabled={!canBet}
                      ariaLabel={numAria('street', BET_ODDS.street, numbers)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Lines (2 streets = 6 nums, 5:1) — centered on column boundaries */}
            <div className={styles.gridRow}>
              <div className={styles.zeroCell} />
              <div style={{ position: 'relative', flex: 1, height: 24 }}>
                {LINES.map(({ k, numbers }) => {
                  const bet = { kind: 'line', numbers } as const;
                  return (
                    <BetCell
                      key={keyOf(bet)}
                      label={`${numbers[0]}-${numbers[5]}`}
                      variant="outside"
                      small
                      chips={bets[keyOf(bet)]?.amount}
                      onClick={() => placeBetTracked(bet)}
                      disabled={!canBet}
                      ariaLabel={numAria('line', BET_ODDS.line, numbers)}
                      style={{
                        position: 'absolute',
                        left: `${(k + 1) * CELL_W}%`,
                        top: 0,
                        width: `${CELL_W}%`,
                        height: '100%',
                        transform: 'translateX(-50%)',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Dozens (left) + Columns (right, 2:1) */}
            <div className={styles.dozenColRow}>
              <div className={styles.dozens}>
                {[1, 2, 3].map((w) => (
                  <BetCell
                    key={w}
                    label={t.dozenLabel((w - 1) * 12 + 1, w * 12)}
                    variant="outside"
                    chips={bets[`dozen:${w}`]?.amount}
                    onClick={() => placeBetTracked({ kind: 'dozen', which: w as 1 | 2 | 3 })}
                    disabled={!canBet}
                    ariaLabel={`${t.betAria('dozen', BET_ODDS.dozen)} — ${(w - 1) * 12 + 1}-${w * 12}`}
                  />
                ))}
              </div>
              <div className={styles.columns}>
                {[1, 2, 3].map((w) => (
                  <BetCell
                    key={w}
                    label={t.columnLabel(w)}
                    variant="outside"
                    small
                    chips={bets[`column:${w}`]?.amount}
                    onClick={() => placeBetTracked({ kind: 'column', which: w as 1 | 2 | 3 })}
                    disabled={!canBet}
                    ariaLabel={`${t.betAria('column', BET_ODDS.column)} ${w}`}
                  />
                ))}
              </div>
            </div>

            {/* Outside even-money */}
            <div className={styles.outsideSix}>
              <BetCell label={t.low} variant="outside" chips={bets['low']?.amount} onClick={() => placeBetTracked({ kind: 'low' })} disabled={!canBet} ariaLabel={t.betAria('low', BET_ODDS.even)} />
              <BetCell label={t.even} variant="outside" chips={bets['even']?.amount} onClick={() => placeBetTracked({ kind: 'even' })} disabled={!canBet} ariaLabel={t.betAria('even', BET_ODDS.even)} />
              <BetCell label={t.red} variant="red" chips={bets['red']?.amount} onClick={() => placeBetTracked({ kind: 'red' })} disabled={!canBet} ariaLabel={t.betAria('red', BET_ODDS.even)} />
              <BetCell label={t.black} variant="black" chips={bets['black']?.amount} onClick={() => placeBetTracked({ kind: 'black' })} disabled={!canBet} ariaLabel={t.betAria('black', BET_ODDS.even)} />
              <BetCell label={t.odd} variant="outside" chips={bets['odd']?.amount} onClick={() => placeBetTracked({ kind: 'odd' })} disabled={!canBet} ariaLabel={t.betAria('odd', BET_ODDS.even)} />
              <BetCell label={t.high} variant="outside" chips={bets['high']?.amount} onClick={() => placeBetTracked({ kind: 'high' })} disabled={!canBet} ariaLabel={t.betAria('high', BET_ODDS.even)} />
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={doSpin}
              disabled={!canBet || totalWagered === 0}
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              {spinning ? t.spinning : t.spin}
            </button>
            <button type="button" onClick={undoTracked} disabled={spinning || placeOrder.length === 0} className={styles.btn}>
              {t.undo}
            </button>
            <button type="button" onClick={clearBets} disabled={spinning || totalWagered === 0} className={styles.btn}>
              {t.clear}
            </button>
          </div>

          {/* The player's medals are in another tab's game: this table stands still until it is played here again. */}
          {cardAway && (
            <div className={styles.cardAway} role="status" data-testid="roulette-card-away">
              <p>{t.cardAway}</p>
              <button type="button" className={styles.cardAwayButton} data-testid="roulette-play-here" onClick={() => seat.current?.play()}>
                {t.playHere}
              </button>
            </div>
          )}
        </div>

        <p className={styles.tableMessage} role="status" data-testid="roulette-message">
          {message}
        </p>

        <p className={styles.hint}>
          {t.outsideHint}{' '}
          <br />
          <strong>{t.insideHint}</strong>
        </p>

        <div style={{ marginTop: '0.9rem' }}>
          <div className={styles.sectionLabel}>{t.betHistory}</div>
          {history.length === 0 ? (
            <span style={{ color: 'var(--games-route-muted)', fontSize: '0.85rem' }}>{t.noBets}</span>
          ) : (
            <div className={styles.histWrap}>
              <table className={styles.histTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t.histBet}</th>
                    <th>{t.histNet}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <span className={styles.histResultDot} style={{ background: resultColor(h.result) }}>
                          {h.result}
                        </span>
                      </td>
                      <td>{h.wagered}</td>
                      <td className={h.net >= 0 ? styles.histNetWin : styles.histNetLose}>
                        {h.net > 0 ? `+${h.net}` : h.net < 0 ? `−${-h.net}` : '±0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <p className={styles.srOnly} aria-live="polite" data-testid="roulette-announcement">
        {announcement}
      </p>
    </div>
  );
};

type CellVariant = 'red' | 'black' | 'green' | 'outside';

interface BetCellProps {
  label: string;
  variant: CellVariant;
  chips?: number;
  onClick: () => void;
  disabled?: boolean;
  small?: boolean;
  /** Marks the last winning number (the casino "dolly"). */
  winning?: boolean;
  ariaLabel: string;
  className?: string;
  style?: React.CSSProperties;
}
const variantClass: Record<CellVariant, string> = {
  red: styles.cellRed,
  black: styles.cellBlack,
  green: styles.cellGreen,
  outside: styles.cellOutside,
};
const BetCell = ({ label, variant, chips, onClick, disabled, small, winning, ariaLabel, className, style }: BetCellProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className={`${styles.betCell} ${variantClass[variant]} ${small ? styles.cellSmall : ''} ${winning ? styles.cellWinning : ''} ${className ?? ''}`}
    style={style}
    data-winning={winning ? 'true' : undefined}
  >
    {label}
    {chips !== undefined && chips > 0 && <span className={styles.chipBadge}>{chips}</span>}
  </button>
);

interface HitZoneProps {
  chips?: number;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  style: React.CSSProperties;
}

/**
 * Small invisible-by-default clickable region overlaid on the number grid for
 * Split / Corner bets. Becomes visible (gold tint) on hover/focus and stays
 * filled when medals have been placed on it.
 */
const HitZone = ({ chips, onClick, disabled, title, style }: HitZoneProps) => {
  const isPlaced = chips !== undefined && chips > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`${styles.hitZone} ${isPlaced ? styles.hitZonePlaced : ''}`}
      style={style}
    >
      {isPlaced ? chips : ''}
    </button>
  );
};
