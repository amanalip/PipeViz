// ---------------------------------------------------------------------------
// eslint.config.js
// Flat ESLint 10 config (eslint.config.* replaces .eslintrc entirely).
// Layers, in order of application:
//   1. Global ignores: build output and dependency folders.
//   2. JS recommended baseline for every file ESLint can parse.
//   3. TypeScript-aware rules replacing the browser-facing base rules.
//   4. React-specific plugins: hooks correctness + fast-refresh safety.
// Run with `npm run lint`; CI will treat any warning as a failure via --max-warnings.
// ---------------------------------------------------------------------------

// Baseline JavaScript rules shipped with ESLint itself.
import js from '@eslint/js'

// Browser globals (window, document, localStorage) so no-undef stays quiet.
import globals from 'globals'

// react-hooks plugin: enforces the Rules of Hooks and exhaustive-deps.
import reactHooks from 'eslint-plugin-react-hooks'

// react-refresh plugin: catches export patterns that break HMR.
import reactRefresh from 'eslint-plugin-react-refresh'

// TypeScript-ESLint utilities: `config()` helper plus TS-flavored rule sets.
import tseslint from 'typescript-eslint'

// Single default export: an array of config objects applied top to bottom.
export default tseslint.config(
  // ---- Layer 1: never lint generated or vendored code --------------------
  {
    // `ignores` without other keys makes these paths globally ignored.
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },

  // ---- Layers 2-4: everything TypeScript/React ---------------------------
  ...tseslint.config(
    {
      // Apply the layers below only to files that contain app code.
      files: ['**/*.{ts,tsx}'],

      // Extend shared recommended presets rather than hand-picking rules.
      extends: [
        // Core JS hygiene (eqeqeq-ish basics, no-undef pairs handled by globals).
        js.configs.recommended,
        // TypeScript replacements for rules that misfire on TS syntax.
        ...tseslint.configs.recommended,
      ],

      // Language options scoped to these file types.
      languageOptions: {
        // Parse modern syntax regardless of tsconfig target.
        ecmaVersion: 'latest',
        // Treat source as ESM modules.
        sourceType: 'module',
        // Provide DOM/browser globals to the no-undef-equivalent checks.
        globals: { ...globals.browser },
      },

      // Project-specific tweaks layered on top of the presets.
      rules: {
        // `@ts-expect-error` must always suppress an actual error; stale
        // directives become errors instead of silent rot.
        '@typescript-eslint/ban-ts-comment': [
          'error',
          { 'ts-expect-error': 'allow-with-description', 'ts-ignore': false },
        ],
        // Allow non-null assertions sparingly? No: forbid them outright;
        // parser/layout code should narrow types explicitly instead.
        '@typescript-eslint/no-non-null-assertion': 'error',
        // Warn on unused vars but let underscore-prefixed args slide.
        'no-unused-vars': 'off', // superseded by the TS version below.
        '@typescript-eslint/no-unused-vars': [
          'warn',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },

    // React hooks rules as a standalone config layer.
    {
      files: ['**/*.{ts,tsx}'],
      plugins: { 'react-hooks': reactHooks },
      rules: {
        // Classic pair: valid hook call sites + complete dependency arrays.
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
      },
    },

    // Fast-refresh export validation, Vite flavor.
    {
      files: ['**/*.{ts,tsx}'],
      plugins: { 'react-refresh': reactRefresh },
      rules: {
        // Only component-typed exports from component files keep HMR snappy.
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      },
    },
  ),
)
