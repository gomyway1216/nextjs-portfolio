'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';

/** What Tab reaches by itself: a box holding one of these is scrolled to it as it is reached. */
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

export interface ScrollAreaProps {
  className?: string;
  style?: CSSProperties;
  /** What it holds, for a screen reader; without one, the name of the section it stands in. */
  label?: string;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * A box that scrolls sideways when what is in it is wider than the screen (a
 * table on a phone), and that a keyboard can scroll too. While it scrolls, and
 * holds nothing that Tab reaches anyway, it takes focus with Tab, so that the
 * arrow keys move it, and it is a region named for what it holds. While all of
 * it fits, it is a plain box and Tab passes it by.
 */
export function ScrollArea({ className, style, label, ref, children }: ScrollAreaProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scrolls, setScrolls] = useState(false);
  const [labelledBy, setLabelledBy] = useState<string | undefined>(undefined);

  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      box.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current = element;
    },
    [ref],
  );

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () =>
      setScrolls((element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) && element.querySelector(FOCUSABLE) === null);
    measure();
    if (!label) setLabelledBy(element.closest('[aria-labelledby]')?.getAttribute('aria-labelledby') ?? undefined);
    if (typeof ResizeObserver === 'undefined') return;
    // The box's own size and its content's: a table that grows, or one put in place of another.
    const sizes = new ResizeObserver(measure);
    const watchAll = () => {
      sizes.disconnect();
      sizes.observe(element);
      for (const child of element.children) sizes.observe(child);
    };
    watchAll();
    const swaps = new MutationObserver(() => {
      watchAll();
      measure();
    });
    swaps.observe(element, { childList: true });
    return () => {
      sizes.disconnect();
      swaps.disconnect();
    };
  }, [label]);

  const named = Boolean(label || labelledBy);
  return (
    <div
      ref={attach}
      className={className}
      style={style}
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls && named ? 'region' : undefined}
      aria-label={scrolls ? label : undefined}
      aria-labelledby={scrolls && !label ? labelledBy : undefined}
      data-scrolls={scrolls ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
