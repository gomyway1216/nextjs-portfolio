/**
 * The cabinet's sounds. Nothing is downloaded: each sound is worked out from a
 * recipe the first time it is needed — struck metal as a few dying sines and a
 * burst of filtered noise, a jingle from the notes written out below — and kept
 * as a short buffer for the Web Audio API to play back.
 *
 * They are worked out in plain arithmetic rather than with live oscillators so
 * that a test can measure what nobody has been able to listen to: how loud a
 * sound is, where its energy lies, that it begins and ends in silence. It also
 * keeps a falling medal down to two audio nodes.
 *
 * The medals come first. A pusher is the sound of its medals: one going in,
 * one coming down on the table or on the others, and above all the rattle of
 * them into the tray. They are modelled on what a brass medal and the things
 * it strikes do (see `MEDAL` and `BODIES`), and they are played well over the
 * background loop.
 *
 * A real pusher is never silent and almost nothing in it is clean. So the
 * machine itself is always heard: its motor turns with the pusher's stroke,
 * the medals riding on the pusher scrape as it moves, every mechanism has a
 * sound of its own, the jingles come out of a speaker in a cabinet and not
 * out of thin air, and, for whoever wants it, there is the room the cabinet
 * stands in (see `MOTOR`, `RUNS` and `AMBIENCE`).
 *
 * They only play once the player has switched the sound on, which is also the
 * gesture a browser needs before it lets a page make noise.
 */

import { PUSHER } from './engine';

// ── What there is to hear ───────────────────────────────────────────────────

/** Every sound the cabinet makes, the ones heard most often first. */
export const SOUNDS = [
  'land',
  'insert',
  'button',
  'win',
  'tray',
  'lost',
  'roll',
  'gate',
  'full',
  'spin',
  'reelStop',
  'tick',
  'hop',
  'reach',
  'small',
  'big',
  'seven',
  'dice',
  'chest',
  'open',
  'prize',
  'ball',
  'roulette',
  'pocket',
  'tower',
  'cross',
  'crash',
  'fever',
  'jackpot',
  'hopper',
  'shutter',
  'lift',
  'bowl',
  'drop',
  'door',
  'pour',
  'guard',
  'slit',
  'ride',
  'start',
  'spark',
  'teeter',
  'lampStep',
] as const;
export type PusherSound = (typeof SOUNDS)[number];

/** The two notes the background loop is played with, each kept once and played faster or slower for its pitch. */
const LOOP_SAMPLES = ['arp', 'bass'] as const;
type LoopSample = (typeof LOOP_SAMPLES)[number];

/**
 * The tray's rattles: how many medals each one holds. Medals that go over the
 * front together are heard as the rattles that add up to them, so 5 are a
 * rattle of 4 and a single medal, and 30 are rattles of 16, 8, 4 and 2.
 */
export const POURS = [1, 2, 4, 8, 16, 32] as const;
export type Pour = (typeof POURS)[number];
/**
 * Buffers that are not sounds to ask for by name: a medal on the bare table,
 * which is one way a `land` can come out, and the rattles of several medals,
 * which are what a `win` of more than one is made of.
 */
const EXTRA_SAMPLES = [
  'plate',
  'pour2',
  'pour4',
  'pour8',
  'pour16',
  'pour32',
  'buttonUp',
  'liftStop',
  'motor',
  // A door going back up, a shutter opening and a guard rising; the moments of a ball on a wheel and in a bowl; the wheel's rotor.
  'doorShut',
  'shutterOpen',
  'guardUp',
  'shot',
  'lip',
  'settle',
  'bowlLand',
  'rotor',
  // A medal dropping off the end of a tongue into its pocket, and the cabinet's answer to a gold entry.
  'rideDrop',
  'startGold',
] as const;
/** What the room is made of: its own tone, other machines' medals from far off, and scraps of their tunes. */
const ROOM_SAMPLES = ['room', 'farClink', 'farRattle', 'farPour', 'farTune'] as const;
type ExtraSample = (typeof EXTRA_SAMPLES)[number] | (typeof ROOM_SAMPLES)[number];
/** The buffer for each size of rattle. One medal by itself is the `win`. */
export const POUR_SAMPLES: Record<Pour, PusherSound | ExtraSample> = { 1: 'win', 2: 'pour2', 4: 'pour4', 8: 'pour8', 16: 'pour16', 32: 'pour32' };

/** Everything that is kept as a buffer, the medals first: they are worked out in this order once the sound is on. */
export type Sample = PusherSound | ExtraSample | LoopSample;
export const SAMPLES: readonly Sample[] = [
  ...new Set<Sample>(['land', 'plate', 'insert', 'win', 'pour2', 'pour4', 'pour8', 'lost', 'motor', ...SOUNDS, ...EXTRA_SAMPLES, ...LOOP_SAMPLES, ...ROOM_SAMPLES]),
];
/**
 * The buffers that are worked out in the background once the sound is on. The
 * room's are left until the room is asked for, which it is not unless the
 * player switches it on, and `tray` is the `win` under another name.
 */
export const WARMED: readonly Sample[] = SAMPLES.filter((sample) => sample !== 'tray' && !(ROOM_SAMPLES as readonly Sample[]).includes(sample));
/**
 * The buffers that are made to be played round and round: a mechanism running,
 * the pusher's whole stroke, the room's tone. They join up with themselves, so
 * they do not begin and end in silence as everything else does.
 */
export const LOOPING: readonly Sample[] = ['motor', 'roulette', 'lift', 'bowl', 'hopper', 'room', 'pour', 'rotor', 'ride'];

/** What a sound may be told when it is played. */
export interface SoundOptions {
  /** For `spin`: when each reel stops, in seconds from now. Each reel's whirr lasts as long as it turns. */
  stops?: readonly number[];
  /** For `pocket`: how many numbers the roulette's run has reached. The tone climbs with it. */
  level?: number;
  /**
   * For `win` and `tray`: how many medals went into the tray together. Every one of them is heard there.
   * For `hopper` and `pour`: how many medals are paid, at ten a second from a hopper and three dozen a second
   * down a chute, when it is not told how long to run.
   */
  count?: number;
  /**
   * For `land`: whether the medal came down on the bare table rather than on
   * other medals. Left out, it is one or the other by chance, more often the medals.
   */
  bare?: boolean;
  /**
   * For a mechanism that runs (`lift`, `bowl`, `roulette`, `hopper`, `pour`,
   * `ride`): how long it runs, in seconds. A lift ends in its stop, a bowl in
   * the ball dropping through its hole and a ride in the medal dropping into
   * its pocket, at that moment; a roulette has its moments at their shares of
   * it. For `guard`: how long the guard travels before it seats. For `spark`:
   * how long the light takes to reach its lamp.
   */
  seconds?: number;
  /**
   * For a mechanism that runs: how long from now it begins, in seconds. It
   * still ends `seconds` from now. A ball that drops into a bowl is in the
   * air before it rolls.
   */
  after?: number;
  /**
   * For `bowl`: whether the bowl is a funnel, in which the ball goes round
   * faster and faster as the circle tightens, where in a bowl it slows.
   */
  quickens?: boolean;
  /**
   * For `bowl`: when the ball all but goes down a hole that is not its own,
   * in seconds from now. It is heard on that hole's lip.
   */
  nearMiss?: number;
  /** For `start`: whether the entry is a gold one. The cabinet says more about it. */
  gold?: boolean;
  /**
   * Whether the thing is going back up: a `button` let go rather than pressed,
   * a `door` swung up and latched rather than dropped open, a `shutter`
   * opening rather than shutting, a `guard` rising rather than seating.
   */
  up?: boolean;
}

// ── How loud ────────────────────────────────────────────────────────────────

/**
 * Every buffer is brought to a peak of exactly 1, so the gain a sound is played
 * through is the peak it reaches. Nobody could listen to any of this before it
 * was written, so the levels are kept low and were set by measurement against
 * the bare tones the cabinet had before, the only ones anybody had heard.
 */
export const LEVEL = {
  /** No sound is ever played above this: 0.12 of full scale, about −18 dBFS. */
  ceiling: 0.12,
  /** The level the whole cabinet was made at. The player turns it up or down from here: see `VOLUME`. */
  master: 1,
} as const;

/**
 * Everything goes through one compressor, set as a limiter: nothing below the
 * threshold is touched, and above it twelve decibels in come out as one.
 */
export const COMPRESSOR = { threshold: -18, knee: 0, ratio: 12, attack: 0.003, release: 0.25 } as const;

/**
 * A DynamicsCompressorNode turns everything up by itself: by 0.6 of what it
 * would take off a full-scale signal, in decibels. With no knee that is exact.
 * The rule is the Web Audio specification's, and Chrome keeps to it: measured
 * there (version 152), a steady tone leaves the chain at exactly the level it
 * went in at up to 0.39, at 0.43 for a full-scale one and at 0.49 for four of
 * them. No other browser has been measured. One that did not follow the rule
 * would come out quieter, or at the very worst 6.6 dB louder: a jackpot at
 * 0.24 of full scale instead of 0.11.
 */
const MAKE_UP = -0.6 * COMPRESSOR.threshold * (1 - 1 / COMPRESSOR.ratio);

/**
 * The gain in front of the compressor undoes that, so that a sound comes out
 * at the level it was played at. With these settings the chain leaves alone
 * anything that adds up to less than 0.39, and however many sounds pile up the
 * output settles below about 0.5 of full scale (−6 dBFS).
 */
export const MASTER_GAIN = LEVEL.master * 10 ** (-MAKE_UP / 20);

/**
 * How loud the player has the cabinet, as a multiple of the level it was made
 * at: from nothing to twice as loud, which is 6 dB more. Nobody had heard the
 * cabinet when its level was chosen, so the player is given the knob.
 *
 * It is set in front of the compressor, so the limiter's promise holds at any
 * setting. What moves is where the compressor begins to work: on what adds up
 * to 0.39 at the usual volume, and on half that with the volume right up,
 * where a single medal (0.2) and a jackpot (0.22) are still left alone. With
 * the volume right up, the tray as full as it can be comes out at 0.42, a
 * flood no machine could pay at 0.43, and every voice there is at the ceiling
 * and in step, which cannot happen, at 0.51 of full scale (0.48 as made).
 *
 * Those are where it settles. A compressor takes a few thousandths of a second
 * to act, and the first instant of many sounds started together goes by before
 * it has: measured in Chrome with every sound there is started in one instant,
 * ten times a second, over the machine's bed, the loop and the room, the
 * highest sample was 0.47 of full scale as made and 0.57 with the volume right
 * up (0.46 and 0.55 before there was a bed or a room). The hardest play that
 * could be kept up, both rails held with the loop and the room on, peaked at
 * 0.22 and 0.38. Nothing comes near full scale.
 *
 * A change is glided to, with a time constant of `glide` seconds, so that it
 * is not a click, and not a staircase while a slider is being dragged.
 */
export const VOLUME = { least: 0, usual: LEVEL.master, most: 2, glide: 0.03 } as const;

/** The gain in front of the compressor for a volume: `MASTER_GAIN` at the usual one. A volume outside the range is brought into it. */
export const masterGain = (volume: number): number => Math.min(VOLUME.most, Math.max(VOLUME.least, volume)) * 10 ** (-MAKE_UP / 20);

/**
 * The peak each sound is played at. A medal is played a little under it, by a
 * different amount each time. The medals are played as high as anything on the
 * cabinet but a fanfare, and four times as high as the loop: they are what a
 * pusher sounds like. `win` is one medal in the tray; a rattle of more is
 * louder, up to the ceiling for the largest.
 */
export const SOUND_LEVELS: Record<PusherSound, number> = {
  land: 0.1,
  insert: 0.09,
  button: 0.05,
  win: 0.1,
  tray: 0.1,
  lost: 0.08,
  roll: 0.05,
  gate: 0.045,
  full: 0.04,
  spin: 0.015,
  reelStop: 0.08,
  tick: 0.04,
  hop: 0.04,
  reach: 0.06,
  small: 0.075,
  big: 0.075,
  seven: 0.085,
  dice: 0.08,
  chest: 0.06,
  open: 0.06,
  prize: 0.08,
  ball: 0.08,
  roulette: 0.045,
  pocket: 0.07,
  tower: 0.09,
  cross: 0.075,
  crash: 0.1,
  fever: 0.095,
  jackpot: 0.11,
  hopper: 0.085,
  shutter: 0.07,
  lift: 0.045,
  bowl: 0.05,
  drop: 0.07,
  door: 0.08,
  pour: 0.075,
  guard: 0.045,
  slit: 0.07,
  ride: 0.03,
  start: 0.07,
  spark: 0.045,
  teeter: 0.05,
  lampStep: 0.02,
};

/** The peak a rattle of `size` medals is played at: from a single medal's level up to the ceiling. */
export const pourLevel = (size: number): number =>
  SOUND_LEVELS.win + (LEVEL.ceiling - SOUND_LEVELS.win) * (Math.log2(size) / Math.log2(POURS[POURS.length - 1]));

/** The medals themselves, the tray apart: the sounds that come in streams, each a little different from the last. */
const CLINKS: ReadonlySet<PusherSound> = new Set<PusherSound>(['land', 'insert', 'lost', 'roll', 'button', 'slit', 'ride', 'teeter']);

/**
 * The machine itself, which is never still. Its motor, the pusher the motor
 * drives and the medals riding on the pusher are one buffer as long as one
 * stroke, and it is played in step with the stroke: in stretches of `stretch`
 * seconds, each begun where the machine's own clock says the pusher is, and
 * faded into the next over `overlap`. `level` is the peak, which is the clunk
 * at the back of the stroke; the hum and the scrape under it peak at two
 * thirds of that and average about a tenth of it. A stretch is lined up
 * `lead` seconds before the last one begins to fade. Measured in Chrome, the
 * clunks are heard 0.03 s after the pusher turns, which is the sound card.
 */
export const MOTOR = {
  level: 0.04,
  stretch: 1.2,
  overlap: 0.08,
  lead: 0.12,
  /** The hum of the motor and the whine of its gears, in hertz, and how strong each is. */
  partials: [
    [100, 0.25],
    [200, 0.2],
    [300, 0.45],
    [450, 0.12],
    [600, 0.22],
    [900, 0.1],
  ],
  /** How loud the hum and the whine are beside the clunk at the back of the stroke. */
  hum: 0.33,
  /** How far the whine falls as the pusher shoves the medals, and rises as it comes back light: 2.5% either way. */
  sag: 27,
} as const;

/**
 * A hopper throws out about `rate` medals a second. A payout too big for one
 * to get through in `fair` seconds is shared between as many as it takes, up
 * to three, which is a sheet of medals rather than a string of them: each
 * joins `apart` seconds after the one before and leaves as long before it, at
 * its own speed and level. However many medals, it is heard for at most
 * `longest` seconds.
 */
export const HOPPER = { rate: 10, loop: 2.4, fair: 4, longest: 8, apart: 0.3, speeds: [1, 1.09, 0.93], levels: [1, 0.7, 0.55] } as const;

/** Down a chute the medals come three dozen a second, in a rush too thick to count. */
export const CHUTE = { rate: 36, loop: 2 } as const;

/**
 * The rotor of the roulette's wheel, which turns for as long as the wheel is
 * in play, however many turns the ball has: like the machine's own bed it is
 * asked for once a frame (`turnRotor`) and played a stretch at a time, each
 * taken up exactly where the last left off.
 */
export const ROTOR = { level: 0.028, stretch: 0.5, overlap: 0.08, lead: 0.1 } as const;

/**
 * How long a guard travels before it seats when nobody says: one way, and back. The sound was a lift's guard's when
 * towers came up through the deck; it is the gate at the foot of a tower's window now, sliding aside and shut.
 */
export const GUARD = { up: 0.5, down: 0.45 } as const;

/**
 * An entry: a medal that came over the lip squarely on a tongue. It rides
 * the tongue (`ride`), drops off the end into its pocket (`drop`, which the
 * ride ends in), the cabinet answers (`start`, and `gold` for a gold one),
 * and a light runs up to its lamp in the HOLD row (`spark`, in `seconds`
 * when nobody says). The drop and the answer are the loudest things in it,
 * and a near miss (`teeter`) is quieter than either.
 */
export const ENTRY = {
  drop: { sample: 'rideDrop', level: 0.065 },
  gold: { sample: 'startGold', level: 0.08 },
  spark: { seconds: 0.35 },
} as const;

/** No mechanism runs for less or for longer than this, in seconds, whatever it is asked. See `RUNS`. */
export const RUN = { shortest: 0.3, longest: 12 } as const;

/**
 * The room the cabinet stands in: the floor of an arcade as it is heard from
 * one machine. Its own tone, which is air and a murmur with nothing in it that
 * can be told apart; other machines' medals, far off; and a few notes of their
 * tunes, made up note by note by the roll of a die so that they are nobody's.
 * Each kind comes at random, on average every so many seconds, in one of
 * several takes, at its own speed and level, so that it never comes round
 * again the same and has no beat to nag with. It is off unless the player
 * switches it on, and nothing in it is as loud as a medal of the player's own.
 */
