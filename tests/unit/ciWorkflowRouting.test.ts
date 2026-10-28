import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { classifyWebsiteChanges } from '../../scripts/ci-website-routing.mjs';
import { parseStrictWorkflowYaml } from '../../scripts/strict-workflow-yaml.mjs';

const require = createRequire(import.meta.url);
const picomatch = require('picomatch') as (pattern: string) => (path: string) => boolean;
const workflows = Object.fromEntries(
  ['ci', 'website'].map((id) => [
    id,
    parseStrictWorkflowYaml(
      readFileSync(new URL(`../../.github/workflows/${id}.yml`, import.meta.url), 'utf8'),
    ),
  ]),
);
function runs(id: string, event: string, paths: string[]) {
  const events = workflows[id].on;
  if (!Object.hasOwn(events, event)) return false;
  const trigger = events[event] ?? {};
  if (trigger.paths) return paths.some((path) => trigger.paths.some((p: string) => picomatch(p)(path)));
  if (trigger['paths-ignore'])
    return paths.some((path) => !trigger['paths-ignore'].some((p: string) => picomatch(p)(path)));
  return true;
}

describe('CI change routing', () => {
  it('runs heavy workflows on PRs or explicit dispatch, never directly on push', () => {
    for (const id of ['ci', 'website']) {
      expect(runs(id, 'push', ['package.json'])).toBe(false);
      expect(runs(id, 'workflow_dispatch', ['package.json'])).toBe(true);
    }
  });
  it('keeps exactly one required aggregate and fails if selection fails', () => {
    expect(workflows.website.jobs.website_checks.name).toBe(
      "${{ needs.changes.outputs.gate_name || 'Test and build' }}",
    );
    expect(workflows.website.jobs.website_checks.needs).toEqual(
      ['changes', 'quality', 'build', 'e2e', 'ogiri'],
    );
    expect(workflows.website.jobs.website_checks.steps[0].run).toContain(
      'test "${{ needs.changes.result }}" = "success"',
    );
  });
  for (const event of ['pull_request']) {
    it(`${event}: website changes avoid unrelated training/native gates`, () => {
      for (const paths of [
        ['src/components/game/Ogiri/Ogiri.tsx', 'tests/unit/ogiri/engine.test.ts'],
        ['src/components/GlobalToolbar.tsx'],
        ['scripts/ogiri/catalog.ts', 'src/data/ogiri/daily.txt'],
      ]) {
        expect(runs('website', event, paths)).toBe(true);
        expect(runs('ci', event, paths)).toBe(false);
        expect(classifyWebsiteChanges(paths, workflows.ci.on[event].paths,
          workflows.website.on[event]['paths-ignore'])).toEqual({
          website: true, legacyCi: false, gateName: 'Test and build',
        });
      }
    });
    it(`${event}: training-only work keeps its contracts without website tests`, () => {
      for (const paths of [
        ['ml/train.py', 'tests/unit/ml/exact24kVitestInventory.test.ts'],
        ['native/floodgate-v7-aws-witness-adapter-contract/Package.swift'],
        ['scripts/shogi-ai-match-output/game.csv'],
        ['docs/blog-shogi-floodgate-v7-runtime-policy-preimages.md'],
      ]) {
        expect(runs('ci', event, paths)).toBe(true);
        expect(runs('website', event, paths)).toBe(false);
        expect(classifyWebsiteChanges(paths, workflows.ci.on[event].paths,
          workflows.website.on[event]['paths-ignore'])).toEqual({
          website: false, legacyCi: true, gateName: 'Website checks',
        });
      }
    });
    it(`${event}: shared dependencies and mixed changes keep both suites`, () => {
      for (const paths of [
        ['package-lock.json'],
        ['.npmrc'],
        ['vitest.config.ts'],
        ['src/components/game/ShogiImproved/wasmEngine.ts'],
        ['ml/train.py', 'src/app/games/page.tsx'],
      ]) {
        expect(runs('ci', event, paths)).toBe(true);
        expect(runs('website', event, paths)).toBe(true);
        expect(classifyWebsiteChanges(paths, workflows.ci.on[event].paths,
          workflows.website.on[event]['paths-ignore'])).toEqual({
          website: true, legacyCi: true, gateName: 'Website checks',
        });
      }
    });
    it(`${event}: documentation-only changes retain the required check without expensive jobs`, () => {
      expect(runs('ci', event, ['docs/ogiri-party.md'])).toBe(false);
      expect(runs('website', event, ['docs/ogiri-party.md'])).toBe(true);
      expect(classifyWebsiteChanges(['docs/ogiri-party.md'], workflows.ci.on[event].paths,
        workflows.website.on[event]['paths-ignore'])).toEqual({
        website: false, legacyCi: false, gateName: 'Test and build',
      });
    });
  }
});
