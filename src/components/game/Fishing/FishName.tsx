import { Fragment } from 'react';
import styles from './Fishing.module.css';

const isKatakana = (char: string): boolean => char >= '゠' && char <= 'ヿ';
/** Hiragana or a kanji: what a fish's Japanese name has before its katakana word (「みかづき｜カジキ」「港の｜ヌシ」). */
const isKanaOrKanji = (char: string): boolean => (char >= '぀' && char <= 'ゟ') || (char >= '一' && char <= '鿿');

/**
 * A fish's name in the pieces a narrow column may put on lines of their own: a Japanese name is cut where its
 * katakana word begins after hiragana or a kanji (「みかづき」「カジキ」), never inside a word (「みかづきカジ｜キ」).
 * A name with no such place (an English one, 「リボンダイ」) is one piece; its spaces break a line as they always do.
 * The pieces joined are the name, character for character.
 */
export function nameParts(name: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (let i = 1; i < name.length; i++) {
    if (isKatakana(name[i]) && isKanaOrKanji(name[i - 1])) {
      parts.push(name.slice(from, i));
      from = i;
    }
  }
  parts.push(name.slice(from));
  return parts;
}

/** A fish's name, which a narrow table wraps between its words and not inside one (Fishing.module.css `.fishName`). */
export const FishName = ({ name }: { name: string }) => (
  <span className={styles.fishName}>
    {nameParts(name).map((part, index) => (
      <Fragment key={index}>
        {index > 0 && <wbr />}
        {part}
      </Fragment>
    ))}
  </span>
);
