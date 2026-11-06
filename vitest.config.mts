import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Startup files only mount or wire things. The integration tests cover them.
      exclude: ['src/**/*.test.*', 'src/main/index.ts', 'src/renderer/*/main.tsx', 'src/renderer/test-setup.ts', 'src/shared/ipc.ts']
    },
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/preload/**/*.test.ts', 'src/shared/**/*.test.ts', 'tests/scripts/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.tsx'],
          setupFiles: ['src/renderer/test-setup.ts']
        }
      }
    ]
  }
})