export const AMBIENCE = {
  /** The most any one far-off sound is played at. */
  level: 0.03,
  every: 0.25,
  ahead: 0.6,
  /**
   * The most of its sources that may be sounding or waiting at once, the
   * stretches of its tone among them. Two of those overlap while one fades
   * into the next, so `kept` places are the tone's and what comes from far
   * off has the rest.
   */
  voices: 8,
  kept: 2,
  /**
   * The room's own tone: its level, the length of a stretch of it and of the
   * fade from one stretch into the next, and how far the speed of a stretch
   * wanders. A stretch is shorter than the buffer it is taken from, and starts
   * anywhere in it, so that none is heard to come round.
   */
  room: { level: 0.02, seconds: 5.5, cross: 1.5, wander: 0.24 },
  /** How long it is, on average, from one of a kind to the next. */
  gaps: { farClink: 1.3, farRattle: 4, farPour: 13, farTune: 11 },
  /** How far a far-off sound's level and speed wander. */
  wander: { level: 0.65, speed: 0.4 },
} as const;

export const LIMITS = {
  /** No more than this many clinks of one kind — going in, landing, lost — start within `window` seconds, evenly spaced. */
  clinks: 3,
  window: 0.1,
  /** Sounds in the air at once, the loop's notes apart. One more cuts the oldest short. */
  voices: 24,
  /** How many of those a medal may not take, so that a stream of medals never crowds out a jingle. */
  kept: 8,
  /**
   * Sources of the tray, single medals and rattles alike, that may be sounding
   * or waiting at once. The busier the tray, the larger a rattle has to be to
   * start: the first five sources may be single medals, the next has to hold
   * two, the next four, and the last thirty-two.
   */
  tray: 10,
  /** Medals that may be waiting to be heard in the tray. More than that at once is no louder. */
  owed: 64,
  /** Two of the same sound never start closer together than this, so that they cannot double up in step. */
  gap: 0.08,
  /** The lamps and the piece on the board come faster than that. */
  quickGap: 0.03,
} as const;

/**
 * How far a clink's pitch and level wander from one medal to the next, and how
 * late it may start: the game says what happened once a frame, and medals that
 * all struck on the frame would be a machine gun, not a machine.
 */
export const WANDER = { pitch: 0.1, level: 0.3, late: 0.012 } as const;

/**
 * The tray. A medal is heard in it `fall` seconds after it goes over the
 * front, give or take. Its sources start no closer together than `spacing`,
 * so that no two strike in step, and are never lined up further ahead than
 * `ahead`; one win starts at most `atOnce` of them, at a level that wanders
 * down by `wander`; and medals still owed when nothing has been won for
 * `forget` seconds are forgotten.
 */
export const TRAY = { fall: [0.1, 0.18], spacing: 0.03, ahead: 0.3, atOnce: 4, wander: 0.2, forget: 0.6 } as const;

/** How often a medal that lands finds the bare table under it, when nobody says. */
const BARE_SHARE = 0.25;

// ── The notes ───────────────────────────────────────────────────────────────

export interface Note {
  /** When it starts and how long it is held, in seconds. */
  at: number;
  length: number;
  /** Its pitch, in hertz. */
  hz: number;
}

/** What plays a line: a bright lead, a softer second voice under it, a bass, a hollow pulse, or a struck bell. */
export type Voice = 'lead' | 'second' | 'bass' | 'pulse' | 'bell';

export interface Part {
  voice: Voice;
  level: number;
  notes: Note[];
}

export interface Score {
  parts: Part[];
  /** The seconds its notes take, and how long the last of them is left to ring. */
  length: number;
  tail: number;
}

const SEMITONES: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** The frequency of a note written like `A4`, `F#5` or `Bb3`. */
export function pitch(name: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!match) throw new Error(`not a note: ${name}`);
  const semitones = SEMITONES[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + (Number(match[3]) - 4) * 12;
  return 440 * 2 ** (semitones / 12);
}

/**
 * A line of notes, one after another, `step` seconds to a step: `G5` lasts one
 * step, `G5:3` three, `-:2` is a rest of two, and a `|` only marks a bar.
 */
function line(step: number, text: string): Note[] {
  const notes: Note[] = [];
  let at = 0;
  for (const token of text.split(/\s+/)) {
    if (token === '' || token === '|') continue;
    const [name, steps = '1'] = token.split(':');
    const length = Number(steps) * step;
    if (!(length > 0)) throw new Error(`not a length: ${token}`);
    if (name !== '-') notes.push({ at, length, hz: pitch(name) });
    at += length;
  }
  return notes;
}

function score(step: number, tail: number, parts: [voice: Voice, level: number, text: string][]): Score {
  const built = parts.map(([voice, level, text]) => ({ voice, level, notes: line(step, text) }));
  const length = Math.max(...built.flatMap((part) => part.notes.map((note) => note.at + note.length)));
  return { parts: built, length, tail };
}

/**
 * The jingles. Three lines can come up on the reels and each has its own: a
 * skipping one in C for the sugoroku, one that climbs in A minor and stops on
 * an unresolved chord for the treasure, three hammered notes and a rising
 * triad for the sevens. The fanfares have three voices and a bass; the jackpot
 * is the longest thing the cabinet plays.
 */
export const SCORES = {
  // A medal through a chucker: two bells, a fourth apart.
  gate: score(0.075, 0.45, [['bell', 1, 'B5 E6:4']]),
  // An entry: up a fourth on to the key note, which is an answer and not a question. The call is two notes, and it is
  // played twice over: by the bell, and an octave down at a third of the bell's level, where a small speaker is
  // strongest, so that a phone has more of it than the top of a bell. A gold entry is `GOLD_START`.
  start: score(0.07, 0.4, [
    ['bell', 1, 'G6 C7:4'],
    ['second', 0.3, 'G5 C6:3'],
  ]),
  // Two reels alike and the third still turning: a climb by half steps, the bass knocking under it.
  reach: score(0.13, 0.08, [
    ['pulse', 1, 'E5 F5 F#5 G5 G#5 A5 A#5 B5 C6 C#6'],
    ['bass', 0.5, 'E3 -:1 E3 -:1 E3 -:1 E3 -:1 E3 -:1'],
  ]),
  small: score(0.1, 0.12, [
    ['lead', 1, 'C6 E6 G6 E6 C7:3'],
    ['second', 0.5, 'E5 G5 C6 G5 E6:3'],
    ['bass', 0.55, 'C4:2 G3:2 C4:3'],
  ]),
  big: score(0.1, 0.12, [
    ['lead', 1, 'A5 C6 E6 A6:2 G#6 B6:3'],
    ['second', 0.5, 'E5 A5 C6 E6:2 E6 G#6:3'],
    ['bass', 0.55, 'A3:3 A3:2 E3 E3:3'],
  ]),
  seven: score(0.1, 0.14, [
    ['lead', 1, 'C6 C6 C6 E6:2 G6:2 C7:4'],
    ['second', 0.5, 'G5 G5 G5 C6:2 E6:2 G6:4'],
    ['bass', 0.55, 'C3 C3 C3 C3:2 G3:2 C4:4'],
  ]),
  // The chests come up: a run of bells over a low one, in a key that asks a question.
  chest: score(0.07, 0.5, [
    ['bell', 1, 'E5 G5 B5 D6 F#6 B6:5'],
    ['bell', 0.5, 'E4:10'],
  ]),
  prize: score(0.085, 0.3, [
    ['lead', 1, 'G5 C6 E6 G6:3'],
    ['second', 0.5, 'E5 G5 C6 E6:3'],
    ['bass', 0.55, 'C4:3 C4:3'],
    ['bell', 0.45, '-:3 G6 C7:2'],
  ]),
  // A ball over the front: a call in G, away from the key of the prizes, because the roulette is next.
  ball: score(0.08, 0.14, [
    ['lead', 1, 'D6 G6 B6 D7:2 B6 D7:4'],
    ['second', 0.5, 'B5 D6 G6 B6:2 G6 B6:4'],
    ['bass', 0.55, 'G3:3 G3:2 D3 G3:5'],
  ]),
  fever: score(0.095, 0.3, [
    ['lead', 1, 'E6 G6 C7 G6 E6 G6 C7:2 | D6 G6 B6 G6 C7:5'],
    ['second', 0.5, 'C6 E6 G6 E6 C6 E6 G6:2 | B5 D6 G6 D6 E6:5'],
    ['bass', 0.55, 'C3:2 C3:2 E3:2 G3:2 | G3:2 G3:2 C3:5'],
    ['bell', 0.4, '-:12 C7 E7 G7:3'],
  ]),
  jackpot: score(0.11, 0.35, [
    ['lead', 1, 'G5 C6 E6 G6 G6:2 E6 G6 | A5 C6 F6 A6 A6:2 F6 A6 | B5 D6 G6 B6 B6:2 G6 B6 | C7:3 G6 C7:2 G6 C7:6'],
    ['second', 0.5, 'E5 G5 C6 E6 E6:2 C6 E6 | F5 A5 C6 F6 F6:2 C6 F6 | G5 B5 D6 G6 G6:2 D6 G6 | E6:3 E6 E6:2 E6 E6:6'],
    ['bass', 0.55, 'C3:2 C3:2 G3:2 C3:2 | F3:2 F3:2 C3:2 F3:2 | G3:2 G3:2 D3:2 G3:2 | C3:3 G3 C3:2 G3 C3:6'],
    ['bell', 0.4, '-:24 C6 E6 G6 C7 E7 G7 C7 E7 G7:5'],
  ]),
} satisfies Partial<Record<PusherSound, Score>>;

/** The tone for each number the roulette's run reaches: up a five-note scale, so that the sixth is the first again an octave up. */
export const POCKET_NOTES: readonly number[] = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6'].map(pitch);

/** Set to false to leave the background loop out altogether. */
export const MUSIC_ON = true;

const BAR = 8;
const MUSIC_STEP = 0.25;

/**
 * The background loop: eight bars of broken chords over a bass, at 120 beats a
 * minute, played very quietly. It is scheduled a little at a time (`ahead`
 * seconds, looked at every `every` seconds) so that it can be stopped at once.
 * While a rattle of medals is falling into the tray it drops to `ducked` of
 * its level, over `duck` seconds, and comes back over `swell` once they have
 * settled. A single medal is heard over it as it is.
 */
export const MUSIC = {
  bars: 8,
  length: 8 * BAR * MUSIC_STEP,
  ahead: 0.3,
  every: 0.1,
  /** The most of its notes that may be sounding or waiting at once. */
  voices: 12,
  ducked: 0.35,
  duck: 0.03,
  swell: 0.15,
  parts: [
    {
      sample: 'arp',
      level: 0.011,
      notes: line(
        MUSIC_STEP,
        'C5 E5 G5 C6 G5 E5 G5 E5 | A4 C5 E5 A5 E5 C5 E5 C5 | F4 A4 C5 F5 C5 A4 C5 A4 | G4 B4 D5 G5 D5 B4 D5 B4 | ' +
          'C5 G5 E5 C6 E5 G5 E5 G5 | B4 E5 G5 B5 G5 E5 G5 E5 | F4 C5 A4 F5 A4 C5 A4 C5 | G4 D5 B4 G5 B4 D5 F5 D5',
      ),
    },
    {
      sample: 'bass',
      level: 0.015,
      notes: line(MUSIC_STEP, 'C3:4 G3:4 | A2:4 E3:4 | F2:4 C3:4 | G2:4 D3:4 | C3:4 G3:4 | E3:4 B2:4 | F2:4 C3:4 | G2:4 G2:2 B2:2'),
    },
  ] satisfies { sample: LoopSample; level: number; notes: Note[] }[],
} as const;

/** The pitch each of the loop's two notes is kept at. */
const REFERENCE: Record<LoopSample, number> = { arp: pitch('C5'), bass: pitch('C3') };

/** The loop as one list, in the order it is played. */
const LOOP = MUSIC.parts
  .flatMap((part) => part.notes.map((note) => ({ at: note.at, sample: part.sample, level: part.level, speed: note.hz / REFERENCE[part.sample] })))
  .sort((a, b) => a.at - b.at);

/** The fanfares the loop falls silent for, rather than play on under them in another tempo. */
const RESTS: ReadonlySet<PusherSound> = new Set<PusherSound>(['fever', 'jackpot']);

// ── Working a sound out ─────────────────────────────────────────────────────

/** A stretch of sound being put together: its samples and how many of them make a second. */
interface Take {
  out: Float32Array;
  rate: number;
}

const TURN = Math.PI * 2;
/** Nothing is asked to sound above this, in hertz: a harmonic that would is left out. */
const TOP = 9000;
/** Nor above what the samples can carry, where a sound card runs slowly (a telephone headset does). */
const top = (rate: number, limit: number = TOP): number => Math.min(limit, rate * 0.45);
/** Nothing is left below this: a small speaker cannot play it and a large one should not have to. */
const BOTTOM = 60;

const take = (seconds: number, rate: number): Take => ({ out: new Float32Array(Math.ceil(seconds * rate)), rate });

/** Noise that comes out the same every time, so that a sound does too. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

/** A level that dies away, falling to about a third (1/e) in `ring` seconds. */
const dying =
  (ring: number, level = 1) =>
  (seconds: number): number =>
    level * Math.exp(-seconds / ring);

/** A level that comes up over `attack` seconds and then dies away. */
const swell =
  (attack: number, ring: number, level = 1) =>
  (seconds: number): number =>
    level * (seconds < attack ? seconds / attack : Math.exp(-(seconds - attack) / ring));

/**
 * One mode of something that has been struck: a sine that dies away. It is
 * drawn as a point going round a shrinking circle, so there is no sine to work
 * out for each sample. One that would lie above `limit` is left out.
 */
function ping(t: Take, at: number, hz: number, level: number, ring: number, limit: number = TOP): void {
  const { out, rate } = t;
  if (hz >= top(rate, limit)) return;
  const start = Math.max(0, Math.round(at * rate));
  const end = Math.min(out.length, start + Math.ceil(ring * 7 * rate));
  const shrink = Math.exp(-1 / (ring * rate));
  const angle = (TURN * hz) / rate;
  const cos = Math.cos(angle) * shrink;
  const sin = Math.sin(angle) * shrink;
  let x = level;
  let y = 0;
  for (let i = start; i < end; i++) {
    out[i] += y;
    const next = x * cos - y * sin;
    y = x * sin + y * cos;
    x = next;
  }
}

/** A sine whose pitch slides from `from` to `to` over `slide` seconds and stays there, at the level `level` gives it. */
function glide(t: Take, at: number, length: number, from: number, to: number, slide: number, level: (seconds: number) => number): void {
  const { out, rate } = t;
  const start = Math.max(0, Math.round(at * rate));
  const count = Math.min(out.length - start, Math.ceil(length * rate));
  let phase = 0;
  for (let i = 0; i < count; i++) {
    const seconds = i / rate;
    out[start + i] += Math.sin(phase) * level(seconds);
    phase += (TURN * from * (to / from) ** Math.min(1, seconds / slide)) / rate;
  }
}

interface Filter {
  /** What it lets through: a band around `hz`, or everything below it. */
  kind: 'band' | 'low';
  hz: number;
  /** Where the filter has moved to by the end, if it moves. */
  to?: number;
  q: number;
}

/**
 * Noise through a filter. `level` is roughly how loud it comes out, whatever
 * the filter: a narrow band lets little through, and that is made up for.
 */
function hiss(t: Take, at: number, length: number, level: (seconds: number) => number, filter: Filter, seed: number): void {
  const { out, rate } = t;
  const random = noise(seed);
  const start = Math.max(0, Math.round(at * rate));
  const count = Math.min(out.length - start, Math.ceil(length * rate));
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  let scale = 1;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < count; i++) {
    if (i === 0 || (filter.to !== undefined && i % 32 === 0)) {
      const hz = Math.min(rate * 0.45, filter.to === undefined ? filter.hz : filter.hz * (filter.to / filter.hz) ** (i / count));
      const angle = (TURN * hz) / rate;
      const cos = Math.cos(angle);
      const alpha = Math.sin(angle) / (2 * filter.q);
      if (filter.kind === 'band') {
        b0 = alpha / (1 + alpha);
        b1 = 0;
        b2 = -b0;
      } else {
        b0 = (1 - cos) / 2 / (1 + alpha);
        b1 = 2 * b0;
        b2 = b0;
      }
      a1 = (-2 * cos) / (1 + alpha);
      a2 = (1 - alpha) / (1 + alpha);
      // The share of the noise's power that gets through, and the 0.577 that even noise between −1 and 1 measures.
      const share = Math.min(1, ((filter.kind === 'band' ? (Math.PI / 2) * (hz / filter.q) : 1.11 * hz) * 2) / rate);
      scale = 1 / (0.577 * Math.sqrt(share));
    }
    const x = random();
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[start + i] += y * scale * level(i / rate);
  }
}

