import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    env: { TZ: 'UTC' },
    // Worker threads share the parent's already-initialised timezone; forks pick up TZ.
    pool: 'forks',
    include: ['tests/**/*.test.ts'],
  },
});
