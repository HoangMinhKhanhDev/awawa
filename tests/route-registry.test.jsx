import { describe, expect, it } from 'vitest'
import {
  audienceAllowed,
  audienceValues,
  getMoreNavigation,
  getPrimaryNavigation,
  routeRegistry,
} from '../src/app/routeRegistry.jsx'

describe('route registry', () => {
  it('keeps route paths unique', () => {
    const paths = routeRegistry.map((route) => route.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('exposes a canonical school and team workspace route', () => {
    expect(routeRegistry.some((route) => route.path === '/schools/:schoolSlug/teams/:teamSlug')).toBe(true)
  })

  it('separates student and staff audiences', () => {
    expect(audienceAllowed(audienceValues.staff, { role: 'student' })).toBe(false)
    expect(audienceAllowed(audienceValues.staff, { role: 'teacher' })).toBe(true)
    expect(audienceAllowed(audienceValues.admin, { role: 'admin' })).toBe(true)
    expect(audienceAllowed(audienceValues.super, { role: 'admin' })).toBe(false)
  })

  it('exposes every student-only feature through mobile More', () => {
    const more = getMoreNavigation({ role: 'student' }).map((item) => item.to)
    expect(more).toContain('/workspace')
    expect(more).toContain('/practice')
    expect(more).toContain('/exam')
    expect(more).toContain('/profile')
    expect(getPrimaryNavigation('mobile', { role: 'student' }).length).toBeLessThanOrEqual(4)
  })
})
