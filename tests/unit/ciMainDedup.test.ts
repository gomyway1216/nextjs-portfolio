import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canReusePrChecks, workflowsForChanges } from '../../scripts/ci-main.mjs';
import { parseStrictWorkflowYaml } from '../../scripts/strict-workflow-yaml.mjs';

const names = ['ci.yml', 'website.yml', 'security.yml'];
const definitions = Object.fromEntries(names.map((name) => [name, parseStrictWorkflowYaml(
  readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8').split('\njobs:\n')[0],
)]));
const success = () => ({ sha: 'merge', parents: ['base', 'head'], tree: 'same', headTree: 'same',
  baseInHead: true, required: names,
  pull: { merged_at: '2026-10-27', merge_commit_sha: 'merge', base: { ref: 'main', sha: 'base' }, head: { sha: 'head' } },
  runs: names.map((name, index) => ({ id: index + 1, path: `.github/workflows/${name}`,
    event: 'pull_request', head_sha: 'head', status: 'completed', conclusion: 'success' })),
});

describe('main CI deduplication', () => {
  it('reuses only the identical tree of a successfully checked normal PR merge', () => {
    expect(canReusePrChecks(success())).toBe(true);
  });
  it.each(['failure', 'cancelled', 'skipped', null])('revalidates if a latest check is %s', (conclusion) => {
    const evidence = success();
    evidence.runs[0].conclusion = conclusion as string;
    expect(canReusePrChecks(evidence)).toBe(false);
  });
  it('does not reuse an older success or an unrelated/manual check', () => {
    const evidence = success();
    evidence.runs.push({ ...evidence.runs[0], id: 99, status: 'in_progress', conclusion: '' });
    expect(canReusePrChecks(evidence)).toBe(false);
    evidence.runs = success().runs.map((r) => ({ ...r, event: 'workflow_dispatch' }));
    expect(canReusePrChecks(evidence)).toBe(false);
    evidence.runs = success().runs.map((r) => ({ ...r, head_sha: 'older-head' }));
    expect(canReusePrChecks(evidence)).toBe(false);
  });
  it('revalidates direct pushes, changed merge contents, and an advanced base', () => {
    const evidence = success();
    expect(canReusePrChecks({ ...evidence, pull: null })).toBe(false);
    expect(canReusePrChecks({ ...evidence, tree: 'integrated' })).toBe(false);
    expect(canReusePrChecks({ ...evidence, baseInHead: false })).toBe(false);
    expect(canReusePrChecks({ ...evidence, parents: ['base'] })).toBe(false);
    expect(canReusePrChecks({ ...evidence, parents: ['other-base', 'head'] })).toBe(false);
    expect(canReusePrChecks({ ...evidence, runs: [] })).toBe(false);
  });
  it('requires only the PR workflows selected by their actual file filters', () => {
    expect(workflowsForChanges(['src/lib/ogiri/polling.ts'], definitions)).toEqual(['website.yml', 'security.yml']);
    expect(workflowsForChanges(['ml/train.py'], definitions)).toEqual(['ci.yml', 'security.yml']);
    expect(workflowsForChanges(['package-lock.json'], definitions)).toEqual(names);
    expect(workflowsForChanges(['README.md'], definitions)).toEqual(['website.yml', 'security.yml']);
    const evidence = success();
    expect(canReusePrChecks({ ...evidence, required: ['website.yml', 'security.yml'], runs: evidence.runs.slice(1) })).toBe(true);
  });
  it('keeps PR and manual entry points, with one lightweight main push entry point', () => {
    for (const definition of Object.values(definitions)) {
      expect(definition.on).not.toHaveProperty('push');
      expect(definition.on).toHaveProperty('pull_request');
      expect(definition.on).toHaveProperty('workflow_dispatch');
    }
    const main = parseStrictWorkflowYaml(readFileSync(new URL('../../.github/workflows/main-ci.yml', import.meta.url), 'utf8'));
    expect(main.on).toHaveProperty('push');
    expect(main.on).not.toHaveProperty('pull_request');
    expect(Object.keys(main.jobs)).toEqual(['select']);
  });
});
