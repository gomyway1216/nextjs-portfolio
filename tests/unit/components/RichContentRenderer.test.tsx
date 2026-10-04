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

  it('keeps Markdown images off the critical loading path', () => {
    const markup = renderToStaticMarkup(
      <RichContentRenderer content="![Architecture diagram](https://example.com/diagram.png)" />,
    );

    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('decoding="async"');
  });
});

describe('RichContentRenderer image paragraphs', () => {
  const render = (content: string) => renderToStaticMarkup(<RichContentRenderer content={content} />);
  // HTML does not allow <figure> inside <p>: the browser closes the paragraph
  // early, the DOM no longer matches React's tree, and hydration fails.
  const figureInsideParagraph = /<p[\s>](?:(?!<\/p>)[\s\S])*<figure/;

  it('renders a standalone image as a figure outside any paragraph', () => {
    const markup = render('> Intro quote.\n\n![Cover image](https://example.com/cover.webp)\n\nNext paragraph.');
    expect(markup).toContain('<figure');
    expect(markup).toContain('<figcaption');
    expect(markup).not.toMatch(figureInsideParagraph);
    // The figure sits directly between the blocks around it.
    expect(markup).toMatch(/<\/blockquote>\s*<figure/);
    expect(markup).toMatch(/<\/figure>\s*<p>Next paragraph\.<\/p>/);
  });

  it('keeps text and an inline image together without a paragraph around the figure', () => {
    const markup = render('Before ![Inline](https://example.com/inline.png) after.');
    expect(markup).not.toMatch(figureInsideParagraph);
    expect(markup).toMatch(/<div class="[^"]*paragraph[^"]*">Before <figure/);
    expect(markup).toContain('after.');
  });

  it('does the same for a linked image', () => {
    const markup = render('[![Linked](https://example.com/linked.png)](https://example.com)');
    expect(markup).not.toMatch(figureInsideParagraph);
    expect(markup).toMatch(/<div class="[^"]*paragraph[^"]*"><a [^>]*href="https:\/\/example\.com"[^>]*><figure/);
  });

  it('renders several images in one paragraph as sibling figures', () => {
    const markup = render('![One](https://example.com/1.png)\n![Two](https://example.com/2.png)');
    expect(markup.match(/<figure/g)).toHaveLength(2);
    expect(markup).not.toContain('<p');
  });

  it('leaves ordinary paragraphs alone', () => {
    expect(render('Just **text** with a [link](https://example.com).')).toMatch(/^<div><p>Just <strong>text<\/strong> with a <a /);
  });

  it('drops a paragraph whose only image has an unsafe source', () => {
    const markup = render('![Bad](javascript:alert(1))');
    expect(markup).not.toContain('<figure');
    expect(markup).not.toContain('<img');
  });
});
