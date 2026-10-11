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
 * They only play once the player has switched the sound on, which is also the
 * gesture a browser needs before it lets a page make noise.
 */

// ── What there is to hear ───────────────────────────────────────────────────

/** Every sound the cabinet makes, the ones heard most often first. */
export const SOUNDS = [
  'land',
  'insert',
  'win',
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
const EXTRA_SAMPLES = ['plate', 'pour2', 'pour4', 'pour8', 'pour16', 'pour32'] as const;
type ExtraSample = (typeof EXTRA_SAMPLES)[number];
/** The buffer for each size of rattle. One medal by itself is the `win`. */
export const POUR_SAMPLES: Record<Pour, PusherSound | ExtraSample> = { 1: 'win', 2: 'pour2', 4: 'pour4', 8: 'pour8', 16: 'pour16', 32: 'pour32' };

/** Everything that is kept as a buffer, the medals first: they are worked out in this order once the sound is on. */
export type Sample = PusherSound | ExtraSample | LoopSample;
export const SAMPLES: readonly Sample[] = [
  ...new Set<Sample>(['land', 'plate', 'insert', 'win', 'pour2', 'pour4', 'pour8', 'lost', ...SOUNDS, ...EXTRA_SAMPLES, ...LOOP_SAMPLES]),
];

/** What a sound may be told when it is played. */
export interface SoundOptions {
  /** For `spin`: when each reel stops, in seconds from now. Each reel's whirr lasts as long as it turns. */
  stops?: readonly number[];
  /** For `pocket`: how many numbers the roulette's run has reached. The tone climbs with it. */
  level?: number;
  /** For `win`: how many medals went over the front together. Every one of them is heard in the tray. */
  count?: number;
  /**
   * For `land`: whether the medal came down on the bare table rather than on
   * other medals. Left out, it is one or the other by chance, more often the medals.
   */
  bare?: boolean;
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
  /** The one place to turn the whole cabinet up or down. */
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
 * The peak each sound is played at. A medal is played a little under it, by a
 * different amount each time. The medals are played as high as anything on the
 * cabinet but a fanfare, and four times as high as the loop: they are what a
 * pusher sounds like. `win` is one medal in the tray; a rattle of more is
 * louder, up to the ceiling for the largest.
 */
export const SOUND_LEVELS: Record<PusherSound, number> = {
  land: 0.1,
  insert: 0.09,
  win: 0.1,
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
  roulette: 0.04,
  pocket: 0.07,
  tower: 0.09,
  cross: 0.075,
  crash: 0.1,
  fever: 0.095,
  jackpot: 0.11,
};

/** The peak a rattle of `size` medals is played at: from a single medal's level up to the ceiling. */
export const pourLevel = (size: number): number =>
  SOUND_LEVELS.win + (LEVEL.ceiling - SOUND_LEVELS.win) * (Math.log2(size) / Math.log2(POURS[POURS.length - 1]));

/** The medals themselves, the tray apart: the sounds that come in streams, each a little different from the last. */
const CLINKS: ReadonlySet<PusherSound> = new Set<PusherSound>(['land', 'insert', 'lost', 'roll']);

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

/** How far a clink's pitch and level wander from one medal to the next. */
const WANDER = { pitch: 0.1, level: 0.3 } as const;

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
  // The pusher's table: thick and dead.
  table: { hz: 1300, q: 1.2, loud: 1, ring: 0.006, modes: [[420, 0.5, 0.012]] },
  // The throat of the slot: thin metal, higher and shorter.
  chute: { hz: 2700, q: 1.4, loud: 1.2, ring: 0.008, modes: [[900, 0.3, 0.006], [3300, 0.3, 0.007]] },
  // The gutter down the side: plastic. It takes the hit and gives back a knock.
  gutter: { hz: 800, q: 1, loud: 0.8, ring: 0.012, modes: [[210, 0.6, 0.028]] },
  // A pile of other medals: they chatter against one another for a few milliseconds, all over the place.
  pile: { hz: 4200, q: 0.7, loud: 1.6, ring: 0.005, modes: [[950, 0.3, 0.005]] },
  // A plastic rail under a medal's edge.
  rail: { hz: 1700, q: 1.5, loud: 0.35, ring: 0.0015, modes: [[600, 0.4, 0.002]] },
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

/** `count` medals into the tray: every strike is the medal and the tray together. */
function pour(rate: number, count: number, variant: number): Take {
  const seed = pourSeed(count, variant);
  const hits = pourHits(count, seed);
  const t = take(LEAD + hits[hits.length - 1].at + POUR.tail, rate);
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

const jingle =
  (music: Score) =>
  (rate: number): Take => {
    const t = take(music.length + music.tail, rate);
    perform(t, music);
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
};

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
  // The stock is full and the medal was wasted: two soft knocks on wood.
  full: (rate) => {
    const t = take(0.24, rate);
    [520, 440].forEach((hz, index) => {
      glide(t, index * 0.09, 0.12, hz, hz * 0.75, 0.04, dying(0.02));
      hiss(t, index * 0.09, 0.03, dying(0.006, 0.25), { kind: 'band', hz: 1500, q: 1.5 }, 61 + index);
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
  // A lamp of the roulette lighting.
  tick: (rate) => {
    const t = take(0.06, rate);
    ping(t, 0, 1900, 1, 0.008);
    ping(t, 0, 2850, 0.4, 0.005);
    hiss(t, 0, 0.01, dying(0.002, 0.2), { kind: 'band', hz: 4000, q: 1 }, 91);
    return t;
  },
  // The piece hopping a square: a short rising blip and the tap of it coming down.
  hop: (rate) => {
    const t = take(0.14, rate);
    glide(t, 0, 0.13, 520, 800, 0.07, swell(0.004, 0.03));
    hiss(t, 0, 0.03, dying(0.008, 0.2), { kind: 'low', hz: 900, q: 0.7 }, 101);
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
  // A chest opening: the latch, the hinge — a creak is a run of tiny slips that come faster — and what is inside coming up to meet the prize.
  open: (rate) => {
    const t = take(1.1, rate);
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
    const rise = (level: number) => (seconds: number) => level * (seconds / 0.7) ** 2;
    hiss(t, 0.4, 0.7, rise(0.3), { kind: 'band', hz: 900, to: 5200, q: 2 }, 132);
    glide(t, 0.4, 0.7, 500, 1500, 0.7, rise(0.25));
    return t;
  },
  prize: jingle(SCORES.prize),
  ball: jingle(SCORES.ball),
  // The roulette setting off: a quick sweep up two octaves and a bell at the top of it.
  roulette: (rate) => {
    const t = take(0.7, rate);
    const level = (seconds: number) => Math.min(1, seconds / 0.02) * (seconds < 0.28 ? 1 : Math.exp(-(seconds - 0.28) / 0.03));
    glide(t, 0, 0.45, 420, 1680, 0.3, (seconds) => 0.6 * level(seconds));
    glide(t, 0, 0.45, 840, 3360, 0.3, (seconds) => 0.2 * level(seconds));
    bell(t, 0.3, pitch('E6'), 0.8, 0.12);
    return t;
  },
  // A number: a bell and the fifth above it, higher for every number the run has reached.
  pocket: (rate, variant) => {
    const t = take(0.8, rate);
    const hz = POCKET_NOTES[variant];
    bell(t, 0, hz, 1, 0.2);
    bell(t, 0, hz * 1.5, 0.5, 0.16);
    bell(t, 0.05, hz * 2, 0.35, 0.14);
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
    return t;
  },
  bass: (rate) => {
    const t = take(0.9, rate);
    tone(t, 0, REFERENCE.bass, 0.8, 1, PLUCK);
    return t;
  },
};

/** Takes out what lies below `BOTTOM`, begins and ends the take in silence and brings its peak to exactly 1. */
function finish(t: Take): Float32Array {
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
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    const y = b0 * (x - 2 * x1 + x2) - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  // Half a millisecond in, which leaves a strike its edge, and four out.
  const rise = Math.min(out.length, Math.round(0.0005 * rate));
  for (let i = 0; i < rise; i++) out[i] *= i / rise;
  const fade = Math.min(out.length, Math.round(0.004 * rate));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return out;
}

/** The samples of a sound at `rate` samples a second: one channel, peaking at exactly 1, the same every time. */
export function renderSound(sample: Sample, rate: number, variant = 0): Float32Array {
  const takes = VARIANTS[sample] ?? 1;
  return finish(RECIPES[sample](rate, Math.min(takes - 1, Math.max(0, Math.floor(variant)))));
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
  tray: Tray;
  /** The rate buffers are worked out at. */
  rate: number;
  buffers: Map<string, AudioBuffer>;
  /** What `playSound` has started and the loop's notes, each in the order they began. */
  voices: Playing[];
  notes: Playing[];
  /** When each sound was last started, within the last `LIMITS.window` seconds. */
  starts: Partial<Record<PusherSound, number[]>>;
  warmed: boolean;
}

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
let warming: ReturnType<typeof setTimeout> | null = null;

/**
 * Builds the chain: one gain into one compressor into the speakers, and in
 * front of that gain another that only the loop goes through. Returns null
 * where there is no audio to be had.
 */
function build(): Rig | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    const audio = new AudioContext();
    const master = audio.createGain();
    master.gain.value = MASTER_GAIN;
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
    // The context can stop and start by itself (a phone call, a lid closed); the loop follows it.
    audio.onstatechange = () => syncMusic();
    return {
      audio,
      master,
      music,
      duckedUntil: 0,
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
    const samples = renderSound(sample, target.rate, variant);
    buffer = target.audio.createBuffer(1, samples.length, target.rate);
    buffer.getChannelData(0).set(samples);
    target.buffers.set(key, buffer);
  }
  return buffer;
}

/** Works the buffers out one at a time in the background, so that the first jackpot does not have to wait for its fanfare. */
function warm(target: Rig): void {
  if (target.warmed || warming !== null) return;
  target.warmed = true;
  const queue = SAMPLES.flatMap((sample) => Array.from({ length: VARIANTS[sample] ?? 1 }, (_, variant) => ({ sample, variant })));
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

/** Cuts a sound short: a quick fade, so that it does not end in a click. */
function cut(target: Rig, playing: Playing): void {
  const now = target.audio.currentTime;
  try {
    // The level is the one it was started at rather than the one read back, which not every browser keeps up to date.
    const { gain } = playing.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(playing.level, now);
    gain.linearRampToValueAtTime(0, now + CUT);
    playing.source.stop(now + CUT);
  } catch {
    // It had already ended.
  }
}

/** Whether a sound may start now: not on top of itself, not past what a stream of medals is allowed, and with a voice to spare. */
function admit(target: Rig, sound: PusherSound, now: number): boolean {
  const clink = CLINKS.has(sound);
  const starts = (target.starts[sound] ??= []);
  while (starts.length > 0 && starts[0] <= now - LIMITS.window) starts.shift();
  const gap = clink ? LIMITS.window / LIMITS.clinks : sound === 'tick' || sound === 'hop' ? LIMITS.quickGap : LIMITS.gap;
  if (starts.length > 0 && now - starts[starts.length - 1] < gap - 1e-6) return false;
  if (clink && starts.length >= LIMITS.clinks) return false;
  const needed = sound === 'spin' ? WHIRR.speeds.length : 1;
  if (clink && target.voices.length + needed > LIMITS.voices - LIMITS.kept) return false;
  while (target.voices.length + needed > LIMITS.voices) {
    const oldest = target.voices.shift();
    if (oldest) cut(target, oldest);
  }
  starts.push(now);
  return true;
}

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
    if (!(stop > WHIRR.shortest)) return;
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
 * however thick, is never more than `LIMITS.tray` sources.
 */
function trayful(target: Rig, now: number, count: number): void {
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
    const when = Math.max(now + TRAY.fall[0] + Math.random() * (TRAY.fall[1] - TRAY.fall[0]), tray.next);
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
  if (sound === 'win') {
    const count = Math.round(options.count ?? 1);
    trayful(target, now, count >= 1 ? count : 1);
    return;
  }
  if (!admit(target, sound, now)) return;
  if (sound === 'spin') {
    whirr(target, now, options.stops ?? USUAL_STOPS);
    return;
  }
  // A medal that lands comes down on the table or on other medals, and they are different sounds.
  const sample: Sample = sound === 'land' && (options.bare ?? Math.random() < BARE_SHARE) ? 'plate' : sound;
  const takes = VARIANTS[sample] ?? 1;
  const clink = CLINKS.has(sound);
  const variant = sound === 'pocket' ? Math.min(takes, Math.max(1, Math.round(options.level ?? 1))) - 1 : Math.floor(Math.random() * takes);
  const buffer = bufferFor(target, sample, variant);
  const speed = clink ? wander() : 1;
  const level = SOUND_LEVELS[sound] * (clink ? 1 - Math.random() * WANDER.level : 1);
  begin(target, target.voices, buffer, now, level, speed);
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

/** Starts or stops the loop to match what is wanted, whether the audio is running and whether the page can be seen. */
function syncMusic(): void {
  const hidden = typeof document !== 'undefined' && document.hidden;
  if (MUSIC_ON && musicWanted && rig?.audio.state === 'running' && !hidden) {
    if (tune) return;
    tune = { index: 0, loopAt: rig.audio.currentTime + 0.06, restUntil: 0, timer: setInterval(pump, MUSIC.every * 1000) };
    pump();
  } else {
    stopMusic();
  }
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
  syncMusic();
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
 * Switches the background loop on or off. It plays only while it is wanted,
 * the sound has been unlocked and the page can be seen, and stops at once
 * otherwise.
 */
export function setMusic(on: boolean): void {
  if (on !== musicWanted) {
    musicWanted = on;
    if (typeof document !== 'undefined') {
      if (on) document.addEventListener('visibilitychange', syncMusic);
      else document.removeEventListener('visibilitychange', syncMusic);
    }
  }
  syncMusic();
}

/** Cuts short everything that is sounding: for when the sound is switched off or the cabinet is left. */
export function hush(): void {
  if (!rig) return;
  for (const playing of [...rig.voices, ...rig.notes]) cut(rig, playing);
  rig.voices.length = 0;
  rig.notes.length = 0;
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

/** Forgets the audio altogether, as if the page had just been opened. The tests start from here. */
export function resetAudio(): void {
  setMusic(false);
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
