import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Basispfad passend zu https://kaffeetrinker80.github.io/NOVA/termindatenbank/
export default defineConfig({ plugins: [react()], base: '/NOVA/termindatenbank/' })
