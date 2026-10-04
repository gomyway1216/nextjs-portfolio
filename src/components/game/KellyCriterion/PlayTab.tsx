'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { BankrollChart } from './charts';
import {
  CAP,
  MAX_FLIPS,
  MIN_STAKE,
  SCENARIOS,
  SCENARIO_IDS,
  START_BANKROLL,
  fixedFractionPath,
  isFinished,
  kellyFraction,
  settle,
  stakeFor,
  type ScenarioId,
} from './engine';
import { money, percent } from './format';
import { getStrings, type FinishReason } from './i18n';
import styles from './KellyCriterion.module.css';

/** Animation pacing (ms): the coin's spin on a single flip, and the gap between flips in a run. */
export const TIMING = { spin: 420, auto: 60 } as const;
/** The stake the slider starts on. Deliberately not the answer. */
export const DEFAULT_FRACTION = 0.1;
export const QUICK_FRACTIONS = [0.05, 0.1, 0.2, 0.5, 1] as const;
export const RUN_LENGTHS = [10, 50] as const;
const RECENT = 30;

interface Game {
  scenario: ScenarioId;
  /** The flips so far; `true` is heads, a win. */
  flips: boolean[];
  /** The bankroll before the first flip and after each one. */
  path: number[];
  /** The share of the bankroll staked on each flip. */
  fractions: number[];
  /** What was staked on the latest flip. */
  lastStake: number | null;
}

