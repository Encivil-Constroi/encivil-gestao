import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { vendorChunk } from './src/build/vendorChunks'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': o novo SW fica em estado "waiting" e a app mostra um aviso
      // com botão "Atualizar" (ver UpdatePrompt.tsx). Muito mais fiável do que
      // o reload silencioso do 'autoUpdate', que em PWA no iOS não ativava de
      // forma consistente — o telemóvel ficava preso no bundle antigo.
      registerType: 'prompt',
      // Registamos o SW manualmente (virtual:pwa-register/react no UpdatePrompt)
      // para poder forçar verificações periódicas — sem isto o browser só
      // verifica por uma versão nova a cada ~24h.
      injectRegister: false,
      // injectManifest: o SW custom em src/sw.ts contém os handlers de push e
      // toda a lógica de caching — necessário para Web Push (generateSW não
      // suporta handlers de eventos customizados).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'ENCIVIL Gestão',
        short_name: 'ENCIVIL Gestão',
        description: 'Sistema interno de gestão da ENCIVIL — armazém, obras, ferramentas e mais',
        theme_color: '#1e3a8a',
        background_color: '#1e3a8a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'pt-PT',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // Ficheiros a incluir no precache manifest (injetados em self.__WB_MANIFEST)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
      devOptions: {
        enabled: false, // desativar em dev para não interferir com HMR
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
})
