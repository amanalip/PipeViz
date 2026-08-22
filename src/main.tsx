// ---------------------------------------------------------------------------
// main.tsx - application entry point.
// Responsibilities are deliberately minimal: create the React root, enable
// StrictMode double-rendering (surfaces side effects early), mount <App />,
// and pull in the global stylesheet. Everything else lives down-tree.
// ---------------------------------------------------------------------------

// createRoot is the React 19 mounting API (ReactDOM.render is long gone).
import { StrictMode } from 'react'

// createRoot binds a React tree to a DOM container element.
import { createRoot } from 'react-dom/client'

// The single top-level component; the whole UI hangs from it.
import App from './App'

// Global reset + design tokens; imported once so Vite bundles one stylesheet.
import './styles/global.css'

// Grab the mount node declared in index.html; non-null assert because we own
// that markup and a missing #root is an unrecoverable packaging bug anyway.
const container = document.getElementById('root')

// Guard for type-safety instead of trusting the assertion blindly.
if (!container) {
  // Fail loudly and early: better than a blank page with a console whisper.
  throw new Error('Root element #root missing from index.html')
}

// Render in StrictMode so impure renders and deprecated APIs scream in dev.
createRoot(container).render(
  <StrictMode>
    {/* App owns all state and layout; nothing else mounts beside it. */}
    <App />
  </StrictMode>,
)
