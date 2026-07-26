import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PRODUCTION_IDENTITY = {
  bytes: 36_545,
  sha256: '9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31',
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
      bytes: 143_322,
      sha256: '1005153cbfd17dc7046c5f82d87d33efa7a651736aba35c384e24a5162028880',
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
