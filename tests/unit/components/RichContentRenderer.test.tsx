import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RichContentRenderer from '@/components/common/RichContentRenderer';

describe('RichContentRenderer responsive regions', () => {
  it('wraps Markdown tables in a keyboard-scrollable region', () => {
    const markup = renderToStaticMarkup(
      <RichContentRenderer content={'| Name | Value |\n| --- | --- |\n| Example | 42 |'} />,
    );

    expect(markup).toMatch(
      /<div(?=[^>]*data-rich-table-scroll="")(?=[^>]*role="region")(?=[^>]*aria-label="Scrollable table")(?=[^>]*tabindex="0")[^>]*>\s*<table/,
    );
  });
});
