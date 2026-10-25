// Original, offline sound design. No model API or third-party audio samples.
// Regenerate with: node scripts/generate-starcat-audio.mjs (requires ffmpeg).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rate = 44100;
const output = 'public/audio/starcat-caravan';
const scratch = '.artifacts/starcat-audio';
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(scratch, { recursive: true });
const tau = Math.PI * 2;
let seed = 0x53434154;
const noise = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x80000000 - 1; };
const smooth = (x) => Math.max(0, Math.min(1, x));
const envelope = (t, attack, hold, release) => (1 - Math.exp(-t / attack)) * Math.exp(-Math.max(0, t - hold) / release);
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function track(seconds) {
  const channels = [new Float64Array(Math.ceil(seconds * rate)), new Float64Array(Math.ceil(seconds * rate))];
  function add(at, duration, amplitude, pan, voice) {
    const start = Math.round(at * rate);
    const gains = [Math.sqrt((1 - pan) / 2), Math.sqrt((1 + pan) / 2)];
    const sampleCount = Math.ceil(duration * rate);
    for (let i = 0; i < sampleCount && start + i < channels[0].length; i++) {
      const value = voice(i / rate, i) * amplitude;
      channels[0][start + i] += value * gains[0]; channels[1][start + i] += value * gains[1];
    }
  }
  const bell = (note, t) => (Math.sin(tau * midi(note) * t + 1.6 * Math.sin(tau * midi(note) * 2.71 * t) * Math.exp(-t * 5)) + .22 * Math.sin(tau * midi(note) * 4.03 * t)) * envelope(t, .004, .02, .6);
  function harp(notes, at, spacing, level = .2) { notes.forEach((note, i) => add(at + i * spacing, 1.8, level, (i % 3 - 1) * .6, (t) => bell(note, t))); }
  function strings(notes, at, duration, level) {
    notes.forEach((note, i) => add(at, duration, level / Math.sqrt(notes.length), (i % 3 - 1) * .55, (t) => {
      const f = midi(note);
      let tone = 0;
      for (let h = 1; h <= 6; h++) tone += (Math.sin(tau * (f * h * 1.0015) * t + .02 * Math.sin(tau * 4.7 * t)) + Math.sin(tau * (f * h * .9985) * t)) / (h * h * 2);
      return tone * envelope(t, .18, duration * .35, duration * .27);
    }));
  }
  function air(at, duration, level, rising = true) {
    let low = 0, slow = 0;
    add(at, duration, level, 0, (t) => {
      const progress = t / duration;
      low += (noise() - low) * (.02 + (rising ? progress : 1 - progress) * .22);
      slow += (low - slow) * .012;
      return (low - slow) * Math.sin(Math.PI * progress) ** 2;
    });
  }
  return { channels, add, harp, strings, air };
}

function exportTrack(name, cue, wet = .35) {
  const dry = cue.channels.map((c) => c.slice());
  // A spacious stereo tail, with cross-channel early reflections and diffuse late taps.
  const taps = [.071, .113, .179, .263, .397, .571, .811, 1.137, 1.493];
  for (let c = 0; c < 2; c++) for (let k = 0; k < taps.length; k++) {
    const delay = Math.round((taps[k] + c * .013) * rate);
    const source = dry[(c + k) % 2];
    const gain = wet * Math.exp(-k * .3) * (k % 2 ? -.75 : 1);
    for (let i = delay; i < source.length; i++) cue.channels[c][i] += source[i - delay] * gain;
  }
  let peak = 0, energy = 0;
  for (const channel of cue.channels) for (const v of channel) peak = Math.max(peak, Math.abs(v));
  const gain = .78 / Math.max(.001, peak);
  const count = cue.channels[0].length;
  const pcm = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i++) for (let c = 0; c < 2; c++) {
    const fade = Math.min(1, i / (rate * .004), (count - 1 - i) / (rate * .15));
    const v = Math.tanh(cue.channels[c][i] * gain) * fade;
    energy += v * v;
    pcm.writeInt16LE(Math.round(v * 32767), i * 4 + c * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  const wave = path.join(scratch, `${name}-v2.wav`);
  const file = path.join(output, `${name}-v2.mp3`);
  fs.writeFileSync(wave, Buffer.concat([header, pcm]));
  const encoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wave, '-codec:a', 'libmp3lame', '-b:a', '160k', '-map_metadata', '-1', file], { encoding: 'utf8' });
  if (encoded.status !== 0) throw new Error(encoded.stderr || 'ffmpeg encoding failed');
  console.log(`${name}: ${(count / rate).toFixed(1)}s stereo, RMS ${(Math.sqrt(energy / (count * 2))).toFixed(3)}, ${Math.round(fs.statSync(file).size / 1024)}KB`);
}

const charge = track(2.4);
charge.strings([45, 52, 59, 64], 0, 2.4, .28);
charge.air(0, 2.4, .12);
charge.add(0, 2.4, .16, .15, (t) => Math.sin(tau * (170 * t + 25 * t * t)) * Math.sin(Math.PI * t / 2.4) ** 2);
exportTrack('charge', charge, .15);

const launch = track(2.8);
launch.air(0, .85, 1.1);
launch.add(0, .75, .4, 0, (t) => Math.sin(tau * (160 * t + 145 * t * t)) * Math.exp(-t * 7) * smooth(t / .006));
launch.harp([62, 69, 74, 81, 86], .09, .055, .13);
exportTrack('launch', launch, .3);

for (const rarity of [3, 4, 5]) {
  const cue = track(rarity === 5 ? 6.4 : rarity === 4 ? 4.8 : 3.4);
  const duration = rarity === 5 ? 4 : rarity === 4 ? 2.6 : 1.6;
  cue.strings(rarity === 5 ? [38, 50, 57, 62, 66, 69, 73, 76] : rarity === 4 ? [50, 57, 62, 66, 76] : [57, 62, 69], .04, duration, .38);
  cue.harp(rarity === 5 ? [74, 81, 78, 76, 81, 86] : rarity === 4 ? [69, 74, 78, 81] : [69, 74, 81], .17, rarity === 5 ? .19 : .12, .22);
  cue.air(0, rarity === 5 ? 1.1 : .7, .25);
  if (rarity >= 4) {
    cue.add(0, 1.4, .3, 0, (t) => Math.sin(tau * (55 * t + 4 * (1 - Math.exp(-t * 16)))) * Math.exp(-t * 4) * smooth(t / .015));
    cue.harp([86, 90, 93], .8, .16, .055);
  }
  if (rarity === 5) {
    // Formant-shaped harmonic pad: an instrumental choir texture, not spoken voice.
    for (const note of [50, 57, 62, 66]) cue.add(.08, 4.3, .1, (note % 3 - 1) * .5, (t) => {
      const f = midi(note); let v = 0;
      for (let h = 1; h < 14; h++) {
        const hz = f * h;
        const formant = .12 + Math.exp(-(((hz - 720) / 280) ** 2)) + .5 * Math.exp(-(((hz - 1200) / 320) ** 2));
        v += Math.sin(tau * hz * t + .035 * Math.sin(tau * 5 * t)) * formant / (h * 2);
      }
      return v * envelope(t, .3, 1.2, 1.1);
    });
  }
  exportTrack(`reveal-${rarity}`, cue, rarity === 5 ? .5 : .36);
}
