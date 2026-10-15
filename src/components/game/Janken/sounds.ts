/**
 * The machine's sounds, all of them made here, in the way the Medal Pusher's
 * are (`MedalPusher/sounds.ts`): each is worked out in plain arithmetic the
 * first time it is needed — a few dying sines for struck metal, notes with
 * their overtones for the tunes, a burst of filtered noise — and kept as a
 * short buffer for the Web Audio API to play back. Nothing is downloaded and
 * nothing is recorded: there is no voice. The cat's call is a tune of its own
 * on a toy lead, and its laugh when the player loses is a slide whistle and a
 * wooden bonk, not anybody's words.
 *
 * Worked out as numbers, they can be measured by a test that nobody has to
 * listen to: that each begins and ends in silence and is never too loud.
 */

export const SOUNDS = ['coin', 'button', 'call', 'aiko', 'pon', 'win', 'lose', 'tick', 'stop', 'medal', 'double', 'big'] as const;
export type JankenSound = (typeof SOUNDS)[number];

/** How loud the loudest moment of any sound is, out of 1. */
export const PEAK = 0.8;
/** How long each sound fades in and out, in seconds, so that none starts or stops with a click. */
const EDGE = 0.004;

const TAU = Math.PI * 2;

interface Take {
  out: Float32Array;
  rate: number;
}
const take = (seconds: number, rate: number): Take => ({ out: new Float32Array(Math.ceil(seconds * rate)), rate });

/** A note's frequency from its name: A4 is 440 Hz. */
export function pitch(name: string): number {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!match) throw new Error(`not a note: ${name}`);
  const steps: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const semitone = steps[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + (Number(match[3]) - 4) * 12;
  return 440 * 2 ** (semitone / 12);
}

/** Random numbers that are the same every time, for noise that sounds the same every time. */
function noise(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) / 4294967296) * 2 - 1;
  };
}

/** A struck piece of metal: partials that ring and die, the higher ones sooner. */
function ping(t: Take, at: number, hz: number, level: number, ring: number): void {
  const start = Math.floor(at * t.rate);
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.76, 0.5, 0.6],
    [5.4, 0.25, 0.35],
  ];
  const length = Math.min(t.out.length - start, Math.ceil(ring * 5 * t.rate));
  for (let i = 0; i < length; i++) {
    const s = i / t.rate;
    let v = 0;
    for (const [ratio, weight, life] of partials) {
      const f = hz * ratio;
      if (f > t.rate * 0.45) continue;
      v += weight * Math.sin(TAU * f * s) * Math.exp(-s / (ring * life));
    }
    t.out[start + i] += level * v * Math.min(1, s / 0.0015);
  }
}

/** A note on the machine's toy lead: a square-ish tone with its odd overtones, a quick start and a short release. */
function note(t: Take, at: number, hz: number, length: number, level: number, vibrato = 0): void {
  const start = Math.floor(at * t.rate);
  const total = Math.min(t.out.length - start, Math.ceil((length + 0.06) * t.rate));
  let phase = 0;
  for (let i = 0; i < total; i++) {
    const s = i / t.rate;
    const f = hz * (1 + vibrato * Math.sin(TAU * 6 * s) * Math.min(1, s / 0.15));
    phase += (TAU * f) / t.rate;
    let v = 0;
    for (let k = 1; k <= 7; k += 2) if (f * k < t.rate * 0.45) v += Math.sin(phase * k) / k;
    const envelope = Math.min(1, s / 0.01) * (s < length ? 1 - 0.25 * (s / length) : Math.max(0, 1 - (s - length) / 0.06) * 0.75);
    t.out[start + i] += level * v * envelope;
  }
}

/** Noise through a simple band: for the rattle of a medal, the pop of a stab, the knock of a bonk. */
function hiss(t: Take, at: number, length: number, level: number, centre: number, seed: number): void {
  const start = Math.floor(at * t.rate);
  const total = Math.min(t.out.length - start, Math.ceil(length * t.rate));
  const next = noise(seed);
  // A two-pole resonator at `centre` Hz.
  const r = 0.96;
  const c = 2 * r * Math.cos((TAU * centre) / t.rate);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < total; i++) {
    const x = next();
    const y = x + c * y1 - r * r * y2;
    y2 = y1;
    y1 = y;
    const s = i / t.rate;
    t.out[start + i] += level * 0.08 * y * Math.min(1, s / 0.002) * Math.max(0, 1 - s / length);
  }
}

