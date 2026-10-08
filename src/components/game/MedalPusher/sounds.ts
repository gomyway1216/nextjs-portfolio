/**
 * The cabinet's sounds, synthesised with the Web Audio API so there is nothing
 * to download. They only play once the player has switched the sound on, which
 * is also the gesture a browser needs before it lets a page make noise.
 */

export type PusherSound =
  | 'land'
  | 'win'
  | 'lost'
  | 'gate'
  | 'full'
  | 'reelStop'
  | 'reach'
  | 'small'
  | 'big'
  | 'seven'
  | 'tick'
  | 'prize'
  | 'jackpot'
  | 'crash'
  | 'ball';

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
): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.01, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

/** Wakes the audio up; call it from the click that switches the sound on. */
export async function unlockAudio(): Promise<void> {
  const audio = context();
  if (audio?.state === 'suspended') await audio.resume();
}

/** A rising run of notes, one every `gap` seconds. */
function run(audio: AudioContext, notes: number[], gap: number, length: number, volume: number, type: OscillatorType = 'triangle'): void {
  const now = audio.currentTime;
  notes.forEach((note, index) => tone(audio, note, now + index * gap, length, volume, type));
}

export function playSound(sound: PusherSound, enabled: boolean): void {
  if (!enabled) return;
  const audio = context();
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  // A little spread in pitch keeps a stream of medals from sounding like one note repeated.
  const jitter = 0.94 + Math.random() * 0.12;

  switch (sound) {
    case 'land':
      tone(audio, 2300 * jitter, now, 0.05, 0.03, 'triangle', 1500 * jitter);
      break;
    case 'win':
      tone(audio, 1500 * jitter, now, 0.07, 0.05, 'sine', 2100 * jitter);
      tone(audio, 2900 * jitter, now + 0.02, 0.09, 0.025, 'triangle', 2400 * jitter);
      break;
    case 'lost':
      tone(audio, 190, now, 0.12, 0.05, 'triangle', 90);
      break;
    case 'gate':
      run(audio, [988, 1319], 0.07, 0.12, 0.06);
      break;
    case 'full':
      tone(audio, 240, now, 0.14, 0.04, 'square', 200);
      break;
    case 'reelStop':
      tone(audio, 520, now, 0.05, 0.05, 'square', 380);
      break;
    case 'reach':
      run(audio, [784, 932, 784, 932, 784, 932], 0.11, 0.1, 0.05, 'square');
      break;
    case 'small':
      run(audio, [784, 988, 1175, 1568], 0.09, 0.16, 0.07);
      break;
    case 'big':
      run(audio, [659, 784, 988, 1319, 1568, 1976], 0.09, 0.2, 0.08);
      break;
    case 'seven':
      run(audio, [523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.1, 0.22, 0.09);
      break;
    case 'tick':
      tone(audio, 1250, now, 0.03, 0.035, 'square', 900);
      break;
    case 'prize':
      run(audio, [784, 1047, 1319, 1568, 2093], 0.1, 0.24, 0.08);
      break;
    case 'crash':
      tone(audio, 160, now, 0.35, 0.09, 'sawtooth', 50);
      run(audio, [2100, 1700, 2400, 1500, 2000], 0.05, 0.08, 0.04);
      break;
    case 'ball':
      run(audio, [392, 523, 659, 784, 1047], 0.08, 0.2, 0.08, 'square');
      break;
    case 'jackpot':
      run(audio, [523, 659, 784, 1047, 1319, 1568, 2093, 1568, 2093, 2637, 2093, 2637, 3136], 0.11, 0.3, 0.1);
      break;
  }
}
