import { expect, it } from 'vitest';
import { normalizePlayerText } from '@/lib/ogiri/text';
import { textInput } from '@/lib/ogiri/engine';

it.each([
  [' １００点！ ', '100点!'],
  ['ＡＢＣとｶﾀｶﾅ', 'ABCとカタカナ'],
  ['㍿と👩‍🚀', '株式会社と👩‍🚀'],
  ['答え\n\u0001\u202Eです', '答えです'],
])('keeps the submitted label in sync with the stored spelling of %s', (input, expected) => {
  expect(normalizePlayerText(input)).toBe(expected);
  expect(textInput(input, 100)).toBe(expected);
});

it('uses the stored code-point limit after expanding compatibility characters', () => {
  expect([...normalizePlayerText('㍿'.repeat(25))]).toHaveLength(100);
  expect(textInput('㍿'.repeat(25), 100)).toHaveLength(100);
  expect(() => textInput('㍿'.repeat(26), 100)).toThrow('1〜100文字');
});
