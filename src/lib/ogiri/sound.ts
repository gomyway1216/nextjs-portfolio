import type { RoomView } from './types';

export interface Tone {
  at: number;
  frequency: number;
  duration: number;
  gain: number;
  wave?: OscillatorType | 'noise';
  endFrequency?: number;
  pitch?: { at: number; frequency: number }[];
  vibrato?: number;
  formant?: number;
}
const note = (frequency: number, at = 0, duration = 0.18, gain = 0.5): Tone => ({
  frequency,
  at,
  duration,
  gain,
});
const brass = (frequency: number, at = 0, duration = 0.22, gain = 0.4): Tone => ({
  ...note(frequency, at, duration, gain), wave: 'triangle',
});
export const DEFAULT_PARTY_VOLUME = 0.6;
export const PARTY_MASTER_GAIN = 1;
/** Original short melodies and a synthesis fallback. Three main cues use preloaded CC0 clips below. */
export const SOUND_CUES = {
  select: [{ ...note(580, 0, 0.13, 0.45), endFrequency: 940 }],
  join: [note(523.25, 0, 0.16), note(783.99, 0.1, 0.24), note(1046.5, 0.2, 0.25, 0.28)],
  start: [
    brass(392), brass(523.25, 0.15), brass(659.25, 0.3),
    brass(523.25, 0.5, 0.42, 0.25), brass(783.99, 0.5, 0.42), note(196, 0.5, 0.42, 0.3),
  ],
  submit: [note(659.25, 0, 0.13, 0.45), note(1046.5, 0.09, 0.26), note(1318.51, 0.09, 0.26, 0.2)],
  vote: [{ ...brass(740, 0, 0.15, 0.45), endFrequency: 1108.73 }],
  voting: [brass(440, 0, 0.18), brass(659.25, 0.15, 0.35), note(220, 0.15, 0.35, 0.3)],
  reveal: [
    { ...brass(261.63, 0, 0.16, 0.55), endFrequency: 523.25 },
    brass(523.25, 0.12, 0.18),
    brass(659.25, 0.24, 0.18),
    brass(783.99, 0.36, 0.55),
    note(196, 0.36, 0.55, 0.3),
  ],
  ranking: [
    brass(392, 0, 0.18),
    brass(493.88, 0.12, 0.18),
    brass(587.33, 0.24, 0.18),
    brass(783.99, 0.4, 0.5), note(392, 0.4, 0.5, 0.3),
  ],
  champion: [
    brass(523.25, 0, 0.22),
    brass(659.25, 0.17, 0.22),
    brass(783.99, 0.34, 0.22),
    brass(1046.5, 0.55, 0.4),
    brass(783.99, 0.78, 0.22),
    brass(1318.51, 0.96, 0.65),
    brass(523.25, 0.96, 0.65, 0.25),
    note(261.63, 0.96, 0.65, 0.3),
  ],
  tick: [note(880, 0, 0.055, 0.2)],
  bounce: [
    { ...brass(180, 0, 0.72, 0.55), vibrato: 90,
      pitch: [{ at: 0.055, frequency: 780 }, { at: 0.14, frequency: 225 },
        { at: 0.25, frequency: 580 }, { at: 0.39, frequency: 265 },
        { at: 0.52, frequency: 400 }, { at: 0.7, frequency: 300 }] },
    { ...note(120, 0.02, 0.42, 0.2), endFrequency: 240 },
  ],
  count: [
    ...[0, 0.13, 0.25, 0.36, 0.46, 0.55, 0.63, 0.7, 0.76]
      .map((at, i) => brass(622.25 * 2 ** (i / 12), at, 0.045, 0.34)),
    brass(783.99, 0.82, 0.18, 0.4), brass(1046.5, 0.82, 0.18, 0.34),
    note(1318.51, 0.82, 0.18, 0.25), note(196, 0.82, 0.18, 0.4),
  ],
  // Original synthetic crowd whoops and claps, not recorded human speech.
  cheer: [
    { ...note(300, 0, 1.3, 0.42), wave: 'sawtooth', formant: 1100, vibrato: 40,
      pitch: [{ at: 0.12, frequency: 390 }, { at: 0.32, frequency: 590 },
        { at: 0.8, frequency: 520 }, { at: 1.3, frequency: 390 }] },
    { ...note(240, 0.16, 1.45, 0.35), wave: 'sawtooth', formant: 850, vibrato: 55,
      pitch: [{ at: 0.18, frequency: 400 }, { at: 0.55, frequency: 520 },
        { at: 1.0, frequency: 440 }, { at: 1.45, frequency: 330 }] },
    { ...note(490, 0.42, 1.15, 0.26), wave: 'sawtooth', formant: 1500, vibrato: 35,
      pitch: [{ at: 0.18, frequency: 750 }, { at: 0.7, frequency: 660 }, { at: 1.15, frequency: 510 }] },
    { ...note(1500, 0.5, 1.0, 0.15), vibrato: 35, endFrequency: 2100 },
    ...[0.12, 0.3, 0.54, 0.8, 1.08, 1.32, 1.58, 1.86, 2.12]
      .map(at => ({ ...note(1500, at, 0.07, 0.28), wave: 'noise' as const })),
    brass(523.25, 1.72, 0.22, 0.25), brass(659.25, 1.93, 0.22, 0.28),
    brass(783.99, 2.14, 0.48, 0.3), brass(1046.5, 2.14, 0.48, 0.22),
    note(261.63, 2.14, 0.48, 0.3),
  ],
} satisfies Record<string, Tone[]>;
export type SoundCue = keyof typeof SOUND_CUES;
export const SOUND_FILES: Partial<Record<SoundCue, string>> = {
  bounce: '/audio/ogiri/boing.mp3',
  count: '/audio/ogiri/score-count.mp3',
  cheer: '/audio/ogiri/cheer.mp3',
};

