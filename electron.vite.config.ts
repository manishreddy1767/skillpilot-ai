import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const page = (name: string): string => resolve(__dirname, `src/renderer/${name}/index.html`)

export default defineConfig(({ mode }) => {
  // Test builds get their own folder, so they can never disturb a copy of the app
  // that is starting or running from out/.
  const outDir = resolve(__dirname, mode === 'test' ? 'out-test' : 'out')

  return {
    main: { build: { outDir: resolve(outDir, 'main') } },
    preload: { build: { outDir: resolve(outDir, 'preload') } },
    renderer: {
      root: resolve(__dirname, 'src/renderer'),
      plugins: [react()],
      build: {
        outDir: resolve(outDir, 'renderer'),
        rollupOptions: {
          input: { widget: page('widget'), overview: page('overview'), app: page('app') }
        }
      }
    }
  }
})
