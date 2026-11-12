import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The card is a <button> holding a flip container (.cardInner) that holds the two faces, all of them <span>s: a
// button may hold nothing else. A <span> is inline unless its CSS says otherwise, and an inline box ignores width,
// height and transform. With .cardInner left inline the faces collapsed to 4×4px and never turned: every card was a
// bare "?" and the game was played blind, while every test passed (none of them lays the page out). These tests read
// the sources, since jsdom lays nothing out either; tests/e2e/memory-battle.spec.ts measures the real thing.

const dir = join(process.cwd(), 'src/components/game/MemoryBattle');
const css = readFileSync(join(dir, 'MemoryBattle.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tsx = readFileSync(join(dir, 'MemoryBattle.tsx'), 'utf8');

/** The declarations of every rule whose whole selector is `selector`, outside any @media block. */
function declarations(selector: string): Record<string, string> {
  const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const found: Record<string, string> = {};
  for (const [, sel, body] of topLevel.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sel.trim() !== selector) continue;
    for (const line of body.split(';')) {
      const at = line.indexOf(':');
      if (at > 0) found[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return found;
}

const BLOCK_LEVEL = ['block', 'flex', 'grid', 'inline-block', 'inline-flex', 'inline-grid'];

describe('Memory Battle card faces', () => {
  it('keeps the markup this CSS is written for: a span flip container holding two span faces', () => {
    expect(tsx).toMatch(/<span className=\{styles\.cardInner\} data-flipped=\{isFaceUp\}>/);
    expect(tsx).toMatch(/<span className=\{`\$\{styles\.cardFace\} \$\{styles\.cardBack\}`\}/);
    expect(tsx).toMatch(/<span className=\{`\$\{styles\.cardFace\} \$\{styles\.cardFront\}`\}/);
  });

  it('lays the flip container out as a box that fills the card, so it has a size and can turn', () => {
    const inner = declarations('.cardInner');
    expect(BLOCK_LEVEL).toContain(inner.display);
    expect(inner.position).toBe('absolute');
    expect(inner.inset).toBe('0');
    expect(declarations('.cardCell').position).toBe('relative');
    expect(inner['transform-style']).toBe('preserve-3d');
    expect(declarations(".cardInner[data-flipped='true']").transform).toBe('rotateY(180deg)');
  });

  it('stretches both faces over the flip container and shows one side at a time', () => {
    const face = declarations('.cardFace');
    expect(BLOCK_LEVEL).toContain(face.display);
    expect(face.position).toBe('absolute');
    expect(face.inset).toBe('0');
    expect(face['backface-visibility']).toBe('hidden');
    expect(declarations('.cardFront').transform).toBe('rotateY(180deg)');
    expect(declarations('.cardBack').transform).toBeUndefined();
  });

  it('gives the card itself a size the faces can fill', () => {
    expect(declarations('.cardCell')['aspect-ratio']).toBe('3 / 4');
  });
});
