import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/integration',
  // The app allows one running copy, so tests must run one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: 'list'
})
