'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { REFILL } from '../MedalCenter/ledger';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { PAY_RULES, analyzeMachine, isJackpotNearMiss, resolveSpin, spinReels, winningReels, type SpinResult, type Stops } from './engine';
import { getStrings } from './i18n';
import { MedalIcon } from './MedalIcon';
import { BET_OPTIONS, browserStorage, createTable, randomName, tabName, type Bet, type Round, type Table } from './medals';
import { Reels } from './Reels';
import { SlotSymbol } from './Symbols';
import styles from './SlotMachine.module.css';

export { BET_OPTIONS };
const AUTO_SPINS = 10;
const AUTO_GAP_MS = 450;
/** Resting reels before the first spin: plum / BAR / plum, a non-winning line. */
const INITIAL_STOPS: Stops = [4, 8, 2];
/** Wins at least this many times the bet get the big-win lights. */
const BIG_WIN_MULTIPLE = 50;
const RECENT_LIMIT = 8;
/** How many digits each LED display has: the medals up to 9,999,999 (as the medal center's counter), the bet, and a win (3 × 1000 at most). */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 1;
export const WIN_PLACES = 4;
/**
 * How long the machine waits for the card before it says that the medals are
 * being played in another tab, in seconds. The card is away for a moment
 * whenever another page takes the day's bonus or the like; nothing is said of that.
 */
export const CARD_WAIT = 1.5;

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

/** Who is playing, as the site says: the medals on the table have to be theirs before a medal is bet. */
export interface SlotPlayer {
  uid: string | null;
  /** Whether the site is sure who is signed in. Until it is, the medals on the table are played as they are, as the Medal Pusher plays them. */
  settled: boolean;
}

const GUEST_PLAYER: SlotPlayer = { uid: null, settled: true };

/** Whether the medals on the table are the player's: a signed-in player's medals are not played while a guest's stand in for them. */
const theirs = (player: SlotPlayer): boolean => !player.settled || medalBank().owner() === player.uid;

/** The round on the reels: its name, its outcome, and whether it is one left under way before a reload. */
interface OnReels {
  round: Pick<Round, 'id' | 'owner'>;
  result: SpinResult;
  resumed: boolean;
}

export interface PlayTabProps {
  player?: SlotPlayer;
}

