import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // 注意：Polymarket 代理已禁用，前端直接使用公共 CORS 代理
      // '/polymarket-api': {
      //   target: 'https://gamma-api.polymarket.com',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/polymarket-api/, ''),
      //   secure: false,
      // },
    },
  },
});
