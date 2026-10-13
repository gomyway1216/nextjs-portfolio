'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { AIM, ARM_REACH, FEED, aimArm, armFor, armStart, type Arm } from './engine';
import { getStrings } from './i18n';
import { CHAIN_GOAL, CHEST_TOWERS_FROM, JACKPOT_START, TIER_BONUS } from './lottery';
import { ageStage, celebrate, createStage, lightGate, trackMedals, type Stage } from './render';
import { createRenderer } from './renderer';
import { IDLE_DIGITS, Screen, ballTransform, markStrip, stripOffset } from './ScreenPanel';
import {
  ballSpot,
  landTimes,
  reelPositions,
  reelsFast,
  reelsWaiting,
  sameScreen,
  screenState,
  stopTimes,
  stoppedDigits,
  type ScreenState,
} from './screen';
import { START_CREDITS, advance, createSession, insert, pickChest, refill, type Session, type SessionEvent } from './session';
import { hush, playSound, setMusic, unlockAudio } from './sounds';
import { GUEST, type AccountStore, type Player, type Status, type Sync } from './account';
import { keepMachine } from './savedMachine';
import { restore } from './storage';
import { HEIGHT, VIEW, screenPlacement, unproject, unprojectPanel } from './view';
import styles from './MedalPusher.module.css';

/** Medals a second when Auto is on, between the two rails: it feeds them by turns. */
export const AUTO_PACE = 2;
/** How long a press has to last before it becomes a stream of medals, in seconds. The press itself feeds one. */
export const HOLD_DELAY = 0.2;
/**
 * The keys that feed the two rails, by where they are on the keyboard: the home key of each hand's first finger,
 * so that both can be held at once. `KEY_CAPS` is what is written on them.
 */
export const FEED_KEYS: Readonly<Record<string, Arm | undefined>> = { KeyF: 0, KeyJ: 1 };
export const KEY_CAPS = ['F', 'J'] as const;
/** The keys that move a rail's aim, beside its feed key: which rail, and which way across the field. */
export const AIM_KEYS: Readonly<Record<string, { arm: Arm; by: -1 | 1 } | undefined>> = {
  KeyS: { arm: 0, by: -1 },
  KeyD: { arm: 0, by: 1 },
  KeyK: { arm: 1, by: -1 },
  KeyL: { arm: 1, by: 1 },
};
export const AIM_CAPS = [
  ['S', 'D'],
  ['K', 'L'],
] as const;
/** How far one press of an aim key moves a rail's tip, in field units, and how fast holding it does, in units a second. */
export const AIM_KEY = { tap: 1, speed: 40 } as const;

/** Where across the field a spot is, as the whole number of percent the aim sliders work in. */
export const aimPercent = (x: number): number => Math.round(((x - AIM.min) / (AIM.max - AIM.min)) * 100);
/** The spot across the field that a slider's value stands for. */
export const percentAim = (percent: number): number => AIM.min + (percent / 100) * (AIM.max - AIM.min);
/** The ends of each rail's slider, in the same percent: as far as that rail's arm reaches. */
export const AIM_RANGE = [
  { min: aimPercent(ARM_REACH[0].min), max: aimPercent(ARM_REACH[0].max) },
  { min: aimPercent(ARM_REACH[1].min), max: aimPercent(ARM_REACH[1].max) },
] as const;

/** The kinds of input a letter does nothing in, so a key pressed with the focus there is still the machine's. */
const NOT_TYPED_IN = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'color', 'file'];
/**
 * Whether a key was pressed in something the player types or chooses in: a text field, a text area, a list to pick
 * from, or anything that can be edited. Such a key is the field's, and the machine leaves it alone.
 */
export function typingIn(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const { tagName, type, isContentEditable } = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  if (isContentEditable === true) return true;
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return tagName === 'INPUT' && !(typeof type === 'string' && NOT_TYPED_IN.includes(type));
}

/**
 * Who is holding a rail's feed down: any number of fingers on its button, each a pointer of its own, and its key.
 * The rail streams for as long as anyone is, counted from the first of them.
 */
interface Hold {
  by: Set<string>;
  since: number;
}
const KEY = 'key';
const pointerName = (id: number): string => `pointer ${id}`;
/** The canvas never draws more than this many pixels per CSS pixel. */
const MAX_PIXEL_RATIO = 2;
/** The longest stretch of time one frame may cover, so a stalled tab does not lurch forward. */
const MAX_FRAME = 0.1;
/** How often the machine is saved while it is showing, in seconds. */
const SAVE_EVERY = 5;
/** How long a first press of Reset waits for the second, in seconds. */
export const RESET_WINDOW = 6;

/**
 * Whether a press of Reset at `now` is the second press, in time, of one made
 * at `armedAt` (both in milliseconds; null when no first press stands). The
 * label going back is only a timer, and timers run late, so this is what
 * decides it. A clock that has gone backwards confirms nothing.
 */
export const confirmsReset = (armedAt: number | null, now: number): boolean => armedAt !== null && now >= armedAt && now - armedAt < RESET_WINDOW * 1000;

