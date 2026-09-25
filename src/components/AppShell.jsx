import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { IconChevronRight, IconMoon, IconSprout, IconSun, IconX } from './icons.jsx'
import { useSession } from '../app/session-context.jsx'
import { useSchoolScope } from '../app/school-context.jsx'
import { getNavigationItems } from '../app/routeRegistry.jsx'
import InstallPrompt from './InstallPrompt.jsx'
import NotificationsBell from './NotificationsBell.jsx'

const pathMatches = (pathname, to, end = false) => {
  if (end) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

function MoreSheet({ items, closeRef, onClose }) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet more-sheet"
        role="dialog"
        aria-modal="true"
        id="shell-more-sheet"
        aria-labelledby="shell-more-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          const focusable = event.currentTarget.querySelectorAll('button, a[href]')
          if (!focusable.length) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <div className="row spread more-sheet-head">
          <div>
            <div className="modal-title" id="shell-more-title">Thêm chức năng</div>
            <div className="small muted">Các khu vực còn lại</div>
          </div>
          <button ref={closeRef} className="btn ghost sm" aria-label="Đóng" onClick={onClose}>
            <IconX className="icn sm" />
          </button>
        </div>
        <nav className="more-list" aria-label="Các chức năng khác">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `more-item${isActive ? ' active' : ''}`}
                onClick={onClose}
              >
                <Icon className="icn" />
                <span>{item.long || item.label}</span>
                <IconChevronRight className="icn sm more-item-arrow" />
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

export default function AppShell({ session: sessionProp, theme, onThemeToggle, children }) {
  const contextSession = useSession()
  const session = sessionProp || contextSession
  const { school, team } = useSchoolScope()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreTriggerRef = useRef(null)
  const moreCloseRef = useRef(null)
  const workspaceHref = school?.slug && team?.slug
    ? `/schools/${encodeURIComponent(school.slug)}/teams/${encodeURIComponent(team.slug)}`
    : '/workspace'
  const desktopItems = getNavigationItems('desktop', session).map((item) => item.routeId === 'workspace' ? { ...item, to: workspaceHref } : item)
  const mobileItems = getNavigationItems('mobile', session).map((item) => item.routeId === 'workspace' ? { ...item, to: workspaceHref } : item)
  const desktopPrimary = desktopItems.filter((item) => item.group === 'primary')
  const desktopExtra = desktopItems.filter((item) => item.group === 'extra')
  const allMobilePrimary = mobileItems.filter((item) => item.group === 'primary')
  const mobilePrimary = allMobilePrimary.slice(0, 4)
  const moreItems = [
    ...mobileItems.filter((item) => item.group === 'more'),
    ...allMobilePrimary.slice(4).map((item) => ({ ...item, group: 'more' })),
  ]
  const moreActive = moreItems.some((item) => pathMatches(location.pathname, item.to, item.end))
  const dark = theme === 'dark'

  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!moreOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const trigger = moreTriggerRef.current
    document.body.style.overflow = 'hidden'
    moreCloseRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMoreOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [moreOpen])

  const closeMore = () => setMoreOpen(false)
  const themeLabel = dark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'

  return (
    <div className="layout">
      <aside className="sidebar" aria-label="Điều hướng chính">
        <div className="brand"><IconSprout className="icn lg" /><span>Ôn luyện HSG<small>Lớp bồi dưỡng HSG</small></span></div>
        <nav aria-label="Điều hướng chính" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {desktopPrimary.map((item) => {
            const Icon = item.icon
            return <NavLink key={item.key} className="navlink" to={item.to} end={item.end}><Icon className="icn" />{item.long || item.label}</NavLink>
          })}
          <div className="nav-extra">
            {desktopExtra.map((item) => {
              const Icon = item.icon
              return <NavLink key={item.key} className="navlink small" to={item.to} end={item.end}><Icon className="icn sm" />{item.long || item.label}</NavLink>
            })}
          </div>
        </nav>
        <div className="sidefoot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="theme-toggle" aria-label={themeLabel} title={dark ? 'Chế độ sáng' : 'Chế độ tối'} onClick={onThemeToggle}>
              {dark ? <IconSun className="icn sm" /> : <IconMoon className="icn sm" />}
            </button>
            <span>{dark ? 'Chế độ sáng' : 'Chế độ tối'}</span>
          </div>
        </div>
      </aside>
      <header className="topbar">
        <b><IconSprout className="icn sm" />Ôn luyện HSG</b>
        <span className="row">
          <NotificationsBell />
          <button className="theme-toggle" aria-label={themeLabel} title={dark ? 'Chế độ sáng' : 'Chế độ tối'} onClick={onThemeToggle}>
            {dark ? <IconSun className="icn sm" /> : <IconMoon className="icn sm" />}
          </button>
        </span>
      </header>
      <main className="main">
        {children}
      </main>
      <InstallPrompt />
      <nav className="tabbar" aria-label="Điều hướng chính (điện thoại)">
        {mobilePrimary.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.key} to={item.to} end={item.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
              <Icon className="icn" />
              <span className="tab-lbl">{item.label}</span>
            </NavLink>
          )
        })}
        <button
          ref={moreTriggerRef}
          className={`tab more-trigger${moreActive || moreOpen ? ' active' : ''}`}
          type="button"
          aria-label="Mở thêm chức năng"
          aria-expanded={moreOpen}
          aria-controls="shell-more-sheet"
          onClick={() => setMoreOpen(true)}
        >
          <span className="more-dots" aria-hidden="true">•••</span>
          <span className="tab-lbl">Thêm</span>
        </button>
      </nav>
      {moreOpen && <MoreSheet items={moreItems} closeRef={moreCloseRef} onClose={closeMore} />}
    </div>
  )
}