const newGame = (scenario: ScenarioId): Game => ({ scenario, flips: [], path: [START_BANKROLL], fractions: [], lastStake: null });

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** What the table will actually take for a fraction: whole cents, at least the minimum, never more than the bankroll. */
export const effectiveStake = (bankroll: number, fraction: number): number =>
  fraction <= 0 ? 0 : Math.min(bankroll, Math.max(MIN_STAKE, stakeFor(bankroll, fraction)));

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const stakeId = useId();
  const scenarioId = useId();

  const [game, setGame] = useState<Game>(() => newGame('coin60'));
  const [fraction, setFraction] = useState<number>(DEFAULT_FRACTION);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKelly, setShowKelly] = useState(false);

  // Handlers and timers read the latest game from here; rendering reads `game`.
  const gameRef = useRef(game);
  const busyRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const commit = (next: Game) => {
    gameRef.current = next;
    setGame(next);
  };
  const commitBusy = (next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  };

  const wager = SCENARIOS[game.scenario];
  const kelly = kellyFraction(wager);
  const bankroll = game.path[game.path.length - 1];
  const used = game.flips.length;
  const finished = isFinished(bankroll, used);
  const reason: FinishReason | null = !finished ? null : bankroll < MIN_STAKE ? 'bust' : bankroll >= CAP ? 'cap' : 'flips';
  const kellyPath = useMemo(() => fixedFractionPath(SCENARIOS[game.scenario], kellyFraction(SCENARIOS[game.scenario]), game.flips), [game.scenario, game.flips]);
  const kellyBankroll = kellyPath[kellyPath.length - 1];

  /** Stakes `stakeFraction` of the bankroll on one flip. Returns whether play can go on. */
  const flipOnce = (stakeFraction: number): boolean => {
    const g = gameRef.current;
    const before = g.path[g.path.length - 1];
    if (isFinished(before, g.flips.length)) return false;
    const bet = SCENARIOS[g.scenario];
    const stake = effectiveStake(before, stakeFraction);
    const won = Math.random() < bet.p;
    const after = settle(before, stake, won, bet.b);
    commit({ ...g, flips: [...g.flips, won], path: [...g.path, after], fractions: [...g.fractions, stake / before], lastStake: stake });
    return !isFinished(after, g.flips.length + 1);
  };

  const run = (count: number) => {
    if (busyRef.current || finished) return;
    if (fraction <= 0) {
      setError(t.needStake);
      return;
    }
    setError(null);
    const reduced = prefersReducedMotion();
    // The whole run stakes the fraction chosen when it started.
    const stakeFraction = fraction;
    const step = (remaining: number) => {
      const more = flipOnce(stakeFraction);
      if (!more || remaining <= 1) {
        commitBusy(false);
        return;
      }
      if (reduced) step(remaining - 1);
      else timers.current.push(setTimeout(() => step(remaining - 1), TIMING.auto));
    };
    commitBusy(true);
    if (count === 1 && !reduced) {
      setSpinning(true);
      timers.current.push(
        setTimeout(() => {
          setSpinning(false);
          step(1);
        }, TIMING.spin),
      );
    } else {
      step(count);
    }
  };

  const reset = (scenario: ScenarioId) => {
    timers.current.forEach(clearTimeout);
    timers.current.length = 0;
    commitBusy(false);
    setSpinning(false);
    setError(null);
    commit(newGame(scenario));
  };

  const last = used > 0 ? game.flips[used - 1] : null;
  const stake = effectiveStake(bankroll, fraction);
  const heads = game.flips.filter(Boolean).length;
  const averageStake = used > 0 ? game.fractions.reduce((sum, f) => sum + f, 0) / used : null;
  const largestStake = used > 0 ? Math.max(...game.fractions) : null;
  const sequence = game.flips.map((won) => (won ? 'H' : 'T')).join('');
  const recent = game.flips.slice(-RECENT);

  const message = error
    ? { text: error, tone: 'error' }
    : reason
      ? { text: `${t.finished(reason, used, money(reason === 'cap' ? CAP : bankroll))} ${t.finishedKelly(percent(kelly), money(kellyBankroll))}`, tone: reason === 'bust' ? 'lose' : 'done' }
      : last === null || game.lastStake === null
        ? { text: t.startPrompt(percent(wager.p), t.oddsShort(wager.b)), tone: 'idle' }
        : { text: t.lastFlip(last, money(last ? Math.round(game.lastStake * wager.b * 100) / 100 : game.lastStake)), tone: last ? 'win' : 'lose' };

  const face = last === null ? null : last ? t.heads : t.tails;

  return (
    <div className={styles.playGrid}>
      <div className={styles.panel}>
        <div className={styles.stage}>
          <div
            className={styles.coin}
            role="img"
            aria-label={face === null ? t.coinIdle : t.coinAria(face)}
            data-face={last === null ? 'idle' : last ? 'heads' : 'tails'}
            data-spinning={spinning ? 'true' : undefined}
            data-testid="kelly-coin"
          >
            <span aria-hidden="true">{last === null ? '?' : last ? t.headsShort : t.tailsShort}</span>
          </div>
          {/* A run of flips changes this many times a second; it is announced once the run has stopped. */}
          <p className={styles.message} role="status" aria-live={busy ? 'off' : 'polite'} data-tone={message.tone} data-testid="kelly-message">
            {message.text}
          </p>
        </div>

        <div className={styles.pills}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.bankroll}</span>
            <span className={styles.pillValue} data-testid="kelly-bankroll">
              {money(bankroll)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.flips}</span>
            <span className={styles.pillValue} data-testid="kelly-flips">
              {used} / {MAX_FLIPS}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>{t.cap}</span>
            <span className={styles.pillValue}>{money(CAP)}</span>
          </div>
        </div>

      </div>

      {/* The bet comes right after the coin, so on a phone the buttons sit under the table. */}
      <div className={styles.panel}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={scenarioId}>
            {t.scenarioLabel}
          </label>
          <select id={scenarioId} className={styles.input} value={game.scenario} onChange={(e) => reset(e.target.value as ScenarioId)} disabled={busy}>
            {SCENARIO_IDS.map((id) => (
              <option key={id} value={id}>
                {t.scenarioName[id]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.stakeBlock}>
          <label className={styles.fieldLabel} htmlFor={stakeId}>
            {t.stakeLabel}
          </label>
          <input
            id={stakeId}
            className={styles.slider}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(fraction * 100)}
            onChange={(e) => {
              setFraction(Number(e.target.value) / 100);
              setError(null);
            }}
            disabled={busy || finished}
            aria-valuetext={t.stakeValue(percent(fraction, 0), money(stake))}
          />
          <p className={styles.stakeValue} data-testid="kelly-stake">
            {t.stakeValue(percent(fraction, 0), money(stake))}
          </p>
          <div className={styles.quickRow} role="group" aria-label={t.quickStakes}>
            {QUICK_FRACTIONS.map((f) => (
              <button
                key={f}
                type="button"
                className={styles.chipBtn}
                aria-pressed={Math.round(fraction * 100) === Math.round(f * 100)}
                onClick={() => {
                  setFraction(f);
                  setError(null);
                }}
                disabled={busy || finished}
                data-quick={f}
              >
                {f === 1 ? t.allIn : percent(f, 0)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => run(1)} disabled={busy || finished}>
            {busy ? t.flipping : t.flip}
          </button>
          {RUN_LENGTHS.map((count) => (
            <button key={count} type="button" className={styles.btn} onClick={() => run(count)} disabled={busy || finished} aria-label={t.flipManyAria(count)} data-run={count}>
              {t.flipMany(count)}
            </button>
          ))}
          <button type="button" className={`${styles.btn} ${styles.spacerLeft}`} onClick={() => reset(game.scenario)}>
            {t.newGame}
          </button>
        </div>

        <div className={styles.hintRow}>
          <label className={styles.hintToggle}>
            <input type="checkbox" checked={showKelly} onChange={(e) => setShowKelly(e.target.checked)} />
            {t.kellyToggle}
          </label>
          {showKelly && (
            <span className={styles.hintText} data-testid="kelly-hint">
              {t.kellyHint(percent(kelly), money(effectiveStake(bankroll, kelly)))}
            </span>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <h3 className={`${styles.sectionLabel} ${styles.first}`}>{t.chartTitle}</h3>
        <BankrollChart
          you={game.path}
          kelly={kellyPath}
          start={START_BANKROLL}
          cap={CAP}
          maxFlips={MAX_FLIPS}
          ariaLabel={t.chartTitle}
          youLabel={t.chartYou}
          kellyLabel={t.chartKelly(percent(kelly))}
        />
        {/* The chart in words, for screen readers. */}
        <p className={styles.srOnly} data-testid="kelly-chart-summary">
          {t.chartSummary(used, money(bankroll), money(kellyBankroll))}
        </p>

        <h3 className={styles.sectionLabel}>{t.recentTitle}</h3>
        <ol className={styles.recent} aria-label={t.recentAria(recent.length)} data-testid="kelly-recent" data-flips={sequence}>
          {recent.map((won, i) => (
            <li key={used - recent.length + i} data-win={won ? 'true' : 'false'}>
              <span aria-hidden="true">{won ? t.headsShort : t.tailsShort}</span>
              <span className={styles.srOnly}>{won ? t.heads : t.tails}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.panel}>
        <h3 className={`${styles.sectionLabel} ${styles.first}`}>{t.statsTitle}</h3>
        <dl className={styles.statList} data-testid="kelly-stats">
          <div>
            <dt>{t.statFlips}</dt>
            <dd>{used}</dd>
          </div>
          <div>
            <dt>{t.statHeads}</dt>
            <dd>
              {heads}
              {used > 0 && <small> {percent(heads / used, 1)}</small>}
            </dd>
          </div>
          <div>
            <dt>{t.statAverageStake}</dt>
            <dd data-testid="kelly-average-stake">{averageStake === null ? '–' : percent(averageStake, 1)}</dd>
          </div>
          <div>
            <dt>{t.statLargestStake}</dt>
            <dd>{largestStake === null ? '–' : percent(largestStake, 1)}</dd>
          </div>
          <div className={styles.statWide}>
            <dt>{t.statKelly(percent(kelly))}</dt>
            <dd data-testid="kelly-shadow">{money(kellyBankroll)}</dd>
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
