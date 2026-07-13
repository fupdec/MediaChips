import {defineConfig} from 'vite'
import path from 'node:path'

/**
 * Library build for shipping a bundled plugin entry (zip / resources/plugins).
 * Day-to-day app development uses the package `src` via Vite alias — no build needed.
 */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'MediaChipsPluginAdult',
      formats: ['es'],
      fileName: () => 'ui.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: ['vue'],
    },
  },
})
