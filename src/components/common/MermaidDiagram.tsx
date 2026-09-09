'use client';

import { useEffect, useRef, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
  defer?: boolean;
  minWidth?: number;
}

let mermaidInitialized = false;

export default function MermaidDiagram({ chart, defer = false, minWidth = 640 }: MermaidDiagramProps) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const placeholder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!defer);

  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    if (placeholder.current) observer.observe(placeholder.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    setSvg('');
    setError('');

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import('mermaid');
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'neutral',
          });
          mermaidInitialized = true;
        }

        const renderId = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(renderId, chart);
        if (!cancelled) {
          setSvg(result.svg);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : 'Unable to render diagram');
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, visible]);

  if (error) {
    return (
      <pre style={{
        overflowX: 'auto',
        borderRadius: '8px',
        backgroundColor: '#1f2937',
        color: '#f9fafb',
        padding: '16px',
      }}>
        <code>{chart}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div ref={placeholder} style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        color: '#6b7280',
        padding: '18px',
        textAlign: 'center',
      }}>
        {visible ? 'Rendering diagram…' : 'Diagram'}
      </div>
    );
  }

  return (
    <figure tabIndex={0} aria-label="Diagram (scroll horizontally to view)" style={{
      maxWidth: '100%',
      margin: '24px 0',
      overflowX: 'auto',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      backgroundColor: '#ffffff',
      padding: '16px',
    }}>
      <div
        style={{ minWidth }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </figure>
  );
}
