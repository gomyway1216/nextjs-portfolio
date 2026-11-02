import { test, expect, type BrowserContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.80' } });

test('full-width answers show as submitted, lock while sending and preserve later drafts', async ({ page, browser, baseURL }) => {
  const guests: BrowserContext[] = [];
  let release: (() => void) | undefined;
  try {
    const host = page.request;
    let view: RoomView = await (await host.post('/api/ogiri', {
      data: { name: '日本語の回答者', avatar: '🐱', hostPlays: true },
    })).json();
    const path = `/api/ogiri/${view.code}`;
    for (let i = 0; i < 2; i++) {
      const guest = await browser.newContext({ baseURL });
      guests.push(guest);
      expect((await guest.request.post(path, {
        data: { type: 'join', name: `参加者${i}`, avatar: '🐶' },
      })).ok()).toBe(true);
    }
    view = await (await host.post(path, { data: { type: 'start', turn: view.turn } })).json();
    const draftKey = `ogiri:draft:${view.code}:${view.assignments[0].id}`;
    await page.goto(`/games/ogiri/${view.code}`);
    const form = page.getByTestId('answer-form').first();
    const input = form.getByRole('textbox', { name: '回答', exact: true });
    await input.fill('㍿'.repeat(26));
    await expect(form.getByText('104 / 100文字', { exact: true })).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toBeDisabled();
    await input.fill(' １００点！ ');
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**${path}`, async route => {
      const request = route.request();
      if (request.method() === 'POST' && request.postDataJSON()?.type === 'answer') await held;
      await route.continue();
    });
    await form.locator('button[type="submit"]').click();
    await expect(input).toBeDisabled();
    await expect(form.locator('button[type="submit"]')).toHaveText('送信中…');
    release!();
    await expect(form.locator('button[type="submit"]')).toHaveText('送信済み ✓');
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('100点!');
    expect(await page.evaluate(key => localStorage.getItem(key), draftKey)).toBeNull();
    expect((await (await host.get(path)).json()).assignments[0].answer).toBe('100点!');
    await page.unroute(`**${path}`);

    await page.reload();
    await expect(input).toHaveValue('100点!');
    await expect(form.locator('button[type="submit"]')).toHaveText('送信済み ✓');
    await input.fill('100点! 続きを考え中');
    await page.reload();
    await expect(input).toHaveValue('100点! 続きを考え中');
    await expect(form.locator('button[type="submit"]')).toHaveText('回答を更新');
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('button[type="submit"]')).toHaveText('送信済み ✓');
    const second = page.getByTestId('answer-form').nth(1);
    await second.getByRole('textbox', { name: '回答', exact: true }).fill('ＡＢＣとｶﾀｶﾅ');
    await second.locator('button[type="submit"]').click();
    await expect(second.locator('button[type="submit"]')).toHaveText('送信済み ✓');
    await expect(second.getByRole('textbox', { name: '回答', exact: true })).toHaveValue('ABCとカタカナ');
    // Another tab sharing this guest session can update the answer between polls.
    expect((await host.post(path, {
      data: { type: 'answer', matchId: view.assignments[0].id, text: '別タブで更新した回答！' },
    })).ok()).toBe(true);
    await expect(input).toHaveValue('別タブで更新した回答!');
    await expect(form.locator('button[type="submit"]')).toHaveText('送信済み ✓');
  } finally {
    release?.();
    await Promise.all(guests.map(guest => guest.close()));
  }
});
