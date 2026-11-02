import { test, expect, type BrowserContext, type Response } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.93' } });

type CelebrationProbe = {
  maxRms: number;
  countStartAt: number | null;
  revealAt: number | null;
  scores: { phase: string; target: number; value: number; counting: string | null }[];
  pointsVoices: number;
  longStops: number;
};

test('four players hear a pop, a synchronized points voice and a final cheer without cheering zero-point reveals', async ({ page: host, browser, baseURL }, info) => {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  try {
    let room: RoomView = await (await host.request.post('/api/ogiri', {
      data: { name: '盛り上げ係', avatar: '🐱', hostPlays: false },
    })).json();
    const path = `/api/ogiri/${room.code}`;
    const read = async (context: BrowserContext): Promise<RoomView> => (await context.request.get(path)).json();
    const action = async (data: object) => {
      room = await read(host.context());
      const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
      expect(response.ok()).toBe(true);
      room = await response.json();
    };
    for (let i = 0; i < 4; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      expect((await context.request.post(path, { data: { type: 'join', name: `盛り上がる人${i + 1}`, avatar: 'rabbit' } })).ok()).toBe(true);
    }
    await action({ type: 'settings', settings: { ...room.settings, rounds: 1 } });
    await host.goto(`/games/ogiri/${room.code}`);
    const tv = await host.context().newPage();
    tv.on('pageerror', error => errors.push(error.message));
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.emulateMedia({ reducedMotion: 'no-preference' });
    await tv.addInitScript(() => {
      const probe: CelebrationProbe = { maxRms: 0, countStartAt: null, revealAt: null, scores: [], pointsVoices: 0, longStops: 0 };
      Object.defineProperty(window, '__celebrationProbe', { value: probe });
      const startBuffer = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>) {
        const scoring = this.buffer && !this.loop && this.buffer.duration >= 2 && document.querySelector('h1')?.textContent === 'これ書いたの、だれ？';
        if (scoring) probe.pointsVoices++;
        if (scoring && probe.countStartAt === null
          && document.querySelector('[data-score-final="600"]')) {
          probe.countStartAt = performance.now() + Math.max(0, (args[0] ?? this.context.currentTime) - this.context.currentTime) * 1000;
        }
        startBuffer.apply(this, args);
      };
      const stopBuffer = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.stop = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['stop']>) {
        if (this.buffer && !this.loop && this.buffer.duration >= 4) probe.longStops++;
        stopBuffer.apply(this, args);
      };
      const createGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () {
        const gain = createGain.call(this);
        const context = gain.context as AudioContext;
        const connect = gain.connect;
        gain.connect = ((...args: unknown[]) => {
          const result = Reflect.apply(connect, gain, args);
          if (args[0] === context.destination) {
            const analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            Reflect.apply(connect, gain, [analyser]);
            const samples = new Float32Array(analyser.fftSize);
            window.setInterval(() => {
              analyser.getFloatTimeDomainData(samples);
              const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
              probe.maxRms = Math.max(probe.maxRms, rms);
            }, 5);
          }
          return result;
        }) as typeof gain.connect;
        return gain;
      };
      // Capture the initial DOM value even when a browser/test round trip takes
      // longer than the one-second animation; no precise frame timing is assumed.
      new MutationObserver(() => {
        const score = document.querySelector('[data-testid="score-count"][data-score-final="600"], [data-testid="score-count"][data-score-final="300"]');
        if (!score) return;
        const sample = {
          phase: document.querySelector('h1')?.textContent ?? '',
          target: Number(score.getAttribute('data-score-final')),
          value: Number(score.textContent),
          counting: score.getAttribute('data-counting'),
        };
        if (probe.revealAt === null && sample.phase === 'これ書いたの、だれ？' && sample.target === 600)
          probe.revealAt = performance.now();
        if (JSON.stringify(probe.scores.at(-1)) !== JSON.stringify(sample)) probe.scores.push(sample);
      }).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-counting', 'data-score-final'] });
    });
    await tv.goto(`/games/ogiri/${room.code}/tv`);
    const snapshot = () => tv.evaluate(() => {
      const probe = (window as unknown as { __celebrationProbe: CelebrationProbe }).__celebrationProbe;
      return { maxRms: probe.maxRms, scores: probe.scores, countStartAt: probe.countStartAt, revealAt: probe.revealAt, pointsVoices: probe.pointsVoices, longStops: probe.longStops };
    });
    const resetPeak = () => tv.evaluate(() => {
      (window as unknown as { __celebrationProbe: CelebrationProbe }).__celebrationProbe.maxRms = 0;
    });
    await tv.getByRole('button', { name: '効果音をオン', exact: true }).click();
    await action({ type: 'start' });
    for (const context of contexts) {
      const mine = await read(context);
      for (const assignment of mine.assignments)
        expect((await context.request.post(path, { data: { type: 'answer', matchId: assignment.id, text: 'その発想はなかった' } })).ok()).toBe(true);
      expect((await context.request.post(path, { data: { type: 'answerReady', ready: true, turn: mine.turn } })).ok()).toBe(true);
    }
    await expect(tv.getByRole('heading', { name: 'どっちで笑った？', exact: true })).toBeVisible();
    await tv.waitForTimeout(700); // Finish the recorded entrance before measuring the scoring cue.
    await tv.screenshot({ path: info.outputPath('mystery-speakers-tv.png'), fullPage: true });
    await resetPeak();
    for (const context of contexts) {
      const mine = await read(context);
      if (mine.match?.canVote)
        expect((await context.request.post(path, { data: { type: 'vote', matchId: mine.match.id, choice: 0 } })).ok()).toBe(true);
    }
    room = await read(host.context());
    expect(room.match?.result?.points).toEqual([600, 0]);
    const animatedScore = tv.locator('[data-testid="score-count"][data-score-final="600"]');
    await expect(animatedScore).toHaveText('600');
    await expect(animatedScore).toHaveAttribute('data-counting', 'false');
    const revealScores = (await snapshot()).scores.filter(sample => sample.phase === 'これ書いたの、だれ？');
    expect(revealScores.some(sample => sample.value < 600)).toBe(true);
    expect(revealScores.at(-1)?.value).toBe(600);
    const sync = await snapshot();
    expect(sync.countStartAt).not.toBeNull();
    expect(sync.revealAt).not.toBeNull();
    // The decoded clip and the first reveal DOM must start within one 30fps frame.
    const audioDomGapMs = Math.abs(sync.countStartAt! - sync.revealAt!);
    expect(audioDomGapMs).toBeLessThan(34);
    await info.attach('score-audio-sync', { body: JSON.stringify({ audioDomGapMs }), contentType: 'application/json' });
    await tv.screenshot({ path: info.outputPath('revealed-speakers-tv.png'), fullPage: true });
    await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.005);
    expect((await snapshot()).pointsVoices).toBe(1);

    const firstWinner = room.match!.result!.authors[0];
    await action({ type: 'next' });
    let choice = 0;
    for (const context of contexts) {
      const mine = await read(context);
      if (mine.match?.canVote)
        expect((await context.request.post(path, { data: { type: 'vote', matchId: mine.match.id, choice: choice++ } })).ok()).toBe(true);
    }
    room = await read(host.context());
    expect(room.match?.result?.points).toEqual([100, 100]);
    await expect(tv.locator('[data-testid="score-count"][data-score-final="100"]')).toHaveText(['100', '100']);
    // Re-score the same mounted result: its old 100 must reset to 0 before counting to 300.
    // Keep the first winner's 600 (2 votes + win + shutout) intact, even if they also answered this second match.
    await action({ type: 'hide', matchId: room.match!.id, choice: room.match!.result!.authors[0] === firstWinner ? 0 : 1 });
    await expect(tv.locator('[data-testid="score-count"][data-score-final="300"]')).toHaveText('300');
    const rescored = (await snapshot()).scores.filter(sample => sample.target === 300);
    expect(rescored[0]?.value).toBe(0);
    expect(rescored.at(-1)?.value).toBe(300);

    // Close the next match without votes: an answer-only reveal and repeated polls must not cheer.
    await action({ type: 'next' });
    await expect(tv.getByRole('heading', { name: 'どっちで笑った？', exact: true })).toBeVisible();
    const voicesBeforeZero = (await snapshot()).pointsVoices;
    await action({ type: 'next' });
    expect(room.match?.result?.points).toEqual([0, 0]);
    await expect(tv.getByRole('heading', { name: 'これ書いたの、だれ？', exact: true })).toBeVisible();
    await tv.waitForTimeout(3200); // More than two normal polls of the identical result.
    expect((await snapshot()).pointsVoices).toBe(voicesBeforeZero);

    // A host can audition a long cue while the game is paused, including slider changes/polls.
    await action({ type: 'pause' });
    const pausedNotice = tv.getByRole('status').filter({ hasText: '一時停止中です' });
    await expect(pausedNotice).toBeVisible();
    let pausedReads = 0;
    const pausedPoll = (response: Response) => {
      if (response.request().method() === 'GET' && new URL(response.url()).pathname === path && response.ok()) pausedReads++;
    };
    tv.on('response', pausedPoll);
    await tv.getByRole('button', { name: '音設定', exact: true }).click();
    await tv.getByLabel('試聴する効果音', { exact: true }).selectOption('cheer');
    const stopsBeforePreview = (await snapshot()).longStops;
    await resetPeak();
    await tv.getByRole('button', { name: '音を試す', exact: true }).click();
    await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.005);
    pausedReads = 0;
    await tv.getByRole('slider', { name: '効果音の音量', exact: true }).fill('85');
    await expect.poll(() => pausedReads).toBeGreaterThanOrEqual(2);
    expect((await snapshot()).longStops).toBe(stopsBeforePreview);
    await resetPeak();
    await tv.waitForTimeout(200);
    expect((await snapshot()).maxRms).toBeGreaterThan(0.0001);
    tv.off('response', pausedPoll);
    await tv.getByRole('button', { name: '音設定を閉じる', exact: true }).click();
    await tv.getByRole('button', { name: 'ミュート', exact: true }).click();
    await action({ type: 'resume' });
    await expect(pausedNotice).toHaveCount(0);
    await tv.getByRole('button', { name: '効果音をオン', exact: true }).click();
    await expect(tv.getByRole('button', { name: 'ミュート', exact: true })).toBeVisible();
    await tv.evaluate(() => { (window as unknown as { __celebrationProbe: CelebrationProbe }).__celebrationProbe.longStops = 0; });

    await tv.getByRole('button', { name: '動き多', exact: true }).click();
    await resetPeak();
    await action({ type: 'finish' });
    expect(room.players.find(player => player.name === firstWinner)?.score).toBe(600);
    expect(room.players.reduce((sum, player) => sum + player.score, 0)).toBe(900);
    await expect(tv.getByRole('heading', { name: '結果、出ました。', exact: true })).toBeVisible();
    await expect(animatedScore).toHaveText('600');
    await expect(animatedScore).toHaveAttribute('data-counting', 'false');
    const finalScores = (await snapshot()).scores.filter(sample => sample.phase === '結果、出ました。' && sample.target === 600);
    expect(finalScores.length).toBeGreaterThan(0);
    expect(finalScores.every(sample => sample.value === 600 && sample.counting === 'false')).toBe(true);
    await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.005);

    await action({ type: 'rematch' });
    await expect(tv.getByRole('heading', { name: 'メンバー、募集中。', exact: true })).toBeVisible();
    await expect.poll(async () => (await snapshot()).longStops).toBeGreaterThan(0);
    await tv.getByText('音設定', { exact: true }).click();
    await tv.waitForTimeout(200); // The new lobby has stopped the long final cue.
    for (const cue of ['count', 'cheer']) {
      await tv.getByLabel('試聴する効果音', { exact: true }).selectOption(cue);
      await resetPeak();
      await tv.getByRole('button', { name: '音を試す', exact: true }).click();
      await expect.poll(async () => (await snapshot()).maxRms).toBeGreaterThan(0.005);
      if (cue === 'count') await tv.waitForTimeout(1200);
    }
    await tv.getByRole('button', { name: 'ミュート', exact: true }).click();
    await tv.waitForTimeout(150);
    await resetPeak();
    await tv.waitForTimeout(250);
    expect((await snapshot()).maxRms).toBeLessThan(0.00001);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
