import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import StudyCodeBlock from '@/components/study/StudyCodeBlock';

vi.mock('@/components/common/MermaidDiagram', () => ({
  default: ({ chart, defer, minWidth }: { chart: string; defer: boolean; minWidth: number }) =>
    <figure data-defer={defer} data-min-width={minWidth}>{chart}</figure>,
}));

describe('StudyCodeBlock', () => {
  it('renders Mermaid as a viewport-deferred diagram at a mobile-friendly minimum width', () => {
    const html = renderToStaticMarkup(<StudyCodeBlock language=" mermaid " code="flowchart LR\nA --> B" />);
    expect(html).toContain('<figure data-defer="true" data-min-width="480">');
    expect(html).not.toContain('<pre');
  });
  it('keeps ordinary code scrollable and escapes markup', () => {
    const html = renderToStaticMarkup(<StudyCodeBlock language=" HTML " code="<script>alert(1)</script>" />);
    expect(html).toContain('overflow:auto');
    expect(html).toContain('class="language-html"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
