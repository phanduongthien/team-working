import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    // Main chỉ cần URL Supabase (kiểm tra link OAuth) — không lộ key sang main.
    envPrefix: ['MAIN_VITE_', 'VITE_SUPABASE_URL'],
    resolve: { alias: shared },
    build: {
      rollupOptions: { external: ['better-sqlite3', 'electron-updater'] }
    }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: {
      alias: { ...shared, '@renderer': resolve('src/renderer/src') }
    },
    plugins: [react(), tailwindcss()]
  }
})
