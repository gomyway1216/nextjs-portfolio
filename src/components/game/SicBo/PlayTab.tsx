'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { bank as medalBank, useBank } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint, RefillWords } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { lookUp, type Glance } from '../MedalCenter/lookUp';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { Board } from './Board';
import { DieFace } from './Dice';
import { BET_IDS, analyze, betInfo, drawDice, kindOf, labelOf, sortedDice, totalOf, valueOf, winningAreas, type BetId, type Bets, type Dice, type Face } from './engine';
import { SECTIONS, getStrings, type Section } from './i18n';
import { Layout, sectionOf } from './Layout';
import { BET_SIZES, SIC_BO_GAME, SPOT_MAX, lastRoll, onTable, pressAmount, tableKey, type Table, type TableError } from './medalTable';
import { Dome, type Lights, type ShakeRun } from './Dome';
import { FIRST_DICE, planShake, restPoses, type Pose, type ShakeEvent } from './physics';
import { mayPlayTable, playTableHere, seatTable, settleTable, sicBoTable, tableStore } from './sicBoTable';
import styles from './SicBo.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the layout's medals (4,950 at most) and a win (24,255). */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 4;
export const WIN_PLACES = 5;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
/** A roll that brings back this many or more, or a triple bet won, gets the big fanfare. */
export const BIG_WIN = 100;
/** How long the machine stands unplayed before its lights run their attract pattern, in ms. */
export const ATTRACT_AFTER = 12_000;
/** How long the dice are looked at on a phone before the view goes back down to the layout, in ms. */
const RESULT_GLANCE = 1_400;
/** The shortest gap between two dice heard landing, in ms. */
const CLACK_GAP = 45;

const ODDS = analyze();

const MOTION = '(prefers-reduced-motion: reduce)';
const prefersCalm = (): boolean => window.matchMedia?.(MOTION).matches === true;
const subscribeToMotion = (listener: () => void): (() => void) => {
  const query = window.matchMedia?.(MOTION);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
};

/** A seed for the dome's show of a roll, from the browser's crypto: Math.random is the draw's alone. */
const showSeed = (): number => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  } catch {
    return Date.now() >>> 0;
  }
};

/** Where the dice lie when no roll is being shown: where this page's last show left them, or where a seed lays the last roll out. */
interface Rest {
  /** The seed of the roll they lie on, or null for the dice before any roll. */
  seed: number | null;
  poses: Pose[];
}
const FIRST_REST: Rest = { seed: null, poses: restPoses(FIRST_DICE, 1) };
const restOf = (table: Table): Rest => (table.last ? { seed: table.last.seed, poses: restPoses(table.last.dice, table.last.seed) } : FIRST_REST);

export interface PlayTabProps {
  /** Who is playing: whose medals the table plays with. A guest when not given. */
  player?: Player;
  /** Whether the table's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The table: the dome, its counters, the layout and the buttons. What happens
 * to the medals is the table's (medalTable.ts); this draws each roll the moment
 * SHAKE is pressed, settles it, has the dome show it (Dome.tsx), and then
 * lights what it won.
 */
export const PlayTab = ({ player = GUEST, active = true }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  const settled = player.settled;

  const bankState = useBank();
  // The table as it is kept (medalTable.ts): its bets are medals taken from the player's.
  const table = useSyncExternalStore(tableStore.subscribe, tableStore.snapshot, tableStore.serverSnapshot);
  const calm = useSyncExternalStore(subscribeToMotion, prefersCalm, () => false);

  const [size, setSize] = useState<number>(BET_SIZES[0]);
  const [section, setSection] = useState<Section>('bigSmall');
  const [run, setRun] = useState<(ShakeRun & { start: Pose[] }) | null>(null);
  const [phase, setPhase] = useState<'idle' | 'shake' | 'settle' | 'done'>('idle');
  const [skipped, setSkipped] = useState(false);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [attract, setAttract] = useState(false);
  const [touched, setTouched] = useState(0);
  // A roll is settled as SHAKE is pressed, and shown as the dice come to rest: until then the table as it was is shown,
  // and the medals the roll brought back are kept off the counter.
  const [held, setHeld] = useState<{ table: Table; returned: number; label: ReturnType<typeof labelOf> } | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const rollingRef = useRef(false);
  const runs = useRef(0);
  const domeRef = useRef<HTMLDivElement | null>(null);
  const shakeRef = useRef<HTMLButtonElement | null>(null);
  const strings = useRef(t);
  useEffect(() => {
    strings.current = t;
  }, [t]);

  // On a phone the dome is above the layout: SHAKE lifts the view to it, and once the dice have been seen it goes back
  // down to the layout, where what they won is lit (MedalCenter/lookUp.ts).
  const glance = useRef<Glance | null>(null);
  const glanceTimer = useRef<number | null>(null);
  const dropGlance = useCallback(() => {
    if (glanceTimer.current !== null) window.clearTimeout(glanceTimer.current);
    glanceTimer.current = null;
    glance.current?.drop();
    glance.current = null;
  }, []);
  useEffect(() => dropGlance, [dropGlance]);

  // The table's place at the medal center. It asks for the card as it is set up, and plays only while it holds it.
  // Every change to the table is written as it is made (a roll included, settled as it is drawn), so nothing is left
  // to write when the card goes; when it comes back, the table is read again, as another tab may have played it.
  useEffect(() => {
    const purse = medalBank();
    const machine = sicBoTable();
    const mine = purse.sit(SIC_BO_GAME, {
      granted: () => machine.sync(),
      yielding: () => undefined,
    });
    seatTable(mine);
    const unlisten = purse.listen((event) => {
      if (event.type === 'reset') {
        if (mayPlayTable()) machine.sync();
        else machine.resetSeen();
        // A roll still being shown belonged to the table before: the cleared table is shown at once.
        setHeld(null);
        setMessage('');
        setAnnouncement(strings.current.sayRestart);
      } else if (event.type === 'refill') {
        setAnnouncement(strings.current.sayRefill(event.medals));
      }
    });
    // While another tab plays the table, this one shows it as that tab writes it.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== tableKey(machine.owner())) return;
      if (!mayPlayTable()) machine.sync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unlisten();
      window.removeEventListener('storage', onStorage);
      seatTable(null);
      mine.leave();
    };
  }, []);

