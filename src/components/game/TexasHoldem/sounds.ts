export type PokerSound = 'deal' | 'card' | 'chip' | 'fold' | 'showdown';

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  audioContext ??= new AudioContext();
  return audioContext;
}

function tone(
  audio: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  endFrequency = frequency,
) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(.012, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .01);
}

export async function unlockPokerAudio() {
  const audio = context();
  if (audio?.state === 'suspended') await audio.resume();
}

export function playPokerSound(sound: PokerSound, enabled: boolean) {
  if (!enabled) return;
  const audio = context();
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;

  if (sound === 'card') {
    tone(audio, 260, now, .045, .025, 'triangle', 150);
  } else if (sound === 'chip') {
    tone(audio, 760, now, .055, .035, 'sine', 520);
    tone(audio, 1040, now + .035, .05, .026, 'sine', 720);
  } else if (sound === 'fold') {
    tone(audio, 220, now, .09, .024, 'triangle', 90);
  } else if (sound === 'deal') {
    tone(audio, 320, now, .04, .022, 'triangle', 190);
    tone(audio, 360, now + .08, .04, .022, 'triangle', 210);
  } else {
    tone(audio, 440, now, .11, .035, 'sine', 440);
    tone(audio, 554, now + .1, .12, .035, 'sine', 554);
    tone(audio, 659, now + .2, .18, .04, 'sine', 659);
  }
}
