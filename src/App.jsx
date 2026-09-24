import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import { UIProvider } from './components/ui.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { SessionProvider, useSession } from './app/session-context.jsx'
import { SchoolProvider } from './app/school-context.jsx'
import { fallbackPath, routeRegistry } from './app/routeRegistry.jsx'
import { getBackendUrl, api, isPhpMode, setBackendUrl } from './api.js'

function useBackend() {
  const [url, setUrl] = useState('...')
  const [ok, setOk] = useState(null)

  const check = useCallback(async (u) => {
    try {
      if (isPhpMode) {
        const h = await api.health()
        setUrl(h.backend || 'Hostinger')
        setOk(true)
        return
      }
      const base = u || await getBackendUrl()
      const r = await fetch(`${base}/api/health`)
      setUrl(base)
      setOk(r.ok)
      if (u) setBackendUrl(u)
    } catch {
      setOk(false)
    }
  }, [])

  useEffect(() => {
    getBackendUrl().then((u) => { setUrl(u); check(u) }).catch(() => setOk(false))
    if (isPhpMode) return undefined
    const t = setInterval(() => check(), 8000)
    if (window.electronAPI?.onBackendReady) window.electronAPI.onBackendReady((u) => check(u))
    return () => clearInterval(t)
  }, [check])

  const mode = isPhpMode ? 'php' : 'legacy'
  return { url, ok, check, mode }
}

const THEME_KEY = 'hsg-theme'
function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  } catch { return 'light' }
}

function AppInner() {
  useBackend()
  const session = useSession()
  const [theme, setTheme] = useState(getTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch {}
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#101816' : '#1e56d6')
  }, [theme])

  return (
    <AppShell
      session={session}
      theme={theme}
      onThemeToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
    >
      <ErrorBoundary>
        <Routes>
          {routeRegistry.map(({ id, path, component: Component }) => (
            <Route key={id} path={path} element={<Component />} />
          ))}
          <Route path="*" element={<Navigate to={fallbackPath} replace />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  )
}

export default function App() {
  return (
    <UIProvider>
      <SessionProvider>
        <SchoolProvider>
          <AppInner />
        </SchoolProvider>
      </SessionProvider>
    </UIProvider>
  )
}
