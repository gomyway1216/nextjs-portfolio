import { test, expect, type Page } from './fixtures';
import { arrived } from './streamedPage';

// The probability games have a Play tab and a Simulate tab. The Play tab used to be thrown away when the other tab
// was opened, so the record a player had built up was gone when they came back. Both panels now stay in the page and
// the one that is not showing is `hidden`.

async function open(page: Page, path: string, language: 'en' | 'ja', baseURL: string | undefined) {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: baseURL ?? 'http://localhost:3000' }]);
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await arrived(page);
}

test('Monty Hall keeps the record and the round history across a visit to the Simulate tab', async ({ page, baseURL }) => {
  await open(page, '/games/monty-hall', 'en', baseURL);
  const play = page.locator('#mh-panel-play');
  const sim = page.locator('#mh-panel-sim');
  await expect(play).toBeVisible();
  await expect(sim).toBeHidden();

  // The first click is retried until hydration has attached the handlers.
  await expect(async () => {
    await play.getByRole('button', { name: /^Door 1/ }).click({ timeout: 1_000 });
    await expect(play.getByRole('button', { name: 'Stay', exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await play.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(play.getByRole('button', { name: 'Next round' })).toBeVisible();

  const record = play.locator('[class*="statGrid"]');
  const history = play.getByRole('listitem');
  await expect(record).toContainText('/ 1 · theory 33.3%');
  await expect(history).toHaveCount(1);
  const recordBefore = await record.innerText();
  const historyBefore = await history.first().innerText();

  await page.getByRole('tab', { name: 'Simulate' }).click();
  await expect(sim).toBeVisible();
  // Hidden, not removed: out of sight, out of the tab order and out of the accessibility tree.
  await expect(play).toBeHidden();
  await expect(play).toHaveAttribute('hidden', '');
  await expect(page.getByRole('button', { name: 'Next round' })).toHaveCount(0);
  await expect(sim.getByRole('button', { name: 'Run simulation' })).toBeVisible();

  await page.getByRole('tab', { name: 'Play' }).click();
  await expect(play).toBeVisible();
  await expect(sim).toBeHidden();
  expect(await record.innerText()).toBe(recordBefore);
  await expect(history).toHaveCount(1);
  expect(await history.first().innerText()).toBe(historyBefore);
  // The finished round is still on the table too.
  await expect(play.getByRole('button', { name: 'Next round' })).toBeVisible();
});

test('Birthday Paradox does not call a 99.99997% chance 100%, and keeps its deals across tabs', async ({ page, baseURL }) => {
  await open(page, '/games/birthday-paradox', 'en', baseURL);
  const play = page.locator('#bp-panel-play');
  const slider = play.getByRole('slider');
  await expect(async () => {
    await slider.fill('100');
    await expect(play.getByText('n = 100').first()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(play.getByText('>99.99%', { exact: true })).toBeVisible();
  await expect(play.getByText('100.00%')).toHaveCount(0);

  await play.getByRole('button', { name: /Deal|Generate|🎲/ }).click();
  await expect(play.getByText('1 / 1 deal', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Simulate' }).click();
  await expect(play).toBeHidden();
  await page.getByRole('tab', { name: 'Play' }).click();
  await expect(play.getByText('1 / 1 deal', { exact: true })).toBeVisible();
  await expect(slider).toHaveValue('100');
});

// With eight doors there are four to a row. Each door used to be at least 72px wide whatever the column, so on a
// 360px phone they overlapped and the last one stuck out of the row; the "Stay" mark on the chosen door was held to
// half the door's width and broke in two in Japanese ("そのま / ま").
test.describe('Monty Hall with eight doors on a narrow phone (ja)', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test('the doors sit side by side inside the row and the mark on the chosen door is one line', async ({ page, baseURL }) => {
    await open(page, '/games/monty-hall', 'ja', baseURL);
    const play = page.locator('#mh-panel-play');
    const doors = play.locator('[class*="doorsRow"] button');
    await expect(async () => {
      await play.locator('#mh-doorcount').selectOption('8');
      await expect(doors).toHaveCount(8, { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await doors.first().click();
    const mark = doors.first().locator('span').filter({ hasText: 'そのまま' });
    await expect(mark).toBeVisible();

    const row = await play.locator('[class*="doorsRow"]').boundingBox();
    const boxes = await doors.evaluateAll((elements) =>
      elements.map((element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      }),
    );
    if (!row) throw new Error('the row of doors has no box');
    for (const [index, box] of boxes.entries()) {
      expect(box.left).toBeGreaterThanOrEqual(row.x - 0.5);
      expect(box.right).toBeLessThanOrEqual(row.x + row.width + 0.5);
      // Not over the door to its right (the first four share a row, and so do the last four).
      if (index % 4 !== 3) expect(box.right).toBeLessThanOrEqual(boxes[index + 1].left);
    }

    const markBox = await mark.boundingBox();
    if (!markBox) throw new Error('the mark has no box');
    const lineHeight = await mark.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight));
    expect(markBox.height).toBeLessThan(lineHeight * 1.5);
    expect(markBox.x).toBeGreaterThanOrEqual(boxes[0].left);
    expect(markBox.x + markBox.width).toBeLessThanOrEqual(boxes[0].right);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

// The two sentences under the live odds used to be one paragraph with a <br> between them, and the site hides a <br>
// inside a paragraph on phones: they ran together ("… 50.00% nowThe same formulas …").
for (const language of ['en', 'ja'] as const) {
  test.describe(`Gambler's Ruin on a phone (${language})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('the two caption sentences under the live odds are on separate lines', async ({ page, baseURL }) => {
      await open(page, '/games/gamblers-ruin', language, baseURL);
      const shift = page.getByTestId('gr-live-shift');
      const note = page.getByTestId('gr-live-note');
      await shift.scrollIntoViewIfNeeded();
      await expect(shift).toBeVisible();
      await expect(note).toBeVisible();
      await expect(shift).toContainText(language === 'en' ? 'now' : '現在');
      expect(await shift.innerText()).not.toContain(await note.innerText());

      const [first, second] = await Promise.all([shift.boundingBox(), note.boundingBox()]);
      if (!first || !second) throw new Error('caption has no box');
      // The second sentence starts below the end of the first, at the same left edge, inside the screen.
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 0.5);
      expect(Math.abs(second.x - first.x)).toBeLessThan(1);
      expect(first.x).toBeGreaterThanOrEqual(0);
      expect(second.x + second.width).toBeLessThanOrEqual(390);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  });
}
