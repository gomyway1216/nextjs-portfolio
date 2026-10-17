/**
 * The sounds of a medal table game (blackjack, baccarat, three card poker),
 * made on the spot with Web Audio, as the site's other games make theirs:
 * nothing is downloaded.
 *
 * - `card`: a card sliding out of the shoe onto the felt.
 * - `flip`: a card turned face up.
 * - `medal`: a medal put down on a betting spot.
 * - `payout`: one medal of a win paid back, a bright clink, as the WIN digits
 *   count up. A machine's medals ring like this as they are counted out.
 * - `win`, `big`: a short fanfare for a win, a longer one for a blackjack or
 *   a big win.
 * - `lose`: a soft, low note.
 *
 * Sound is off until the player switches it on, which is also the press a
 * browser asks for before a page may make a noise. The switch is kept on this
 * device, one per game (`useSoundSwitch`).
 */

import { useCallback, useSyncExternalStore } from 'react';

export type TableSound = 'card' | 'flip' | 'medal' | 'payout' | 'win' | 'big' | 'lose';

let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  audio ??= new AudioContext();
  return audio;
}

/** A second of white noise, made once, that every slide and clink is cut from. */
function noiseOf(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x1f2e3d4c;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
  }
  noise = buffer;
  return buffer;
}

/** A short burst of noise through a filter: a slide, a snap or a clink. */
function burst(ctx: AudioContext, at: number, length: number, frequency: number, q: number, volume: number, kind: BiquadFilterType = 'bandpass') {
  const source = ctx.createBufferSource();
  source.buffer = noiseOf(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = kind;
  filter.frequency.setValueAtTime(frequency, at);
  filter.Q.setValueAtTime(q, at);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at, Math.random() * 0.8, length + 0.02);
}

/** A tone that fades: the ring of a medal, or a note of a fanfare. */
function tone(ctx: AudioContext, at: number, frequency: number, length: number, volume: number, type: OscillatorType = 'sine', to = frequency) {
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (to !== frequency) oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

/** A medal's clink: two inharmonic rings over a snap, a little different every time. */
function clink(ctx: AudioContext, at: number, volume: number) {
  const pitch = 1 + (Math.random() - 0.5) * 0.08;
  burst(ctx, at, 0.025, 5200 * pitch, 6, volume * 0.6);
  tone(ctx, at, 2490 * pitch, 0.16, volume * 0.35);
  tone(ctx, at, 3910 * pitch, 0.1, volume * 0.22);
}

/** Lets the page make sound: called from a press (the switch, or a bet with the sound already on). */
export async function unlockTableSounds(): Promise<void> {
  const ctx = context();
  if (ctx?.state === 'suspended') await ctx.resume();
}

/** One sound, `delay` seconds from now. Nothing happens until the page may make sound. */
export function playTableSound(sound: TableSound, delay = 0): void {
  const ctx = context();
  if (!ctx || ctx.state !== 'running') return;
  const at = ctx.currentTime + Math.max(0, delay);
  switch (sound) {
    case 'card':
      burst(ctx, at, 0.09, 1500, 0.7, 0.08, 'bandpass');
      burst(ctx, at + 0.06, 0.03, 3200, 2, 0.05);
      break;
    case 'flip':
      burst(ctx, at, 0.028, 2400, 3, 0.09);
      break;
    case 'medal':
      clink(ctx, at, 0.11);
      tone(ctx, at, 420, 0.05, 0.05, 'triangle', 260);
      break;
    case 'payout':
      clink(ctx, at, 0.08);
      break;
    case 'win':
      [784, 988, 1175].forEach((f, i) => tone(ctx, at + i * 0.09, f, 0.16, 0.07, 'square'));
      tone(ctx, at + 0.27, 1568, 0.32, 0.06, 'square');
      break;
    case 'big':
      [784, 988, 1175, 1568, 1175, 1568].forEach((f, i) => tone(ctx, at + i * 0.08, f, 0.14, 0.07, 'square'));
      tone(ctx, at + 0.48, 2093, 0.5, 0.06, 'square');
      tone(ctx, at + 0.48, 1047, 0.5, 0.05, 'triangle');
      break;
    case 'lose':
      tone(ctx, at, 330, 0.22, 0.05, 'triangle', 220);
      break;
  }
}

// ── The switch, kept on this device ────────────────────────────────────────

const switches = new Map<string, boolean>();
const listeners = new Set<() => void>();

function readSwitch(key: string): boolean {
  let on = switches.get(key);
  if (on === undefined) {
    try {
      on = window.localStorage.getItem(key) === 'on';
    } catch {
      on = false;
    }
    switches.set(key, on);
  }
  return on;
}

function writeSwitch(key: string, on: boolean): void {
  switches.set(key, on);
  try {
    window.localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Kept for this page only.
  }
  for (const listener of [...listeners]) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Whether this game's sound is on, kept on this device under `key`, and the press that switches it. Off on the
 * server and until the device says otherwise.
 */
export function useSoundSwitch(key: string): [boolean, () => void] {
  const on = useSyncExternalStore(
    subscribe,
    () => readSwitch(key),
    () => false,
  );
  const toggle = useCallback(() => {
    const next = !readSwitch(key);
    if (next) void unlockTableSounds();
    writeSwitch(key, next);
  }, [key]);
  return [on, toggle];
}
