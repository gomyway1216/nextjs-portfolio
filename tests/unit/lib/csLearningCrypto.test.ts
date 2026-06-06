import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CRYPTO_INPUTS,
  computeCryptoDemo,
  cryptoTechniques,
  getCryptoTechnique,
  isCryptoTechniqueId,
  type CryptoInputs,
  type CryptoTechniqueId,
} from '@/lib/cs-learning/crypto';

function inputs(overrides: Partial<CryptoInputs> = {}): CryptoInputs {
  return {
    ...DEFAULT_CRYPTO_INPUTS,
    ...overrides,
  };
}

describe('CS Learning Lab crypto logic', () => {
  it('defines a route for every crypto technique', () => {
    for (const technique of cryptoTechniques) {
      expect(getCryptoTechnique(technique.id)).toEqual(technique);
      expect(isCryptoTechniqueId(technique.id)).toBe(true);
      expect(technique.route).toBe(`/study/cs/cryptography/${technique.id}`);
    }

    expect(isCryptoTechniqueId('unknown')).toBe(false);
  });

  it('computes the default RSA classroom example', () => {
    const demo = computeCryptoDemo('rsa', DEFAULT_CRYPTO_INPUTS);

    expect(demo.outputLabel).toBe('Ciphertext');
    expect(demo.output).toBe('13');
    expect(demo.secondaryLabel).toBe('Decrypted');
    expect(demo.secondaryOutput).toBe('7');
    expect(demo.warning).toBe('');
  });

  it('keeps RSA modular inverse calculation fast enough for larger classroom parameters', () => {
    const startedAt = performance.now();
    const demo = computeCryptoDemo(
      'rsa',
      inputs({
        rsaP: 1009,
        rsaQ: 1013,
        rsaE: 17,
        rsaMessage: 12345,
      })
    );

    expect(demo.secondaryOutput).toBe('12345');
    expect(performance.now() - startedAt).toBeLessThan(50);
  });

  it('reports invalid RSA parameters when e has no modular inverse', () => {
    const demo = computeCryptoDemo('rsa', inputs({ rsaP: 5, rsaQ: 11, rsaE: 20, rsaMessage: 7 }));

    expect(demo.output).toBe('Invalid parameters');
    expect(demo.warning).toContain('d could not be found');
  });

  it.each([
    ['caesar-cipher', { text: 'ATTACK AT DAWN', shift: 3 }],
    ['vigenere-cipher', { text: 'ATTACK AT DAWN', key: 'LEMON' }],
    ['substitution-cipher', { text: 'ATTACK AT DAWN', substitutionKeyword: 'KEY' }],
    ['xor-cipher', { text: 'ATTACK AT DAWN', xorKey: 'secret' }],
  ] satisfies Array<[CryptoTechniqueId, Partial<CryptoInputs>]>)(
    '%s decrypts back to the original message',
    (techniqueId, overrides) => {
      const text = overrides.text ?? DEFAULT_CRYPTO_INPUTS.text;
      const demo = computeCryptoDemo(techniqueId, inputs(overrides));

      expect(demo.output).not.toBe(text);
      expect(demo.secondaryOutput).toBe(text);
    }
  );

  it('computes matching Diffie-Hellman shared secrets', () => {
    const demo = computeCryptoDemo('diffie-hellman', DEFAULT_CRYPTO_INPUTS);

    expect(demo.outputLabel).toBe('Shared secret');
    expect(demo.output).toBe('2');
    expect(demo.secondaryLabel).toBe('Bob computes');
    expect(demo.secondaryOutput).toBe('2');
  });

  it('keeps toy hash output deterministic for the same input', () => {
    const first = computeCryptoDemo('hash-functions', inputs({ text: 'same input' }));
    const second = computeCryptoDemo('hash-functions', inputs({ text: 'same input' }));
    const different = computeCryptoDemo('hash-functions', inputs({ text: 'different input' }));

    expect(first.output).toBe(second.output);
    expect(first.output).not.toBe(different.output);
    expect(first.warning).toContain('not SHA-256');
  });

  it('returns an empty demo for an unknown technique id at runtime', () => {
    const demo = computeCryptoDemo('unknown' as CryptoTechniqueId, DEFAULT_CRYPTO_INPUTS);

    expect(demo.output).toBe('');
    expect(demo.steps).toEqual([]);
  });
});