  // Whose medals are on the table, and whether they have been read: the table shown is that player's.
  useEffect(() => {
    settleTable(settled);
    sicBoTable().sync();
  }, [settled, bankState.loaded, bankState.owner, bankState.where]);

  // While the medals are in another tab's machine, the table says so, a moment after.
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = bankState.loaded && (bankState.card === 'away' || (bankState.card === 'asking' && longWait));

  const rolling = run !== null;
  const shown = held?.table ?? table;
  const canPlay = bankState.loaded && settled && bankState.where !== 'checking' && bankState.card === 'here' && !rolling;
  const medals = Math.max(0, bankState.balance - (held?.returned ?? 0));
  const staked = onTable(shown);
  const last = useMemo(() => lastRoll(table), [table]);
  const lastDice: Dice | null = table.last?.dice ?? null;
  const lit = useMemo<ReadonlySet<BetId>>(() => (lastDice && !held ? new Set(winningAreas(lastDice)) : new Set()), [lastDice, held]);
  const ghost: Bets | null = !held && staked === 0 && table.last ? table.last.bets : null;

  // The dice at rest: where this page's own last show left them, while that roll is the table's last; otherwise where
  // the last roll's seed lays them (a reload, or another tab's roll).
  const restShown = useMemo<Rest>(() => (rest && rest.seed === (table.last?.seed ?? null) ? rest : restOf(table)), [rest, table]);
  // While a roll is shown, the dice it started from: the dome's frames move them from there.
  const restPosesShown = run ? run.start : restShown.poses;

  // The floor's sound (MedalCenter/machineSounds.ts), off on every visit and on with its switch: medals set down on
  // the layout, the dice rattling in the dome and landing, and a win counted in medal by medal with its fanfare.
  const sound = useMachineSound();
  const { play, tick } = sound;
  const meter = useCountUp(bankState.loaded ? medals : null, tick);
  const { pay: payMedals } = meter;
  const winShown = !held && last ? last.returned : 0;
  const winMeter = useCountUp(winShown);
  const { pay: payWin } = winMeter;

  const lastClack = useRef(-Infinity);
  const onEvent = useCallback(
    (event: ShakeEvent) => {
      if (event.kind !== 'land' || event.strength < 3) return;
      const now = performance.now();
      if (now - lastClack.current < CLACK_GAP) return;
      lastClack.current = now;
      play('dice');
    },
    [play],
  );

  const errorText = (error: TableError): string =>
    error === 'spotLimit' ? t.spotFull(SPOT_MAX) : error === 'noMedals' ? t.notEnough : error === 'notKept' ? t.notKept : '';

  const press = (id: BetId) => {
    if (rollingRef.current) return;
    setAttract(false);
    const machine = sicBoTable();
    machine.sync();
    const onIt = machine.table().bets[id] ?? 0;
    const amount = pressAmount(size, onIt, medalBank().balance());
    if (amount <= 0) {
      setMessage(onIt >= SPOT_MAX ? t.spotFull(SPOT_MAX) : onTable(machine.table()) > 0 ? t.noneLeft : t.notEnough);
      return;
    }
    const done = machine.place(id, amount);
    if (!done.ok) {
      setMessage(errorText(done.error));
      return;
    }
    play('chip');
    setMessage('');
  };