export const PlayTab = ({ player = GUEST_PLAYER }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 2) =>
    `${(v * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

  // The medals are the medal center's (MedalCenter/bank.ts), and so is the card that lets this machine play with them.
  const medals = useBank();
  const [bet, setBet] = useState<Bet>(BET_OPTIONS[0]);
  const [spinning, setSpinning] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [stops, setStops] = useState<Stops>(INITIAL_STOPS);
  const [anticipation, setAnticipation] = useState(false);
  const [last, setLast] = useState<SpinResult | null>(null);
  const [lastResumed, setLastResumed] = useState(false);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [recent, setRecent] = useState<RecentSpin[]>([]);
  const [autoLeft, setAutoLeft] = useState(0);
  const [bigWin, setBigWin] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // The meters as the machine shows them: a win runs into the medals, the WIN meter counting up beside them, as a
  // medal slot pays (countUp.ts). The numbers in type are the medals as they are.
  const medalMeter = useCountUp(medals.loaded ? medals.balance : null);
  const winMeter = useCountUp(last ? last.win : 0);
  const { pay: payMedals } = medalMeter;
  const { pay: payWin } = winMeter;

  // Refs mirror what the spin / auto-spin callbacks must read synchronously
  // (a second click or the auto timer can fire before React re-renders).
  const spinningRef = useRef(false);
  const betRef = useRef<Bet>(BET_OPTIONS[0]);
  const pendingRef = useRef<OnReels | null>(null);
  const recentId = useRef(0);
  const table = useRef<Table | null>(null);
  const playerRef = useRef(player);
  const live = useRef({ t });
  // The rounds left under way that this page has shown again, so that each is shown once.
  const shown = useRef(new Set<string>());

  useEffect(() => {
    playerRef.current = player;
    live.current = { t };
  });

  /** Sets the reels rolling to a round's outcome. */
  const roll = useCallback((round: Pick<Round, 'id' | 'owner' | 'bet' | 'stops'>, resumed: boolean) => {
    const result = resolveSpin(round.stops, round.bet);
    spinningRef.current = true;
    pendingRef.current = { round, result, resumed };
    setStops(result.stops);
    setAnticipation(result.line[0] === 'seven' && result.line[1] === 'seven');
    setLast(null);
    setLastResumed(false);
    setBigWin(false);
    setSpinning(true);
    setSpinId((id) => id + 1);
  }, []);

  const doSpin = useCallback(() => {
    const mine = table.current;
    if (spinningRef.current || !mine || !theirs(playerRef.current)) return;
    // The outcome is drawn as the lever is pulled, and the stake is taken with it (medals.ts).
    const placed = mine.bet(betRef.current, spinReels());
    if (!placed.ok) return;
    roll(placed.round, false);
  }, [roll]);

  const settle = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    spinningRef.current = false;
    setSpinning(false);
    // A round the reset at the medal center made void is shown as nothing.
    if (!pending) return;
    const { result } = pending;
    // The win runs into the medals on the meters.
    if (result.win > 0) {
      payMedals();
      payWin();
    }
    // Paid now, if the card going had not paid it already (medals.ts).
    table.current?.finish(pending.round);
    setLast(result);
    setLastResumed(pending.resumed);
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
    if (pending.resumed) setAnnouncement(live.current.t.resumed);
  }, [payMedals, payWin]);

  // The machine's place at the medal bank, while the page is open: the card is asked for at once, and a reset at the
  // medal center starts the machine over.
  useEffect(() => {
    const mine = createTable({
      bank: medalBank(),
      storage: browserStorage(),
      tab: tabName(),
      name: randomName,
      events: {
        yielding: (why) => {
          // A moment's lending (the day's bonus taken at the hub, say) gives the card straight back: auto-spin waits it out.
          if (why !== 'moment') setAutoLeft(0);
        },
        restart: () => {
          // Every medal of the era before the reset is gone, the ones on the reels with them.
          pendingRef.current = null;
          setStats(EMPTY_STATS);
          setRecent([]);
          setLast(null);
          setLastResumed(false);
          setBigWin(false);
          setAutoLeft(0);
          setAnnouncement(live.current.t.sayRestart);
        },
      },
    });
    table.current = mine;
    const getUp = mine.sit();
    const unlisten = medalBank().listen((event) => {
      if (event.type === 'refill') setAnnouncement(live.current.t.sayRefill(event.medals));
    });
    return () => {
      unlisten();
      getUp();
      if (table.current === mine) table.current = null;
    };
  }, []);

  // Whenever the card is here and the medals on the table change hands or era: a round still to be paid is paid, and a
  // round this tab left under way before a reload is shown again, reels and all, once.
  const era = medals.ledger?.era ?? null;
  useEffect(() => {
    const mine = table.current;
    if (!mine || medals.card !== 'here' || !medals.loaded) return;
    mine.payDue();
    if (spinningRef.current) return;
    const round = mine.leftover();
    if (!round || shown.current.has(round.id)) return;
    shown.current.add(round.id);
    roll(round, true);
  }, [medals.card, medals.loaded, medals.owner, era, roll]);

  // Auto-spin: after each settled spin (and its win has run into the medals), start the next one while any remain and
  // the medals allow.
  const counting = medalMeter.counting;
  useEffect(() => {
    if (spinning || counting || autoLeft <= 0) return;
    const timer = window.setTimeout(() => {
      if (!table.current?.holding() || !theirs(playerRef.current) || medalBank().balance() < betRef.current) {
        setAutoLeft(0);
        return;
      }
      setAutoLeft((n) => n - 1);
      doSpin();
    }, AUTO_GAP_MS);
    return () => window.clearTimeout(timer);
  }, [spinning, counting, autoLeft, doSpin]);

  // While the card is in another tab's machine, the machine says so, a moment after (it is away for a moment whenever
  // another page takes the day's bonus or the like, and nothing need be said of that).
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (medals.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [medals.card]);
  const cardAway = medals.card === 'away' || (medals.card === 'asking' && longWait);

  const chooseBet = (value: Bet) => {
    if (spinningRef.current) return;
    betRef.current = value;
    setBet(value);
  };

  const ready = medals.loaded && medals.card === 'here' && (!player.settled || medals.owner === player.uid);
  const canSpin = ready && !spinning && medals.balance >= bet;
  const autoRunning = autoLeft > 0;
  const lineSymbols = last ? last.line.map((s) => t.symbolName[s]) : null;
  const observed = stats.wagered > 0 ? stats.paid / stats.wagered : null;
  const outOfMedals = ready && !spinning && medals.balance === 0;

  return (
    <div className={styles.playGrid}>
      <div className={`${styles.cabinet} ${bigWin ? styles.cabinetBigWin : ''}`} data-spinning={spinning ? 'true' : 'false'} data-card={medals.card}>
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

        {/* The medals, the bet and the win, on LED displays as a medal machine shows them. The numbers are in type
            beside them, for a screen reader and for anything else that reads the page. */}
        <div className={styles.meters}>
          <div className={`${styles.meter} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>
              <MedalIcon className={styles.meterMedal} />
              {t.medals}
            </span>
            <span className={styles.meterValue} data-testid="slot-medals" data-loaded={medals.loaded}>
              {medals.loaded ? fmt(medals.balance) : '—'}
            </span>
            <span className={styles.led} data-testid="slot-medals-led" data-shown={medalMeter.shown ?? ''}>
              <SegmentDisplay value={medalMeter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <span className={styles.meterValue} data-testid="slot-bet">
              {bet}
            </span>
            <span className={styles.led}>
              <SegmentDisplay value={bet} places={BET_PLACES} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meter} ${last && last.win > 0 ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="slot-win">
              {last ? last.win : 0}
            </span>
            <span className={styles.led} data-testid="slot-win-led" data-shown={winMeter.shown ?? 0}>
              <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        <p className={styles.resultLine} aria-live="polite" data-testid="slot-result">
          {last
            ? last.rule
              ? t.resultWin(last.win, t.ruleName[last.rule.id])
              : t.resultLose
            : outOfMedals
              ? t.outOfMedals
              : ready && !spinning && medals.balance < bet
                ? t.notEnough(bet)
                : ' '}
        </p>
        {lastResumed && (
          <p className={styles.resumedLine} data-testid="slot-resumed">
            {t.resumed}
          </p>
        )}

        <div className={styles.controls}>
          <div className={styles.betRow} role="radiogroup" aria-label={t.bet}>
            {BET_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={bet === value}
                aria-label={t.betAria(value)}
                className={styles.betMedal}
                data-testid={`slot-bet-${value}`}
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
          </div>
        </div>

        {/* The attendant's free cupful, the medal center's own, for a player with no medals left. */}
        {outOfMedals && (
          <button type="button" className={styles.refill} data-testid="slot-refill" onClick={() => medalBank().refill()}>
            {t.refill(REFILL)}
          </button>
        )}

        <div className={styles.medalNotes}>
          <p data-testid="slot-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.cabinetLink} href={MEDAL_CENTER_PATH} data-testid="slot-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The member's card is in a machine in another tab: this one waits until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="slot-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="slot-play-here" onClick={() => table.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
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

      <p className={styles.srOnly} aria-live="polite" data-testid="slot-announcement">
        {announcement}
      </p>
    </div>
  );
};
