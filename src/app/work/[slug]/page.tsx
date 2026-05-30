import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { caseStudies, getCaseStudyBySlug } from '@/content/work/caseStudies';

interface Params {
  slug: string;
}

// Pre-render every case study at build time.
export function generateStaticParams(): Params[] {
  return caseStudies.map((cs) => ({ slug: cs.slug }));
}

// Case studies are fully static; any slug not in generateStaticParams
// should 404 at the routing level rather than attempt a dynamic render.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cs = getCaseStudyBySlug(slug);
  if (!cs) return {};

  return {
    title: cs.title,
    description: cs.summary,
    openGraph: {
      title: `${cs.title} | Yudai Yaguchi`,
      description: cs.summary,
      type: 'article',
    },
    twitter: {
      title: `${cs.title} | Yudai Yaguchi`,
      description: cs.summary,
    },
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const cs = getCaseStudyBySlug(slug);
  if (!cs) notFound();

  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '120px 24px 96px',
        color: '#1a1a1a',
      }}
    >
      <Link
        href="/work"
        style={{
          color: '#64748b',
          fontSize: '14px',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '32px',
        }}
      >
        <span aria-hidden="true">←</span> Selected Work
      </Link>

      <header style={{ marginBottom: '56px' }}>
        <div
          style={{
            fontSize: '13px',
            color: '#a855f7',
            fontWeight: 600,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            marginBottom: '16px',
          }}
        >
          {cs.year}
        </div>
        <h1
          style={{
            fontSize: '40px',
            fontWeight: 700,
            lineHeight: 1.15,
            margin: '0 0 20px',
          }}
        >
          {cs.title}
        </h1>
        <p
          style={{
            fontSize: '20px',
            lineHeight: 1.55,
            color: '#475569',
            margin: '0 0 24px',
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
      </header>

      <article>
        {cs.sections.map((section) => (
          <section key={section.heading} style={{ marginBottom: '40px' }}>
            <h2
              style={{
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: '#94a3b8',
                margin: '0 0 16px',
              }}
            >
              {section.heading}
            </h2>
            {section.body.map((paragraph, i) => (
              <p
                key={i}
                style={{
                  fontSize: '17px',
                  lineHeight: 1.7,
                  color: '#1e293b',
                  margin: '0 0 16px',
                }}
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>

      <footer
        style={{
          marginTop: '64px',
          paddingTop: '32px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <Link
          href="/work"
          style={{
            color: '#a855f7',
            fontSize: '15px',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <span aria-hidden="true">←</span> All case studies
        </Link>
        <Link
          href="/"
          style={{
            color: '#64748b',
            fontSize: '15px',
            textDecoration: 'none',
          }}
        >
          Home
        </Link>
      </footer>
    </main>
  );
}
