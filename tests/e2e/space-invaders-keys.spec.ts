import { test, expect, type Page } from './fixtures';

import { arrived } from './streamedPage';

// Space Invaders listens for Space on the window (start on the title screen, fire in play) and cancels the key. That
// also cancelled the press of whatever button had the keyboard focus: Space on a focused "How to Play" started a game
// instead of opening the guide, and Space on a focused "Pause" fired instead of pausing. A keyboard-focused control
// now keeps Space and Enter; a button that only has focus because it was clicked does not take Space from the cannon.

async function openTitle(page: Page) {
  await page.goto('/games/space-invaders');
  await arrived(page);
  await expect(page.getByRole('button', { name: 'Single Player' })).toBeVisible();
}

test('Space on a keyboard-focused button presses that button, on the title screen and in play', async ({ page }) => {
  await openTitle(page);

  // Title screen: Space on "How to Play" opens the guide and does not start a game.
  const how = page.getByRole('button', { name: 'How to Play' });
  await how.focus();
  await expect(how).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // With the focus on no control, Space still starts the game.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect(page.locator('canvas')).toBeVisible();

  // In play: Space on a keyboard-focused "Pause" pauses, and on "Resume" (Enter this time) resumes.
  const pause = page.getByRole('button', { name: 'Pause' });
  const resume = page.getByRole('button', { name: 'Resume' });
  await pause.focus();
  await page.keyboard.press('Space');
  await expect(resume).toBeVisible();
  await expect(resume).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pause).toBeVisible();
});

test('a button that was clicked does not take Space away from the cannon', async ({ page }) => {
  await openTitle(page);
  await page.getByRole('button', { name: 'Single Player' }).click();
  const pause = page.getByRole('button', { name: 'Pause' });
  const resume = page.getByRole('button', { name: 'Resume' });
  await pause.click();
  await resume.click();
  await expect(pause).toBeVisible();

  // The clicked button still has the focus. Space fires (the game goes on); it does not pause again.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(pause).toBeVisible();
  await expect(resume).toHaveCount(0);

  // Tab hands the focus back to the keyboard: Space then presses the focused button again.
  await page.keyboard.press('Tab');
  await pause.focus();
  await expect(pause).toBeFocused();
  await page.keyboard.press('Space');
  await expect(resume).toBeVisible();
});
