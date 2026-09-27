'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import {
  PAY_RULES,
  analyzeMachine,
  isJackpotNearMiss,
  resolveSpin,
  spinReels,
  winningReels,
  type SpinResult,
  type Stops,
} from './engine';
import { getStrings } from './i18n';
import { Reels } from './Reels';
import { SlotSymbol } from './Symbols';
import styles from './SlotMachine.module.css';

export const INITIAL_CREDITS = 500;
export const BET_OPTIONS = [1, 2, 5, 10] as const;
const AUTO_SPINS = 10;
const AUTO_GAP_MS = 450;
/** Resting reels before the first spin: plum / BAR / plum, a non-winning line. */
const INITIAL_STOPS: Stops = [4, 8, 2];
/** Wins at least this many times the bet get the big-win lights. */
const BIG_WIN_MULTIPLE = 50;
const RECENT_LIMIT = 8;

const ODDS = analyzeMachine();

interface SessionStats {
  spins: number;
  wagered: number;
  paid: number;
  hits: number;
  biggest: number;
  nearMisses: number;
}

const EMPTY_STATS: SessionStats = { spins: 0, wagered: 0, paid: 0, hits: 0, biggest: 0, nearMisses: 0 };

interface RecentSpin {
  id: number;
  result: SpinResult;
}

