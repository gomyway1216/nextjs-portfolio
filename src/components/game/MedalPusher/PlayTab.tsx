'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { CATCHER, caught, lampShown, nearness } from './catcher';
import { AutoIcon, MakersPlate, PanelWarning, SpeakerIcon } from './ControlPanel';
import { AchievementToast, BonusStrip } from './DailyBonus';
import { AIM, ARM_REACH, CHECKERS, FEED, aimArm, armFor, armStart, type Arm } from './engine';
import { aimsOnContact, isSidewaysDrag, sweepLead, sweepTo, type WakeKeeper } from './feel';
import { FeelControls, FeelNote } from './FeelControls';
import { buzz, hapticFor, noteFed, stopBuzz, takeFed, type FedBy } from './haptics';
import { getStrings } from './i18n';
import { BOWLS, CHAIN_GOAL, CHEST_TOWERS_FROM, JACKPOT_START, JEWEL, TIER_BONUS } from './lottery';
import { MedalTray, type MedalTrayHandle } from './MedalTray';
import type { TrayCause } from './panel';
import { PlateSticker } from './PlateSticker';
import { BURST, ageStage, celebrate, createStage, dropEntries, enterGate, holdCount, holdShown, showJewel, trackMedals, type Stage } from './render';
import { records } from './recordsStore';
import { createRenderer } from './renderer';
import { IDLE_DIGITS, Screen, markStrip, placeLottery, stripOffset } from './ScreenPanel';
import { SegmentDisplay, SegmentMirror } from './SegmentDisplay';
import {
  ballRollsAt,
  ballTipsAt,
  landTimes,
  monitorGlow,
  monitorMode,
  reelPositions,
  reelsFast,
  reelsWaiting,
  sameScreen,
  screenState,
  stopTimes,
  stoppedDigits,
  type ScreenState,
} from './screen';
import { START_CREDITS, advance, createSession, insert, pickChest, type ActiveRoulette, type Session, type SessionEvent } from './session';
import { PUSHER, bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSettingsButton, SoundSettingsPanel, useSoundSettings } from './SoundControls';
import { hush, playSound, setAmbience, setMusic, turnMotor, unlockAudio } from './sounds';
import { GUEST, slotFor, type AccountStore, type Player, type Status, type Sync, type Why } from './account';
import { keepMachine } from './savedMachine';
import { savedNoteFor } from './savedNote';
import { STORAGE_KEY, restore } from './storage';
import { useFeel, type FeelNow } from './useFeel';
import { hopperBusy } from './hopper';
import { STACK, towersIn } from './stacker';
import { GATE } from './works';
import { getWorksStrings } from './worksStrings';
import { HEIGHT, VIEW, screenPlacement, unproject, unprojectPanel } from './view';
import look from './ControlPanel.module.css';
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
/** How far along a rail's slider a spot is, from 0 at its left end to 1 at its right: where a mark over the slider goes. */
export const sliderShare = (arm: Arm, percent: number): number => {
  const { min, max } = AIM_RANGE[arm];
  return Math.min(1, Math.max(0, (percent - min) / (max - min)));
};
/** The START pockets each rail can feed, in the sliders' percent: what its slider marks as worth timing a press for. */
export const POCKETS_IN_REACH = ([0, 1] as const).map((arm) => CHECKERS.positions.filter((x) => x >= ARM_REACH[arm].min && x <= ARM_REACH[arm].max).map(aimPercent)) as [number[], number[]];

/** How many digits the counter of medals has, and the jackpot's plate. */
export const COUNTER_PLACES = 5;
export const JACKPOT_PLACES = 4;

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
/**
 * How near a medal that hangs on a tongue's edge has to have been to fitting its pocket for its rocking to be heard
 * (`nearness` in catcher.ts): the nearer half of them, which hang a quarter of a second or more. The rest are off the
 * edge almost as they reach it, and nearly half the medals that come over at the catcher are one or the other.
 */
export const TEETER_FROM = 0.5;
/** How often the machine is saved while it is showing, in seconds. */
const SAVE_EVERY = 5;
/** How long a first press of a two-press button (clearing the records) waits for the second, in seconds. */
export const RESET_WINDOW = 6;
/**
 * How long the cabinet waits for the card before it says that it is in a machine in another tab, in seconds. The
 * card is away for a moment whenever another page takes the day's bonus or the like; nothing is said of that.
 */
export const CARD_WAIT = 1.5;

/**
 * Whether a press of Reset at `now` is the second press, in time, of one made
 * at `armedAt` (both in milliseconds; null when no first press stands). The
 * label going back is only a timer, and timers run late, so this is what
 * decides it. A clock that has gone backwards confirms nothing.
 */
export const confirmsReset = (armedAt: number | null, now: number): boolean => armedAt !== null && now >= armedAt && now - armedAt < RESET_WINDOW * 1000;

/**
 * Keeps the cabinet's lights in step with what the bowls paid. A celebration
 * of the stage's own lasts as long as its kind does, which is not as long as
 * a prize from the bowls is up; this one is lit again in every frame the
 * prize is on the screen and put out in the frame the screen is free, so it
 * is exactly as long as the show, whatever that takes. `lit` is the
 * celebration this lit the frame before, and what comes back is the one it
 * has lit now. A celebration it did not light is left to run its own time.
 */
export function lightBowlPrize(stage: Stage, roulette: ActiveRoulette | null, lit: Stage['party']): Stage['party'] {
  if (roulette?.bowl && roulette.bowl.payout >= 0) {
    celebrate(stage, roulette.jackpot ? 'jackpot' : 'fever');
    return stage.party;
  }
  if (lit && stage.party === lit) stage.party = null;
  return null;
}

/**
 * Whether what the bowls paid is up on the screen. Its announcement has told all of it: how many of the medals are
 * poured onto the field, and that the rest go up as towers. So for as long as it is up the payout works say nothing
 * of their own: the pour they finish and the towers they build in that time are that prize, said already.
 */
export const bowlPrizeUp = (roulette: ActiveRoulette | null): boolean => !!roulette?.bowl && roulette.bowl.payout >= 0;

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
  jewels: number;
}

/** No medal was fed in a frame: most frames. */
const NONE_FED: readonly (-1 | 1)[] = [];

const hudOf = (session: Session): Hud => ({
  credits: session.credits,
  jackpot: session.jackpot,
  stock: session.stock,
  played: session.inserted,
  won: session.won,
  lost: session.lost,
  spins: session.spins,
  paid: session.paidOut,
  jewels: session.jewels,
});

