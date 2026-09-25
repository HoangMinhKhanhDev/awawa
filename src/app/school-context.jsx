import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useSession } from './session-context.jsx'

const SchoolContext = createContext(null)
const SCHOOL_KEY = 'hsg-school-id'
const TEAM_KEY = 'hsg-team-id'

function storedId(key) {
  try {
    const value = Number(localStorage.getItem(key))
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function remember(key, value) {
  try {
    if (value) localStorage.setItem(key, String(value))
    else localStorage.removeItem(key)
  } catch {}
}

function selectFromSchools(schools, schoolId, teamId) {
  const school = schools.find((item) => Number(item.id) === Number(schoolId)) || schools[0] || null
  const team = school?.teams?.find((item) => Number(item.id) === Number(teamId)) || school?.teams?.[0] || null
  return { school, team }
}

export function SchoolProvider({ children }) {
  const { token } = useSession()
  const [snapshot, setSnapshot] = useState({ status: 'loading', schools: [], error: '' })

  const load = useCallback(async () => {
    if (!token) {
      setSnapshot({ status: 'anonymous', schools: [], error: '' })
      return
    }
    setSnapshot((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const data = await api.contexts()
      const schools = Array.isArray(data?.schools) ? data.schools : []
      const selected = selectFromSchools(schools, storedId(SCHOOL_KEY), storedId(TEAM_KEY))
      remember(SCHOOL_KEY, selected.school?.id)
      remember(TEAM_KEY, selected.team?.id)
      setSnapshot({ status: 'ready', schools, error: '' })
    } catch (error) {
      setSnapshot({ status: 'error', schools: [], error: error?.message || 'Không tải được ngữ cảnh trường.' })
    }
  }, [token])

  useEffect(() => {
    load()
    const refresh = () => load()
    window.addEventListener('session-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('session-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [load])

  const selectSchool = useCallback((schoolId) => {
    const school = snapshot.schools.find((item) => Number(item.id) === Number(schoolId))
    if (!school) return
    const team = school.teams?.[0] || null
    remember(SCHOOL_KEY, school.id)
    remember(TEAM_KEY, team?.id)
    setSnapshot((current) => selectFromSchools(current.schools, school.id, team?.id).school
      ? { ...current, status: 'ready' }
      : current)
  }, [snapshot.schools])

  const selectTeam = useCallback((teamId) => {
    const school = snapshot.schools.find((item) => item.teams?.some((team) => Number(team.id) === Number(teamId)))
    const team = school?.teams?.find((item) => Number(item.id) === Number(teamId))
    if (!school || !team) return
    remember(SCHOOL_KEY, school.id)
    remember(TEAM_KEY, team.id)
    setSnapshot((current) => ({ ...current, status: 'ready' }))
  }, [snapshot.schools])

  const selectBySlug = useCallback((schoolSlug, teamSlug) => {
    const school = snapshot.schools.find((item) => item.slug === schoolSlug)
    const team = school?.teams?.find((item) => item.slug === teamSlug) || school?.teams?.[0]
    if (!school) return false
    remember(SCHOOL_KEY, school.id)
    remember(TEAM_KEY, team?.id)
    setSnapshot((current) => ({ ...current, status: 'ready' }))
    return true
  }, [snapshot.schools])

  const value = useMemo(() => {
    const selected = selectFromSchools(snapshot.schools, storedId(SCHOOL_KEY), storedId(TEAM_KEY))
    return {
      ...snapshot,
      school: selected.school,
      team: selected.team,
      role: selected.school?.role || selected.team?.membership_role || null,
      selectSchool,
      selectTeam,
      selectBySlug,
      refresh: load,
    }
  }, [snapshot, selectSchool, selectTeam, selectBySlug, load])

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>
}

export function useSchoolScope() {
  const context = useContext(SchoolContext)
  if (context) return context
  return {
    status: 'loading',
    schools: [],
    school: null,
    team: null,
    role: null,
    error: '',
    selectSchool: () => {},
    selectTeam: () => {},
    selectBySlug: () => false,
    refresh: () => {},
  }
}
