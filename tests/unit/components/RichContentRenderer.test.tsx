import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RichContentRenderer from '@/components/common/RichContentRenderer';

describe('RichContentRenderer responsive regions', () => {
  it('wraps Markdown tables in a keyboard-scrollable region', () => {
    const markup = renderToStaticMarkup(
      <RichContentRenderer content={'| Name | Value |\n| --- | --- |\n| Example | 42 |'} />,
    );

    expect(markup).toContain('data-rich-table-scroll=""');
    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-label="Scrollable table"');
    expect(markup).toContain('tabindex="0"');
  });
});
