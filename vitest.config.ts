import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src/test/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/i18n/**',
        'src/**/*.d.ts',
        'src/types/**',
      ],
      thresholds: {
        // Measured on the full suite: 80.2 lines / 71.2 funcs / 66.3 branches
        // / 78.5 statements. Keep a small margin for platform variance.
        lines: 78,
        functions: 69,
        branches: 64,
        statements: 76,
      },
    },
  },
})
