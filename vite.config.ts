import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Her derlemenin benzersiz kimliği: uygulama yeni sürüm çıktığını bununla anlar
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12) ?? `dev-${Date.now()}`

function versionFile(): Plugin {
  return {
    name: 'csn-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

// Kök dizinden yayın (Vercel vb.). Alt dizin için VITE_BASE=/csn/ verin.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionFile()],
})
