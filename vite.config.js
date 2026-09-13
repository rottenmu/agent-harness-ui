import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * agent-harness-ui 独立应用
 *
 * - dev server 端口遵循 frontend/AGENTS.md 的固定端口规则：16600（禁止改动）
 * - host 显式固定为 127.0.0.1：Vite 默认的 'localhost' 在 Windows 上只解析到 ::1，
 *   会绑成 IPv6-only，导致 http://127.0.0.1:16600 连不上（很多预览工具默认用该地址）。
 *   固定为 127.0.0.1 后 localhost 与 127.0.0.1 均可访问，且仍只监听环回、不暴露到局域网。
 * - dev 阶段 /api 代理到本地后端（agent-application / agent-memory-application, 9900）
 * - monaco-editor 通过 ?worker 方式引入 worker，免额外插件（见 src/monaco-setup.js）
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 16600,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:9900',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      output: {
        // monaco / d3 体积较大，单独分包，避免主 chunk 过大
        manualChunks: {
          monaco: ['monaco-editor'],
          d3: ['d3'],
          naive: ['naive-ui'],
        },
      },
    },
  },
})