/** How a held note is built. */
interface Timbre {
  /** How strong each harmonic is, from the note itself upwards. */
  harmonics: readonly number[];
  /** A second copy this much sharp thickens the note; 1 for none. */
  spread: number;
  /** The seconds it takes to come in and to let go. */
  attack: number;
  release: number;
  /** The level it sags to while it is held, and how quickly. */
  body: number;
  sag: number;
}

const TIMBRES: Record<Exclude<Voice, 'bell'>, Timbre> = {
  lead: { harmonics: [1, 0.5, 0.33, 0.25, 0.2], spread: 1.005, attack: 0.008, release: 0.05, body: 0.6, sag: 0.12 },
  second: { harmonics: [1, 0.35, 0.15], spread: 1, attack: 0.01, release: 0.05, body: 0.65, sag: 0.12 },
  bass: { harmonics: [1, 0.6, 0.4, 0.25, 0.12], spread: 1, attack: 0.006, release: 0.04, body: 0.5, sag: 0.15 },
  pulse: { harmonics: [1, 0, 0.33, 0, 0.2, 0, 0.14], spread: 1, attack: 0.004, release: 0.03, body: 0.7, sag: 0.08 },
};
/** The cross's buzzer: every harmonic, held flat. */
const BUZZ: Timbre = { harmonics: [1, 0.7, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15], spread: 1, attack: 0.012, release: 0.08, body: 1, sag: 1 };
/** The loop's bass: plucked, so it needs no letting go. */
const PLUCK: Timbre = { harmonics: [1, 0.5, 0.3, 0.15], spread: 1, attack: 0.008, release: 0.1, body: 0.05, sag: 0.3 };

/**
 * A note that is held: its harmonics, each a sine, under one rise and fall.
 * Whatever its harmonics, it carries the power of a single sine of `level`, so
 * that the levels of the parts in a score say how loud each is beside the others.
 */
function tone(t: Take, at: number, hz: number, length: number, level: number, timbre: Timbre): void {
  const { out, rate } = t;
  const start = Math.max(0, Math.round(at * rate));
  const count = Math.min(out.length - start, Math.ceil((length + timbre.release) * rate));
  if (count <= 0) return;
  const held = length * rate;
  const attack = Math.max(1, timbre.attack * rate);
  const release = Math.max(1, timbre.release * rate);
  const sag = Math.exp(-1 / (timbre.sag * rate));
  const shape = new Float32Array(count);
  let above = 1 - timbre.body;
  for (let i = 0; i < count; i++) {
    shape[i] = Math.min(1, i / attack) * (timbre.body + above) * (i < held ? 1 : Math.max(0, 1 - (i - held) / release));
    above *= sag;
  }
  const partials: [hz: number, weight: number][] = [];
  for (const [copy, share] of timbre.spread === 1 ? [[1, 1]] : [[1, 1], [timbre.spread, 0.6]]) {
    timbre.harmonics.forEach((weight, index) => {
      if (weight > 0 && hz * copy * (index + 1) < top(rate)) partials.push([hz * copy * (index + 1), weight * share]);
    });
  }
  const total = Math.sqrt(partials.reduce((sum, [, weight]) => sum + weight * weight, 0));
  for (const [partial, weight] of partials) {
    const angle = (TURN * partial) / rate;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let x = (level * weight) / total;
    let y = 0;
    for (let i = 0; i < count; i++) {
      out[start + i] += y * shape[i];
      const next = x * cos - y * sin;
      y = x * sin + y * cos;
      x = next;
    }
  }
}

/** A struck bell: the note, its octave and the one above that, and a touch of a bar's own overtone, each dying sooner than the one below. */
const BELL: readonly [ratio: number, weight: number, life: number][] = [
  [1, 0.62, 1],
  [2, 0.22, 0.55],
  [3, 0.1, 0.35],
  [2.76, 0.06, 0.25],
];

function bell(t: Take, at: number, hz: number, level: number, ring: number): void {
  for (const [ratio, weight, life] of BELL) ping(t, at, hz * ratio, level * weight, ring * life);
}

/**
 * The medal, and what it rings like. A free disc rings in modes that are not
 * harmonics of one another: one with two nodal diameters, one with a nodal
 * circle 1.73 times higher, one with three diameters 2.33 times higher. The
 * lowest is f = 5.25 · h / (2π a²) · √(E / 12ρ(1 − ν²)) for a thickness h and
 * a radius a, which for brass 1.5 mm thick is about 9 kHz at 25 mm across and
 * 6 kHz at 30 mm. This is the larger medal, at the bottom of that range: the
 * ear and a small speaker both do better at 6 kHz than at 9.
 */
export const MEDAL = {
  hz: 6300,
  modes: [1, 1.73, 2.33],
  weights: [1, 0.5, 0.3],
  /** How long each mode lasts beside the lowest. */
  lives: [1, 0.6, 0.4],
  /** Its modes are let up to here, well above anything else on the cabinet: they are what makes it a coin. */
  top: 16000,
} as const;

/**
 * A medal struck. The strike itself is a millisecond of noise right across the
 * top of the spectrum; the ring it sets off lasts as long as whatever the medal
 * lies against lets it. No medal is perfectly round, so each mode with nodal
 * diameters is really two, a fraction of a percent apart (a different fraction
 * for every strike), and they beat: the waver in a coin's ring. `strike` is
 * how hard the edge of the hit is.
 */
function coin(t: Take, at: number, hz: number, level: number, ring: number, seed: number, strike = 1): void {
  const apart = 1.003 + (seed % 5) * 0.0008;
  MEDAL.modes.forEach((ratio, mode) => {
    const weight = level * MEDAL.weights[mode];
    const life = ring * MEDAL.lives[mode];
    ping(t, at, hz * ratio, weight, life, MEDAL.top);
    if (mode !== 1) ping(t, at, hz * ratio * apart, weight * 0.5, life * 0.85, MEDAL.top);
  });
  hiss(t, at, 0.006, dying(0.001, level * strike * 0.5), { kind: 'band', hz: 7000, q: 0.5 }, seed);
}

/**
 * What a medal can land on. Sheet metal and a heap of medals have far too many
 * modes to count, so most of the answer is noise in the band where the thing
 * is resonant (`hz`, `q`), as loud as `loud` and dying as fast as it is damped
 * (`ring`): a clank with no note to it. Under and through that are the few
 * modes that can be told apart, each a frequency, a weight and a life. They
 * never change, which is what makes a tray the same tray every time.
 */
interface Body {
  hz: number;
  q: number;
  loud: number;
  ring: number;
  modes: readonly (readonly [hz: number, weight: number, ring: number])[];
}

const BODIES = {
  // The tray: sheet steel, boxy, between 1 and 3 kHz. It is far bigger than a medal and so far louder, struck by the
  // same blow: many medals strike it together, and that is most of what a rattle is.
  tray: { hz: 1900, q: 1, loud: 1.5, ring: 0.024, modes: [[520, 0.4, 0.02], [1180, 0.6, 0.018], [2460, 0.5, 0.012]] },
  // The pusher's table: a thick steel plate. It is too heavy to ring for long, but it is steel, and says so.
  table: { hz: 1300, q: 1.2, loud: 1, ring: 0.006, modes: [[420, 0.5, 0.012], [1740, 0.22, 0.011], [2910, 0.14, 0.008]] },
  // The throat of the slot: thin metal, higher and shorter.
  chute: { hz: 2700, q: 1.4, loud: 1.2, ring: 0.008, modes: [[900, 0.3, 0.006], [3300, 0.3, 0.007]] },
  // The gutter down the side: plastic. It takes the hit and gives back a knock.
  gutter: { hz: 800, q: 1, loud: 0.8, ring: 0.012, modes: [[210, 0.6, 0.028]] },
  // A pile of other medals: they chatter against one another for a few milliseconds, all over the place.
  pile: { hz: 4200, q: 0.7, loud: 1.6, ring: 0.005, modes: [[950, 0.3, 0.005]] },
  // A plastic rail under a medal's edge.
  rail: { hz: 1700, q: 1.5, loud: 0.35, ring: 0.0015, modes: [[600, 0.4, 0.002]] },
  // The steel sheet a hopper throws its medals onto.
  sheet: { hz: 2400, q: 1.1, loud: 1.1, ring: 0.014, modes: [[760, 0.4, 0.016], [1650, 0.5, 0.012]] },
} satisfies Record<string, Body>;

/** The answer of what was struck. */
function answer(t: Take, at: number, body: Body, level: number, seed: number): void {
  hiss(t, at, body.ring * 5, dying(body.ring, level * body.loud), { kind: 'band', hz: body.hz, q: body.q }, seed);
  for (const [hz, weight, ring] of body.modes) ping(t, at, hz, level * weight, ring);
}

/** Every strike begins a millisecond in, clear of the half millisecond in which a take comes up from silence. */
const LEAD = 0.001;

/**
 * Rounds off the top of a take. The loudest instant of a strike is a peak or
 * two of noise in its first millisecond, far above the ring that follows.
 * With those rounded off, the ring behind them can be played nearly twice as
 * loud under the same ceiling. What lies well below `knee` of the peak is all
 * but untouched.
 */
function rounded(t: Take, knee = 0.6): Take {
  const { out } = t;
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const limit = peak * knee;
  if (limit > 0) for (let i = 0; i < out.length; i++) out[i] = limit * Math.tanh(out[i] / limit);
  return t;
}

/** Lets through what lies below `hz`, or what lies above it: two poles, over the whole take. */
function sieve(t: Take, keep: 'below' | 'above', hz: number): void {
  const { out, rate } = t;
  const angle = (TURN * Math.min(hz, rate * 0.45)) / rate;
  const cos = Math.cos(angle);
  const alpha = Math.sin(angle) / Math.SQRT2;
  const b0 = (keep === 'below' ? (1 - cos) / 2 : (1 + cos) / 2) / (1 + alpha);
  const b1 = keep === 'below' ? 2 * b0 : -2 * b0;
  const a1 = (-2 * cos) / (1 + alpha);
  const a2 = (1 - alpha) / (1 + alpha);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
}

/** Copies of a take that come back a little later and quieter, as off the walls of a small space. */
function reflect(t: Take, taps: readonly (readonly [seconds: number, level: number])[]): void {
  const { out, rate } = t;
  const dry = out.slice();
  for (const [seconds, level] of taps) {
    const shift = Math.round(seconds * rate);
    for (let i = shift; i < out.length; i++) out[i] += dry[i - shift] * level;
  }
}

/** What a sound from the cabinet's speaker comes back off: the cabinet's own glass and the machine beside it. */
const CABINET = [
  [0.0061, 0.24],
  [0.0113, 0.16],
  [0.0197, 0.1],
] as const;

/**
 * A jingle does not come out of thin air. It comes out of a speaker in a
 * cabinet, which has no bottom octave and not much top, and it is heard with
 * the cabinet round it.
 */
function speaker(t: Take): void {
  sieve(t, 'above', 150);
  sieve(t, 'below', 7500);
  reflect(t, CABINET);
}

/**
 * A big room heard from across it: the take is smeared into a tail that dies
 * away over `seconds`, and `wet` is how much of what is left is tail. Four
 * echoes that go round and round, each at its own length, and two stages that
 * blur the echoes' own rhythm.
 */