/** A sine that slides from one pitch to another, wobbling: the slide whistle. */
function slide(t: Take, at: number, length: number, from: number, to: number, level: number): void {
  const start = Math.floor(at * t.rate);
  const total = Math.min(t.out.length - start, Math.ceil(length * t.rate));
  let phase = 0;
  for (let i = 0; i < total; i++) {
    const s = i / t.rate;
    const progress = s / length;
    const f = from * (to / from) ** (progress ** 0.8) * (1 + 0.035 * Math.sin(TAU * 7 * s));
    phase += (TAU * f) / t.rate;
    const envelope = Math.min(1, s / 0.02) * Math.min(1, (length - s) / 0.05);
    t.out[start + i] += level * (Math.sin(phase) + 0.15 * Math.sin(2 * phase)) * envelope;
  }
}

/** A knock on wood: two low sines that die at once. */
function bonk(t: Take, at: number, level: number): void {
  const start = Math.floor(at * t.rate);
  const total = Math.min(t.out.length - start, Math.ceil(0.25 * t.rate));
  for (let i = 0; i < total; i++) {
    const s = i / t.rate;
    const drop = 1 - 0.3 * Math.min(1, s / 0.05);
    t.out[start + i] += level * (Math.sin(TAU * 196 * drop * s) * Math.exp(-s / 0.07) + 0.6 * Math.sin(TAU * 311 * drop * s) * Math.exp(-s / 0.04));
  }
  hiss(t, at, 0.03, level * 0.6, 900, 31);
}

/** A medal: struck, and the little rattle of it settling. */
function clink(t: Take, at: number, level: number, seed: number): void {
  const wander = 1 + (noise(seed)() * 0.06);
  ping(t, at, 2350 * wander, level * 0.5, 0.05);
  ping(t, at + 0.004, 3900 * wander, level * 0.3, 0.035);
  hiss(t, at, 0.05, level * 0.5, 5200, seed);
  ping(t, at + 0.07, 2600 * wander, level * 0.22, 0.03);
}

const RECIPES: Record<JankenSound, (rate: number) => Take> = {
  // A medal into the slot: struck on the way in, rolling down inside, and the clunk of the mechanism taking it.
  coin: (rate) => {
    const t = take(0.5, rate);
    clink(t, 0.005, 1, 11);
    hiss(t, 0.06, 0.22, 0.35, 2600, 12);
    ping(t, 0.3, 180, 0.6, 0.05);
    hiss(t, 0.3, 0.04, 0.5, 700, 13);
    return t;
  },
  button: (rate) => {
    const t = take(0.08, rate);
    ping(t, 0.002, 1600, 0.6, 0.012);
    hiss(t, 0.002, 0.02, 0.5, 3000, 21);
    return t;
  },
  // The cat's call, "jan… ken…": two long notes rising, each with a tick, on the toy lead. A tune, not a voice.
  call: (rate) => {
    const t = take(1.05, rate);
    note(t, 0.01, pitch('G4'), 0.38, 0.45, 0.012);
    note(t, 0.5, pitch('B4'), 0.42, 0.45, 0.012);
    ping(t, 0.01, 3200, 0.25, 0.02);
    ping(t, 0.5, 3200, 0.25, 0.02);
    return t;
  },
  // After a draw, "aiko de…": three quick notes that go up and hang.
  aiko: (rate) => {
    const t = take(0.75, rate);
    note(t, 0.01, pitch('E5'), 0.1, 0.4);
    note(t, 0.15, pitch('E5'), 0.1, 0.4);
    note(t, 0.3, pitch('A5'), 0.32, 0.42, 0.01);
    return t;
  },
  // "Pon!": a bright stab and a pop, as the hands are shown.
  pon: (rate) => {
    const t = take(0.35, rate);
    for (const name of ['C6', 'E6', 'G6']) note(t, 0.005, pitch(name), 0.13, 0.22);
    hiss(t, 0.0, 0.05, 0.8, 1800, 41);
    return t;
  },
  win: (rate) => {
    const t = take(1.0, rate);
    ['C5', 'E5', 'G5'].forEach((name, i) => note(t, 0.01 + i * 0.085, pitch(name), 0.075, 0.4));
    for (const name of ['C6', 'E6']) note(t, 0.27, pitch(name), 0.4, 0.25, 0.008);
    ping(t, 0.27, pitch('C7'), 0.25, 0.12);
    return t;
  },
  // The player has lost: the whistle slides down and the cat knocks on its counter.
  lose: (rate) => {
    const t = take(0.95, rate);
    slide(t, 0.01, 0.58, 1350, 260, 0.5);
    bonk(t, 0.62, 0.7);
    return t;
  },
  // The roulette's light moving on by one lamp.
  tick: (rate) => {
    const t = take(0.05, rate);
    ping(t, 0.001, 2200, 0.5, 0.008);
    return t;
  },
  // The light has stopped: a bell.
  stop: (rate) => {
    const t = take(0.9, rate);
    ping(t, 0.002, pitch('G6'), 0.55, 0.18);
    ping(t, 0.002, pitch('D7'), 0.2, 0.12);
    return t;
  },
  // One medal into the tray.
  medal: (rate) => {
    const t = take(0.2, rate);
    clink(t, 0.003, 0.9, 51);
    return t;
  },
  // A double-up begins: a run up, and a hold.
  double: (rate) => {
    const t = take(0.7, rate);
    ['C5', 'D5', 'E5', 'G5'].forEach((name, i) => note(t, 0.01 + i * 0.07, pitch(name), 0.06, 0.35));
    note(t, 0.3, pitch('C6'), 0.3, 0.3, 0.015);
    return t;
  },
  // The top lamp, or a double-up kept: the fanfare, longer.
  big: (rate) => {
    const t = take(1.6, rate);
    ['G4', 'C5', 'E5', 'G5', 'C6'].forEach((name, i) => note(t, 0.01 + i * 0.08, pitch(name), 0.07, 0.36));
    for (const name of ['C6', 'E6', 'G6']) note(t, 0.42, pitch(name), 0.8, 0.2, 0.01);
    for (let i = 0; i < 6; i++) ping(t, 0.42 + i * 0.12, pitch(i % 2 ? 'E7' : 'C7'), 0.18, 0.08);
    return t;
  },
};

