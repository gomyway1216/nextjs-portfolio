import { Fragment } from 'react';

/**
 * A machine's line of keys on a desktop ("Keys: Space or Enter deals · H hit · S stand", 「キー：Space か Enter で
 * ディール・P でプレイヤー」), set so that a narrow column wraps it between its parts and never inside one: a key is
 * never left at the end of a line with what it does at the start of the next ("R で" / 「同じベット」). The words are
 * the machine's own, as they were; only where they may break changes.
 *
 * The same is done for other short lines of parts on the floor: a table's printed rules (「アンティボーナス・ストレート1・…」,
 * which broke as 「ストレートフ｜ラッシュ5」) and the refill (「メダルがなくなりました — 100枚もらう」, which broke as
 * 「もら｜う」).
 */

/** The parts of a keys line, each with the separator that follows it, as they are kept together. */
export function keyParts(text: string): string[] {
  const separator = text.includes(' · ') ? ' · ' : '・';
  const parts = text.split(separator);
  // In English the separator's dot stays with the part before it and the line breaks at the space after it; in Japanese
  // the line breaks after the 「・」.
  const kept = separator === ' · ' ? ' ·' : '・';
  return parts.map((part, i) => (i < parts.length - 1 ? part + kept : part));
}

/** The refill's two halves, the dash kept with the first: 「メダルがなくなりました —」 and 「100枚もらう」. */
export function refillParts(text: string): string[] {
  const at = text.indexOf(' — ');
  return at < 0 ? [text] : [text.slice(0, at + 2), text.slice(at + 3)];
}

/**
 * Parts kept whole on a line, broken only between them: at a space (`spaced`, English and the refill) or, in Japanese,
 * right after the part (`<wbr>`). Read as one line of text, it is the text it was made from.
 */
export const WholeParts = ({ parts, spaced }: { parts: readonly string[]; spaced: boolean }) => (
  <>
    {parts.map((part, i) => (
      <Fragment key={i}>
        {i > 0 && (spaced ? ' ' : <wbr />)}
        <span style={{ whiteSpace: 'nowrap' }}>{part}</span>
      </Fragment>
    ))}
  </>
);

/** A line of parts separated by 「・」 or " · " (a keys line, a table's printed rules), kept whole. */
export const DottedParts = ({ text }: { text: string }) => <WholeParts parts={keyParts(text)} spaced={text.includes(' · ')} />;

/** The refill's words, broken (if at all) between its halves. */
export const RefillWords = ({ text }: { text: string }) => <WholeParts parts={refillParts(text)} spaced />;

export const KeysHint = ({ text, className, testId }: { text: string; className?: string; testId?: string }) => (
  <p className={className} data-testid={testId}>
    <DottedParts text={text} />
  </p>
);
