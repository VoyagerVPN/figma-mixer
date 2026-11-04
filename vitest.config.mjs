export default {
  cacheDir: '.cache/vitest',
  test: { pool: 'threads', maxWorkers: 2, minWorkers: 1, include: ['tests/**/*.test.ts'] }
};
