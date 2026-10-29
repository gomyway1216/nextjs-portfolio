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
const brass = (frequency: number, at = 0, duration = 0.16, gain = 0.22): Tone => ({
  ...note(frequency, at, duration, gain), wave: 'sawtooth', formant: 1000,
});
const tap = (frequency: number, at = 0, duration = 0.045, gain = 0.24): Tone => ({
  ...note(frequency, at, duration, gain), wave: 'noise',
});
const kick = (at = 0, gain = 0.32): Tone => ({
  ...note(140, at, 0.09, gain), endFrequency: 70,
});
export const DEFAULT_PARTY_VOLUME = 0.6;
export const PARTY_MASTER_GAIN = 1;
/** Original percussive UI cues; scoring/final cheers use preloaded CC0 human recordings. */
export const SOUND_CUES = {
  // Dry click/pop: a selection should not sound like a little melody.
  select: [{ ...note(720, 0, 0.055, 0.4), endFrequency: 490 }, tap(2400, 0, 0.018, 0.09)],
  // Two wooden knocks and a small bubble announce a new person.
  join: [
    { ...note(380, 0, 0.05, 0.36), wave: 'triangle' },
    { ...note(300, 0.095, 0.05, 0.3), wave: 'triangle' },
    { ...note(850, 0.17, 0.07, 0.28), endFrequency: 600 },
  ],
  // A short snare pickup and one warm brass chord, not an ascending arpeggio.
  start: [
    tap(1800, 0, 0.035, 0.2), tap(1800, 0.075, 0.035, 0.23),
    kick(0.2), tap(2400, 0.2, 0.09, 0.25),
    brass(220, 0.2, 0.24), brass(330, 0.2, 0.24, 0.18), brass(440, 0.2, 0.24, 0.13),
  ],
  // Paper/stamp-like flick and a rounded landing.
  submit: [tap(1200, 0, 0.07, 0.3), { ...note(560, 0.065, 0.055, 0.28), endFrequency: 300 }],
  // A distinct lower tick-tock for committing a vote.
  vote: [
    { ...note(450, 0, 0.04, 0.36), wave: 'triangle' },
    { ...note(280, 0.07, 0.055, 0.3), wave: 'triangle' }, tap(2200, 0.07, 0.018, 0.1),
  ],
  voting: [tap(1500, 0, 0.055, 0.28), tap(2000, 0.13, 0.06, 0.28), kick(0.13, 0.28)],
  reveal: [
    tap(1600, 0, 0.025, 0.15), tap(1600, 0.075, 0.025, 0.2), tap(1600, 0.15, 0.035, 0.25),
    tap(2600, 0.25, 0.12, 0.23), brass(220, 0.25), brass(330, 0.25, 0.16, 0.17),
  ],
  ranking: [
    tap(1700, 0, 0.025, 0.16), tap(1700, 0.055, 0.025, 0.16),
    tap(1700, 0.11, 0.025, 0.2), tap(1700, 0.17, 0.035, 0.24),
    kick(0.3), brass(196, 0.3, 0.26), brass(246.94, 0.3, 0.26, 0.17), brass(293.66, 0.3, 0.26, 0.17),
  ],
  champion: [
    ...[0, 0.06, 0.12, 0.18].map(at => tap(1900, at, 0.03, 0.2)),
    ...[0.31, 0.65].flatMap(at => [kick(at), brass(261.63, at, 0.26),
      brass(329.63, at, 0.26, 0.17), brass(392, at, 0.26, 0.17)]),
  ],
  tick: [tap(3000, 0, 0.025, 0.12), { ...note(800, 0, 0.018, 0.16), wave: 'triangle' }],
  bounce: [{ ...note(950, 0, 0.1, 0.5), endFrequency: 620 }],
  // Safe percussive fallbacks; the app enables sound only after recordings preload.
  count: [tap(1200, 0, 0.07, 0.25), tap(1900, 0.12, 0.07, 0.28), brass(330, 0.12, 0.18)],
  cheer: [
    ...[0, 0.16, 0.32, 0.51, 0.68, 0.9].map(at => tap(1600, at, 0.09, 0.25)),
    brass(220, 0.68, 0.3, 0.2), brass(330, 0.68, 0.3, 0.17),
  ],
} satisfies Record<string, Tone[]>;
export type SoundCue = keyof typeof SOUND_CUES;
export const SOUND_FILES: Partial<Record<SoundCue, string>> = {
  start: '/audio/ogiri/start-stinger.mp3',
  bounce: '/audio/ogiri/answer-pop.mp3',
  count: '/audio/ogiri/points-cheer.mp3',
  ranking: '/audio/ogiri/ranking-stinger.mp3',
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
  // Scores, rather than game-specific result fields, distinguish scoring from answer-only reveals.
  // A genuine re-score can also add points without changing the turn; identical polls stay silent.
  if (next.phase === 'reveal' && next.players.some(player => {
    const before = previous.players.find(candidate => candidate.id === player.id);
    return before && player.score > before.score;
  })) return 'count';
  if (previous.turn === next.turn) return null;
  if (previous.phase === 'lobby' && ['answering', 'voting'].includes(next.phase)) return 'start';
  if (next.phase === 'answering') return 'start';
  if (next.phase === 'voting') return 'bounce';
  if (next.phase === 'reveal') return 'bounce';
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
      if (['start', 'bounce', 'ranking', 'champion', 'cheer', 'count'].includes(cue) || active.size > 24) stop();
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
