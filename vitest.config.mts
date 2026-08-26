import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    // `.tsx` is needed for component render tests (see
    // tests/unit/components/game/Mahjong/tileSvg.test.tsx).
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**', '.claude/**'],
  },
});
