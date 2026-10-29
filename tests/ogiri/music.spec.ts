import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { PARTY_MUSIC_FILE, PARTY_MUSIC_GAIN, PARTY_MUSIC_LOOP_SECONDS, partyMusicLoopBounds } from '../../src/lib/ogiri/music';
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
  return { path, roomUrl: `/games/ogiri/${room.code}`, action,
    close: () => Promise.all(contexts.map(context => context.close())) };
}

test('waiting music is lazy, shares output/cache, ducks and obeys room/device lifecycle', async ({ page, browser, baseURL }, info) => {
  await installProbe(page);
  const errors: string[] = [];
  let navigating = false;
  let pollUrl: URL | null = null;
  page.on('pageerror', error => {
    // WebKit reports the old document's explicitly cancelled poll during navigation.
    if (navigating && pollUrl && browser.browserType().name() === 'webkit' &&
      error.name === `Fetch API cannot load ${pollUrl.protocol.slice(0, -1)}` &&
      error.message === `/${pollUrl.host}${pollUrl.pathname}${pollUrl.search} due to access control checks.` &&
      error.stack?.split('\n')[0] === `Fetch API cannot load ${pollUrl.href} due to access control checks.`) return;
    errors.push(error.message);
  });
  let requests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === PARTY_MUSIC_FILE) requests++; });
  const room = await roomFixture(page, browser, baseURL);
  pollUrl = new URL(`${room.path}?view=tv`, page.url());
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
    const background = await snapshot(page);
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
    const underEffect = await snapshot(page);
    expect((await snapshot(page)).starts).toBe(1);
    await expect.poll(async () => (await snapshot(page)).gain).toBeCloseTo(PARTY_MUSIC_GAIN, 4);
    const levels = await snapshot(page);
    expect(levels.maxPeak).toBeLessThan(0.97);
    const output = info.outputPath('actual-music-output.json');
    writeFileSync(output, JSON.stringify({ background, underEffect, recovered: levels }, null, 2));
    await info.attach('actual-music-output', { path: output, contentType: 'application/json' });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: info.outputPath('waiting-music-settings-tv.png'), fullPage: true });
    const phone = await page.context().newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(room.roomUrl);
    await phone.getByRole('button', { name: '音設定', exact: true }).click();
    await expect(phone.getByRole('checkbox', { name: '回答・投票中にBGM', exact: true })).toBeChecked();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    await phone.screenshot({ path: info.outputPath('waiting-music-settings-phone.png'), fullPage: true });
    await phone.close();
    await page.bringToFront();
    await page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === room.path);
    await page.context().setOffline(true);
    await expect.poll(async () => (await snapshot(page)).active).toBe(0);
    await page.context().setOffline(false);
    await expect.poll(async () => (await snapshot(page)).active).toBe(1);
    expect(requests).toBe(1);
    expect((await snapshot(page)).decodes).toBe(1);
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
    navigating = true;
    try { await page.reload(); } finally { navigating = false; }
    await page.getByRole('button', { name: '音設定', exact: true }).click();
    await expect(music).not.toBeChecked();
    await room.action({ type: 'next' }); // Another voting turn, with music preference still off.
    await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
    await page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === room.path);
    expect(requests).toBe(1);
    await page.getByRole('button', { name: '音設定', exact: true }).click();
    await music.check();
    await expect.poll(async () => (await snapshot(page)).active).toBe(1);
    navigating = true;
    try {
      await page.locator('a[href="/games/ogiri"]').first().click();
      await expect.poll(async () => (await snapshot(page)).states).toEqual(['closed']);
    } finally { navigating = false; }
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

for (const retainPadding of [false, true]) test(`the native loop has no encoder-padding gap (${retainPadding ? 'retained padding' : 'native decoder'})`, async ({ page }, info) => {
  await page.goto('/games/ogiri');
  const decoded = await page.evaluate(async ({ file, retainPadding, seconds }) => {
    const context = new OfflineAudioContext(2, 44100 * 4, 44100);
    let buffer = await context.decodeAudioData(await (await fetch(file)).arrayBuffer());
    // Also cover decoders retaining LAME's delay on platforms that trim it natively.
    if (retainPadding && Math.abs(buffer.duration - seconds) < 1 / 44100) {
      const padded = context.createBuffer(2, buffer.length + 1748, 44100);
      for (let channel = 0; channel < 2; channel++) padded.copyToChannel(buffer.getChannelData(channel), channel, 1105);
      buffer = padded;
    }
    Object.assign(window, { __nativeMusicLoop: { context, buffer } });
    return { duration: buffer.duration, sampleRate: buffer.sampleRate };
  }, { file: PARTY_MUSIC_FILE, retainPadding, seconds: PARTY_MUSIC_LOOP_SECONDS });
  const loop = partyMusicLoopBounds(decoded);
  const result = await page.evaluate(async ({ start, end }) => {
    const { context, buffer } = (window as unknown as {
      __nativeMusicLoop: { context: OfflineAudioContext; buffer: AudioBuffer };
    }).__nativeMusicLoop;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = start;
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
    return { decodedSeconds: buffer.duration, loopStart: start, loopSeconds: end - start, step, silenceMs: maxSilence / 44.1,
      beforeRms: rms(seam - 4410, seam), afterRms: rms(seam, seam + 4410), wav: btoa(binary) };
  }, loop);
  const sample = info.outputPath('native-loop-seam.wav');
  writeFileSync(sample, Buffer.from(result.wav, 'base64'));
  await info.attach('native-loop-seam', { path: sample, contentType: 'audio/wav' });
  const { wav: _wav, ...metrics } = result;
  const measured = info.outputPath('native-loop-metrics.json');
  writeFileSync(measured, JSON.stringify(metrics, null, 2));
  await info.attach('native-loop-metrics', { path: measured, contentType: 'application/json' });
  expect(result.loopSeconds).toBeCloseTo(PARTY_MUSIC_LOOP_SECONDS, 8);
  expect(result.beforeRms).toBeGreaterThan(0.003);
  expect(result.afterRms).toBeGreaterThan(0.003);
  expect(result.step).toBeLessThan(0.01);
  expect(result.silenceMs).toBeLessThan(2);
});
