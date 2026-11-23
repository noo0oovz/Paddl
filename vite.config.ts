import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

export default defineConfig(({ command }) => ({
  // Relative base so the build works on GitHub Pages, Netlify, or any sub-path.
  base: command === 'build' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      // Version the service-worker cache per build so old caches are dropped on deploy.
      name: 'stamp-sw',
      apply: 'build',
      closeBundle() {
        const f = path.resolve('dist/sw.js')
        if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('__BUILD__', Date.now().toString(36)))
      },
    },
  ],
  // The randomised stress suites run thousands of actions. They take ~3s on a fast machine, so allow plenty of
  // headroom: a slow shared CI runner must never fail a correct test on time alone.
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000 },
}))
