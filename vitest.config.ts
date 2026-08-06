import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      // `index.ts` files are pure re-exports; counting them inflates coverage without testing anything.
      exclude: ['**/*.test.*', '**/index.ts', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
