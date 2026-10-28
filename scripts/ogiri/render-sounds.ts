/** Reproduce the original sound set as offline WAV previews: npx tsx scripts/ogiri/render-sounds.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_PARTY_VOLUME, PARTY_MASTER_GAIN, SOUND_CUES, type Tone } from '../../src/lib/ogiri/sound';
const directory = resolve(process.argv[2] ?? '.artifacts/ogiri/sounds');
mkdirSync(directory, { recursive: true });
const rate = 22050;
function render(tones: Tone[]) {
  const length = Math.ceil((Math.max(...tones.map((t) => t.at + t.duration)) + 0.1) * rate);
  const samples = new Float64Array(length);
  for (const tone of tones) {
    const attack = Math.min(0.008, tone.duration / 4);
    const hold = tone.duration * 0.38;
    const ratio = (tone.endFrequency ?? tone.frequency) / tone.frequency;
    for (let i = 0; i < Math.ceil(tone.duration * rate); i++) {
      const time = i / rate;
      const cycles =
        ratio === 1
          ? tone.frequency * time
          : ((tone.frequency * tone.duration) / Math.log(ratio)) *
            (ratio ** (time / tone.duration) - 1);
      const envelope =
        time < attack
          ? 0.0001 * (tone.gain / 0.0001) ** (time / attack)
          : time < hold
            ? tone.gain * 0.8 ** ((time - attack) / (hold - attack))
            : tone.gain * 0.8 * (0.0001 / (tone.gain * 0.8)) ** ((time - hold) / (tone.duration - hold));
      const sine = Math.sin(2 * Math.PI * cycles);
      const wave = tone.wave === 'triangle' ? 2 / Math.PI * Math.asin(sine) : sine;
      samples[Math.round(tone.at * rate) + i] += wave * envelope * PARTY_MASTER_GAIN * DEFAULT_PARTY_VOLUME;
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
}
let offset = 0;
const sequence: Tone[] = [];
for (const [name, tones] of Object.entries(SOUND_CUES)) {
  wav(name, render(tones));
  sequence.push(...tones.map((tone) => ({ ...tone, at: tone.at + offset })));
  offset += Math.max(...tones.map((t) => t.at + t.duration)) + 0.3;
}
wav('sound-check', render(sequence));
console.log(
  `Rendered ${Object.keys(SOUND_CUES).length} original cues and sound-check.wav to ${directory}`,
);
