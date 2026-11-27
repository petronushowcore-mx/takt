import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { inspectAttr } from 'kimi-plugin-inspect-react'

export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: { port: 7100 },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { include: ['tests/*.test.ts'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router'],
          charts: ['recharts'],
        },
      },
    },
  },
})
