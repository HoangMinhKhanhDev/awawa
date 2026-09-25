import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import { UIProvider } from './components/ui.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { SessionProvider, useSession } from './app/session-context.jsx'
import { SchoolProvider } from './app/school-context.jsx'
import { fallbackPath, routeRegistry } from './app/routeRegistry.jsx'

const THEME_KEY = 'hsg-theme'
function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  } catch { return 'light' }
}

function AppInner() {
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
