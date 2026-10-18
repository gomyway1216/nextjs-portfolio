'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { FishArt, FloatArt, MedalArt, ShadowArt } from './art';
import { BET_OPTIONS, CHEST, FISH, analyzeMachine, drawCast, fishOf, resolveCast, valueOf, type Bet, type CastResult, type Shadow } from './engine';
import { getStrings } from './i18n';
import { browserStorage, createPier, randomName, tabName, type Pier, type Round } from './medals';
import { CALM_TIMES, TIMES, chestLights, isEnd, reeledTo, showOf, stepAt, type Show, type Step } from './show';
import styles from './Fishing.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (as the medal center's counter), the bet, and a win (1,500 at most). */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 1;
export const WIN_PLACES = 4;
/** How long the machine waits for the card before it says that another tab has it, in milliseconds. */
export const CARD_WAIT = 1500;
/** How long the machine stands unplayed before its attract show starts, in milliseconds. */
export const ATTRACT_AFTER = 12_000;
/** Wins of this multiple or more get the big fanfare and the lights. */
const BIG_MULTIPLE = 50;
const RECENT_LIMIT = 8;
/** The swimmers in the water when nothing is on the line: their lanes, sizes and paces, for show. */
const SWIMMERS: readonly { shadow: Shadow; y: number; seconds: number; delay: number; left: boolean; x: number }[] = [
  { shadow: 'small', y: 18, seconds: 11, delay: -2, left: false, x: 8 },
  { shadow: 'medium', y: 30, seconds: 16, delay: -9, left: true, x: 62 },
  { shadow: 'small', y: 56, seconds: 9, delay: -5, left: true, x: 74 },
  { shadow: 'large', y: 66, seconds: 21, delay: -14, left: false, x: 4 },
  { shadow: 'small', y: 76, seconds: 12, delay: -7, left: false, x: 66 },
  { shadow: 'medium', y: 44, seconds: 18, delay: -3, left: false, x: 14 },
];

const ODDS = analyzeMachine();

/** Who is playing, as the site says: the medals on the table have to be theirs before a medal is cast. */
export interface FishingPlayer {
  uid: string | null;
  /** Whether the site is sure who is signed in. Until it is, the medals on the table are played as they are. */
  settled: boolean;
}

const GUEST_PLAYER: FishingPlayer = { uid: null, settled: true };

/** Whether the medals on the table are the player's: a signed-in player's medals are not played while a guest's stand in for them. */
const theirs = (player: FishingPlayer): boolean => !player.settled || medalBank().owner() === player.uid;

const MOTION = '(prefers-reduced-motion: reduce)';
const prefersCalm = (): boolean => window.matchMedia?.(MOTION).matches === true;
const subscribeToMotion = (listener: () => void): (() => void) => {
  const query = window.matchMedia?.(MOTION);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
};

interface SessionStats {
  casts: number;
  played: number;
  won: number;
  catches: number;
  biggest: number;
}
const EMPTY_STATS: SessionStats = { casts: 0, played: 0, won: 0, catches: 0, biggest: 0 };

interface RecentCast {
  id: number;
  result: CastResult;
}

/** The cast on the line: its round, what it comes to, its show, and whether it is one left under way before a reload. */
interface OnLine {
  round: Pick<Round, 'id' | 'owner'>;
  result: CastResult;
  show: Show;
  resumed: boolean;
}

