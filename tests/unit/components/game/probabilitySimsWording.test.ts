import { describe, expect, it } from 'vitest';
import { getStrings as montyStrings } from '@/components/game/MontyHall/i18n';
import { getStrings as birthdayStrings } from '@/components/game/BirthdayParadox/i18n';
import { getStrings as bayesStrings } from '@/components/game/BayesianUpdate/i18n';
import { makeT } from '@/components/game/GamblersRuin/i18n';

describe('Monty Hall wording', () => {
  it('counts trials, not doors, on the convergence axis', () => {
    expect(montyStrings('en').trialsAxisUnit).toBe('trials');
    expect(montyStrings('ja').trialsAxisUnit).toBe('試行');
    expect(montyStrings('ja').trialsAxisUnit).not.toBe(montyStrings('ja').doors);
  });

  it('calls the prize the same thing everywhere', () => {
    const en = montyStrings('en');
    const ja = montyStrings('ja');
    expect(en.pickPrompt).toContain('prize');
    expect(en.infoIntro).toContain('prize');
    expect(en.infoIntro).not.toMatch(/\bcar\b/);
    expect(ja.infoWhyBody).toContain('景品');
    expect(ja.infoIntro).toContain('景品');
    expect(ja.infoIntro).not.toContain('車');
  });
});

describe('English singulars', () => {
  it('Birthday Paradox: one deal', () => {
    const en = birthdayStrings('en');
    expect(en.trialsLabel(1, 1)).toBe('1 / 1 deal');
    expect(en.trialsLabel(0, 0)).toBe('0 / 0 deals');
    expect(en.trialsLabel(1, 2)).toBe('1 / 2 deals');
  });

  it('Bayesian Update: one flip on the trace axis', () => {
    const en = bayesStrings('en');
    expect(en.flipsAxis(1)).toBe('1 flip');
    expect(en.flipsAxis(0)).toBe('0 flips');
    expect(en.flipsAxis(1000)).toBe('1,000 flips');
    expect(bayesStrings('ja').flipsAxis(1000)).toBe('1,000 回');
  });

  it("Gambler's Ruin: one step", () => {
    const en = makeT('en');
    expect(en('ruinedMsgOne', { steps: 1 })).toBe('Ruined — hit $0 in 1 step');
    expect(en('ruinedMsg', { steps: 7 })).toBe('Ruined — hit $0 in 7 steps');
    expect(en('reachedMsgOne', { steps: 1, target: 2 })).toBe('Reached $2 in 1 step');
    expect(en('logStepsOne', { steps: 1 })).toBe('1 step');
    const ja = makeT('ja');
    expect(ja('ruinedMsgOne', { steps: 1 })).toBe(ja('ruinedMsg', { steps: 1 }));
    expect(ja('logStepsOne', { steps: 1 })).toBe(ja('logSteps', { steps: 1 }));
  });
});
