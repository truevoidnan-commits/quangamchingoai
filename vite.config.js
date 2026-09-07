import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    cssCodeSplit: true,
  },
  server: {
    host: true,
    port: 3000,
    open: true,
  },
})
