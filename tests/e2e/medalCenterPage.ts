import { expect, type Page } from '@playwright/test';

import { BANK_KEY, ledgerKey } from '../../src/components/game/MedalCenter/bank';
import { balanceOf, parseLedger, type Ledger } from '../../src/components/game/MedalCenter/ledger';
import { arrived } from './streamedPage';

/** The medal center's front: opened, arrived, and its bank read. */
export async function openCenter(page: Page, language: 'en' | 'ja' = 'en'): Promise<void> {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/medal-center');
  expect(response?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByTestId('center-counter')).toHaveAttribute('data-loaded', 'true');
}

/** The medal bank this browser keeps for a guest, read the way the bank reads it, or null when it keeps none. */
export async function storedBank(page: Page, uid: string | null = null): Promise<Ledger | null> {
  return parseLedger(await page.evaluate((key) => window.localStorage.getItem(key), uid === null ? BANK_KEY : ledgerKey(uid)));
}

/** The medals in that bank, or −1 when there is none. */
export async function bankBalance(page: Page): Promise<number> {
  const ledger = await storedBank(page);
  return ledger ? balanceOf(ledger) : -1;
}

/** Resets the medals at the medal center: the one reset there is. It asks first, and is answered yes. */
export async function resetAtCenter(page: Page): Promise<void> {
  await openCenter(page);
  const reset = page.getByTestId('center-reset');
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(page.getByTestId('center-reset-dialog')).toBeVisible();
  await page.getByTestId('center-reset-confirm').click();
  await expect(page.getByTestId('center-reset-dialog')).toHaveCount(0);
  await expect.poll(async () => (await storedBank(page))?.era ?? -1).toBeGreaterThan(0);
}
