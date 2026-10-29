import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { PARTY_MUSIC_FILE, PARTY_MUSIC_GAIN, PARTY_MUSIC_LOOP_SECONDS } from '../../src/lib/ogiri/music';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.97' } });
type MusicProbe = {
  contexts: AudioContext[]; sources: AudioBufferSourceNode[]; active: Set<AudioBufferSourceNode>;
  gains: GainNode[]; decodes: number; musicRms: number; masterRms: number; maxPeak: number;
};
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: MusicProbe = { contexts: [], sources: [], active: new Set(), gains: [], decodes: 0,
      musicRms: 0, masterRms: 0, maxPeak: 0 };
    Object.defineProperty(window, '__partyMusicProbe', { value: probe });
    const observe = (node: AudioNode, music: boolean) => {
      const analyser = node.context.createAnalyser();
      analyser.fftSize = 1024;
      node.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        if (music) probe.musicRms = rms;
        else { probe.masterRms = rms; probe.maxPeak = Math.max(probe.maxPeak, ...samples.map(Math.abs)); }
      }, 10);
    };
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function (this: AudioContext) {
      const gain = createGain.call(this);
      const connect = gain.connect;
      gain.connect = ((...args: unknown[]) => {
        const result = Reflect.apply(connect, gain, args);
        if (args[0] === this.destination) {
          probe.contexts.push(this);
          observe(gain, false);
        }
        return result;
      }) as typeof gain.connect;
      return gain;
    };
    const connect = AudioBufferSourceNode.prototype.connect;
    AudioBufferSourceNode.prototype.connect = function (this: AudioBufferSourceNode, ...args: unknown[]) {
      const result = Reflect.apply(connect, this, args);
      if (this.loop && (this.buffer?.duration ?? 0) > 60 && args[0] instanceof GainNode) {
        probe.gains.push(args[0]);
        observe(args[0], true);
      }
      return result;
    } as typeof connect;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<typeof start>) {
      if (this.loop && (this.buffer?.duration ?? 0) > 60) {
        probe.sources.push(this);
        probe.active.add(this);
        this.addEventListener('ended', () => probe.active.delete(this));
      }
      Reflect.apply(start, this, args);
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (this: AudioContext, data: ArrayBuffer) {
      return decode.call(this, data).then(buffer => {
        if (buffer.duration > 60) probe.decodes++;
        return buffer;
      });
    } as typeof decode;
  });
}
const snapshot = (page: Page) => page.evaluate(() => {
  const p = (window as unknown as { __partyMusicProbe: MusicProbe }).__partyMusicProbe;
  return { contexts: p.contexts.length, states: p.contexts.map(c => c.state), starts: p.sources.length,
    active: p.active.size, decodes: p.decodes, gain: p.gains.at(-1)?.gain.value,
    musicRms: p.musicRms, masterRms: p.masterRms, maxPeak: p.maxPeak };
});
async function roomFixture(page: Page, browser: Browser, baseURL?: string) {
  let room: RoomView = await (await page.request.post('/api/ogiri', {
    data: { name: 'BGM進行役', avatar: '🐱', hostPlays: false },
  })).json();
  const path = `/api/ogiri/${room.code}`;
  const contexts: BrowserContext[] = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ baseURL });
    contexts.push(context);
    expect((await context.request.post(path, { data: { type: 'join', name: `BGM参加${i}`, avatar: '🐶' } })).ok()).toBe(true);
  }
  const action = async (data: object) => {
    room = await (await page.request.get(path)).json();
    const response = await page.request.post(path, { data: { ...data, turn: room.turn } });
    expect(response.ok(), `HTTP ${response.status()}`).toBe(true);
    room = await response.json();
  };
  await action({ type: 'settings', settings: { ...room.settings, autoAdvance: false, answerSeconds: 180, voteSeconds: 60 } });
  await page.goto(`/games/ogiri/${room.code}/tv`);
  return { path, action, close: () => Promise.all(contexts.map(context => context.close())) };
}

