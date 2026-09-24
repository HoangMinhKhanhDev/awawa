import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

if (!window.electronAPI && window.location.hash.startsWith('#/')) {
  const legacyPath = window.location.hash.slice(1)
  window.history.replaceState(null, '', legacyPath)
}

const Router = window.electronAPI ? HashRouter : BrowserRouter

// Đăng ký service worker (cả dev lẫn build). Plugin tự tắt auto-inject
// khi thấy import này nên không bị đăng ký 2 lần.
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
)
window.__bootOK = true
