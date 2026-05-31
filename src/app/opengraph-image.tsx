import { ImageResponse } from 'next/og';

// Next.js generates /opengraph-image at request time from this file.
// Edge runtime so it's fast and doesn't need a server cold start.
export const runtime = 'edge';
export const alt = 'Yudai Yaguchi — Senior Fintech Engineer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background:
            'linear-gradient(135deg, #0f172a 0%, #581c87 50%, #0f172a 100%)',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#a855f7',
            fontWeight: 600,
          }}
        >
          Senior Fintech Engineer
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 112, fontWeight: 700, lineHeight: 1.05 }}>
            Yudai Yaguchi
          </div>
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.4,
              color: '#cbd5e1',
              maxWidth: 940,
            }}
          >
            6+ years building fintech systems across product, risk, money
            movement, and operations.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 24,
            color: '#94a3b8',
          }}
        >
          <span>meetyudai.com</span>
          <span>Atlas · PayPal</span>
        </div>
      </div>
    ),
    size,
  );
}
