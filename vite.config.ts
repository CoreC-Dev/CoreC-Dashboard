import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works under any host path — including
  // GitHub Pages custom domains, project subpaths, and local static servers.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/corec-api': {
        target: 'http://127.0.0.1:9090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/corec-api/, ''),
        ws: true,
      },
    },
  },
  build: {
    // Reset to default (500KB) now that vendor libs are manually split.
    // The warning surfaces regressions instead of being silenced.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Split heavy vendor libs into cached chunks so the dashboard shell
        // (recharts is the biggest offender — 9.6MB installed, pulls d3 deps)
        // doesn't bloat the first-paint bundle on the default /monitor route.
        // Note: rolldown (Vite 8) requires manualChunks as a function.
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-recharts'
            if (
              id.includes('react-dom') ||
              id.includes('/react/') ||
              id.includes('react-router')
            )
              return 'vendor-react'
            if (id.includes('@tanstack/react-query')) return 'vendor-query'
            if (id.includes('@radix-ui/')) return 'vendor-radix'
          }
          return undefined
        },
      },
    },
  },
})