export interface CabinetProps {
  player?: FishingPlayer;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The cabinet: the harbor on its screen, the counters, the buttons, and the
 * fish board beside it. What happens to the medals is the pier's
 * (`medals.ts`); this draws each cast, plays it out (`show.ts`) and shows it.
 */
export const Cabinet = ({ player = GUEST_PLAYER, active = true }: CabinetProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

  const medals = useBank();
  const calm = useSyncExternalStore(subscribeToMotion, prefersCalm, () => false);
  const [bet, setBet] = useState<Bet>(BET_OPTIONS[0]);
  const [step, setStep] = useState<Step | 'idle'>('idle');
  const [line, setLine] = useState<OnLine | null>(null);
  const [last, setLast] = useState<CastResult | null>(null);
  const [lastResumed, setLastResumed] = useState(false);
  const [chestLit, setChestLit] = useState<number | null>(null);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [recent, setRecent] = useState<RecentCast[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [attract, setAttract] = useState(false);
  const [castCount, setCastCount] = useState(0);
  // Pressed anywhere on the cabinet: the attract show stops, and waits again from then.
  const [touched, setTouched] = useState(0);
  // The cabinet's sound: off until the player switches it on. Each medal of a catch chirps as it is counted in.
  const sound = useMachineSound();
  const { play, tick } = sound;
  // What a cast still on the screen paid before its show ended: the card went for a moment as it played (the medal
  // center taking the day's bonus, say), or the page was reloaded under it, and the round was paid as the card went.
  // The medals are in; the meters do not show them before the fish is landed on the screen.
  const [hiddenWin, setHiddenWin] = useState(0);
  const shownMedals = Math.max(0, medals.balance - hiddenWin);
  const medalMeter = useCountUp(medals.loaded ? shownMedals : null, tick);
  const winMeter = useCountUp(last ? last.win : 0);
  const { pay: payMedals } = medalMeter;
  const { pay: payWin } = winMeter;

  // What the callbacks read at once (a second press, or a timer, can come before React draws again).
  const lineRef = useRef<OnLine | null>(null);
  const betRef = useRef<Bet>(BET_OPTIONS[0]);
  const pier = useRef<Pier | null>(null);
  const playerRef = useRef(player);
  const live = useRef({ t, calm });
  const timers = useRef(new Set<number>());
  const startedAt = useRef(0);
  const recentId = useRef(0);
  // The rounds left under way that this page has shown again, so that each is shown once.
  const shownAgain = useRef(new Set<string>());

  useEffect(() => {
    playerRef.current = player;
    live.current = { t, calm };
  });

  const later = useCallback((ms: number, what: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      what();
    }, Math.max(0, ms));
    timers.current.add(id);
  }, []);
  const stopTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
  }, []);

  /** The show has reached its end: the round is finished (paid now, or as the card went), and the result shown and counted in. */
  const land = useCallback(() => {
    const now = lineRef.current;
    if (!now) return;
    stopTimers();
    lineRef.current = null;
    setLine(null);
    const { result } = now;
    if (result.win > 0) {
      payMedals();
      payWin();
    }
    setHiddenWin(0);
    pier.current?.finish(now.round);
    setStep(now.show.end);
    setChestLit(result.cast.fish === 'chest' && result.cast.prize !== null ? result.cast.prize : null);
    setLast(result);
    setLastResumed(now.resumed);
    if (result.win > 0) play(result.multiple >= BIG_MULTIPLE ? 'big' : 'win');
    setStats((s) => ({
      casts: s.casts + 1,
      played: s.played + result.bet,
      won: s.won + result.win,
      catches: s.catches + (result.win > 0 ? 1 : 0),
      biggest: Math.max(s.biggest, result.win),
    }));
    const entry = { id: recentId.current++, result };
    setRecent((r) => [entry, ...r].slice(0, RECENT_LIMIT));
    const words = live.current.t;
    const fishName = result.cast.fish ? words.fishNames[result.cast.fish] : '';
    setAnnouncement(
      [
        now.resumed ? words.resumed : '',
        result.win > 0
          ? result.cast.fish === 'chest'
            ? words.chestLanded(result.multiple, result.win)
            : words.landed(fishName, result.multiple, result.win)
          : result.cast.fish
            ? words.away(fishName)
            : words.nothing,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }, [payMedals, payWin, play, stopTimers]);

  /** What each step does as it begins: its sounds, and the chest's lights. */
  const enter = useCallback(
    (next: Step, now: OnLine) => {
      setStep(next);
      const calmNow = live.current.calm;
      if (next === 'wait') play('splash');
      // Sounds that go on through a step are timed with the show, so that REEL and SKIP cut them off with it.
      else if (next === 'warning') [0, 180, 360, 700, 880, 1060].forEach((at) => later(at, () => play('hold')));
      else if (next === 'hooked') {
        play('bite');
        setAnnouncement(live.current.t.sayHooked);
      } else if (next === 'fight') {
        const length = calmNow ? CALM_TIMES.fight : TIMES.fight[fishOf(now.result.cast.fish!).shadow];
        for (let at = 0; at < length - 100; at += 280) later(at, () => play('ratchet'));
      } else if (next === 'chest') {
        const prize = now.result.cast.prize ?? 0;
        if (calmNow) {
          setChestLit(prize);
          return;
        }
        setChestLit(0);
        const begun = performance.now();
        for (const light of chestLights(prize)) {
          later(light.at - (performance.now() - begun), () => {
            setChestLit(light.lit);
            play('hold');
          });
        }
      }
    },
    [later, play],
  );

  /** Plays the show from `from` ms on: each step at its moment, and the end at the show's length. */
  const runFrom = useCallback(
    (now: OnLine, from: number) => {
      stopTimers();
      startedAt.current = performance.now() - from;
      const current = stepAt(now.show, from);
      if (from >= now.show.length) {
        land();
        return;
      }
      enter(current, now);
      for (const { step: next, at } of now.show.steps) {
        if (at <= from || isEnd(next)) continue;
        later(at - from, () => lineRef.current === now && enter(next, now));
      }
      later(now.show.length - from, () => lineRef.current === now && land());
    },
    [enter, land, later, stopTimers],
  );

  /** Puts a round on the line and plays its show from the start. */
  const start = useCallback(
    (round: Round, resumed: boolean) => {
      const result = resolveCast(round.cast, round.bet);
      const now: OnLine = { round: { id: round.id, owner: round.owner }, result, show: showOf(round.cast, live.current.calm), resumed };
      lineRef.current = now;
      setLine(now);
      setLast(null);
      setLastResumed(false);
      setChestLit(null);
      setAttract(false);
      setCastCount((n) => n + 1);
      runFrom(now, 0);
    },
    [runFrom],
  );

  const doCast = useCallback(() => {
    const mine = pier.current;
    if (lineRef.current || !mine || !theirs(playerRef.current)) return;
    // What the cast comes to is drawn as CAST is pressed, and the stake is taken with it (medals.ts).
    const placed = mine.cast(betRef.current, drawCast(Math.random));
    if (!placed.ok) return;
    for (let i = 0; i < placed.round.bet; i++) play('medal', i * 0.08);
    play('launch', placed.round.bet * 0.08);
    setAnnouncement(live.current.t.sayCast(placed.round.bet));
    start(placed.round, false);
  }, [play, start]);

  /** REEL: the show moves on to its next step. Only the show: what the cast comes to was drawn already. */
  const reel = useCallback(() => {
    const now = lineRef.current;
    if (!now) return;
    const elapsed = performance.now() - startedAt.current;
    // The float is let land first: a press as it flies is taken for the cast it was.
    if (elapsed < Math.min(now.show.length, TIMES.flight / 2)) return;
    runFrom(now, reeledTo(now.show, elapsed));
  }, [runFrom]);

  /** SKIP: straight to the end of the show. */
  const skip = useCallback(() => {
    const now = lineRef.current;
    if (!now) return;
    runFrom(now, now.show.length);
  }, [runFrom]);

  // The machine's place at the medal bank, while the page is open: the card is asked for at once, and a reset at the
  // medal center starts the machine over.
  useEffect(() => {
    const mine = createPier({
      bank: medalBank(),
      storage: browserStorage(),
      tab: tabName(),
      name: randomName,
      events: {
        yielding: () => {
          // The round on the line has been paid as the card goes: what it won stays off the meters until it is landed.
          const now = lineRef.current;
          const kept = now ? mine.current() : null;
          if (now && now.result.win > 0 && kept?.id === now.round.id && kept.paid) setHiddenWin(now.result.win);
        },
        restart: () => {
          // Every medal of the era before the reset is gone, the ones on the line with them.
          stopTimers();
          lineRef.current = null;
          setLine(null);
          setStep('idle');
          setHiddenWin(0);
          setStats(EMPTY_STATS);
          setRecent([]);
          setLast(null);
          setLastResumed(false);
          setChestLit(null);
          setAnnouncement(live.current.t.sayRestart);
        },
      },
    });
    pier.current = mine;
    const getUp = mine.sit();
    const unlisten = medalBank().listen((event) => {
      if (event.type === 'refill') setAnnouncement(live.current.t.sayRefill(event.medals));
    });
    const pending = timers.current;
    return () => {
      unlisten();
      getUp();
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
      if (pier.current === mine) pier.current = null;
    };
  }, [stopTimers]);

  // Whenever the card is here and the medals on the table change hands or era: a round still to be paid is paid, and a
  // round this tab left under way before a reload is shown again, once.
  const era = medals.ledger?.era ?? null;
  useEffect(() => {
    const mine = pier.current;
    if (!mine || medals.card !== 'here' || !medals.loaded) return;
    mine.payDue();
    if (lineRef.current) return;
    const round = mine.leftover();
    if (!round || shownAgain.current.has(round.id)) return;
    shownAgain.current.add(round.id);
    // Paid already, as the page before this one went: what it won stays off the meters until it is landed again.
    if (round.paid) setHiddenWin(resolveCast(round.cast, round.bet).win);
    start(round, true);
  }, [medals.card, medals.loaded, medals.owner, era, start]);

  // The attract show: a machine left standing unplayed for a while plays it, as cabinets on a real floor do, until
  // the next press.
  const casting = line !== null;
  useEffect(() => {
    if (casting || !active) return;
    const timer = window.setTimeout(() => setAttract(true), ATTRACT_AFTER);
    return () => window.clearTimeout(timer);
  }, [casting, active, castCount, bet, touched]);

  // While the card is in another tab's machine, the machine says so, a moment after (it is away for a moment whenever
  // another page takes the day's bonus or the like, and nothing need be said of that).
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (medals.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [medals.card]);
  const cardAway = medals.card === 'away' || (medals.card === 'asking' && longWait);

  const chooseBet = (value: Bet) => {
    if (lineRef.current) return;
    betRef.current = value;
    setBet(value);
    setAttract(false);
    play('button');
  };

  const ready = medals.loaded && medals.card === 'here' && (!player.settled || medals.owner === player.uid);
  const canCast = ready && !casting && medals.balance >= bet;
  const outOfMedals = ready && !casting && medals.balance === 0;
  const refillDue = outOfMedals && medals.out.length === 0;
  // Some medals left, but fewer than the bet: CAST cannot be pressed, and the machine says why.
  const short = ready && !casting && medals.balance > 0 && medals.balance < bet;

  // On a desktop: Space or Enter casts and reels, 1 3 5 choose the bet, S skips (machineKeys.ts).
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') {
      if (lineRef.current) reel();
      else if (canCast) doCast();
      return true;
    }
    if (key === 's') {
      skip();
      return true;
    }
    const value = BET_OPTIONS.find((b) => String(b) === key);
    if (value === undefined) return false;
    chooseBet(value);
    return true;
  });

  const shownStep: Step | 'idle' = step;
  const onLineFish = line?.result.cast.fish ?? null;
  const biter: Shadow | null = onLineFish ? fishOf(onLineFish).shadow : null;
  const result = line ? null : last;
  const ended = !line && last !== null && (step === 'landed' || step === 'away' || step === 'nothing');
  const fishName = (id: (typeof FISH)[number]['id']) => t.fishNames[id];
  const statusText = (() => {
    if (line) {
      if (shownStep === 'idle' || isEnd(shownStep as Step)) return t.steps.wait;
      return t.steps[shownStep as keyof typeof t.steps];
    }
    if (result) {
      if (result.win > 0) return result.cast.fish === 'chest' ? t.chestLanded(result.multiple, result.win) : t.landed(fishName(result.cast.fish!), result.multiple, result.win);
      return result.cast.fish ? t.away(fishName(result.cast.fish)) : t.nothing;
    }
    if (outOfMedals) return t.outOfMedals;
    if (short) return t.notEnough(bet);
    return t.attractSub;
  })();
  const pondState = line ? t.steps[(isEnd(shownStep as Step) || shownStep === 'idle' ? 'wait' : shownStep) as keyof typeof t.steps] : t.pondIdle;
  const big = result !== null && result.multiple >= BIG_MULTIPLE;
  const observed = stats.played > 0 ? stats.won / stats.played : null;

  return (
    <div className={styles.stage}>
      <div className={styles.cabinetWrap}>
        <div
          className={`${styles.cabinet} ${big && ended ? styles.cabinetBig : ''}`}
          data-testid="fishing-cabinet"
          data-ready={ready ? 'true' : 'false'}
          data-casting={casting ? 'true' : 'false'}
          data-step={shownStep}
          data-card={medals.card}
          data-attract={attract && !casting ? 'true' : 'false'}
          onPointerDown={() => {
            setAttract(false);
            setTouched((n) => n + 1);
          }}
        >
          <div className={styles.marquee} aria-hidden="true">
            <span className={styles.bulbs} />
            <span className={styles.marqueeText}>
              <span className={styles.marqueeMain}>{t.sign}</span>
              <span className={styles.marqueeSub} lang="ja">
                {t.signSub}
              </span>
            </span>
            <span className={styles.bulbs} />
          </div>

          {/* The screen: the harbor, its swimmers, the float and whatever is on the line. */}
          <div
            className={styles.pond}
            role="img"
            aria-label={t.pondLabel(pondState)}
            data-testid="fishing-pond"
            data-step={shownStep}
            data-biter={biter ?? ''}
            data-calm={calm ? 'true' : 'false'}
            data-shake={shownStep === 'fight' && (biter === 'lord' || biter === 'large') ? 'true' : 'false'}
          >
            <div className={styles.water} aria-hidden="true">
              <span className={styles.rays} />
              {SWIMMERS.map((swimmer, i) => (
                <span
                  key={i}
                  className={styles.lane}
                  data-left={swimmer.left ? 'true' : 'false'}
                  style={{ '--y': `${swimmer.y}%`, '--x': `${swimmer.x}%`, '--seconds': `${swimmer.seconds}s`, '--delay': `${swimmer.delay}s` } as CSSProperties}
                >
                  <ShadowArt shadow={swimmer.shadow} className={styles.swimmer} />
                </span>
              ))}
              {/* The attract show's giant shadow, gliding by while nobody plays. */}
              <span className={styles.attractLord} aria-hidden="true">
                <ShadowArt shadow="lord" className={styles.attractLordShadow} />
              </span>
            </div>

            <div className={styles.pier} aria-hidden="true" />

            {/* The line, from the rod's tip at the pier to the float. */}
            <svg className={styles.line} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-shown={casting && shownStep !== 'flight' && shownStep !== 'chest' ? 'true' : 'false'}>
              {shownStep === 'away' || (!casting && step === 'away') ? (
                <path d="M50 100 Q40 76 50 49" className={styles.lineSlack} />
              ) : (
                <path d={shownStep === 'fight' || shownStep === 'hooked' ? 'M50 100 L50 53' : 'M50 100 Q47 75 50 49'} className={styles.lineTaut} />
              )}
            </svg>

            {casting && (
              <div className={styles.flight} key={`flight-${line?.round.id}`} data-step={shownStep} aria-hidden="true">
                <span className={styles.splash} />
                <FloatArt className={styles.float} />
              </div>
            )}

            {/* What comes for the float: its shadow, the size of what was drawn. */}
            {casting && biter && (shownStep === 'wait' || shownStep === 'hooked' || shownStep === 'fight') && (
              <span className={styles.biter} data-shadow={biter} data-step={shownStep} aria-hidden="true">
                <ShadowArt shadow={biter} className={styles.biterShadow} />
              </span>
            )}

            {shownStep === 'warning' && casting && (
              <div className={styles.warning} aria-hidden="true">
                <span className={styles.warningText}>WARNING</span>
                <span className={styles.warningSub}>{t.lordComing}</span>
              </div>
            )}

            {/* The chest's roulette, running to the prize drawn. */}
            {casting && shownStep === 'chest' && (
              <div className={styles.chest} data-testid="fishing-chest" data-lit={chestLit ?? ''}>
                <FishArt id="chest" className={styles.chestArt} />
                <ol className={styles.prizes} aria-hidden="true">
                  {CHEST.map((prize, i) => (
                    <li key={prize.pays} className={styles.prize} data-on={chestLit === i ? 'true' : 'false'}>
                      ×{prize.pays}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* The catch, landed and shown; or the line come back without one. */}
            {ended && result && !attract && (
              <div className={styles.reveal} data-testid="fishing-reveal" data-result={result.win > 0 ? 'landed' : result.cast.fish ? 'away' : 'nothing'} data-fish={result.cast.fish ?? ''}>
                {result.win > 0 && result.cast.fish && (
                  <>
                    <span className={styles.getBanner} aria-hidden="true">
                      {t.get}
                    </span>
                    <FishArt id={result.cast.fish} className={styles.revealArt} />
                    <span className={styles.revealName}>{t.fishNames[result.cast.fish]}</span>
                    <span className={styles.revealPays}>
                      ×{result.multiple} → {fmt(result.win)}
                    </span>
                  </>
                )}
                {result.win === 0 && result.cast.fish && <span className={styles.awayText}>{t.away(t.fishNames[result.cast.fish])}</span>}
                {result.win === 0 && !result.cast.fish && <span className={styles.awayText}>{t.nothing}</span>}
              </div>
            )}

            {shownStep === 'hooked' && casting && (
              <span className={styles.hit} aria-hidden="true">
                {t.steps.hooked}
              </span>
            )}

            {attract && !casting && (
              <div className={styles.attract} aria-hidden="true">
                <span className={styles.attractText}>{t.attract}</span>
              </div>
            )}

            {(lastResumed || line?.resumed) && (
              <span className={styles.resumedBadge} data-testid="fishing-resumed">
                {t.resumed}
              </span>
            )}
          </div>

          <p className={styles.status} data-testid="fishing-status">
            {statusText}
          </p>

          {/* The medals, the bet and the win, on LED counters as a medal machine shows them. The numbers are in type
              beside them, for a screen reader and for anything else that reads the page. */}
          <div className={styles.meters}>
            <div className={`${styles.meter} ${styles.meterMedals}`}>
              <span className={styles.meterLabel}>
                <MedalArt className={styles.meterMedal} />
                {t.medals}
              </span>
              <span className={styles.meterValue} data-testid="fishing-medals" data-loaded={medals.loaded}>
                {medals.loaded ? fmt(shownMedals) : '—'}
              </span>
              <span className={styles.led} data-testid="fishing-medals-led" data-shown={medalMeter.shown ?? ''}>
                <SegmentDisplay value={medalMeter.shown ?? ''} places={MEDAL_PLACES} />
              </span>
            </div>
            <div className={styles.meter}>
              <span className={styles.meterLabel}>{t.bet}</span>
              <span className={styles.meterValue} data-testid="fishing-bet">
                {bet}
              </span>
              <span className={styles.led}>
                <SegmentDisplay value={bet} places={BET_PLACES} tone="amber" />
              </span>
            </div>
            <div className={`${styles.meter} ${last && last.win > 0 && !casting ? styles.meterWin : ''}`}>
              <span className={styles.meterLabel}>{t.win}</span>
              <span className={styles.meterValue} data-testid="fishing-win">
                {last ? last.win : 0}
              </span>
              <span className={styles.led} data-testid="fishing-win-led" data-shown={winMeter.shown ?? 0}>
                <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
              </span>
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.betRow} role="radiogroup" aria-label={t.betGroup}>
              {BET_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={bet === value}
                  aria-label={t.betAria(value)}
                  className={styles.betButton}
                  data-testid={`fishing-bet-${value}`}
                  onClick={() => chooseBet(value)}
                  disabled={casting}
                >
                  {value}
                </button>
              ))}
            </div>
            {casting ? (
              <button type="button" className={`${styles.castButton} ${styles.reelButton}`} data-testid="fishing-reel" onClick={reel}>
                {t.reel}
              </button>
            ) : (
              <button type="button" className={styles.castButton} data-testid="fishing-cast" onClick={doCast} disabled={!canCast}>
                {t.cast}
              </button>
            )}
            <button type="button" className={styles.skipButton} data-testid="fishing-skip" onClick={skip} disabled={!casting}>
              {t.skip}
            </button>
          </div>
          <p className={styles.reelNote}>{t.reelNote}</p>

          <div className={styles.outRow}>
            {refillDue && (
              <button type="button" className={styles.refill} data-testid="fishing-refill" onClick={() => medalBank().refill()}>
                {t.refill(REFILL)}
              </button>
            )}
            {outOfMedals && !refillDue && <MedalsOut games={medals.out} language={language} className={styles.outNote} testId="fishing-out" />}
            {short && !last && (
              <p className={styles.shortLine} data-testid="fishing-short">
                {t.notEnough(bet)}
              </p>
            )}
          </div>

          <div className={styles.secondaryRow}>
            <SoundSwitch control={sound} language={language} className={styles.btn} testId="fishing-sound" />
          </div>
          <KeysHint text={t.keysHint} className={styles.keysHint} testId="fishing-keys" />

          <div className={styles.medalNotes}>
            <p data-testid="fishing-not-money">{t.notMoney}</p>
            <p>
              {t.centerNote}{' '}
              <a className={styles.cabinetLink} href={MEDAL_CENTER_PATH} data-testid="fishing-center-note-link">
                {t.centerNoteLink}
              </a>
            </p>
          </div>

          {/* The member's card is in a machine in another tab: this one waits until it is played here again. */}
          {cardAway && (
            <div className={styles.cardAway} role="status" data-testid="fishing-card-away">
              <p>{t.cardAway}</p>
              <button type="button" className={styles.cardAwayButton} data-testid="fishing-play-here" onClick={() => pier.current?.play()}>
                {t.playHere}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.side}>
        {/* The fish board, as the real machines list their fish: what each gives, at the bet chosen. */}
        <section className={styles.panel} aria-labelledby="fishing-board-title">
          <h2 id="fishing-board-title" className={styles.panelTitle}>
            {t.boardTitle}
          </h2>
          <p className={styles.panelNote}>{t.boardNote}</p>
          <table className={styles.board} data-testid="fishing-board">
            <thead>
              <tr>
                <th scope="col">{t.colFish}</th>
                <th scope="col" className={styles.num}>
                  {t.colPays}
                </th>
                <th scope="col" className={styles.num}>
                  {t.colMedals(bet)}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...FISH].reverse().map((fish) => (
                <tr key={fish.id} data-fish={fish.id} className={last && last.win > 0 && last.cast.fish === fish.id && !casting ? styles.boardHit : undefined}>
                  <th scope="row" className={styles.boardFish}>
                    <FishArt id={fish.id} className={styles.boardArt} />
                    <span>
                      {t.fishNames[fish.id]}
                      <small className={styles.boardShadow}>
                        {t.colShadow}: {t.shadowNames[fish.shadow]}
                      </small>
                    </span>
                  </th>
                  <td className={`${styles.num} ${fish.pays === null ? styles.boardChest : ''}`}>{fish.pays === null ? t.chestPays : `×${fish.pays}`}</td>
                  <td className={styles.num}>{fish.pays === null ? `${fmt(CHEST[0].pays * bet)}–${fmt(CHEST[CHEST.length - 1].pays * bet)}` : fmt(fish.pays * bet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.panel} aria-labelledby="fishing-session-title">
          <h2 id="fishing-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.casts}</dt>
              <dd data-testid="fishing-stat-casts">{fmt(stats.casts)}</dd>
            </div>
            <div>
              <dt>{t.played}</dt>
              <dd>{fmt(stats.played)}</dd>
            </div>
            <div>
              <dt>{t.won}</dt>
              <dd>{fmt(stats.won)}</dd>
            </div>
            <div>
              <dt>{t.net}</dt>
              <dd className={stats.won - stats.played >= 0 ? styles.pos : styles.neg}>
                {stats.won - stats.played > 0 ? '+' : ''}
                {fmt(stats.won - stats.played)}
              </dd>
            </div>
            <div>
              <dt>{t.catches}</dt>
              <dd>
                {fmt(stats.catches)}
                {stats.casts > 0 && <small> ({pct(stats.catches / stats.casts)})</small>}
              </dd>
            </div>
            <div>
              <dt>{t.biggest}</dt>
              <dd>{fmt(stats.biggest)}</dd>
            </div>
            <div>
              <dt>{t.cameBack}</dt>
              <dd>{observed === null ? '—' : pct(observed)}</dd>
            </div>
            <div>
              <dt>{t.machineReturn}</dt>
              <dd>{pct(valueOf(ODDS.rtp), 0)}</dd>
            </div>
          </dl>
          {recent.length > 0 && (
            <>
              <h3 className={styles.recentTitle}>{t.recentTitle}</h3>
              <ol className={styles.recentList} data-testid="fishing-recent">
                {recent.map(({ id, result: r }) => (
                  <li key={id} className={r.win > 0 ? styles.recentWin : undefined}>
                    {r.cast.fish ? <FishArt id={r.cast.fish} className={styles.recentArt} /> : <span className={styles.recentNone} aria-hidden="true" />}
                    <span className={styles.recentName}>{r.cast.fish ? (r.win > 0 ? t.fishNames[r.cast.fish] : `${t.recentAway}: ${t.fishNames[r.cast.fish]}`) : t.recentNothing}</span>
                    <span className={styles.recentWinAmount}>{r.win > 0 ? `+${fmt(r.win)}` : '0'}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="fishing-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default Cabinet;