function distance(t: Take, seconds: number, wet: number): void {
  const { out, rate } = t;
  const dry = out.slice();
  const tail = new Float32Array(out.length);
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const length = Math.max(1, Math.round((ms / 1000) * rate));
    const back = 10 ** ((-3 * ms) / 1000 / seconds);
    const line = new Float32Array(length);
    let at = 0;
    for (let i = 0; i < out.length; i++) {
      const was = line[at];
      line[at] = dry[i] + was * back;
      at = at + 1 === length ? 0 : at + 1;
      tail[i] += was * 0.25;
    }
  }
  for (const ms of [5, 1.7]) {
    const length = Math.max(1, Math.round((ms / 1000) * rate));
    const line = new Float32Array(length);
    let at = 0;
    for (let i = 0; i < tail.length; i++) {
      const was = line[at];
      const into = tail[i] + was * 0.7;
      line[at] = into;
      at = at + 1 === length ? 0 : at + 1;
      tail[i] = was - into * 0.7;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = dry[i] * (1 - wet) + tail[i] * wet;
}

/** How a sound is changed by coming from far off across the floor: its top is gone, twice over, and the room has got into it. */
const FAR = { top: 4500 } as const;
function far(t: Take, seconds: number): Take {
  sieve(t, 'below', FAR.top);
  sieve(t, 'below', FAR.top);
  distance(t, seconds, 0.6);
  return t;
}

/**
 * Makes a take go round: its last `cross` seconds are faded out over its
 * first, which are faded in, and then cut off, so that the end runs into the
 * beginning. What repeats exactly over the length that is left is not changed.
 */
function looped(t: Take, cross: number): Take {
  const { out, rate } = t;
  const over = Math.round(cross * rate);
  const length = out.length - over;
  for (let i = 0; i < over; i++) out[i] = out[i] * (i / over) + out[length + i] * (1 - i / over);
  return { out: out.slice(0, length), rate };
}

/** A guard, which is the gate at the foot of a tower's window: it slides in its guides for `travel` seconds and seats with a soft clack, plastic on rubber. */
function guardOf(rate: number, travel: number, rising: boolean): Take {
  const t = take(travel + 0.14, rate);
  const slide = (seconds: number) => 0.14 * Math.min(1, seconds / 0.04, (travel - seconds) / 0.04);
  hiss(t, LEAD, travel, slide, { kind: 'band', hz: rising ? 1100 : 1500, to: rising ? 1500 : 1100, q: 1.2 }, rising ? 331 : 332);
  const seats = LEAD + travel;
  glide(t, seats, 0.1, rising ? 380 : 300, rising ? 300 : 230, 0.03, dying(0.018));
  hiss(t, seats, 0.012, dying(0.003, 0.3), { kind: 'band', hz: 1700, q: 0.9 }, 333);
  ping(t, seats, rising ? 900 : 760, 0.25, 0.006);
  return t;
}

/** One strike of a medal in the tray: when, at what pitch, how hard, how long it rings, and which bounce of its medal it is. */
export interface Hit {
  at: number;
  hz: number;
  level: number;
  ring: number;
  bounce: number;
}

/** How a rattle is spread out: `count` medals arrive over `spread · count ^ power` seconds, and its last strike is left `tail` to ring. */
const POUR = { spread: 0.045, power: 0.8, tail: 0.2 } as const;

/**
 * The strikes of `count` medals coming into the tray, in the order they are
 * heard, the same every time for the same `seed`. The first medal strikes at
 * once; the rest arrive over a time that grows with their number, most of them
 * early. Each bounces once or twice, sooner and softer each time. A medal by
 * itself rings; among others it is damped.
 */
export function pourHits(count: number, seed: number): Hit[] {
  const random = noise(seed);
  const unit = () => (random() + 1) / 2;
  const spread = count === 1 ? 0 : POUR.spread * count ** POUR.power;
  const ring = 0.04 - 0.022 * Math.min(1, Math.log2(count) / 5);
  const hits: Hit[] = [];
  for (let medal = 0; medal < count; medal++) {
    let at = medal === 0 ? 0 : spread * unit() ** 1.6;
    const hz = MEDAL.hz * (0.92 + 0.16 * unit());
    let level = medal === 0 ? 1 : 0.55 + 0.45 * unit();
    let gap = 0.07 + 0.05 * unit();
    const bounces = (count === 1 ? 2 : 1) + (unit() < 0.6 ? 1 : 0);
    for (let bounce = 0; bounce <= bounces; bounce++) {
      hits.push({ at, hz: hz * (1 + 0.006 * bounce), level, ring: ring * (0.8 + 0.4 * unit()) * 0.85 ** bounce, bounce });
      at += gap;
      gap *= 0.55;
      level *= 0.42;
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

/** The seed a take of a rattle is worked out from. */
export const pourSeed = (count: number, variant: number): number => 400 + count * 10 + variant;

/** `count` medals into the tray: every strike is the medal and the tray together. `tail` is how long the last of them is left. */
function pour(rate: number, count: number, variant: number, tail: number = POUR.tail): Take {
  const seed = pourSeed(count, variant);
  const hits = pourHits(count, seed);
  const t = take(LEAD + hits[hits.length - 1].at + tail, rate);
  hits.forEach((hit, index) => {
    coin(t, LEAD + hit.at, hit.hz, hit.level, hit.ring, seed * 100 + index * 2);
    answer(t, LEAD + hit.at, BODIES.tray, hit.level, seed * 100 + index * 2 + 1);
  });
  // Where several medals strike together the peak is theirs alone, so a rattle is rounded off harder than a single medal.
  return rounded(t, count === 1 ? 0.6 : 0.5);
}

/** How long a bell in a jingle rings, in seconds. */
const BELL_RING = 0.2;

function perform(t: Take, music: Score): void {
  for (const part of music.parts) {
    for (const note of part.notes) {
      if (part.voice === 'bell') bell(t, note.at, note.hz, part.level, BELL_RING);
      else tone(t, note.at, note.hz, note.length, part.level, TIMBRES[part.voice]);
    }
  }
}

/**
 * A gold entry. The same call with a third note on top of it; where the plain
 * call has its own octave under it, this has a voice in harmony, a third or a
 * fourth under each note; and the key note is held under both.
 */
export const GOLD_START: Score = score(0.07, 0.55, [
  ['bell', 1, 'G6 C7 E7:5'],
  ['second', 0.35, 'E6 G6 C7:4'],
  ['bass', 0.3, 'C5:6'],
]);

/**
 * And its shimmer: small bells above every note of the call, one every
 * `every` seconds from `from` seconds in, each `fade` of the one before.
 */
export const GOLD_SHIMMER = { hz: [5274, 6272, 4186, 5274, 6272, 4186, 5274, 6272, 4186, 5274], from: 0.2, every: 0.035, level: 0.2, fade: 0.88, ring: 0.07 } as const;

const jingle =
  (music: Score) =>
  (rate: number): Take => {
    const t = take(music.length + music.tail, rate);
    perform(t, music);
    speaker(t);
    return t;
  };

/** How many different takes of a sound are kept. A clink is one of several, picked afresh each time. */
export const VARIANTS: Partial<Record<Sample, number>> = {
  land: 4,
  plate: 3,
  insert: 3,
  win: 4,
  pour2: 3,
  pour4: 3,
  pour8: 2,
  pour16: 2,
  pour32: 2,
  lost: 3,
  roll: 2,
  pocket: POCKET_NOTES.length,
  button: 2,
  buttonUp: 2,
  tray: 4,
  shutter: 2,
  drop: 2,
  slit: 3,
  rideDrop: 2,
  teeter: 2,
  farClink: 3,
  farRattle: 2,
  farTune: 6,
};

/**
 * A buffer of the room is never worked out at more samples a second than
 * this: there is next to nothing in it above 6 kHz, and it is the largest thing kept.
 * `renderSound` works out whatever rate it is asked for; this is what the
 * cabinet asks for.
 */
export const LOW_RATE = 24000;
/** What is worked out at no more than that: the room, and the machine's own bed, which is the longest thing but one. */
const LOW: ReadonlySet<Sample> = new Set<Sample>(['motor', ...ROOM_SAMPLES]);

/** The turns of a reel that go by in a second, heard as a flutter in its whirr. */
const FLUTTER = 15;

const RECIPES: Record<Sample, (rate: number, variant: number) => Take> = {
  // A medal coming down on other medals: they damp it at once, and the ones it lands on answer over the next few hundredths of a second.
  land: (rate, variant) => {
    const t = take(0.18, rate);
    const hz = MEDAL.hz * [0.95, 1, 1.04, 1.08][variant];
    const seed = 200 + variant * 10;
    const taps = [0, 0.006, 0.015, 0.027, 0.042].map((at, tap) => at * [1, 1.15, 0.9, 1.07][(variant + tap) % 4]);
    const tunes = [1, 1.06, 0.94, 1.03, 0.97].map((tune, tap) => (variant % 2 === 0 || tap === 0 ? tune : 2 - tune));
    [1, 0.7, 0.5, 0.35, 0.22].forEach((level, tap) => {
      coin(t, LEAD + taps[tap], hz * tunes[tap], level, 0.02 - tap * 0.002, seed + tap * 2, tap === 0 ? 1 : 0.6);
      answer(t, LEAD + taps[tap], BODIES.pile, level, seed + tap * 2 + 1);
    });
    return rounded(t);
  },
  // A medal coming down on the bare table: nothing damps it, so it rings, and it chatters to rest in quickening taps.
  plate: (rate, variant) => {
    const t = take(0.3, rate);
    const hz = MEDAL.hz * [0.97, 1.03, 1][variant];
    let at = LEAD;
    let gap = [0.05, 0.044, 0.056][variant];
    let level = 1;
    for (let tap = 0; tap < 6; tap++) {
      coin(t, at, hz * (1 + 0.004 * tap), level, 0.024 * 0.9 ** tap, 240 + variant * 10 + tap, 0.8);
      answer(t, at, BODIES.table, level, 290 + variant * 10 + tap);
      at += gap;
      gap *= 0.62;
      level *= 0.68;
    }
    return rounded(t);
  },
  // A medal going in: it catches the edge of the slot, strikes the throat behind it, and falls clear still ringing.
  insert: (rate, variant) => {
    const t = take(0.4, rate);
    const hz = MEDAL.hz * [1, 0.96, 1.05][variant];
    const seed = 330 + variant * 10;
    const second = LEAD + [0.05, 0.058, 0.044][variant];
    const third = second + [0.075, 0.065, 0.085][variant];
    coin(t, LEAD, hz, 0.45, 0.02, seed);
    answer(t, LEAD, BODIES.chute, 0.45, seed + 1);
    coin(t, second, hz * 1.008, 1, 0.05, seed + 2, 0.7);
    answer(t, second, BODIES.chute, 1, seed + 3);
    coin(t, third, hz * 0.992, 0.3, 0.04, seed + 4, 0.6);
    answer(t, third, BODIES.chute, 0.3, seed + 5);
    return rounded(t);
  },
  // A medal into the tray, by itself: it strikes, bounces and lies still, and the tray answers every time.
  win: (rate, variant) => pour(rate, 1, variant),
  pour2: (rate, variant) => pour(rate, 2, variant),
  pour4: (rate, variant) => pour(rate, 4, variant),
  pour8: (rate, variant) => pour(rate, 8, variant),
  pour16: (rate, variant) => pour(rate, 16, variant),
  pour32: (rate, variant) => pour(rate, 32, variant),
  // A medal off the side into the gutter: the same medal, but plastic takes the hit, so there is little strike and the ring is smothered.
  lost: (rate, variant) => {
    const t = take(0.24, rate);
    const hz = MEDAL.hz * [0.95, 1, 1.04][variant];
    const seed = 360 + variant * 10;
    const second = LEAD + [0.07, 0.085, 0.062][variant];
    coin(t, LEAD, hz, 0.5, 0.008, seed, 0.5);
    answer(t, LEAD, BODIES.gutter, 1, seed + 1);
    coin(t, second, hz * 0.99, 0.2, 0.006, seed + 2, 0.5);
    answer(t, second, BODIES.gutter, 0.4, seed + 3);
    return rounded(t);
  },
  // A medal rolling down a rail on its edge: a run of tiny taps that come faster as it gathers speed, the medal singing faintly over them.
  roll: (rate, variant) => {
    const length = 0.5;
    const t = take(length, rate);
    const random = noise(390 + variant);
    const level = (seconds: number) => Math.min(1, seconds / 0.04, (length - seconds) / 0.07);
    let at = LEAD;
    for (let tap = 0; at < length - 0.02; tap++) {
      const loud = level(at) * (0.75 + 0.25 * random());
      answer(t, at, BODIES.rail, loud, 400 + variant * 1000 + tap);
      ping(t, at, MEDAL.hz * [0.98, 1.03][variant], loud * 0.12, 0.004, MEDAL.top);
      at += (1 + 0.3 * random()) / (140 + 260 * (at / length));
    }
    hiss(t, 0, length, (seconds) => 0.12 * level(seconds), { kind: 'band', hz: 2400, to: 3600, q: 1 }, 399 + variant);
    return t;
  },
  gate: jingle(SCORES.gate),
  start: jingle(SCORES.start),
  // The hold is full and the medal was wasted: a dull no. A knuckle on wood, and a softer, lower one after it.
  full: (rate) => {
    const t = take(0.2, rate);
    [
      [0, 1, 1],
      [0.075, 0.5, 0.82],
    ].forEach(([at, level, tune], knock) => {
      ping(t, LEAD + at, 310 * tune, 0.8 * level, 0.02);
      ping(t, LEAD + at, 640 * tune, 0.6 * level, 0.012);
      ping(t, LEAD + at, 980 * tune, 0.3 * level, 0.008);
      ping(t, LEAD + at, 185 * tune, 0.35 * level, 0.03);
      hiss(t, LEAD + at, 0.02, dying(0.004, 0.5 * level), { kind: 'band', hz: 1100, q: 1.2 }, 61 + knock);
    });
    return t;
  },
  // One second of a reel turning, made to be played round and round: a band of noise that flutters as the digits go by.
  spin: (rate) => {
    const t = take(1, rate);
    const edge = 0.005;
    const level = (seconds: number) => (0.3 + 0.7 * Math.sin(Math.PI * FLUTTER * seconds) ** 2) * Math.min(1, seconds / edge, (1 - seconds) / edge);
    hiss(t, 0, 1, level, { kind: 'band', hz: 1100, q: 1.3 }, 71);
    return t;
  },
  // A reel stopping: the weight of it, a knock a small speaker can play, and the click of the catch.
  reelStop: (rate) => {
    const t = take(0.22, rate);
    glide(t, 0, 0.2, 220, 120, 0.05, dying(0.04));
    glide(t, 0, 0.12, 460, 300, 0.03, dying(0.02, 0.5));
    hiss(t, 0, 0.03, dying(0.006, 0.35), { kind: 'band', hz: 2200, q: 0.9 }, 81);
    ping(t, 0, 1300, 0.12, 0.015);
    return t;
  },
  // The roulette's ball striking a fret as the wheel carries it past: a click, the fret's ring and the wood under it.
  tick: (rate) => {
    const t = take(0.06, rate);
    hiss(t, LEAD, 0.008, dying(0.0015, 0.6), { kind: 'band', hz: 3200, q: 0.8 }, 91);
    ping(t, LEAD, 2300, 0.7, 0.007);
    ping(t, LEAD, 3700, 0.35, 0.004);
    ping(t, LEAD, 1150, 0.4, 0.01);
    return t;
  },
  // The piece being set down on a square: plastic on a board, and it rocks once before it stands.
  hop: (rate) => {
    const t = take(0.14, rate);
    hiss(t, LEAD, 0.012, dying(0.003, 0.5), { kind: 'band', hz: 2300, q: 0.9 }, 101);
    ping(t, LEAD, 720, 0.8, 0.012);
    ping(t, LEAD, 1480, 0.35, 0.007);
    ping(t, LEAD, 240, 0.5, 0.02);
    hiss(t, LEAD + 0.045, 0.01, dying(0.002, 0.15), { kind: 'band', hz: 2300, q: 0.9 }, 102);
    ping(t, LEAD + 0.045, 760, 0.25, 0.008);
    return t;
  },
  reach: jingle(SCORES.reach),
  small: jingle(SCORES.small),
  big: jingle(SCORES.big),
  seven: jingle(SCORES.seven),
  // A die rattling to rest: knocks that come further and further apart, then the last one as it settles.
  dice: (rate) => {
    const t = take(1.1, rate);
    const random = noise(111);
    let at = 0;
    let gap = 0.055;
    for (let knock = 0; knock < 10; knock++) {
      const weight = 1 - knock * 0.045;
      hiss(t, at, 0.03, dying(0.005, weight * 0.5), { kind: 'band', hz: 2450 + random() * 450, q: 2.5 }, 112 + knock);
      ping(t, at, 1350 + random() * 250, weight * 0.3, 0.006);
      at += gap;
      gap *= 1.13;
    }
    hiss(t, 0.93, 0.04, dying(0.007, 0.5), { kind: 'band', hz: 1700, q: 2 }, 125);
    ping(t, 0.93, 800, 0.4, 0.012);
    return t;
  },
  chest: jingle(SCORES.chest),
  // A chest opening: the latch, the hinge — a creak is a run of tiny slips that come faster — and the lid meeting its stop.
  open: (rate) => {
    const t = take(1, rate);
    hiss(t, 0, 0.02, dying(0.004, 0.5), { kind: 'band', hz: 3000, q: 1.2 }, 131);
    ping(t, 0, 1500, 0.4, 0.01);
    let at = 0.1;
    let gap = 1 / 28;
    while (at < 0.55) {
      ping(t, at, 820, 0.22, 0.004);
      ping(t, at, 1270, 0.1, 0.003);
      at += gap;
      gap *= 0.975;
    }
    // The lid goes back against its stop, and what is inside shifts.
    glide(t, 0.58, 0.2, 260, 170, 0.05, dying(0.03, 0.8));
    hiss(t, 0.58, 0.04, dying(0.008, 0.4), { kind: 'band', hz: 1300, q: 0.9 }, 132);
    ping(t, 0.58, 610, 0.3, 0.012);
    [0.64, 0.7, 0.79].forEach((at, medal) => coin(t, at, MEDAL.hz * (0.96 + medal * 0.035), 0.16 - medal * 0.04, 0.012, 133 + medal, 0.6));
    return t;
  },
  prize: jingle(SCORES.prize),
  ball: jingle(SCORES.ball),
  // The roulette's ball running round its track, made to go round and round: a hard ball on wood is a rattle with a
  // note of its own, it comes past six times in the second, and the wheel turns under it. The moments of a turn,
  // the shot that sets it off and the strikes it ends in, are takes of their own (`shot`, `lip`, `settle`): see `RUNS`.
  roulette: (rate) => {
    const length = 1;
    const cross = 0.08;
    const t = take(length + cross, rate);
    const lap = (seconds: number) => 0.55 + 0.45 * Math.sin(TURN * 6 * seconds) ** 2;
    hiss(t, 0, length + cross, (seconds) => 0.6 * lap(seconds), { kind: 'band', hz: 1700, q: 1.6 }, 181);
    hiss(t, 0, length + cross, (seconds) => 0.25 * lap(seconds), { kind: 'band', hz: 3900, q: 1.2 }, 182);
    hiss(t, 0, length + cross, () => 0.3, { kind: 'band', hz: 420, q: 1 }, 183);
    return looped(t, cross);
  },
  // A number: a bell and the fifth above it, higher for every number the run has reached.
  pocket: (rate, variant) => {
    const t = take(0.8, rate);
    const hz = POCKET_NOTES[variant];
    bell(t, 0, hz, 1, 0.2);
    bell(t, 0, hz * 1.5, 0.5, 0.16);
    bell(t, 0.05, hz * 2, 0.35, 0.14);
    speaker(t);
    return t;
  },
  // A tower going up: the thud of its first medals on the pusher, then a few more going onto it.
  tower: (rate) => {
    const t = take(0.5, rate);
    glide(t, 0, 0.3, 150, 75, 0.08, dying(0.07));
    glide(t, 0, 0.15, 320, 210, 0.05, dying(0.03, 0.45));
    hiss(t, 0, 0.12, dying(0.03, 0.35), { kind: 'low', hz: 500, q: 0.7 }, 141);
    [0.13, 0.21, 0.29, 0.37].forEach((at, index) => coin(t, at, MEDAL.hz * (0.94 + index * 0.03), 0.1, 0.009, 142 + index));
    return t;
  },
  // The cross: a low buzzer, two notes a shade apart so that they grate.
  cross: (rate) => {
    const t = take(0.46, rate);
    tone(t, 0, 147, 0.36, 0.6, BUZZ);
    tone(t, 0, 151.5, 0.36, 0.4, BUZZ);
    speaker(t);
    return t;
  },
  // A tower coming down: a rumble, and its medals scattering over it.
  crash: (rate) => {
    const t = take(1, rate);
    const random = noise(151);
    hiss(t, 0, 0.95, swell(0.02, 0.26, 0.8), { kind: 'band', hz: 170, q: 0.6 }, 152);
    hiss(t, 0, 0.6, swell(0.01, 0.14, 0.3), { kind: 'band', hz: 650, q: 0.8 }, 153);
    glide(t, 0, 0.9, 110, 70, 0.3, swell(0.01, 0.2, 0.5));
    for (let medal = 0; medal < 8; medal++) {
      const at = 0.04 + medal * 0.07 + (random() + 1) * 0.015;
      coin(t, at, MEDAL.hz * (1 + 0.08 * random()), 0.2 - medal * 0.015, 0.016, 154 + medal);
    }
    return t;
  },
  fever: jingle(SCORES.fever),
  jackpot: jingle(SCORES.jackpot),
  // The loop's two notes: a soft bell and a plucked bass.
  arp: (rate) => {
    const t = take(0.7, rate);
    ping(t, 0, REFERENCE.arp, 0.75, 0.16);
    ping(t, 0, REFERENCE.arp * 2, 0.18, 0.08);
    ping(t, 0, REFERENCE.arp * 3, 0.07, 0.05);
    speaker(t);
    return t;
  },
  bass: (rate) => {
    const t = take(0.9, rate);
    tone(t, 0, REFERENCE.bass, 0.8, 1, PLUCK);
    return t;
  },
  // A medal into the payout tray, heard at once and not after a fall: the same medal and the same tray as a `win` of one.
  tray: (rate, variant) => pour(rate, 1, variant),
  // A big arcade button going down: the microswitch under it clicks over part of the way, and then the dome bottoms
  // out on the panel, which is hollow and says so.
  button: (rate, variant) => {
    const t = take(0.16, rate);
    const tune = [1, 0.94][variant];
    const lands = LEAD + [0.016, 0.019][variant];
    hiss(t, LEAD, 0.006, dying(0.0015, 0.45), { kind: 'band', hz: 5200, q: 1.5 }, 223 + variant);
    ping(t, LEAD, 3400 * tune, 0.3, 0.0025);
    hiss(t, lands, 0.015, dying(0.004, 0.55), { kind: 'band', hz: 2500, q: 0.8 }, 221 + variant);
    ping(t, lands, 520 * tune, 0.8, 0.009);
    ping(t, lands, 880 * tune, 0.4, 0.006);
    ping(t, lands, 165, 0.6, 0.018);
    return t;
  },
  // And coming up: the switch clicks back first, then the dome meets its stop.
  buttonUp: (rate, variant) => {
    const t = take(0.12, rate);
    const tune = [1, 1.05][variant];
    hiss(t, LEAD, 0.006, dying(0.0015, 0.5), { kind: 'band', hz: 4800, q: 1.5 }, 225 + variant);
    ping(t, LEAD, 3050 * tune, 0.4, 0.0025);
    hiss(t, LEAD + 0.018, 0.012, dying(0.003, 0.3), { kind: 'band', hz: 2100, q: 0.8 }, 227 + variant);
    ping(t, LEAD + 0.018, 700 * tune, 0.45, 0.007);
    return t;
  },
  // A door or a shutter thrown by a solenoid: the plunger slams home, the frame rings, and the flap chatters to rest.
  shutter: (rate, variant) => {
    const t = take(0.3, rate);
    const tune = [1, 1.08][variant];
    glide(t, LEAD, 0.2, 230 * tune, 150 * tune, 0.03, dying(0.022));
    ping(t, LEAD, 1250 * tune, 0.4, 0.012);
    ping(t, LEAD, 2100 * tune, 0.2, 0.008);
    hiss(t, LEAD, 0.012, dying(0.003, 0.7), { kind: 'band', hz: 3000, q: 0.9 }, 231 + variant);
    [0.036, 0.061, 0.079].forEach((at, tap) => {
      hiss(t, LEAD + at, 0.012, dying(0.004, 0.3 - tap * 0.08), { kind: 'band', hz: 1800, q: 2 }, 233 + tap);
      ping(t, LEAD + at, 900 * tune, 0.3 - tap * 0.08, 0.006);
    });
    return t;
  },
  // A hopper paying out, made to go round and round: its disc's motor, and a medal thrown out every tenth of a second or
  // so, each let go with a click, striking the steel sheet under the hopper and bouncing once.
  hopper: (rate) => {
    const length = HOPPER.loop;
    const cross = 0.25;
    const t = take(length + cross, rate);
    const random = noise(241);
    for (let i = 0; i < t.out.length; i++) {
      const seconds = i / rate;
      const waver = 0.16 * (1 + 0.15 * Math.sin(TURN * 20 * seconds));
      t.out[i] += waver * (0.6 * Math.sin(TURN * 240 * seconds) + 0.3 * Math.sin(TURN * 480 * seconds + 0.4) + 0.1 * Math.sin(TURN * 720 * seconds + 1));
    }
    hiss(t, 0, length + cross, () => 0.12, { kind: 'band', hz: 1100, q: 0.8 }, 242);
    let at = 0.02;
    for (let medal = 0; at < length + cross - 0.2; medal++) {
      hiss(t, at, 0.012, dying(0.003, 0.3), { kind: 'band', hz: 2600, q: 1.2 }, 250 + medal * 3);
      const lands = at + 0.05 + 0.03 * (random() + 1);
      const hz = MEDAL.hz * (1 + 0.08 * random());
      const level = 0.75 + 0.25 * random();
      coin(t, lands, hz, level, 0.016, 251 + medal * 3);
      answer(t, lands, BODIES.sheet, level, 252 + medal * 3);
      coin(t, lands + 0.045 + 0.02 * (random() + 1), hz * 1.006, level * 0.4, 0.012, 253 + medal * 3, 0.6);
      at += (1 + 0.14 * random()) / HOPPER.rate;
    }
    return rounded(looped(t, cross), 0.5);
  },
  // A geared motor moving something, made to go round and round: its whine and the whine's octave, wavering with the
  // shaft, the teeth of its rack going by, and the rattle of the carriage. It was a lift's; it is a tube's now, its
  // platform letting a tower down, its arm pushing the tower out and drawing back.
  lift: (rate) => {
    const length = 1;
    const cross = 0.06;
    const t = take(length + cross, rate);
    for (let i = 0; i < t.out.length; i++) {
      const seconds = i / rate;
      const waver = 1 + 0.12 * Math.sin(TURN * 31 * seconds);
      t.out[i] += waver * (0.45 * Math.sin(TURN * 430 * seconds) + 0.22 * Math.sin(TURN * 860 * seconds + 0.6) + 0.1 * Math.sin(TURN * 1290 * seconds + 1.1));
    }
    for (let tooth = 0; tooth / 24 < length + cross - 0.02; tooth++) {
      ping(t, tooth / 24, 1500, 0.25, 0.003);
      ping(t, tooth / 24, 2600, 0.12, 0.002);
    }
    hiss(t, 0, length + cross, () => 0.18, { kind: 'band', hz: 950, q: 0.9 }, 191);
    return looped(t, cross);
  },
  // The motor reaching the end of its travel: it stops against its end with a clunk, and what it carried settles.
  liftStop: (rate) => {
    const t = take(0.3, rate);
    glide(t, LEAD, 0.25, 210, 120, 0.05, dying(0.035));
    ping(t, LEAD, 640, 0.4, 0.015);
    hiss(t, LEAD, 0.03, dying(0.006, 0.45), { kind: 'band', hz: 1500, q: 0.9 }, 195);
    [0.05, 0.085, 0.13].forEach((at, medal) => coin(t, LEAD + at, MEDAL.hz * (0.95 + medal * 0.04), 0.14 - medal * 0.03, 0.01, 196 + medal, 0.6));
    return t;
  },
  // A ball running round a plastic bowl, made to go round and round: the bowl's own low rumble, louder each time the
  // ball comes round the near side, and the seams and specks it runs over.
  bowl: (rate) => {
    const length = 1;
    const cross = 0.1;
    const t = take(length + cross, rate);
    const random = noise(203);
    const lap = (seconds: number) => 0.5 + 0.5 * Math.sin(TURN * 2 * seconds) ** 2;
    hiss(t, 0, length + cross, (seconds) => 0.7 * lap(seconds), { kind: 'band', hz: 520, q: 1.1 }, 201);
    hiss(t, 0, length + cross, (seconds) => 0.3 * lap(seconds), { kind: 'band', hz: 1900, q: 1.4 }, 202);
    for (let at = 0.01; at < length + cross - 0.04; at += 0.06 + 0.05 * (random() + 1)) ping(t, at, 800 + 300 * random(), 0.25, 0.005);
    return looped(t, cross);
  },
  // The ball finding its hole: it knocks round the rim, quicker each time, goes through with a hollow knock, and is
  // heard twice more on its way down inside.
  drop: (rate, variant) => {
    const t = take(0.62, rate);
    const tune = [1, 1.07][variant];
    [0, 0.07, 0.115].forEach((at, knock) => {
      ping(t, LEAD + at, 640 * tune, 0.6 - knock * 0.12, 0.01);
      ping(t, LEAD + at, 1500 * tune, 0.22, 0.005);
      hiss(t, LEAD + at, 0.012, dying(0.003, 0.3), { kind: 'band', hz: 2600, q: 1 }, 211 + knock);
    });
    glide(t, LEAD + 0.17, 0.2, 430 * tune, 250 * tune, 0.07, dying(0.04));
    hiss(t, LEAD + 0.17, 0.04, dying(0.008, 0.4), { kind: 'band', hz: 900, q: 0.8 }, 215);
    [0.3, 0.41].forEach((at, knock) => {
      ping(t, LEAD + at, (320 - knock * 50) * tune, 0.35 - knock * 0.12, 0.018);
      hiss(t, LEAD + at, 0.03, dying(0.006, 0.12), { kind: 'low', hz: 700, q: 0.7 }, 216 + knock);
    });
    return t;
  },
  // A hopper's door dropping open on its stays: the latch lets go, the flap falls and the stays catch it with a clank,
  // and it shivers on them. Open, it is the chute.
  door: (rate) => {
    const t = take(0.5, rate);
    hiss(t, LEAD, 0.006, dying(0.0015, 0.35), { kind: 'band', hz: 4200, q: 1.4 }, 301);
    ping(t, LEAD, 2900, 0.25, 0.003);
    let at = LEAD + 0.09;
    let gap = 0.07;
    let level = 1;
    for (let bounce = 0; bounce < 4; bounce++) {
      answer(t, at, BODIES.sheet, level, 302 + bounce);
      ping(t, at, 310, level * 0.6, 0.03);
      ping(t, at, 1180, level * 0.3, 0.02);
      at += gap;
      gap *= 0.6;
      level *= bounce === 0 ? 0.45 : 0.55;
    }
    return t;
  },
  // And swung back up: a dull knock as it meets its frame, and the latch catching a moment after.
  doorShut: (rate) => {
    const t = take(0.3, rate);
    glide(t, LEAD, 0.15, 240, 170, 0.04, dying(0.025));
    answer(t, LEAD, BODIES.sheet, 0.5, 311);
    hiss(t, LEAD + 0.045, 0.006, dying(0.0015, 0.5), { kind: 'band', hz: 4400, q: 1.4 }, 312);
    ping(t, LEAD + 0.045, 3100, 0.35, 0.003);
    return t;
  },
  // Medals rushing down a steel chute, made to go round and round: three dozen a second, each striking the chute and
  // sliding on, too close together to count, over the hiss of all of them sliding.
  pour: (rate) => {
    const length = CHUTE.loop;
    const cross = 0.25;
    const t = take(length + cross, rate);
    const random = noise(321);
    hiss(t, 0, length + cross, () => 0.22, { kind: 'band', hz: 3100, q: 0.7 }, 322);
    hiss(t, 0, length + cross, () => 0.1, { kind: 'band', hz: 900, q: 0.8 }, 323);
    let at = 0.01;
    for (let medal = 0; at < length + cross - 0.08; medal++) {
      const level = 0.55 + 0.45 * ((random() + 1) / 2);
      coin(t, at, MEDAL.hz * (1 + 0.09 * random()), level, 0.011, 324 + medal * 2, 0.7);
      if (medal % 2 === 0) answer(t, at, BODIES.sheet, level * 0.8, 325 + medal * 2);
      at += (1 + 0.5 * random()) / CHUTE.rate;
    }
    return rounded(looped(t, cross), 0.5);
  },
  // A guard, the gate at the foot of a tower's window: sliding shut to seat, and sliding aside.
  guard: (rate) => guardOf(rate, GUARD.down, false),
  guardUp: (rate) => guardOf(rate, GUARD.up, true),
  // A medal dropping into a narrow slot standing on its edge: it rattles between the two walls, faster and higher as
  // it falls, which is a zip that rises, and clinks on the steel at the bottom.
  slit: (rate, variant) => {
    const t = take(0.38, rate);
    const tune = [1, 0.95, 1.06][variant];
    const fall = [0.15, 0.17, 0.14][variant];
    const random = noise(341 + variant);
    let at = LEAD;
    for (let tap = 0; at < LEAD + fall - 0.004; tap++) {
      const share = (at - LEAD) / fall;
      const loud = (0.3 + 0.4 * share) * (0.8 + 0.2 * random());
      // Each tap is on the wall of a slot that is shorter above the medal the further it has fallen, so it is higher.
      hiss(t, at, 0.005, dying(0.0012, loud * 0.6), { kind: 'band', hz: (1700 + 2700 * share) * tune, q: 1.8 }, 350 + variant * 100 + tap);
      ping(t, at, (1500 + 1900 * share) * tune, loud * 0.5, 0.003);
      ping(t, at, MEDAL.hz * tune * (0.96 + 0.06 * share), loud * 0.12, 0.004, MEDAL.top);
      at += 1 / (90 + 260 * share);
    }
    const lands = LEAD + fall;
    coin(t, lands, MEDAL.hz * tune, 1, 0.03, 346 + variant, 0.9);
    answer(t, lands, BODIES.chute, 1, 347 + variant);
    coin(t, lands + 0.05, MEDAL.hz * tune * 1.006, 0.3, 0.02, 348 + variant, 0.6);
    return rounded(t);
  },
  // A medal sliding down a short steel tongue between its rails, made to go round and round: brass scraping on steel,
  // which is a hiss with the medal's own note faintly in it, and the medal touching one rail and the other as it goes.
  ride: (rate) => {
    const length = 0.6;
    const cross = 0.08;
    const t = take(length + cross, rate);
    const random = noise(411);
    const grain = (seconds: number) => 0.75 + 0.25 * Math.sin(TURN * 35 * seconds) * Math.sin(TURN * 10 * seconds);
    hiss(t, 0, length + cross, (seconds) => 0.5 * grain(seconds), { kind: 'band', hz: 3200, q: 0.9 }, 412);
    hiss(t, 0, length + cross, () => 0.18, { kind: 'band', hz: 900, q: 0.8 }, 413);
    for (let at = 0.01; at < length + cross - 0.03; at += 0.05 + 0.03 * (random() + 1)) {
      answer(t, at, BODIES.rail, 0.5 + 0.2 * random(), 414 + Math.round(at * 1000));
      ping(t, at, MEDAL.hz * (1 + 0.02 * random()), 0.07, 0.006, MEDAL.top);
    }
    return looped(t, cross);
  },
  // And off the end of it: it lands flat on the pocket's floor, which is a clack with little ring to it, and is heard
  // once more from down inside, hollow.
  rideDrop: (rate, variant) => {
    const t = take(0.3, rate);
    const tune = [1, 0.93][variant];
    coin(t, LEAD, MEDAL.hz * tune, 0.7, 0.008, 421 + variant, 0.9);
    answer(t, LEAD, BODIES.table, 1, 423 + variant);
    const inside = LEAD + [0.07, 0.082][variant];
    glide(t, inside, 0.12, 260 * tune, 180 * tune, 0.04, dying(0.03, 0.5));
    ping(t, inside, 520 * tune, 0.3, 0.012);
    hiss(t, inside, 0.03, dying(0.006, 0.2), { kind: 'low', hz: 700, q: 0.7 }, 425 + variant);
    return rounded(t);
  },
  // The cabinet's answer to a gold entry: the call with its third note, and a shimmer over the last of it, which is
  // small bells very high up, each a little quieter than the one before.
  startGold: (rate) => {
    const t = take(GOLD_START.length + GOLD_START.tail, rate);
    perform(t, GOLD_START);
    const { from, every, level, fade, ring } = GOLD_SHIMMER;
    GOLD_SHIMMER.hz.forEach((hz, glint) => ping(t, from + glint * every, hz, level * fade ** glint, ring));
    speaker(t);
    return t;
  },
  // The light running from a pocket up to its lamp: a few ticks, each higher than the last, and the lamp's own tink
  // as it lights, `ENTRY.spark.seconds` after the first of them. It comes out of the cabinet's speaker.
  spark: (rate) => {
    const run = ENTRY.spark.seconds;
    const t = take(run + 0.3, rate);
    [1800, 2250, 2800, 3500, 4300].forEach((hz, tick) => {
      const at = LEAD + (run * tick) / 5;
      ping(t, at, hz, 0.26 + 0.04 * tick, 0.006);
      hiss(t, at, 0.004, dying(0.001, 0.12), { kind: 'band', hz: hz * 1.4, q: 1.5 }, 431 + tick);
    });
    bell(t, LEAD + run, 3520, 1, 0.09);
    speaker(t);
    return t;
  },
  // A medal astride a tongue's rail: it rocks, quicker each time, and goes over the side into the gap, which is a duller
  // clack than a pocket's because there is no pocket under it.
  teeter: (rate, variant) => {
    const t = take(0.5, rate);
    const tune = [1, 1.05][variant];
    let at = LEAD;
    let gap = [0.11, 0.1][variant];
    let level = 0.5;
    for (let rock = 0; rock < 4; rock++) {
      coin(t, at, MEDAL.hz * tune * (1 + 0.004 * rock), level, 0.012, 441 + variant * 10 + rock, 0.5);
      answer(t, at, BODIES.chute, level * 0.5, 451 + variant * 10 + rock);
      at += gap;
      gap *= 0.72;
      level *= 0.85;
    }
    coin(t, at, MEDAL.hz * tune * 0.97, 0.35, 0.006, 461 + variant, 0.4);
    answer(t, at, BODIES.gutter, 1.4, 463 + variant);
    return rounded(t);
  },
  // The lucky lamp stepping to the next pocket: a relay, which is its armature landing and its contact closing a
  // few thousandths of a second after.
  lampStep: (rate) => {
    const t = take(0.06, rate);
    ping(t, LEAD, 420, 0.5, 0.008);
    ping(t, LEAD, 1400, 0.45, 0.005);
    hiss(t, LEAD, 0.006, dying(0.0015, 0.4), { kind: 'band', hz: 2200, q: 1.2 }, 471);
    ping(t, LEAD + 0.005, 2600, 0.25, 0.003);
    hiss(t, LEAD + 0.005, 0.004, dying(0.001, 0.25), { kind: 'band', hz: 3400, q: 1.4 }, 472);
    return t;
  },
  // A shutter opening: the solenoid lets go with a click, the slats run up, and stop.
  shutterOpen: (rate) => {
    const t = take(0.3, rate);
    hiss(t, LEAD, 0.008, dying(0.002, 0.5), { kind: 'band', hz: 3500, q: 1.2 }, 361);
    ping(t, LEAD, 2400, 0.35, 0.004);
    hiss(t, LEAD + 0.01, 0.13, (seconds) => 0.25 * Math.min(1, seconds / 0.02, (0.13 - seconds) / 0.03), { kind: 'band', hz: 1200, to: 2000, q: 1.2 }, 362);
    glide(t, LEAD + 0.14, 0.12, 260, 190, 0.03, dying(0.02, 0.6));
    ping(t, LEAD + 0.14, 1100, 0.3, 0.008);
    return t;
  },
  // The ball shot on to the wheel's track: the plunger's knock, its click, and the ball skidding before it rolls.
  shot: (rate) => {
    const t = take(0.22, rate);
    glide(t, LEAD, 0.12, 320, 170, 0.03, dying(0.02));
    hiss(t, LEAD, 0.01, dying(0.002, 0.7), { kind: 'band', hz: 3600, q: 0.9 }, 371);
    ping(t, LEAD, 1700, 0.5, 0.006);
    hiss(t, LEAD + 0.01, 0.16, dying(0.05, 0.3), { kind: 'band', hz: 2200, q: 1.2 }, 372);
    return t;
  },
  // The ball striking the lip of a pocket, or of a hole it does not go down: a hard knock with wood under it.
  lip: (rate) => {
    const t = take(0.1, rate);
    hiss(t, LEAD, 0.01, dying(0.002, 0.6), { kind: 'band', hz: 2800, q: 0.9 }, 381);
    ping(t, LEAD, 1500, 0.8, 0.008);
    ping(t, LEAD, 2450, 0.4, 0.005);
    ping(t, LEAD, 560, 0.5, 0.014);
    return t;
  },
  // The ball settling in its pocket: it rocks twice and lies still.
  settle: (rate) => {
    const t = take(0.18, rate);
    ping(t, LEAD, 300, 0.4, 0.02);
    [0, 0.045, 0.078].forEach((at, rock) => {
      const level = 0.55 ** rock;
      ping(t, LEAD + at, 880, 0.7 * level, 0.008);
      ping(t, LEAD + at, 1750, 0.3 * level, 0.005);
      hiss(t, LEAD + at, 0.008, dying(0.002, 0.3 * level), { kind: 'band', hz: 2400, q: 1 }, 391 + rock);
    });
    return t;
  },
  // A ball landing in a bowl from the hole above it: a hollow knock, and one small bounce.
  bowlLand: (rate) => {
    const t = take(0.3, rate);
    glide(t, LEAD, 0.12, 300, 210, 0.04, dying(0.03, 0.6));
    ping(t, LEAD, 520, 0.9, 0.014);
    ping(t, LEAD, 1240, 0.35, 0.007);
    hiss(t, LEAD, 0.015, dying(0.004, 0.4), { kind: 'band', hz: 2100, q: 0.9 }, 395);
    ping(t, LEAD + 0.09, 540, 0.3, 0.01);
    hiss(t, LEAD + 0.09, 0.01, dying(0.003, 0.12), { kind: 'band', hz: 2100, q: 0.9 }, 396);
    return t;
  },
  // The rotor of the roulette's wheel, made to go round and round: a small geared motor a long way down, and the
  // bearing it turns on.
  rotor: (rate) => {
    const length = 1.5;
    const cross = 0.1;
    const t = take(length + cross, rate);
    for (let i = 0; i < t.out.length; i++) {
      const seconds = i / rate;
      const waver = 1 + 0.1 * Math.sin(TURN * 12 * seconds);
      t.out[i] += waver * (0.3 * Math.sin(TURN * 120 * seconds) + 0.3 * Math.sin(TURN * 240 * seconds + 0.5) + 0.2 * Math.sin(TURN * 360 * seconds + 1.2) + 0.12 * Math.sin(TURN * 480 * seconds + 0.3));
    }
    hiss(t, 0, length + cross, () => 0.3, { kind: 'low', hz: 320, q: 0.8 }, 398);
    hiss(t, 0, length + cross, () => 0.08, { kind: 'band', hz: 1300, q: 0.8 }, 399);
    return looped(t, cross);
  },
  // The machine itself, for one whole stroke of the pusher: fully back at the start, fully forward half way through,
  // back again at the end, as `pusherFront` has it. It is made to go round and round.
  motor: (rate) => {
    const length = PUSHER.period;
    const t = take(length, rate);
    const { out } = t;
    const angle = (seconds: number) => (TURN * seconds) / length;
    // It moves fastest in the middle of the push and in the middle of the way back, and stands still for an instant at each end.
    const pace = (seconds: number) => Math.abs(Math.sin(angle(seconds)));
    const push = (seconds: number) => Math.max(0, Math.sin(angle(seconds)));
    // The motor and its gears: a hum, and the whine of the teeth. Shoving a tableful of medals it works harder, which
    // is louder and a shade lower; coming back light it runs easy, a shade higher.
    for (let i = 0; i < out.length; i++) {
      const seconds = i / rate;
      const lag = MOTOR.sag * Math.cos(angle(seconds));
      const effort = (0.62 + 0.38 * push(seconds)) * (1 + 0.08 * Math.sin(TURN * 25 * seconds));
      let sum = 0;
      for (const [hz, weight] of MOTOR.partials) sum += weight * Math.sin(TURN * hz * seconds + (hz / 300) * lag);
      out[i] += MOTOR.hum * effort * sum;
    }
    // The slides the pusher runs on.
    hiss(t, 0, length, (seconds) => 0.16 * pace(seconds) * (0.6 + 0.4 * push(seconds)), { kind: 'band', hz: 700, q: 0.8 }, 261);
    // The medals riding on it scrape against what holds them back, faintly, most where it moves fastest, and one of
    // them ticks against another now and then.
    hiss(t, 0, length, (seconds) => 0.07 * pace(seconds) ** 2, { kind: 'band', hz: 4600, q: 0.9 }, 262);
    const random = noise(263);
    for (let tick = 0; tick < 26; tick++) {
      const at = ((random() + 1) / 2) * (length - 0.06);
      ping(t, at, MEDAL.hz * (1 + 0.08 * random()), 0.06 * pace(at), 0.006, MEDAL.top);
    }
    // A clunk at each end, where the crank goes over its centre and the slack in it is taken up the other way.
    [
      [0.004, 170, 0.9],
      [length / 2, 140, 0.7],
    ].forEach(([at, hz, level], end) => {
      ping(t, at, hz, level, 0.03);
      ping(t, at, hz * 2.1, level * 0.35, 0.018);
      hiss(t, at, 0.04, dying(0.008, level * 0.5), { kind: 'band', hz: 950, q: 1 }, 264 + end);
    });
    return t;
  },
  // The room's own tone, made to go round: a wash of medals going into trays all over the floor, too many and too far
  // off to count, the air handling low down, and a murmur that comes and goes, with nothing in it that can be told apart.
  room: (rate) => {
    const length = 7;
    const cross = 0.6;
    const t = take(length + cross, rate);
    const random = noise(274);
    let at = 0.01;
    for (let medal = 0; at < length + cross - 0.3; medal++) {
      const level = 0.3 + 0.35 * (random() + 1);
      coin(t, at, MEDAL.hz * (1 + 0.1 * random()), level, 0.014, 275 + medal * 2, 0.5);
      if (medal % 2 === 0) answer(t, at, BODIES.tray, level, 276 + medal * 2);
      at += 0.02 + 0.07 * (random() + 1);
    }
    far(t, 1.3);
    const murmur = (seconds: number) => 0.4 * (0.75 + 0.25 * Math.sin(TURN * 0.29 * seconds + 1) * Math.sin(TURN * 0.71 * seconds));
    hiss(t, 0, length + cross, () => 0.5, { kind: 'low', hz: 260, q: 0.7 }, 271);
    hiss(t, 0, length + cross, murmur, { kind: 'band', hz: 620, q: 0.7 }, 272);
    hiss(t, 0, length + cross, () => 0.1, { kind: 'band', hz: 2400, q: 0.6 }, 273);
    return looped(t, cross);
  },
  // Other machines' medals, from across the floor: one into a tray, a handful, a payout.
  farClink: (rate, variant) => far(pour(rate, 1, 30 + variant, 1), 0.9),
  farRattle: (rate, variant) => far(pour(rate, 6, 40 + variant, 1.1), 1),
  farPour: (rate) => far(pour(rate, 20, 50, 1.3), 1.1),
  // A few notes of some other machine's tune. They are made up here, note by note, by the roll of a die: up or down a
  // step or two of a five-note scale, long or short, sometimes a rest. So they are nobody's tune, and no two takes
  // are the same one. There are six of them, in six keys and two voices, so that none is heard often.
  farTune: (rate, variant) => {
    const t = take(2.6, rate);
    const random = noise(291 + variant * 7);
    const unit = () => (random() + 1) / 2;
    const root = pitch(['C5', 'D5', 'F5', 'G5', 'A4', 'E5'][variant]);
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    let at = 0.02;
    let step = 3;
    while (at < 1.7) {
      step = Math.min(scale.length - 1, Math.max(0, step + Math.round(random() * 2.4)));
      const hz = root * 2 ** (scale[step] / 12);
      const length = [0.11, 0.11, 0.16, 0.22][Math.floor(unit() * 4)];
      if (unit() < 0.85) {
        if (variant % 2 === 1) tone(t, at, hz, length * 0.9, 0.6, TIMBRES.lead);
        else bell(t, at, hz, 0.7, 0.18);
      }
      at += length;
    }
    return far(t, 1.1);
  },
};

/**
 * Takes out what lies below `BOTTOM`, begins and ends the take in silence and
 * brings its peak to exactly 1. A take that goes round and round is left as it
 * is at its ends, which already run into each other.
 */
function finish(t: Take, round = false): Float32Array {
  const { out, rate } = t;
  const angle = (TURN * BOTTOM) / rate;
  const cos = Math.cos(angle);
  const alpha = Math.sin(angle) / Math.SQRT2;
  const b0 = (1 + cos) / 2 / (1 + alpha);
  const a1 = (-2 * cos) / (1 + alpha);
  const a2 = (1 - alpha) / (1 + alpha);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const through = (x: number): number => {
    const y = b0 * (x - 2 * x1 + x2) - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
  // What goes round has been going round all along: the filter is run in over its last tenth of a second first.
  if (round) for (let i = Math.max(0, out.length - Math.round(0.1 * rate)); i < out.length; i++) through(out[i]);
  for (let i = 0; i < out.length; i++) out[i] = through(out[i]);
  // Half a millisecond in, which leaves a strike its edge, and four out.
  const rise = round ? 0 : Math.min(out.length, Math.round(0.0005 * rate));
  for (let i = 0; i < rise; i++) out[i] *= i / rise;
  const fade = round ? 0 : Math.min(out.length, Math.round(0.004 * rate));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return out;
}

/** The samples of a sound at `rate` samples a second: one channel, peaking at exactly 1, the same every time. */
export function renderSound(sample: Sample, rate: number, variant = 0): Float32Array {
  const takes = VARIANTS[sample] ?? 1;
  return finish(RECIPES[sample](rate, Math.min(takes - 1, Math.max(0, Math.floor(variant)))), LOOPING.includes(sample));
}

// ── Playing it ──────────────────────────────────────────────────────────────

/** Something that has been started: what plays it, the gain it goes through and its level, and when it will have ended by itself. */
interface Playing {
  source: AudioBufferSourceNode;
  gain: GainNode;
  level: number;
  until: number;
  /** Whether it is medals in the tray, which have a limit of their own. */
  tray?: boolean;
  /** Whether its level is on a schedule of its own, which a cut has to stop where it has got to. */
  shaped?: boolean;
}

/** The tray's books: medals won but not yet heard, when they were last added to, and the earliest its next source may start. */
interface Tray {
  owed: number;
  asked: number;
  next: number;
}

/** The audio once it exists: the context, the gain everything goes into, and what has been worked out and started. */
interface Rig {
  audio: AudioContext;
  master: GainNode;
  /** The loop goes through a gain of its own on the way to the master, so that it can be turned down under the medals. */
  music: GainNode;
  /** When the loop may come back up. */
  duckedUntil: number;
  /** The room goes through a gain of its own as well, so that it is one thing to switch off. */
  air: GainNode;
  tray: Tray;
  /** The rate buffers are worked out at. */
  rate: number;
  buffers: Map<string, AudioBuffer>;
  /** What `playSound` has started and the loop's notes, each in the order they began. */
  voices: Playing[];
  notes: Playing[];
  /** The stretches of the machine's own bed, and when the last of them ends; and what the room is playing. */
  bed: Playing[];
  bedUntil: number;
  room: Playing[];
  /** The stretches of the wheel's rotor: when the last of them began and ends, and where in the buffer it began. */
  rotor: Playing[];
  rotorFrom: number;
  rotorAt: number;
  rotorUntil: number;
  /** When each sound was last started, within the last `LIMITS.window` seconds. */
  starts: Partial<Record<PusherSound, number[]>>;
  warmed: boolean;
}

/** What comes from far off across the floor, each kind in its own time. */
const FAR_KINDS = ['farClink', 'farRattle', 'farPour', 'farTune'] as const;
type FarKind = (typeof FAR_KINDS)[number];

/** The room while it is heard: when the stretch of its tone that is playing ends, when each kind is next due, and the clock that looks ahead. */
interface Air {
  toneUntil: number;
  next: Record<FarKind, number>;
  timer: ReturnType<typeof setInterval>;
}

/**
 * How a mechanism that runs is heard: a buffer going round, at a speed and a
 * level that change as the mechanism does.
 */
interface Run {
  /** How long it runs when nobody says, in seconds, and how much of that it is heard for. */
  usual: number;
  share: number;
  /**
   * The speed it is played at: as it sets off, once it has been going for
   * `spin` seconds or is `knee` of the way through, and as it stops.
   */
  speeds: readonly [number, number, number];
  spin: number;
  knee?: number;
  /**
   * Its level comes up over `rise` seconds, holds until `from` of the way
   * through, has fallen to `thin` of itself `fall` seconds before the end, and
   * is gone at the end.
   */
  rise: number;
  from: number;
  thin: number;
  fall: number;
  /** What it ends in, how long before the end that begins, and its level. */
  end?: { sample: Sample; before: number; level: number };
  /** What it begins with, and whether only when it begins a little from now: a ball that was dropped in lands first. */
  start?: { sample: Sample; level: number; dropped?: boolean };
  /** What is heard in the course of it, each at its share of the whole time it was told, whatever `share` of that it runs for. */
  moments?: readonly { at: number; sample: Sample; level: number }[];
}

/**
 * The mechanisms that run. A roulette's ball is shot on to its track, runs
 * round it slowing for 0.44 of the turn, comes down the bank until 0.72,
 * strikes the lip of a pocket there, hops the divider at 0.8 and settles at
 * 0.92: one sound with those moments in it, however long the turn. A lift's
 * motor gets going, runs, and stops against its end. Medals down a chute
 * come in a rush and thin at the end. A medal on a tongue slides faster all
 * the way down it and drops off the end into its pocket. A ball in a bowl slows
 * all the way round and drops through its hole: the knock of it going through
 * is `before` seconds into `drop`. A hopper's disc gets going, throws medals
 * out, and the last of them are fewer. In a funnel (`FUNNEL`) the ball goes
 * faster all the way in, and is no quieter for it.
 */
const RUNS: Partial<Record<PusherSound, Run>> = {
  roulette: {
    usual: 2.8,
    share: 0.72,
    speeds: [1.35, 0.85, 0.5],
    spin: 0,
    knee: 0.44 / 0.72,
    rise: 0.05,
    from: 0,
    thin: 0.3,
    fall: 0.05,
    start: { sample: 'shot', level: 0.06 },
    moments: [
      { at: 0.72, sample: 'lip', level: 0.055 },
      { at: 0.8, sample: 'tick', level: 0.035 },
      { at: 0.92, sample: 'settle', level: 0.045 },
    ],
  },
  lift: { usual: 1.6, share: 1, speeds: [0.7, 1, 0.94], spin: 0.2, rise: 0.06, from: 1, thin: 1, fall: 0.04, end: { sample: 'liftStop', before: 0.02, level: 0.07 } },
  bowl: {
    usual: 3,
    share: 1,
    speeds: [1.3, 1.3, 0.5],
    spin: 0,
    rise: 0.15,
    from: 0.2,
    thin: 0.25,
    fall: 0.12,
    start: { sample: 'bowlLand', level: 0.06, dropped: true },
    end: { sample: 'drop', before: 0.17, level: SOUND_LEVELS.drop },
  },
  hopper: { usual: 2, share: 1, speeds: [0.85, 1, 1], spin: 0.15, rise: 0.12, from: 0.7, thin: 0.35, fall: 0.2 },
  pour: { usual: 2, share: 1, speeds: [0.9, 1, 1], spin: 0.15, rise: 0.1, from: 0.75, thin: 0.4, fall: 0.15 },
  ride: { usual: 0.8, share: 1, speeds: [0.7, 0.7, 1.3], spin: 0, rise: 0.04, from: 1, thin: 1, fall: 0.015, end: { ...ENTRY.drop, before: LEAD } },
};
const FUNNEL: Run = { ...(RUNS.bowl as Run), speeds: [0.6, 0.6, 1.45], from: 1, thin: 1, fall: 0.06 };
/** A near miss in a bowl is the ball on the lip of the hole it does not take. */
const NEAR_MISS = { sample: 'lip', level: 0.05, speed: 0.8 } as const;
/** What a sound is when the thing goes back up. */
const UPS: Partial<Record<PusherSound, Sample>> = { button: 'buttonUp', door: 'doorShut', shutter: 'shutterOpen', guard: 'guardUp' };

/** The loop while it plays: where it has got to, and the clock that looks ahead. */
interface Tune {
  index: number;
  /** When the round of the loop that `index` is in began, on the context's clock. */
  loopAt: number;
  /** No note of the loop starts before this: a fanfare is playing. */
  restUntil: number;
  timer: ReturnType<typeof setInterval>;
}

/** A buffer is never worked out at more samples a second than this, whatever the sound card runs at. */
const TOP_RATE = 48000;
/** How long a sound takes to fade when it is cut short, in seconds. */
const CUT = 0.03;
/** The pause between working out one buffer and the next, in milliseconds, once the sound is on. */
const WARM_EVERY = 30;

/** How a reel's whirr winds down: over the last `ease` seconds, to `slowTo` of its speed, fading in the last `fade`. */
const WHIRR = { ease: 0.25, slowTo: 0.55, fade: 0.04, speeds: [1, 1.12, 0.9], shortest: 0.06, longest: 6 } as const;
/** When the reels stop if nobody says: left, centre, right. */
const USUAL_STOPS = [0.7, 1.6, 1.2] as const;

let rig: Rig | null = null;
let tune: Tune | null = null;
let musicWanted = false;
let air: Air | null = null;
let airWanted = false;
/** Whether the page is being watched for being hidden and shown again. */
let watching = false;
/** The volume the player has set, which a cabinet that is switched on later starts at. */
let volume: number = VOLUME.usual;
let warming: ReturnType<typeof setTimeout> | null = null;

/**
 * Builds the chain: one gain into one compressor into the speakers, and in
 * front of that gain one that only the loop goes through and one that only
 * the room does. Returns null where there is no audio to be had.
 */
function build(): Rig | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    const audio = new AudioContext();
    const master = audio.createGain();
    master.gain.value = masterGain(volume);
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = COMPRESSOR.threshold;
    compressor.knee.value = COMPRESSOR.knee;
    compressor.ratio.value = COMPRESSOR.ratio;
    compressor.attack.value = COMPRESSOR.attack;
    compressor.release.value = COMPRESSOR.release;
    master.connect(compressor);
    compressor.connect(audio.destination);
    const music = audio.createGain();
    music.gain.value = 1;
    music.connect(master);
    const room = audio.createGain();
    room.gain.value = 1;
    room.connect(master);
    // The context can stop and start by itself (a phone call, a lid closed); the loop and the room follow it.
    audio.onstatechange = () => sync();
    return {
      audio,
      master,
      music,
      duckedUntil: 0,
      air: room,
      bed: [],
      bedUntil: 0,
      room: [],
      rotor: [],
      rotorFrom: 0,
      rotorAt: 0,
      rotorUntil: -1,
      tray: { owed: 0, asked: -Infinity, next: 0 },
      rate: Math.min(TOP_RATE, audio.sampleRate),
      buffers: new Map(),
      voices: [],
      notes: [],
      starts: {},
      warmed: false,
    };
  } catch {
    return null;
  }
}

function bufferFor(target: Rig, sample: Sample, variant: number): AudioBuffer {
  const key = `${sample}:${variant}`;
  let buffer = target.buffers.get(key);
  if (!buffer) {
    const rate = LOW.has(sample) ? Math.min(LOW_RATE, target.rate) : target.rate;
    const samples = renderSound(sample, rate, variant);
    buffer = target.audio.createBuffer(1, samples.length, rate);
    buffer.getChannelData(0).set(samples);
    target.buffers.set(key, buffer);
  }
  return buffer;
}

/** Works the buffers out one at a time in the background, so that the first jackpot does not have to wait for its fanfare. */
function warm(target: Rig): void {
  if (target.warmed || warming !== null) return;
  target.warmed = true;
  const queue = WARMED.flatMap((sample) => Array.from({ length: VARIANTS[sample] ?? 1 }, (_, variant) => ({ sample, variant })));
  const next = () => {
    warming = null;
    const item = queue.shift();
    if (!item || rig !== target) return;
    try {
      bufferFor(target, item.sample, item.variant);
    } catch {
      return;
    }
    warming = setTimeout(next, WARM_EVERY);
  };
  warming = setTimeout(next, WARM_EVERY);
}

/** Forgets what has ended by itself. */
function prune(list: Playing[], now: number): void {
  let kept = 0;
  for (const playing of list) if (playing.until > now) list[kept++] = playing;
  list.length = kept;
}

/** Starts a buffer at `when`, at `level` and `speed`, into the master or the gain it is given, and stops it when it has run out. */
function begin(target: Rig, list: Playing[], buffer: AudioBuffer, when: number, level: number, speed: number, into: GainNode = target.master): Playing {
  const source = target.audio.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = speed;
  const playing: Playing = { source, gain: target.audio.createGain(), level: Math.min(LEVEL.ceiling, level), until: when + buffer.duration / speed };
  const { gain } = playing;
  gain.gain.value = playing.level;
  source.connect(gain);
  gain.connect(into);
  source.onended = () => gain.disconnect();
  source.start(when);
  source.stop(playing.until);
  list.push(playing);
  return playing;
}

/**
 * Plays `seconds` of a buffer that goes round and round, from `offset` seconds
 * into it, fading in and out over `cross`, so that one stretch can be faded
 * into the next.
 */
function stretch(target: Rig, list: Playing[], buffer: AudioBuffer, when: number, seconds: number, level: number, cross: number, offset: number, speed: number, into: GainNode): Playing {
  const source = target.audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = speed;
  const end = when + seconds;
  const playing: Playing = { source, gain: target.audio.createGain(), level: Math.min(LEVEL.ceiling, level), until: end, shaped: true };
  const { gain } = playing;
  gain.gain.value = 0;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(playing.level, when + cross);
  gain.gain.setValueAtTime(playing.level, end - cross);
  gain.gain.linearRampToValueAtTime(0, end);
  source.connect(gain);
  gain.connect(into);
  source.onended = () => gain.disconnect();
  source.start(when, ((offset % buffer.duration) + buffer.duration) % buffer.duration);
  source.stop(end);
  list.push(playing);
  return playing;
}

/** Cuts a sound short: a quick fade, so that it does not end in a click. */
function cut(target: Rig, playing: Playing): void {
  const now = target.audio.currentTime;
  try {
    const { gain } = playing.gain;
    if (playing.shaped && typeof gain.cancelAndHoldAtTime === 'function') {
      // What was fading in or out stops where it has got to, where the browser can say where that is.
      gain.cancelAndHoldAtTime(now);
    } else {
      // The level is the one it was started at rather than the one read back, which not every browser keeps up to date.
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(playing.level, now);
    }
    gain.linearRampToValueAtTime(0, now + CUT);
    playing.source.stop(now + CUT);
  } catch {
    // It had already ended.
  }
}

/**
 * Whether a sound may start now: not on top of itself, not past what a stream
 * of medals is allowed, and with a voice to spare for every source it is
 * about to start. `needed` is how many that is. It is counted from what will
 * be started (`reels`, `layOut`), never written down beside it: a count that
 * is kept apart from the thing it counts is wrong the day the thing grows.
 */
function admit(target: Rig, sound: PusherSound, now: number, needed: number): boolean {
  const clink = CLINKS.has(sound);
  const starts = (target.starts[sound] ??= []);
  while (starts.length > 0 && starts[0] <= now - LIMITS.window) starts.shift();
  const gap = clink ? LIMITS.window / LIMITS.clinks : sound === 'tick' || sound === 'hop' ? LIMITS.quickGap : LIMITS.gap;
  if (starts.length > 0 && now - starts[starts.length - 1] < gap - 1e-6) return false;
  if (clink && starts.length >= LIMITS.clinks) return false;
  if (clink && target.voices.length + needed > LIMITS.voices - LIMITS.kept) return false;
  while (target.voices.length + needed > LIMITS.voices) {
    const oldest = target.voices.shift();
    if (oldest) cut(target, oldest);
  }
  starts.push(now);
  return true;
}

/** Whether a reel that stops `given` seconds from now has time to turn at all. */
const turns = (given: number): boolean => Math.min(WHIRR.longest, given) > WHIRR.shortest;
/** How many reels a spin starts a whirr for. */
const reels = (stops: readonly number[]): number => stops.slice(0, WHIRR.speeds.length).filter(turns).length;

/**
 * The reels: one whirr for each, at its own speed so that the three are not
 * one sound, running until its reel stops and winding down as it does. The
 * last reel to stop winds down from the moment the one before it stopped,
 * which on a reach is a long way.
 */
function whirr(target: Rig, now: number, stops: readonly number[]): void {
  const buffer = bufferFor(target, 'spin', 0);
  const last = Math.max(...stops);
  stops.slice(0, WHIRR.speeds.length).forEach((given, reel) => {
    const stop = Math.min(WHIRR.longest, given);
    if (!turns(given)) return;
    const before = Math.max(0, ...stops.filter((other) => other < given));
    const winding = given === last ? Math.max(WHIRR.ease, stop - before) : WHIRR.ease;
    const speed = WHIRR.speeds[reel];
    const end = now + stop;
    const source = target.audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(speed, now);
    source.playbackRate.setValueAtTime(speed, now + Math.max(0, stop - winding));
    source.playbackRate.linearRampToValueAtTime(speed * WHIRR.slowTo, end);
    const gain = target.audio.createGain();
    gain.gain.setValueAtTime(SOUND_LEVELS.spin, now);
    gain.gain.setValueAtTime(SOUND_LEVELS.spin, end - WHIRR.fade);
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain);
    gain.connect(target.master);
    source.onended = () => gain.disconnect();
    // Each sets off from a different place in the buffer, so that their flutters do not fall together.
    source.start(now, (reel * buffer.duration) / WHIRR.speeds.length);
    source.stop(end);
    target.voices.push({ source, gain, level: SOUND_LEVELS.spin, until: end });
  });
}

/** How long a mechanism runs: as long as it is told, or as long as its medals take, or as long as it usually does. */
function runFor(sound: PusherSound, plan: Run, options: SoundOptions, hoppers: number): number {
  const rate = sound === 'hopper' ? HOPPER.rate * hoppers : sound === 'pour' ? CHUTE.rate : 0;
  const paying = rate > 0 && options.count !== undefined ? options.count / rate : plan.usual;
  const asked = options.seconds ?? paying;
  const longest = sound === 'hopper' ? HOPPER.longest : RUN.longest;
  return Math.min(longest, Math.max(RUN.shortest, Number.isFinite(asked) ? asked : plan.usual));
}

/** One thing a run starts besides its own turning: a take, when it begins, its level and its speed. */
interface Extra {
  sample: Sample;
  when: number;
  level: number;
  speed: number;
}

/**
 * A run as it will be started, worked out once: how long it was told and how
 * long the mechanism is heard, how long it waits, how many buffers go round
 * (a big payout's hoppers), and everything else in it. Admission takes a
 * voice for each of those, and `run` starts exactly those and nothing more.
 */
interface Laid {
  whole: number;
  seconds: number;
  wait: number;
  turning: number;
  extras: Extra[];
}

function layOut(sound: PusherSound, plan: Run, now: number, options: SoundOptions): Laid {
  const medals = options.count ?? 0;
  const turning = sound === 'hopper' && medals > 0 ? Math.min(HOPPER.speeds.length, Math.max(1, Math.ceil(medals / (HOPPER.rate * HOPPER.fair)))) : 1;
  // How long it was told, and how much of that the mechanism itself is heard for.
  const whole = runFor(sound, plan, options, turning);
  const seconds = whole * plan.share;
  // It may begin a little from now, but never so late that there is nothing left of it.
  const wait = Math.min(Math.max(0, seconds - RUN.shortest), Math.max(0, Number.isFinite(options.after) ? (options.after ?? 0) : 0));
  const extras: Extra[] = [];
  const once = (sample: Sample, when: number, level: number, speed = 1): void => {
    extras.push({ sample, when: Math.max(now, when), level, speed });
  };
  if (plan.start && (wait > 0 || !plan.start.dropped)) once(plan.start.sample, now + wait, plan.start.level);
  for (const moment of plan.moments ?? []) once(moment.sample, now + whole * moment.at, moment.level);
  if (plan.end) once(plan.end.sample, now + seconds - plan.end.before, plan.end.level);
  const near = options.nearMiss;
  if (sound === 'bowl' && near !== undefined && near > wait && near < seconds - plan.fall) once(NEAR_MISS.sample, now + near, NEAR_MISS.level, NEAR_MISS.speed);
  return { whole, seconds, wait, turning, extras };
}

/**
 * A mechanism running from now for as long as it is told: its buffer goes
 * round at a speed and a level that follow the mechanism, and what it ends in
 * is heard at the end. A hopper with a big payout is two or three of them.
 */
function run(target: Rig, sound: PusherSound, plan: Run, now: number, laid: Laid): void {
  const { seconds, wait, turning: hoppers } = laid;
  const buffer = bufferFor(target, sound, 0);
  const [setsOff, runs, stops] = plan.speeds;
  // A medal's own run is a little off true and a little quieter than the most it can be, as its clinks are: no two medals are one medal.
  const medal = CLINKS.has(sound);
  const detune = medal ? wander() : 1;
  const loud = medal ? 1 - Math.random() * WANDER.level : 1;
  for (let layer = 0; layer < hoppers; layer++) {
    // Each of several joins after the one before it and leaves before it, unless there is no time to.
    const apart = Math.min(HOPPER.apart, (seconds - wait) / 8) * layer;
    const from = now + wait + apart;
    const end = now + seconds - apart;
    const length = end - from;
    const speed = (hoppers > 1 ? HOPPER.speeds[layer] : 1) * detune;
    const level = SOUND_LEVELS[sound] * (hoppers > 1 ? HOPPER.levels[layer] : 1) * loud;
    const rise = Math.min(plan.rise, length / 4);
    const fall = Math.min(plan.fall, length / 4);
    const source = target.audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(setsOff * speed, from);
    const reach = plan.knee !== undefined ? length * plan.knee : Math.min(plan.spin, length / 2);
    if (reach > 0) source.playbackRate.linearRampToValueAtTime(runs * speed, from + reach);
    source.playbackRate.linearRampToValueAtTime(stops * speed, end);
    const gain = target.audio.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, from);
    gain.gain.linearRampToValueAtTime(level, from + rise);
    gain.gain.setValueAtTime(level, from + Math.max(rise, Math.min(length - fall, length * plan.from)));
    gain.gain.linearRampToValueAtTime(level * plan.thin, end - fall);
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain);
    gain.connect(target.master);
    source.onended = () => gain.disconnect();
    // Each time from somewhere else in the buffer, so that no two runs begin alike.
    source.start(from, Math.random() * buffer.duration);
    source.stop(end);
    target.voices.push({ source, gain, level, until: end, shaped: true });
  }
  for (const extra of laid.extras) {
    const takes = VARIANTS[extra.sample] ?? 1;
    begin(target, target.voices, bufferFor(target, extra.sample, Math.floor(Math.random() * takes)), extra.when, extra.level * loud, extra.speed * detune);
  }
  // A payout is medals, and the loop makes room for it as it does for the tray.
  if (sound === 'hopper' || sound === 'pour') duck(target, now, now + seconds);
}

