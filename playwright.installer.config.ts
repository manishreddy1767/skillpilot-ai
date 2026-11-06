import { defineConfig } from '@playwright/test'

/** Installs the real installer into a temporary folder, so it runs separately from the main tests. */
export default defineConfig({
  testDir: 'tests/installer',
  workers: 1,
  timeout: 120_000,
  reporter: 'list'
})
