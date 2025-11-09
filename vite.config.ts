import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Set this to your GitHub Pages repo name
  base: '/inventory-manager/',
  server: { host: true }
})
