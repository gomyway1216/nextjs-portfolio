'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { analyzeHand, tablesAsync, type HoldValue } from './analysis';
import {
  HANDS,
  MAX_COINS,
  PAY_TABLES,
  PAY_TABLE_IDS,
  ROYAL_SHORT_PAY,
  cardLabel,
  deal as dealCards,
  draw as drawCards,
  heldFromMask,
  holdMask,
  payout,
  rankCards,
  type Deal,
  type HandRank,
  type PayTable,
  type PayTableId,
} from './engine';
import { CardBack, MiniCard, PlayingCard } from './Cards';
import { getStrings } from './i18n';
import { PRECOMPUTED } from './precomputed';
import styles from './VideoPoker.module.css';

export const INITIAL_CREDITS = 1000;
/** Animation pacing (ms): the gap between cards turning over and the pause before paying. */
export const TIMING = { step: 90, flip: 340, settle: 200 } as const;
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
  /** Expected coins given up by holds other than the best. */
  givenUp: number;
}

const EMPTY_STATS: Stats = { hands: 0, wagered: 0, paid: 0, judged: 0, best: 0, givenUp: 0 };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** The pay table as it applies to a bet: below five coins the royal pays 250 per coin. */
export const effectivePays = (pays: PayTable, coins: number): PayTable =>
  coins < MAX_COINS ? pays.map((p, r) => (r === HANDS.length - 1 ? ROYAL_SHORT_PAY : p)) : pays;

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);

  const [credits, setCredits] = useState(INITIAL_CREDITS);
  const [coins, setCoins] = useState(MAX_COINS);
  const [payId, setPayId] = useState<PayTableId>('9/6');
  const [phase, setPhase] = useState<Phase>('idle');
  const [game, setGame] = useState<Deal | null>(null);
  const [cards, setCards] = useState<number[]>([]);
  const [held, setHeld] = useState<boolean[]>(NONE);
  const [result, setResult] = useState<{ rank: HandRank; paid: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBest, setShowBest] = useState(true);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  /** Changes every deal so each hand's cards mount (and flip) fresh. */
  const [dealNo, setDealNo] = useState(0);

  const creditsRef = useRef(INITIAL_CREDITS);
  const busyRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    // Build the analysis tables off the critical path, in small slices.
    const start = setTimeout(() => {
      void tablesAsync().then(() => {
        if (alive.current) setReady(true);
      });
    }, 300);
    const pending = timers.current;
    return () => {
      alive.current = false;
      clearTimeout(start);
      pending.forEach(clearTimeout);
    };
  }, []);

  const pays = PAY_TABLES[payId];
  const commitCredits = (next: number) => {
    creditsRef.current = next;
    setCredits(next);
  };
  const commitBusy = (next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  };

  /** Every way to play the dealt hand, best first (once the tables are ready). */
  const analysis = useMemo<HoldValue[] | null>(
    () => (ready && game && phase !== 'idle' ? analyzeHand(game.hand, effectivePays(PAY_TABLES[payId], coins)) : null),
    [ready, game, phase, payId, coins],
  );
  const chosenMask = holdMask(held);
  const chosen = analysis?.find((h) => h.mask === chosenMask) ?? null;
  const best = analysis?.[0] ?? null;
  const bestMask = best?.mask ?? null;

  const startDeal = (bet: number) => {
    if (busyRef.current || phase === 'dealt') return;
    if (bet > creditsRef.current) {
      setError(t.noCredits);
      return;
    }
    const next = dealCards();
    commitCredits(creditsRef.current - bet);
    setCoins(bet);
    setGame(next);
    setCards(next.hand);
    setHeld(NONE);
    setResult(null);
    setError(null);
    setPhase('dealt');
    setDealNo((n) => n + 1);
    const wait = prefersReducedMotion() ? 0 : 4 * TIMING.step + TIMING.flip;
    commitBusy(wait > 0);
    if (wait > 0) timers.current.push(setTimeout(() => commitBusy(false), wait));
  };

  const drawNow = () => {
    if (busyRef.current || phase !== 'dealt' || !game) return;
    const final = drawCards(game, held);
    const rank = rankCards(final);
    const paid = payout(rank, pays, coins);
    // Replaced cards turn over left to right, each in its own position.
    const lastReplaced = held.lastIndexOf(false);
    setCards(final);
    const settle = () => {
      commitCredits(creditsRef.current + paid);
      setResult({ rank, paid });
      setPhase('drawn');
      setStats((s) => ({
        hands: s.hands + 1,
        wagered: s.wagered + coins,
        paid: s.paid + paid,
        judged: s.judged + (chosen && best ? 1 : 0),
        best: s.best + (chosen && best && best.ev - chosen.ev < EPS ? 1 : 0),
        givenUp: s.givenUp + (chosen && best ? (best.ev - chosen.ev) * coins : 0),
      }));
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

  const toggle = (i: number) => {
    if (busyRef.current || phase !== 'dealt') return;
    setHeld((h) => h.map((v, k) => (k === i ? !v : v)));
  };

  const betOne = () => {
    if (busyRef.current || phase === 'dealt') return;
    setCoins((c) => (c >= MAX_COINS ? 1 : c + 1));
    setError(null);
  };

  const reset = () => {
    if (busyRef.current) return;
    timers.current.forEach(clearTimeout);
    timers.current.length = 0;
    commitCredits(INITIAL_CREDITS);
    setCoins(MAX_COINS);
    setPhase('idle');
    setGame(null);
    setCards([]);
    setHeld(NONE);
    setResult(null);
    setError(null);
    setStats(EMPTY_STATS);
  };

  // The row to light up: the final hand, or a hand already made on the deal.
  const dealtRank = game && phase === 'dealt' ? rankCards(game.hand) : 0;
  const litRank = result ? result.rank : dealtRank;
  const message = error
    ? { text: error, tone: 'error' }
    : phase === 'idle'
      ? { text: t.pressDeal, tone: 'idle' }
      : phase === 'dealt'
        ? { text: t.chooseHolds, tone: 'idle' }
        : result && result.paid > 0
          ? { text: t.resultWin(t.hand[HANDS[result.rank]], fmt(result.paid)), tone: 'win' }
          : { text: t.resultLose, tone: 'idle' };
  const canChange = phase !== 'dealt' && !busy;
  const net = credits - INITIAL_CREDITS;

  const describe = (h: HoldValue) => {
    if (!game) return null;
    const kept = game.hand.filter((_, i) => h.mask & (1 << i));
    if (kept.length === 0) return <span>{t.discardAll}</span>;
    return kept.map((c) => <MiniCard key={c} card={c} />);
  };
  const top = analysis ? analysis.slice(0, TOP_HOLDS) : [];
  const listed = chosen && !top.includes(chosen) ? [...top, chosen] : top;
  const scale = best && best.ev > 0 ? best.ev : 1;

  return (
    <div className={styles.playGrid}>
      <div className={styles.machine}>
        <div className={styles.screen}>
          <table className={styles.payTable} data-testid="vp-paytable">
            <tbody>
              {HANDS.slice(1)
                .map((name, i) => ({ name, rank: i + 1 }))
                .reverse()
                .map(({ name, rank }) => (
                  <tr key={name} className={litRank === rank ? styles.payRow : undefined} data-hand={name} data-lit={litRank === rank ? 'true' : undefined}>
                    <th scope="row">{t.hand[name]}</th>
                    {[1, 2, 3, 4, 5].map((c) => (
                      <td key={c} className={c === coins ? styles.payCol : undefined}>
                        {fmt(payout(rank, pays, c))}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>

          <div className={styles.cardsRow}>
            {[0, 1, 2, 3, 4].map((i) => {
              const card = cards[i];
              const isHeld = held[i] && phase !== 'idle';
              const suggested = showBest && phase === 'dealt' && bestMask !== null && (bestMask & (1 << i)) !== 0;
              return (
                <button
                  key={i}
                  type="button"
                  className={styles.slot}
                  onClick={() => toggle(i)}
                  disabled={phase !== 'dealt' || busy}
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

          <p className={styles.message} role="status" data-tone={message.tone} data-testid="vp-message">
            {message.text}
          </p>
        </div>

        <div className={styles.meters}>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.credits}</span>
            <span className={styles.meterValue} data-testid="vp-credits">
              {fmt(credits)}
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <span className={styles.meterValue} data-testid="vp-bet">
              {coins}
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="vp-win">
              {result ? fmt(result.paid) : 0}
            </span>
          </div>
        </div>

        <div className={styles.controls}>
          <button type="button" className={styles.machineBtn} onClick={betOne} disabled={!canChange}>
            {t.betOne}
          </button>
          <button type="button" className={styles.machineBtn} onClick={() => startDeal(MAX_COINS)} disabled={!canChange}>
            {t.betMax}
          </button>
          {phase === 'dealt' ? (
            <button type="button" className={`${styles.machineBtn} ${styles.dealBtn}`} onClick={drawNow} disabled={busy}>
              {t.draw}
            </button>
          ) : (
            <button type="button" className={`${styles.machineBtn} ${styles.dealBtn}`} onClick={() => startDeal(coins)} disabled={busy}>
              {t.deal}
            </button>
          )}
        </div>

        <div className={styles.settingsRow}>
          <label htmlFor="vp-paytable-select">{t.payTableLabel}</label>
          <select
            id="vp-paytable-select"
            className={styles.select}
            value={payId}
            onChange={(e) => setPayId(e.target.value as PayTableId)}
            disabled={!canChange}
          >
            {PAY_TABLE_IDS.map((id) => (
              <option key={id} value={id}>
                {t.payTableOption(id, `${(PRECOMPUTED[id].payback * 100).toFixed(2)}%`)}
              </option>
            ))}
          </select>
          <button type="button" className={`${styles.btn} ${styles.spacerLeft}`} onClick={reset} disabled={busy}>
            {t.reset}
          </button>
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
            {phase === 'drawn' && chosen && best && (
              <p className={styles.verdict} data-good={best.ev - chosen.ev < EPS ? 'true' : 'false'} data-testid="vp-verdict">
                {best.ev - chosen.ev < EPS ? t.perfect : t.mistake((best.ev - chosen.ev).toFixed(3))}
              </p>
            )}
            {phase === 'dealt' && best && (
              <button type="button" className={styles.btn} style={{ marginTop: '0.6rem' }} onClick={() => setHeld(heldFromMask(best.mask))} disabled={busy}>
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
            <dd>
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
    </div>
  );
};
