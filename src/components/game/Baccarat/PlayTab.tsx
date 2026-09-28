'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
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
  roadEntry,
  settleBet,
  settleBets,
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
  type Shoe,
  type Side,
} from './engine';
import { PlayingCard, cardLabel } from './Cards';
import { BeadPlate, BigRoad } from './Roads';
import { getStrings } from './i18n';
import styles from './Baccarat.module.css';

export const INITIAL_BANKROLL = 1000;
export const CHIP_VALUES = [1, 5, 25, 100, 500] as const;
const CHIP_COLORS: Record<number, string> = { 1: '#e2e8f0', 5: '#ef4444', 25: '#22c55e', 100: '#1a1a1f', 500: '#a855f7' };

/** Deal pacing: a card every CARD_MS, an extra beat before each third card, then settle. */
const CARD_MS = 340;
const THIRD_CARD_PAUSE_MS = 360;
const SETTLE_MS = 420;

export function revealSchedule(cards: number): { reveal: number[]; settle: number } {
  const reveal = Array.from({ length: cards }, (_, k) => k * CARD_MS + Math.max(0, k - 3) * THIRD_CARD_PAUSE_MS);
  return { reveal, settle: reveal[cards - 1] + SETTLE_MS };
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

interface Round {
  id: number;
  hand: Hand;
  /** Cards turned over so far, in dealing order. */
  shown: number;
  settled: boolean;
  results: BetResult[];
  mode: Mode;
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

interface Stats {
  hands: number;
  banker: number;
  player: number;
  tie: number;
  playerPairs: number;
  bankerPairs: number;
  naturals: number;
}

const EMPTY_STATS: Stats = { hands: 0, banker: 0, player: 0, tie: 0, playerPairs: 0, bankerPairs: 0, naturals: 0 };

/** Amounts stay exact internally (a 5 Banker win pays 4.75); round only for display. */
const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};
const pct = (p: number, digits = 2) => `${(p * 100).toFixed(digits)}%`;
const paysText = (id: BetId) => `${PAYS[id][0]}:${PAYS[id][1]}`;

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [bankroll, setBankroll] = useState(INITIAL_BANKROLL);
  const [chip, setChip] = useState<number>(CHIP_VALUES[1]);
  const [bets, setBets] = useState<Bets>({});
  const [mode, setMode] = useState<Mode>('commission');
  const [dealing, setDealing] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [roads, setRoads] = useState<RoadEntry[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [shoeView, setShoeView] = useState<ShoeView>(NO_SHOE);
  const [unseen, setUnseen] = useState<number[]>(() => fullShoeCounts(DEFAULT_DECKS));

  // Refs mirror state that click handlers and timers must read synchronously.
  const bankrollRef = useRef(INITIAL_BANKROLL);
  const betsRef = useRef<Bets>({});
  const dealingRef = useRef(false);
  const shoeRef = useRef<Shoe | null>(null);
  const shoeNumber = useRef(0);
  const undoStack = useRef<{ id: BetId; amount: number }[]>([]);
  const lastBets = useRef<Bets>({});
  const roundId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const commitBets = (next: Bets) => {
    betsRef.current = next;
    setBets(next);
  };
  const commitBankroll = (next: number) => {
    bankrollRef.current = next;
    setBankroll(next);
  };

  const place = (id: BetId, amount: number = chip): boolean => {
    if (dealingRef.current || !betAvailable(id, mode)) return false;
    if (amount > bankrollRef.current) {
      setMessage(t.noFunds);
      return false;
    }
    commitBankroll(bankrollRef.current - amount);
    commitBets({ ...betsRef.current, [id]: (betsRef.current[id] ?? 0) + amount });
    undoStack.current.push({ id, amount });
    setMessage(null);
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
    commitBankroll(bankrollRef.current + last.amount);
  };

  const clear = () => {
    while (undoStack.current.length > 0) undo();
  };

  const rebet = () => {
    for (const [id, amount] of Object.entries(lastBets.current) as [BetId, number][]) {
      const missing = amount - (betsRef.current[id] ?? 0);
      if (missing > 0 && betAvailable(id, mode)) place(id, missing);
    }
  };

  const switchMode = (next: Mode) => {
    if (next === mode || dealingRef.current) return;
    if (totalOnTable(betsRef.current) > 0) {
      setMessage(t.modeLocked);
      return;
    }
    setMode(next);
    setMessage(null);
  };

  const finish = (id: number, hand: Hand, returned: number, shoe: Shoe) => {
    commitBankroll(bankrollRef.current + returned);
    commitBets({});
    undoStack.current = [];
    const entry = roadEntry(hand);
    setRoads((r) => [...r, entry]);
    setStats((s) => ({
      hands: s.hands + 1,
      banker: s.banker + (hand.winner === 'banker' ? 1 : 0),
      player: s.player + (hand.winner === 'player' ? 1 : 0),
      tie: s.tie + (hand.winner === 'tie' ? 1 : 0),
      playerPairs: s.playerPairs + (entry.playerPair ? 1 : 0),
      bankerPairs: s.bankerPairs + (entry.bankerPair ? 1 : 0),
      naturals: s.naturals + (hand.natural ? 1 : 0),
    }));
    const finished = shoeFinished(shoe);
    // After the cut card the next hand comes from a new, unseen shoe.
    setUnseen(finished ? fullShoeCounts(shoe.decks) : unseenCounts(shoe));
    setShoeView((v) => ({ ...v, cardsLeft: shoe.cards.length - shoe.next, finished }));
    setRound((r) => (r && r.id === id ? { ...r, shown: cardsInHand(hand), settled: true } : r));
    dealingRef.current = false;
    setDealing(false);
  };

  const deal = () => {
    if (dealingRef.current) return;
    let shoe = shoeRef.current;
    const fresh = shoe === null || shoeFinished(shoe);
    if (fresh) {
      shoe = createShoe(DEFAULT_DECKS);
      shoeNumber.current++;
    }
    const { hand, shoe: after } = dealHand(shoe!);
    shoeRef.current = after;
    lastBets.current = { ...betsRef.current };
    const { results, returned } = settleBets(betsRef.current, hand, mode);
    dealingRef.current = true;
    setDealing(true);
    setMessage(null);
    if (fresh) setRoads([]);
    // "Cards left" still shows the count before this hand; it only drops when
    // the hand settles. Dropping it now would give away whether third cards
    // are coming before they are turned over.
    setShoeView((v) => ({
      number: shoeNumber.current,
      hand: fresh ? 1 : v.hand + 1,
      cardsLeft: fresh ? after.cards.length - shoe!.next : v.cardsLeft,
      burnCard: after.burnCard,
      burned: after.burned,
      finished: false,
    }));
    const id = ++roundId.current;
    setRound({ id, hand, shown: 0, settled: false, results, mode });

    const count = cardsInHand(hand);
    const { reveal, settle } = prefersReducedMotion()
      ? { reveal: new Array<number>(count).fill(0), settle: 0 }
      : revealSchedule(count);
    timers.current.forEach(clearTimeout);
    timers.current = reveal.map((ms, k) =>
      setTimeout(() => setRound((r) => (r && r.id === id ? { ...r, shown: Math.max(r.shown, k + 1) } : r)), ms),
    );
    timers.current.push(setTimeout(() => finish(id, hand, returned, after), settle));
  };

  const reset = () => {
    if (dealingRef.current) return;
    commitBankroll(INITIAL_BANKROLL);
    commitBets({});
    undoStack.current = [];
    lastBets.current = {};
    shoeRef.current = null;
    shoeNumber.current = 0;
    setRound(null);
    setMessage(null);
    setRoads([]);
    setStats(EMPTY_STATS);
    setShoeView(NO_SHOE);
    setUnseen(fullShoeCounts(DEFAULT_DECKS));
  };

  const live = useMemo(() => exactOdds(unseen), [unseen]);
  const unseenTotal = live.cards;
  const freshShoe = unseenTotal === DEFAULT_DECKS * 52;
  const exact = shoeOdds(DEFAULT_DECKS);

  const onTable = totalOnTable(bets);
  const net = Math.round((bankroll + onTable - INITIAL_BANKROLL) * 100) / 100;
  const settledHand = round?.settled ? round.hand : null;

  const handView = (side: Side) => {
    const cards = round ? round.hand[side] : [];
    const order = round ? dealOrder(round.hand)[side] : [];
    const visible = cards.filter((_, i) => order[i] < (round?.shown ?? 0));
    const total = visible.length > 0 ? handTotal(visible) : null;
    const won = settledHand?.winner === side;
    const natural = settledHand?.natural === true && visible.length === 2 && total !== null && total >= 8;
    return (
      <div
        className={styles.handBox}
        data-hand={side}
        data-won={won ? 'true' : undefined}
        role="group"
        aria-label={t.handAria(t.side[side], total)}
      >
        <div className={styles.handHead}>
          <span className={styles.handName}>{t.side[side]}</span>
          <span className={styles.handTotal} data-testid={`${side}-total`}>
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
    return (
      <button
        key={id}
        type="button"
        className={`${styles.spot} ${extraClass}`}
        onClick={() => place(id)}
        disabled={dealing}
        aria-label={t.betAria(t.betName[id], pays)}
        data-bet={id}
        data-lit={lit ? 'true' : undefined}
      >
        <span className={styles.spotLabel}>{t.betName[id]}</span>
        <span className={styles.spotPays}>{pays}</span>
        {amount > 0 && <span className={styles.chipBadge}>{money(amount)}</span>}
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
    odds: betOdds(oddsBetFor(id, mode), live),
  }));

  const statRow = (label: string, count: number, exactP: number, key: string) => (
    <div key={key}>
      <dt>{label}</dt>
      <dd>
        {count}
        <small>
          {' '}
          {stats.hands > 0 ? pct(count / stats.hands, 1) : '–'} · {pct(exactP)}
        </small>
      </dd>
    </div>
  );

  return (
    <div className={styles.playGrid}>
      <div className={styles.panel}>
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
                      {r.outcome === 'win' ? `+${money(r.profit)}` : r.outcome === 'lose' ? `−${money(r.stake)}` : '±0'}{' '}
                      <small>{t.outcome[r.outcome]}</small>
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

      <div className={styles.panel}>
        <div className={styles.pillRow}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.bankroll}</span>
            <span className={styles.pillValue} data-testid="baccarat-bankroll">
              {money(bankroll)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.onTable}</span>
            <span className={styles.pillValue} data-testid="baccarat-on-table">
              {money(onTable)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.net}</span>
            <span className={`${styles.pillValue} ${net >= 0 ? styles.pos : styles.neg}`}>
              {net > 0 ? '+' : ''}
              {money(net)}
            </span>
          </div>
        </div>

        <div className={styles.modeRow} role="radiogroup" aria-label={t.tableMode}>
          {(['commission', 'ez'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={styles.modeBtn}
              onClick={() => switchMode(m)}
              disabled={dealing}
            >
              {t.modeName[m]}
            </button>
          ))}
        </div>

        <div className={styles.chipRow} role="radiogroup" aria-label={t.chip}>
          <span className={styles.chipRowLabel}>{t.chip}:</span>
          {CHIP_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={chip === v}
              aria-label={`${t.chip} ${v}`}
              onClick={() => setChip(v)}
              disabled={dealing}
              className={styles.chip}
              style={{ ['--c' as string]: CHIP_COLORS[v], color: v === 100 || v === 500 ? '#fff' : '#1a1200' }}
            >
              {v}
            </button>
          ))}
        </div>

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

        <p className={styles.message} role="status" data-testid="baccarat-message">
          {message ?? ''}
        </p>

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={deal} disabled={dealing}>
            {dealing ? t.dealing : t.deal}
          </button>
          <button type="button" className={styles.btn} onClick={undo} disabled={dealing}>
            {t.undo}
          </button>
          <button type="button" className={styles.btn} onClick={clear} disabled={dealing}>
            {t.clear}
          </button>
          <button type="button" className={styles.btn} onClick={rebet} disabled={dealing}>
            {t.rebet}
          </button>
          <button type="button" className={`${styles.btn} ${styles.spacerLeft}`} onClick={reset} disabled={dealing}>
            {t.reset}
          </button>
        </div>

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
  );
};