export function phaseSound(previous: RoomView | null, next: RoomView): SoundCue | null {
  if (!previous || previous.code !== next.code || next.paused) return null;
  if (
    next.phase === 'lobby' &&
    previous.phase === 'lobby' &&
    next.players.length > previous.players.length
  )
    return 'join';
  if (previous.turn === next.turn) return null;
  if (next.phase === 'answering') return 'start';
  if (next.phase === 'voting') return 'bounce';
  if (next.phase === 'reveal') return 'count';
  if (next.phase === 'ranking') return 'ranking';
  if (next.phase === 'finished') return 'cheer';
  return null;
}

export function createPartyAudio(context: AudioContext) {
  const master = context.createGain();
  master.connect(context.destination);
  const mix = context.createGain();
  mix.gain.setValueAtTime(1.5, context.currentTime);
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-10, context.currentTime);
  compressor.knee.setValueAtTime(10, context.currentTime);
  compressor.ratio.setValueAtTime(4, context.currentTime);
  compressor.attack.setValueAtTime(0.001, context.currentTime);
  compressor.release.setValueAtTime(0.12, context.currentTime);
  const makeup = context.createGain();
  makeup.gain.setValueAtTime(1.5, context.currentTime);
  const limiter = context.createWaveShaper();
  limiter.curve = Float32Array.from({ length: 2049 }, (_, i) => Math.max(-0.96, Math.min(0.96, i / 1024 - 1)));
  mix.connect(compressor);
  compressor.connect(makeup);
  makeup.connect(limiter);
  limiter.connect(master);
  const samples = new Map<SoundCue, AudioBuffer>();
  let preparing: Promise<void> | undefined;
  type Voice = { source: AudioScheduledSourceNode; gain: GainNode; filter?: BiquadFilterNode; vibrato?: OscillatorNode; vibratoGain?: GainNode };
  const active = new Set<Voice>();
  let claps: AudioBuffer | undefined;
  const noise = () => {
    if (claps) return claps;
    claps = context.createBuffer(1, Math.ceil(context.sampleRate / 4), context.sampleRate);
    const data = claps.getChannelData(0);
    let seed = 1729;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = (seed >>> 0) / 2147483648 - 1;
    }
    return claps;
  };
  const disconnect = (voice: Voice) => {
    if (!active.delete(voice)) return;
    voice.source.disconnect();
    voice.vibrato?.disconnect();
    voice.vibratoGain?.disconnect();
    voice.filter?.disconnect();
    voice.gain.disconnect();
  };
  const setVolume = (volume: number) => {
    master.gain.setValueAtTime(
      PARTY_MASTER_GAIN * Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0)),
      context.currentTime,
    );
  };
  const stop = () => {
    for (const voice of active) {
      voice.source.stop();
      voice.vibrato?.stop();
      disconnect(voice);
    }
    active.clear();
  };
  return {
    async resume() {
      await context.resume();
      if (context.state !== 'running') throw new Error('Audio output is not running');
    },
    state: () => context.state,
    prepare() {
      preparing ??= Promise.all(Object.entries(SOUND_FILES).map(async ([cue, path]) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error('Sound file could not be loaded');
        samples.set(cue as SoundCue, await context.decodeAudioData(await response.arrayBuffer()));
      })).then(() => {}).catch(error => { preparing = undefined; throw error; });
      return preparing;
    },
    setVolume,
    stop,
    close: () => {
      stop();
      context.onstatechange = null;
      mix.disconnect();
      compressor.disconnect();
      makeup.disconnect();
      limiter.disconnect();
      master.disconnect();
      return context.close();
    },
    play(cue: SoundCue, volume: number) {
      if (context.state !== 'running') return false;
      setVolume(volume);
      if (cue === 'champion' || cue === 'cheer' || cue === 'count' || active.size > 24) stop();
      const sample = samples.get(cue);
      if (sample) {
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = sample;
        source.connect(gain);
        gain.connect(mix);
        gain.gain.setValueAtTime(1, context.currentTime);
        const voice = { source, gain };
        active.add(voice);
        source.onended = () => disconnect(voice);
        source.start(context.currentTime);
        return true;
      }
      for (const tone of SOUND_CUES[cue] as Tone[]) {
        const start = context.currentTime + tone.at;
        const gain = context.createGain();
        let source: AudioScheduledSourceNode;
        let vibrato: OscillatorNode | undefined;
        let vibratoGain: GainNode | undefined;
        if (tone.wave === 'noise') {
          const clap = context.createBufferSource();
          clap.buffer = noise();
          clap.loop = true;
          source = clap;
        } else {
          const oscillator = context.createOscillator();
          oscillator.type = tone.wave ?? 'sine';
          oscillator.frequency.setValueAtTime(tone.frequency, start);
          for (const point of tone.pitch ?? [])
            oscillator.frequency.exponentialRampToValueAtTime(point.frequency, start + point.at);
          if (tone.endFrequency)
            oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, start + tone.duration);
          if (tone.vibrato) {
            vibrato = context.createOscillator();
            vibratoGain = context.createGain();
            vibrato.frequency.setValueAtTime(7, start);
            vibratoGain.gain.setValueAtTime(tone.vibrato, start);
            vibrato.connect(vibratoGain);
            vibratoGain.connect(oscillator.detune);
            vibrato.start(start);
            vibrato.stop(start + tone.duration + 0.015);
          }
          source = oscillator;
        }
        let filter: BiquadFilterNode | undefined;
        if (tone.formant || tone.wave === 'noise') {
          filter = context.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(tone.formant ?? tone.frequency, start);
          filter.Q.setValueAtTime(tone.wave === 'noise' ? 0.6 : 2, start);
          source.connect(filter);
          filter.connect(gain);
        } else source.connect(gain);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(
          tone.gain,
          start + Math.min(0.008, tone.duration / 4),
        );
        gain.gain.exponentialRampToValueAtTime(tone.gain * 0.8, start + tone.duration * 0.38);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
        gain.connect(mix);
        const voice = { source, gain, filter, vibrato, vibratoGain };
        active.add(voice);
        source.onended = () => disconnect(voice);
        source.start(start);
        source.stop(start + tone.duration + 0.015);
      }
      return true;
    },
  };
}
