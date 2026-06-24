'use client';

/* eslint-disable @next/next/no-img-element */
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sanitizeRichHtml } from '@/lib/sanitizeHtml';
import MermaidDiagram from './MermaidDiagram';

interface RichContentRendererProps {
  content: string;
  className?: string;
}

const HTML_CONTENT_PATTERN = /<\/?(p|div|h[1-6]|ul|ol|li|strong|em|a|img|blockquote|pre|code|table|thead|tbody|tr|td|th|br|iframe)\b/i;

function isHtmlContent(content: string): boolean {
  return HTML_CONTENT_PATTERN.test(content);
}

const components: Components = {
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  img: ({ src, alt }) => {
    if (!src || typeof src !== 'string') return null;
    return (
      <figure style={{ margin: '24px 0' }}>
        <img
          src={src}
          alt={alt ?? ''}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '8px',
          }}
        />
        {alt && (
          <figcaption style={{ marginTop: '8px', color: '#6b7280', fontSize: '13px' }}>
            {alt}
          </figcaption>
        )}
      </figure>
    );
  },
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const code = String(children).replace(/\n$/, '');
    const language = /language-(\w+)/.exec(className || '')?.[1];

    if (language === 'mermaid') {
      return <MermaidDiagram chart={code} />;
    }

    const isBlock = Boolean(className) || code.includes('\n');
    if (isBlock) {
      return (
        <pre style={{
          overflowX: 'auto',
          borderRadius: '8px',
          backgroundColor: '#1f2937',
          color: '#f9fafb',
          padding: '16px',
          margin: '20px 0',
        }}>
          <code className={className} {...props}>{children}</code>
        </pre>
      );
    }

    return (
      <code
        style={{
          borderRadius: '4px',
          backgroundColor: '#f3f4f6',
          color: '#111827',
          padding: '2px 6px',
          fontSize: '0.9em',
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '20px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{
      border: '1px solid #e5e7eb',
      backgroundColor: '#f9fafb',
      padding: '10px 12px',
      textAlign: 'left',
    }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: '1px solid #e5e7eb', padding: '10px 12px' }}>
      {children}
    </td>
  ),
};

export default function RichContentRenderer({ content, className }: RichContentRendererProps) {
  if (!content) return null;

  if (isHtmlContent(content)) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }}
      />
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
