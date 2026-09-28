'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { upcard, type ActionEvs, type Value } from './analysis';
import {
  DECKS,
  act as playAction,
  answerInsurance,
  basicStrategy,
  cardValue,
  cardsLeft,
  createShoe,
  handValue,
  hiLo,
  legalActions,
  needsShuffle,
  startRound,
  totalStaked,
  trueCount,
  type Action,
  type Round,
  type Shoe,
} from './engine';
import { HoleCard, PlayingCard } from './Cards';
import { getStrings } from './i18n';
import { spreadUnits } from './sim';
import styles from './Blackjack.module.css';

export const INITIAL_BANKROLL = 1000;
export const DEFAULT_BET = 10;
export const CHIP_VALUES = [5, 10, 25, 100, 500] as const;
const CHIP_COLORS: Record<number, string> = { 5: '#ef4444', 10: '#3b82f6', 25: '#22c55e', 100: '#1a1a1f', 500: '#a855f7' };
const ACTIONS: Action[] = ['hit', 'stand', 'double', 'split'];

/** Animation pacing (ms): the opening deal, the hole-card flip, each dealer draw, the pause before paying. */
export const TIMING = { deal: 800, dealStep: 170, flip: 450, draw: 520, settle: 450 } as const;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

interface View {
  /** Dealer cards on the table (the rest of the dealer's hand is still to be drawn). */
  dealerShown: number;
  holeUp: boolean;
  /** The round's result has been paid and shown. */
  settled: boolean;
  /** The opening deal is still animating (cards get staggered delays). */
  opening: boolean;
}

interface Stats {
  hands: number;
  wins: number;
  pushes: number;
  losses: number;
  blackjacks: number;
  decisions: number;
  agreed: number;
}

const EMPTY_STATS: Stats = { hands: 0, wins: 0, pushes: 0, losses: 0, blackjacks: 0, decisions: 0, agreed: 0 };