  const undo = () => {
    if (rollingRef.current) return;
    const done = sicBoTable().undo();
    setMessage(done.ok || done.error === 'nothing' ? '' : errorText(done.error));
  };
  const clear = () => {
    if (rollingRef.current) return;
    const done = sicBoTable().clear();
    setMessage(done.ok || done.error === 'nothing' ? '' : errorText(done.error));
  };
  const repeat = () => {
    if (rollingRef.current) return;
    const done = sicBoTable().repeat();
    if (done.ok) {
      play('chip');
      setMessage('');
    } else setMessage(done.error === 'noMedals' ? t.rebetShort : done.error === 'nothing' ? '' : errorText(done.error));
  };

  /** SHAKE: the dice are drawn here, in the press, the roll is settled, and the dome is set going to show it. */
  const shake = () => {
    if (rollingRef.current) return;
    setAttract(false);
    const machine = sicBoTable();
    machine.sync();
    if (onTable(machine.table()) === 0) return;
    const dice = drawDice(Math.random);
    const seed = showSeed();
    const done = machine.roll(dice, seed);
    if (!done.ok) {
      setMessage(errorText(done.error));
      return;
    }
    const { resolution, before } = done.value;
    const start = restShown.poses;
    const plan = planShake(start, dice, seed);
    rollingRef.current = true;
    runs.current += 1;
    setHeld({ table: before, returned: resolution.returned, label: labelOf(resolution) });
    setSkipped(false);
    setPhase('shake');
    setMessage('');
    setRun({ id: runs.current, plan, mode: calm ? 'calm' : 'animate', start });
    setRest({ seed, poses: plan.end });
    play('lever');
    if (!calm) play('shaker', 0.05);
    setAnnouncement(t.sayShake(resolution.decided));
    dropGlance();
    glance.current = lookUp(domeRef.current, shakeRef.current);
  };

  const skip = () => {
    if (rollingRef.current) setSkipped(true);
  };

  const onSettle = useCallback((id: number) => {
    if (id === runs.current) setPhase('settle');
  }, []);

  // The dice are at rest: the roll is shown, what it won counted in.
  const onDone = useCallback(
    (id: number) => {
      if (id !== runs.current || !rollingRef.current) return;
      rollingRef.current = false;
      const landed = held;
      if (landed && landed.returned > 0) {
        payMedals();
        payWin();
        play(landed.returned >= BIG_WIN || landed.label === 'sicbo-triple' ? 'big' : 'win', 0.05);
      }
      setHeld(null);
      setRun(null);
      setPhase('done');
      const settledTable = sicBoTable().table();
      const result = lastRoll(settledTable);
      if (result) {
        const dice = sortedDice(result.dice);
        const words = strings.current;
        setAnnouncement(result.returned > 0 ? words.resultWin(dice, totalOf(dice), kindOf(dice), result.returned) : words.resultLose(dice, totalOf(dice), kindOf(dice)));
      }
      if (glance.current) {
        const seen = glance.current;
        glanceTimer.current = window.setTimeout(() => {
          glanceTimer.current = null;
          if (glance.current === seen) glance.current = null;
          seen.back();
        }, RESULT_GLANCE);
      }
    },
    [held, payMedals, payWin, play],
  );

  // The attract lights: a table left standing unplayed runs them, as cabinets on a real floor do, until the next press.
  useEffect(() => {
    if (rolling || !active) return;
    const timer = window.setTimeout(() => setAttract(true), ATTRACT_AFTER);
    return () => window.clearTimeout(timer);
  }, [rolling, active, staked, touched, table]);