/**
 * The rotor of the roulette's wheel. Call it once a frame for as long as the
 * wheel is in play, between turns as well: it is one unbroken sound however
 * many turns the ball has, and it runs down within half a second of the calls
 * stopping. It needs no timer and plays nothing while the sound is off.
 */
export function turnRotor(enabled: boolean): void {
  if (!enabled || !rig || rig.audio.state !== 'running') return;
  try {
    const now = rig.audio.currentTime;
    if (now < rig.rotorUntil - ROTOR.overlap - ROTOR.lead) return;
    prune(rig.rotor, now);
    const buffer = bufferFor(rig, 'rotor', 0);
    // A stretch that follows another takes the buffer up where that one is as it begins to fade, so that the two are one sound.
    const follows = now <= rig.rotorUntil;
    const when = follows ? Math.max(now, rig.rotorUntil - ROTOR.overlap) : now;
    const offset = follows ? rig.rotorAt + (when - rig.rotorFrom) : Math.random() * buffer.duration;
    const length = ROTOR.stretch + ROTOR.overlap;
    stretch(rig, rig.rotor, buffer, when, length, ROTOR.level, ROTOR.overlap, offset, 1, rig.master);
    rig.rotorFrom = when;
    rig.rotorAt = offset;
    rig.rotorUntil = when + length;
  } catch {
    // The wheel turns without being heard.
  }
}

