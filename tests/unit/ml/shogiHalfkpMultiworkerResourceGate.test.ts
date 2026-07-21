import { describe, expect, it } from 'vitest';

import {
  SHARED_TT_BYTES,
  deriveTopologyAccounting,
  parseCliArgs,
} from '../../../wasm-spike/halfkp-multiworker-resource-gate.mjs';

describe('HalfKP multiworker resource measurement', () => {
  it('requires explicit research WASM, candidate weights, and bucket count', () => {
    expect(() => parseCliArgs([])).toThrow('--wasm is required');
    expect(() => parseCliArgs(['--wasm', 'research.wasm'])).toThrow('--weights is required');
    expect(() =>
      parseCliArgs(['--wasm', 'research.wasm', '--weights', 'candidate.bin'])
    ).toThrow('--buckets is required');
    expect(
      parseCliArgs([
        '--wasm',
        'research.wasm',
        '--weights',
        'candidate.bin',
        '--buckets',
        '81',
      ])
    ).toMatchObject({ buckets: 81, maxInstances: 4, settleMs: 500 });
  });

  it('refuses unsupported bucket and instance counts', () => {
    expect(() =>
      parseCliArgs([
        '--wasm',
        'research.wasm',
        '--weights',
        'candidate.bin',
        '--buckets',
        '7',
      ])
    ).toThrow('--buckets must be 1, 6, or 81');
    expect(() =>
      parseCliArgs([
        '--wasm',
        'research.wasm',
        '--weights',
        'candidate.bin',
        '--buckets',
        '81',
        '--max-instances',
        '5',
      ])
    ).toThrow('--max-instances must be between 1 and 4');
  });

  it('accounts for private WASM memories, one retained source, helper clones, and shared TT', () => {
    const one = deriveTopologyAccounting(1, 94_656_708, 151_322_624);
    expect(one).toMatchObject({
      helperInstances: 0,
      privateWasmMemories: 1,
      logicalWasmMemoryBytes: 151_322_624,
      retainedMainWeightsBytes: 94_656_708,
      helperStructuredCloneBytes: 0,
      sharedTtBytes: 0,
    });

    const four = deriveTopologyAccounting(4, 94_656_708, 151_322_624);
    expect(four).toMatchObject({
      helperInstances: 3,
      privateWasmMemories: 4,
      logicalWasmMemoryBytes: 605_290_496,
      retainedMainWeightsBytes: 94_656_708,
      helperStructuredCloneBytes: 283_970_124,
      sharedTtBytes: SHARED_TT_BYTES,
    });
  });
});