/**
 * A sound as samples at `rate` per second: worked out, brought to `PEAK` at
 * its loudest, and faded in and out over a few milliseconds.
 */
export function renderSound(sound: JankenSound, rate: number): Float32Array {
  const { out } = RECIPES[sound](rate);
  let loudest = 0;
  for (const v of out) loudest = Math.max(loudest, Math.abs(v));
  const gain = loudest > 0 ? PEAK / loudest : 0;
  const edge = Math.max(1, Math.floor(EDGE * rate));
  for (let i = 0; i < out.length; i++) {
    const fade = Math.min(1, i / edge, (out.length - 1 - i) / edge);
    out[i] *= gain * fade;
  }
  return out;
}

// ── Playing them ────────────────────────────────────────────────────────────

/** How loud the machine is, over all. */
const MASTER = 0.55;

export interface Speaker {
  /** Whether the sound is on. */
  on: () => boolean;
  /** Switches the sound on (this needs a press, the gesture a browser asks for) or off. */
  set: (on: boolean) => void;
  /** Plays a sound, `delay` seconds from now, if the sound is on. */
  play: (sound: JankenSound, delay?: number) => void;
  close: () => void;
}

/** The machine's speaker. It makes no sound, and asks the browser for nothing, until it is switched on. */
export function createSpeaker(): Speaker {
  let audio: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = false;
  const buffers = new Map<JankenSound, AudioBuffer>();
  const bufferFor = (sound: JankenSound): AudioBuffer | null => {
    if (!audio) return null;
    let buffer = buffers.get(sound);
    if (!buffer) {
      const samples = renderSound(sound, audio.sampleRate);
      buffer = audio.createBuffer(1, samples.length, audio.sampleRate);
      buffer.getChannelData(0).set(samples);
      buffers.set(sound, buffer);
    }
    return buffer;
  };
  return {
    on: () => enabled,
    set(on) {
      enabled = on;
      if (!on) {
        // Switched off, nothing more is heard: what is playing, and what was already set to play a moment later.
        if (audio && master) master.gain.setValueAtTime(0, audio.currentTime);
        return;
      }
      try {
        if (!audio && typeof AudioContext !== 'undefined') {
          audio = new AudioContext();
          master = audio.createGain();
          master.connect(audio.destination);
        }
        if (audio && master) master.gain.setValueAtTime(MASTER, audio.currentTime);
        void audio?.resume();
      } catch {
        audio = null;
      }
    },
    play(sound, delay = 0) {
      if (!enabled || !audio || !master) return;
      try {
        const buffer = bufferFor(sound);
        if (!buffer) return;
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(master);
        source.start(audio.currentTime + Math.max(0, delay));
      } catch {
        // A sound that cannot be played is not heard; the machine goes on.
      }
    },
    close() {
      enabled = false;
      void audio?.close().catch(() => undefined);
      audio = null;
      master = null;
      buffers.clear();
    },
  };
}
