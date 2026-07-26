import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Basispfad passend zu https://kaffeetrinker80.github.io/NOVA/termindatenbank/
export default defineConfig({
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
})
