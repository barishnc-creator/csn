import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Kök dizinden yayın (Vercel vb.). Alt dizin için VITE_BASE=/csn/ verin.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