const INITIAL_HUD: Hud = { credits: START_CREDITS, jackpot: JACKPOT_START, stock: 0, played: 0, won: 0, lost: 0, spins: 0, paid: 0, jewels: 0 };
const IDLE_SCREEN: ScreenState = {
  mode: 'slot',
  banner: 'none',
  amount: 0,
  line: null,
  lit: -1,
  board: -1,
  square: 0,
  die: 0,
  rolling: false,
  chests: null,
  secondsLeft: 0,
  level: 0,
  total: 0,
  stage: -1,
  fallen: [],
  chance: 0,
  golds: 0,
  gold: false,
};

const sameHud = (a: Hud, b: Hud): boolean =>
  a.credits === b.credits &&
  a.jackpot === b.jackpot &&
  a.stock === b.stock &&
  a.played === b.played &&
  a.won === b.won &&
  a.lost === b.lost &&
  a.spins === b.spins &&
  a.paid === b.paid &&
  a.jewels === b.jewels;

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
  // How loud the player has the cabinet and whether its loop plays, kept on this device apart from the machine.
  const soundControl = useSoundSettings();
  const musicOn = soundControl.settings.music;
  const arcadeOn = soundControl.settings.arcade;
  const [announcement, setAnnouncement] = useState('');
  // Each time another machine goes on the table (the account's, the one another tab played, or a new one after the
  // medal center's reset) the cabinet is switched off and on again.
  const [switchedOn, setSwitchedOn] = useState(0);
  // The medals are the medal bank's, and so is the card that lets this cabinet play from it (MedalCenter/bank.ts).
  const bankState = useBank();
  const seat = useRef<Seat | null>(null);
  // The day's bonus, paid into the bank on this page, for the cabinet's next frame to act out.
  const gifts = useRef<SessionEvent[]>([]);
  // What this page last saw of the machine kept on this device: as it opened it, or as it last saved it. When the card
  // comes back to this page, a different text there means that another page has played the machine since and saved
  // its own, which is then the machine to play.
  const seenSave = useRef<string | null>(null);
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
  const live = useRef({ auto, sound, active, strings: t, works: getWorksStrings(language) });
  // Who is holding each rail's feed down. The two rails are held apart, so two fingers, or two keys, feed both at once.
  const holds = useRef<[Hold, Hold]>([
    { by: new Set(), since: 0 },
    { by: new Set(), since: 0 },
  ]);
  // The aim keys that are down, and the rail each pointer on the field is aiming.
  const aimKeys = useRef(new Set<string>());
  const aimers = useRef(new Map<number, Arm>());
  // The fingers on the field that have not shown yet whether they are aiming or scrolling the page: where each went
  // down, and on which rail's half.
  const waiting = useRef(new Map<number, { x: number; y: number; arm: Arm }>());
  // How the machine feels in the hand: Sweep, vibration and the screen kept awake (feel.ts). The frame loop reads the
  // player's choices from `feelNow`, and tells `wake` of every medal.
  const feelNow = useRef<FeelNow>({ sweep: false, vibrate: false });
  const wake = useRef<WakeKeeper | null>(null);
  const feel = useFeel(feelNow, wake);
  // What fed each medal since the last frame, noted where the machine took it: a press or a held button. The frame
  // loop takes the notes when it plays the hand its pattern.
  const fedBy = useRef<FedBy[]>([]);
  // The tray in front of the player. It is told what happened to the purse (a medal fed, medals won, the day's
  // bonus, a refill) and acts that out; it is never left to tell why from how much the count changed. Medals that
  // are seen to land in it are heard there as they land.
  const tray = useRef<MedalTrayHandle>(null);
  const landInTray = useCallback((medals: number) => playSound('tray', live.current.sound, { count: medals }), []);
  // While the rails swing: where a medal fed now would drop, each rail's, in the sliders' percent. Null while they do not.
  const [lead, setLead] = useState<[number, number] | null>(null);

  useEffect(() => {
    live.current = { auto, sound, active, strings: t, works: getWorksStrings(language) };
  });

  /** Shows on the buttons which rails are held, when that has changed. */
  const showHeld = () => {
    const now: [boolean, boolean] = [holds.current[0].by.size > 0, holds.current[1].by.size > 0];
    setHeld((was) => (was[0] === now[0] && was[1] === now[1] ? was : now));
  };
  /** The machine as this device keeps it now, in its player's slot. */
  const readSave = useCallback((): string | null => {
    try {
      return window.localStorage.getItem(slotFor(STORAGE_KEY, keeper.current?.owner() ?? null));
    } catch {
      return null;
    }
  }, []);
  /** Saves the machine (see account.ts for where it goes), and notes what is kept on this device now. */
  const keep = useCallback(
    (why: Why): void => {
      keeper.current?.save(why);
      seenSave.current = readSave();
    },
    [readSave],
  );

  /**
   * Whether the machine on the table may run: this page holds the card, the bank on the table is the bank of the
   * player whose machine this is, and the machine is still the one on the table.
   */
  const playable = (session: Session | null): session is Session =>
    session !== null && sessionRef.current === session && (seat.current?.holding() ?? false) && medalBank().owner() === (keeper.current?.owner() ?? null);
  /** Feeds one medal into a rail, if the bank has one and that rail's slot is free. Neither rail's aim moves. */
  const feedOnce = (arm: Arm) => {
    const session = sessionRef.current;
    if (!playable(session)) return;
    // The medal is the bank's: it is taken out as the machine takes it.
    session.credits = medalBank().balance();
    const fed = insert(session, arm);
    if (fed) medalBank().take(1);
    if (noteFed(fedBy.current, 'feed', fed)) feedSound(live.current.sound);
  };
  /** A finger or a key goes down on a rail's feed. The first one feeds a medal at once; held, the rail streams. */
  const pressRail = (arm: Arm, by: string) => {
    // A press on a cabinet whose card is in another tab's machine is the player coming back to this one.
    if (bankState.card === 'away') seat.current?.play();
    const hold = holds.current[arm];
    if (hold.by.has(by)) return;
    if (hold.by.size === 0) {
      hold.since = performance.now() / 1000;
      // The button itself is heard going down, and coming up when the last finger or key leaves it.
      playSound('button', live.current.sound);
      feedOnce(arm);
    }
    hold.by.add(by);
    showHeld();
  };
  const releaseRail = (arm: Arm, by: string) => {
    const hold = holds.current[arm];
    if (!hold.by.delete(by)) return;
    if (hold.by.size === 0) playSound('button', live.current.sound, { up: true });
    showHeld();
  };
  /** A hand on an aim takes over from Sweep, which goes off and says so. */
  const takeOver = () => {
    if (!feelNow.current.sweep) return;
    feel.setSweep(false);
    setAnnouncement(t.saySwingTaken);
  };
  /** Points one rail at a spot across the field, as near as it can point, and shows where that is. */
  const aimRail = (arm: Arm, x: number) => {
    const session = sessionRef.current;
    if (!session) return;
    takeOver();
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

  // A finger's press can end unheard too. The page is hidden, or the window loses the pointer, with a finger still
  // down, and it comes up where nothing hears it: the rail would go on streaming when the page came back. So whoever
  // is holding a feed, or aiming on the field, has let go by then, and so they have when this tab is put away.
  useEffect(() => {
    if (!active) return;
    const letGo = () => {
      for (const hold of holds.current) hold.by.clear();
      aimers.current.clear();
      waiting.current.clear();
      setHeld((was) => (was[0] || was[1] ? [false, false] : was));
    };
    const whenHidden = () => {
      if (document.visibilityState === 'hidden') letGo();
    };
    window.addEventListener('blur', letGo);
    window.addEventListener('pagehide', letGo);
    document.addEventListener('visibilitychange', whenHidden);
    return () => {
      window.removeEventListener('blur', letGo);
      window.removeEventListener('pagehide', letGo);
      document.removeEventListener('visibilitychange', whenHidden);
      letGo();
    };
  }, [active]);

  // The motor stops with the machine. A reset, leaving this tab or hiding the page in the middle of a long pattern
  // would leave it buzzing for a machine that is gone or out of sight, and would hold back the next machine's ticks
  // until the old pattern would have ended. So does the cabinet being taken down. A medal that was noted and not yet
  // felt is not felt later either.
  useEffect(() => {
    if (!active) return;
    const stop = () => {
      fedBy.current.length = 0;
      stopBuzz();
    };
    const whenHidden = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', whenHidden);
    return () => {
      document.removeEventListener('visibilitychange', whenHidden);
      stop();
    };
  }, [active, switchedOn]);

  // The background loop plays while the sound is on, the player has not switched the loop off, and this tab is
  // showing. Switching the sound off, or leaving the cabinet, cuts short whatever is still ringing. So does a
  // reset: the old machine's reels, fanfare and loop stop with it, and the loop starts again from the top for the new one.
  useEffect(() => {
    setMusic(sound && active && musicOn);
    return () => setMusic(false);
  }, [sound, active, switchedOn, musicOn]);
  useEffect(() => (sound && active ? hush : undefined), [sound, active, switchedOn]);
  // The arcade round the cabinet is heard on the same terms as the loop, when the player has asked for it. It is
  // not the machine's, so a reset does not stop it.
  useEffect(() => {
    setAmbience(sound && active && arcadeOn);
    return () => setAmbience(false);
  }, [sound, active, arcadeOn]);

  // The keeper is set up once, before anything asks it for a machine.
  useEffect(() => {
    keeper.current ??= keepMachine({
      store,
      slots: () => window.localStorage,
      // The machine is this page's to write down only while this page holds the card. A write that is still on its
      // way to the account when the card goes is answered after another tab may have saved its own machine, and the
      // answer writes down what the keeper is shown: nothing, then, so the other tab's machine stays.
      session: () => (seat.current?.holding() ? sessionRef.current : null),
      reopen: () => {
        setHud(INITIAL_HUD);
        setScreen(IDLE_SCREEN);
        // Another machine is not fed for its player before they have seen it.
        setAuto(false);
        setSwitchedOn((times) => times + 1);
      },
      onStatus: setStatus,
    });
  }, [store]);

  // Who is playing. Signing in or out while the game is open changes whose machine is on the table.
  useEffect(() => {
    keeper.current?.player({ uid: player.uid, settled: player.settled, expected: player.expected });
  }, [player.uid, player.settled, player.expected]);

  // The cabinet's place at the medal bank. It asks for the card as it is set up, and plays from the bank while it holds
  // it. As the card goes, the machine is written down, so that whichever page has it next finds it as it was left; and
  // if a machine of this game on another page has played since this page last had it, that page's machine is the one
  // written down, and this one is opened again from it.
  useEffect(() => {
    const purse = medalBank();
    const mine = purse.sit(PUSHER.game, {
      granted: (moved) => {
        if (!moved && readSave() === seenSave.current) {
          // The machine on the table is the one kept here: it is saved now, which also finds out whether this browser
          // will keep it at all.
          if (sessionRef.current) keep('tick');
          return;
        }
        sessionRef.current = null;
        setAuto(false);
        setSwitchedOn((times) => times + 1);
      },
      yielding: (why) => {
        if (sessionRef.current) keep(why === 'moment' ? 'tick' : why);
        for (const hold of holds.current) hold.by.clear();
        setHeld((was) => (was[0] || was[1] ? [false, false] : was));
      },
    });
    seat.current = mine;
    // What the bank does that the cabinet acts out: a bonus or a refill taken here, tipped into the tray; and a reset,
    // here or anywhere, after which this machine starts over too.
    const unlisten = purse.listen((event) => {
      const { strings } = live.current;
      if (event.type === 'reset') {
        sessionRef.current = null;
        keeper.current?.fresh();
        setHud(INITIAL_HUD);
        setScreen(IDLE_SCREEN);
        setAuto(false);
        setSwitchedOn((times) => times + 1);
        setAnnouncement(strings.sayCenterReset);
        return;
      }
      if (event.type === 'bonus') {
        // The day's bonus is heard, read out and tipped into the tray with everything else in the cabinet's next frame,
        // and the record book counts it, as it counts what is taken at the cabinet's plate.
        gifts.current.push({ type: 'bonus', count: event.medals });
        records.bonusTaken(event.medals);
        return;
      }
      // A cupful, tipped into the tray: it is seen to come down, and heard as it does. The machine counts the refills
      // its player has taken at it, as it always has, and the record book reads them off its counter.
      const session = sessionRef.current;
      if (session) {
        session.refills += 1;
        session.credits = purse.balance();
        setHud(hudOf(session));
      }
      tray.current?.happened({ purse: purse.balance(), fed: [], arrived: [{ cause: 'refill', count: event.medals }] });
    });
    return () => {
      unlisten();
      if (seat.current === mine) seat.current = null;
      mine.leave();
    };
  }, [keep, readSave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    // In 3D where the browser can, and on the canvas alone where it cannot; `?renderer=2d` asks for the second.
    const keeping = keeper.current;
    const renderer = canvas && keeping && createRenderer(canvas, sceneRef.current, window.location.search);
    if (!canvas || !keeping || !renderer) return;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const purse = medalBank();
    // A machine played before the medal center's last reset starts over, wherever it was kept: here, on the account,
    // or on another device.
    const restart = purse.restartDue(PUSHER.game);
    if (restart) keeping.fresh();
    // The machine to open with: the account's for a player who is signed in, and otherwise the one this browser
    // remembers, if it holds one that still reads. After a reset there is none, and the old one is thrown away.
    const remembered = keeping.open();
    seenSave.current = readSave();
    const restored = remembered === null ? null : restore(remembered, seed);
    const session = restored ?? createSession(seed);
    if (restart) purse.restarted(PUSHER.game);
    // The medals are the bank's. A machine saved before there was a bank kept its own purse: that is moved into the
    // bank, once, as soon as the bank on the table is this machine's player's (`playable`). A new machine has none.
    let oldPurse = restored && restored.credits > 0 ? restored.credits : null;
    // Whose purse it was is settled by whose machine it was when it was opened: a guest's machine that becomes an
    // account's carries the guest's purse, which came into the account's bank with the guest's bank.
    const purseFrom = keeping.owner() === null ? PUSHER.guestPurse : PUSHER.accountPurse;
    session.credits = purse.balance();
    sessionRef.current = session;
    // A machine that is remembered has its arms pointed where they were left, and a new one where a new machine's are.
    setAims([session.machine.aims[0], session.machine.aims[1]]);
    // Nothing is held over from the machine before, and none of its medals is still on its way into the tray: a
    // machine that is restored, reset or swapped for the account's shows its purse and acts nothing out.
    tray.current?.still();
    for (const hold of holds.current) hold.by.clear();
    aimKeys.current.clear();
    aimers.current.clear();
    setHeld([false, false]);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Saved on this device as soon as it stands here, every few seconds while it is showing, when the page is
    // hidden or left, and when the cabinet is taken down. A write that fails means the machine is not remembered;
    // the game goes on, and the note under the tally stops saying that it is. The keeper sends it on to the
    // account, for a player who has one, far less often: see SEND_EVERY in account.ts. Only while this page holds the
    // card: a machine that is not being played here may be older than the one another tab has saved since, and is
    // never written over it. (As the card goes, the seat writes the machine down: see above.)
    const mayKeep = () => sessionRef.current === session && (seat.current?.holding() ?? false);
    const saveWhileShowing = () => {
      if (live.current.active && document.visibilityState === 'visible' && mayKeep()) keep('tick');
    };
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden' && mayKeep()) keep('hidden');
    };
    const saveOnLeaving = () => {
      if (mayKeep()) keep('left');
    };
    const saveTimer = window.setInterval(saveWhileShowing, SAVE_EVERY * 1000);
    document.addEventListener('visibilitychange', saveWhenHidden);
    window.addEventListener('pagehide', saveOnLeaving);
    // The first save also finds out whether this browser will keep the machine at all.
    if (mayKeep()) keep('tick');

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
        // Nor is a medal that is on its way to a START pocket forgotten, or what the hold's lamps show.
        stage.entries = previous.entries;
        stage.hold = previous.hold;
        stage.holdGlow = previous.holdGlow;
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
    // What the hand has been told of: the medals fed so far, and where the sliders' marks stand while the rails swing.
    // No medal of the machine before is still waiting to be felt.
    let fedSeen = session.inserted;
    let shownLead: [number, number] | null = null;
    fedBy.current.length = 0;
    let lastSpinClock = 0;
    let bowlLights: Stage['party'] = null;
    let shownWorks = '';
    let last = performance.now();
    const events: SessionEvent[] = [];
    // The medals that were in the air before a frame, by name: the ones that have come down in it are among them.
    const airborne: number[] = [];
    // The clock of the roulette's turn as it was a frame ago, or less than nothing while no turn was on.
    let turnClock = -1;
    // The pocket the lucky lamp was shown on when the last frame was drawn: it is heard to step when that changes.
    let lampOn = lampShown(session.machine.time, calm.matches);
    let frameId = 0;

    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      // A frame's timestamp can be a touch earlier than the clock read when the loop was set up.
      const sinceLast = Math.max(0, Math.min(MAX_FRAME, (now - last) / 1000));
      last = now;
      const { auto: autoNow, sound: soundOn, active: activeNow, strings } = live.current;
      // A machine that is about to be replaced (another tab's, or a new one after a reset) is not run or drawn again.
      if (!activeNow || !stage || sessionRef.current !== session) return;
      // The machine runs only while it may play from the bank. Otherwise it stands as it was, drawn, with the bank's
      // medals on its counter, and no time passes on it.
      const playing = playable(session);
      const elapsed = playing ? sinceLast : 0;
      // The bank on the table when the machine was opened may not have been its player's (it was being found on the
      // account). Now that it is, a machine this device kept from before that bank's last reset starts over before it
      // plays a single medal.
      if (playing && purse.restartDue(PUSHER.game)) {
        sessionRef.current = null;
        setAuto(false);
        setSwitchedOn((times) => times + 1);
        return;
      }
      if (playing && oldPurse !== null) {
        // The purse a machine from before the bank kept, moved into its player's bank once (bank.ts says how once).
        purse.importPurse(keeping.owner(), purseFrom, oldPurse);
        oldPurse = null;
      }
      // The purse is the bank's: what the machine takes and pays in this frame is taken out of it and put back in it
      // at the end of the frame, and nothing else writes the bank while this page holds the card.
      session.credits = purse.balance();
      const purseBefore = session.credits;

      // The player's medals. A rail whose feed is held down streams them, as fast as its own slot takes them, and
      // the other rail does the same on its own: both at once is twice the medals. Auto feeds two a second, the
      // two rails by turns. A press that outlasts the medals ends there, so a refill does not start pouring them again.
      if (session.credits === 0 && holds.current.some((hold) => hold.by.size > 0)) {
        for (const hold of holds.current) hold.by.clear();
        setHeld([false, false]);
      }
      for (const arm of [0, 1] as const) {
        const hold = holds.current[arm];
        if (playing && hold.by.size > 0 && now / 1000 - hold.since >= HOLD_DELAY && noteFed(fedBy.current, 'stream', insert(session, arm))) feedSound(soundOn);
      }
      if (autoNow && playing) {
        autoClock += elapsed;
        if (autoClock >= 1 / AUTO_PACE) {
          autoClock = 0;
          if (insert(session, autoArm)) feedSound(soundOn);
          autoArm = autoArm === 0 ? 1 : 0;
        }
      }
      // A medal has gone in since the last frame, from a button, a key or Auto: the screen is kept awake for it, and
      // it is seen to leave the tray towards the button of the rail it is on. The newest medals on the rails are the
      // ones that went in: nothing has rolled off a rail since they did.
      let fedNow = NONE_FED;
      if (session.inserted !== fedSeen) {
        const rolling = session.machine.rolling;
        fedNow = rolling.slice(Math.max(0, rolling.length - (session.inserted - fedSeen))).map((medal) => (medal.arm === 0 ? -1 : 1));
        fedSeen = session.inserted;
        wake.current?.played();
      }

      // An aim key that is held down moves its rail's aim. Each arm swings after its own aim, and a medal on a
      // rail drops where its arm's tip is when it gets there.
      for (const code of aimKeys.current) {
        const turn = AIM_KEYS[code];
        if (turn) aimArm(session.machine, turn.arm, session.machine.aims[turn.arm] + turn.by * AIM_KEY.speed * elapsed);
      }
      // With Sweep on the rails swing by themselves: the aim is put in for the player, from the machine's own clock,
      // where the tips belong when this frame is over (feel.ts).
      const sweeping = feelNow.current.sweep;
      const then = session.machine.time + elapsed;
      if (sweeping) sweepTo(session.machine, then);
      // The sliders work in whole percent, so they are told only when an aim has moved by one. While the rails swing,
      // a mark over each shows where a medal fed now would drop, which is where its tip will be a roll from now; the
      // marks move when the sliders do, in the same render, so the cabinet is not drawn again for them alone.
      const [leftAim, rightAim] = session.machine.aims;
      const moved = aimPercent(leftAim) !== aimPercent(shownAims[0]) || aimPercent(rightAim) !== aimPercent(shownAims[1]);
      if (moved) {
        shownAims = [leftAim, rightAim];
        setAims(shownAims);
      }
      if (sweeping ? moved || !shownLead : shownLead !== null) {
        const drops = sweeping ? sweepLead(then) : null;
        shownLead = drops && [aimPercent(drops[0]), aimPercent(drops[1])];
        setLead(shownLead);
      }
      events.length = 0;
      airborne.length = 0;
      for (const medal of session.machine.falling) airborne.push(medal.id);
      // Where nothing may move a medal is not seen to ride its tongue, and the machine takes it as it comes over the lip.
      advance(session, elapsed, events, calm.matches);
      // What the frame took out of the purse and paid into it goes to the bank.
      const change = session.credits - purseBefore;
      if (change < 0) purse.take(-change);
      else if (change > 0) purse.give(change);
      // The machine is heard turning, in step with the pusher as it is drawn.
      turnMotor(soundOn, session.machine.time);
      if (gifts.current.length > 0) events.push(...gifts.current.splice(0));
      // The record book hears everything the machine did, whatever becomes of the machine.
      records.note(session, events);
      // What the bowls paid has the cabinet's lights for as long as it is up on the screen, and not a frame longer.
      bowlLights = lightBowlPrize(stage, session.roulette, bowlLights);
      // A medal that has come out of its slot onto the rail in this frame starts to roll along it.
      for (const medal of session.machine.rolling) if (medal.remaining <= FEED.arm && medal.remaining + elapsed > FEED.arm) playSound('roll', soundOn);

      let landed = false;
      let won = 0;
      let bonus = 0;
      let lost = false;
      // The pockets a medal has been heard to set off for in this frame, a bit for each.
      let rode = 0;
      // The towers pushed out in this frame, as they are told: two the same size leave both tubes in the same frame,
      // and are told together, or the second would take the first's place before it was heard.
      const towersOut: string[] = [];
      for (const event of events) {
        switch (event.type) {
          case 'bonus':
            // The day's bonus: its medals come down into the tray, and are heard there (below).
            playSound('prize', soundOn);
            bonus += event.count;
            setAnnouncement(strings.sayBonus(event.count));
            break;
          case 'landed':
            landed = true;
            break;
          case 'won':
            won += event.count;
            break;
          case 'lost':
            lost = true;
            break;
          case 'riding':
            // A medal has come over the lip on to its tongue: it is heard down it, faster as it goes, and off its end
            // into the pocket as its ride is up. One ride is heard for a pocket in a frame, however many medals a
            // tower that went over there sent after it.
            if ((rode & (1 << event.gate)) === 0) {
              rode |= 1 << event.gate;
              playSound('ride', soundOn, { seconds: event.seconds });
            }
            break;
          case 'checker':
            // The medal has dropped into its pocket, a ride after the lip's rule counted it, and the machine has taken
            // it. The cabinet answers in this frame: see `dropEntries` below.
            enterGate(stage, event);
            break;
          case 'chanceStart':
            playSound('fever', soundOn);
            // The wings of the START slots are thrown open by their solenoids, and thrown shut when chance time is over.
            playSound('shutter', soundOn, { up: true });
            setAnnouncement(strings.sayChance);
            break;
          case 'chanceEnd':
            playSound('shutter', soundOn);
            setAnnouncement(strings.sayChanceEnd);
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
            // The ball is heard for this turn and for every one after it in the run, which no event tells of: see below.
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
            // The ball is heard round the bowl until it tips, and through its hole as it does.
            if (!calm.matches) playSound('bowl', soundOn, { seconds: ballTipsAt(event.duration) });
            break;
          case 'bowlEnd':
            // The jackpot has its fanfare. The cabinet's lights are lit for either prize by the frame itself, for as
            // long as the prize is up. Part of it is poured and the rest goes up as towers.
            playSound(event.jackpot ? 'jackpot' : 'prize', soundOn);
            if (!event.jackpot) playSound('tower', soundOn);
            setAnnouncement(event.jackpot ? strings.sayJackpot(event.payout, event.poured) : strings.sayHole(event.bowl + 1, event.payout, event.poured, event.total));
            // A jackpot is not left to wait for the minute: it goes to the account now.
            if (event.jackpot) keep('moment');
            break;
          case 'bowlDrop':
            // Through a hole and into the bowl below: a step up, and the suspense starts again.
            playSound('pocket', soundOn, { level: CHAIN_GOAL });
            playSound('reach', soundOn);
            // It is in the air for a moment, and then heard round the bowl it has dropped into. The last is a funnel,
            // in which it goes faster all the way to its hole.
            if (!calm.matches) playSound('bowl', soundOn, { seconds: ballTipsAt(event.duration), after: ballRollsAt(event.bowl), quickens: BOWLS[event.bowl].length === 1 });
            setAnnouncement(strings.sayDrop(event.bowl + 1, BOWLS.length));
            break;
          case 'jewelDrop':
            // It comes out as the treasure chance begins, which has its own sound.
            setAnnouncement(strings.sayJewelDrop);
            break;
          case 'jewel':
            showJewel(stage, event.lamps - 1, event.payout, false);
            playSound('prize', soundOn);
            setAnnouncement(strings.sayJewel(event.payout, event.lamps, JEWEL.lamps));
            break;
          case 'jewelBonus':
            showJewel(stage, JEWEL.lamps - 1, event.payout, true);
            playSound('fever', soundOn);
            playSound('tower', soundOn);
            setAnnouncement(strings.sayJewelBonus(event.payout, JEWEL.lamps));
            break;
          // The payout works. What they have done is read out once it is done, so that it does not talk over the
          // prize that set them going; and not at all while a prize from the bowls is up, which has said it itself.
          case 'pourStart':
            // The hopper's doors drop open and the medals rush down the chute for as long as there are medals to pour.
            playSound('door', soundOn);
            playSound('pour', soundOn, { count: event.medals });
            break;
          case 'pourEnd':
            playSound('door', soundOn, { up: true });
            if (!bowlPrizeUp(session.roulette)) setAnnouncement(live.current.works.sayPoured(event.medals));
            break;
          case 'stacked':
            // A medal lands on the stack in a tube: on the bare platform if it is the first. One a frame, whatever came.
            playSound('land', soundOn, { bare: session.machine.stacker.tubes[event.tube].stacked === event.medals && session.machine.stacker.tubes[event.tube].phase === 'stacking' });
            break;
          case 'towerDown':
            // The platform's motor lets the built tower down to the deck, and stops.
            playSound('lift', soundOn, { seconds: STACK.lowers });
            break;
          case 'gateOpen':
            // The gate slides aside into the wall, and seats there.
            playSound('guard', soundOn, { up: true, seconds: STACK.opens });
            break;
          case 'towerOut':
            // The arm's motor runs while it pushes the tower out and across, and stops as it lets it go.
            playSound('lift', soundOn, { seconds: STACK.pushes });
            if (!bowlPrizeUp(session.roulette)) towersOut.push(live.current.works.sayTowerOut(event.medals, event.tube));
            break;
          case 'gateShut':
            // The arm is back in: the gate slides shut and seats, and the platform rises for the next tower.
            playSound('guard', soundOn, { seconds: GATE.shuts });
            playSound('lift', soundOn, { after: GATE.shuts, seconds: STACK.returns * (1 - STACK.back) });
            break;
        }
      }
      if (towersOut.length > 0) setAnnouncement(towersOut.join(' '));
      // The lucky lamp's light steps to the next pocket a ride after the pusher comes to the back of its stroke
      // (`lampShown` in catcher.ts), and its relay is heard as it does. Not in chance time: every pocket is lit then,
      // and no light is seen to move.
      const lamp = lampShown(session.machine.time, calm.matches);
      if (lamp !== lampOn) {
        lampOn = lamp;
        if (!session.rush) playSound('lampStep', soundOn);
      }
      // The field says what the payout works are doing: whether the hopper's doors are open, and how many towers the
      // tubes are stacking, have waiting or are pushing out.
      const works = `${hopperBusy(session.machine.hopper) ? 'open' : 'shut'} ${session.machine.stacker.tubes.reduce((sum, tube) => sum + towersIn(tube) + (tube.phase === 'pushing' ? 1 : 0), 0)}`;
      if (works !== shownWorks) {
        shownWorks = works;
        [canvas.dataset.hopper, canvas.dataset.tubes] = works.split(' ');
      }
      // A run of the roulette is several turns and only the first is announced. Each is told by its clock starting
      // again, and the ball is heard round the wheel for the whole of it; without motion it is not seen to go round.
      const turn = session.roulette && !session.roulette.bowl && !session.roulette.landed ? session.roulette : null;
      if (turn && (turnClock < 0 || turn.elapsed < turnClock) && turn.elapsed < 0.25 && !calm.matches) {
        playSound('roulette', soundOn, { seconds: turn.duration - turn.elapsed });
      }
      turnClock = turn ? turn.elapsed : -1;
      // The medals that have dropped into their START pockets in this frame, each a ride after the lip's rule counted
      // it. This is when the machine takes a medal, the pocket bursts with light, its word stands over it and its
      // spark sets out for the hold's lamps (render.ts), and so this is when the cabinet is heard to answer. The medal
      // itself has been heard down its tongue and into the pocket, which is how its ride's sound ends. The stage is
      // told first what the machine holds now, since a medal whose spin the screen has taken already has no lamp to
      // send a spark to. The cabinet says each thing once for a frame, however many medals dropped in it: its answer,
      // which is more for a gold one; the light that runs up to the hold, if one sets out; and a dull no for a medal
      // that found the hold full and nothing in it left to turn gold.
      holdShown(stage, session.stock, session.gold);
      const dropped = dropEntries(stage, session.machine.time, calm.matches);
      const said = { start: false, gold: false, spark: false, full: false };
      for (const entry of dropped) {
        if (entry.held || entry.gold) {
          said.start = true;
          if (entry.gold || entry.lucky) said.gold = true;
          if (entry.run >= 0) said.spark = true;
        } else {
          said.full = true;
        }
        // Held through a lit pocket: the spin it holds is gold from the start.
        if (entry.lucky) setAnnouncement(strings.sayLucky);
      }
      if (said.start) playSound('start', soundOn, { gold: said.gold });
      if (said.spark) playSound('spark', soundOn, { seconds: BURST.run });
      if (said.full) playSound('full', soundOn);
      // A medal that came over the lip with some of a START pocket's tongue under it, and not enough, rides out and
      // hangs on the tongue's edge. One that all but fitted hangs there long enough to be seen to rock, and is heard
      // to, from the moment it begins: rocking quicker each time, and over the side into the well. It is the catcher
      // that says which do, as it does for the picture.
      for (const medal of session.machine.medals) {
        if (medal.level !== 0 || medal.sinceDrop < CATCHER.teeter.out || medal.sinceDrop - elapsed >= CATCHER.teeter.out) continue;
        const held = caught(medal, session.machine.time, calm.matches, session.rush);
        if (held && held.leg === 'tongue' && nearness(held, session.rush) >= TEETER_FROM) playSound('teeter', soundOn);
      }
      // The tray is told what this frame did to the purse, by what happened: the medals fed, the day's bonus and the
      // medals won. Where it acts that out, the medals that came in are heard as each is seen to land in it
      // (`landInTray`); where it does not (less motion is asked for) they are heard as they always were, after the
      // fall from the front. Never both: a medal is one medal in the tray.
      if (fedNow.length > 0 || bonus > 0 || won > 0) {
        const arrived: { cause: TrayCause; count: number }[] = [];
        if (bonus > 0) arrived.push({ cause: 'bonus', count: bonus });
        if (won > 0) arrived.push({ cause: 'won', count: won });
        if (!tray.current?.happened({ purse: session.credits, fed: fedNow, arrived }) && bonus + won > 0) playSound('win', soundOn, { count: bonus + won });
      }
      // Each is its own sound: a medal can land in the very frame another goes over the front or off the side.
      if (lost) playSound('lost', soundOn);
      if (landed) {
        // On the bare table a medal rings, and on other medals it is damped: the machine knows which it came down on.
        let down: { tier: number } | undefined;
        for (let index = session.machine.medals.length - 1; index >= 0 && !down; index--) {
          if (airborne.includes(session.machine.medals[index].id)) down = session.machine.medals[index];
        }
        playSound('land', soundOn, down ? { bare: down.tier === 0 } : {});
      }
      // And what the hand feels of it: the one thing in this frame that matters most (haptics.ts). A medal that went
      // in is felt as what fed it said it was when the machine took it: a tick for a press, a slower one for a
      // button that stays held, and nothing for Auto, which no finger is working.
      // A medal through a START pocket is felt as it drops into the pocket, with what is seen and heard of it: that
      // is when the machine says it.
      const felt = hapticFor(events, takeFed(fedBy.current));
      if (felt) buzz(felt, feelNow.current.vibrate, now);

      // The hold's lamps show a spin once its medal's spark has reached them, a moment after the machine has it. The
      // sparks are bound by the count taken before they move; the lamps are drawn by the one taken after, so a spark
      // that gets to its lamp in this frame finds it lit in this frame, under its shine.
      holdShown(stage, session.stock, session.gold);
      trackMedals(stage, session.machine, won);
      ageStage(stage, elapsed, calm.matches);
      const hold = holdCount(stage, session.stock, session.gold);
      // The monitor lights what stands in front of it, in the colour of the mode it is in.
      const glow = monitorGlow(monitorMode(screenState(session, calm.matches)));
      renderer.draw(stage, session.machine, { showGuide: true, calm: calm.matches, stock: hold.stock, gold: hold.gold, wings: session.rush, jewels: session.jewels, glow });

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

      // The ball acts out its lottery: round the wheel while the roulette turns, then down the bowls. Without motion it waits where each begins until it lies in its pocket or its hole.
      if (session.roulette && ball.current) placeLottery(ball.current, session.roulette, calm.matches);

      // The lamps of the hold on the page say what the cabinet's do.
      const nextScreen = { ...screenState(session, calm.matches), golds: hold.gold };
      if (!sameScreen(nextScreen, shownScreen)) {
        const ticking = nextScreen.mode === 'roulette' && nextScreen.banner === 'none' && nextScreen.lit !== shownScreen.lit;
        const hopping = nextScreen.mode === 'sugoroku' && nextScreen.square !== shownScreen.square;
        if (ticking || hopping) playSound(ticking ? 'tick' : 'hop', soundOn);
        shownScreen = nextScreen;
        setScreen(nextScreen);
      }
      const nextHud = { ...hudOf(session), stock: hold.stock };
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
      if (mayKeep()) keep('left');
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [switchedOn, keep, readSave]);

  // While the card is in another tab's machine, the cabinet says so, a moment after (the card goes away for a moment
  // whenever another page takes the day's bonus or the like, and nothing need be said of that).
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = bankState.card === 'away' || (bankState.card === 'asking' && longWait);

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

  const onSweep = (on: boolean) => {
    feel.setSweep(on);
    setAnnouncement(on ? t.saySwingOn : t.saySwingOff);
  };

  const toggleSound = () => {
    if (!sound) void unlockAudio();
    setSound(!sound);
  };

  // The free refill is the medal bank's, for every game at the medal center. A cupful, tipped into the tray: the bank
  // says it was paid, and the tray acts it out (see the seat above).
  const onRefill = () => {
    if (playable(sessionRef.current)) medalBank().refill();
  };

  const onPick = (chest: number) => {
    const session = sessionRef.current;
    if (session) pickChest(session, chest);
  };

  // What is true of where the machine is kept: of the account, and of this device, whose last write may not have taken.
  const savedNote = t[savedNoteFor(status)];

  const registerStrip = (reel: number, element: HTMLDivElement | null) => {
    strips.current[reel] = element;
  };
  const registerBall = (element: HTMLDivElement | null) => {
    ball.current = element;
  };

  return (
    <div className={styles.machine}>
      <div className={styles.cabinet} data-banner={screen.banner}>
        <AchievementToast sound={sound} />
        <div className={styles.bulbs} aria-hidden />
        <div className={`${styles.marquee} ${look.sign}`}>
          <div className={styles.logo} aria-hidden>
            <span className={styles.logoMain}>GOLDEN FEVER</span>
            <span className={styles.logoSub}>ゴールデンフィーバー</span>
          </div>
          <div className={styles.jackpotBox}>
            <span className={styles.jackpotLabel}>{t.jackpot}</span>
            {/* While a jackpot is being counted out the plate counts with it; the jackpot itself has started over by then. */}
            <span className={styles.jackpotValue} data-testid="pusher-jackpot" data-counting={screen.banner === 'jackpot'}>
              {fmt(screen.banner === 'jackpot' ? screen.amount : hud.jackpot)}
            </span>
            <SegmentMirror initial={hud.jackpot} places={JACKPOT_PLACES} tone="amber" />
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
              // A finger may be about to scroll the page instead. It aims once it has shown that it is not: when it
              // drags sideways, or comes up again where it went down (feel.ts).
              if (!aimsOnContact(event.pointerType, window.getComputedStyle(event.currentTarget).touchAction)) {
                waiting.current.set(event.pointerId, { x: event.clientX, y: event.clientY, arm });
                return;
              }
              aimers.current.set(event.pointerId, arm);
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // Without it the drag ends where the pointer leaves the field.
              }
              aimRail(arm, x);
            }}
            onPointerMove={(event) => {
              // A finger that was waiting and has gone sideways is dragging across the field: from here on it aims.
              const began = waiting.current.get(event.pointerId);
              if (began && isSidewaysDrag(event.clientX - began.x, event.clientY - began.y)) {
                waiting.current.delete(event.pointerId);
                aimers.current.set(event.pointerId, began.arm);
              }
              const arm = aimers.current.get(event.pointerId);
              if (arm !== undefined) {
                const x = acrossAt(event);
                if (x !== null) aimRail(arm, x);
              } else if (screen.mode === 'chest' || hoveredChest.current) hoverChest(chestAt(event.clientX, event.clientY), event.currentTarget);
            }}
            onPointerUp={(event) => {
              // A finger that comes up without having scrolled or dragged was a tap: it aims where it is, on the rail
              // of the half it went down on.
              const began = waiting.current.get(event.pointerId);
              waiting.current.delete(event.pointerId);
              const x = began ? acrossAt(event) : null;
              if (began && x !== null) aimRail(began.arm, x);
              aimers.current.delete(event.pointerId);
            }}
            onPointerCancel={(event) => {
              // The browser took the gesture for a scroll: the aim stays where the drag had got to, and no click follows.
              // A finger that had not aimed yet never does: scrolling the page past the cabinet leaves the rails alone.
              waiting.current.delete(event.pointerId);
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
          {/* The member's card is in a machine in another tab: this one stands still until it is played here again. */}
          {cardAway && (
            <div className={styles.cardAway} role="status" data-testid="pusher-card-away">
              <p>{t.cardAway}</p>
              <button type="button" className={styles.cardAwayButton} data-testid="pusher-play-here" onClick={() => seat.current?.play()}>
                {t.playHere}
              </button>
            </div>
          )}
        </div>
        {/* What each line of the slot leads to. There is no room for it on the screen now that the screen is in the cabinet. */}
        <div className={`${styles.legendBelow} ${look.card}`} aria-hidden data-testid="pusher-legend">
          <span className={styles.legend}>
            <span data-tier="seven">{t.legendSeven}</span>
            <span data-tier="big">{t.legendOdd}</span>
            <span data-tier="small">{t.legendEven}</span>
          </span>
        </div>

        {/* The controls: a feed button for each rail at either end, the medals on a plate between them, and under them an aim for each rail. */}
        <div className={`${styles.panel} ${look.plate}`} data-testid="pusher-controls">
          {feedButton(0)}
          {/* The counter and the tray. The number is in type, for whoever reads the page; what is seen is the display
              over it and the heap under it. */}
          <div className={`${styles.credit} ${look.counter}`}>
            <span className={styles.creditLabel}>{t.medals}</span>
            <strong className={styles.creditValue} data-testid="pusher-credits">
              {fmt(hud.credits)}
            </strong>
            <SegmentDisplay value={hud.credits} places={COUNTER_PLACES} />
            <MedalTray ref={tray} credits={hud.credits} onLand={landInTray} />
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
                  onPointerDown={takeOver}
                  onChange={(event) => aimRail(arm, percentAim(Number(event.target.value)))}
                />
                {/* What is printed along the slot: a pip for each START pocket this rail can feed. While the rails swing,
                    a lit arrow over the slot shows where a medal fed now would drop. */}
                <span className={look.scale} aria-hidden>
                  {POCKETS_IN_REACH[arm].map((pocket) => (
                    <i key={pocket} className={look.pocket} style={{ '--mp-at': sliderShare(arm, pocket) } as CSSProperties} />
                  ))}
                  {feel.prefs.sweep && lead && (
                    <i className={look.lead} data-testid={arm === 0 ? 'pusher-lead-left' : 'pusher-lead-right'} data-at={lead[arm]} style={{ '--mp-at': sliderShare(arm, lead[arm]) } as CSSProperties} />
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className={`${styles.toggles} ${look.switches}`}>
            <button type="button" className={styles.toggle} aria-pressed={auto} title={t.autoHint} data-testid="pusher-auto" onClick={() => setAuto(!auto)}>
              <AutoIcon /> {t.auto}
            </button>
            <button type="button" className={styles.toggle} aria-pressed={sound} data-testid="pusher-sound" onClick={toggleSound}>
              <SpeakerIcon on={sound} /> {t.sound}
            </button>
            <SoundSettingsButton control={soundControl} strings={t} />
            <MakersPlate strings={t} />
          </div>
          <FeelControls strings={t} sweep={feel.prefs.sweep} onSweep={onSweep} vibration={feel.motor ? feel.vibrating : null} onVibration={feel.setVibration} />
          <SoundSettingsPanel control={soundControl} strings={t} />
          <FeelNote strings={t} sweep={feel.prefs.sweep} />
          <PanelWarning strings={t} />
        </div>

        <p className={styles.keysNote} data-testid="pusher-keys">
          {t.keysNote}
        </p>

        {hud.credits === 0 && (
          <button type="button" className={`${styles.refill} ${look.attendant}`} data-testid="pusher-refill" onClick={onRefill}>
            {t.refill(START_CREDITS)}
          </button>
        )}
        <PlateSticker />
        <div className={styles.bulbs} aria-hidden />
      </div>

      <BonusStrip />

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
        {/* The medals are not this machine's: they are the medal bank's, and it is at the medal center that they, and
            every machine with them, are reset. */}
        <p className={styles.note} data-testid="pusher-bank-note">
          {t.bankNote}{' '}
          <a className={styles.noteLink} href={MEDAL_CENTER_PATH} data-testid="pusher-center-link">
            {t.bankLink}
          </a>
        </p>
      </section>

      <p className={styles.srOnly} aria-live="polite" data-testid="pusher-announcement">
        {announcement}
      </p>
      {/* The jewel lamps are drawn on the cabinet. This says how many are lit to anyone who cannot see them. */}
      <p className={styles.srOnly} data-testid="pusher-jewels" data-lit={hud.jewels}>
        {t.jewelLamps(hud.jewels, JEWEL.lamps)}
      </p>
    </div>
  );
};
