import { test, expect } from '@playwright/test';
import { SOUND_CUES, type SoundCue } from '../../src/lib/ogiri/sound';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.92' } });

type AudioProbe = {
  contexts: AudioContext[];
  maxRms: number;
  maxPeak: number;
  samples: number;
};

for (const width of [390, 1920]) test(`sound on a ${width}px device is audible, remembers volume, closes and resumes`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
  await page.addInitScript(() => {
    const probe: AudioProbe = { contexts: [], maxRms: 0, maxPeak: 0, samples: 0 };
    Object.defineProperty(window, '__partyAudioProbe', { value: probe });
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this);
      const context = gain.context as AudioContext;
      const connect = gain.connect;
      gain.connect = ((...args: unknown[]) => {
        const result = Reflect.apply(connect, gain, args);
        if (args[0] === context.destination) {
          // Observe actual browser DSP after the master gain, without replacing any sound nodes.
          const analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          Reflect.apply(connect, gain, [analyser]);
          probe.contexts.push(context);
          const samples = new Float32Array(analyser.fftSize);
          window.setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
            probe.maxRms = Math.max(probe.maxRms, rms);
            probe.maxPeak = Math.max(probe.maxPeak, ...samples.map(Math.abs));
            probe.samples++;
          }, 5);
        }
        return result;
      }) as typeof gain.connect;
      return gain;
    };
  });
  const room = await (await page.request.post('/api/ogiri', {
    data: { name: '音の進行役', avatar: '🐱', hostPlays: false },
  })).json();
  await page.goto(`/games/ogiri/${room.code}${width === 1920 ? '/tv' : ''}`);
  const snapshot = () => page.evaluate(() => {
    const probe = (window as unknown as { __partyAudioProbe: AudioProbe }).__partyAudioProbe;
    return { states: probe.contexts.map(context => context.state), maxRms: probe.maxRms, maxPeak: probe.maxPeak, samples: probe.samples };
  });
  const resetPeak = () => page.evaluate(() => {
    const probe = (window as unknown as { __partyAudioProbe: AudioProbe }).__partyAudioProbe;
    probe.maxRms = 0;
    probe.maxPeak = 0;
  });
  await expect(page.getByRole('button', { name: '効果音をオン', exact: true })).toContainText('音OFF');
  expect((await snapshot()).states).toEqual([]);
  await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ミュート', exact: true })).toContainText('音ON');
  await expect.poll(async () => (await snapshot()).states).toEqual(['running']);
  await page.getByText('音設定', { exact: true }).click();
  const volume = page.getByRole('slider', { name: '効果音の音量', exact: true });
  await expect(volume).toHaveValue('60');
  await expect(page.getByLabel('試聴する効果音', { exact: true })).toHaveValue('count');
  await page.getByLabel('試聴する効果音', { exact: true }).selectOption('cheer');
  await resetPeak();
  await page.getByRole('button', { name: '音を試す', exact: true }).click();
  await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.05);
  await page.waitForTimeout(5000);
  const at60 = await snapshot();
  expect(at60.maxPeak).toBeLessThan(0.97);
  if (width === 1920) {
    const palette = [];
    for (const cue of ['select', 'join', 'start', 'submit', 'vote', 'voting', 'reveal', 'ranking', 'champion', 'tick', 'bounce', 'count', 'cheer']) {
      await page.getByLabel('試聴する効果音', { exact: true }).selectOption(cue);
      await resetPeak();
      await page.getByRole('button', { name: '音を試す', exact: true }).click();
      await expect.poll(async () => (await snapshot()).maxRms, { message: `${cue} must reach the actual master output` }).toBeGreaterThan(0.003);
      const recordedDuration: Partial<Record<SoundCue, number>> = { start: 3, bounce: 0.62, count: 2.8, ranking: 3.7, cheer: 4.8 };
      const duration = recordedDuration[cue as SoundCue] ?? Math.max(...SOUND_CUES[cue as SoundCue].map(tone => tone.at + tone.duration));
      await page.waitForTimeout(duration * 1000 + 150);
      const measured = await snapshot();
      expect(measured.maxPeak).toBeLessThan(0.97);
      palette.push({ cue, maxRms: measured.maxRms, maxPeak: measured.maxPeak });
    }
    await info.attach('actual-palette-output', { body: JSON.stringify(palette), contentType: 'application/json' });
    await page.waitForTimeout(5000);
  }
  await page.getByLabel('試聴する効果音', { exact: true }).selectOption('cheer');
  await volume.fill('100');
  await resetPeak();
  await page.getByRole('button', { name: '音を試す', exact: true }).click();
  await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.08);
  await page.waitForTimeout(5000);
  const at100 = await snapshot();
  expect(at100.maxRms).toBeGreaterThan(at60.maxRms * 1.4);
  expect(at100.maxPeak).toBeLessThan(0.97);
  await info.attach('real-output-levels', { body: JSON.stringify({ at60, at100 }), contentType: 'application/json' });
  expect((await snapshot()).samples).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('sound-check-tv.png'), fullPage: true });

  await volume.fill('0');
  await page.waitForTimeout(150); // Let the analyser's finite sample window drain.
  await resetPeak();
  await page.getByRole('button', { name: '音を試す', exact: true }).click();
  await page.waitForTimeout(250);
  expect((await snapshot()).maxRms).toBeLessThan(0.00001);
  await volume.fill('60');

  const dialog = page.getByRole('dialog', { name: '効果音の設定', exact: true });
  await page.getByRole('button', { name: '音設定を閉じる', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '音設定', exact: true }).click();
  await expect(page.getByLabel('試聴する効果音', { exact: true })).toHaveValue('cheer');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '音設定', exact: true }).click();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(dialog).toHaveCount(0);

  await page.evaluate(async () => {
    await (window as unknown as { __partyAudioProbe: AudioProbe }).__partyAudioProbe.contexts[0].suspend();
  });
  await expect(page.getByRole('button', { name: '音声を再開', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '音声を再開', exact: true }).click();
  await expect.poll(async () => (await snapshot()).states).toEqual(['running']);
  await resetPeak();
  await page.getByRole('button', { name: '音設定', exact: true }).click();
  await page.getByRole('button', { name: '音を試す', exact: true }).click();
  await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.005);

  await page.getByRole('button', { name: 'ミュート', exact: true }).click();
  await expect(volume).toHaveCount(0);
  await page.waitForTimeout(150);
  await resetPeak();
  await page.waitForTimeout(250);
  expect((await snapshot()).maxRms).toBeLessThan(0.00001);

  await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
  await volume.fill('85');
  await page.reload();
  await expect(page.getByRole('button', { name: '効果音をオン', exact: true })).toContainText('音OFF');
  expect((await snapshot()).states).toEqual([]);
  await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
  await expect(volume).toHaveValue('85');
  await page.getByRole('button', { name: 'ミュート', exact: true }).click();
  expect(errors).toEqual([]);
});
