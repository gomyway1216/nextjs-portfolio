import { Fragment } from 'react';

/**
 * A machine's line of keys on a desktop ("Keys: Space or Enter deals · H hit · S stand", 「キー：Space か Enter で
 * ディール・P でプレイヤー」), set so that a narrow column wraps it between its parts and never inside one: a key is
 * never left at the end of a line with what it does at the start of the next ("R で" / 「同じベット」). The words are
 * the machine's own, as they were; only where they may break changes.
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

export const KeysHint = ({ text, className, testId }: { text: string; className?: string; testId?: string }) => {
  const parts = keyParts(text);
  const english = text.includes(' · ');
  return (
    <p className={className} data-testid={testId}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (english ? ' ' : <wbr />)}
          <span style={{ whiteSpace: 'nowrap' }}>{part}</span>
        </Fragment>
      ))}
    </p>
  );
};
