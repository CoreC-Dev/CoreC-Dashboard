import { loader } from '@monaco-editor/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { detectProxyMode } from '@/api/proxyMode'
import './index.css'
import './i18n'
import App from '@/App'

// Monaco core is self-hosted from /monaco/min/vs: in dev served from
// node_modules/monaco-editor, in production copied to dist/monaco/min/vs
// at build time (both by the monaco self-host plugin in vite.config).
loader.config({ paths: { vs: '/monaco/min/vs' } })

// Detect proxy mode before rendering: probes /corec-proxy/
// to determine if server.mjs is running. On static hosts (GitHub Pages) it
// returns 404 → direct connection mode. Must complete before any API calls.
detectProxyMode().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
