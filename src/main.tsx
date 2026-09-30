import { loader } from '@monaco-editor/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App'

// Monaco core is fetched from jsDelivr at runtime by @monaco-editor/loader.
// Pin the build explicitly (matching the loader's own default) instead of
// relying on a version that may drift when the loader package updates. The
// CDN host MUST also be allow-listed in index.html's Content-Security-Policy
// (script-src / style-src) — otherwise production CSP blocks the injected
// <script> and editor stylesheets, leaving the Config Center editor blank.
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