/**
 * The machine itself. Call it once a frame with the machine's own clock,
 * `machine.time`, which is what the pusher is drawn from: the bed is played
 * from where in its stroke the pusher is, a stretch at a time, so that the
 * strain is heard as it shoves and the clunk as it turns back. It needs no
 * timer: when the frames stop, the stretch that is playing is the last. It
 * plays nothing while the sound is off or the audio is not running.
 */
export function turnMotor(enabled: boolean, time: number): void {
  if (!enabled || !rig || rig.audio.state !== 'running' || !Number.isFinite(time)) return;
  try {
    const now = rig.audio.currentTime;
    if (now < rig.bedUntil - MOTOR.overlap - MOTOR.lead) return;
    prune(rig.bed, now);
    // The next stretch begins as the last begins to fade, and where the pusher will be by then.
    const when = Math.max(now, rig.bedUntil - MOTOR.overlap);
    const length = MOTOR.stretch + MOTOR.overlap;
    stretch(rig, rig.bed, bufferFor(rig, 'motor', 0), when, length, MOTOR.level, MOTOR.overlap, time + (when - now), 1, rig.master);
    rig.bedUntil = when + length;
  } catch {
    // The machine turns without being heard.
  }
}

/** A speed to play a medal at, a little off true, so that no two are the same medal. */
const wander = (): number => 1 - WANDER.pitch / 2 + Math.random() * WANDER.pitch;

