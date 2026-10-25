export type WishCue = 'charge' | 'launch' | 'reveal-3' | 'reveal-4' | 'reveal-5';
export const WISH_AUDIO = Object.fromEntries(['charge', 'launch', 'reveal-3', 'reveal-4', 'reveal-5'].map((cue) => [cue, `/audio/starcat-caravan/${cue}-v2.mp3`])) as Record<WishCue, string>;

/** One musical scene at a time. A queued cue must never play after skip/close/mute. */
export function createWishAudio(makeContext: () => AudioContext = () => new AudioContext(), fetcher: typeof fetch = fetch) {
  let context: AudioContext | null = null;
  let enabled = false;
  let version = 0;
  let active: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  const buffers = new Map<WishCue, Promise<AudioBuffer>>();

  function stop() {
    version++;
    if (!active) return;
    const { source, gain } = active;
    active = null;
    source.onended = null;
    try { source.stop(); } catch { /* It may already have finished. */ }
    source.disconnect(); gain.disconnect();
  }

  function load(cue: WishCue): Promise<AudioBuffer> {
    const cached = buffers.get(cue);
    if (cached) return cached;
    const pending = fetcher(WISH_AUDIO[cue]).then((response) => {
      if (!response.ok) throw new Error('Wish sound unavailable');
      return response.arrayBuffer();
    }).then((bytes) => context!.decodeAudioData(bytes));
    buffers.set(cue, pending);
    void pending.catch(() => { if (buffers.get(cue) === pending) buffers.delete(cue); });
    return pending;
  }

  return {
    enable(next: boolean) {
      enabled = next;
      if (!enabled) { stop(); return; }
      try {
        context ??= makeContext();
        void context.resume().catch(() => undefined);
        // Started by the explicit sound toggle; no audio or network work before consent.
        for (const cue of Object.keys(WISH_AUDIO) as WishCue[]) void load(cue).catch(() => undefined);
      } catch { enabled = false; }
    },
    play(cue: WishCue) {
      stop();
      if (!enabled || !context) return;
      const ticket = version;
      void load(cue).then((buffer) => {
        if (!enabled || ticket !== version || !context || context.state === 'closed') return;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer; source.loop = cue === 'charge';
        gain.gain.value = cue === 'charge' ? .3 : .65;
        source.connect(gain); gain.connect(context.destination);
        active = { source, gain };
        source.onended = () => { source.disconnect(); gain.disconnect(); if (active?.source === source) active = null; };
        source.start();
      }).catch(() => undefined);
    },
    stop,
    dispose() { enabled = false; stop(); void context?.close().catch(() => undefined); },
  };
}
