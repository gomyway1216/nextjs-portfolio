import { test } from '@playwright/test';

import { JP_LAMPS, STAR, numberForFace, numberForLamp } from '../../src/components/game/Sugoroku/engine';
import { quietFloor } from './quietFloor';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Temporary: pictures of the machine to look at while building it (not committed).
const OUT = process.env.SHOTS ?? '/tmp';

for (const [width, height, language] of [[375, 812, 'en'] as const, [320, 640, 'ja'] as const]) {
  test(`story ${width} ${language}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    await quietFloor(context);
    await context.addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
    const page = await context.newPage();
    await page.goto('/games/sugoroku');
    await arrived(page);
    await page.waitForSelector('[data-testid="sg-machine"][data-playable="true"]', { timeout: 30_000 });
    await page.getByTestId('sg-roll').evaluate((el) => el.scrollIntoView({ block: 'end' }));
    // A 6 from START: the lamp chance, its first lamp (×10).
    await rigPresses(page, [numberForFace(6), 0.1, 0.1, 0.1, numberForLamp(0), 0.1]);
    await page.getByTestId('sg-roll').click();
    await page.waitForSelector('[data-testid="sg-machine"][data-phase="lamp"]', { timeout: 10_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/st-${width}-${language}-1-lamp.png` });
    await page.waitForSelector('[data-testid="sg-machine"][data-phase="idle"]', { timeout: 30_000 });
    await page.screenshot({ path: `${OUT}/st-${width}-${language}-2-lampdone.png` });
    // A 6 from the lamp chance: the whale, 4 and 6 up its back, the blowhole, the star, a 6.
    await rigPresses(page, [numberForFace(6), numberForFace(4), numberForFace(6), numberForFace(5), numberForLamp(JP_LAMPS.indexOf(STAR)), numberForFace(6)]);
    await page.getByTestId('sg-roll').click();
    await page.waitForSelector('[data-testid="sg-machine"][data-phase="ride"]', { timeout: 10_000 });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${OUT}/st-${width}-${language}-3-ride.png` });
    await page.waitForSelector('[data-testid="sg-machine"][data-phase="final"]', { timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/st-${width}-${language}-4-final.png` });
    await page.waitForSelector('[data-testid="sg-banner"][data-kind="jackpot"]', { timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/st-${width}-${language}-5-jackpot.png` });
    await page.waitForSelector('[data-testid="sg-machine"][data-phase="idle"]', { timeout: 30_000 });
    await page.screenshot({ path: `${OUT}/st-${width}-${language}-6-done.png` });
    await page.locator('#sg-tab-odds').click();
    await page.screenshot({ path: `${OUT}/st-${width}-${language}-7-odds.png`, fullPage: true });
    await context.close();
  });
}
