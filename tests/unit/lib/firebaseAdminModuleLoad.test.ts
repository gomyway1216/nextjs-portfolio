import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const requireFromHere = createRequire(import.meta.url);
const requireFromJwksRsa = createRequire(requireFromHere.resolve('jwks-rsa/package.json'));

describe('firebase-admin module loading', () => {
  it('loads auth through CommonJS without resolving an ESM-only jose build', () => {
    const josePackageJsonPath = requireFromJwksRsa.resolve('jose/package.json');
    const josePackageJson = JSON.parse(readFileSync(josePackageJsonPath, 'utf8')) as {
      exports?: { '.'?: { require?: string } };
    };

    expect(josePackageJson.exports?.['.']?.require).toEqual(expect.any(String));

    const authModule = requireFromHere('firebase-admin/auth') as {
      getAuth?: unknown;
    };

    expect(authModule.getAuth).toEqual(expect.any(Function));
  });
});
