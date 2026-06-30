import { createRequire } from 'node:module';
import { sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const requireFromHere = createRequire(import.meta.url);
const requireFromJwksRsa = createRequire(requireFromHere.resolve('jwks-rsa/package.json'));

describe('firebase-admin module loading', () => {
  it('loads auth through CommonJS without resolving an ESM-only jose build', () => {
    const joseEntryPath = requireFromJwksRsa.resolve('jose');

    expect(joseEntryPath).toContain(
      ['jwks-rsa', 'node_modules', 'jose'].join(sep),
    );
    expect(() => requireFromJwksRsa('jose')).not.toThrow();

    const authModule = requireFromHere('firebase-admin/auth') as {
      getAuth?: unknown;
    };

    expect(authModule.getAuth).toEqual(expect.any(Function));
  });
});
