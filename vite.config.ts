import { defineConfig, type Plugin } from 'vitest/config'
import type { Connect } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import path from 'path'

function invalidUrlMiddleware(): Plugin {
  return {
    name: 'invalid-url-middleware',
    configureServer(server) {
      server.middlewares.use((req: Connect.IncomingMessage, res, next) => {
        try {
          req.url = decodeURI(req.url || '')
        } catch {
          res.statusCode = 400
          res.end('Invalid URL')
          return
        }
        next()
      })
    },
  }
}

export default defineConfig(async () => {
  const plugins: Plugin[] = [
    vue(),
    vuetify({ autoImport: true }),
    invalidUrlMiddleware(),
  ]

  if (process.env.ANALYZE === '1') {
    const { visualizer } = await import('rollup-plugin-visualizer')
    plugins.push(visualizer({
      filename: 'dist/bundle-stats.html',
      gzipSize: true,
      open: false,
    }))
  }

  return {
  plugins,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
  },

  server: {
    port: Number(process.env.VITE_DEV_SERVER_PORT || 3000),
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:12321',
        changeOrigin: true,
      },
    },
  },
  base: './',
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,ts}', 'shared/**/*.test.ts', 'api/**/*.test.ts', 'app/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}', 'shared/**/*.ts', 'api/**/*.ts', 'app/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**'],
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 2100,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/src\/i18n\/(ru|cn|es)\.ts$/.test(id)) {
            const locale = id.match(/\/(ru|cn|es)\.ts$/)?.[1]
            return locale ? `locale-${locale}` : 'locale-extra'
          }
          if (id.includes('/src/assets/Countries')) {
            return 'countries-data'
          }
          if (id.includes('/src/assets/Documentation')) {
            return 'documentation-data'
          }
          if (id.includes('/src/assets/Version_Histrory')) {
            return 'version-history-data'
          }
          if (id.includes('node_modules/vue-i18n')) {
            return 'vue-i18n'
          }
          if (id.includes('node_modules/lodash')) {
            return 'lodash-vendor'
          }
          if (id.includes('node_modules/gsap')) {
            return 'gsap-vendor'
          }
          if (id.includes('node_modules/vue-advanced-cropper')) {
            return 'cropper-vendor'
          }
          if (
            id.includes('node_modules/viewerjs') ||
            id.includes('node_modules/v-viewer')
          ) {
            return 'viewer-vendor'
          }
          if (id.includes('node_modules/vuetify')) {
            return 'vuetify-vendor'
          }
          if (
            id.includes('node_modules/vue/') ||
            id.includes('node_modules/@vue/') ||
            id.includes('node_modules/vue-router/') ||
            id.includes('node_modules/pinia/')
          ) {
            return 'vue-vendor'
          }
        },
      },
    },
  },
  }
})
