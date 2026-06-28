'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { htmlWrappedMarkdownToMarkdown, isHtmlContent } from '@/lib/markdownHtml';
import { sanitizeRichHtml } from '@/lib/sanitizeHtml';
import MermaidDiagram from './MermaidDiagram';

interface RichContentRendererProps {
  content: string;
  className?: string;
}

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

type HtmlRenderState = { mode: 'html' | 'markdown'; content: string };

function isSafeRelativeUrl(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

function isSafeMarkdownUrl(
  url: string,
  safeProtocols: Set<string>,
  { allowAnchor = false, allowRelative = false } = {},
): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (allowAnchor && trimmed.startsWith('#')) return true;
  if (isSafeRelativeUrl(trimmed)) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return allowRelative && !trimmed.startsWith('//');
  }

  try {
    return safeProtocols.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

const components: Components = {
  a: ({ href, children, ...props }) => {
    if (!href || !isSafeMarkdownUrl(href, SAFE_LINK_PROTOCOLS, {
      allowAnchor: true,
      allowRelative: true,
    })) {
      return <>{children}</>;
    }

    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => {
    if (!src || typeof src !== 'string' || !isSafeMarkdownUrl(src, SAFE_IMAGE_PROTOCOLS)) {
      return null;
    }

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
          <code className={className} {...props}>{code}</code>
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
        {code}
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
  const [htmlRenderState, setHtmlRenderState] = useState<HtmlRenderState>({ mode: 'html', content: '' });
  const isHtml = isHtmlContent(content);

  useEffect(() => {
    if (!content || !isHtml) {
      setHtmlRenderState({ mode: 'html', content: '' });
      return;
    }

    const sanitizedHtml = sanitizeRichHtml(content);
    const markdownContent = htmlWrappedMarkdownToMarkdown(sanitizedHtml);
    setHtmlRenderState(markdownContent
      ? { mode: 'markdown', content: markdownContent }
      : { mode: 'html', content: sanitizedHtml });
  }, [content, isHtml]);

  if (!content) return null;

  if (isHtml) {
    if (htmlRenderState.mode === 'markdown') {
      return (
        <div className={className}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {htmlRenderState.content}
          </ReactMarkdown>
        </div>
      );
    }

    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: htmlRenderState.content }}
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