/** Turns the loop down from now until `until`, and lets it come back after the last rattle that asked. */
function duck(target: Rig, now: number, until: number): void {
  target.duckedUntil = Math.max(target.duckedUntil, until);
  const { gain } = target.music;
  gain.cancelScheduledValues(now);
  gain.setTargetAtTime(MUSIC.ducked, now, MUSIC.duck);
  gain.setTargetAtTime(1, target.duckedUntil, MUSIC.swell);
}

/**
 * Medals into the tray. They are added to what the tray is owed, and as much
 * of that as there is room for is started: the largest rattle that does not
 * overshoot, then the next, each a moment after the one before. A single medal
 * is a single clink, a handful is a short rattle, a tower going over is
 * rattles of sixteen and thirty-two. What cannot start yet stays owed and
 * joins the next win as part of a larger rattle, so that a stream of medals,
 * however thick, is never more than `LIMITS.tray` sources. Medals that are
 * seen to land in the tray (`tray`) are heard `atOnce`; medals that went over
 * the front (`win`) are heard after the fall.
 */
function trayful(target: Rig, now: number, count: number, atOnce = false): void {
  const { tray } = target;
  if (now - tray.asked > TRAY.forget) tray.owed = 0;
  tray.asked = now;
  tray.owed = Math.min(LIMITS.owed, tray.owed + count);
  let sounding = target.voices.filter((playing) => playing.tray).length;
  for (let started = 0; started < TRAY.atOnce && tray.owed > 0; started++) {
    // The smallest rattle that may start now. Past the last of them the tray is full.
    const least: Pour | undefined = POURS[Math.max(0, sounding - (LIMITS.tray - POURS.length))];
    const size = POURS.reduce<Pour>((best, pour) => (pour <= tray.owed ? pour : best), 1);
    if (least === undefined || size < least || target.voices.length >= LIMITS.voices - LIMITS.kept) return;
    const fall = atOnce ? 0 : TRAY.fall[0] + Math.random() * (TRAY.fall[1] - TRAY.fall[0]);
    const when = Math.max(now + fall, tray.next);
    if (when > now + TRAY.ahead) return;
    const sample = POUR_SAMPLES[size];
    const buffer = bufferFor(target, sample, Math.floor(Math.random() * (VARIANTS[sample] ?? 1)));
    const playing = begin(target, target.voices, buffer, when, pourLevel(size) * (1 - Math.random() * TRAY.wander), wander());
    playing.tray = true;
    tray.next = when + TRAY.spacing;
    tray.owed -= size;
    sounding += 1;
    if (size > 1) duck(target, now, playing.until);
  }
}

