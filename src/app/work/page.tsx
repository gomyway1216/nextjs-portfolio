import type { Metadata } from 'next';
import Link from 'next/link';
import { caseStudies } from '@/content/work/caseStudies';

export const metadata: Metadata = {
  title: 'Selected Work',
  description:
    'Long-form case studies of recent engineering work — what was broken, how I approached it, and what changed.',
  openGraph: {
    title: 'Selected Work | Yudai Yaguchi',
    description:
      'Long-form case studies of recent engineering work — what was broken, how I approached it, and what changed.',
  },
};

export default function WorkIndex() {
  return (
    <main
      style={{
        maxWidth: '880px',
        margin: '0 auto',
        padding: '120px 24px 96px',
        color: '#1a1a1a',
      }}
    >
      <header style={{ marginBottom: '64px' }}>
        <Link
          href="/"
          style={{
            color: '#64748b',
            fontSize: '14px',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '24px',
          }}
        >
          <span aria-hidden="true">←</span> Back to home
        </Link>
        <h1
          style={{
            fontSize: '48px',
            fontWeight: 700,
            lineHeight: 1.1,
            margin: '0 0 16px',
          }}
        >
          Selected Work
        </h1>
        <p
          style={{
            fontSize: '18px',
            lineHeight: 1.6,
            color: '#475569',
            maxWidth: '640px',
            margin: 0,
          }}
        >
          Long-form case studies of recent engineering work — what was broken,
          how I approached it as the directly responsible individual, and what
          changed.
        </p>
      </header>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {caseStudies.map((cs) => (
          <li key={cs.slug}>
            <Link
              href={`/work/${cs.slug}`}
              style={{
                display: 'block',
                padding: '32px',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                background: '#ffffff',
                color: 'inherit',
                textDecoration: 'none',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
              className="case-study-card"
            >
              <div
                style={{
                  fontSize: '13px',
                  color: '#a855f7',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  marginBottom: '12px',
                }}
              >
                {cs.year}
              </div>
              <h2
                style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  lineHeight: 1.3,
                  margin: '0 0 12px',
                }}
              >
                {cs.title}
              </h2>
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: 1.6,
                  color: '#475569',
                  margin: '0 0 20px',
                }}
              >
                {cs.summary}
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                {cs.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background: '#f1f5f9',
                      color: '#475569',
                      fontWeight: 500,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
