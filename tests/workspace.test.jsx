import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Workspace from '../src/pages/Workspace.jsx'
import { UIProvider } from '../src/components/ui.jsx'
import { api } from '../src/api.js'

const scope = {
  status: 'ready',
  schools: [{ id: 1, name: 'Trường A', role: 'student' }],
  school: { id: 1, name: 'Trường A', role: 'student' },
  team: { id: 11, name: 'Đội A', subject_id: 'cn', subject_name: 'Công nghệ' },
  role: 'student',
  error: '',
  selectSchool: () => {},
  selectTeam: () => {},
  refresh: () => {},
}

vi.mock('../src/app/school-context.jsx', () => ({ useSchoolScope: () => scope }))
vi.mock('../src/api.js', () => ({
  api: {
    team: vi.fn(async () => ({ team: { student_count: 18, coach_count: 2 } })),
    teamModules: vi.fn(async () => ({
      modules: [
        { id: 1, code: 'lesson_library', name: 'Bài học', description: 'Nội dung đội', available: true, enabled: true },
        { id: 2, code: 'assignment_management', name: 'Bài tập', description: 'Giao và nộp bài', available: true, enabled: true },
      ],
    })),
    schoolClasses: vi.fn(async () => ({ classes: [{ id: 3, name: '10A', team_count: 1, linked_team_ids: [11] }] })),
    updateTeamModule: vi.fn(async (schoolId, subjectId, teamId, moduleCode, payload) => ({ id: 1, code: moduleCode, name: 'Bài học', available: true, enabled: payload.enabled })),
  },
}))

afterEach(() => cleanup())

describe('team workspace', () => {
  it('renders the selected team and enabled modules', async () => {
    render(<MemoryRouter><UIProvider><Workspace /></UIProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Đội A' })).toBeTruthy())
    expect(screen.getByText('Bài học')).toBeTruthy()
    expect(screen.getByText('Bài tập')).toBeTruthy()
    expect(screen.getByText('18')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('lets a school admin toggle modules and class synchronization', async () => {
    scope.role = 'admin'
    scope.school.role = 'admin'
    render(<MemoryRouter><UIProvider><Workspace /></UIProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(3))
    const toggles = screen.getAllByRole('checkbox')
    fireEvent.click(toggles[0])
    await waitFor(() => expect(api.updateTeamModule).toHaveBeenCalledWith(1, 'cn', 11, 'lesson_library', { enabled: false }))
    expect(screen.getByText('10A')).toBeTruthy()
  })
})
