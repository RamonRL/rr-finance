import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: mode === 'development' ? {
    proxy: {
      '/api': 'http://localhost:10000'
    }
  } : {},
}))
