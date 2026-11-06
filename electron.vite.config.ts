import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const page = (name: string): string => resolve(__dirname, `src/renderer/${name}/index.html`)

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { widget: page('widget'), overview: page('overview'), app: page('app') }
      }
    }
  }
})