/** The numbers shown around the cabinet. */
interface Hud {
  credits: number;
  jackpot: number;
  stock: number;
  played: number;
  won: number;
  lost: number;
  spins: number;
  paid: number;
}

const hudOf = (session: Session): Hud => ({
  credits: session.credits,
  jackpot: session.jackpot,
  stock: session.stock,
  played: session.inserted,
  won: session.won,
  lost: session.lost,
  spins: session.spins,
  paid: session.paidOut,
});

const INITIAL_HUD: Hud = { credits: START_CREDITS, jackpot: JACKPOT_START, stock: 0, played: 0, won: 0, lost: 0, spins: 0, paid: 0 };
const IDLE_SCREEN: ScreenState = {
  mode: 'slot',
  banner: 'none',
  amount: 0,
  line: null,
  lit: -1,
  square: 0,
  die: 0,
  rolling: false,
  chests: null,
  secondsLeft: 0,
  level: 0,
  total: 0,
  hole: -1,
};

const sameHud = (a: Hud, b: Hud): boolean =>
  a.credits === b.credits &&
  a.jackpot === b.jackpot &&
  a.stock === b.stock &&
  a.played === b.played &&
  a.won === b.won &&
  a.lost === b.lost &&
  a.spins === b.spins &&
  a.paid === b.paid;

/** A medal going in is heard at the slot. It is heard again, rolling, when it comes out onto its rail: the frame loop listens for that. */
const feedSound = (on: boolean): void => playSound('insert', on);

/**
 * How the page's screen is stood in the back wall of the cabinet, behind the
 * canvases: the scene's own camera, as the numbers a browser takes. They are
 * in pixels of the drawing. One of those is `--mp-u` on the page, which is
 * the width the stage has, shared out over the drawing's, so the screen and
 * the scene in front of it are seen from the same place at any size.
 */
const WALL = screenPlacement();
const drawn = (pixels: number): string => `calc(${pixels.toFixed(3)} * var(--mp-u))`;
const STAGE_UNIT = { '--mp-u': `calc(100cqw / ${VIEW.width})` } as CSSProperties;
const WALL_SPACE: CSSProperties = { perspective: drawn(WALL.perspective), perspectiveOrigin: `${drawn(WALL.origin.x)} ${drawn(WALL.origin.y)}` };
const WALL_SHEET: CSSProperties = {
  width: drawn(WALL.width),
  height: drawn(WALL.height),
  transform: `translate3d(${drawn(WALL.x)}, ${drawn(WALL.y)}, ${drawn(WALL.z)}) rotateX(${WALL.tilt.toFixed(5)}rad) scale(${WALL.scale})`,
};
const STAGE_SHAPE: CSSProperties = { aspectRatio: `${VIEW.width} / ${VIEW.height}` };

export interface PlayTabProps {
  active?: boolean;
  /** Who is playing, as far as the site knows. Left out, everyone is a guest and the machine lives on this device alone. */
  player?: Player;
  /** The account's store for the machine. It is read when the cabinet is first set up, and not again. */
  store?: AccountStore | null;
  /** Where a guest goes to sign in. With it, the note that the machine is saved on this device invites them to. */
  signInHref?: string;
}

