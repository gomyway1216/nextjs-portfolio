import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PRODUCTION_IDENTITY = {
  bytes: 35_597,
  sha256: 'e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c',
};
const RESEARCH_IDENTITY = {
  bytes: 35_837,
  sha256: '1b95659d54fc897e2ff766583ccc2035a0932929fcb9520800c3a5ca2b1430db',
};

function identity(bytes: Uint8Array): { bytes: number; sha256: string } {
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function instantiate(bytes: Uint8Array): WebAssembly.Exports {
  const wasmModule = new WebAssembly.Module(bytes);
  return new WebAssembly.Instance(wasmModule, {
    env: {
      abort: () => {
        throw new Error('WASM abort');
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports;
}

describe('HalfKP research WASM isolation', () => {
  it('keeps the production Assembly source byte-pinned and the research change in a patch', () => {
    const productionSource = readFileSync(join(process.cwd(), 'wasm-spike', 'assembly', 'index.ts'));
    const researchPatch = readFileSync(
      join(process.cwd(), 'wasm-spike', 'assembly', 'halfkp81-research.patch'),
    );

    expect(identity(productionSource)).toEqual({
      bytes: 139_447,
      sha256: '0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c',
    });
    expect(identity(researchPatch)).toEqual({
      bytes: 3_746,
      sha256: '97a27912a2487bae000921dd754506126e1b33ff7e70dbfb846f20f869168c1d',
    });
  });

  it('keeps the production runtime byte-pinned and stores HalfKP under a distinct research path', () => {
    const production = readFileSync(
      join(process.cwd(), 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm'),
    );
    const research = readFileSync(
      join(process.cwd(), 'wasm-spike', 'artifacts', 'shogi-halfkp81-research.wasm'),
    );

    expect(identity(production)).toEqual(PRODUCTION_IDENTITY);
    expect(identity(research)).toEqual(RESEARCH_IDENTITY);
    expect(research).not.toEqual(production);
  });

  it('exposes 81 buckets only from the explicitly selected research runtime', () => {
    const production = instantiate(
      readFileSync(join(process.cwd(), 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm')),
    ) as WebAssembly.Exports & {
      getNnueBuckets(): number;
      setNnueBuckets(buckets: number): void;
    };
    const research = instantiate(
      readFileSync(join(process.cwd(), 'wasm-spike', 'artifacts', 'shogi-halfkp81-research.wasm')),
    ) as WebAssembly.Exports & {
      getNnueBuckets(): number;
      setNnueBuckets(buckets: number): void;
    };

    production.setNnueBuckets(81);
    research.setNnueBuckets(81);

    expect(production.getNnueBuckets()).toBe(1);
    expect(research.getNnueBuckets()).toBe(81);
  });
});
