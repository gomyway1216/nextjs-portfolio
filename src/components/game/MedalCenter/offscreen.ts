/**
 * The medal center's lights rest while nobody can see them. An element given `markAway` as its ref is marked
 * `data-away="true"` while it is out of view (with a little room either side, so that a light is going again before
 * it comes back on screen) and `data-away="false"` while it is in view; its stylesheet pauses what moves in it while
 * it is away. A light the compositor runs still costs the page's main thread a little every frame, for as long as it
 * runs, seen or not.
 *
 * Nothing is drawn again for it: the mark is written straight onto the element, and only the stylesheet reads it.
 */

let watcher: IntersectionObserver | null = null;

const watch = (): IntersectionObserver =>
  (watcher ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.setAttribute('data-away', entry.isIntersecting ? 'false' : 'true');
    },
    { rootMargin: '64px 0px' },
  ));

/** A ref for an element whose lights rest while it is out of view. The same function every time, so it is attached once. */
export const markAway = (element: Element | null): (() => void) | undefined => {
  if (!element || typeof IntersectionObserver === 'undefined') return undefined;
  const watching = watch();
  watching.observe(element);
  return () => {
    watching.unobserve(element);
    element.removeAttribute('data-away');
  };
};
