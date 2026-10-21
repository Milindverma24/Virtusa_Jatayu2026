import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:8000',
      '/draft': 'http://127.0.0.1:8000',
      '/confirm': 'http://127.0.0.1:8000',
      '/encounters': 'http://127.0.0.1:8000',
      '/audit': 'http://127.0.0.1:8000',
      '/sync': 'http://127.0.0.1:8000',
      '/clinical-ner': 'http://127.0.0.1:8000',
    }
  }
})
