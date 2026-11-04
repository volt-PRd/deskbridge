import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: 'node',
    // The plugin-bust suite boots full host compositions; a single process
    // keeps shared service registrations isolated per file.
    fileParallelism: false,
  },
})
