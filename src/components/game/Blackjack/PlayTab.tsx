'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { REFILL } from '../MedalCenter/ledger';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { upcard, type ActionEvs, type Value } from './analysis';
import {
  BLACKJACK_PAYS,
  DECKS,
  basicStrategy,
  cardValue,
  handValue,
  hiLo,
  insuranceCost,
  legalActions,
  naturalWin,
  needsShuffle,
  totalStaked,
  trueCount,
  type Action,
  type Round,
} from './engine';
import { useCountUp } from '../MedalCenter/countUp';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { KeysHint } from '../MedalCenter/KeysHint';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { HoleCard, PlayingCard } from './Cards';
import { getStrings } from './i18n';
import { MedalCounter, MedalStack } from './MedalCounter';
import { DEFAULT_BET, GAME, MAX_BET, MIN_BET, NOTICE_KEY, createMedalTable, freshTable, unsettled, type MedalTable, type Shelf, type Step, type TableSave } from './medalTable';
import { spreadUnits } from './sim';
import styles from './Blackjack.module.css';

const ACTIONS: Action[] = ['hit', 'stand', 'double', 'split'];

/** The keys of the four moves, on a desktop: H hit, S stand, D double, P split. */
export const KEY_ACTIONS: Readonly<Record<string, Action>> = { h: 'hit', s: 'stand', d: 'double', p: 'split' };

/** Animation pacing (ms): the opening deal, the hole-card flip, each dealer draw, the pause before the hand is settled. */
export const TIMING = { deal: 800, dealStep: 170, flip: 450, draw: 520, settle: 450 } as const;

/** When a dealt card shows its face, from the start of its slide out of the shoe (ms; the `bjDeal` animation). */
const FACE_SHOWS = 460;
/** When the hole card shows its face as it is turned over (ms; the `bjFlip` animation). */
const HOLE_FACE_SHOWS = 230;

/**
 * How long the table waits for the medal center's card before it says that the medals are in a machine in another
 * tab, in seconds. The card is away for a moment whenever another page takes the day's bonus or the like.
 */
export const CARD_WAIT = 1.5;

/** How long the table waits before it tries again to put back a hand's medals that this browser would not save, in ms. */
export const RETRY_SAVE = 3000;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** How many medals high a stake is drawn: one for one medal, then one more each time it doubles, up to five. */
export const stackHeight = (medals: number) => Math.max(1, Math.min(5, Math.ceil(Math.log2(medals + 1))));

/** The table is kept in this browser's storage. */
const localShelf: Shelf = {
  read: (key) => window.localStorage.getItem(key),
  write: (key, text) => window.localStorage.setItem(key, text),
};

interface View {
  /** Dealer cards on the table (the rest of the dealer's hand is still to be drawn). */
  dealerShown: number;
  holeUp: boolean;
  /** The round's result has been shown. */
  settled: boolean;
  /** The opening deal is still animating (cards get staggered delays). */
  opening: boolean;
}

const IDLE: View = { dealerShown: 0, holeUp: false, settled: false, opening: false };

/** How a table read back looks: a hand still in play as it stands, a played-out hand with its result. */
const viewOf = (save: TableSave): View =>
  !save.round
    ? IDLE
    : save.round.phase === 'done'
      ? { dealerShown: save.round.dealer.length, holeUp: true, settled: true, opening: false }
      : { dealerShown: 2, holeUp: false, settled: false, opening: false };

/** What the last hand won, for the WIN digits: only a hand played out and settled, and only a win. */
const wonBy = (save: TableSave): number | null => (save.round?.phase === 'done' && save.paid && save.round.result ? Math.max(0, save.round.result.net) : null);

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** Legal actions the player's medals can also cover (doubling and splitting take another stake). */
const affordable = (r: Round, medals: number) => {
  const hand = r.hands[r.active];
  const legal = legalActions(r);
  return { ...legal, double: legal.double && medals >= hand.bet, split: legal.split && medals >= r.bet };
};

