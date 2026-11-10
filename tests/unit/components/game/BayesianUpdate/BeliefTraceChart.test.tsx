import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BeliefTraceChart } from '@/components/game/BayesianUpdate/charts';
import { getStrings } from '@/components/game/BayesianUpdate/i18n';
import { EMPTY_TRACE, beliefPath, extendTrace } from '@/components/game/BayesianUpdate/trace';

const PRIOR = { alpha: 0.5, beta: 0.5 };

describe('BeliefTraceChart', () => {
  it('draws only the frame before any flip', () => {
    const html = renderToStaticMarkup(
      <BeliefTraceChart path={beliefPath(EMPTY_TRACE, PRIOR)} ariaLabel="empty" startLabel="0 flips" endLabel="0 flips" />,
    );
    expect(html).toContain('aria-label="empty"');
    expect(html).not.toContain('<polyline');
    expect(html).not.toContain('<path');
    expect(html.match(/0 flips/g)).toHaveLength(1);
    expect(html).not.toContain('NaN');
  });

  it('draws the mean line, the band and the truth marker only when asked', () => {
    const path = beliefPath(extendTrace(EMPTY_TRACE, [1, 1, 0, 1, 1, 1]), PRIOR);
    const hidden = renderToStaticMarkup(<BeliefTraceChart path={path} ariaLabel="trace" endLabel="6 flips" />);
    expect(hidden).toContain('<polyline');
    expect(hidden).toContain('<path');
    expect(hidden).toContain('6 flips');
    expect(hidden).not.toContain('NaN');
    expect(hidden).not.toContain('p = ');

    const shown = renderToStaticMarkup(<BeliefTraceChart path={path} trueP={0.7} ariaLabel="trace" />);
    expect(shown).toContain('0.70');
  });
});

describe('belief trace strings', () => {
  it('are provided in both languages and pluralise in English', () => {
    const ja = getStrings('ja');
    const en = getStrings('en');
    expect(en.traceSummary(1, '0.950', '0.842')).toBe('95% interval width: 0.950 before any flips → 0.842 after 1 flip');
    expect(en.traceSummary(1000, '0.950', '0.057')).toContain('after 1,000 flips');
    expect(ja.traceSummary(1000, '0.950', '0.057')).toBe('95% 信用区間の幅: 振る前 0.950 → 1,000 回後 0.057');
    expect(en.chartAriaTrace(2, '0.5', '0.1', '0.9')).toContain('over 2 flips');
    expect(ja.chartAriaTrace(2, '0.5', '0.1', '0.9')).toContain('2 回');
    for (const key of ['traceHeading', 'traceAxis', 'traceEmpty', 'traceHint', 'chartAriaTraceEmpty'] as const) {
      expect(ja[key]).not.toBe(en[key]);
      expect(ja[key].length).toBeGreaterThan(0);
    }
  });
});
