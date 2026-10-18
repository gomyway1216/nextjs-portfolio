'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The sounds of the medal floor's table machines (the slot machine, the
 * roulette and the video poker), made here the way the Medal Pusher's and
 * Calico Janken's are: each worked out in plain arithmetic the first time it
 * is needed (dying sines for struck metal, notes with their overtones for the
 * jingles, filtered noise for a card or a rolling ball) and kept as a short
 * buffer for the Web Audio API. Nothing is downloaded or recorded.
 *
 * What a medal machine is heard to do: a medal going in, the lever, each reel
 * stopping, a card dealt, the ball launched and dropping into its pocket, the
 * horse race's bell before betting closes, its fanfare, gate and hoof beats, and
 * above all a win counted into the player's medals a medal at a time, each
 * with its chirp (`tick`), with a jingle over it, a fanfare for a big one. A
 * loss is silent, as on the machines.
 *
 * Worked out as numbers, they can be measured by a test nobody has to listen
 * to: that each starts and ends in silence and is never too loud.
 */

export const MACHINE_SOUNDS = ['medal', 'button', 'lever', 'reel', 'tick', 'win', 'big', 'card', 'hold', 'chip', 'launch', 'drop', 'splash', 'bite', 'ratchet', 'fanfare', 'gate', 'hooves', 'bell', 'flap', 'bonus', 'rung'] as const;
export type MachineSound = (typeof MACHINE_SOUNDS)[number];

/** How loud the loudest moment of any sound is, out of 1. */
export const PEAK = 0.8;
/** How long each sound fades in and out, in seconds, so that none starts or stops with a click. */
const EDGE = 0.004;
/** The shortest gap between two medals' chirps, in seconds: a win runs in no faster than a credit meter can be heard counting. */
export const TICK_GAP = 0.05;

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

/** A note on the cabinet's speaker: a square-ish tone with its odd overtones, a quick start and a short release. */
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
    const envelope = Math.min(1, s / 0.008) * (s < length ? 1 - 0.25 * (s / length) : Math.max(0, 1 - (s - length) / 0.06) * 0.75);
    t.out[start + i] += level * v * envelope;
  }
}

/** Noise through a resonant band, fading over `length`: a medal's rattle, a card's flick, a ball on wood. */
function hiss(t: Take, at: number, length: number, level: number, centre: number, seed: number, swell = false): void {
  const start = Math.floor(at * t.rate);
  const total = Math.min(t.out.length - start, Math.ceil(length * t.rate));
  const next = noise(seed);
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
    const shape = swell ? Math.sin(Math.PI * (s / length)) : Math.min(1, s / 0.002) * Math.max(0, 1 - s / length);
    t.out[start + i] += level * 0.08 * y * shape;
  }
}

/** A short knock: a low sine dying at once, for a reel or a lever coming to a stop. */
function knock(t: Take, at: number, hz: number, level: number, life: number): void {
  const start = Math.floor(at * t.rate);
  const total = Math.min(t.out.length - start, Math.ceil(life * 6 * t.rate));
  for (let i = 0; i < total; i++) {
    const s = i / t.rate;
    t.out[start + i] += level * Math.sin(TAU * hz * s * (1 - 0.2 * Math.min(1, s / 0.03))) * Math.exp(-s / life) * Math.min(1, s / 0.001);
  }
}

/** A medal: struck, and the little rattle of it settling. */
function clink(t: Take, at: number, level: number, seed: number): void {
  const wander = 1 + noise(seed)() * 0.06;
  ping(t, at, 2350 * wander, level * 0.5, 0.05);
  ping(t, at + 0.004, 3900 * wander, level * 0.3, 0.035);
  hiss(t, at, 0.05, level * 0.5, 5200, seed);
  ping(t, at + 0.06, 2600 * wander, level * 0.2, 0.03);
}

