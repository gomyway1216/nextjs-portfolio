import { normalizePlayerText } from './text';

export const SHIRITORI_WORD_MAX = 12;
const SMALL_KANA: Record<string, string> = {
  ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', ゕ: 'か', ゖ: 'け',
};
const large = (kana: string) => SMALL_KANA[kana] ?? kana;

/** Everyone draws on every turn, so larger rooms take a shorter chain to stay within the room budget. */
export const shiritoriStages = (players: number) => players === 3 || players >= 10 ? 3 : 4;

/** Accept katakana, half-width kana and spaces, and store one hiragana spelling. */
export function shiritoriWord(value: string): string {
  return normalizePlayerText(value).replace(/\s/g, '')
    .replace(/[ァ-ヶ]/g, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60));
}
export const headSound = (word: string) => large(word[0]);
/** しゃ ends in や and コーヒー ends in ひ. Voiced marks stay distinct. */
export const tailSound = (word: string) => large(word.replace(/ー+$/, '').at(-1) ?? '');
export const shiritoriLinks = (before: string, after: string) => tailSound(before) === headSound(after);

/** `sound` is set only when the player was told it; otherwise the next picture has to reveal it. */
export function shiritoriProblem(word: string, sound: string | null): string | null {
  if (!word) return '描いた言葉の読みを入れてね。';
  if (!/^[ぁ-ゖ][ぁ-ゖー]*$/.test(word)) return '読みは、ひらがなで入れてね。';
  if ([...word].length < 2 || [...word].length > SHIRITORI_WORD_MAX) return `読みは2〜${SHIRITORI_WORD_MAX}文字で入れてね。`;
  if (tailSound(word) === 'ん') return '「ん」で終わる言葉は使えません。別の言葉にしてね。';
  if (sound && headSound(word) !== sound) return `「${sound}」から始まる言葉にしてね。`;
  return null;
}
