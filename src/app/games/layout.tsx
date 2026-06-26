// Inline first-paint colors for the /games subtree. Keep this route keyed to
// the app's explicit theme class instead of forcing dark from OS preference.
export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html{
          --games-route-bg:linear-gradient(180deg,#f5f5f7 0%,#ffffff 48%,#f5f5f7 100%);
          --games-route-fg:#1d1d1f;
          --games-route-muted:#6e6e73;
          --games-route-border:rgba(0,0,0,.1);
          --games-route-surface:rgba(255,255,255,.84);
          --games-route-surface-solid:#ffffff;
          --games-route-surface-raised:rgba(255,255,255,.94);
          --games-route-overlay:rgba(255,255,255,.94);
          --games-route-backdrop:rgba(15,23,42,.48);
          --games-route-control:rgba(255,255,255,.72);
          --games-route-control-hover:rgba(245,245,247,.96);
          --games-route-shadow:0 18px 60px rgba(0,0,0,.12);
        }
        html.dark{
          --games-route-bg:linear-gradient(180deg,#050505 0%,#111111 48%,#050505 100%);
          --games-route-fg:#f5f5f7;
          --games-route-muted:#a1a1a6;
          --games-route-border:rgba(255,255,255,.12);
          --games-route-surface:rgba(29,29,31,.82);
          --games-route-surface-solid:#1d1d1f;
          --games-route-surface-raised:rgba(31,41,55,.96);
          --games-route-overlay:rgba(0,0,0,.92);
          --games-route-backdrop:rgba(0,0,0,.8);
          --games-route-control:rgba(31,41,55,.5);
          --games-route-control-hover:rgba(55,65,81,.7);
          --games-route-shadow:0 18px 60px rgba(0,0,0,.38);
        }
        html,body{background:var(--games-route-bg);color:var(--games-route-fg);background-attachment:fixed}
      `}</style>
      {children}
    </>
  );
}
