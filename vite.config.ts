import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change 'inventory-manager' to your repo name if different
export default defineConfig({
  plugins: [react()],
  base: '/inventory-manager/'
})