test('waiting music is lazy, shares output/cache, ducks and obeys room/device lifecycle', async ({ page, browser, baseURL }, info) => {
  await installProbe(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === PARTY_MUSIC_FILE) requests++; });
  const room = await roomFixture(page, browser, baseURL);
  try {
    await page.getByRole('button', { name: '音設定', exact: true }).click();
    const music = page.getByRole('checkbox', { name: '回答・投票中にBGM', exact: true });
    await expect(music).toBeChecked();
    expect((await snapshot(page)).contexts).toBe(0);
    expect(requests).toBe(0);
    await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).states).toEqual(['running']);
    expect(requests).toBe(0); // The lobby stays quiet even after the gesture.
    await room.action({ type: 'start' });
    await expect.poll(async () => (await snapshot(page)).active).toBe(1);
    await expect.poll(async () => (await snapshot(page)).gain).toBeCloseTo(PARTY_MUSIC_GAIN, 4);
    await expect.poll(async () => (await snapshot(page)).masterRms).toBeGreaterThan(0.0001);
    expect(requests).toBe(1);
    expect((await snapshot(page)).decodes).toBe(1);
    for (let poll = 0; poll < 2; poll++) await page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === room.path);
    await room.action({ type: 'next' });
    await expect(page.getByRole('heading', { name: 'どっちで笑った？', exact: true })).toBeVisible();
    expect((await snapshot(page)).starts).toBe(1); // Answer→vote and polling keep the same loop.
    await page.getByRole('button', { name: '音設定', exact: true }).click();
    await page.getByLabel('試聴する効果音', { exact: true }).selectOption('count');
    await page.getByRole('button', { name: '音を試す', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).gain).toBeCloseTo(PARTY_MUSIC_GAIN * 0.2, 4);
    expect((await snapshot(page)).starts).toBe(1);
    await expect.poll(async () => (await snapshot(page)).gain).toBeCloseTo(PARTY_MUSIC_GAIN, 4);
    const levels = await snapshot(page);
    expect(levels.maxPeak).toBeLessThan(0.97);
    await info.attach('actual-music-output', { body: JSON.stringify(levels), contentType: 'application/json' });
    await room.action({ type: 'pause' });
    await expect.poll(async () => (await snapshot(page)).active).toBe(0);
    await room.action({ type: 'resume' });
    await expect.poll(async () => (await snapshot(page)).active).toBe(1);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(async () => (await snapshot(page)).active).toBe(0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(async () => (await snapshot(page)).active).toBe(1);
    await page.getByRole('button', { name: 'ミュート', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).active).toBe(0);
    await expect.poll(async () => (await snapshot(page)).masterRms).toBeLessThan(0.00001);
    await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).active).toBe(1);
    expect(requests).toBe(1);
    expect((await snapshot(page)).contexts).toBe(1);
    expect((await snapshot(page)).decodes).toBe(1);
    await room.action({ type: 'next' }); // Results must stop music even while their stinger plays.
    await expect.poll(async () => (await snapshot(page)).active).toBe(0);
    await page.getByRole('button', { name: '音設定', exact: true }).click();
    await music.uncheck();
    await page.reload();
    await page.getByRole('button', { name: '音設定', exact: true }).click();
    await expect(music).not.toBeChecked();
    await room.action({ type: 'next' }); // Another voting turn, with music preference still off.
    await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
    await page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === room.path);
    expect(requests).toBe(1);
    await page.getByRole('button', { name: '音設定', exact: true }).click();
    await music.check();
    await expect.poll(async () => (await snapshot(page)).active).toBe(1);
    await page.locator('a[href="/games/ogiri"]').first().click();
    await expect.poll(async () => (await snapshot(page)).states).toEqual(['closed']);
    expect(errors).toEqual([]);
  } finally { await room.close(); }
});

