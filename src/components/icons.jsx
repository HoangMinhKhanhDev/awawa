// Icon tự vẽ phong cách "Bảng lớp" — nét mực bi / phấn trắng:
// stroke đều 1.75, đầu nét bo tròn, chi tiết 1 nét đặc trưng (góc nghiêng nhẹ).
import React from 'react'

function I({ children, size = 20, className = '', ...rest }) {
  return (
    <svg
      className={`icn ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconHome = (p) => (
  <I {...p}><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></I>
)
export const IconBook = (p) => (
  <I {...p}><path d="M5 5.5c2.2-1 4.5-1 7 .4v13c-2.5-1.4-4.8-1.4-7-.4v-13Z" /><path d="M19 5.5c-2.2-1-4.5-1-7 .4" /><path d="M19 5.5v13c-2.5-1.4-4.8-1.4-7 .4" /></I>
)
export const IconTask = (p) => (
  <I {...p}><rect x="5" y="4.5" width="14" height="15.5" rx="2" /><path d="M9 4.5V3.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.7" /><path d="M8.5 10.5l1.5 1.5 3-3.5" /><path d="M8.5 15.5h7" /></I>
)
export const IconChart = (p) => (
  <I {...p}><path d="M4 19h16" /><path d="M6.5 15.5v-4" /><path d="M11 15.5V8" /><path d="M15.5 15.5v-6" /><path d="M19 19V5.5" /></I>
)
export const IconUser = (p) => (
  <I {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5.5 19.5c1.3-3 3.7-4.5 6.5-4.5s5.2 1.5 6.5 4.5" /></I>
)
export const IconCap = (p) => (
  <I {...p}><path d="M3.5 9.5 12 5.5l8.5 4L12 13.5 3.5 9.5Z" /><path d="M7 11.5v4.2c0 1.4 2.2 2.8 5 2.8s5-1.4 5-2.8v-4.2" /><path d="M20.5 9.5v4.5" /></I>
)
export const IconTimer = (p) => (
  <I {...p}><circle cx="12" cy="13.5" r="7" /><path d="M12 9.5v4l2.5 1.5" /><path d="M9.5 3h5" /><path d="M12 3v2.5" /></I>
)
export const IconShield = (p) => (
  <I {...p}><path d="M12 3.5 19 6v5.5c0 4.2-2.8 7-7 9-4.2-2-7-4.8-7-9V6l7-2.5Z" /><path d="M9 12l2 2 4-4.5" /></I>
)
export const IconUsers = (p) => (
  <I {...p}><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.9-2.6 2.8-4 5.5-4s4.6 1.4 5.5 4" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6" /><path d="M17 15.2c1.8.5 3 1.8 3.5 3.8" /></I>
)
export const IconUserPlus = (p) => (
  <I {...p}><circle cx="9" cy="8.5" r="3.5" /><path d="M3 19.5c1.1-3 3.3-4.5 6-4.5 1.2 0 2.3.3 3.2.9" /><path d="M17.5 14v6" /><path d="M14.5 17h6" /></I>
)
export const IconPen = (p) => (
  <I {...p}><path d="M14.5 5.5 18.5 9.5 8 20H4v-4L14.5 5.5Z" /><path d="M13 7l4 4" /><path d="M4.5 16.5 7.5 19.5" /></I>
)
export const IconTable = (p) => (
  <I {...p}><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 9.5h16" /><path d="M4 14.5h16" /><path d="M10 9.5V19" /></I>
)
export const IconSprout = (p) => (
  <I {...p}><path d="M12 20v-7" /><path d="M12 13c0-3.5-2.5-6-6.5-6.5C5 10.5 7.5 13 12 13Z" /><path d="M12 13c.5-3.5 3-5.5 7-6-.5 3.5-3 6-7 6Z" /></I>
)
export const IconPhone = (p) => (
  <I {...p}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M10.5 6.5h3" /><circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none" /></I>
)
export const IconWand = (p) => (
  <I {...p}><path d="M5 19 15.5 8.5" /><path d="M14 7l3 3" /><path d="M17.5 4v3" /><path d="M16 5.5h3" /><path d="M7 4.5v2.5" /><path d="M5.75 5.75h2.5" /><path d="M19.5 13.5v2" /><path d="M18.5 14.5h2" /></I>
)
export const IconFileUp = (p) => (
  <I {...p}><path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" /><path d="M14 3.5v4h4" /><path d="M12 17v-5" /><path d="M9.5 14.5 12 12l2.5 2.5" /></I>
)
export const IconFile = (p) => (
  <I {...p}><path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" /><path d="M14 3.5v4h4" /><path d="M8.5 12.5h7" /><path d="M8.5 16h5" /></I>
)
export const IconLayers = (p) => (
  <I {...p}><path d="M12 4.5 4.5 8.5 12 12.5l7.5-4L12 4.5Z" /><path d="M4.5 12.5 12 16.5l7.5-4" /><path d="M4.5 16.5 12 20.5l7.5-4" /></I>
)
export const IconChecks = (p) => (
  <I {...p}><path d="M4.5 7.5 6.5 9.5 10 6" /><path d="M4.5 16.5 6.5 18.5 10 15" /><path d="M13 8.5h6.5" /><path d="M13 17h6.5" /></I>
)
export const IconPlay = (p) => (
  <I {...p}><path d="M8.5 6.5v11l9-5.5-9-5.5Z" /></I>
)
export const IconPlus = (p) => (
  <I {...p}><path d="M12 5.5v13" /><path d="M5.5 12h13" /></I>
)
export const IconTrophy = (p) => (
  <I {...p}><path d="M8 4.5h8v5a4 4 0 0 1-8 0v-5Z" /><path d="M8 5.5H5.5a0 0 0 0 0 0 0c0 2.5 1 4 2.5 4.5" /><path d="M16 5.5h2.5c0 2.5-1 4-2.5 4.5" /><path d="M12 13.5v3" /><path d="M9 19.5h6" /><path d="M10 16.5h4v3h-4z" /></I>
)
export const IconUpload = (p) => (
  <I {...p}><path d="M12 15.5V5" /><path d="M8 8.5 12 4.5l4 4" /><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" /></I>
)
export const IconCheckCircle = (p) => (
  <I {...p}><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5 11 15l4.5-5.5" /></I>
)
export const IconArrowLeft = (p) => (
  <I {...p}><path d="M19 12H5.5" /><path d="M10.5 6.5 5 12l5.5 5.5" /></I>
)
export const IconCheck = (p) => (
  <I {...p}><path d="M5 12.5 9.5 17 19 7" /></I>
)
export const IconClock = (p) => (
  <I {...p}><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></I>
)
export const IconAward = (p) => (
  <I {...p}><circle cx="12" cy="9.5" r="5" /><path d="M9 13.5 7.5 20.5l4.5-2.5 4.5 2.5-1.5-7" /></I>
)
export const IconMessage = (p) => (
  <I {...p}><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" /></I>
)
export const IconCalendar = (p) => (
  <I {...p}><rect x="4.5" y="6" width="15" height="13.5" rx="1.5" /><path d="M4.5 10h15" /><path d="M8.5 4v3.5" /><path d="M15.5 4v3.5" /><path d="M8.5 14h3" /></I>
)
export const IconEye = (p) => (
  <I {...p}><path d="M3.5 12S6.5 6.5 12 6.5 20.5 12 20.5 12 17.5 17.5 12 17.5 3.5 12 3.5 12Z" /><circle cx="12" cy="12" r="2.5" /></I>
)
export const IconEyeOff = (p) => (
  <I {...p}><path d="M4 4.5 20 19.5" /><path d="M9.5 7.2A9.7 9.7 0 0 1 12 6.5c5.5 0 8.5 5.5 8.5 5.5a15 15 0 0 1-3 3.5" /><path d="M6.2 8.7A15.4 15.4 0 0 0 3.5 12S6.5 17.5 12 17.5c1 0 2-.2 2.8-.5" /><path d="M10.3 10.5a2.5 2.5 0 0 0 3.4 3.4" /></I>
)
export const IconLogin = (p) => (
  <I {...p}><path d="M14 5.5H7A1.5 1.5 0 0 0 5.5 7v10A1.5 1.5 0 0 0 7 18.5h7" /><path d="M12 12h8.5" /><path d="M17.5 8.5 21 12l-3.5 3.5" /></I>
)
export const IconHistory = (p) => (
  <I {...p}><path d="M5 8.5A8 8 0 1 1 4.5 13" /><path d="M4.5 4.5v4.5H9" /><path d="M12 8.5V12l2.5 1.5" /></I>
)
export const IconKey = (p) => (
  <I {...p}><circle cx="8.5" cy="12" r="4" /><path d="M12.5 12h8" /><path d="M17.5 12v3" /><path d="M20 12v2" /></I>
)
export const IconLogout = (p) => (
  <I {...p}><path d="M10 5.5H7A1.5 1.5 0 0 0 5.5 7v10A1.5 1.5 0 0 0 7 18.5h3" /><path d="M14 12h7" /><path d="M17.5 8.5 21 12l-3.5 3.5" /></I>
)
export const IconPencil = (p) => (
  <I {...p}><path d="M15 5.5 18.5 9 8.5 19H5v-3.5L15 5.5Z" /><path d="M13.5 7 17 10.5" /></I>
)
export const IconCircle = (p) => (
  <I {...p}><circle cx="12" cy="12" r="7.5" /></I>
)
export const IconClip = (p) => (
  <I {...p}><path d="M8.5 12.5 14 7a2.5 2.5 0 0 1 3.5 3.5l-7 7a4 4 0 0 1-5.5-5.5l6.5-6.5" /></I>
)
export const IconSchool = (p) => (
  <I {...p}><path d="M4.5 20.5V10l7.5-5.5L19.5 10v10.5" /><path d="M9.5 20.5v-5h5v5" /><path d="M4.5 20.5h15" /></I>
)
export const IconMoon = (p) => (
  <I {...p}><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5Z" /></I>
)
export const IconSun = (p) => (
  <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 3.5v2" /><path d="M12 18.5v2" /><path d="M3.5 12h2" /><path d="M18.5 12h2" /><path d="m6 6 1.4 1.4" /><path d="m16.6 16.6 1.4 1.4" /><path d="m18 6-1.4 1.4" /><path d="m7.4 16.6-1.4 1.4" /></I>
)
export const IconX = (p) => (
  <I {...p}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></I>
)
export const IconChevronRight = (p) => (
  <I {...p}><path d="m9.5 6 6 6-6 6" /></I>
)
export const IconMail = (p) => (
  <I {...p}><rect x="4" y="6" width="16" height="12" rx="1.5" /><path d="m4.5 7.5 7.5 6 7.5-6" /></I>
)
export const IconSearch = (p) => (
  <I {...p}><circle cx="11" cy="11" r="6" /><path d="m15.5 15.5 4 4" /></I>
)
export const IconAlert = (p) => (
  <I {...p}><path d="M12 4.5 21 19.5H3L12 4.5Z" /><path d="M12 10v4" /><circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" /></I>
)
export const IconInfo = (p) => (
  <I {...p}><circle cx="12" cy="12" r="8" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" /></I>
)
