import { test, expect } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.236' } });

test('the ogiri lobby offers 20 rounds and a shorter game fits its own limit', async ({ page: host }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  await host.goto('/games/ogiri');
  await host.getByRole('button', { name: '主催する', exact: true }).click();
  await host.getByRole('textbox', { name: 'ニックネーム' }).fill('ラウンドの進行役');
  await host.getByRole('button', { name: 'ルームを作成 →', exact: true }).click();
  await expect(host).toHaveURL(/\/games\/ogiri\/[A-Z2-9]{6}$/);
  const path = `/api/ogiri/${host.url().split('/').at(-1)}`;
  const rounds = host.getByLabel('ラウンド数', { exact: true });
  await expect(rounds.locator('option')).toHaveCount(20);
  await rounds.selectOption('20');
  await host.getByRole('button', { name: '設定を保存', exact: true }).click();
  await expect(host.getByRole('status')).toContainText('設定を保存しました');
  const room: RoomView = await (await host.request.get(path)).json();
  expect(room.settings.rounds).toBe(20);
  await host.getByLabel('遊ぶゲーム', { exact: true }).selectOption('identity');
  await expect(rounds.locator('option')).toHaveCount(5);
  await expect(rounds).toHaveValue('5');
  await host.getByLabel('遊ぶゲーム', { exact: true }).selectOption('shiritori');
  await expect(rounds).toHaveCount(0);
});
