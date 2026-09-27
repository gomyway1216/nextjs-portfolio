import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Wheel } from '@/components/game/Roulette/Wheel';
import { WHEEL_ORDER } from '@/components/game/Roulette/engine';

describe('Roulette Wheel', () => {
  it('shrinks to the available width without exceeding its configured size', () => {
    const markup = renderToStaticMarkup(<Wheel result={null} spinId={0} />);

    expect(markup).toContain('max-width:300px');
    expect(markup).not.toContain('height="auto"');
    // Static bowl, rotating head and ball layer share one square viewBox.
    expect(markup.match(/viewBox="0 0 300 300"/g)).toHaveLength(3);
  });

  it('draws all 37 pockets in European wheel order with 0 at the top', () => {
    const markup = renderToStaticMarkup(<Wheel result={null} spinId={0} />);
    const labels = [...markup.matchAll(/<text[^>]*>(\d+)<\/text>/g)].map((m) => Number(m[1]));
    expect(labels).toEqual(WHEEL_ORDER);
    // The first label (0) sits straight above the centre.
    expect(markup).toMatch(/<text x="150" y="[\d.]+"[^>]*transform="rotate\(0 150 [\d.]+\)"[^>]*>0<\/text>/);
  });

  it('renders the ball on the track before the first spin', () => {
    const markup = renderToStaticMarkup(<Wheel result={null} spinId={0} />);
    expect(markup).toMatch(/<g transform="translate\([\d.]+ [\d.]+\)" data-ball="true">/);
  });

  it('uses the localized idle label until a spin has settled', () => {
    const markup = renderToStaticMarkup(
      <Wheel result={17} spinId={3} idleLabel="ルーレットホイール" resultLabel={(n) => `結果 ${n}`} />,
    );
    // Server render = spin not settled yet, so no result is announced early.
    expect(markup).toContain('aria-label="ルーレットホイール"');
    expect(markup).toContain('data-spinning="true"');
    expect(markup).not.toContain('結果 17');
  });

  it('keeps gradient ids unique per wheel instance', () => {
    const markup = renderToStaticMarkup(
      <>
        <Wheel result={null} spinId={0} />
        <Wheel result={null} spinId={0} />
      </>,
    );
    const ids = [...markup.matchAll(/id="(rl-[^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
