import { test, expect } from '@playwright/test';

test('twelve image characters, opt-in audio, volume and reduced motion work on a phone', async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const state = { started: 0, stopped: 0 };
    Object.defineProperty(window, '__testAudio', { value: state });
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = original.call(this);
      const start = oscillator.start.bind(oscillator),
        stop = oscillator.stop.bind(oscillator);
      oscillator.start = (...args) => {
        state.started++;
        start(...args);
      };
      oscillator.stop = (...args) => {
        state.stopped++;
        stop(...args);
      };
      return oscillator;
    };
  });
  await page.goto('/games/ogiri');
  await page.getByRole('button', { name: '主催する', exact: true }).click();
  const choices = page.getByRole('button', { name: /^キャラクター / });
  await expect(choices).toHaveCount(12);
  for (const choice of await choices.all()) {
    const box = await choice.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await expect(choices.locator('img')).toHaveCount(12);
  for (const image of await choices.locator('img').all())
    await expect(image).toHaveJSProperty('naturalWidth', 384);
  await page.getByRole('button', { name: 'キャラクター おばもち', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'キャラクター おばもち', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page
      .getByRole('button', { name: 'キャラクター おばもち', exact: true })
      .locator('span')
      .first()
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
  await page.screenshot({ path: testInfo.outputPath('characters-phone.png'), fullPage: true });
  await page.getByRole('textbox', { name: 'ニックネーム' }).fill('キャラの進行役');
  await page.getByRole('button', { name: 'ルームを作成 →' }).click();
  await expect(page).toHaveURL(/\/games\/ogiri\/[A-Z2-9]{6}$/);
  const code = page.url().split('/').at(-1)!;
  const started = () =>
    page.evaluate(
      () => (window as unknown as { __testAudio: { started: number } }).__testAudio.started,
    );
  expect(await started()).toBe(0);
  await page.getByRole('button', { name: '効果音をオン', exact: true }).click();
  await expect.poll(started).toBe(1);
  // The synthesizer schedules an end and can replace it with an immediate stop on mute.
  // Exercise that Web Audio contract in both real browser engines (not just mocked nodes).
  expect(
    await page.evaluate(async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      oscillator.start();
      oscillator.stop(context.currentTime + 1);
      oscillator.stop();
      oscillator.disconnect();
      await context.close();
      return true;
    }),
  ).toBe(true);
  const volume = page.getByRole('slider', { name: '効果音の音量' });
  await expect(volume).toHaveValue('40');
  await volume.fill('20');
  await expect(volume).toHaveValue('20');
  await page.getByRole('button', { name: 'ミュート', exact: true }).click();
  await expect(volume).toHaveCount(0);
  const before = await started();
  await request.post(`/api/ogiri/${code}`, {
    data: { type: 'join', name: '参加者', avatar: '🐧' },
  });
  await expect(page.getByRole('heading', { name: 'ただいま 1 人' })).toBeVisible();
  expect(await started()).toBe(before);
  await expect(page.getByRole('img', { name: 'ぺんた', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
