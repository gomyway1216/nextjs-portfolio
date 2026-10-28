import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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

it('reports similar familiar themes without rejecting them, but still rejects exact duplicates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ogiri-catalog-'));
  try {
    mkdirSync(join(dir, 'src/data/ogiri'), { recursive: true });
    const file = join(dir, 'prompts.json');
    const entries = [
      { ...prompts[0], id: 'classic-001', text: '未来のコンビニに導入された、誰も喜ばない新サービスとは？' },
      { ...prompts[0], id: 'classic-002', text: '未来のコンビニに導入された、誰も喜ばない新商品とは？' },
    ];
    const runFixture = () => spawnSync(process.execPath, [
      '--import', createRequire(import.meta.url).resolve('tsx'),
      fileURLToPath(new URL('../../../scripts/ogiri/catalog.ts', import.meta.url)), '--import', file,
    ], { encoding: 'utf8', cwd: dir });
    writeFileSync(file, JSON.stringify(entries));
    const result = runFixture();
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(readFileSync(join(dir, 'src/data/ogiri/validation.json'), 'utf8'));
    expect(report.nearPairs[0].similarity).toBeGreaterThanOrEqual(0.7);
    entries[1].text = entries[0].text.replace('、', ' ');
    writeFileSync(file, JSON.stringify(entries));
    expect(runFixture().stderr).toContain('Duplicate text:');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
