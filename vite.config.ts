import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/moonshot': {
        target: 'https://api.moonshot.cn',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/moonshot/, '/v1'),
      }
    }
  }
})