test('a failed music load leaves effects usable and retries only on user request', async ({ page, browser, baseURL }) => {
  await installProbe(page);
  let requests = 0;
  await page.route(`**${PARTY_MUSIC_FILE}`, async route => {
    requests++;
    if (requests === 1) await route.fulfill({ status: 503, body: 'temporary failure' });
    else await route.continue();
  });
  const room = await roomFixture(page, browser, baseURL);
  try {
    await room.action({ type: 'start' });
    await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
    await page.getByRole('button', { name: '音設定', exact: true }).click();
    await expect(page.getByText('BGMを読み込めませんでした。効果音はそのまま使えます。')).toBeVisible();
    for (let poll = 0; poll < 2; poll++) await page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === room.path);
    expect(requests).toBe(1);
    await page.getByLabel('試聴する効果音', { exact: true }).selectOption('count');
    await page.getByRole('button', { name: '音を試す', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).masterRms).toBeGreaterThan(0.003);
    await page.getByRole('button', { name: 'BGMを再読み込み', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).active).toBe(1);
    expect(requests).toBe(2);
    expect((await snapshot(page)).contexts).toBe(1);
    expect((await snapshot(page)).decodes).toBe(1);
  } finally { await room.close(); }
});

test('the native decoded loop crosses its boundary without an encoder-padding gap', async ({ page }, info) => {
  await page.goto('/games/ogiri');
  const result = await page.evaluate(async ({ file, end }) => {
    const context = new OfflineAudioContext(2, 44100 * 4, 44100);
    const buffer = await context.decodeAudioData(await (await fetch(file)).arrayBuffer());
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopEnd = end;
    source.connect(context.destination);
    source.start(0, end - 1);
    const rendered = await context.startRendering();
    const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
    const rms = (start: number, finish: number) => Math.sqrt(channels.reduce((sum, ch) =>
      sum + ch.subarray(start, finish).reduce((total, value) => total + value * value, 0), 0) / ((finish - start) * 2));
    const seam = 44100;
    const step = Math.max(...channels.map(ch => Math.abs(ch[seam] - ch[seam - 1])));
    let silent = 0, maxSilence = 0;
    for (let i = seam - 2205; i < seam + 2205; i++) {
      silent = Math.max(Math.abs(channels[0][i]), Math.abs(channels[1][i])) < 0.0001 ? silent + 1 : 0;
      maxSilence = Math.max(maxSilence, silent);
    }
    const wav = new ArrayBuffer(44 + rendered.length * 4), bytes = new DataView(wav);
    const text = (at: number, value: string) => [...value].forEach((c, i) => bytes.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF'); bytes.setUint32(4, wav.byteLength - 8, true); text(8, 'WAVEfmt ');
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
    bytes.setUint32(24, 44100, true); bytes.setUint32(28, 176400, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
    text(36, 'data'); bytes.setUint32(40, rendered.length * 4, true);
    for (let i = 0; i < rendered.length; i++) for (let channel = 0; channel < 2; channel++)
      bytes.setInt16(44 + i * 4 + channel * 2, Math.round(Math.max(-1, Math.min(1, channels[channel][i])) * 32767), true);
    let binary = ''; const encoded = new Uint8Array(wav);
    for (let i = 0; i < encoded.length; i += 8192) binary += String.fromCharCode(...encoded.subarray(i, i + 8192));
    return { decodedSeconds: buffer.duration, loopSeconds: end, step, silenceMs: maxSilence / 44.1,
      beforeRms: rms(seam - 4410, seam), afterRms: rms(seam, seam + 4410), wav: btoa(binary) };
  }, { file: PARTY_MUSIC_FILE, end: PARTY_MUSIC_LOOP_SECONDS });
  await info.attach('native-loop-seam.wav', { body: Buffer.from(result.wav, 'base64'), contentType: 'audio/wav' });
  const { wav: _wav, ...metrics } = result;
  await info.attach('native-loop-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });
  expect(result.decodedSeconds).toBeCloseTo(PARTY_MUSIC_LOOP_SECONDS, 2);
  expect(result.beforeRms).toBeGreaterThan(0.003);
  expect(result.afterRms).toBeGreaterThan(0.003);
  expect(result.step).toBeLessThan(0.01);
  expect(result.silenceMs).toBeLessThan(2);
});
