import { loader } from '@monaco-editor/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from '@/App'

// Monaco core is self-hosted from /monaco/min/vs (TD-PERF-010, D7).
// In dev, vite.config.ts monacoSelfHostPlugin serves from node_modules6monaco-editor.
// In production, the plugin copies the assets to dist/monaco/min/vs at build time.
// This removes the CDN dependency (air-gapped/offline compatible) and allows
// CSP script-src/style-src to drop the cdn.jsdelivr.net allow-list.
loader.config({ paths: { vs: '/monaco/min/vs' } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
