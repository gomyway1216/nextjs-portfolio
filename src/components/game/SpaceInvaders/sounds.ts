/**
 * Space Invaders - Sound Effects using Web Audio API
 */

let audioContext: AudioContext | null = null;

// Initialize audio context (must be called after user interaction)
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      console.warn('Web Audio API not supported');
      return null;
    }
  }
  return audioContext;
}

// Play a tone with given parameters
function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'square',
  volume: number = 0.3,
  frequencyEnd?: number
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

  if (frequencyEnd !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(frequencyEnd, ctx.currentTime + duration);
  }

  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}

// Play noise (for explosions)
function playNoise(duration: number, volume: number = 0.3): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + duration);

  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + duration);
}

// Sound effects
export const Sounds = {
  // Player shoots
  playerShoot: () => {
    playTone(880, 0.1, 'square', 0.2, 440);
  },

  // Enemy destroyed
  enemyHit: () => {
    playTone(200, 0.15, 'square', 0.25, 50);
    setTimeout(() => playNoise(0.1, 0.15), 50);
  },

  // Player hit/dies
  playerHit: () => {
    playNoise(0.4, 0.3);
    playTone(200, 0.4, 'sawtooth', 0.2, 50);
  },

  // UFO appears and moves
  ufoSound: () => {
    playTone(400, 0.1, 'sine', 0.15, 500);
    setTimeout(() => playTone(500, 0.1, 'sine', 0.15, 400), 100);
  },

  // UFO destroyed (big points!)
  ufoHit: () => {
    playTone(600, 0.1, 'square', 0.25, 800);
    setTimeout(() => playTone(800, 0.1, 'square', 0.25, 1000), 100);
    setTimeout(() => playTone(1000, 0.15, 'square', 0.25, 1200), 200);
  },

  // Enemy shoots
  enemyShoot: () => {
    playTone(150, 0.15, 'sawtooth', 0.1, 100);
  },

  // Level complete
  levelComplete: () => {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'square', 0.2), i * 150);
    });
  },

  // Game over
  gameOver: () => {
    playTone(200, 0.3, 'sawtooth', 0.25, 100);
    setTimeout(() => playTone(150, 0.3, 'sawtooth', 0.25, 75), 300);
    setTimeout(() => playTone(100, 0.5, 'sawtooth', 0.25, 50), 600);
  },

  // Enemy march beat (classic Space Invaders sound)
  enemyMarch: (pitch: number = 0) => {
    const frequencies = [55, 49, 46, 41]; // Bass notes
    const freq = frequencies[pitch % 4];
    playTone(freq, 0.1, 'square', 0.2);
  },

  // Start game
  startGame: () => {
    playTone(440, 0.1, 'square', 0.2);
    setTimeout(() => playTone(554, 0.1, 'square', 0.2), 100);
    setTimeout(() => playTone(659, 0.15, 'square', 0.2), 200);
  },
};

// Initialize audio on first user interaction
export function initAudio(): void {
  getAudioContext();
}
