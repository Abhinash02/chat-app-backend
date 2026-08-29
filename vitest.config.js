import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.js'],
    // An in-memory MongoDB has to download and start once; the default 5s is
    // not enough on a cold machine.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Every suite shares one in-memory database, so they must not interleave.
    fileParallelism: false,
    include: ['tests/**/*.test.js'],
  },
});
