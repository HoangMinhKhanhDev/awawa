import { createContext, useContext, useEffect, useState } from 'react'
import { getSession } from '../api.js'
import { isAdminRole, isStaffRole, isSuperRole } from '../lib/roles.js'

const SessionContext = createContext(null)

export function createSessionSnapshot() {
  const session = getSession()
  const user = session.student ? { ...session.student } : null
  const role = user?.role || 'student'
  const isStaff = isStaffRole(role)
  const isAdmin = isAdminRole(role)
  const isSuper = isSuperRole(role)
  return {
    session: { token: session.token || '', student: user },
    token: session.token || '',
    user,
    student: user,
    role,
    isAuthenticated: !!session.token,
    isStaff,
    isAdmin,
    isSuper,
  }
}

export function SessionProvider({ children }) {
  const [snapshot, setSnapshot] = useState(createSessionSnapshot)

  useEffect(() => {
    const refresh = () => setSnapshot(createSessionSnapshot())
    const onStorage = (event) => {
      if (!event || !event.key || event.key === 'sessionToken' || event.key === 'student') refresh()
    }
    window.addEventListener('session-changed', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('session-changed', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return <SessionContext.Provider value={snapshot}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  return context || createSessionSnapshot()
}
