import { createRequire } from 'node:module';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

/**
 * `overrides` in package.json moves two transitive packages past the range
 * their parent asks for, to clear security advisories:
 *
 * - postcss-selector-parser 7.1.6 under @tailwindcss/typography (asks 6.0.10)
 * - katex 0.18.2 under mermaid (asks ^0.16)
 *
 * Each test holds the one behaviour of the parent that depends on the
 * overridden package, so a later bump of an override, or of a parent, that
 * breaks it fails here and not on the site. Remove a test together with its
 * override once the parent itself asks for a fixed version.
 */
const nodeRequire = createRequire(import.meta.url);

describe('dependency overrides keep their parents working', () => {
  it('typography still lifts a trailing pseudo-element out of :where()', async () => {
    // The same plugin registration as src/app/globals.css, compiled for `.prose` alone.
    const compiler = await compile('@tailwind utilities;\n@plugin "@tailwindcss/typography";', {
      base: process.cwd(),
      loadModule: async (id, base) => ({ path: nodeRequire.resolve(id), base, module: nodeRequire(id) }),
    });
    const selectors = compiler
      .build(['prose'])
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('{'))
      .map((line) => line.slice(0, -1).replace(/\s+/g, ' ').trim());

    // The plugin parses every selector with postcss-selector-parser to move
    // `::marker` / `::before` / `::after` behind the `:not(...)` guard. Left
    // inside `:where()` a pseudo-element is invalid, and the browser drops the
    // whole rule without a word.
    const notProse = ':not(:where([class~="not-prose"], [class~="not-prose"] *))';
    const withPseudoElement = selectors.filter((selector) => selector.includes('::'));
    expect(withPseudoElement).toEqual(
      expect.arrayContaining([
        `:where(ol > li)${notProse}::marker`,
        `:where(ul > li)${notProse}::marker`,
        `:where(blockquote p:first-of-type)${notProse}::before`,
        `:where(pre code)${notProse}::after`,
      ]),
    );
    for (const selector of withPseudoElement) {
      expect(selector.startsWith(':where('), selector).toBe(true);
      expect(selector.split(notProse)[0], selector).not.toContain('::');
    }
  });

  it('KaTeX, asked for MathML the way mermaid asks, returns markup with no KaTeX classes to style', () => {
    // The katex that mermaid itself resolves, not one hoisted for another package.
    const katex = createRequire(nodeRequire.resolve('mermaid'))('katex') as {
      renderToString(tex: string, options: { throwOnError: boolean; displayMode: boolean; output: string }): string;
    };
    // mermaid's own call (renderKatexUnsanitized); MermaidDiagram.tsx never
    // switches on legacyMathML, so `mathml` is the only output the site uses.
    const html = katex.renderToString(String.raw`\underline{a}+\overline{b}+\sqrt[3]{x}=\frac{1}{2} \tag{1}`, {
      throwOnError: true,
      displayMode: true,
      output: 'mathml',
    });

    expect(html.startsWith('<span class="katex"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block">')).toBe(true);
    // KaTeX 0.18 renamed its internal HTML classes (`base` -> `katex-base`, ...).
    // That only reaches a page that asks for HTML output and ships KaTeX's
    // stylesheet; MathML output carries the wrapper class and nothing else.
    expect(html.match(/class="[^"]*"/g)).toEqual(['class="katex"']);
  });
});
