import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { MARBLES, drawPlay, playOf, seeded, slotFor, type Draw, type Entry } from '@/components/game/SmartBall/engine';
import { getStrings } from '@/components/game/SmartBall/i18n';
import { PlayTab } from '@/components/game/SmartBall/PlayTab';
import { ShotCard } from '@/components/game/SmartBall/ShotCard';
import { cardOf, cellsOf } from '@/components/game/SmartBall/shotCard';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const at = (row: number, col: number): Entry => ({ row, col });
/** A draw that drops each marble, shot at strength 3, at `entries` (OUT for the rest). */
const draw = (entries: (Entry | null)[]): Draw => ({ drops: Array.from({ length: MARBLES }, (_, m) => slotFor(3, m < entries.length ? entries[m] : null)), blinds: Array.from({ length: MARBLES }, () => 3) });
const ALL3 = Array.from({ length: MARBLES }, () => 3);
/** The top row, then the left column: a line on the fourth marble, another on the seventh. */
const TWO_LINES = draw([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(1, 0), at(2, 0), at(3, 0)]);

describe('the shot card', () => {
  it('lists each marble shot with its strength, its hole or OUT, and the lines it completed', () => {
    const rows = cardOf(playOf(TWO_LINES, ALL3).marbles);
    expect(rows).toHaveLength(MARBLES);
    expect(rows.map((row) => row.hole)).toEqual([0, 1, 2, 3, 4, 8, 12, null, null, null]);
    expect(rows.map((row) => row.lines)).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
    expect(rows.every((row) => row.window === 3 && !row.blind)).toBe(true);
  });

  it('counts two lines for a marble that completes two at once', () => {
    // The corner hole last: it ends the top row and the left column together.
    const rows = cardOf(playOf(draw([at(0, 1), at(0, 2), at(0, 3), at(1, 0), at(2, 0), at(3, 0), at(0, 0)]), ALL3).marbles);
    expect(rows.map((row) => row.lines)).toEqual([0, 0, 0, 0, 0, 0, 2, 0, 0, 0]);
  });

  it('agrees with the play it is read from, for any draw and any shots: the same holes, and as many lines in all', () => {
    const random = seeded(20261110);
    for (let i = 0; i < 300; i++) {
      const drawn = drawPlay(random);
      const shots = Array.from({ length: Math.floor(random() * (MARBLES + 1)) }, () => Math.floor(random() * 7));
      const play = playOf(drawn, shots, i % 2 === 0);
      const rows = cardOf(play.marbles);
      expect(rows.map((row) => row.hole)).toEqual(play.marbles.map((marble) => marble.hole));
      expect(rows.map((row) => row.blind)).toEqual(play.marbles.map((marble) => marble.blind));
      expect(rows.reduce((sum, row) => sum + row.lines, 0)).toBe(play.lines.length);
    }
  });

  it('keeps ten places whatever has been shot, the marbles still to come empty', () => {
    const cells = cellsOf(cardOf(playOf(TWO_LINES, [3, 3, 3]).marbles));
    expect(cells).toHaveLength(MARBLES);
    expect(cells.slice(0, 3).every((cell) => cell !== null)).toBe(true);
    expect(cells.slice(3).every((cell) => cell === null)).toBe(true);
  });

  it('shows only the marbles it is given, marks the one on the plunger, and says each in words for a screen reader', () => {
    const t = getStrings('en');
    const markup = render(<ShotCard t={t} marbles={playOf(TWO_LINES, [3, 3, 3, 3]).marbles} now={4} />);
    expect(markup).toContain('data-testid="smb-card" data-shown="4"');
    expect(markup.match(/<li /g)).toHaveLength(MARBLES);
    expect(markup.match(/data-state="hole"/g)).toHaveLength(4);
    expect(markup.match(/data-state="now"/g)).toHaveLength(1);
    expect(markup.match(/data-state="waiting"/g)).toHaveLength(5);
    expect(markup.match(/data-line="true"/g)).toHaveLength(1);
    expect(markup).toContain('>Marble 4: strength 4, hole 4, completing 1 line.<');
    expect(markup).toContain('>★4<');
    expect(markup).toContain('>Marble 5: not shot yet.<');
    // Nothing of a marble not yet given: the fifth one's hole (5) is nowhere on the card.
    expect(markup).not.toContain('hole 5');
  });

  it('marks the marbles shot blind and OUT, in Japanese too', () => {
    const ja = getStrings('ja');
    const markup = render(<ShotCard t={ja} marbles={playOf(TWO_LINES, [3, 3], true).marbles} now={null} />, 'ja');
    expect(markup.match(/data-blind="true"/g)).toHaveLength(MARBLES - 2);
    expect(markup.match(/data-state="out"/g)).toHaveLength(3);
    expect(markup).toContain('>強さ4*<');
    expect(markup).toContain('>3個目：強さ4（目をつぶって打った）、3番の穴。<');
    expect(markup).toContain('>10個目：強さ4（目をつぶって打った）、OUT。<');
    expect(markup).toContain('>7個目：強さ4（目をつぶって打った）、13番の穴、1列そろった。<');
    expect(getStrings('en').cardSay(9, 0, null, 0, true)).toBe('Marble 10: strength 1, shot blind, OUT.');
  });

  it('stands empty on the machine before a play, all ten places waiting', () => {
    for (const lang of ['en', 'ja'] as const) {
      const markup = render(<PlayTab />, lang);
      expect(markup).toContain('data-testid="smb-card" data-shown="0"');
      expect(markup.match(/data-state="waiting"/g)).toHaveLength(MARBLES);
      expect(markup).toContain(`>${getStrings(lang).cardTitle}<`);
    }
  });
});
