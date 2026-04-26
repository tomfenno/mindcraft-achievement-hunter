import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/logging/__tests__/**/*.test.js',
      'achievement_hunter/src/pipeline/__tests__/**/*.test.js',
      'achievement_hunter/src/pipeline/__tests__/**/*_test.js',
      'achievement_hunter/src/agent/__tests__/**/*.test.js',
    ],
  },
});
