import { test, expect, request as apiRequest, type APIRequestContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.246' } });

const line = { v: 1, strokes: [{ c: '#201a32', w: 7, p: [40, 40, 300, 200] }] };

test('a phone draws its word, guesses the others from four choices, and the TV shows each answer', async ({ page, browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: APIRequestContext[] = [];
  const client = async (n: number) => {
    const context = await apiRequest.newContext({ baseURL, extraHTTPHeaders: { 'x-real-ip': `198.57.0.${n}` } });
    contexts.push(context);
    return context;
  };
  const host = await client(1);
  const tvContext = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  try {
    let room: RoomView = await (await host.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false, gameType: 'quiz' } })).json();
    const path = `/api/ogiri/${room.code}`;
    const players = [await client(2), await client(3)];
    for (const [i, player] of players.entries())
      expect((await player.post(path, { data: { type: 'join', name: `当てる人${i + 1}`, avatar: 'pudding' } })).ok()).toBe(true);
    expect((await page.request.post(path, { data: { type: 'join', name: '描く人', avatar: 'rabbit' } })).ok()).toBe(true);
    const tv = await tvContext.newPage();
    await tv.goto(`/games/ogiri/${room.code}/tv`);
    room = await (await host.get(path)).json();
    const started = await host.post(path, { data: { type: 'start', turn: room.turn } });
    expect(started.ok(), await started.text()).toBe(true);

    await page.goto(`/games/ogiri/${room.code}`);
    const mine: RoomView = await (await page.request.get(path)).json();
    const word = mine.drawingGame!.assignment!.prompt!;
    await expect(page.getByRole('heading', { name: `お題「${word}」`, exact: true })).toBeVisible();
    await expect(tv.getByRole('heading', { name: 'みんな、こっそりお題を描いています。', exact: true })).toBeVisible();
    await expect(tv.getByText(word)).toHaveCount(0);
    const canvas = page.getByLabel('絵を描くキャンバス', { exact: true });
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .8, box.y + box.height * .7, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'この絵を送る', exact: true }).click();
    await page.getByRole('button', { name: 'これでOK！', exact: true }).click();
    for (const player of players) {
      const view: RoomView = await (await player.get(path)).json();
      expect((await player.post(`${path}/drawing`, { data: { type: 'drawingSubmit', drawing: line, turn: view.turn } })).ok()).toBe(true);
      const ready: RoomView = await (await player.get(path)).json();
      expect((await player.post(path, { data: { type: 'answerReady', ready: true, turn: ready.turn } })).ok()).toBe(true);
    }

    for (let picture = 1; picture <= 3; picture++) {
      await expect(tv.getByText(`おえかきクイズ · ${picture} / 3`, { exact: true })).toBeVisible();
      await expect(tv.getByRole('img', { name: /の絵$/ })).toBeVisible();
      const choices = tv.getByRole('group', { name: '答えの候補' });
      await expect(choices.locator('span')).toHaveCount(4);
      const view: RoomView = await (await page.request.get(path)).json();
      const quiz = view.drawingGame!.quiz!;
      if (quiz.mine) await expect(page.getByRole('heading', { name: 'あなたの絵です！ みんなの予想を待ってね。', exact: true })).toBeVisible();
      else {
        await page.getByRole('button', { name: quiz.choices[0], exact: true }).click();
        await expect(page.getByText('あなたの予想', { exact: true })).toBeVisible();
      }
      for (const player of players) {
        const theirs: RoomView = await (await player.get(path)).json();
        if (theirs.drawingGame!.quiz!.mine) continue;
        expect((await player.post(path, { data: { type: 'quizGuess', choice: 1, turn: theirs.turn } })).ok()).toBe(true);
      }
      await expect(tv.getByRole('heading', { name: /^正解は「.+」！$/ })).toBeVisible();
      if (quiz.mine) expect(quiz.choices).toContain(word);
      const next: RoomView = await (await host.get(path)).json();
      expect((await host.post(path, { data: { type: 'next', turn: next.turn } })).ok()).toBe(true);
    }
    await expect(tv.getByRole('heading', { name: 'いま、こうなってます。', exact: true })).toBeVisible();
  } finally {
    await tvContext.close();
    await Promise.all(contexts.map(context => context.dispose()));
  }
});
