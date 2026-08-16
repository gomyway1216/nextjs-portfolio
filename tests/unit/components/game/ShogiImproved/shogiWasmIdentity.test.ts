import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureEmbeddedWasmRuntimeIdentity } from '@/components/game/ShogiImproved/wasmEngine';
import {
  SHOGI_WASM_BASE64,
  SHOGI_WASM_IDENTITY,
} from '@/components/game/ShogiImproved/wasm/shogiHalfkp64Rki16WasmBase64';

describe('embedded shogi WASM identity', () => {
  it('is generated from and exactly matches the unchanged production WASM bytes', () => {
    const embedded = Buffer.from(SHOGI_WASM_BASE64, 'base64');
    const production = readFileSync(
      join(process.cwd(), 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi-halfkp64-rki16.wasm'),
    );

    expect(embedded).toEqual(production);
    expect(SHOGI_WASM_IDENTITY).toEqual({
      bytes: production.byteLength,
      sha256: createHash('sha256').update(production).digest('hex'),
    });
  });

  it('measures the actual runtime-decoded bytes only when explicitly requested', async () => {
    const production = readFileSync(
      join(process.cwd(), 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi-halfkp64-rki16.wasm'),
    );

    await expect(measureEmbeddedWasmRuntimeIdentity()).resolves.toEqual({
      bytes: production.byteLength,
      sha256: createHash('sha256').update(production).digest('hex'),
    });
  });
});