export const PlayTab = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 2) =>
    `${(v * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

  const [credits, setCredits] = useState(INITIAL_CREDITS);
  const [bet, setBet] = useState<number>(BET_OPTIONS[0]);
  const [spinning, setSpinning] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [stops, setStops] = useState<Stops>(INITIAL_STOPS);
  const [anticipation, setAnticipation] = useState(false);
  const [last, setLast] = useState<SpinResult | null>(null);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [recent, setRecent] = useState<RecentSpin[]>([]);
  const [autoLeft, setAutoLeft] = useState(0);
  const [bigWin, setBigWin] = useState(false);

  // Refs mirror what the spin / auto-spin callbacks must read synchronously
  // (a second click or the auto timer can fire before React re-renders).
  const spinningRef = useRef(false);
  const creditsRef = useRef(INITIAL_CREDITS);
  const betRef = useRef<number>(BET_OPTIONS[0]);
  const pendingRef = useRef<SpinResult | null>(null);
  const recentId = useRef(0);

  const doSpin = useCallback(() => {
    const stake = betRef.current;
    if (spinningRef.current || creditsRef.current < stake) return;
    spinningRef.current = true;
    creditsRef.current -= stake;
    setCredits(creditsRef.current);
    const result = resolveSpin(spinReels(), stake);
    pendingRef.current = result;
    setStops(result.stops);
    setAnticipation(result.line[0] === 'seven' && result.line[1] === 'seven');
    setLast(null);
    setBigWin(false);
    setSpinning(true);
    setSpinId((id) => id + 1);
  }, []);

  const settle = useCallback(() => {
    const result = pendingRef.current;
    if (!result) return;
    pendingRef.current = null;
    creditsRef.current += result.win;
    setCredits(creditsRef.current);
    setLast(result);
    setBigWin(result.win >= result.bet * BIG_WIN_MULTIPLE);
    setStats((s) => ({
      spins: s.spins + 1,
      wagered: s.wagered + result.bet,
      paid: s.paid + result.win,
      hits: s.hits + (result.win > 0 ? 1 : 0),
      biggest: Math.max(s.biggest, result.win),
      nearMisses: s.nearMisses + (isJackpotNearMiss(result.stops) ? 1 : 0),
    }));
    const entry = { id: recentId.current++, result };
    setRecent((r) => [entry, ...r].slice(0, RECENT_LIMIT));
    spinningRef.current = false;
    setSpinning(false);
  }, []);

  // Auto-spin: after each settled spin, start the next one while any remain.
  useEffect(() => {
    if (spinning || autoLeft <= 0) return;
    const timer = window.setTimeout(() => {
      if (creditsRef.current < betRef.current) {
        setAutoLeft(0);
        return;
      }
      setAutoLeft((n) => n - 1);
      doSpin();
    }, AUTO_GAP_MS);
    return () => window.clearTimeout(timer);
  }, [spinning, autoLeft, doSpin]);

  const chooseBet = (value: number) => {
    if (spinningRef.current) return;
    betRef.current = value;
    setBet(value);
  };

  const reset = () => {
    if (spinningRef.current) return;
    creditsRef.current = INITIAL_CREDITS;
    setCredits(INITIAL_CREDITS);
    setStats(EMPTY_STATS);
    setRecent([]);
    setLast(null);
    setBigWin(false);
    setAutoLeft(0);
  };

  const canSpin = !spinning && credits >= bet;
  const autoRunning = autoLeft > 0;
  const lineSymbols = last ? last.line.map((s) => t.symbolName[s]) : null;
  const observed = stats.wagered > 0 ? stats.paid / stats.wagered : null;

  return (
    <div className={styles.playGrid}>
      <div className={`${styles.cabinet} ${bigWin ? styles.cabinetBigWin : ''}`} data-spinning={spinning ? 'true' : 'false'}>
        <div className={styles.marquee} aria-hidden="true">
          <span className={styles.marqueeText}>LUCKY 7</span>
        </div>

        <div className={styles.machineBody}>
          <Reels
            stops={stops}
            spinId={spinId}
            anticipation={anticipation}
            winningReels={winningReels(last?.rule ?? null)}
            onSettled={settle}
            label={lineSymbols ? t.reelsResult(lineSymbols) : t.reelsIdle}
          />
          <button
            type="button"
            className={styles.lever}
            onClick={doSpin}
            disabled={!canSpin || autoRunning}
            aria-label={t.lever}
            data-pulled={spinning ? 'true' : 'false'}
          >
            <span className={styles.leverArm} />
            <span className={styles.leverKnob} />
          </button>
        </div>

        <div className={styles.meters}>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.credits}</span>
            <span className={styles.meterValue} data-testid="slot-credits">
              {credits}
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <span className={styles.meterValue}>{bet}</span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={`${styles.meterValue} ${last && last.win > 0 ? styles.meterWin : ''}`} data-testid="slot-win">
              {last ? last.win : 0}
            </span>
          </div>
        </div>

        <p className={styles.resultLine} aria-live="polite">
          {last
            ? last.rule
              ? t.resultWin(last.win, t.ruleName[last.rule.id])
              : t.resultLose
            : !spinning && credits < bet
              ? t.outOfCredits
              : ' '}
        </p>

        <div className={styles.controls}>
          <div className={styles.betRow} role="radiogroup" aria-label={t.bet}>
            {BET_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={bet === value}
                aria-label={t.betAria(value)}
                className={styles.betChip}
                onClick={() => chooseBet(value)}
                disabled={spinning || autoRunning}
              >
                {value}
              </button>
            ))}
          </div>
          <button type="button" className={styles.spinButton} onClick={doSpin} disabled={!canSpin || autoRunning}>
            {spinning ? t.spinning : t.spin}
          </button>
          <div className={styles.secondaryRow}>
            {autoRunning ? (
              <button type="button" className={styles.btn} onClick={() => setAutoLeft(0)}>
                {t.stopAuto} ({autoLeft})
              </button>
            ) : (
              <button type="button" className={styles.btn} onClick={() => setAutoLeft(AUTO_SPINS)} disabled={!canSpin}>
                {t.auto(AUTO_SPINS)}
              </button>
            )}
            <button type="button" className={styles.btn} onClick={reset} disabled={spinning || autoRunning}>
              {t.reset}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.sidePanel}>
        <section className={styles.panel} aria-labelledby="slot-session-title">
          <h2 id="slot-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.spins}</dt>
              <dd>{fmt(stats.spins)}</dd>
            </div>
            <div>
              <dt>{t.wagered}</dt>
              <dd>{fmt(stats.wagered)}</dd>
            </div>
            <div>
              <dt>{t.paidOut}</dt>
              <dd>{fmt(stats.paid)}</dd>
            </div>
            <div>
              <dt>{t.net}</dt>
              <dd className={stats.paid - stats.wagered >= 0 ? styles.pos : styles.neg}>
                {stats.paid - stats.wagered > 0 ? '+' : ''}
                {fmt(stats.paid - stats.wagered)}
              </dd>
            </div>
            <div>
              <dt>{t.hits}</dt>
              <dd>
                {fmt(stats.hits)}
                {stats.spins > 0 && <small> ({pct(stats.hits / stats.spins, 1)})</small>}
              </dd>
            </div>
            <div>
              <dt>{t.biggestWin}</dt>
              <dd>{fmt(stats.biggest)}</dd>
            </div>
            <div title={t.nearMissHint}>
              <dt>{t.nearMisses}</dt>
              <dd>{fmt(stats.nearMisses)}</dd>
            </div>
          </dl>

          <div className={styles.rtpCompare}>
            <div className={styles.rtpRow}>
              <span>{t.observedRtp}</span>
              <b data-testid="slot-observed-rtp">{observed === null ? '—' : pct(observed, 1)}</b>
            </div>
            <div className={styles.rtpBarTrack} aria-hidden="true">
              <span className={styles.rtpBarObserved} style={{ width: `${Math.min(100, ((observed ?? 0) / 2) * 100)}%` }} />
              <span className={styles.rtpBarTheory} style={{ left: `${(ODDS.rtp / 2) * 100}%` }} />
            </div>
            <div className={styles.rtpRow}>
              <span>{t.theoreticalRtp}</span>
              <b>{pct(ODDS.rtp)}</b>
            </div>
            {stats.spins > 0 && <p className={styles.note}>{t.rtpGapNote(stats.spins, fmt(ODDS.spinsForOnePercent))}</p>}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="slot-paytable-title">
          <h2 id="slot-paytable-title" className={styles.panelTitle}>
            {t.paytable}
          </h2>
          <table className={styles.miniPaytable}>
            <tbody>
              {PAY_RULES.map((rule) => (
                <tr key={rule.id} className={last?.rule?.id === rule.id ? styles.paytableHit : undefined}>
                  <td>
                    <span className={styles.paytableSymbols}>
                      {rule.pattern.map((p, i) =>
                        p === 'any' ? (
                          <span key={i} className={styles.anySymbol}>
                            –
                          </span>
                        ) : (
                          <SlotSymbol key={i} id={p} className={styles.miniSymbol} />
                        ),
                      )}
                    </span>
                    <span className={styles.srOnly}>{t.ruleName[rule.id]}</span>
                  </td>
                  <td className={styles.paytablePays}>{rule.pays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {recent.length > 0 && (
          <section className={styles.panel} aria-labelledby="slot-recent-title">
            <h2 id="slot-recent-title" className={styles.panelTitle}>
              {t.recentSpins}
            </h2>
            <ol className={styles.recentList}>
              {recent.map(({ id, result }) => (
                <li key={id} className={result.win > 0 ? styles.recentWin : undefined}>
                  <span className={styles.recentSymbols}>
                    {result.line.map((s, i) => (
                      <SlotSymbol key={i} id={s} className={styles.miniSymbol} />
                    ))}
                  </span>
                  <span className={styles.srOnly}>{result.line.map((s) => t.symbolName[s]).join(', ')}</span>
                  <span className={styles.recentWinAmount}>{result.win > 0 ? `+${result.win}` : '0'}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
};