export const PlayTab = ({ active = true, player = GUEST, store = null, signInHref }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const aimId = useId();

  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [screen, setScreen] = useState<ScreenState>(IDLE_SCREEN);
  // Where each rail is pointed, the left one's first, as the machine has it: this is only what the sliders show.
  const [aims, setAims] = useState<[number, number]>([armStart(0), armStart(1)]);
  // Whether each rail's feed is being held down, by a finger or a key: its button shows it.
  const [held, setHeld] = useState<[boolean, boolean]>([false, false]);
  const [auto, setAuto] = useState(false);
  const [sound, setSound] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Reset takes two presses: the first arms it, and the time it was made is kept. Each reset switches the machine off and on again.
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const armed = armedAt !== null;
  const [switchedOn, setSwitchedOn] = useState(0);
  // Where the machine is kept, and whether the last write to this device took. Until the keeper has said, the page says what the server said.
  const [status, setStatus] = useState<Status>({ where: 'device', kept: true });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The canvas under the field, for the 3D scene.
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  // The sheet the screen is laid out on, which stands in the back wall behind both canvases.
  const wallRef = useRef<HTMLDivElement | null>(null);
  // The chest a press on the stage began on, and the one the pointer is over.
  const pressedChest = useRef<HTMLButtonElement | null>(null);
  const hoveredChest = useRef<HTMLButtonElement | null>(null);
  const strips = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const ball = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  // The keeper of the machine: it writes it to this device and, for a player who is signed in, keeps the account's copy
  // in step. When another machine has to go on the table — the account's, or another player's — it asks for the cabinet
  // to be switched off and on again, the way a reset does, and gives the machine to open with.
  const keeper = useRef<Sync | null>(null);
  // What the frame loop reads; it runs outside React, so it takes these from refs.
  const live = useRef({ auto, sound, active, strings: t });
  // Who is holding each rail's feed down. The two rails are held apart, so two fingers, or two keys, feed both at once.
  const holds = useRef<[Hold, Hold]>([
    { by: new Set(), since: 0 },
    { by: new Set(), since: 0 },
  ]);
  // The aim keys that are down, and the rail each pointer on the field is aiming.
  const aimKeys = useRef(new Set<string>());
  const aimers = useRef(new Map<number, Arm>());

  useEffect(() => {
    live.current = { auto, sound, active, strings: t };
  });

  /** Shows on the buttons which rails are held, when that has changed. */
  const showHeld = () => {
    const now: [boolean, boolean] = [holds.current[0].by.size > 0, holds.current[1].by.size > 0];
    setHeld((was) => (was[0] === now[0] && was[1] === now[1] ? was : now));
  };
  /** Feeds one medal into a rail, if the purse has one and that rail's slot is free. Neither rail's aim moves. */
  const feedOnce = (arm: Arm) => {
    const session = sessionRef.current;
    if (session && insert(session, arm)) feedSound(live.current.sound);
  };
  /** A finger or a key goes down on a rail's feed. The first one feeds a medal at once; held, the rail streams. */
  const pressRail = (arm: Arm, by: string) => {
    const hold = holds.current[arm];
    if (hold.by.has(by)) return;
    if (hold.by.size === 0) {
      hold.since = performance.now() / 1000;
      feedOnce(arm);
    }
    hold.by.add(by);
    showHeld();
  };
  const releaseRail = (arm: Arm, by: string) => {
    if (holds.current[arm].by.delete(by)) showHeld();
  };
  /** Points one rail at a spot across the field, as near as it can point, and shows where that is. */
  const aimRail = (arm: Arm, x: number) => {
    const session = sessionRef.current;
    if (!session) return;
    aimArm(session.machine, arm, x);
    setAims([session.machine.aims[0], session.machine.aims[1]]);
  };
  // The keys are listened for on the window, outside React: they reach the cabinet through this.
  const controls = useRef({ pressRail, releaseRail, aimRail });
  useEffect(() => {
    controls.current = { pressRail, releaseRail, aimRail };
  });

  // F and J feed the left and the right rail, and S, D and K, L move their aims, while this tab is the one showing.
  // A key held down is one press, however often the keyboard repeats it; it ends when the key comes up, and when
  // the window loses the keyboard, which is when a key can come up unheard. A key pressed with a modifier, or in
  // something the player types in, is not the machine's and is left alone.
  useEffect(() => {
    if (!active) return;
    const letGo = () => {
      controls.current.releaseRail(0, KEY);
      controls.current.releaseRail(1, KEY);
      aimKeys.current.clear();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const rail = FEED_KEYS[event.code];
      const turn = AIM_KEYS[event.code];
      if (rail === undefined && turn === undefined) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || typingIn(event.target)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (rail !== undefined) controls.current.pressRail(rail, KEY);
      if (turn !== undefined) {
        aimKeys.current.add(event.code);
        const session = sessionRef.current;
        if (session) controls.current.aimRail(turn.arm, session.machine.aims[turn.arm] + turn.by * AIM_KEY.tap);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const rail = FEED_KEYS[event.code];
      if (rail !== undefined) controls.current.releaseRail(rail, KEY);
      aimKeys.current.delete(event.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', letGo);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', letGo);
      letGo();
    };
  }, [active]);

  // The background loop plays while the sound is on and this tab is showing. Switching the sound off, or
  // leaving the cabinet, cuts short whatever is still ringing. So does a reset: the old machine's reels,
  // fanfare and loop stop with it, and the loop starts again from the top for the new one.
  useEffect(() => {
    setMusic(sound && active);
    return () => setMusic(false);
  }, [sound, active, switchedOn]);
  useEffect(() => (sound && active ? hush : undefined), [sound, active, switchedOn]);

  // The keeper is set up once, before anything asks it for a machine.
  useEffect(() => {
    keeper.current ??= keepMachine({
      store,
      slots: () => window.localStorage,
      session: () => sessionRef.current,
      reopen: () => {
        setHud(INITIAL_HUD);
        setScreen(IDLE_SCREEN);
        setSwitchedOn((times) => times + 1);
      },
      onStatus: setStatus,
    });
  }, [store]);

  // Who is playing. Signing in or out while the game is open changes whose machine is on the table.
  useEffect(() => {
    keeper.current?.player({ uid: player.uid, settled: player.settled, expected: player.expected });
  }, [player.uid, player.settled, player.expected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // In 3D where the browser can, and on the canvas alone where it cannot; `?renderer=2d` asks for the second.
    const keeping = keeper.current;
    const renderer = canvas && keeping && createRenderer(canvas, sceneRef.current, window.location.search);
    if (!canvas || !keeping || !renderer) return;
    const seed = Math.floor(Math.random() * 2 ** 31);
    // The machine to open with: the account's for a player who is signed in, and otherwise the one this browser
    // remembers, if it holds one that still reads. After a reset there is none, and the old one is thrown away.
    const remembered = keeping.open();
    const session = (remembered === null ? null : restore(remembered, seed)) ?? createSession(seed);
    sessionRef.current = session;
    // A machine that is remembered has its arms pointed where they were left, and a new one where a new machine's are.
    setAims([session.machine.aims[0], session.machine.aims[1]]);
    // Nothing is held over from the machine before.
    for (const hold of holds.current) hold.by.clear();
    aimKeys.current.clear();
    aimers.current.clear();
    setHeld([false, false]);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Saved on this device as soon as it stands here, every few seconds while it is showing, when the page is
    // hidden or left, and when the cabinet is taken down. A write that fails means the machine is not remembered;
    // the game goes on, and the note under the tally stops saying that it is. The keeper sends it on to the
    // account, for a player who has one, far less often: see SEND_EVERY in account.ts.
    const saveWhileShowing = () => {
      if (live.current.active && document.visibilityState === 'visible') keeping.save('tick');
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') keeping.save('hidden');
    };
    const saveOnLeaving = () => {
      keeping.save('left');
    };
    const saveTimer = window.setInterval(saveWhileShowing, SAVE_EVERY * 1000);
    document.addEventListener('visibilitychange', saveWhenHidden);
    window.addEventListener('pagehide', saveOnLeaving);
    // The first save also finds out whether this browser will keep the machine at all.
    keeping.save('tick');

    let stage: Stage | null = null;
    const fit = () => {
      // While its tab is hidden the canvas has no size; it is fitted again when it comes back.
      if (canvas.clientWidth === 0) return;
      const ratio = Math.max(0.5, Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1) * (canvas.clientWidth / VIEW.width));
      const width = Math.round(VIEW.width * ratio);
      if (stage && canvas.width === width) return;
      canvas.width = width;
      canvas.height = Math.round(VIEW.height * ratio);
      const previous = stage;
      stage = createStage(ratio, renderer.kind === '2d');
      // A resize keeps what the stage has seen, so no medal is taken for one that just left.
      if (previous) {
        stage.seen = previous.seen;
        stage.fed = previous.fed;
        stage.exits = previous.exits;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    let shownHud = INITIAL_HUD;
    let shownScreen = IDLE_SCREEN;
    let digits = IDLE_DIGITS;
    let shownAims: [number, number] = [session.machine.aims[0], session.machine.aims[1]];
    let autoClock = 0;
    let autoArm: Arm = 0;
    let lastSpinClock = 0;
    let last = performance.now();
    const events: SessionEvent[] = [];
    let frameId = 0;

    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      // A frame's timestamp can be a touch earlier than the clock read when the loop was set up.
      const elapsed = Math.max(0, Math.min(MAX_FRAME, (now - last) / 1000));
      last = now;
      const { auto: autoNow, sound: soundOn, active: activeNow, strings } = live.current;
      if (!activeNow || !stage) return;

      // The player's medals. A rail whose feed is held down streams them, as fast as its own slot takes them, and
      // the other rail does the same on its own: both at once is twice the medals. Auto feeds two a second, the
      // two rails by turns. A press that outlasts the medals ends there, so a refill does not start pouring them again.
      if (session.credits === 0 && holds.current.some((hold) => hold.by.size > 0)) {
        for (const hold of holds.current) hold.by.clear();
        setHeld([false, false]);
      }
      for (const arm of [0, 1] as const) {
        const hold = holds.current[arm];
        if (hold.by.size > 0 && now / 1000 - hold.since >= HOLD_DELAY && insert(session, arm)) feedSound(soundOn);
      }
      if (autoNow) {
        autoClock += elapsed;
        if (autoClock >= 1 / AUTO_PACE) {
          autoClock = 0;
          if (insert(session, autoArm)) feedSound(soundOn);
          autoArm = autoArm === 0 ? 1 : 0;
        }
      }

      // An aim key that is held down moves its rail's aim. Each arm swings after its own aim, and a medal on a
      // rail drops where its arm's tip is when it gets there.
      for (const code of aimKeys.current) {
        const turn = AIM_KEYS[code];
        if (turn) aimArm(session.machine, turn.arm, session.machine.aims[turn.arm] + turn.by * AIM_KEY.speed * elapsed);
      }
      const [leftAim, rightAim] = session.machine.aims;
      if (leftAim !== shownAims[0] || rightAim !== shownAims[1]) {
        shownAims = [leftAim, rightAim];
        setAims(shownAims);
      }
      events.length = 0;
      advance(session, elapsed, events);
      // A medal that has come out of its slot onto the rail in this frame starts to roll along it.
      for (const medal of session.machine.rolling) if (medal.remaining <= FEED.arm && medal.remaining + elapsed > FEED.arm) playSound('roll', soundOn);

      let landed = false;
      let won = 0;
      let lost = false;
      for (const event of events) {
        switch (event.type) {
          case 'landed':
            landed = true;
            break;
          case 'won':
            won += event.count;
            break;
          case 'lost':
            lost = true;
            break;
          case 'checker':
            lightGate(stage, event.gate);
            playSound(event.held ? 'gate' : 'full', soundOn);
            break;
          case 'toppled':
            celebrate(stage, 'crash');
            playSound('crash', soundOn);
            setAnnouncement(strings.sayToppled);
            break;
          case 'ball':
            playSound('ball', soundOn);
            setAnnouncement(strings.sayBall);
            break;
          case 'spinStart':
            lastSpinClock = 0;
            // Each reel whirrs until it is heard to stop: an outer one as it lands on its digit, the centre when the spin ends.
            if (session.spin && !calm.matches) {
              const lands = landTimes(session.spin);
              playSound('spin', soundOn, { stops: [lands[0], session.spin.duration, lands[2]] });
            }
            break;
          case 'spinEnd': {
            digits = event.result.digits;
            const { tier } = event.result;
            if (tier === 'miss') {
              playSound('reelStop', soundOn);
            } else {
              const leadsTo = TIER_BONUS[tier];
              playSound(leadsTo === 'ball' ? 'seven' : leadsTo === 'chest' ? 'big' : 'small', soundOn);
              const line = event.result.digits.join(' ');
              setAnnouncement(leadsTo === 'ball' ? strings.saySevens : leadsTo === 'chest' ? strings.sayChestStart(line) : strings.saySugorokuStart(line));
            }
            break;
          }
          case 'sugorokuStart':
            playSound('dice', soundOn);
            break;
          case 'sugorokuEnd':
            if (event.fever) celebrate(stage, 'fever');
            playSound(event.fever ? 'fever' : 'prize', soundOn);
            setAnnouncement(event.fever ? strings.sayFever(event.payout) : strings.saySugoroku(event.payout));
            break;
          case 'chestStart':
            playSound('chest', soundOn);
            break;
          case 'chestPicked':
            playSound('open', soundOn);
            break;
          case 'chestEnd':
            playSound('prize', soundOn);
            if (event.payout >= CHEST_TOWERS_FROM) playSound('tower', soundOn);
            setAnnouncement(strings.sayChest(event.chest + 1, event.payout, event.payout >= CHEST_TOWERS_FROM));
            break;
          case 'rouletteStart':
            playSound('roulette', soundOn);
            break;
          case 'rouletteStep':
            playSound('pocket', soundOn, { level: event.level });
            playSound('tower', soundOn);
            setAnnouncement(event.level >= CHAIN_GOAL ? strings.sayGoal(event.medals, event.level) : strings.sayStep(event.medals, event.level));
            break;
          case 'rouletteEnd':
            // The run ends here only on a cross; a full run goes on to the bowl.
            playSound('cross', soundOn);
            setAnnouncement(strings.sayFinish(event.total));
            break;
          case 'bowlStart':
            playSound('reach', soundOn);
            break;
          case 'bowlEnd':
            if (event.jackpot) celebrate(stage, 'jackpot');
            // The jackpot has its fanfare. Either of the other holes is a prize that goes up as towers.
            playSound(event.jackpot ? 'jackpot' : 'prize', soundOn);
            if (!event.jackpot) playSound('tower', soundOn);
            setAnnouncement(event.jackpot ? strings.sayJackpot(event.payout) : strings.sayHole(event.payout, event.total));
            // A jackpot is not left to wait for the minute: it goes to the account now.
            if (event.jackpot) keeping.save('moment');
            break;
        }
      }
      // Each is its own sound: a medal can land in the very frame another goes over the front or off the side.
      if (won > 0) playSound('win', soundOn, { count: won });
      if (lost) playSound('lost', soundOn);
      if (landed) playSound('land', soundOn);

      trackMedals(stage, session.machine, won);
      ageStage(stage, elapsed, calm.matches);
      renderer.draw(stage, session.machine, { showGuide: true, calm: calm.matches, stock: session.stock });

      // The reels act out the spin. Without motion each waits, dimmed, and shows its digit at the moment it would have stopped.
      const { spin } = session;
      if (spin && !spin.done && !calm.matches) {
        const positions = reelPositions(spin);
        const fast = reelsFast(spin);
        const stops = stopTimes(spin);
        const lands = landTimes(spin);
        strips.current.forEach((strip, reel) => {
          if (strip) {
            strip.style.transform = stripOffset(positions[reel]);
            markStrip(strip, 'fast', fast[reel]);
            markStrip(strip, 'waiting', false);
          }
          // An outer reel is heard as it lands on its digit; the centre's stop is the sound the spin ends with.
          if (reel !== 1 && lastSpinClock < lands[reel] && spin.elapsed >= lands[reel]) playSound('reelStop', soundOn);
        });
        if (spin.result.reach && lastSpinClock < stops[2] && spin.elapsed >= stops[2]) playSound('reach', soundOn);
        lastSpinClock = spin.elapsed;
      } else {
        const resting = spin ? stoppedDigits(spin, digits) : digits;
        const waiting = spin ? reelsWaiting(spin) : null;
        strips.current.forEach((strip, reel) => {
          if (strip) {
            strip.style.transform = stripOffset(resting[reel] - 1);
            markStrip(strip, 'fast', false);
            markStrip(strip, 'waiting', waiting?.[reel] ?? false);
          }
        });
      }

      // The ball acts out the jackpot challenge; without motion it waits where it was let go until it is in its hole.
      const bowl = session.roulette?.bowl;
      if (bowl && ball.current) ball.current.style.transform = ballTransform(ballSpot(bowl, calm.matches));

      const nextScreen = screenState(session, calm.matches);
      if (!sameScreen(nextScreen, shownScreen)) {
        const ticking = nextScreen.mode === 'roulette' && nextScreen.banner === 'none' && nextScreen.lit !== shownScreen.lit;
        const hopping = nextScreen.mode === 'sugoroku' && nextScreen.square !== shownScreen.square;
        if (ticking || hopping) playSound(ticking ? 'tick' : 'hop', soundOn);
        shownScreen = nextScreen;
        setScreen(nextScreen);
      }
      const nextHud = hudOf(session);
      if (!sameHud(nextHud, shownHud)) {
        if (nextHud.credits === 0 && shownHud.credits > 0) setAnnouncement(strings.sayEmpty);
        shownHud = nextHud;
        setHud(nextHud);
      }
    };
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.dispose();
      window.clearInterval(saveTimer);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.removeEventListener('pagehide', saveOnLeaving);
      // Moving to another page of the site hides nothing and leaves nothing, so the machine is saved here too.
      keeping.save('left');
      sessionRef.current = null;
    };
  }, [switchedOn]);

  // An armed Reset waits a few seconds for the second press, then its label goes back and it says so.
  // The timer only changes what is shown: whether a second press still counts is decided in `onReset`.
  useEffect(() => {
    if (armedAt === null) return;
    const timer = window.setTimeout(() => {
      setArmedAt(null);
      setAnnouncement(live.current.strings.sayResetOff);
    }, RESET_WINDOW * 1000);
    return () => window.clearTimeout(timer);
  }, [armedAt]);

  /** How far across the field the pointer is, or null where the picture shows no part of it. */
  const acrossAt = (event: ReactPointerEvent<HTMLCanvasElement>): number | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return null;
    const px = ((event.clientX - bounds.left) / bounds.width) * VIEW.width;
    const py = ((event.clientY - bounds.top) / bounds.height) * VIEW.height;
    // On the back wall, the screen included, it is the spot under the pointer; lower down, the spot on the pusher.
    const panel = unprojectPanel(px, py);
    const point = panel && panel.height >= HEIGHT.pusher ? panel : unproject(px, py, HEIGHT.pusher);
    return point ? point.x : null;
  };

  /**
   * The chest under a point of the page, if the screen is offering one there to be picked. The screen stands behind the
   * canvases, so a press meant for a chest lands on the field; this finds the button the player was pointing at.
   */
  const chestAt = (x: number, y: number): HTMLButtonElement | null => {
    const wall = wallRef.current;
    if (!wall || typeof document.elementsFromPoint !== 'function') return null;
    for (const element of document.elementsFromPoint(x, y)) {
      if (!wall.contains(element)) continue;
      // The first thing of the screen's under the point is what is seen there.
      const button = element.closest('button');
      return button && wall.contains(button) && !button.disabled ? button : null;
    }
    return null;
  };
  /** Shows a chest as pointed at, the way it would show itself if the pointer could reach it. */
  const hoverChest = (chest: HTMLButtonElement | null, field: HTMLCanvasElement) => {
    if (hoveredChest.current === chest) return;
    hoveredChest.current?.removeAttribute('data-hover');
    chest?.setAttribute('data-hover', 'true');
    hoveredChest.current = chest;
    field.style.cursor = chest ? 'pointer' : '';
  };

  /**
   * A rail's feed button. Every pointer that goes down on it is held on its own, and the button keeps hold of it
   * until it comes up, so a second finger on the other button, or a slip of this one off the edge, changes nothing.
   * A press feeds at once; the click that follows a press is not a second one, and a click that follows none is the
   * button being worked from the keyboard or by assistive technology, which feeds one medal.
   */
  const feedButton = (arm: Arm) => (
    <button
      type="button"
      className={styles.feed}
      data-arm={arm}
      data-held={held[arm]}
      aria-label={t.feedAria[arm]}
      aria-keyshortcuts={KEY_CAPS[arm]}
      title={t.feedHint(KEY_CAPS[arm])}
      data-testid={arm === 0 ? 'pusher-feed-left' : 'pusher-feed-right'}
      disabled={hud.credits === 0}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A pointer that cannot be kept hold of is let go when it leaves the button instead.
        }
        pressRail(arm, pointerName(event.pointerId));
      }}
      onPointerUp={(event) => releaseRail(arm, pointerName(event.pointerId))}
      onPointerCancel={(event) => releaseRail(arm, pointerName(event.pointerId))}
      onLostPointerCapture={(event) => releaseRail(arm, pointerName(event.pointerId))}
      onPointerLeave={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) releaseRail(arm, pointerName(event.pointerId));
      }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        if (event.detail === 0) feedOnce(arm);
      }}
    >
      <span className={styles.feedLetter} aria-hidden>
        {t.feedName[arm]}
      </span>
      <kbd className={styles.keyCap} aria-hidden>
        {KEY_CAPS[arm]}
      </kbd>
    </button>
  );

  const toggleSound = () => {
    if (!sound) void unlockAudio();
    setSound(!sound);
  };

  const onRefill = () => {
    const session = sessionRef.current;
    if (session && refill(session)) {
      setHud(hudOf(session));
      keeper.current?.save('moment');
    }
  };

  const onPick = (chest: number) => {
    const session = sessionRef.current;
    if (session) pickChest(session, chest);
  };

  // A player who is signed in resets the machine on the account, and is told so before the second press.
  const resetConfirm = player.uid === null ? t.resetConfirm : t.resetConfirmAccount;
  const onReset = () => {
    // A press that does not follow a first one within the window is a first press itself,
    // even if the label has not gone back yet.
    const now = Date.now();
    if (!confirmsReset(armedAt, now)) {
      setArmedAt(now);
      setAnnouncement(resetConfirm);
      return;
    }
    // The second press came in time: the cabinet starts again with a new machine and nothing saved. For a player
    // who is signed in the new machine is the account's as well, and takes the old one's place there.
    setArmedAt(null);
    keeper.current?.fresh();
    setSwitchedOn((times) => times + 1);
    setHud(INITIAL_HUD);
    setScreen(IDLE_SCREEN);
    setAuto(false);
    setAnnouncement(t.sayReset(START_CREDITS));
  };

  // What is true of where the machine is kept. A write to this device that failed is said first, wherever else it is not kept either.
  const savedNote =
    status.where === 'account'
      ? t.accountNote
      : status.where === 'unreadable'
        ? t.unreadableNote
        : status.where === 'checking'
          ? t.checkingNote
          : !status.kept
            ? t.unsavedNote
            : status.where === 'offline'
              ? t.offlineNote
              : t.savedNote;

  const registerStrip = (reel: number, element: HTMLDivElement | null) => {
    strips.current[reel] = element;
  };
  const registerBall = (element: HTMLDivElement | null) => {
    ball.current = element;
  };

  return (
    <div className={styles.machine}>
      <div className={styles.cabinet} data-banner={screen.banner}>
        <div className={styles.bulbs} aria-hidden />
        <div className={styles.marquee}>
          <div className={styles.logo} aria-hidden>
            <span className={styles.logoMain}>GOLDEN FEVER</span>
            <span className={styles.logoSub}>ゴールデンフィーバー</span>
          </div>
          <div className={styles.jackpotBox}>
            <span className={styles.jackpotLabel}>{t.jackpot}</span>
            <span className={styles.jackpotValue} data-testid="pusher-jackpot">
              {fmt(hud.jackpot)}
            </span>
          </div>
        </div>

        {/* One stage. The screen is the back wall of the cabinet: it stands behind the two canvases, where the picture is left clear for it, and everything else is drawn in front of it. */}
        <div className={styles.fieldWrap} style={STAGE_UNIT}>
          <div className={styles.wallSpace} style={WALL_SPACE}>
            <div ref={wallRef} className={styles.wall} style={WALL_SHEET} data-testid="pusher-wall">
              <Screen state={screen} stock={hud.stock} strings={t} registerStrip={registerStrip} registerBall={registerBall} onPick={onPick} />
            </div>
          </div>
          <canvas ref={sceneRef} className={styles.scene} aria-hidden />
          <canvas
            ref={canvasRef}
            className={styles.field}
            style={STAGE_SHAPE}
            role="img"
            aria-label={t.fieldAria}
            data-testid="pusher-field"
            onPointerDown={(event) => {
              // Only the main button of a mouse: a right or a middle click is the browser's, for its menu or its scrolling.
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              // A press on a chest the screen is offering is for the chest: it does not aim.
              pressedChest.current = chestAt(event.clientX, event.clientY);
              if (pressedChest.current) return;
              // Anywhere else it aims, and only aims: the left half of the field is the left rail's and the right
              // half the right rail's. The rail a press began on is the one it goes on moving, wherever it is dragged
              // to, and a second finger on the other half moves the other rail meanwhile. No medal is fed from here.
              const x = acrossAt(event);
              if (x === null) return;
              const arm = armFor(x);
              aimers.current.set(event.pointerId, arm);
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // Without it the drag ends where the pointer leaves the field.
              }
              aimRail(arm, x);
            }}
            onPointerMove={(event) => {
              const arm = aimers.current.get(event.pointerId);
              if (arm !== undefined) {
                const x = acrossAt(event);
                if (x !== null) aimRail(arm, x);
              } else if (screen.mode === 'chest' || hoveredChest.current) hoverChest(chestAt(event.clientX, event.clientY), event.currentTarget);
            }}
            onPointerUp={(event) => aimers.current.delete(event.pointerId)}
            onPointerCancel={(event) => {
              // The browser took the gesture for a scroll: the aim stays where the drag had got to, and no click follows.
              aimers.current.delete(event.pointerId);
              pressedChest.current = null;
            }}
            onLostPointerCapture={(event) => aimers.current.delete(event.pointerId)}
            onPointerLeave={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) aimers.current.delete(event.pointerId);
              hoverChest(null, event.currentTarget);
            }}
            onClick={(event) => {
              // A press that began on a chest picks it, if it ends there too. A click anywhere else has done its aiming already.
              const chest = pressedChest.current;
              pressedChest.current = null;
              if (chest && chest === chestAt(event.clientX, event.clientY)) chest.click();
            }}
          />
        </div>
        {/* What each line of the slot leads to. There is no room for it on the screen now that the screen is in the cabinet. */}
        <div className={styles.legendBelow} aria-hidden data-testid="pusher-legend">
          <span className={styles.legend}>
            <span data-tier="seven">{t.legendSeven}</span>
            <span data-tier="big">{t.legendOdd}</span>
            <span data-tier="small">{t.legendEven}</span>
          </span>
        </div>

        {/* The controls: a feed button for each rail at either end, the medals on a plate between them, and under them an aim for each rail. */}
        <div className={styles.panel} data-testid="pusher-controls">
          {feedButton(0)}
          <div className={styles.credit}>
            <span className={styles.creditLabel}>{t.medals}</span>
            <strong className={styles.creditValue} data-testid="pusher-credits">
              {fmt(hud.credits)}
            </strong>
          </div>
          {feedButton(1)}
          <div className={styles.aims}>
            {([0, 1] as const).map((arm) => (
              <div key={arm} className={styles.aim} data-arm={arm}>
                <label htmlFor={`${aimId}-${arm}`} className={styles.aimLabel}>
                  {t.aimLabel[arm]}
                  <span className={styles.aimKeys} aria-hidden>
                    <kbd className={styles.keyCap}>{AIM_CAPS[arm][0]}</kbd>
                    <kbd className={styles.keyCap}>{AIM_CAPS[arm][1]}</kbd>
                  </span>
                </label>
                <input
                  id={`${aimId}-${arm}`}
                  type="range"
                  className={styles.aimSlider}
                  min={AIM_RANGE[arm].min}
                  max={AIM_RANGE[arm].max}
                  step={1}
                  value={aimPercent(aims[arm])}
                  aria-valuetext={t.aimValue(aimPercent(aims[arm]))}
                  data-testid={arm === 0 ? 'pusher-aim-left' : 'pusher-aim-right'}
                  onChange={(event) => aimRail(arm, percentAim(Number(event.target.value)))}
                />
              </div>
            ))}
          </div>
          <div className={styles.toggles}>
            <button type="button" className={styles.toggle} aria-pressed={auto} title={t.autoHint} data-testid="pusher-auto" onClick={() => setAuto(!auto)}>
              {t.auto}
            </button>
            <button type="button" className={styles.toggle} aria-pressed={sound} data-testid="pusher-sound" onClick={toggleSound}>
              <span aria-hidden>{sound ? '🔊' : '🔇'}</span> {t.sound}
            </button>
          </div>
        </div>

        <p className={styles.keysNote} data-testid="pusher-keys">
          {t.keysNote}
        </p>

        {hud.credits === 0 && (
          <button type="button" className={styles.refill} data-testid="pusher-refill" onClick={onRefill}>
            {t.refill(START_CREDITS)}
          </button>
        )}
        <div className={styles.bulbs} aria-hidden />
      </div>

      <section className={styles.tally} aria-label={t.tallyTitle}>
        <h2 className={styles.tallyTitle}>{t.tallyTitle}</h2>
        <dl className={styles.tallyGrid}>
          <div className={styles.tallyItem}>
            <dt>{t.tallyPlayed}</dt>
            <dd data-testid="pusher-played">{fmt(hud.played)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallyWon}</dt>
            <dd data-testid="pusher-won">{fmt(hud.won)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallyLost}</dt>
            <dd data-testid="pusher-lost">{fmt(hud.lost)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallySpins}</dt>
            <dd data-testid="pusher-spins">{fmt(hud.spins)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallyPaid}</dt>
            <dd data-testid="pusher-paid">{fmt(hud.paid)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallyReturn}</dt>
            <dd data-testid="pusher-return">{hud.played === 0 ? '—' : `${((hud.won / hud.played) * 100).toFixed(1)}%`}</dd>
          </div>
        </dl>
        <p className={styles.note}>{t.tallyNote}</p>
        <p className={styles.note} data-saved={status.kept} data-testid="pusher-saved" data-where={status.where}>
          {savedNote}
          {status.where === 'device' && status.kept && player.settled && player.uid === null && signInHref && (
            <>
              {' '}
              <a className={styles.noteLink} href={signInHref} data-testid="pusher-sign-in">
                {t.signInInvite}
              </a>
            </>
          )}
        </p>
        <button type="button" className={`${styles.btn} ${styles.reset}`} data-armed={armed} data-testid="pusher-reset" onClick={onReset}>
          {armed ? resetConfirm : t.reset}
        </button>
      </section>

      <p className={styles.srOnly} aria-live="polite" data-testid="pusher-announcement">
        {announcement}
      </p>
    </div>
  );
};
