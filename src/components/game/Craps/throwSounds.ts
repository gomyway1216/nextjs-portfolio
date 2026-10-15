/**
 * The sounds of a throw, made on the spot with Web Audio, as the site's other
 * games make theirs: nothing is downloaded.
 *
 * - The rattle in the shooter's hand: a few hard little clicks of the dice on
 *   each other.
 * - The knock on the far wall: a dull thump of the rubber, with the click of
 *   the dice on its pyramids.
 * - The clatter on the felt: soft, muffled taps, quieter as the dice tire.
 * - A die on a rail, and the two dice knocking together.
 *
 * Sound is off until the player switches it on, which is also the press a
 * browser asks for before a page may make a noise.
 */

import type { ThrowEventKind } from './throwPhysics';

let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  audio ??= new AudioContext();
  return audio;
}

/** A second of white noise, made once, that every knock and click is cut from. */
function noiseOf(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
  }
  noise = buffer;
  return buffer;
}

/** A short burst of noise through a band filter: a click, a tap or a knock. */
function burst(ctx: AudioContext, at: number, length: number, frequency: number, q: number, volume: number, kind: BiquadFilterType = 'bandpass') {
  const source = ctx.createBufferSource();
  source.buffer = noiseOf(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = kind;
  filter.frequency.setValueAtTime(frequency, at);
  filter.Q.setValueAtTime(q, at);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at, Math.random() * 0.8, length + 0.02);
}

/** A falling tone: the body of a knock. */
function thump(ctx: AudioContext, at: number, from: number, to: number, length: number, volume: number) {
  const oscillator = ctx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(from, at);
  oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

/** Lets the page make sound: called from the press that switches it on. */
export async function unlockThrowSounds(): Promise<void> {
  const ctx = context();
  if (ctx?.state === 'suspended') await ctx.resume();
}

/** One sound of a throw, `delay` seconds from now, as loud as `strength` (0…1) says. */
export function playThrowSound(kind: ThrowEventKind, strength: number, delay = 0): void {
  const ctx = context();
  if (!ctx || ctx.state !== 'running') return;
  const at = ctx.currentTime + Math.max(0, delay);
  const loud = 0.2 + 0.8 * Math.max(0, Math.min(1, strength));
  switch (kind) {
    case 'rattle':
      burst(ctx, at, 0.018, 3200 + Math.random() * 900, 6, 0.09 * loud);
      break;
    case 'release':
      burst(ctx, at, 0.05, 900, 1.2, 0.03);
      break;
    case 'wall':
      thump(ctx, at, 180, 70, 0.11, 0.22 * loud);
      burst(ctx, at, 0.035, 1800, 2.5, 0.16 * loud);
      burst(ctx, at + 0.012, 0.02, 3800, 5, 0.07 * loud);
      break;
    case 'felt':
      burst(ctx, at, 0.05, 420, 0.9, 0.11 * loud, 'lowpass');
      burst(ctx, at, 0.012, 2600, 4, 0.03 * loud);
      break;
    case 'rail':
      thump(ctx, at, 140, 80, 0.07, 0.12 * loud);
      break;
    case 'clack':
      burst(ctx, at, 0.014, 4200, 7, 0.1 * loud);
      break;
  }
}
