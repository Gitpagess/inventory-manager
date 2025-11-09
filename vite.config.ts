import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/inventory-manager/', // <= REQUIRED for GitHub Pages
  plugins: [react()],
  server: { host: true }
})
