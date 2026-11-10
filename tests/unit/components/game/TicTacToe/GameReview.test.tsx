import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { reviewGame, type MoveRecord } from '@/components/game/TicTacToe/analysis';
import GameReview from '@/components/game/TicTacToe/GameReview';
import { getTicTacToeCopy } from '@/components/game/TicTacToe/i18n';

const game = (cells: number[], first: 'X' | 'O' = 'X'): MoveRecord[] =>
  cells.map((cell, i) => ({ cell, mark: i % 2 === 0 ? first : first === 'X' ? 'O' : 'X' }));

// X center, O top edge (a losing reply), X goes on to win.
const reviews = reviewGame(game([4, 1, 0, 8, 6, 2, 3]));

const render = (selected: number | null, language: 'en' | 'ja' = 'en', list = reviews) =>
  renderToStaticMarkup(
    <GameReview
      reviews={list}
      selected={selected}
      onSelect={() => {}}
      copy={getTicTacToeCopy(language)}
    />
  );

describe('GameReview', () => {
  it('lists every move with who played it, where, and its grade', () => {
    const markup = render(null);
    expect(markup.match(/<li>/g)).toHaveLength(7);
    expect(markup).toContain('You · Center');
    expect(markup).toContain('AI · Top<');
    expect(markup.match(/data-grade="blunder"/g)).toHaveLength(1);
    expect(markup.match(/data-grade="good"/g)).toHaveLength(6);
    expect(markup).toContain('>Blunder<');
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(7);
  });

  it('sums up the human’s slips while no move is selected', () => {
    expect(render(null)).toContain('None of your moves gave anything away.');
    // AI opens in the center and the human answers on an edge.
    expect(render(null, 'en', reviewGame(game([4, 1], 'O')))).toContain(
      'One of your moves gave something away.'
    );
  });

  it('explains the selected move and offers the way back', () => {
    const markup = render(1);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toContain(
      'Lets the opponent force a win. Top left or Top right or Bottom left or Bottom right would have held the draw.'
    );
    expect(markup).toContain('Back to final position');
    expect(render(null)).not.toContain('Back to final position');
    expect(render(2)).toContain('Keeps a forced win.');
    expect(render(3)).toContain('Already lost against perfect play.');
  });

  it('is in Japanese too', () => {
    const markup = render(1, 'ja');
    expect(markup).toContain('対局の振り返り');
    expect(markup).toContain('あなた · 中央');
    expect(markup).toContain('>悪手<');
    expect(markup).toContain('相手に勝ち筋を与える手。左上か右上か左下か右下なら引き分けを保てました。');
    expect(markup).toContain('最終局面に戻る');
  });
});

describe('copy', () => {
  it('has the same keys and nine cell names in both languages', () => {
    const en = getTicTacToeCopy('en');
    const ja = getTicTacToeCopy('ja');
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    expect(en.cellNames).toHaveLength(9);
    expect(ja.cellNames).toHaveLength(9);
    for (const outcome of ['win', 'draw', 'loss'] as const) {
      expect(en.hintText('Center', outcome)).toContain('Center');
      expect(ja.hintText('中央', outcome)).toContain('中央');
    }
  });
});
