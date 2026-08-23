// ---------------------------------------------------------------------------
// env.d.ts - compile-time globals injected by vite.config.ts `define`.
// ---------------------------------------------------------------------------

/** App version injected from package.json at build time (status footer). */
declare const __APP_VERSION__: string

declare module '*.md?raw' {
  const content: string
  export default content
}
