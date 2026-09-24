import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../src/app/session-context.jsx'
import { SchoolProvider, useSchoolScope } from '../src/app/school-context.jsx'

const contexts = {
  schools: [
    { id: 1, slug: 'school-a', name: 'Trường A', role: 'student', teams: [{ id: 11, name: 'Đội A', subject_id: 'cn', subject_name: 'Công nghệ' }] },
    { id: 2, slug: 'school-b', name: 'Trường B', role: 'student', teams: [{ id: 22, name: 'Đội B', subject_id: 'toan', subject_name: 'Toán' }] },
  ],
}

vi.mock('../src/api.js', () => ({
  isPhpMode: true,
  api: {
    contexts: vi.fn(async () => contexts),
  },
  getSession: () => ({ token: 'd'.repeat(64), student: { id: 7, name: 'Hà', role: 'student' } }),
}))

function Probe() {
  const { schools, school, team, selectSchool } = useSchoolScope()
  return (
    <div>
      <output>{school?.name}:{team?.name}</output>
      <select aria-label="school" value={school?.id || ''} onChange={(event) => selectSchool(event.target.value)}>
        {schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </div>
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('school context', () => {
  it('loads and persists the selected school and team', async () => {
    render(<SessionProvider><SchoolProvider><Probe /></SchoolProvider></SessionProvider>)
    await waitFor(() => expect(screen.getByText('Trường A:Đội A')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('school'), { target: { value: '2' } })
    await waitFor(() => expect(screen.getByText('Trường B:Đội B')).toBeTruthy())
    expect(localStorage.getItem('hsg-school-id')).toBe('2')
    expect(localStorage.getItem('hsg-team-id')).toBe('22')
  })
})
