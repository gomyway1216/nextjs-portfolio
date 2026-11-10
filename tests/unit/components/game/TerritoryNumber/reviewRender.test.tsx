import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TerritoryNumberBoard } from '@/components/game/TerritoryNumber/TerritoryNumberBoard';
import { TerritoryNumberReview } from '@/components/game/TerritoryNumber/TerritoryNumberReview';
import { evaluateBoard } from '@/components/game/TerritoryNumber/gameLogic';
import { getTerritoryNumberStrings } from '@/components/game/TerritoryNumber/i18n';
import { boardsFromMoves, type MoveRecord } from '@/components/game/TerritoryNumber/review';

const MOVES: MoveRecord[] = (
  [[4, 9], [0, 8], [8, 1], [2, 3], [1, 2], [3, 4], [5, 5], [6, 6], [7, 7]] as const
).map(([cellIndex, card], i) => ({ cellIndex, card, slot: i % 2 === 0 ? 'p1' : 'p2' }));

const noop = () => {};

describe('TerritoryNumberReview (first paint, before any move is solved)', () => {
  for (const language of ['en', 'ja'] as const) {
    it(`opens on move 1 with every move listed — ${language}`, () => {
      const s = getTerritoryNumberStrings(language);
      const markup = renderToStaticMarkup(
        <TerritoryNumberReview
          moves={MOVES}
          mySlot="p1"
          myLabel={s.you}
          opponentLabel="AI"
          language={language}
          onBack={noop}
          onPlayAgain={noop}
        />
      );
      expect(markup).toContain(s.reviewTitle);
      expect(markup).toContain(s.moveOf(1, 9));
      expect(markup).toContain(s.movePlaced(s.you, 9, s.cellName(2, 2)));
      expect(markup).toContain(s.analysing);
      expect(markup.match(/aria-pressed="(true|false)"/g)).toHaveLength(9);
      expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
      // At move 1 there is a move to step back to and eight to step forward to.
      expect(markup).toContain(`aria-label="${s.stepPrev}"`);
      expect(markup).not.toMatch(new RegExp(`disabled=""[^>]*aria-label="${s.stepPrev}"`));
    });
  }
});

describe('TerritoryNumberBoard finished actions', () => {
  const board = boardsFromMoves(MOVES)[9];
  const s = getTerritoryNumberStrings('en');
  const render = (finishedExtra?: React.ReactNode) =>
    renderToStaticMarkup(
      <TerritoryNumberBoard
        board={board}
        remainingCards={[]}
        selectedCard={null}
        mySlot="p1"
        myLabel="You"
        opponentLabel="AI"
        evaluation={evaluateBoard(board)}
        phase="finished"
        finalMessage="done"
        statusText={null}
        onSelectCard={noop}
        onPlaceOnCell={noop}
        onLeave={noop}
        onPlayAgain={noop}
        finishedExtra={finishedExtra}
        language="en"
      />
    );

  it('shows the extra action beside Play again, and only Play again without it', () => {
    const withExtra = render(<button type="button">{s.reviewGame}</button>);
    expect(withExtra).toContain(s.reviewGame);
    expect(withExtra).toContain(s.playAgain);
    const plain = render();
    expect(plain).not.toContain(s.reviewGame);
    expect(plain).toContain(s.playAgain);
  });

  it('drops the spent card pool once the board is full', () => {
    expect(render()).not.toContain(s.remaining);
  });
});
