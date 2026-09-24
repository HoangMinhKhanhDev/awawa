import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, useSession } from '../src/app/session-context.jsx'

let session = { token: '', student: null }

vi.mock('../src/api.js', () => ({
  getSession: () => session,
}))

function Probe() {
  const value = useSession()
  return <output>{value.user?.name || 'anonymous'}:{value.role}</output>
}

afterEach(() => cleanup())

describe('session context', () => {
  it('reacts to login and logout events', () => {
    session = { token: 'a'.repeat(64), student: { name: 'Lan', role: 'student' } }
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(screen.getByText('Lan:student')).toBeTruthy()

    session = { token: '', student: null }
    act(() => window.dispatchEvent(new Event('session-changed')))
    expect(screen.getByText('anonymous:student')).toBeTruthy()
  })

  it('reacts to cross-tab storage changes', () => {
    session = { token: '', student: null }
    render(<SessionProvider><Probe /></SessionProvider>)
    session = { token: 'b'.repeat(64), student: { name: 'Minh', role: 'teacher' } }
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'student' })))
    expect(screen.getByText('Minh:teacher')).toBeTruthy()
  })

  it('keeps event listeners independent between mounts', () => {
    session = { token: '', student: null }
    const first = render(<SessionProvider><Probe /></SessionProvider>)
    first.unmount()
    session = { token: 'c'.repeat(64), student: { name: 'An', role: 'admin' } }
    expect(() => act(() => window.dispatchEvent(new Event('session-changed')))).not.toThrow()
  })
})
