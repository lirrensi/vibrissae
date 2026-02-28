import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isSingleFile = process.env.BUILD_MODE === 'single'
  const isServer = mode === 'server'

  const baseConfig: UserConfig = {
    plugins: [
      vue(),
      vueDevTools(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon.svg'],
        manifest: {
          name: 'Vibrissae',
          short_name: 'Vibrissae',
          description: 'Lightweight ephemeral video calls',
          theme_color: '#1f2937',
          background_color: '#1f2937',
          display: 'standalone',
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    build: {
      outDir: isServer ? '../server/dist' : 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: isSingleFile
            ? undefined
            : {
                trystero: ['trystero']
              }
        }
      }
    },
    define: {
      __BUILD_MODE__: JSON.stringify(process.env.BUILD_MODE || 'default')
    }
  }

  // Add single-file plugin for P2P single-file build
  if (isSingleFile) {
    baseConfig.plugins!.push(viteSingleFile())
    baseConfig.build!.cssCodeSplit = false
    baseConfig.build!.assetsInlineLimit = 100000000
  }

  return baseConfig
})