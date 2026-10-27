import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import prompts from '../../../src/data/ogiri/prompts.json';

function run(...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ogiri/catalog.ts', ...args], {
    encoding: 'utf8',
  });
}

it('rejects an import without a filename instead of falling back to source generation', () => {
  for (const args of [['--import'], ['--import', '--write']]) {
    const result = run(...args);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--import requires a JSON file path.');
  }
});

it('rejects punctuation-only prompts before n-gram similarity checking', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ogiri-catalog-'));
  try {
    const file = join(dir, 'invalid.json');
    writeFileSync(file, JSON.stringify([{ ...prompts[0], text: '！？'.repeat(10) }]));
    const result = run('--import', file);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Invalid prompt:');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
