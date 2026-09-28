/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Dev only: the UI runs on Vite (5173) and talks to the local API server (npm run dev:server).
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts', 'electron/**/*.test.ts'],
  },
})
