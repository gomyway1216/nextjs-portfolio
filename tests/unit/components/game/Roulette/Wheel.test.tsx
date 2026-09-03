import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Wheel } from '@/components/game/Roulette/Wheel';

describe('Roulette Wheel responsive sizing', () => {
  it('shrinks to the available width without exceeding its configured size', () => {
    const markup = renderToStaticMarkup(<Wheel result={null} spinId={0} />);

    expect(markup).toContain('width:100%');
    expect(markup).toContain('max-width:300px');
    expect(markup).toContain('aspect-ratio:300 / 324');
  });
});
