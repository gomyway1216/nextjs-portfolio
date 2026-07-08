'use client';

import { useMemo, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getBlackjackStrings, fmt } from './i18n';
import { CardRow } from './PlayingCard';
import {
  Action,
  Card,
  basicStrategyDecision,
  cardValue,
  handValue,
  isBlackjack,
  isBust,
  isPair,
  newShoe,
  playDealerTurn,
  shuffle,
} from './engine';
import styles from './blackjack.module.css';

const INITIAL_BANKROLL = 1000;
const BET = 10;

type Phase = 'idle' | 'insurance' | 'playing' | 'done';

interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplitAces: boolean;
  done: boolean;
  net?: number;
  outcome?: 'win' | 'lose' | 'push' | 'blackjack';
}

interface SessionStats {
  hands: number;
  net: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  hintFollows: number;
  hintDiverges: number;
}

const INITIAL_STATS: SessionStats = {
  hands: 0, net: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, hintFollows: 0, hintDiverges: 0,
};

interface GameState {
  shoe: Card[];
  cursor: number;
  hands: Hand[];
  active: number;
  dealer: Card[];
  phase: Phase;
  hideHole: boolean;
  /** A lost insurance side bet to fold into the round's net at settlement. */
  insuranceLoss: number;
}

const idleState = (): GameState => ({
  shoe: [], cursor: 0, hands: [], active: 0, dealer: [], phase: 'idle', hideHole: true, insuranceLoss: 0,
});

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const s = getBlackjackStrings(language);
  const [bankroll, setBankroll] = useState(INITIAL_BANKROLL);
  const [state, setState] = useState<GameState>(idleState);
  const [stats, setStats] = useState<SessionStats>(INITIAL_STATS);
  const [showHint, setShowHint] = useState(true);

  const actionLabel = (a: Action) =>
    a === 'hit' ? s.actionNames.hit : a === 'stand' ? s.actionNames.stand : a === 'double' ? s.actionNames.double : s.actionNames.split;

  // --- Deal ---
  const deal = () => {
    if (bankroll < BET) return;
    const shoe = shuffle(newShoe());
    let cursor = 0;
    const p1 = shoe[cursor++];
    const d1 = shoe[cursor++];
    const p2 = shoe[cursor++];
    const d2 = shoe[cursor++];
    const player = [p1, p2];
    const dealer = [d1, d2];
    setBankroll((b) => b - BET); // stake escrowed; returned on settle

    const hand: Hand = { cards: player, bet: BET, doubled: false, fromSplitAces: false, done: false };

    // Insurance offer when dealer shows an Ace and player has no natural.
    if (dealer[0].rank === 'A' && !isBlackjack(player)) {
      setState({ shoe, cursor, hands: [hand], active: 0, dealer, phase: 'insurance', hideHole: true, insuranceLoss: 0 });
      return;
    }

    // Immediate naturals resolve at once.
    if (isBlackjack(player) || isBlackjack(dealer)) {
      resolveNaturals(shoe, cursor, [hand], dealer);
      return;
    }
    setState({ shoe, cursor, hands: [hand], active: 0, dealer, phase: 'playing', hideHole: true, insuranceLoss: 0 });
  };

  const resolveNaturals = (shoe: Card[], cursor: number, hands: Hand[], dealer: Card[]) => {
    const pBJ = isBlackjack(hands[0].cards);
    const dBJ = isBlackjack(dealer);
    let net: number;
    let outcome: Hand['outcome'];
    if (pBJ && dBJ) { net = 0; outcome = 'push'; }
    else if (pBJ) { net = BET * 1.5; outcome = 'blackjack'; }
    else { net = -BET; outcome = 'lose'; }
    const settled: Hand = { ...hands[0], done: true, net, outcome };
    setBankroll((b) => b + BET + net); // return stake + net
    bookRound([settled]);
    setState({ shoe, cursor, hands: [settled], active: 0, dealer, phase: 'done', hideHole: false, insuranceLoss: 0 });
  };

  // --- Insurance ---
  const resolveInsurance = (take: boolean) => {
    const dealer = state.dealer;
    const insuranceBet = take ? BET / 2 : 0;
    const dealerBJ = isBlackjack(dealer);
    const player = state.hands[0];
    const playerBJ = isBlackjack(player.cards);

    if (dealerBJ) {
      // Dealer natural → round ends. Main hand loses unless the player also has
      // a natural (push). Insurance, if taken, wins 2:1.
      const mainNet = playerBJ ? 0 : -BET;            // profit on the main bet
      const mainReturn = playerBJ ? BET : 0;          // main stake returned
      const insuranceProfit = take ? insuranceBet * 2 : 0;
      const insuranceReturn = take ? insuranceBet * 3 : 0; // stake + 2:1 payout
      const settled: Hand = {
        ...player,
        done: true,
        net: mainNet + insuranceProfit,
        outcome: playerBJ ? 'push' : 'lose',
      };
      // Note: the insurance stake is netted directly (return already includes it).
      setBankroll((b) => b + mainReturn + insuranceReturn - insuranceBet);
      bookRound([settled]);
      setState({ ...state, hands: [settled], phase: 'done', hideHole: false });
      return;
    }

    // No dealer BJ: insurance (if taken) is lost.
    if (playerBJ) {
      // Player natural vs non-BJ dealer → pays 3:2. (Rare: dealer up-Ace, player BJ.)
      const settled: Hand = { ...player, done: true, net: BET * 1.5 - insuranceBet, outcome: 'blackjack' };
      setBankroll((b) => b + BET + BET * 1.5 - insuranceBet);
      bookRound([settled]);
      setState({ ...state, hands: [settled], phase: 'done', hideHole: false });
      return;
    }
    // Continue the hand. If insurance was taken it is simply lost (subtract it now
    // and remember it so the round's net reflects the side-bet loss at settlement).
    if (insuranceBet > 0) setBankroll((b) => b - insuranceBet);
    setState({ ...state, phase: 'playing', insuranceLoss: insuranceBet });
  };

  // --- Player actions on the active hand ---
  const recordHint = (taken: Action) => {
    const h = state.hands[state.active];
    if (!h) return;
    const canDouble = h.cards.length === 2 && bankroll >= h.bet;
    const canSplit = h.cards.length === 2 && isPair(h.cards) && state.hands.length < 4 && bankroll >= h.bet;
    const rec = basicStrategyDecision(h.cards, state.dealer[0], canDouble, canSplit);
    setStats((st) => taken === rec
      ? { ...st, hintFollows: st.hintFollows + 1 }
      : { ...st, hintDiverges: st.hintDiverges + 1 });
  };

  /**
   * Given a game state whose active hand may have just finished, either advance
   * to the next unfinished hand or, if all hands are done, play the dealer and
   * settle. Pure: returns the next state plus the bankroll delta to apply.
   */
  const advanceOrDealer = (g: GameState): { next: GameState; bankrollDelta: number; settled?: Hand[] } => {
    let idx = g.active;
    while (idx < g.hands.length && g.hands[idx].done) idx++;
    if (idx < g.hands.length) return { next: { ...g, active: idx }, bankrollDelta: 0 };

    // All hands played → dealer turn + settle.
    const anyLive = g.hands.some((h) => !isBust(h.cards));
    const dealer = [...g.dealer];
    let cursor = g.cursor;
    if (anyLive) playDealerTurn(dealer, () => g.shoe[cursor++]);
    const dV = handValue(dealer).total;

    const settled = g.hands.map((h): Hand => {
      if (isBust(h.cards)) return { ...h, done: true, net: -h.bet, outcome: 'lose' };
      const pV = handValue(h.cards).total;
      if (dV > 21 || pV > dV) return { ...h, done: true, net: h.bet, outcome: 'win' };
      if (pV < dV) return { ...h, done: true, net: -h.bet, outcome: 'lose' };
      return { ...h, done: true, net: 0, outcome: 'push' };
    });
    // Return each hand's escrowed stake + net (insurance was already settled in bankroll).
    const bankrollDelta = settled.reduce((acc, h) => acc + h.bet + (h.net ?? 0), 0);
    // Fold a lost insurance side bet into the reported net of the first hand.
    if (g.insuranceLoss > 0 && settled.length > 0) {
      settled[0] = { ...settled[0], net: (settled[0].net ?? 0) - g.insuranceLoss };
    }
    return { next: { ...g, hands: settled, dealer, cursor, phase: 'done', hideHole: false }, bankrollDelta, settled };
  };

  const applyTransition = (g: GameState, extraBankrollDelta = 0) => {
    const { next, bankrollDelta, settled } = advanceOrDealer(g);
    setState(next);
    const totalDelta = extraBankrollDelta + bankrollDelta;
    if (totalDelta !== 0) setBankroll((b) => b + totalDelta);
    if (settled) bookRound(settled);
  };

  const hit = () => {
    if (state.phase !== 'playing') return;
    recordHint('hit');
    const hands = state.hands.map((h) => ({ ...h, cards: [...h.cards] }));
    let cursor = state.cursor;
    const h = hands[state.active];
    h.cards.push(state.shoe[cursor++]);
    if (isBust(h.cards) || handValue(h.cards).total === 21) h.done = true;
    const g = { ...state, hands, cursor };
    if (h.done) applyTransition(g);
    else setState(g);
  };

  const stand = () => {
    if (state.phase !== 'playing') return;
    recordHint('stand');
    const hands = state.hands.map((h) => ({ ...h }));
    hands[state.active].done = true;
    applyTransition({ ...state, hands });
  };

  const double = () => {
    if (state.phase !== 'playing') return;
    const h = state.hands[state.active];
    if (h.cards.length !== 2 || bankroll < h.bet) return;
    recordHint('double');
    const hands = state.hands.map((x) => ({ ...x, cards: [...x.cards] }));
    let cursor = state.cursor;
    const hh = hands[state.active];
    const extraStake = hh.bet; // escrow the doubled portion
    hh.bet *= 2;
    hh.doubled = true;
    hh.cards.push(state.shoe[cursor++]);
    hh.done = true;
    applyTransition({ ...state, hands, cursor }, -extraStake);
  };

  const split = () => {
    if (state.phase !== 'playing') return;
    const h = state.hands[state.active];
    if (!(h.cards.length === 2 && isPair(h.cards)) || state.hands.length >= 4 || bankroll < h.bet) return;
    recordHint('split');
    const hands = state.hands.map((x) => ({ ...x, cards: [...x.cards] }));
    let cursor = state.cursor;
    const src = hands[state.active];
    const splitAces = cardValue(src.cards[0]) === 11;
    const a = src.cards[0];
    const b = src.cards[1];
    src.cards = [a, state.shoe[cursor++]];
    const newHand: Hand = { cards: [b, state.shoe[cursor++]], bet: BET, doubled: false, fromSplitAces: splitAces, done: splitAces };
    if (splitAces) src.done = true;
    hands.splice(state.active + 1, 0, newHand);
    const g = { ...state, hands, cursor };
    // Split aces are auto-done; otherwise keep playing the current hand.
    if (splitAces) applyTransition(g, -BET);
    else { setState(g); setBankroll((bk) => bk - BET); }
  };

  const bookRound = (settled: Hand[]) => {
    setStats((st) => {
      let net = 0, wins = 0, losses = 0, pushes = 0, bj = 0;
      for (const h of settled) {
        net += h.net ?? 0;
        if (h.outcome === 'win' || h.outcome === 'blackjack') wins++;
        else if (h.outcome === 'lose') losses++;
        else if (h.outcome === 'push') pushes++;
        if (h.outcome === 'blackjack') bj++;
      }
      return {
        ...st,
        hands: st.hands + 1,
        net: st.net + net,
        wins: st.wins + wins,
        losses: st.losses + losses,
        pushes: st.pushes + pushes,
        blackjacks: st.blackjacks + bj,
      };
    });
  };

  const next = () => setState(idleState());
  const reset = () => {
    setBankroll(INITIAL_BANKROLL);
    setStats(INITIAL_STATS);
    setState(idleState());
  };

  // --- Derived hint for the active hand ---
  const hint = useMemo<Action | null>(() => {
    if (state.phase !== 'playing') return null;
    const h = state.hands[state.active];
    if (!h) return null;
    const canDouble = h.cards.length === 2 && bankroll >= h.bet;
    const canSplit = h.cards.length === 2 && isPair(h.cards) && state.hands.length < 4 && bankroll >= h.bet;
    return basicStrategyDecision(h.cards, state.dealer[0], canDouble, canSplit);
  }, [state.phase, state.hands, state.active, state.dealer, bankroll]);

  const activeHand = state.hands[state.active];
  const canDoubleUI = state.phase === 'playing' && activeHand?.cards.length === 2 && bankroll >= (activeHand?.bet ?? BET);
  const canSplitUI = state.phase === 'playing' && activeHand && activeHand.cards.length === 2 && isPair(activeHand.cards) && state.hands.length < 4 && bankroll >= activeHand.bet;

  const winRate = stats.hands === 0 ? null : stats.wins / (stats.wins + stats.losses + stats.pushes || 1);
  const followTotal = stats.hintFollows + stats.hintDiverges;
  const followRate = followTotal === 0 ? null : stats.hintFollows / followTotal;

  const multiHand = state.hands.length > 1;

  return (
    <div className={styles.felt}>
      <div className={styles.playGrid}>
        {/* Table */}
        <div>
          {/* Dealer */}
          <div className={styles.dealerZone}>
            <div className={styles.zoneLabel}>
              {s.play.dealer}
              <DealerValue state={state} s={s} />
            </div>
            <CardRow
              cards={state.dealer}
              hideIndex={state.hideHole && state.phase !== 'done' ? 1 : undefined}
              hiddenLabel={s.play.hidden}
            />
          </div>

          {/* Player hands */}
          <div className={styles.zoneLabel}>{s.play.you}</div>
          {multiHand ? (
            <div className={styles.splitRow}>
              {state.hands.map((h, i) => (
                <div
                  key={i}
                  className={`${styles.splitHand} ${state.phase === 'playing' && i === state.active ? styles.activeHand : ''}`}
                >
                  <div style={{ marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className={styles.zoneLabel} style={{ margin: 0 }}>{fmt(s.play.hand, { n: i + 1 })}</span>
                    <PlayerValue cards={h.cards} outcome={h.outcome} s={s} />
                  </div>
                  <CardRow cards={h.cards} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <PlayerValue cards={activeHand?.cards ?? []} outcome={activeHand?.outcome} s={s} />
              <div style={{ marginTop: '0.35rem' }}>
                <CardRow cards={activeHand?.cards ?? []} />
              </div>
            </div>
          )}

          {/* Insurance prompt */}
          {state.phase === 'insurance' && (
            <div className={styles.insurance}>
              <div className={styles.insurancePrompt}>{s.play.insurancePrompt}</div>
              <div className={styles.actions} style={{ marginTop: 0 }}>
                <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => resolveInsurance(true)} disabled={bankroll < BET / 2}>
                  {s.play.insuranceTake}
                </button>
                <button className={`${styles.btn} ${styles.btnStand}`} onClick={() => resolveInsurance(false)}>
                  {s.play.insuranceDecline}
                </button>
              </div>
              <div className={styles.insuranceAdvice}>💡 {s.play.insuranceAdvice}</div>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            {state.phase === 'idle' && (
              <button className={`${styles.btn} ${styles.btnDeal}`} onClick={deal} disabled={bankroll < BET}>
                {fmt(s.play.deal, { bet: BET })}
              </button>
            )}
            {state.phase === 'playing' && (
              <>
                <button className={`${styles.btn} ${styles.btnHit}`} onClick={hit}>
                  {s.play.hit}{showHint && hint === 'hit' && <span className={styles.hintDot} aria-hidden />}
                </button>
                <button className={`${styles.btn} ${styles.btnStand}`} onClick={stand}>
                  {s.play.stand}{showHint && hint === 'stand' && <span className={styles.hintDot} aria-hidden />}
                </button>
                <button className={`${styles.btn} ${styles.btnDouble}`} onClick={double} disabled={!canDoubleUI}>
                  {s.play.double}{showHint && hint === 'double' && <span className={styles.hintDot} aria-hidden />}
                </button>
                {canSplitUI && (
                  <button className={`${styles.btn} ${styles.btnSplit}`} onClick={split}>
                    {s.play.split}{showHint && hint === 'split' && <span className={styles.hintDot} aria-hidden />}
                  </button>
                )}
              </>
            )}
            {state.phase === 'done' && (
              <button className={`${styles.btn} ${styles.btnNext}`} onClick={next} disabled={bankroll < BET}>
                {s.play.nextHand}
              </button>
            )}
          </div>

          {/* Live advisor text */}
          {state.phase === 'playing' && showHint && hint && (
            <div className={styles.advisor} role="status">
              <span aria-hidden>💡</span> {fmt(s.play.recommend, { action: actionLabel(hint) })}
            </div>
          )}

          {/* Result banner */}
          {state.phase === 'done' && <ResultBanner hands={state.hands} s={s} />}
          {state.phase === 'done' && bankroll < BET && (
            <div className={`${styles.banner} ${styles.bannerPush}`}>{s.play.broke}</div>
          )}

          <label className={styles.toggle}>
            <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
            {s.play.hintOn}
          </label>
        </div>

        {/* Side panel */}
        <div className={styles.panel}>
          <div className={styles.zoneLabel} style={{ margin: 0 }}>{s.play.status}</div>
          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>{s.play.stats.bankroll}</div>
              <div className={styles.statValue} style={{ color: bankroll < INITIAL_BANKROLL ? 'var(--bj-lose)' : 'var(--bj-win)' }}>${bankroll}</div>
              <div className={styles.chips} aria-hidden>
                <span className={styles.chip} style={{ background: '#dc2626' }}>$</span>
                <span className={styles.chip} style={{ background: '#2563eb' }}>$</span>
                <span className={styles.chip} style={{ background: '#16a34a' }}>$</span>
              </div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>{s.play.stats.sessionNet}</div>
              <div className={styles.statValue} style={{ color: stats.net >= 0 ? 'var(--bj-win)' : 'var(--bj-lose)' }}>{stats.net >= 0 ? '+' : ''}{stats.net}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>{s.play.stats.hands}</div>
              <div className={styles.statValue} style={{ color: '#67e8f9' }}>{stats.hands}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>{s.play.stats.winRate}</div>
              <div className={styles.statValue} style={{ color: '#a78bfa' }}>{winRate === null ? '—' : `${(winRate * 100).toFixed(0)}%`}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>{s.play.stats.blackjacks}</div>
              <div className={styles.statValue} style={{ color: 'var(--bj-gold)' }}>{stats.blackjacks}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>{s.play.stats.followRate}</div>
              <div className={styles.statValue} style={{ color: '#f472b6' }}>{followRate === null ? '—' : `${(followRate * 100).toFixed(0)}%`}</div>
            </div>
          </div>

          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={reset}>{s.play.resetSession}</button>

          <div className={styles.rulesCard}>
            <h4>{s.play.rulesTitle}</h4>
            <ul>
              {s.play.rules.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Small presentational helpers ---

const DealerValue = ({ state, s }: { state: GameState; s: ReturnType<typeof getBlackjackStrings> }) => {
  if (state.dealer.length === 0) return null;
  if (state.hideHole && state.phase !== 'done') {
    return <span className={styles.valueBadge}>{s.play.upcard}: {handValue([state.dealer[0]]).total}</span>;
  }
  const v = handValue(state.dealer);
  const bust = isBust(state.dealer);
  return (
    <span className={`${styles.valueBadge} ${bust ? styles.lose : ''}`}>
      {v.total}{bust ? ` · ${s.play.bust}` : ''}
    </span>
  );
};

const PlayerValue = ({ cards, outcome, s }: { cards: Card[]; outcome?: Hand['outcome']; s: ReturnType<typeof getBlackjackStrings> }) => {
  if (cards.length === 0) return null;
  const v = handValue(cards);
  const bust = isBust(cards);
  const bj = isBlackjack(cards);
  const cls = outcome === 'win' || outcome === 'blackjack' ? styles.win : outcome === 'lose' || bust ? styles.lose : '';
  return (
    <span className={`${styles.valueBadge} ${cls}`}>
      {bj ? s.play.blackjack : `${v.total} ${v.soft ? `(${s.play.soft})` : ''}`}{bust ? ` · ${s.play.bust}` : ''}
    </span>
  );
};

const ResultBanner = ({ hands, s }: { hands: Hand[]; s: ReturnType<typeof getBlackjackStrings> }) => {
  const net = hands.reduce((a, h) => a + (h.net ?? 0), 0);
  const cls = net > 0 ? styles.bannerWin : net < 0 ? styles.bannerLose : styles.bannerPush;
  // Label: single hand → outcome text; multi → summarise net.
  const label = hands.length === 1
    ? s.play.outcomes[hands[0].outcome ?? 'push']
    : `${s.play.you}: ${net >= 0 ? '+' : ''}${net}`;
  return (
    <div className={`${styles.banner} ${cls}`} role="status">
      <span>{label}{hands[0].doubled && hands.length === 1 ? ` · ${s.play.double}` : ''}</span>
      <span className={styles.bannerNet}>{net > 0 ? `+${net}` : net}</span>
    </div>
  );
};
