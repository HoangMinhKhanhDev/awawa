import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

// Đăng ký service worker (cả dev lẫn build). Plugin tự tắt auto-inject
// khi thấy import này nên không bị đăng ký 2 lần.
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
window.__bootOK = true