const RECIPES: Record<MachineSound, (rate: number) => Take> = {
  // A medal into the machine: struck on the way in, and the clunk of the mechanism taking it.
  medal: (rate) => {
    const t = take(0.32, rate);
    clink(t, 0.004, 1, 11);
    hiss(t, 0.05, 0.12, 0.3, 2600, 12);
    knock(t, 0.2, 170, 0.45, 0.03);
    return t;
  },
  // A button pressed: a small electronic beep with a click under it.
  button: (rate) => {
    const t = take(0.09, rate);
    note(t, 0.002, pitch('A5'), 0.035, 0.35);
    hiss(t, 0.001, 0.015, 0.5, 3200, 21);
    return t;
  },
  // The lever pulled: a spring stretched, and the thunk of it letting go.
  lever: (rate) => {
    const t = take(0.45, rate);
    hiss(t, 0.0, 0.16, 0.5, 1400, 31, true);
    knock(t, 0.16, 110, 0.9, 0.05);
    ping(t, 0.17, 720, 0.25, 0.08);
    return t;
  },
  // One reel stopping: a short, hard clunk.
  reel: (rate) => {
    const t = take(0.16, rate);
    knock(t, 0.002, 240, 0.9, 0.022);
    hiss(t, 0.002, 0.03, 0.8, 1100, 41);
    return t;
  },
  // One medal counted into the player's medals: the credit meter's chirp.
  tick: (rate) => {
    const t = take(0.045, rate);
    note(t, 0.001, pitch('E7'), 0.012, 0.35);
    ping(t, 0.001, 3500, 0.2, 0.006);
    return t;
  },
  // A win: a rising run and a bright chord.
  win: (rate) => {
    const t = take(0.9, rate);
    ['C5', 'E5', 'G5'].forEach((name, i) => note(t, 0.01 + i * 0.07, pitch(name), 0.06, 0.38));
    for (const name of ['C6', 'E6', 'G6']) note(t, 0.22, pitch(name), 0.36, 0.2, 0.008);
    ping(t, 0.22, pitch('C7'), 0.22, 0.1);
    return t;
  },
  // A big win: the fanfare, longer, with bells.
  big: (rate) => {
    const t = take(1.9, rate);
    ['G4', 'C5', 'E5', 'G5', 'C6', 'E6'].forEach((name, i) => note(t, 0.01 + i * 0.075, pitch(name), 0.065, 0.34));
    for (const name of ['C6', 'E6', 'G6', 'C7']) note(t, 0.48, pitch(name), 0.95, 0.16, 0.012);
    for (let i = 0; i < 8; i++) ping(t, 0.48 + i * 0.11, pitch(i % 2 ? 'G7' : 'C7'), 0.16, 0.07);
    return t;
  },
  // A card dealt or turned: a flick of paper.
  card: (rate) => {
    const t = take(0.09, rate);
    hiss(t, 0.0, 0.06, 1, 4200, 51);
    hiss(t, 0.0, 0.025, 0.6, 1600, 52);
    return t;
  },
  // A card held: a short high beep.
  hold: (rate) => {
    const t = take(0.08, rate);
    note(t, 0.002, pitch('E6'), 0.03, 0.35);
    return t;
  },
  // A medal set down on the felt.
  chip: (rate) => {
    const t = take(0.16, rate);
    clink(t, 0.002, 0.8, 61);
    return t;
  },
  // The ball launched round the wheel: a rush that swells and fades.
  launch: (rate) => {
    const t = take(0.7, rate);
    hiss(t, 0.0, 0.65, 0.9, 900, 71, true);
    hiss(t, 0.0, 0.5, 0.5, 2400, 72, true);
    return t;
  },
  // The ball dropping into its pocket: a clack, a bounce, and the last small knock.
  drop: (rate) => {
    const t = take(0.4, rate);
    knock(t, 0.002, 900, 0.5, 0.012);
    hiss(t, 0.002, 0.02, 0.7, 3000, 81);
    knock(t, 0.11, 1000, 0.35, 0.01);
    hiss(t, 0.11, 0.015, 0.45, 3200, 82);
    knock(t, 0.19, 1100, 0.2, 0.008);
    return t;
  },
  // A float landing on the water (Big Catch Harbor): a soft splash, and two bubbles rising.
  splash: (rate) => {
    const t = take(0.5, rate);
    hiss(t, 0.0, 0.22, 1, 700, 91, true);
    hiss(t, 0.01, 0.12, 0.6, 1800, 92);
    bubble(t, 0.16, 380, 900, 0.07, 0.35);
    bubble(t, 0.27, 460, 1100, 0.06, 0.25);
    return t;
  },
  // A bite: the float pulled under with a plunk, and a bubble.
  bite: (rate) => {
    const t = take(0.36, rate);
    knock(t, 0.002, 150, 0.9, 0.05);
    hiss(t, 0.002, 0.08, 0.5, 900, 101);
    bubble(t, 0.1, 300, 700, 0.09, 0.4);
    return t;
  },
  // The reel's ratchet: four quick clicks of the pawl.
  ratchet: (rate) => {
    const t = take(0.2, rate);
    for (let i = 0; i < 4; i++) {
      knock(t, 0.002 + i * 0.042, 1900, 0.5, 0.004);
      hiss(t, 0.002 + i * 0.042, 0.01, 0.6, 4200, 111 + i);
    }
    return t;
  },
  // The horse-racing machine's fanfare before the off: the machine's own call of a few rising notes on its speaker,
  // a held top note, and an answer up to the octave.
  fanfare: (rate) => {
    const t = take(1.85, rate);
    const call: [string, number, number][] = [
      ['G4', 0.0, 0.09],
      ['C5', 0.12, 0.09],
      ['E5', 0.24, 0.09],
      ['G5', 0.36, 0.3],
      ['E5', 0.72, 0.09],
      ['G5', 0.84, 0.09],
      ['C6', 0.96, 0.62],
    ];
    for (const [name, at, length] of call) {
      note(t, 0.01 + at, pitch(name), length, 0.32, length > 0.2 ? 0.006 : 0);
      note(t, 0.01 + at, pitch(name) * 2, length, 0.08);
    }
    ping(t, 0.97, pitch('C7'), 0.12, 0.12);
    return t;
  },
  // The starting gate flying open: a clank of steel, the rattle of the doors, a thump.
  gate: (rate) => {
    const t = take(0.4, rate);
    knock(t, 0.002, 160, 0.9, 0.03);
    ping(t, 0.004, 1250, 0.35, 0.05);
    ping(t, 0.01, 1780, 0.25, 0.04);
    hiss(t, 0.0, 0.18, 0.7, 2400, 91);
    knock(t, 0.09, 120, 0.5, 0.025);
    return t;
  },
  // A stride of the field at the gallop: four hoof beats close together, over the dust.
  hooves: (rate) => {
    const t = take(0.5, rate);
    [0.0, 0.07, 0.13, 0.25].forEach((at, i) => {
      knock(t, 0.004 + at, 95 + i * 12, 0.85 - i * 0.08, 0.018);
      hiss(t, 0.004 + at, 0.04, 0.35, 700, 101 + i);
    });
    return t;
  },
  // The bell that says betting is about to close: a small electric bell, ringing.
  bell: (rate) => {
    const t = take(0.95, rate);
    for (let i = 0; i < 20; i++) ping(t, 0.004 + i * 0.04, 2100, 0.3 * (1 - i / 26), 0.05);
    ping(t, 0.81, 2100, 0.3, 0.12);
    return t;
  },
  // The big wheel's flapper slapping over a peg (Star Festival Big Wheel): a dry knock of leather on wood, and the peg's tick.
  flap: (rate) => {
    const t = take(0.07, rate);
    knock(t, 0.001, 520, 0.8, 0.007);
    hiss(t, 0.001, 0.018, 0.9, 1700, 121);
    ping(t, 0.002, 2300, 0.18, 0.006);
    return t;
  },
  // The big wheel stopping on BONUS: a run of star chimes up two octaves, ringing on.
  bonus: (rate) => {
    const t = take(1.3, rate);
    ['E5', 'G#5', 'B5', 'E6', 'G#6', 'B6', 'E7'].forEach((name, i) => {
      note(t, 0.01 + i * 0.06, pitch(name), 0.05, 0.24);
      ping(t, 0.01 + i * 0.06, pitch(name) * 2, 0.16, 0.12);
    });
    for (const name of ['E6', 'G#6', 'B6']) note(t, 0.45, pitch(name), 0.5, 0.14, 0.01);
    return t;
  },
  // A rung of the High & Low ladder lighting: three quick steps up and a bell on the last.
  rung: (rate) => {
    const t = take(0.42, rate);
    ['G5', 'C6', 'E6'].forEach((name, i) => note(t, 0.01 + i * 0.045, pitch(name), 0.04, 0.3));
    ping(t, 0.1, pitch('G6'), 0.24, 0.09);
    return t;
  },
};

