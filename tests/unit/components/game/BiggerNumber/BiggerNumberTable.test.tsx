/**
 * Bigger Number — table render tests (static markup; the repo has no jsdom).
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BiggerNumberTable } from '@/components/game/BiggerNumber/BiggerNumberTable';
import { getStrings } from '@/components/game/BiggerNumber/i18n';
import type { RoundRecord } from '@/components/game/BiggerNumber/roundHistory';
import type { CardValue } from '@/components/game/BiggerNumber/types';

const history: RoundRecord[] = [
  { round: 1, yourCard: 9, opponentCard: 3, winner: 'you', cardsReturnedToHand: false },
  { round: 2, yourCard: 2, opponentCard: 'dragon', winner: 'opponent', cardsReturnedToHand: false },
];

function render(
  extra: Partial<React.ComponentProps<typeof BiggerNumberTable>> = {},
  language: 'en' | 'ja' = 'en',
): string {
  return renderToStaticMarkup(
    <BiggerNumberTable
      youLabel="You"
      opponentLabel="AI"
      yourHand={[1, 3, 4]}
      opponentHandCount={8}
      yourWins={1}
      opponentWins={1}
      round={3}
      totalRounds={10}
      winsToWin={5}
      yourPick={null}
      opponentPickCount={0}
      yourPickShown={null}
      opponentPickShown={null}
      phase="picking"
      lastResultText={null}
      finalMessage={null}
      onPickCard={() => {}}
      onLeave={() => {}}
      language={language}
      {...extra}
    />,
  );
}

describe('BiggerNumberTable', () => {
  it('keeps the face-down opponent row and no log without the new props', () => {
    const t = getStrings('en');
    const html = render();
    expect(html).not.toContain(t.roundLog);
    expect(html).not.toContain(t.tilePlayed(t.cardN(3)));
    expect(html).not.toContain(t.summaryHeading);
  });

  it.each(['en', 'ja'] as const)('labels every opponent tile as in hand or played (%s)', (language) => {
    const t = getStrings(language);
    const opponentHand: CardValue[] = [1, 2, 4, 5, 6, 7, 8, 9];
    const html = render({ opponentHand }, language);
    expect(html).toContain(t.tilePlayed(t.cardN(3)));
    expect(html).toContain(t.tilePlayed(t.dragonCard));
    expect(html).toContain(t.tileInHand(t.cardN(9)));
    expect(html).not.toContain(t.tilePlayed(t.cardN(9)));
  });

  it('lists each round in a focusable, labelled log', () => {
    const t = getStrings('en');
    const html = render({ history });
    expect(html).toContain(t.roundLogEntry(1, t.cardN(9), t.cardN(3), 'you', false));
    expect(html).toContain(t.roundLogEntry(2, t.cardN(2), t.dragonCard, 'opponent', false));
    expect(html).toMatch(new RegExp(`role="region"[^>]*aria-label="${t.roundLog}"[^>]*tabindex="0"`));
  });

  it('shows the match summary only once the match is finished', () => {
    const t = getStrings('en');
    expect(render({ history })).not.toContain(t.summaryHeading);

    const html = render({ history, phase: 'finished', finalMessage: 'done' });
    expect(html).toContain(t.summaryHeading);
    expect(html).toContain(t.summaryRecord(1, 1, 0));
    // You won 9 over 3 (margin 6); the opponent's only win was a dragon round.
    expect(html).toContain('You: 6.0');
    expect(html).toContain('AI: —');
  });
});
