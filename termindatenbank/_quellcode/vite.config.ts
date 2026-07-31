import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Basispfad passend zu https://kaffeetrinker80.github.io/NOVA/termindatenbank/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const demoBuildErlaubt = env.VITE_ALLOW_DEMO_BUILD === 'true'
  if (mode === 'production' && !demoBuildErlaubt
    && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error(
      'Produktions-Build ohne Supabase-Verbindung verhindert: ' +
      'VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen.',
    )
  }

  return {
    plugins: [react()],
    base: '/NOVA/termindatenbank/',
    build: {
      rollupOptions: {
        output: {
          // Feste Dateinamen: beim Hochladen werden immer dieselben Dateien
          // überschrieben, es bleiben keine alten Bundles liegen.
          entryFileNames: 'assets/app.js',
          chunkFileNames: 'assets/app-[name].js',
          assetFileNames: (info) =>
            info.name?.endsWith('.css') ? 'assets/app.css' : 'assets/[name][extname]',
        },
      },
    },
  }
})
