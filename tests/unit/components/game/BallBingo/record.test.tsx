import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BallRecord } from '@/components/game/BallBingo/BallRecord';
import { CHANCE_BALLS, FREE_GIVES, MOST_SHOTS, POCKETS, drawGame, linesOf, playOut, pocketOfNumber, seeded, stateAfter } from '@/components/game/BallBingo/engine';
import { getStrings } from '@/components/game/BallBingo/i18n';
import { earlierOf, recordOf, tallyOf } from '@/components/game/BallBingo/record';

const at = (id: string): number => POCKETS.findIndex((pocket) => pocket.id === id);
const n = pocketOfNumber;

describe('the record of a game’s balls', () => {
  // 2 7 6 is the card's top row; 5 then ends nothing; 8 ends the 2-5-8 diagonal.
  const game = [n(2), at('out-l'), at('free-r'), n(7), at('chance'), n(6), n(5), n(8), at('out-r'), at('out-l'), at('out-r')];

  it('is a whole game the machine could have drawn', () => {
    expect(playOut(game)).not.toBeNull();
  });

  it('lists each ball with its pocket, the lines it finished and the balls it gave', () => {
    const record = recordOf(game);
    expect(record.map((entry) => entry.ball)).toEqual(game.map((_, i) => i + 1));
    expect(record.map((entry) => entry.pocket)).toEqual(game);
    expect(record.map((entry) => entry.kind)).toEqual(['number', 'out', 'free', 'number', 'chance', 'number', 'number', 'number', 'out', 'out', 'out']);
    expect(record.map((entry) => entry.number)).toEqual([2, 0, 0, 7, 0, 6, 5, 8, 0, 0, 0]);
    expect(record.map((entry) => entry.linesMade)).toEqual([0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0]);
    expect(record.map((entry) => entry.gave)).toEqual([0, 0, FREE_GIVES, 0, CHANCE_BALLS, 0, 0, 0, 0, 0, 0]);
    expect(tallyOf(record)).toEqual({ shots: 11, numbers: 5, outs: 4, frees: 1, chance: true });
  });

  it('counts every line a ball finishes at once', () => {
    // CHANCE gives the balls for it; then 5 ends the middle row (9 5 1) and the middle column (7 5 3) together.
    const draws = [at('chance'), n(9), n(1), n(7), n(3), n(5)];
    const record = recordOf(draws);
    expect(record[record.length - 1].linesMade).toBe(2);
    expect(record.reduce((sum, entry) => sum + entry.linesMade, 0)).toBe(linesOf(stateAfter(draws, draws.length).marks));
  });

  it('lists only the balls that have landed', () => {
    expect(recordOf(game, 0)).toEqual([]);
    expect(recordOf(game, 3)).toEqual(recordOf(game).slice(0, 3));
    expect(recordOf(game, -2)).toEqual([]);
    expect(recordOf(game, 99)).toHaveLength(game.length);
    expect(tallyOf([])).toEqual({ shots: 0, numbers: 0, outs: 0, frees: 0, chance: false });
  });

  it('stops at a ball the machine could not have drawn', () => {
    expect(recordOf([n(2), n(2), n(5)])).toHaveLength(1);
    expect(recordOf([n(2), 99, n(5)])).toHaveLength(1);
    expect(recordOf([n(2), 1.5])).toHaveLength(1);
    expect(recordOf([...game, n(1)])).toHaveLength(game.length);
  });

  it('agrees with the engine over many drawn games, and never runs past the longest', () => {
    const random = seeded(20261110);
    for (let g = 0; g < 2000; g++) {
      const draws = drawGame(random);
      const record = recordOf(draws);
      const end = stateAfter(draws, draws.length);
      expect(record).toHaveLength(draws.length);
      expect(record.length).toBeLessThanOrEqual(MOST_SHOTS);
      expect(record.reduce((sum, entry) => sum + entry.linesMade, 0)).toBe(linesOf(end.marks));
      const tally = tallyOf(record);
      expect(tally.frees).toBe(end.frees);
      expect(tally.chance).toBe(end.chance);
      expect(tally.numbers + tally.outs + tally.frees + (tally.chance ? 1 : 0)).toBe(end.shots);
    }
  });
});

describe('the earlier game the record lists', () => {
  const recent = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];

  it('is the one chosen, while the game it was chosen during is on the machine', () => {
    expect(earlierOf(null, 'c', recent)).toBeNull();
    expect(earlierOf({ id: 'a', during: 'c' }, 'c', recent)).toBe(recent[2]);
  });

  it('gives the record back to the machine at a new game, and when a reset empties the list', () => {
    expect(earlierOf({ id: 'a', during: 'c' }, 'd', recent)).toBeNull();
    expect(earlierOf({ id: 'a', during: 'c' }, null, recent)).toBeNull();
    expect(earlierOf({ id: 'a', during: 'c' }, 'c', [])).toBeNull();
    expect(earlierOf({ id: 'gone', during: 'c' }, 'c', recent)).toBeNull();
  });
});

describe('the record, as it is drawn', () => {
  const game = [n(2), at('free-l'), n(7), at('chance'), n(6), at('out-l')];
  const draw = (language: 'en' | 'ja', draws: readonly number[] | null, shown: number, earlier = false) =>
    renderToStaticMarkup(<BallRecord language={language} draws={draws} shown={shown} earlier={earlier} />);

  it('is empty, and says what it will list, before a ball has landed', () => {
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      for (const markup of [draw(language, null, 0), draw(language, game, 0)]) {
        expect(markup).toContain('data-count="0"');
        expect(markup).not.toContain('<li');
        expect(markup).toContain(t.recordEmpty);
        expect(markup).toContain('data-earlier="false"');
      }
    }
  });

  it('lists the balls landed so far, stars the one that finished a line, and counts them, in both languages', () => {
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      const part = draw(language, game, 4);
      expect(part).toContain('data-count="4"');
      expect(part.match(/<li/g)).toHaveLength(4);
      expect(part).not.toContain('★<');
      const whole = draw(language, game, game.length);
      expect(whole.match(/<li/g)).toHaveLength(game.length);
      expect(whole.match(/data-line="true"/g)).toHaveLength(1);
      expect(whole).toContain('6★');
      expect(whole).toContain(t.recordBall(5, t.pocketName('number', 6), 1, 0));
      expect(whole).toContain(t.recordBall(2, 'FREE', 0, FREE_GIVES));
      expect(whole).toContain(t.recordBall(4, 'CHANCE', 0, CHANCE_BALLS));
      expect(whole).toContain(t.recordTally(6, 3, 1, 1, true));
      expect(whole).not.toContain(t.recordEmpty);
    }
  });

  it('says when the balls are an earlier game’s', () => {
    expect(draw('ja', game, game.length)).toContain(getStrings('ja').recordTitle);
    expect(draw('ja', game, game.length, true)).toContain(getStrings('ja').recordTitleEarlier);
    expect(draw('en', game, game.length, true)).toContain('data-earlier="true"');
  });
});
