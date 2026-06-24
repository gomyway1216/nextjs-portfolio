'use client';

import { useEffect, useRef, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;

    setSvg('');
    setError('');

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'neutral',
        });

        const result = await mermaid.render(idRef.current, chart);
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
  }, [chart]);

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
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        color: '#6b7280',
        padding: '18px',
        textAlign: 'center',
      }}>
        Rendering diagram...
      </div>
    );
  }

  return (
    <figure style={{
      margin: '24px 0',
      overflowX: 'auto',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      backgroundColor: '#ffffff',
      padding: '16px',
    }}>
      <div
        style={{ minWidth: '640px' }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </figure>
  );
}
