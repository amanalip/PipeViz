// ---------------------------------------------------------------------------
// vite.config.ts
// Shared configuration for dev server (`npm run dev`) and production builds
// (`npm run build`). Kept intentionally tiny: no path aliases needed at M0,
// and no node builtins are used, so no @types/node dependency is required.
// ---------------------------------------------------------------------------

// defineConfig gives full IntelliSense for the config object shape.
// Imported from vitest/config so the `test` section below type-checks;
// vitest reads this same file when `npm test` runs.
import { configDefaults, defineConfig } from 'vitest/config'

// Official React plugin: JSX transform plus fast refresh during development.
import react from '@vitejs/plugin-react'

// Single source of truth for the app version: package.json's version field
// is injected as a compile-time constant (see `define` below), so the UI
// footer can never drift from the release version again.
import pkg from './package.json' with { type: 'json' }

// Exported config consumed by the vite CLI through both scripts in package.json.
export default defineConfig({
  // Compile-time constants. __APP_VERSION__ is declared in src/env.d.ts.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // React fast refresh + automatic JSX runtime for all .tsx files.
  plugins: [react()],

  // Unit-test collection settings.
  test: {
    // Vitest owns *.test.ts under src/; the e2e/ directory holds Playwright
    // specs whose @playwright/test imports crash vitest's collector, so
    // they are excluded explicitly (they run via `npm run test:e2e`).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },

  // Relative base per plan section 13: the app deploys to a project page
  // (https://<owner>.github.io/PipeViz/) and has no client side routing,
  // so relative asset URLs resolve correctly under the /PipeViz/ prefix.
  base: './',

  // Built-in server settings for a predictable local experience.
  server: {
    // Default 5173; pinned explicitly so docs and muscle memory stay stable.
    port: 5173,
    // Open a browser tab automatically when `npm run dev` starts.
    open: true,
  },

  // Production bundle tuning.
  build: {
    // Modern browsers only (matches tsconfig target); smaller output.
    target: 'es2022',
    // Source maps make production issues traceable without shipping secrets.
    sourcemap: true,
    // The M6 CodeMirror editor lifts the single bundle past Rolldown's
    // default 500 kB advice (~234 kB gzipped total). The editor is core UI,
    // rendered on every visit, so splitting it out only redistributes bytes
    // across chunks instead of saving a download; the limit is raised
    // deliberately rather than silenced blindly.
    chunkSizeWarningLimit: 900,
  },
})
