import { describe, expect, it } from 'vitest';
import { ANSWER_HINTS, hintAt, hintSequence, promptShape, shouldNudgeHint } from '@/lib/ogiri/hints';
import { prompts } from '@/lib/ogiri/prompts';

describe('answer hints', () => {
  it('ships 30–40 unique patterns that keep blanks for the player to fill', () => {
    expect(ANSWER_HINTS.length).toBeGreaterThanOrEqual(30);
    expect(ANSWER_HINTS.length).toBeLessThanOrEqual(40);
    expect(new Set(ANSWER_HINTS.map((h) => h.id)).size).toBe(ANSWER_HINTS.length);
    for (const hint of ANSWER_HINTS) {
      expect(hint.ja).toMatch(/〇〇/);
      expect(hint.en).toMatch(/___/);
    }
  });

  it.each([
    ['犬の散歩道にできた口コミサイト。星一つの理由は？', 'reason'],
    ['ブタの貯金箱を見たブタがひと言。何と？', 'line'],
    ['お寿司のガリが主役になった映画。そのタイトルは？', 'name'],
    ['サルの温泉で禁止された行動は？', 'rule'],
    ['インコが飼い主より先に有名になった。何をした？', 'event'],
    ['スープの冷めない距離を測る、新しい道具は？', 'thing'],
    ['ハムスターの回し車に目的地が表示された。どこ？', null],
  ])('reads what %s asks for', (prompt, shape) => {
    expect(promptShape(prompt)).toBe(shape);
  });

  it('agrees with the catalog format for the formats it can recognise', () => {
    const expected: Record<string, string> = { reason: 'reason', dialogue: 'line', naming: 'name', rule: 'rule', twist: 'event', invention: 'thing' };
    for (const [format, shape] of Object.entries(expected)) {
      const group = prompts.filter((p) => p.format === format);
      const hits = group.filter((p) => promptShape(p.text) === shape).length;
      expect(hits / group.length, format).toBeGreaterThan(0.7);
    }
  });

  it('puts patterns for the prompt shape first, then every general pattern, without repeats', () => {
    const prompt = 'サルの温泉で禁止された行動は？';
    const sequence = hintSequence(prompt, 42);
    const fitting = ANSWER_HINTS.filter((h) => h.shapes.includes('rule'));
    const general = ANSWER_HINTS.filter((h) => !h.shapes.length);
    expect(sequence.slice(0, fitting.length).every((h) => h.shapes.includes('rule'))).toBe(true);
    expect(new Set(sequence.slice(fitting.length))).toEqual(new Set(general));
    expect(new Set(sequence.map((h) => h.id)).size).toBe(sequence.length);
  });

  it('falls back to general patterns when the prompt shape is unknown', () => {
    const sequence = hintSequence('ハムスターの回し車に目的地が表示された。どこ？', 7);
    expect(sequence.every((h) => !h.shapes.length)).toBe(true);
  });

  it('shows a different pattern on every tap, including when the cycle wraps', () => {
    for (const { text } of prompts.slice(0, 60)) {
      const length = hintSequence(text, 99).length;
      for (let tap = 1; tap <= length * 2; tap++) {
        expect(hintAt(text, 99, tap).id).not.toBe(hintAt(text, 99, tap - 1).id);
      }
    }
  });

  it('keeps the order stable for a seed and varies it between seeds', () => {
    const prompt = '猫の肉球認証が失敗した。原因は？';
    expect(hintSequence(prompt, 5)).toEqual(hintSequence(prompt, 5));
    const orders = new Set([1, 2, 3, 4, 5, 6].map((seed) => hintSequence(prompt, seed).map((h) => h.id).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('nudges only an empty answer after half the guide time', () => {
    expect(shouldNudgeHint(91, 180, '')).toBe(false);
    expect(shouldNudgeHint(90, 180, '')).toBe(true);
    expect(shouldNudgeHint(0, 180, ' \n')).toBe(true);
    expect(shouldNudgeHint(30, 180, '下書き')).toBe(false);
    expect(shouldNudgeHint(0, 0, '')).toBe(false);
  });
});
