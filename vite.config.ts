import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  base: '/inventory-manager/',
  plugins: [
    react(),
    // After build, copy index.html -> 404.html (GitHub Pages SPA fallback)
    {
      name: 'gh-pages-404',
      closeBundle() {
        try {
          const p = join(process.cwd(), 'dist', 'index.html')
          const html = readFileSync(p, 'utf8')
          writeFileSync(join(process.cwd(), 'dist', '404.html'), html, 'utf8')
        } catch {}
      }
    }
  ],
  server: { host: true }
})