  // On a desktop, as on a machine's panel: Space or Enter shakes (or skips a roll being shown), S skips, R puts the last
  // roll's bets back, U takes the last medals off and C clears the layout. Each does what its button does.
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') {
      if (rollingRef.current) skip();
      else if (canPlay && staked > 0) shake();
    } else if (key === 's') skip();
    else if (key === 'r') {
      if (canPlay) repeat();
    } else if (key === 'u') {
      if (canPlay) undo();
    } else if (key === 'c') {
      if (canPlay) clear();
    } else return false;
    return true;
  });

  const outOfMedals = bankState.loaded && medals === 0 && staked === 0 && bankState.card === 'here' && !rolling;
  const refillDue = outOfMedals && bankState.out.length === 0;
  const sortedLast = lastDice ? sortedDice(lastDice) : null;
  const lights: Lights = rolling ? (phase === 'settle' ? 'settle' : 'shake') : sortedLast ? kindOf(sortedLast) : attract ? 'attract' : 'idle';
  const banner = !rolling && sortedLast ? t.banner(sortedLast, totalOf(sortedLast), kindOf(sortedLast)) : null;
  const statusText = (() => {
    if (rolling) return phase === 'settle' ? t.status.settle : t.status.shake;
    if (staked > 0) return t.status.ready(staked);
    if (last && sortedLast) return last.returned > 0 ? t.resultWin(sortedLast, totalOf(sortedLast), kindOf(sortedLast), last.returned) : t.resultLose(sortedLast, totalOf(sortedLast), kindOf(sortedLast));
    if (outOfMedals) return t.outOfMedals;
    return t.status.idle;
  })();
  const domeLabel = t.domeLabel(rolling ? t.domeShaking : t.domeIdle(sortedLast ?? FIRST_DICE));
  const lastTotal = BET_IDS.reduce((sum, id) => sum + (table.lastRound[id] ?? 0), 0);
  const net = shown.stats.won - shown.stats.played;
  const sectionMedals = (part: Section) => BET_IDS.filter((id) => sectionOf(id) === part).reduce((sum, id) => sum + (shown.bets[id] ?? 0), 0);
  const sectionWon = (part: Section) => !rolling && last !== null && last.results.some((r) => r.back > 0 && sectionOf(r.id) === part);

  return (
    <div
      className={styles.machine}
      data-testid="sb-machine"
      data-phase={phase}
      data-playable={canPlay ? 'true' : 'false'}
      data-card={bankState.card}
      data-dice={lastDice && !held ? lastDice.join(',') : ''}
      data-won={!held && last ? last.returned : ''}
      onPointerDown={() => {
        setAttract(false);
        setTouched((n) => n + 1);
      }}
    >
      <div className={styles.cabinet}>
        <div className={styles.marquee} aria-hidden="true" data-chase={rolling || attract ? 'true' : 'false'}>
          <span className={styles.marqueeMoon} />
          <span className={styles.marqueeText}>
            <span className={styles.marqueeSub} lang="ja">
              {t.signSub}
            </span>
            <span className={styles.marqueeMain}>{t.sign}</span>
          </span>
          <span className={styles.marqueeMoon} />
        </div>

        <Dome
          run={run}
          rest={restPosesShown}
          skipped={skipped}
          lights={lights}
          label={domeLabel}
          banner={banner}
          onSettle={onSettle}
          onEvent={onEvent}
          onDone={onDone}
          domeRef={domeRef}
        />

        <p className={styles.status} data-testid="sb-status">
          {statusText}
        </p>

        {/* The medals, the layout's medals and the last win, on LED counters by the dome, as a medal machine shows them.
            The numbers are in type beside them, for a screen reader and for anything else that reads the page. */}
        <div className={styles.meters} data-testid="sb-counter">
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="sb-medals" data-loaded={bankState.loaded}>
              {bankState.loaded ? fmt(medals) : '—'}
            </span>
            <span className={styles.led} data-testid="sb-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <span className={styles.meterValue} data-testid="sb-bet">
              {staked}
            </span>
            <span className={styles.led}>
              <SegmentDisplay value={staked} places={BET_PLACES} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meterCell} ${!rolling && winShown > 0 ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="sb-win">
              {winShown}
            </span>
            <span className={styles.led} data-testid="sb-win-led" data-shown={winMeter.shown ?? 0}>
              <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        {/* The layout. On a phone, one part of it at a time, chosen here. */}
        <section className={styles.layoutBox} aria-labelledby="sb-layout-title">
          <h2 id="sb-layout-title" className={styles.layoutTitle}>
            {t.layoutTitle}
          </h2>
          <div className={styles.picker} role="radiogroup" aria-label={t.sectionGroup}>
            {SECTIONS.map((part) => {
              const on = sectionMedals(part);
              return (
                <button
                  key={part}
                  type="button"
                  role="radio"
                  aria-checked={section === part}
                  aria-label={t.sectionName[part]}
                  className={styles.pick}
                  data-testid={`sb-section-${part}`}
                  data-won={sectionWon(part) ? 'true' : 'false'}
                  onClick={() => {
                    setSection(part);
                    play('button');
                  }}
                >
                  <PickGlyph part={part} />
                  <span className={styles.pickMedals} aria-hidden="true">
                    {on > 0 ? on : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <p className={styles.sectionNote} data-testid="sb-section-note">
            {t.sectionNote[section]}
          </p>
          <Layout bets={shown.bets} ghost={ghost} lit={lit} section={section} canPlay={canPlay} onPress={press} t={t} />
        </section>

        <div className={styles.controls}>
          <div className={styles.steps} role="radiogroup" aria-label={t.stepGroup}>
            <span className={styles.stepsLabel} aria-hidden="true">
              {t.stepGroup}
            </span>
            {BET_SIZES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={size === value}
                aria-label={t.stepAria(value)}
                className={styles.stepButton}
                data-testid={`sb-step-${value}`}
                disabled={rolling}
                onClick={() => {
                  setSize(value);
                  play('button');
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <div className={styles.boardButtons}>
            <button type="button" className={styles.btn} data-testid="sb-undo" onClick={undo} disabled={!canPlay || shown.placed.length === 0}>
              {t.undo}
            </button>
            <button type="button" className={styles.btn} data-testid="sb-clear" onClick={clear} disabled={!canPlay || staked === 0}>
              {t.clear}
            </button>
            <button type="button" className={styles.btn} data-testid="sb-rebet" onClick={repeat} disabled={!canPlay || lastTotal === 0}>
              {t.rebet}
            </button>
          </div>
          <div className={styles.mainButtons}>
            <button type="button" ref={shakeRef} className={styles.shakeButton} data-testid="sb-shake" onClick={shake} disabled={!canPlay || staked === 0}>
              {t.shake}
            </button>
            <button type="button" className={styles.skipButton} data-testid="sb-skip" onClick={skip} disabled={!rolling || skipped}>
              {t.skip}
            </button>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="sb-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="sb-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="sb-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="sb-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="sb-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="sb-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="sb-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's machine: the table waits, with its bets on it, until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="sb-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="sb-play-here" onClick={playTableHere}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <Board history={shown.history} t={t} />

        <section className={styles.panel} aria-labelledby="sb-stats-title">
          <h2 id="sb-stats-title" className={styles.panelTitle}>
            {t.statsTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.rolls}</dt>
              <dd data-testid="sb-stat-rolls">{fmt(shown.stats.rolls)}</dd>
            </div>
            <div>
              <dt>{t.triples}</dt>
              <dd>{fmt(shown.stats.triples)}</dd>
            </div>
            <div>
              <dt>{t.played}</dt>
              <dd>{fmt(shown.stats.played)}</dd>
            </div>
            <div>
              <dt>{t.won}</dt>
              <dd>{fmt(shown.stats.won)}</dd>
            </div>
            <div>
              <dt>{t.net}</dt>
              <dd className={net >= 0 ? styles.pos : styles.neg}>
                {net > 0 ? '+' : net < 0 ? '−' : '±'}
                {fmt(Math.abs(net))}
              </dd>
            </div>
            <div>
              <dt>{t.biggest}</dt>
              <dd>{fmt(shown.stats.biggest)}</dd>
            </div>
            <div>
              <dt>{t.cameBack}</dt>
              <dd>{shown.stats.played > 0 ? pct(shown.stats.won / shown.stats.played) : '—'}</dd>
            </div>
            <div>
              <dt>{t.bestReturn}</dt>
              <dd>{pct(valueOf(ODDS.best))}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="sb-last-title">
          <h2 id="sb-last-title" className={styles.panelTitle}>
            {t.lastTitle}
          </h2>
          {last && !held ? (
            <ul className={styles.resultList} data-testid="sb-results">
              {last.results.map((r) => (
                <li key={r.id} data-won={r.back > 0 ? 'true' : 'false'}>
                  <span>{t.areaName(betInfo(r.id))}</span>
                  <span className={styles.resultAmount}>{r.back > 0 ? t.lastWon(r.back) : `−${fmt(r.stake)} ${t.lastLost}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>{t.lastNone}</p>
          )}
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="sb-announcement">
        {announcement}
      </p>
    </div>
  );
};

/** The picker's sign for each part of the cloth: what it holds, drawn small. */
function PickGlyph({ part }: { part: Section }) {
  if (part === 'bigSmall')
    return (
      <span className={styles.pickGlyph} aria-hidden="true" lang="ja">
        小大
      </span>
    );
  if (part === 'totals')
    return (
      <span className={styles.pickGlyph} aria-hidden="true">
        4–17
      </span>
    );
  const faces: readonly Face[] = part === 'triples' ? [3, 3, 3] : part === 'pairs' ? [2, 5] : [4];
  return (
    <span className={styles.pickDice} aria-hidden="true">
      {faces.map((face, i) => (
        <DieFace key={i} face={face} className={styles.pickDie} />
      ))}
    </span>
  );
}

export default PlayTab;