export const PlayTab = ({ shown = true }: { shown?: boolean } = {}) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);

  // The medals are the medal center's, and so is the card that lets this table play with them (MedalCenter/bank.ts).
  const bankState = useBank();
  const seat = useRef<Seat | null>(null);
  const tableRef = useRef<MedalTable | null>(null);
  /** The table at the medal center: made the first time it is needed, which is never on the server. */
  const table = (): MedalTable =>
    (tableRef.current ??= createMedalTable({ bank: medalBank(), shelf: localShelf, holding: () => seat.current?.holding() ?? false }));

  const [save, setSave] = useState<TableSave>(() => freshTable(0));
  /** Whose table is on the page: an account's id, null for a guest's, undefined until the player's medals are found. */
  const [openedFor, setOpenedFor] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<View>(IDLE);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [showCount, setShowCount] = useState(false);
  /** Changes every deal, so each round's cards mount (and animate) fresh. */
  const [dealNo, setDealNo] = useState(0);
  const [won, setWon] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [notice, setNotice] = useState(false);
  const [longWait, setLongWait] = useState(false);
  // The floor's machine sounds (MedalCenter/machineSounds.ts): off on every visit, on with the switch beside the shoe.
  const sound = useMachineSound();
  /** A sound of the table, `delay` ms from now, when the sound is on. */
  const play = sound.play;

  // Refs mirror what click handlers and timers read synchronously.
  const saveRef = useRef(save);
  const busyRef = useRef(false);
  const roundId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** The dealer's cards are being shown: the hand's medals are put back once they all are. */
  const revealing = useRef(false);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const commitSave = (next: TableSave) => {
    saveRef.current = next;
    setSave(next);
  };
  const commitBusy = (next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };
  /** Stops whatever was being shown of the hand before. */
  const stopShowing = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    roundId.current++;
    revealing.current = false;
  };
  const say = (text: string, error = true) => setMessage({ text, error });

  /** Puts a table read back on the page as it stands. */
  const adopt = (next: TableSave, said: string | null = null) => {
    stopShowing();
    setDealNo(roundId.current);
    commitSave(next);
    setView(viewOf(next));
    setBet(next.bet);
    commitBusy(false);
    setWon(wonBy(next));
    setMessage(said ? { text: said, error: false } : null);
  };

  const refused = (step: Extract<Step, { ok: false }>) => {
    if (step.why === 'short') say(t.noMedals);
    else if (step.why === 'unsaved') say(t.unsavedBet);
    else if (step.why === 'moved') adopt(step.save);
  };

  /** Puts back what a played-out hand brings back, once (medalTable.ts says how once). */
  const payOut = () => {
    // What the hand brings back runs into the medals on the counter's digits.
    if ((saveRef.current.round?.result?.returned ?? 0) > 0) live.current.payMedals();
    const step = table().settle();
    if (step.ok) {
      commitSave(step.save);
      setWon(wonBy(step.save));
      const result = step.save.round?.result;
      if (result) {
        const natural = result.hands.some((h) => h.outcome === 'blackjack');
        // A loss, and a push, are silent, as on the machines.
        if (result.net > 0) play(natural ? 'big' : 'win');
      }
      setMessage((was) => (was?.text === t.unsavedReturn ? null : was));
      return;
    }
    if (step.why === 'moved') adopt(step.save);
    else if (step.why === 'unsaved') {
      // Nothing was put back, so that nothing can come back twice: tried again in a moment.
      say(t.unsavedReturn);
      later(RETRY_SAVE, () => live.current.reconcile());
    }
    // Otherwise this page does not hold the card just now, and the medals are put back as soon as it does (`reconcile`).
  };

  /**
   * With the card: the table as another tab, or the medal center's reset, has left it; and a hand that was played
   * out while the card was elsewhere has its medals put back. `regranted`: the card has just come back to this page
   * (medalTable.ts `refresh`).
   */
  const reconcile = (regranted = false) => {
    const tbl = table();
    if (tbl.owner() === undefined || !(seat.current?.holding() ?? false)) return;
    if (tbl.refresh(regranted)) adopt(tbl.current());
    const now = tbl.current();
    if (!revealing.current && now.round?.phase === 'done' && !now.paid) payOut();
  };

  /** The player's medals were found: their table is opened, as this browser keeps it. A hand left in play carries on. */
  const openTable = (owner: string | null) => {
    const tbl = table();
    if (tbl.owner() !== owner) {
      const opened = tbl.open(owner);
      adopt(opened, opened.round && opened.round.phase !== 'done' ? t.resumed : null);
      setOpenedFor(owner);
    }
    reconcile();
  };

  /** The medal center was reset, here or anywhere: the medals on the table went with the rest, and the table starts over. */
  const afterReset = () => {
    const tbl = table();
    if (tbl.owner() === undefined) return;
    // With the card it is written as started over now; without it, as soon as the card comes back (`reconcile`).
    tbl.refresh();
    const now = tbl.current();
    adopt(now.round === null ? now : freshTable(now.era, now.stats, now.bet));
    setAnnouncement(t.sayReset);
  };

  /** The first time this browser shows the table since it came onto the medal floor, it says so, once. */
  const showNoticeOnce = () => {
    try {
      if (window.localStorage.getItem(NOTICE_KEY) !== null) return;
      window.localStorage.setItem(NOTICE_KEY, 'seen');
    } catch {
      return;
    }
    setNotice(true);
  };

  // A win runs into the medals on the counter's LED digits, as a machine's meter counts it up (MedalCenter/countUp.ts),
  // each medal with its chirp; WIN shows the whole win at once. Every bet and every stake shows at once. The meter
  // shows the medals once the player's table is open (`open`, below).
  const medalMeter = useCountUp(
    bankState.loaded && bankState.where !== 'checking' && openedFor !== undefined && openedFor === bankState.owner ? bankState.balance : null,
    sound.tick,
  );
  const payMedals = medalMeter.pay;

  const live = useRef({ reconcile, openTable, afterReset, showNoticeOnce, t, payMedals: () => {} });
  useEffect(() => {
    live.current = { reconcile, openTable, afterReset, showNoticeOnce, t, payMedals };
  });

  useEffect(() => {
    live.current.showNoticeOnce();
  }, []);

  // The table's place at the medal center. It asks for the card as it is set up and plays with the player's medals
  // while it holds it. Everything at the table is written down as it happens, so there is nothing more to write as
  // the card goes; when it comes back, the table looks at what another tab or a reset has done meanwhile.
  useEffect(() => {
    const purse = medalBank();
    const mine = purse.sit(GAME, {
      // Looked at once the medal center has finished handing the card over and says so.
      granted: () =>
        queueMicrotask(() => {
          if (seat.current === mine) live.current.reconcile(true);
        }),
      yielding: () => undefined,
    });
    seat.current = mine;
    const unlisten = purse.listen((event) => {
      if (event.type === 'reset') queueMicrotask(() => live.current.afterReset());
      else if (event.type === 'refill') setAnnouncement(live.current.t.sayRefill(event.medals));
    });
    return () => {
      unlisten();
      if (seat.current === mine) seat.current = null;
      mine.leave();
    };
  }, []);

  // Whose medals: the table is opened once they are found, and again for another player's (signing in or out).
  const ready = bankState.loaded && bankState.where !== 'checking';
  useEffect(() => {
    if (ready) live.current.openTable(bankState.owner);
  }, [ready, bankState.owner]);

  // While the card is in another tab's machine, the table says so, a moment after (the card goes away for a moment
  // whenever another page takes the day's bonus or the like, and nothing need be said of that).
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = bankState.card === 'away' || (bankState.card === 'asking' && longWait);

  /** Turns the hole card, draws the dealer's cards one by one, then settles the hand. */
  const playDealer = (r: Round, startDelay: number) => {
    commitBusy(true);
    revealing.current = true;
    const fast = prefersReducedMotion();
    const flip = fast ? 0 : TIMING.flip;
    const draw = fast ? 0 : TIMING.draw;
    const pause = fast ? 0 : TIMING.settle;
    const id = roundId.current;
    const guard = (fn: () => void) => () => {
      if (roundId.current === id) fn();
    };
    later(
      startDelay,
      guard(() => {
        setView((v) => ({ ...v, holeUp: true, opening: false }));
        play('card');
      }),
    );
    // Each further dealer card lands `draw` ms after the previous one; settle once the last has landed.
    let at = startDelay + flip;
    for (let k = 3; k <= r.dealer.length; k++) {
      const shown = k;
      later(
        at,
        guard(() => {
          setView((v) => ({ ...v, dealerShown: shown }));
          play('card');
        }),
      );
      at += draw;
    }
    later(
      at + pause,
      guard(() => {
        revealing.current = false;
        setView((v) => ({ ...v, dealerShown: r.dealer.length, holeUp: true, settled: true, opening: false }));
        commitBusy(false);
        payOut();
      }),
    );
  };

  const holdingCard = bankState.card === 'here';
  const open = ready && openedFor !== undefined && openedFor === bankState.owner;
  const round = save.round;
  const inRound = unsettled(save) || (round !== null && !view.settled);
  const canBet = open && holdingCard && !inRound && !busy;
  const medals = bankState.balance;

  const deal = () => {
    if (busyRef.current || !canBet) return;
    if (bet < MIN_BET) {
      say(t.placeBet);
      return;
    }
    if (bet > medals) {
      say(t.noMedals);
      return;
    }
    const step = table().deal(bet);
    if (!step.ok) {
      refused(step);
      return;
    }
    stopShowing();
    setDealNo(roundId.current);
    commitSave(step.save);
    setMessage(null);
    setWon(null);
    setNotice(false);
    const r = step.save.round!;
    const fast = prefersReducedMotion();
    // The opening deal: player, dealer, player, the hole card; each slides out of the shoe in turn.
    for (let i = 0; i < 4; i++) play('card', (80 + (fast ? 0 : i * TIMING.dealStep)) / 1000);
    setView({ dealerShown: 2, holeUp: false, settled: false, opening: !fast });
    const opening = fast ? 0 : TIMING.deal;
    if (r.phase === 'done') {
      playDealer(r, opening);
    } else {
      commitBusy(!fast);
      const id = roundId.current;
      later(opening, () => {
        if (roundId.current !== id) return;
        setView((v) => ({ ...v, opening: false }));
        commitBusy(false);
      });
    }
  };

  const onAction = (action: Action) => {
    const r = saveRef.current.round;
    if (busyRef.current || !r || r.phase !== 'player' || !holdingCard) return;
    const can = affordable(r, medals);
    if (!can[action]) {
      if (legalActions(r)[action]) say(t.noMedals);
      return;
    }
    const hand = r.hands[r.active];
    const chart = basicStrategy(hand.cards, r.dealer[0], can);
    const step = table().act(action, chart === action);
    if (!step.ok) {
      refused(step);
      return;
    }
    commitSave(step.save);
    setMessage(null);
    if (action === 'double' || action === 'split') play('chip');
    if (action !== 'stand') play('card', action === 'hit' ? 0 : 0.12);
    // Let the last player card land before the dealer turns the hole card.
    const next = step.save.round!;
    if (next.phase === 'done') playDealer(next, prefersReducedMotion() ? 0 : TIMING.draw);
  };

  const onInsurance = (take: boolean) => {
    const r = saveRef.current.round;
    if (busyRef.current || !r || r.phase !== 'insurance' || !holdingCard) return;
    if (take && insuranceCost(r) > medals) {
      say(t.noMedals);
      return;
    }
    const step = table().insure(take);
    if (!step.ok) {
      refused(step);
      return;
    }
    if (take) play('chip');
    commitSave(step.save);
    setMessage(null);
    const next = step.save.round!;
    if (next.phase === 'done') playDealer(next, 0);
  };

  /** 1 BET: one more medal on the bet, up to the table's most. */
  const addOne = () => {
    if (!canBet || bet >= MAX_BET) return;
    if (bet + 1 > medals) {
      say(t.noMedals);
      return;
    }
    setBet(bet + 1);
    setMessage(null);
    play('chip');
  };
  /** MAX BET: the table's most, or every medal the player has if that is fewer. */
  const maxBet = () => {
    if (!canBet) return;
    const most = Math.min(MAX_BET, medals);
    if (most < MIN_BET) {
      say(t.noMedals);
      return;
    }
    setBet(most);
    setMessage(null);
    play('chip');
  };
  const clearBet = () => {
    if (!canBet) return;
    setBet(0);
    setMessage(null);
  };

  const clearRecord = () => {
    const step = table().clearRecord();
    if (step.ok) commitSave(step.save);
    else refused(step);
  };

  const playing = round?.phase === 'player' && !busy && holdingCard;

  // On a desktop, the table's keys: Space or Enter deals, H hits, S stands, D doubles, P splits, I and N answer the
  // insurance, B bets one more and M bets the most (MedalCenter/machineKeys.ts, as the floor's other machines have).
  // Each press does only what its button would do now (each handler checks that), and nothing otherwise.
  useMachineKeys(shown, (key) => {
    if (key === ' ' || key === 'Enter') {
      deal();
      return true;
    }
    const move = KEY_ACTIONS[key];
    if (move) {
      onAction(move);
      return true;
    }
    if (key === 'i' || key === 'n') {
      onInsurance(key === 'i');
      return true;
    }
    if (key === 'b') {
      addOne();
      return true;
    }
    if (key === 'm') {
      maxBet();
      return true;
    }
    return false;
  });
  const active = round && round.phase === 'player' ? round.hands[round.active] : null;
  const can = round && round.phase === 'player' ? affordable(round, medals) : null;
  const hint = active && can ? basicStrategy(active.cards, round!.dealer[0], can) : null;

  const evs = useMemo<ActionEvs | null>(() => {
    if (!round || round.phase !== 'player') return null;
    const hand = round.hands[round.active];
    const legal = legalActions(round);
    const a = upcard(cardValue(round.dealer[0]) as Value);
    const v = handValue(hand.cards);
    const out: ActionEvs = { stand: a.stand(v.total), hit: a.hit(v) };
    if (legal.double) out.double = a.double(v);
    if (legal.split) out.split = a.split(cardValue(hand.cards[0]) as Value);
    return out;
  }, [round]);
  const bestEv = evs ? Math.max(...Object.values(evs)) : 0;

  // On the table: the bet waiting for the next deal, or every stake of the hand being played.
  const onTable = round && inRound ? totalStaked(round) : bet;
  const result = view.settled ? (round?.result ?? null) : null;

  const dealerCards = round ? round.dealer.slice(0, view.dealerShown) : [];
  // Count only cards already on the table: the dealer's next cards are drawn in
  // the engine before they are shown, and must not leak through this number.
  const cardsOut = round ? round.hands.reduce((n, h) => n + h.cards.length, 0) + dealerCards.length : 0;
  const shownLeft = save.left !== null && round ? save.left - cardsOut : null;
  // The count of what a player at the table has seen: never the hole card before it is turned. A hand settled is in
  // the table's count already.
  const seenThisRound =
    round && !save.paid ? [...round.hands.flatMap((h) => h.cards), ...dealerCards.filter((_, i) => i !== 1 || view.holeUp)].reduce((n, card) => n + hiLo(card), 0) : 0;
  const running = save.count + seenThisRound;
  const tc = shownLeft !== null ? trueCount(running, shownLeft) : 0;
  const dealerTotal = round && view.holeUp ? handValue(dealerCards) : round ? handValue(round.dealer.slice(0, 1)) : null;
  const delay = (i: number) => (view.opening ? i * TIMING.dealStep : 0);
  // A total is shown as the card it counts turns face up, not as the card leaves the shoe: the opening deal's upcard,
  // the hole card turned over (a quick flip), or a card drawn.
  const dealerTotalDelay = view.opening ? delay(1) + FACE_SHOWS : view.holeUp && dealerCards.length === 2 ? HOLE_FACE_SHOWS : FACE_SHOWS;
  const shuffleNext = view.settled && save.shoe !== null && needsShuffle(save.shoe);

  const calloutClass = !result ? styles.calloutIdle : result.net > 0 ? styles.calloutWin : result.net < 0 ? styles.calloutLose : styles.calloutPush;
  const callout = !round
    ? t.placeBet
    : round.phase === 'insurance'
      ? t.insuranceQuestion(t.medals(String(insuranceCost(round))))
      : round.phase === 'player'
        ? busy
          ? t.dealing
          : t.yourMove
        : result
          ? t.resultSummary(t.medalsSigned(signed(result.net)), result.dealerTotal, result.dealerBust, result.dealerBlackjack)
          : t.dealerPlays;
  const half = (n: number) => (Number.isInteger(n) ? String(n) : language === 'ja' ? n.toFixed(1) : `${Math.floor(n)}½`);

  return (
    <>
      {notice && (
        <aside className={styles.notice} aria-labelledby="bj-notice-title" data-testid="bj-notice">
          <h2 id="bj-notice-title" className={styles.noticeTitle}>
            {t.noticeTitle}
          </h2>
          <p>{t.noticeBody}</p>
          <div className={styles.noticeActions}>
            <Link href={MEDAL_CENTER_PATH} className={styles.noticeLink} data-testid="bj-notice-center">
              {t.noticeLink}
            </Link>
            <button type="button" className={styles.btn} onClick={() => setNotice(false)} data-testid="bj-notice-dismiss">
              {t.noticeDismiss}
            </button>
          </div>
        </aside>
      )}

      <div className={styles.playGrid}>
        <div className={styles.panel}>
          <div className={styles.tableTop}>
            <div className={styles.shoeBar} data-testid="shoe-info">
              {shownLeft === null ? t.newShoe : t.shoeLabel(shownLeft)}
            </div>
            <SoundSwitch control={sound} language={language} className={styles.soundToggle} testId="bj-sound" />
          </div>

          <div className={styles.table} data-testid="bj-table">
            <div className={styles.shoeBox} aria-hidden="true">
              <span className={styles.shoeCards} />
            </div>
            <div className={styles.area} data-area="dealer" role="group" aria-label={t.dealer}>
              <div className={styles.areaHead}>
                <span className={styles.areaName}>{t.dealer}</span>
                {dealerTotal && (
                  <span
                    key={`${dealNo}-dt-${dealerCards.length}-${view.holeUp}`}
                    className={`${styles.totalBadge} ${styles.totalLate}`}
                    style={{ animationDelay: `${dealerTotalDelay}ms` }}
                    data-testid="dealer-total"
                  >
                    {t.total(dealerTotal.total, view.holeUp && dealerTotal.soft && dealerTotal.total < 21)}
                  </span>
                )}
              </div>
              <div className={styles.cardRow}>
                {dealerCards.map((c, i) =>
                  i === 1 && !view.holeUp ? (
                    <HoleCard key={`${dealNo}-hole`} delay={delay(3)} label={t.holeCard} />
                  ) : (
                    <PlayingCard key={`${dealNo}-d${i}-${c.rank}${c.suit}`} card={c} delay={i === 0 ? delay(1) : 0} flip={i === 1} />
                  ),
                )}
              </div>
            </div>

            <div className={styles.feltPrint} aria-hidden="true">
              <span className={styles.feltPays}>{t.feltPays}</span>
              <span className={styles.feltRules}>{t.feltRules}</span>
            </div>

            <div className={styles.area} data-area="player" role="group" aria-label={t.you}>
              <div className={styles.handsRow}>
                {round ? (
                  round.hands.map((h, hi) => {
                    const v = handValue(h.cards);
                    const outcome = result?.hands[hi]?.outcome;
                    const paid = Math.max(0, result?.hands[hi]?.profit ?? 0);
                    return (
                      <div
                        key={hi}
                        className={styles.hand}
                        data-hand={hi}
                        data-active={round.phase === 'player' && hi === round.active && round.hands.length > 1 ? 'true' : undefined}
                        data-outcome={outcome}
                      >
                        <div className={styles.cardRow}>
                          {h.cards.map((c, ci) => (
                            <PlayingCard key={`${dealNo}-h${hi}-${ci}-${c.rank}${c.suit}`} card={c} delay={hi === 0 && ci < 2 ? delay(ci * 2) : 0} />
                          ))}
                        </div>
                        <div className={styles.handFoot}>
                          <span
                            key={`${dealNo}-t${hi}-${h.cards.length}`}
                            className={`${styles.totalBadge} ${styles.totalLate}`}
                            style={{ animationDelay: `${view.opening && hi === 0 ? delay(2) + FACE_SHOWS : FACE_SHOWS}ms` }}
                            data-testid={`hand-total-${hi}`}
                          >
                            {v.total > 21 ? t.bust : !h.split && h.cards.length === 2 && v.total === 21 ? t.blackjack : t.total(v.total, v.soft && v.total < 21)}
                          </span>
                          {outcome && (
                            <span className={styles.outcomeTag} data-outcome={outcome}>
                              {t.outcome[outcome]}
                            </span>
                          )}
                          {/* The stake, a stack of medals on the spot. When the hand is settled the dealer pays a win beside it, or takes it. */}
                          <span className={styles.stakes}>
                            <span className={styles.stake} data-outcome={outcome} role="img" title={t.bet} aria-label={`${t.bet}: ${t.medals(String(h.bet))}`}>
                              <MedalStack count={stackHeight(h.bet)} className={styles.stakeStack} />
                              <span className={styles.stakeCount}>{h.bet}</span>
                            </span>
                            {paid > 0 && (
                              <span className={`${styles.stake} ${styles.stakePaid}`} aria-hidden="true" data-testid={`hand-paid-${hi}`}>
                                <MedalStack count={stackHeight(paid)} className={styles.stakeStack} />
                                <span className={styles.stakeCount}>+{paid}</span>
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.waitingCircle}>
                    {bet > 0 ? (
                      <span className={styles.stake}>
                        <MedalStack count={stackHeight(bet)} className={styles.stakeStack} />
                        <span className={styles.stakeCount}>{bet}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* The player's medals are in a machine in another tab: this table waits, with its hand, until it is played here again. */}
            {cardAway && (
              <div className={styles.cardAway} role="status" data-testid="bj-card-away">
                <p>{t.cardAway}</p>
                <button type="button" className={styles.cardAwayButton} data-testid="bj-play-here" onClick={() => seat.current?.play()}>
                  {t.playHere}
                </button>
              </div>
            )}
          </div>

          <div className={styles.callout} aria-live="polite" data-testid="bj-callout">
            <span className={calloutClass}>{callout}</span>
          </div>
          {shuffleNext && <p className={styles.cutNote}>{t.shuffleNext}</p>}

          {/* Room for one line of results is kept, so the buttons under the table do not move as a hand is settled. */}
          <div className={styles.resultArea}>
            {result && (
              <ul className={styles.resultList} data-testid="bj-results">
                {result.hands.map((h, i) => (
                  <li key={i} data-positive={h.profit > 0 ? 'true' : undefined} data-negative={h.profit < 0 ? 'true' : undefined}>
                    <span>
                      {result.hands.length > 1 ? `${t.handLabel(i + 1)} · ` : ''}
                      {t.outcome[h.outcome]}
                    </span>
                    <span className={styles.resultAmount}>{signed(h.profit)}</span>
                  </li>
                ))}
                {result.insurance && (
                  <li data-positive={result.insurance.profit > 0 ? 'true' : undefined} data-negative={result.insurance.profit < 0 ? 'true' : undefined}>
                    <span>{t.insurance}</span>
                    <span className={styles.resultAmount}>{signed(result.insurance.profit)}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/*
          The machine's front: the medal counter, the buttons, then the rest. On a desk it is one panel beside the
          table. On a phone the buttons come straight under the table, as a machine's buttons sit under its screen, so
          the cards and the buttons that play them are on the screen together; the counter follows them.
        */}
        <div className={styles.front}>
          <div className={`${styles.frontPart} ${styles.counterPart}`}>
            <MedalCounter
              t={t}
              loaded={open}
              kept={bankState.kept}
              medals={medals}
              onTable={open ? onTable : null}
              won={won}
              format={fmt}
              ledMedals={medalMeter.shown}
            />
            <Link href={MEDAL_CENTER_PATH} className={styles.counterLink} data-testid="bj-center-link">
              {t.noticeLink}
            </Link>
          </div>

          <div className={`${styles.frontPart} ${styles.buttonsPart}`} data-testid="bj-buttons">
            {/* Out of medals: the medal center's free refill, right by the buttons it lets the player press again. */}
            {open && holdingCard && medals === 0 && !inRound && (
              <button type="button" className={styles.refill} data-testid="bj-refill" onClick={() => medalBank().refill()}>
                {t.refill(REFILL)}
              </button>
            )}
            <div className={styles.betRow}>
              <button type="button" className={styles.betCircle} onClick={addOne} disabled={!canBet || bet >= MAX_BET} aria-label={t.betAria(t.medals(String(bet)))}>
                <span className={styles.betCircleLabel}>{t.bet}</span>
                <span className={styles.betAmount} data-testid="bj-bet">
                  {bet}
                </span>
              </button>
              <div className={styles.betButtons}>
                <button type="button" className={styles.btn} onClick={addOne} disabled={!canBet || bet >= MAX_BET} title={t.oneBetAria} data-testid="bj-one-bet">
                  {t.oneBet}
                </button>
                <button type="button" className={styles.btn} onClick={maxBet} disabled={!canBet} title={t.maxBetAria(MAX_BET)} data-testid="bj-max-bet">
                  {t.maxBet}
                </button>
                <button type="button" className={styles.btn} onClick={clearBet} disabled={!canBet}>
                  {t.clearBet}
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={deal} disabled={!canBet}>
                  {t.deal}
                </button>
              </div>
            </div>
            <p className={styles.betNote} data-testid="bj-bet-note">
              {t.betRange(MIN_BET, MAX_BET)}
              {bet % 2 === 1 && <> {t.oddBet(bet, naturalWin(bet, true), half(bet * BLACKJACK_PAYS))}</>}
            </p>

            {round?.phase === 'insurance' && !busy && (
              <div className={styles.insuranceBox} data-testid="bj-insurance">
                <span>{t.insuranceQuestion(t.medals(String(insuranceCost(round))))}</span>
                <div className={styles.actions} style={{ marginTop: 0 }}>
                  <button type="button" className={styles.btn} onClick={() => onInsurance(true)} disabled={!holdingCard}>
                    {t.insuranceYes}
                  </button>
                  <button type="button" className={styles.btn} onClick={() => onInsurance(false)} disabled={!holdingCard} data-hint={showHint ? 'true' : undefined}>
                    {t.insuranceNo}
                  </button>
                </div>
                {showHint && <span className={styles.muted}>{t.insuranceAdvice}</span>}
              </div>
            )}

            <div className={styles.actionRow} role="group" aria-label={t.yourMove}>
              {ACTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={styles.actionBtn}
                  data-action={a}
                  data-hint={showHint && playing && hint === a ? 'true' : undefined}
                  onClick={() => onAction(a)}
                  disabled={!playing || !can?.[a]}
                >
                  {t.action[a]}
                </button>
              ))}
            </div>

            <p className={`${styles.message} ${message?.error ? styles.messageError : ''}`} role="status" data-testid="bj-message">
              {message?.text ?? ''}
            </p>
            <KeysHint text={t.keysHint} className={styles.keysHint} testId="bj-keys" />
          </div>

          <div className={`${styles.frontPart} ${styles.morePart}`}>
            <div className={styles.hintRow}>
              <label className={styles.hintToggle}>
                <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
                {t.hintToggle}
              </label>
              {showHint && playing && hint && (
                <span className={styles.hintText} data-testid="bj-hint">
                  {t.hintSays(t.action[hint])}
                </span>
              )}
            </div>

            <div className={styles.hintRow} style={{ marginTop: '0.4rem' }}>
              <label className={styles.hintToggle}>
                <input type="checkbox" checked={showCount} onChange={(e) => setShowCount(e.target.checked)} />
                {t.countToggle}
              </label>
            </div>
            {showCount && (
              <section className={styles.countPanel} data-testid="bj-count">
                <div className={styles.countGrid}>
                  <div>
                    <span className={styles.statLabel}>{t.runningCount}</span>
                    <b data-testid="bj-running-count">
                      {running > 0 ? '+' : ''}
                      {running}
                    </b>
                  </div>
                  <div>
                    <span className={styles.statLabel}>{t.decksLeft}</span>
                    <b>{shownLeft === null ? DECKS.toFixed(1) : (shownLeft / 52).toFixed(1)}</b>
                  </div>
                  <div>
                    <span className={styles.statLabel}>{t.trueCountLabel}</span>
                    <b data-testid="bj-true-count">
                      {tc > 0 ? '+' : ''}
                      {tc.toFixed(1)}
                    </b>
                  </div>
                </div>
                <p className={styles.note}>
                  <b>{t.countBet(spreadUnits(tc))}</b> · {t.countNote}
                </p>
              </section>
            )}

            {evs && playing && (
              <section className={styles.evPanel} aria-labelledby="bj-ev-title" data-testid="bj-ev">
                <h3 id="bj-ev-title" className={styles.evTitle}>
                  {t.evTitle}
                </h3>
                <ul className={styles.evList}>
                  {(Object.entries(evs) as [Action, number][]).map(([a, ev]) => {
                    const clamped = Math.max(-2, Math.min(2, ev));
                    return (
                      <li key={a} className={styles.evItem} data-ev={a} data-best={Math.abs(ev - bestEv) < 1e-12 ? 'true' : undefined}>
                        <span>{t.action[a]}</span>
                        <span className={styles.evTrack} aria-hidden="true">
                          <span
                            className={styles.evBar}
                            style={{
                              left: `${50 + Math.min(0, clamped) * 25}%`,
                              width: `${Math.abs(clamped) * 25}%`,
                              background: ev >= 0 ? 'var(--bj-win)' : 'var(--bj-lose)',
                            }}
                          />
                        </span>
                        <span className={styles.evValue}>
                          {ev > 0 ? '+' : ''}
                          {ev.toFixed(3)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className={styles.note}>{t.evNote}</p>
              </section>
            )}

            <ul className={styles.hint}>
              {t.hint.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>

            <div className={styles.statsHead}>
              <div className={styles.sectionLabel}>{t.statsTitle}</div>
              <button type="button" className={styles.linkButton} onClick={clearRecord} disabled={!open || !holdingCard || save.stats.hands + save.stats.decisions === 0}>
                {t.clearRecord}
              </button>
            </div>
            <dl className={styles.statList} data-testid="bj-stats">
              <div>
                <dt>{t.hands}</dt>
                <dd>{save.stats.hands}</dd>
              </div>
              <div>
                <dt>{t.winsPushesLosses}</dt>
                <dd>
                  {save.stats.wins} / {save.stats.pushes} / {save.stats.losses}
                </dd>
              </div>
              <div>
                <dt>{t.blackjacks}</dt>
                <dd>{save.stats.blackjacks}</dd>
              </div>
              <div>
                <dt>{t.agreement}</dt>
                <dd>{save.stats.decisions > 0 ? `${Math.round((save.stats.agreed / save.stats.decisions) * 100)}%` : '–'}</dd>
              </div>
              <div>
                <dt>{t.statNet}</dt>
                <dd className={save.stats.net > 0 ? styles.pos : save.stats.net < 0 ? styles.neg : undefined} data-testid="bj-net">
                  {signed(save.stats.net)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="bj-announcement">
        {announcement}
      </p>
    </>
  );
};
