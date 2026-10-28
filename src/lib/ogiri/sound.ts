import type { RoomView } from './types';

export interface Tone {
  at: number;
  frequency: number;
  duration: number;
  gain: number;
  wave?: OscillatorType;
  endFrequency?: number;
}
const note = (frequency: number, at = 0, duration = 0.18, gain = 0.5): Tone => ({
  frequency,
  at,
  duration,
  gain,
});
/** Original short melodies. Synthesized on the device; no audio downloads or generation API. */
export const SOUND_CUES = {
  select: [{ ...note(580, 0, 0.09, 0.35), endFrequency: 940 }],
  join: [note(523.25, 0, 0.12), note(783.99, 0.09, 0.22)],
  start: [note(392, 0, 0.16), note(523.25, 0.13, 0.16), note(659.25, 0.26, 0.35)],
  submit: [note(659.25, 0, 0.1, 0.35), note(1046.5, 0.08, 0.21, 0.4)],
  vote: [{ ...note(740, 0, 0.12, 0.35), endFrequency: 1108.73 }],
  voting: [note(440, 0, 0.15), note(659.25, 0.13, 0.3)],
  reveal: [
    note(261.63, 0, 0.16, 0.6),
    note(523.25, 0.12, 0.18),
    note(659.25, 0.24, 0.18),
    note(783.99, 0.36, 0.5),
  ],
  ranking: [
    note(392, 0, 0.15),
    note(493.88, 0.12, 0.15),
    note(587.33, 0.24, 0.15),
    note(783.99, 0.4, 0.45),
  ],
  champion: [
    note(523.25, 0, 0.2),
    note(659.25, 0.17, 0.2),
    note(783.99, 0.34, 0.2),
    note(1046.5, 0.55, 0.55),
    note(783.99, 0.78, 0.2),
    note(1318.51, 0.96, 0.65),
    note(523.25, 0.96, 0.65, 0.3),
  ],
  tick: [note(880, 0, 0.055, 0.2)],
} satisfies Record<string, Tone[]>;
export type SoundCue = keyof typeof SOUND_CUES;

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
  if (next.phase === 'voting') return 'voting';
  if (next.phase === 'reveal') return 'reveal';
  if (next.phase === 'ranking') return 'ranking';
  if (next.phase === 'finished') return 'champion';
  return null;
}

export function createPartyAudio(context: AudioContext) {
  const master = context.createGain();
  master.connect(context.destination);
  const active = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
  const setVolume = (volume: number) => {
    master.gain.setValueAtTime(
      0.2 * Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0)),
      context.currentTime,
    );
  };
  const stop = () => {
    for (const voice of active) {
      voice.oscillator.stop();
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    active.clear();
  };
  return {
    resume: () => context.resume(),
    setVolume,
    stop,
    close: () => {
      stop();
      master.disconnect();
      return context.close();
    },
    play(cue: SoundCue, volume: number) {
      if (context.state !== 'running') return;
      setVolume(volume);
      if (cue === 'champion' || active.size > 24) stop();
      for (const tone of SOUND_CUES[cue] as Tone[]) {
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        const start = context.currentTime + tone.at;
        oscillator.type = tone.wave ?? 'sine';
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        if (tone.endFrequency)
          oscillator.frequency.exponentialRampToValueAtTime(
            tone.endFrequency,
            start + tone.duration,
          );
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(
          tone.gain,
          start + Math.min(0.012, tone.duration / 4),
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
        oscillator.connect(gain);
        gain.connect(master);
        const voice = { oscillator, gain };
        active.add(voice);
        oscillator.onended = () => {
          active.delete(voice);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + tone.duration + 0.015);
      }
    },
  };
}
