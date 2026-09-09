import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Scoped deliberately. The default glob also matches
    // `scripts/mutation-runner.test.mjs`, which is a standalone script that
    // calls process.exit() -- vitest treats that as a failed suite, so the
    // package's own tests all pass and the run still exits non-zero.
    include: ['src/**/*.test.ts'],
  },
});
