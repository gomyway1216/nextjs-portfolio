import { test, expect } from '@playwright/test';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.92' } });

type AudioProbe = {
  contexts: AudioContext[];
  maxRms: number;
  samples: number;
};

test('TV sound check produces real audio, respects volume and mute, and resumes interrupted audio', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    const probe: AudioProbe = { contexts: [], maxRms: 0, samples: 0 };
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
  await page.goto(`/games/ogiri/${room.code}/tv`);
  const snapshot = () => page.evaluate(() => {
    const probe = (window as unknown as { __partyAudioProbe: AudioProbe }).__partyAudioProbe;
    return { states: probe.contexts.map(context => context.state), maxRms: probe.maxRms, samples: probe.samples };
  });
  const resetPeak = () => page.evaluate(() => {
    (window as unknown as { __partyAudioProbe: AudioProbe }).__partyAudioProbe.maxRms = 0;
  });
  await expect(page.getByRole('button', { name: '効果音をオン', exact: true })).toContainText('音OFF');
  expect((await snapshot()).states).toEqual([]);
  await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ミュート', exact: true })).toContainText('音ON');
  await expect.poll(async () => (await snapshot()).states).toEqual(['running']);
  await page.getByText('音設定', { exact: true }).click();
  const volume = page.getByRole('slider', { name: '効果音の音量', exact: true });
  await expect(volume).toHaveValue('60');
  await page.getByLabel('試聴する効果音', { exact: true }).selectOption('champion');
  await resetPeak();
  await page.getByRole('button', { name: '音を試す', exact: true }).click();
  await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.005);
  expect((await snapshot()).samples).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('sound-check-tv.png'), fullPage: true });

  await volume.fill('0');
  await page.waitForTimeout(150); // Let the analyser's finite sample window drain.
  await resetPeak();
  await page.getByRole('button', { name: '音を試す', exact: true }).click();
  await page.waitForTimeout(250);
  expect((await snapshot()).maxRms).toBeLessThan(0.00001);
  await volume.fill('60');

  await page.evaluate(async () => {
    await (window as unknown as { __partyAudioProbe: AudioProbe }).__partyAudioProbe.contexts[0].suspend();
  });
  await expect(page.getByRole('button', { name: '音声を再開', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '音声を再開', exact: true }).click();
  await expect.poll(async () => (await snapshot()).states).toEqual(['running']);
  await resetPeak();
  await page.getByRole('button', { name: '音を試す', exact: true }).click();
  await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.005);

  await page.getByRole('button', { name: 'ミュート', exact: true }).click();
  await expect(volume).toHaveCount(0);
  await page.waitForTimeout(150);
  await resetPeak();
  await page.waitForTimeout(250);
  expect((await snapshot()).maxRms).toBeLessThan(0.00001);
  expect(errors).toEqual([]);
});