function start(target: Rig, sound: PusherSound, options: SoundOptions): void {
  const now = target.audio.currentTime;
  prune(target.voices, now);
  if (sound === 'win' || sound === 'tray') {
    const count = Math.round(options.count ?? 1);
    trayful(target, now, count >= 1 ? count : 1, sound === 'tray');
    return;
  }
  const plan = sound === 'bowl' && options.quickens ? FUNNEL : RUNS[sound];
  const laid = plan ? layOut(sound, plan, now, options) : null;
  const stops = options.stops ?? USUAL_STOPS;
  // A voice for every source it will start: a mechanism's turning and everything in it, the reels that turn, or the one take.
  const needed = laid ? laid.turning + laid.extras.length : sound === 'spin' ? reels(stops) : 1;
  if (!admit(target, sound, now, needed)) return;
  if (sound === 'spin') {
    whirr(target, now, stops);
    return;
  }
  if (plan && laid) {
    run(target, sound, plan, now, laid);
    return;
  }
  // A medal that lands comes down on the table or on other medals, and they are different sounds. A button, a door,
  // a shutter and a guard go one way and come back the other. A gold entry has an answer of its own.
  const golden = sound === 'start' && options.gold === true;
  const sample: Sample =
    sound === 'land' && (options.bare ?? Math.random() < BARE_SHARE) ? 'plate' : golden ? ENTRY.gold.sample : ((options.up && UPS[sound]) || sound);
  const takes = VARIANTS[sample] ?? 1;
  const clink = CLINKS.has(sound);
  const variant = sound === 'pocket' ? Math.min(takes, Math.max(1, Math.round(options.level ?? 1))) - 1 : Math.floor(Math.random() * takes);
  const buffer = bufferFor(target, sample, variant);
  // A take that is as long as something takes to get somewhere, a guard to its seat or a light to its lamp, is played
  // slower or faster when it is given longer or shorter to get there, within what still sounds like it.
  const natural = sound === 'guard' ? (options.up ? GUARD.up : GUARD.down) : sound === 'spark' ? ENTRY.spark.seconds : 0;
  const travel = natural > 0 && options.seconds !== undefined && options.seconds > 0 ? Math.min(1.6, Math.max(0.6, natural / options.seconds)) : 1;
  const speed = clink ? wander() : travel;
  const level = (golden ? ENTRY.gold.level : SOUND_LEVELS[sound]) * (clink ? 1 - Math.random() * WANDER.level : 1);
  begin(target, target.voices, buffer, clink ? now + Math.random() * WANDER.late : now, level, speed);
  if (tune && RESTS.has(sound)) {
    tune.restUntil = now + buffer.duration;
    // What the loop has in the air, or lined up within its look-ahead, would ring on over the fanfare.
    for (const note of target.notes) cut(target, note);
    target.notes.length = 0;
  }
}

/** Schedules the notes of the loop that fall within the next `MUSIC.ahead` seconds. */
function pump(): void {
  if (!rig || !tune) return;
  try {
    const now = rig.audio.currentTime;
    prune(rig.notes, now);
    // A clock that has run on without us is caught up with by leaving rounds out, not by playing them late.
    if (now > tune.loopAt + MUSIC.length) {
      tune.loopAt += Math.floor((now - tune.loopAt) / MUSIC.length) * MUSIC.length;
      tune.index = 0;
    }
    const horizon = now + MUSIC.ahead;
    for (let looked = 0; looked < LOOP.length * 2; looked++) {
      const note = LOOP[tune.index];
      const at = tune.loopAt + note.at;
      if (at >= horizon) break;
      if (at >= now && at >= tune.restUntil && rig.notes.length < MUSIC.voices) {
        begin(rig, rig.notes, bufferFor(rig, note.sample, 0), at, note.level, note.speed, rig.music);
      }
      tune.index += 1;
      if (tune.index === LOOP.length) {
        tune.index = 0;
        tune.loopAt += MUSIC.length;
      }
    }
  } catch {
    // A note that cannot be scheduled is simply not heard.
  }
}

function stopMusic(): void {
  if (!tune) return;
  clearInterval(tune.timer);
  tune = null;
  if (!rig) return;
  for (const note of rig.notes) cut(rig, note);
  rig.notes.length = 0;
}

/**
 * How long until the next of a kind: at random, as things come that have
 * nothing to do with one another, but never on top of the last and never an
 * age after it.
 */
const farGap = (kind: FarKind): number => AMBIENCE.gaps[kind] * Math.min(3, Math.max(0.25, -Math.log(1 - Math.random())));

/** Lines up what of the room falls within the next `AMBIENCE.ahead` seconds: the next stretch of its tone, and whatever is due from far off. */
function breathe(): void {
  const target = rig;
  if (!target || !air) return;
  try {
    const now = target.audio.currentTime;
    prune(target.room, now);
    // At most one buffer of the room is worked out in a turn, so that switching the room on never stalls the machine.
    let spare = 1;
    const ready = (sample: Sample, variant: number): boolean => target.buffers.has(`${sample}:${variant}`) || spare-- > 0;
    const { room, wander } = AMBIENCE;
    if (now >= air.toneUntil - room.cross - AMBIENCE.ahead && ready('room', 0)) {
      const buffer = bufferFor(target, 'room', 0);
      const when = Math.max(now, air.toneUntil - room.cross);
      const speed = 1 - room.wander / 2 + Math.random() * room.wander;
      stretch(target, target.room, buffer, when, room.seconds, room.level, room.cross, Math.random() * buffer.duration, speed, target.air);
      air.toneUntil = when + room.seconds;
    }
    for (const kind of FAR_KINDS) {
      if (air.next[kind] >= now + AMBIENCE.ahead) continue;
      const variant = Math.floor(Math.random() * (VARIANTS[kind] ?? 1));
      // One that cannot be worked out yet is tried again on the next turn.
      if (!ready(kind, variant)) continue;
      const when = Math.max(now, air.next[kind]);
      // The tone's stretches are told from the rest by being faded in and out.
      const farOff = target.room.reduce((count, playing) => count + (playing.shaped ? 0 : 1), 0);
      if (farOff < AMBIENCE.voices - AMBIENCE.kept) {
        const level = AMBIENCE.level * (1 - Math.random() * wander.level);
        begin(target, target.room, bufferFor(target, kind, variant), when, level, 1 - wander.speed / 2 + Math.random() * wander.speed, target.air);
      }
      air.next[kind] = when + farGap(kind);
    }
  } catch {
    // What cannot be lined up is simply not heard.
  }
}

function stopAir(): void {
  if (!air) return;
  clearInterval(air.timer);
  air = null;
  if (!rig) return;
  for (const playing of rig.room) cut(rig, playing);
  rig.room.length = 0;
}

/**
 * Starts or stops the loop and the room, each to match whether it is wanted,
 * whether the audio is running and whether the page can be seen.
 */
function sync(): void {
  const hidden = typeof document !== 'undefined' && document.hidden;
  const target = rig && rig.audio.state === 'running' && !hidden ? rig : null;
  if (MUSIC_ON && musicWanted && target) {
    if (!tune) {
      tune = { index: 0, loopAt: target.audio.currentTime + 0.06, restUntil: 0, timer: setInterval(pump, MUSIC.every * 1000) };
      pump();
    }
  } else {
    stopMusic();
  }
  if (airWanted && target) {
    if (!air) {
      const now = target.audio.currentTime;
      // The first of each kind comes when it comes, not all of them the moment the room is switched on.
      const next = Object.fromEntries(FAR_KINDS.map((kind) => [kind, now + AMBIENCE.gaps[kind] * Math.random()])) as Record<FarKind, number>;
      air = { toneUntil: 0, next, timer: setInterval(breathe, AMBIENCE.every * 1000) };
      breathe();
    }
  } else {
    stopAir();
  }
}

/** Watches the page for being hidden and shown again for as long as anything that has to stop with it is wanted. */
function watch(): void {
  const wanted = musicWanted || airWanted;
  if (wanted === watching) return;
  watching = wanted;
  if (typeof document === 'undefined') return;
  if (wanted) document.addEventListener('visibilitychange', sync);
  else document.removeEventListener('visibilitychange', sync);
}

/**
 * Wakes the audio up; call it from the click that switches the sound on.
 * Nothing exists before the first call: no context, no node, no buffer.
 */
export async function unlockAudio(): Promise<void> {
  rig ??= build();
  const target = rig;
  if (!target) return;
  try {
    if (target.audio.state !== 'running' && target.audio.state !== 'closed') await target.audio.resume();
  } catch {
    return;
  }
  if (rig !== target) return;
  warm(target);
  sync();
}

/**
 * Plays a sound, if the sound is on and the audio is running. A sound that
 * cannot be played is left out; it never throws into the game.
 */
export function playSound(sound: PusherSound, enabled: boolean, options: SoundOptions = {}): void {
  if (!enabled || !rig || rig.audio.state !== 'running') return;
  try {
    start(rig, sound, options);
  } catch {
    // The game goes on without it.
  }
}

/**
 * Sets how loud the whole cabinet is, from `VOLUME.least` to `VOLUME.most`
 * times the level it was made at. It can be called at any time. Before the
 * sound has been switched on, it is what the cabinet will start at; once it
 * is on, the level glides there, whatever is playing. A volume outside the
 * range is brought into it, and one that is not a number is ignored.
 */
export function setVolume(next: number): void {
  if (!Number.isFinite(next)) return;
  volume = Math.min(VOLUME.most, Math.max(VOLUME.least, next));
  if (!rig) return;
  try {
    const now = rig.audio.currentTime;
    const { gain } = rig.master;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(masterGain(volume), now, VOLUME.glide);
  } catch {
    // The level stays where it was.
  }
}

/**
 * Switches the background loop on or off. It plays only while it is wanted,
 * the sound has been unlocked and the page can be seen, and stops at once
 * otherwise.
 */
export function setMusic(on: boolean): void {
  musicWanted = on;
  watch();
  sync();
}

/**
 * Switches the room on or off: the floor of an arcade, heard from this
 * cabinet. Like the loop, it is heard only while it is wanted, the sound has
 * been unlocked and the page can be seen, and stops at once otherwise. It goes
 * through the same volume and the same limiter as everything else, and has
 * nothing to do with the loop: either can be on without the other.
 */
export function setAmbience(on: boolean): void {
  airWanted = on;
  watch();
  sync();
}

/**
 * Cuts short everything the cabinet is sounding, its own bed included: for
 * when the sound is switched off, the cabinet is left, or the machine is
 * reset. The room is not the cabinet's: it stops when it is switched off.
 */
export function hush(): void {
  if (!rig) return;
  for (const playing of [...rig.voices, ...rig.notes, ...rig.bed, ...rig.rotor]) cut(rig, playing);
  rig.voices.length = 0;
  rig.notes.length = 0;
  rig.bed.length = 0;
  rig.rotor.length = 0;
  rig.rotorUntil = -1;
  // The machine's bed starts afresh, from wherever the pusher is, on the next frame it is asked for.
  rig.bedUntil = 0;
  // Medals that were still to be heard in the tray are not heard after all.
  rig.tray.owed = 0;
  rig.tray.next = 0;
  // Nor is there a rattle left for the loop to make room for. It comes back to its own level once what was
  // cut has faded, rather than staying down until the end of a rattle that will never be heard.
  rig.duckedUntil = 0;
  const now = rig.audio.currentTime;
  const { gain } = rig.music;
  gain.cancelScheduledValues(now);
  gain.setTargetAtTime(1, now + CUT, MUSIC.duck);
}

/** Forgets the audio altogether, the volume included, as if the page had just been opened. The tests start from here. */
export function resetAudio(): void {
  setMusic(false);
  setAmbience(false);
  volume = VOLUME.usual;
  if (warming !== null) clearTimeout(warming);
  warming = null;
  if (rig) {
    try {
      void rig.audio.close().catch(() => undefined);
    } catch {
      // It was closed already.
    }
  }
  rig = null;
}
