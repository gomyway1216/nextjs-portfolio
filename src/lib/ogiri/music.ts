import type { RoomView } from './types';

export const DEFAULT_PARTY_MUSIC_ENABLED = true;
export const PARTY_MUSIC_FILE = '/audio/ogiri/waiting-funk.mp3';
// Joth's 32-bar loop at 116 BPM, after removing the source's iTunSMPB padding.
export const PARTY_MUSIC_LOOP_SECONDS = 2919724 / 44100;
// LAME skip/discard metadata in this MP3. Some decoders retain these frames.
export function partyMusicLoopBounds(buffer: Pick<AudioBuffer, 'duration' | 'sampleRate'>) {
  const paddedSeconds = PARTY_MUSIC_LOOP_SECONDS + (1105 + 643) / 44100;
  const start = Math.abs(buffer.duration - paddedSeconds) < 2 / buffer.sampleRate ? 1105 / 44100 : 0;
  return { start, end: Math.min(buffer.duration, start + PARTY_MUSIC_LOOP_SECONDS) };
}
export const PARTY_MUSIC_GAIN = 0.06;
const DUCK_GAIN = PARTY_MUSIC_GAIN * 0.2;

export function shouldPlayPartyMusic(view: RoomView | null, options: {
  music: boolean; sound: boolean; blocked: boolean; hidden: boolean; volume: number;
  connected: boolean; stopped: boolean;
}) {
  return !!view && options.music && options.sound && !options.blocked && !options.hidden &&
    options.connected && !options.stopped && options.volume > 0 && !view.paused &&
    ['answering', 'voting'].includes(view.phase);
}

/** Inert until start() is called after the caller's audio-enable gesture. */
export function createPartyMusic(context: AudioContext, destination: AudioNode) {
  type Voice = { source: AudioBufferSourceNode; gain: GainNode };
  let current: Voice | undefined;
  const voices = new Set<Voice>();
  let loading: Promise<AudioBuffer | null> | undefined;
  let failed = false;
  let wanted = false;
  let closed = false;
  let duckUntil = 0;
  const hold = (gain: AudioParam, now: number) => {
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else {
      const value = gain.value;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(value, now);
    }
  };
  const disconnect = (voice: Voice) => {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    if (current === voice) current = undefined;
  };
  const restoreAfterDuck = (gain: AudioParam) => {
    gain.setValueAtTime(DUCK_GAIN, duckUntil);
    gain.linearRampToValueAtTime(PARTY_MUSIC_GAIN, duckUntil + 0.25);
  };
  const stop = () => {
    wanted = false;
    const voice = current;
    current = undefined;
    if (!voice) return;
    const now = context.currentTime;
    hold(voice.gain.gain, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.025);
    voice.source.stop(now + 0.03);
  };
  return {
    async start() {
      if (closed || context.state !== 'running') return false;
      wanted = true;
      if (current) return true;
      // A failed load is cached too: room polling must not repeatedly download it.
      loading ??= fetch(PARTY_MUSIC_FILE).then(async response => {
        if (!response.ok) throw new Error('Waiting music could not be loaded');
        return context.decodeAudioData(await response.arrayBuffer());
      }).catch(() => { failed = true; return null; });
      const buffer = await loading;
      if (!buffer || !wanted || closed || context.state !== 'running') return false;
      if (current) return true;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      const loop = partyMusicLoopBounds(buffer);
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
      source.connect(gain);
      gain.connect(destination);
      const now = context.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(duckUntil > now ? DUCK_GAIN : PARTY_MUSIC_GAIN, now + 0.2);
      if (duckUntil > now) restoreAfterDuck(gain.gain);
      const voice = { source, gain };
      current = voice;
      voices.add(voice);
      source.onended = () => disconnect(voice);
      source.start(now, loop.start);
      return true;
    },
    failed: () => failed,
    // Only a user retry clears a failed load; identical polls keep the cached failure.
    retry() {
      if (failed && !closed) { failed = false; loading = undefined; }
    },
    stop,
    duck(seconds: number) {
      if (closed || !Number.isFinite(seconds) || seconds < 0) return;
      const now = context.currentTime;
      duckUntil = Math.max(duckUntil, now + Math.max(0.04, Math.min(15, seconds)));
      if (!current) return;
      const gain = current.gain.gain;
      hold(gain, now);
      gain.linearRampToValueAtTime(DUCK_GAIN, now + 0.015);
      restoreAfterDuck(gain);
    },
    close() {
      closed = true;
      stop();
      for (const voice of voices) disconnect(voice);
    },
  };
}
