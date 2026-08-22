// ---------------------------------------------------------------------------
// vite.config.ts
// Shared configuration for dev server (`npm run dev`) and production builds
// (`npm run build`). Kept intentionally tiny: no path aliases needed at M0,
// and no node builtins are used, so no @types/node dependency is required.
// ---------------------------------------------------------------------------

// defineConfig gives full IntelliSense for the config object shape.
import { defineConfig } from 'vite'

// Official React plugin: JSX transform plus fast refresh during development.
import react from '@vitejs/plugin-react'

// Exported config consumed by the vite CLI through both scripts in package.json.
export default defineConfig({
  // React fast refresh + automatic JSX runtime for all .tsx files.
  plugins: [react()],

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
  },
})
