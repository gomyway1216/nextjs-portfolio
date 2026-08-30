import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Yudai Yaguchi — Engineering Blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function BlogOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '76px 80px',
          background:
            'linear-gradient(135deg, #07111f 0%, #172554 48%, #4c1d95 100%)',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontSize: 28,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: '#c4b5fd',
            fontWeight: 700,
          }}
        >
          Yudai Yaguchi
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 104, fontWeight: 750, lineHeight: 1.02 }}>
            Engineering Blog
          </div>
          <div
            style={{
              fontSize: 34,
              lineHeight: 1.4,
              color: '#dbeafe',
              maxWidth: 990,
            }}
          >
            Fintech systems · System design · Applied algorithms
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 24,
            color: '#a5b4fc',
          }}
        >
          <span>meetyudai.com/blog</span>
          <span>Decisions behind the work</span>
        </div>
      </div>
    ),
    size,
  );
}
