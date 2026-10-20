import { fixupConfigRules } from "@eslint/compat";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...fixupConfigRules(nextVitals),
  ...fixupConfigRules(nextTs),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "coverage/**",
    ".claude/**",
    // Standalone ML/shogi tooling and non-app directories: not part of the
    // Next.js app; linting them slows every build without protecting shipped code.
    "ml/**",
    "tests/unit/ml/**",
    "scripts/**",
    "docs/**",
    "native/**",
    // AssemblyScript sources (WASM engine): use AS decorators/syntax that the TS parser rejects.
    "wasm-spike/**",
  ]),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "prefer-const": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Every e2e spec takes `test` from tests/e2e/fixtures.ts, which fakes the medal floor's API for every browser
    // context; Playwright's own lets the floor's requests reach a server that cannot answer them on CI. The two shogi
    // Worker specs deliberately fake nothing (and open no page that asks the floor).
    files: ["tests/e2e/**/*.spec.ts"],
    ignores: ["tests/e2e/shogi-engine-worker-parity.spec.ts", "tests/e2e/shogi-worker-boot-resilience.spec.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@playwright/test",
              importNames: ["test"],
              message: "Import `test` from './fixtures': it fakes the medal floor's API for every context (fixtures.ts).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
