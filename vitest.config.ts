import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// vitest.config.ts —— 阶段 3 建立（TD-TEST-001）
// 独立于 vite.config.ts（构建用），测试专用：jsdom + setup + coverage。
// 复用 @ 别名与 react 插件；CSS 导入由 vitest 默认空处理。
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
    // 阶段 5 接入覆盖率门禁；当前为基线 floor（ratchet，只升不降）。
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
      // 基线 floor（ratchet，只升不降）。阶段 5 补测试后已上调。
      // 基线（2026-10-02）：lines 26.8 / stmt 25.9 / branch 19.7 / func 18.5
      // 上调（2026-10-03，阶段 5 完成后）：lines 41.9 / stmt 41.1 / branch 30.4 / func 31.7
      thresholds: {
        lines: 41,
        functions: 31,
        branches: 30,
        statements: 40,
      },
    },
  },
})
