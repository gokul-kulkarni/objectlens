import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    // Testing Library registers its automatic unmount via a global afterEach; without globals
    // every component test would leak its DOM into the next one.
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      // `index.ts` files are pure re-exports; counting them inflates coverage without testing anything.
      exclude: [
        '**/*.test.*',
        '**/index.ts',
        '**/*.d.ts',
        // Test-only helpers, and wiring with no logic of its own to cover.
        '**/testing/**',
        'packages/app/src/main.tsx',
        'packages/app/src/registry.ts',
        'packages/app/src/examples.ts',
        // Runs only inside a Worker; exercised end-to-end in the browser, not in node.
        'packages/app/src/worker/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