const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};
const signedMoney = (n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : '±0');

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const [bankroll, setBankroll] = useState(INITIAL_BANKROLL);
  const [chip, setChip] = useState<number>(10);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [round, setRound] = useState<Round | null>(null);
  const [view, setView] = useState<View>({ dealerShown: 0, holeUp: false, settled: false, opening: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  /** Cards left in the shoe before this round was dealt. */
  const [leftAtDeal, setLeftAtDeal] = useState<number | null>(null);
  /** Hi-Lo count of the cards seen in earlier rounds of this shoe. */
  const [countBefore, setCountBefore] = useState(0);
  const [showCount, setShowCount] = useState(false);
  const [shuffleNext, setShuffleNext] = useState(false);
  /** Changes every deal, so each round's cards mount (and animate) fresh. */
  const [dealNo, setDealNo] = useState(0);

  // Refs mirror what click handlers and timers read synchronously.
  const bankrollRef = useRef(INITIAL_BANKROLL);
  const roundRef = useRef<Round | null>(null);
  const shoeRef = useRef<Shoe | null>(null);
  const busyRef = useRef(false);
  const roundId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const commitBankroll = (next: number) => {
    bankrollRef.current = next;
    setBankroll(next);
  };
  const commitRound = (next: Round | null) => {
    roundRef.current = next;
    setRound(next);
  };
  const commitBusy = (next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /** Pays out a finished round once its cards have been shown. */
  const settle = (r: Round) => {
    const res = r.result!;
    commitBankroll(bankrollRef.current + res.returned);
    setStats((s) => ({
      ...s,
      hands: s.hands + res.hands.length,
      wins: s.wins + res.hands.filter((h) => h.outcome === 'win' || h.outcome === 'blackjack').length,
      pushes: s.pushes + res.hands.filter((h) => h.outcome === 'push').length,
      losses: s.losses + res.hands.filter((h) => h.outcome === 'lose' || h.outcome === 'bust').length,
      blackjacks: s.blackjacks + res.hands.filter((h) => h.outcome === 'blackjack').length,
    }));
    setView((v) => ({ ...v, dealerShown: r.dealer.length, holeUp: true, settled: true, opening: false }));
    // Every card of the round is face up now.
    setCountBefore((c) => c + [...r.dealer, ...r.hands.flatMap((h) => h.cards)].reduce((n, card) => n + hiLo(card), 0));
    setShuffleNext(needsShuffle(r.shoe));
    commitBusy(false);
  };

  /** Turns the hole card, draws the dealer's cards one by one, then pays. */
  const playDealer = (r: Round, startDelay: number) => {
    commitBusy(true);
    const fast = prefersReducedMotion();
    const flip = fast ? 0 : TIMING.flip;
    const draw = fast ? 0 : TIMING.draw;
    const pause = fast ? 0 : TIMING.settle;
    const id = roundId.current;
    const guard = (fn: () => void) => () => {
      if (roundId.current === id) fn();
    };
    later(startDelay, guard(() => setView((v) => ({ ...v, holeUp: true, opening: false }))));
    // Each further dealer card lands `draw` ms after the previous one; pay once the last has landed.
    let at = startDelay + flip;
    for (let k = 3; k <= r.dealer.length; k++) {
      const shown = k;
      later(at, guard(() => setView((v) => ({ ...v, dealerShown: shown }))));
      at += draw;
    }
    later(at + pause, guard(() => settle(r)));
  };

  const deal = () => {
    if (busyRef.current) return;
    if (roundRef.current && roundRef.current.phase !== 'done') return;
    if (bet <= 0) {
      setMessage(t.placeBet);
      return;
    }
    if (bet > bankrollRef.current) {
      setMessage(t.noFunds);
      return;
    }
    let shoe = shoeRef.current;
    if (!shoe || needsShuffle(shoe)) {
      shoe = createShoe(DECKS);
      setCountBefore(0);
    }
    const r = startRound(shoe, bet);
    shoeRef.current = r.shoe;
    roundId.current++;
    setDealNo(roundId.current);
    commitBankroll(bankrollRef.current - bet);
    commitRound(r);
    setMessage(null);
    setShuffleNext(false);
    setLeftAtDeal(cardsLeft(shoe));
    const fast = prefersReducedMotion();
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

  /** Legal actions the bankroll can also cover (doubling / splitting need another stake). */
  const affordable = (r: Round, funds: number) => {
    const hand = r.hands[r.active];
    const legal = legalActions(r);
    return {
      ...legal,
      double: legal.double && funds >= hand.bet,
      split: legal.split && funds >= r.bet,
    };
  };

  const onAction = (action: Action) => {
    const r = roundRef.current;
    if (busyRef.current || !r || r.phase !== 'player') return;
    const can = affordable(r, bankrollRef.current);
    if (!can[action]) {
      if (legalActions(r)[action]) setMessage(t.noFunds);
      return;
    }
    const hand = r.hands[r.active];
    const chart = basicStrategy(hand.cards, r.dealer[0], can);
    setStats((s) => ({ ...s, decisions: s.decisions + 1, agreed: s.agreed + (chart === action ? 1 : 0) }));
    const extra = action === 'double' ? hand.bet : action === 'split' ? r.bet : 0;
    const next = playAction(r, action);
    shoeRef.current = next.shoe;
    commitBankroll(bankrollRef.current - extra);
    commitRound(next);
    setMessage(null);
    // Let the last player card land before the dealer turns the hole card.
    if (next.phase === 'done') playDealer(next, prefersReducedMotion() ? 0 : TIMING.draw);
  };

  const onInsurance = (take: boolean) => {
    const r = roundRef.current;
    if (busyRef.current || !r || r.phase !== 'insurance') return;
    const cost = r.bet / 2;
    if (take && cost > bankrollRef.current) {
      setMessage(t.noFunds);
      return;
    }
    const next = answerInsurance(r, take);
    commitBankroll(bankrollRef.current - (take ? cost : 0));
    commitRound(next);
    setMessage(null);
    if (next.phase === 'done') playDealer(next, 0);
  };

  const addChip = () => {
    if (busyRef.current || (roundRef.current && roundRef.current.phase !== 'done')) return;
    if (bet + chip > bankrollRef.current) {
      setMessage(t.noFunds);
      return;
    }
    setBet(bet + chip);
    setMessage(null);
  };

  const reset = () => {
    if (busyRef.current) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    roundId.current++;
    commitBankroll(INITIAL_BANKROLL);
    commitRound(null);
    shoeRef.current = null;
    setBet(DEFAULT_BET);
    setStats(EMPTY_STATS);
    setMessage(null);
    setLeftAtDeal(null);
    setCountBefore(0);
    setShuffleNext(false);
    setView({ dealerShown: 0, holeUp: false, settled: false, opening: false });
  };

  const inRound = round !== null && !(round.phase === 'done' && view.settled);
  const playing = round?.phase === 'player' && !busy;
  const active = round && round.phase === 'player' ? round.hands[round.active] : null;
  const can = round && round.phase === 'player' ? affordable(round, bankroll) : null;
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

  const onTable = round && !view.settled ? totalStaked(round) : 0;
  const net = Math.round((bankroll + onTable - INITIAL_BANKROLL) * 100) / 100;
  const result = view.settled ? round?.result ?? null : null;

  const dealerCards = round ? round.dealer.slice(0, view.dealerShown) : [];
  // Count only cards already on the table: the dealer's next cards are drawn in
  // the engine before they are shown, and must not leak through this number.
  const cardsOut = round ? round.hands.reduce((n, h) => n + h.cards.length, 0) + dealerCards.length : 0;
  const shownLeft = leftAtDeal !== null && round ? leftAtDeal - cardsOut : null;
  // The count of what a player at the table has seen: never the hole card before it is turned.
  const seenThisRound = round
    ? [...round.hands.flatMap((h) => h.cards), ...dealerCards.filter((_, i) => i !== 1 || view.holeUp)].reduce((n, card) => n + hiLo(card), 0)
    : 0;
  const running = view.settled ? countBefore : countBefore + seenThisRound;
  const tc = shownLeft !== null ? trueCount(running, shownLeft) : 0;
  const dealerTotal = round && view.holeUp ? handValue(dealerCards) : round ? handValue(round.dealer.slice(0, 1)) : null;
  const delay = (i: number) => (view.opening ? i * TIMING.dealStep : 0);

  const calloutClass = !result
    ? styles.calloutIdle
    : result.net > 0
      ? styles.calloutWin
      : result.net < 0
        ? styles.calloutLose
        : styles.calloutPush;
  const callout = !round
    ? t.placeBet
    : round.phase === 'insurance'
      ? t.insuranceQuestion(money(round.bet / 2))
      : round.phase === 'player'
        ? busy
          ? t.dealing
          : t.yourMove
        : result
          ? t.resultSummary(signedMoney(result.net), result.dealerTotal, result.dealerBust, result.dealerBlackjack)
          : t.dealerPlays;

  return (
    <div className={styles.playGrid}>
      <div className={styles.panel}>
        <div className={styles.shoeBar} data-testid="shoe-info">
          {shownLeft === null ? t.newShoe : t.shoeLabel(shownLeft)}
        </div>

        <div className={styles.table}>
          <div className={styles.shoeBox} aria-hidden="true">
            <span className={styles.shoeCards} />
          </div>
          <div className={styles.area} data-area="dealer" role="group" aria-label={t.dealer}>
            <div className={styles.areaHead}>
              <span className={styles.areaName}>{t.dealer}</span>
              {dealerTotal && (
                <span className={styles.totalBadge} data-testid="dealer-total">
                  {t.total(dealerTotal.total, view.holeUp && dealerTotal.soft && dealerTotal.total < 21)}
                </span>
              )}
            </div>
            <div className={styles.cardRow}>
              {dealerCards.map((c, i) =>
                i === 1 && !view.holeUp ? (
                  <HoleCard key={`${dealNo}-hole`} delay={delay(3)} label={t.holeCard} />
                ) : (
                  <PlayingCard
                    key={`${dealNo}-d${i}-${c.rank}${c.suit}`}
                    card={c}
                    delay={i === 0 ? delay(1) : 0}
                    flip={i === 1}
                  />
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
                          <PlayingCard
                            key={`${dealNo}-h${hi}-${ci}-${c.rank}${c.suit}`}
                            card={c}
                            delay={hi === 0 && ci < 2 ? delay(ci * 2) : 0}
                          />
                        ))}
                      </div>
                      <div className={styles.handFoot}>
                        <span className={styles.totalBadge} data-testid={`hand-total-${hi}`}>
                          {v.total > 21 ? t.bust : !h.split && h.cards.length === 2 && v.total === 21 ? t.blackjack : t.total(v.total, v.soft && v.total < 21)}
                        </span>
                        <span className={styles.handBet} title={t.bet}>
                          {money(h.bet)}
                        </span>
                        {outcome && (
                          <span className={styles.outcomeTag} data-outcome={outcome}>
                            {t.outcome[outcome]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.waitingCircle}>{bet > 0 ? money(bet) : '—'}</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.callout} aria-live="polite" data-testid="bj-callout">
          <span className={calloutClass}>{callout}</span>
        </div>
        {shuffleNext && view.settled && <p className={styles.cutNote}>{t.shuffleNext}</p>}

        {result && (
          <ul className={styles.resultList} data-testid="bj-results">
            {result.hands.map((h, i) => (
              <li key={i} data-positive={h.profit > 0 ? 'true' : undefined} data-negative={h.profit < 0 ? 'true' : undefined}>
                <span>
                  {result.hands.length > 1 ? `${t.handLabel(i + 1)} · ` : ''}
                  {t.outcome[h.outcome]}
                </span>
                <span className={styles.resultAmount}>{signedMoney(h.profit)}</span>
              </li>
            ))}
            {result.insurance && (
              <li data-positive={result.insurance.profit > 0 ? 'true' : undefined} data-negative={result.insurance.profit < 0 ? 'true' : undefined}>
                <span>{t.insurance}</span>
                <span className={styles.resultAmount}>{signedMoney(result.insurance.profit)}</span>
              </li>
            )}
          </ul>
        )}

      </div>

      <div className={styles.panel}>
        <div className={styles.pillRow}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.bankroll}</span>
            <span className={styles.pillValue} data-testid="bj-bankroll">
              {money(bankroll)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.onTable}</span>
            <span className={styles.pillValue} data-testid="bj-on-table">
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
              className={styles.chip}
              style={{ ['--c' as string]: CHIP_COLORS[v], color: v === 100 || v === 500 ? '#fff' : '#1a1200' }}
            >
              {v}
            </button>
          ))}
        </div>

        <div className={styles.betRow}>
          <button type="button" className={styles.betCircle} onClick={addChip} disabled={inRound || busy} aria-label={t.betAria(money(bet))}>
            <span className={styles.betCircleLabel}>{t.bet}</span>
            <span className={styles.betAmount} data-testid="bj-bet">
              {money(bet)}
            </span>
          </button>
          <div className={styles.actions} style={{ marginTop: 0, flex: 1 }}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={deal} disabled={inRound || busy}>
              {t.deal}
            </button>
            <button type="button" className={styles.btn} onClick={() => setBet(0)} disabled={inRound || busy}>
              {t.clearBet}
            </button>
          </div>
        </div>

        {round?.phase === 'insurance' && !busy && (
          <div className={styles.insuranceBox} data-testid="bj-insurance">
            <span>{t.insuranceQuestion(money(round.bet / 2))}</span>
            <div className={styles.actions} style={{ marginTop: 0 }}>
              <button type="button" className={styles.btn} onClick={() => onInsurance(true)}>
                {t.insuranceYes}
              </button>
              <button type="button" className={styles.btn} onClick={() => onInsurance(false)} data-hint={showHint ? 'true' : undefined}>
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

        <p className={`${styles.message} ${message ? styles.messageError : ''}`} role="status" data-testid="bj-message">
          {message ?? ''}
        </p>

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

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.spacerLeft}`} onClick={reset} disabled={busy}>
            {t.reset}
          </button>
        </div>

        <ul className={styles.hint}>
          {t.hint.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>

        <div className={styles.sectionLabel} style={{ marginTop: '0.9rem' }}>
          {t.statsTitle}
        </div>
        <dl className={styles.statList} data-testid="bj-stats">
          <div>
            <dt>{t.hands}</dt>
            <dd>{stats.hands}</dd>
          </div>
          <div>
            <dt>{t.winsPushesLosses}</dt>
            <dd>
              {stats.wins} / {stats.pushes} / {stats.losses}
            </dd>
          </div>
          <div>
            <dt>{t.blackjacks}</dt>
            <dd>{stats.blackjacks}</dd>
          </div>
          <div>
            <dt>{t.agreement}</dt>
            <dd>{stats.decisions > 0 ? `${Math.round((stats.agreed / stats.decisions) * 100)}%` : '–'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
};
