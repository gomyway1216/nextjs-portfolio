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
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', '.claude/**'],
  },
});
