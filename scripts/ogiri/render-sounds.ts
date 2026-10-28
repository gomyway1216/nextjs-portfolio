/** Render synthesis and licensed clips as offline WAV previews (requires ffmpeg). */
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_PARTY_VOLUME, SOUND_CUES, SOUND_FILES, type SoundCue, type Tone } from '../../src/lib/ogiri/sound';
const directory = resolve(process.argv[2] ?? '.artifacts/ogiri/sounds');
mkdirSync(directory, { recursive: true });
const rate = 22050;
const clapNoise = new Float32Array(Math.ceil(rate / 4));
let noiseSeed = 1729;
for (let i = 0; i < clapNoise.length; i++) {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) | 0;
  clapNoise[i] = (noiseSeed >>> 0) / 2147483648 - 1;
}
function pitch(tone: Tone, time: number) {
  const points = [{ at: 0, frequency: tone.frequency }, ...(tone.pitch ?? [])];
  if (tone.endFrequency) points.push({ at: tone.duration, frequency: tone.endFrequency });
  for (let i = 1; i < points.length; i++) {
    if (time <= points[i].at) {
      const previous = points[i - 1], next = points[i];
      return previous.frequency * (next.frequency / previous.frequency) ** ((time - previous.at) / (next.at - previous.at));
    }
  }
  return points.at(-1)!.frequency;
}
function render(tones: Tone[]) {
  const length = Math.ceil((Math.max(...tones.map((t) => t.at + t.duration)) + 0.1) * rate);
  const samples = new Float64Array(length);
  for (const tone of tones) {
    const attack = Math.min(0.008, tone.duration / 4);
    const hold = tone.duration * 0.38;
    let phase = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const omega = 2 * Math.PI * (tone.formant ?? tone.frequency) / rate;
    const alpha = Math.sin(omega) / (2 * (tone.wave === 'noise' ? 0.6 : 2));
    const a0 = 1 + alpha, a1 = -2 * Math.cos(omega), a2 = 1 - alpha;
    for (let i = 0; i < Math.ceil(tone.duration * rate); i++) {
      const time = i / rate;
      const cycles = phase;
      phase += pitch(tone, time) * 2 ** ((tone.vibrato ?? 0) * Math.sin(2 * Math.PI * 7 * time) / 1200) / rate;
      const envelope =
        time < attack
          ? 0.0001 * (tone.gain / 0.0001) ** (time / attack)
          : time < hold
            ? tone.gain * 0.8 ** ((time - attack) / (hold - attack))
            : tone.gain * 0.8 * (0.0001 / (tone.gain * 0.8)) ** ((time - hold) / (tone.duration - hold));
      const sine = Math.sin(2 * Math.PI * cycles);
      let wave = tone.wave === 'noise' ? clapNoise[i % clapNoise.length]
        : tone.wave === 'triangle' ? 2 / Math.PI * Math.asin(sine)
          : tone.wave === 'sawtooth' ? 2 * (cycles - Math.floor(cycles)) - 1 : sine;
      if (tone.formant || tone.wave === 'noise') {
        const filtered = (alpha * wave - alpha * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = wave; y2 = y1; y1 = filtered;
        wave = filtered;
      }
      samples[Math.round(tone.at * rate) + i] += wave * envelope;
    }
  }
  return samples;
}
function wav(name: string, samples: Float64Array) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2),
  );
  writeFileSync(resolve(directory, `${name}.wav`), data);
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  console.log(`${name}: ${ (samples.length / rate).toFixed(2) }s peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
}
const sequence: Float64Array[] = [];
for (const [name, tones] of Object.entries(SOUND_CUES)) {
  const asset = SOUND_FILES[name as SoundCue];
  const signal = asset
    ? execFileSync('ffmpeg', ['-v', 'error', '-i', resolve('public', asset.slice(1)), '-ar', String(rate), '-ac', '1', '-f', 'f32le', '-'])
    : Buffer.from(Float32Array.from(render(tones)).buffer);
  const temporary = resolve(directory, '.preview-input.f32');
  writeFileSync(temporary, signal);
  const processed = execFileSync('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', String(rate), '-ac', '1', '-i', temporary,
    '-af', `volume=1.5,acompressor=threshold=0.316:ratio=4:attack=1:release=120:knee=3.162:makeup=1.5,alimiter=limit=0.96:level=false,volume=${DEFAULT_PARTY_VOLUME}`,
    '-f', 'f32le', '-']);
  unlinkSync(temporary);
  const samples = Float64Array.from(new Float32Array(processed.buffer.slice(processed.byteOffset, processed.byteOffset + processed.byteLength)));
  wav(name, samples);
  sequence.push(samples, new Float64Array(rate * 0.3));
}
const combined = new Float64Array(sequence.reduce((total, samples) => total + samples.length, 0));
let offset = 0;
for (const samples of sequence) { combined.set(samples, offset); offset += samples.length; }
wav('sound-check', combined);
console.log(
  `Rendered ${Object.keys(SOUND_CUES).length} cues and sound-check.wav to ${directory}`,
);
