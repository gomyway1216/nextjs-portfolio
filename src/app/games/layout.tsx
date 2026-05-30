// Inline first-paint colors for the /games subtree. The list page now supports
// both light and dark mode, while several individual games still paint their
// own dark canvas. Keep this route theme-aware so a cold visit does not flash
// the wrong page color before the bundled CSS arrives.
export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html,body{background:#f5f5f7;color:#1d1d1f}
        html.dark,html.dark body{background:#050505;color:#f5f5f7}
        @media (prefers-color-scheme: dark){
          html:not(.light),html:not(.light) body{background:#050505;color:#f5f5f7}
        }
      `}</style>
      {children}
    </>
  );
}
