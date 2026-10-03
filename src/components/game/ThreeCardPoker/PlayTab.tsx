'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
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
import { getStrings } from './i18n';
import styles from './ThreeCardPoker.module.css';

export const INITIAL_BANKROLL = 1000;
export const CHIP_VALUES = [1, 5, 25, 100, 500] as const;
const CHIP_COLORS: Record<number, string> = { 1: '#e2e8f0', 5: '#ef4444', 25: '#22c55e', 100: '#1a1a1f', 500: '#a855f7' };

/** Pacing (ms): each card of the deal, the beat before the player may act, each dealer card turning over, the pause before paying. */
export const TIMING = { card: 220, ready: 500, flip: 380, settle: 600 } as const;

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
}

const EMPTY_STATS: Stats = { hands: 0, played: 0, dealerQualified: 0, wins: 0, pushes: 0, losses: 0, agreed: 0 };

/** Amounts stay exact internally; round only for display. */
const money = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};
const signedMoney = (n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : '±0');
const signed = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const pct = (p: number, digits = 2) => `${(p * 100).toFixed(digits)}%`;

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';

  const [bankroll, setBankroll] = useState(INITIAL_BANKROLL);
  const [chip, setChip] = useState<number>(CHIP_VALUES[1]);
  const [bets, setBets] = useState<Bets>(NO_BETS);
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState<Round | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  // Refs mirror state that click handlers and timers must read synchronously.
  const bankrollRef = useRef(INITIAL_BANKROLL);
  const betsRef = useRef<Bets>(NO_BETS);
  const phaseRef = useRef<Phase>('idle');
  const roundRef = useRef<Round | null>(null);
  const undoStack = useRef<{ spot: Spot; amount: number }[]>([]);
  const lastBets = useRef<Bets>(NO_BETS);
  const roundId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const commitBankroll = (next: number) => {
    bankrollRef.current = next;
    setBankroll(next);
  };
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

  const place = (spot: Spot, amount: number = chip): boolean => {
    if (phaseRef.current !== 'idle') return false;
    if (amount > bankrollRef.current) {
      setMessage(t.noFunds);
      return false;
    }
    commitBankroll(bankrollRef.current - amount);
    commitBets({ ...betsRef.current, [spot]: betsRef.current[spot] + amount });
    undoStack.current.push({ spot, amount });
    setMessage(null);
    return true;
  };

  const undo = () => {
    if (phaseRef.current !== 'idle') return;
    const last = undoStack.current.pop();
    if (!last) return;
    commitBets({ ...betsRef.current, [last.spot]: betsRef.current[last.spot] - last.amount });
    commitBankroll(bankrollRef.current + last.amount);
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

  /** The dealer's cards are up: pay the bets and open the table for the next hand. */
  const finish = (id: number, settlement: Settlement, agreed: boolean) => {
    const r = roundRef.current;
    if (!r || r.id !== id) return;
    commitBankroll(bankrollRef.current + settlement.returned);
    commitBets(NO_BETS);
    commitRound({ ...r, revealed: HAND_SIZE, settlement });
    setStats((s) => ({
      hands: s.hands + 1,
      played: s.played + (settlement.decision === 'play' ? 1 : 0),
      dealerQualified: s.dealerQualified + (settlement.dealerQualifies ? 1 : 0),
      wins: s.wins + (settlement.net > 0 ? 1 : 0),
      pushes: s.pushes + (settlement.net === 0 ? 1 : 0),
      losses: s.losses + (settlement.net < 0 ? 1 : 0),
      agreed: s.agreed + (agreed ? 1 : 0),
    }));
    commitPhase('idle');
  };

  const deal = () => {
    if (phaseRef.current !== 'idle') return;
    const placed = betsRef.current;
    if (placed.ante <= 0) {
      setMessage(t.needAnte);
      return;
    }
    // The Play bet matches the Ante, so that much has to stay behind.
    if (bankrollRef.current < placed.ante) {
      setMessage(t.needPlayFunds(money(placed.ante)));
      return;
    }
    const { player, dealer } = dealRound();
    const id = ++roundId.current;
    lastBets.current = { ...placed };
    undoStack.current = [];
    commitPhase('dealing');
    commitRound({ id, player, dealer, bets: { ...placed }, dealt: 0, revealed: 0, decision: null, settlement: null });
    setMessage(null);
    clearTimers();
    const { cards, ready } = dealSchedule(prefersReducedMotion());
    cards.forEach((ms, k) => later(ms, () => patchRound(id, (r) => ({ dealt: Math.max(r.dealt, k + 1) }))));
    later(ready, () => {
      if (roundRef.current?.id !== id) return;
      patchRound(id, () => ({ dealt: CARDS_DEALT }));
      commitPhase('decision');
    });
  };

  const act = (decision: Decision) => {
    const r = roundRef.current;
    if (phaseRef.current !== 'decision' || !r) return;
    if (decision === 'play') {
      if (bankrollRef.current < r.bets.ante) {
        setMessage(t.needPlayFunds(money(r.bets.ante)));
        return;
      }
      commitBankroll(bankrollRef.current - r.bets.ante);
    }
    const settlement = settle(r.bets, decision, r.player, r.dealer);
    const agreed = decide('optimal', r.player) === decision;
    commitPhase('revealing');
    commitRound({ ...r, decision });
    setMessage(null);
    const { flips, paid } = revealSchedule(prefersReducedMotion());
    flips.forEach((ms, k) => later(ms, () => patchRound(r.id, (cur) => ({ revealed: Math.max(cur.revealed, k + 1) }))));
    later(paid, () => finish(r.id, settlement, agreed));
  };

  const reset = () => {
    if (phaseRef.current !== 'idle') return;
    clearTimers();
    roundId.current++;
    commitBankroll(INITIAL_BANKROLL);
    commitBets(NO_BETS);
    commitRound(null);
    undoStack.current = [];
    lastBets.current = NO_BETS;
    setMessage(null);
    setStats(EMPTY_STATS);
  };

  const idle = phase === 'idle';
  const deciding = phase === 'decision';
  const settled = round?.settlement ?? null;
  const playBet = round && !settled && round.decision === 'play' ? round.bets.ante : 0;
  const onTable = bets.ante + bets.pairPlus + playBet;
  const net = Math.round((bankroll + onTable - INITIAL_BANKROLL) * 100) / 100;

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
      ? t.result(settled.showdown, signedMoney(settled.net))
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
      disabled={!idle}
      aria-label={t.spotAria(t.lineName[id], pays)}
      data-bet={id}
      data-lit={lit(id) ? 'true' : undefined}
    >
      <span className={styles.spotLabel}>{t.lineName[id]}</span>
      <span className={styles.spotPays}>{pays}</span>
      {bets[id] > 0 && <span className={styles.chipBadge}>{money(bets[id])}</span>}
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

  return (
    <div className={styles.playGrid}>
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
                    {l.outcome === 'win' ? `+${money(l.profit)}` : l.outcome === 'lose' ? `−${money(l.stake)}` : '±0'}{' '}
                    <small>{t.outcome[l.outcome]}</small>
                  </span>
                </li>
              ))}
              <li data-line="total" className={styles.resultTotal}>
                <span>{t.handTotal}</span>
                <span className={styles.resultAmount} data-testid="tcp-hand-net">
                  {signedMoney(settled.net)}
                </span>
              </li>
            </ul>
          </div>
        )}

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

      <div className={styles.panel}>
        <div className={styles.pillRow}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.bankroll}</span>
            <span className={styles.pillValue} data-testid="tcp-bankroll">
              {money(bankroll)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.onTable}</span>
            <span className={styles.pillValue} data-testid="tcp-on-table">
              {money(onTable)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.net}</span>
            <span className={`${styles.pillValue} ${net >= 0 ? styles.pos : styles.neg}`} data-testid="tcp-net">
              {net === 0 ? '0' : signedMoney(net)}
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
              disabled={!idle}
              className={styles.chip}
              style={{ ['--c' as string]: CHIP_COLORS[v], color: v === 100 || v === 500 ? '#fff' : '#1a1200' }}
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
              {playBet > 0 && <span className={styles.chipBadge}>{money(playBet)}</span>}
            </div>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="tcp-message">
          {message ?? ''}
        </p>

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={deal} disabled={!idle}>
            {phase === 'dealing' ? t.dealing : t.deal}
          </button>
          <button type="button" className={styles.btn} onClick={undo} disabled={!idle}>
            {t.undo}
          </button>
          <button type="button" className={styles.btn} onClick={clear} disabled={!idle}>
            {t.clear}
          </button>
          <button type="button" className={styles.btn} onClick={rebet} disabled={!idle}>
            {t.rebet}
          </button>
          <button type="button" className={`${styles.btn} ${styles.spacerLeft}`} onClick={reset} disabled={!idle}>
            {t.reset}
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
              disabled={!deciding}
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
      </div>
    </div>
  );
};
