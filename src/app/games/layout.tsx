// Inline body bg override for the /games subtree.
//
// Why: globals.css sets `body { background: hsl(0 0% 100%) }` (white) via
// Tailwind, but the games pages are dark-themed. On a cold visit the
// stylesheet that paints `body` arrives ~120ms after first paint, so the
// browser shows white at the top of the viewport until then. This
// per-route `<style>` is inlined into the SSR HTML before any external
// CSS, so the body is dark from the very first paint.
export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html,body{background:#000}`}</style>
      {children}
    </>
  );
}
