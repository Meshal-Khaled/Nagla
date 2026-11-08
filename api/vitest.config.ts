import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['test/globalSetup.ts'],
    // integration tests share one database
    fileParallelism: false,
    testTimeout: 20000,
  },
});
