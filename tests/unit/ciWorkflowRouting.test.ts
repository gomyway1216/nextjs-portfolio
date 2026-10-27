import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseStrictWorkflowYaml } from '../../scripts/strict-workflow-yaml.mjs';

const require = createRequire(import.meta.url);
const picomatch = require('picomatch') as (pattern: string) => (path: string) => boolean;
const workflows = Object.fromEntries(
  ['ci', 'website'].map((id) => [
    id,
    parseStrictWorkflowYaml(readFileSync(`.github/workflows/${id}.yml`, 'utf8')),
  ]),
);
function runs(id: string, event: string, paths: string[]) {
  const trigger = workflows[id].on[event];
  if (trigger.paths) return paths.some((path) => trigger.paths.some((p: string) => picomatch(p)(path)));
  return paths.some((path) => !trigger['paths-ignore'].some((p: string) => picomatch(p)(path)));
}

describe('CI change routing', () => {
  for (const event of ['pull_request', 'push']) {
    it(`${event}: website changes avoid unrelated training/native gates`, () => {
      for (const paths of [
        ['src/components/game/Ogiri/Ogiri.tsx', 'tests/unit/ogiri/engine.test.ts'],
        ['src/components/GlobalToolbar.tsx'],
        ['scripts/ogiri/catalog.ts', 'src/data/ogiri/daily.txt'],
      ]) {
        expect(runs('website', event, paths)).toBe(true);
        expect(runs('ci', event, paths)).toBe(false);
      }
    });
    it(`${event}: training-only work keeps its contracts without website tests`, () => {
      for (const paths of [
        ['ml/train.py', 'tests/unit/ml/exact24kVitestInventory.test.ts'],
        ['native/floodgate-v7-aws-witness-adapter-contract/Package.swift'],
        ['scripts/shogi-ai-match-output/game.csv'],
      ]) {
        expect(runs('ci', event, paths)).toBe(true);
        expect(runs('website', event, paths)).toBe(false);
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
      }
    });
    it(`${event}: documentation-only changes avoid both expensive suites`, () => {
      expect(runs('ci', event, ['docs/ogiri-party.md'])).toBe(false);
      expect(runs('website', event, ['docs/ogiri-party.md'])).toBe(false);
    });
  }
});
