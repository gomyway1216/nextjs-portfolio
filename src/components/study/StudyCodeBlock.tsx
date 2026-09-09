'use client';

import MermaidDiagram from '@/components/common/MermaidDiagram';

/** Keep diagrams out of the article's initial JavaScript/rendering path. */
export default function StudyCodeBlock({ language, code }: { language: string; code: string }) {
  const normalizedLanguage = language.trim().toLowerCase();
  if (normalizedLanguage === 'mermaid') {
    return <MermaidDiagram chart={code} defer minWidth={480} />;
  }
  return <pre style={{ backgroundColor: '#1f2937', color: '#e5e7eb', padding: '16px', borderRadius: '8px', overflow: 'auto', margin: '16px 0', fontSize: '13px' }}>
      <code className={normalizedLanguage ? `language-${normalizedLanguage}` : undefined}>{code}</code>
  </pre>;
}