/** A bubble rising through water: a sine that sweeps up in pitch, swelling and dying away. */
function bubble(t: Take, at: number, from: number, to: number, length: number, level: number): void {
  const start = Math.floor(at * t.rate);
  const total = Math.min(t.out.length - start, Math.ceil(length * t.rate));
  let phase = 0;
  for (let i = 0; i < total; i++) {
    const s = i / t.rate;
    phase += (TAU * (from + (to - from) * (s / length) ** 2)) / t.rate;
    t.out[start + i] += level * Math.sin(phase) * Math.sin(Math.PI * (s / length));
  }
}

/** A sound as samples at `rate` per second: worked out, brought to `PEAK` at its loudest, and faded in and out over a few ms. */
export function renderSound(sound: MachineSound, rate: number): Float32Array {
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

/** How long a sound lasts, in seconds. */
export const countedSoundLength = (sound: MachineSound, rate: number): number => renderSound(sound, rate).length / rate;

// ── Playing them ────────────────────────────────────────────────────────────

/** How loud the machine is, over all, and the chirp of a medal counted in, under the rest. */
const MASTER = 0.5;
const LEVELS: Partial<Record<MachineSound, number>> = { tick: 0.45, card: 0.7, chip: 0.8, launch: 0.6, hooves: 0.45, bell: 0.55 };

export interface Speaker {
  on: () => boolean;
  /** Switches the sound on (this needs a press, the gesture a browser asks for) or off. */
  set: (on: boolean) => void;
  /** Plays a sound, `delay` seconds from now, if the sound is on. */
  play: (sound: MachineSound, delay?: number) => void;
  close: () => void;
}

/** A machine's speaker. It makes no sound, and asks the browser for nothing, until it is switched on. */
export function createSpeaker(): Speaker {
  let audio: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = false;
  const buffers = new Map<MachineSound, AudioBuffer>();
  const bufferFor = (sound: MachineSound): AudioBuffer | null => {
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
        const level = LEVELS[sound];
        if (level === undefined) source.connect(master);
        else {
          const gain = audio.createGain();
          gain.gain.value = level;
          source.connect(gain);
          gain.connect(master);
        }
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

export interface MachineSoundControl {
  /** Whether the sound is on. Off on every visit: a browser lets a page make noise only after a press. */
  on: boolean;
  toggle: () => void;
  play: (sound: MachineSound, delay?: number) => void;
  /** One medal counted in: its chirp, unless the last one was less than `TICK_GAP` ago. */
  tick: () => void;
}

/** A machine's sound while it stands on the page: its speaker, whether it is on, and the press that switches it. */
export function useMachineSound(): MachineSoundControl {
  const speaker = useRef<Speaker | null>(null);
  const lastTick = useRef(-Infinity);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const made = createSpeaker();
    speaker.current = made;
    return () => {
      made.close();
      if (speaker.current === made) speaker.current = null;
    };
  }, []);

  const play = useCallback((sound: MachineSound, delay = 0) => speaker.current?.play(sound, delay), []);
  const tick = useCallback(() => {
    const now = performance.now() / 1000;
    if (now - lastTick.current < TICK_GAP) return;
    lastTick.current = now;
    speaker.current?.play('tick');
  }, []);
  const toggle = useCallback(() => {
    const next = !on;
    speaker.current?.set(next);
    setOn(next);
    if (next) speaker.current?.play('button');
  }, [on]);

  return { on, toggle, play, tick };
}

/** The sound switch's words, in each language. */
export const SOUND_WORDS = {
  en: { on: 'Sound on', off: 'Sound off' },
  ja: { on: '音あり', off: '音なし' },
} as const;
