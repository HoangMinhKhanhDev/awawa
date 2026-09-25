import {
  IconCap, IconChart, IconFileUp, IconHome, IconPen, IconSchool,
  IconShield, IconTask, IconTable, IconTimer, IconUser, IconUsers, IconWand,
} from '../components/icons.jsx'
import Home from '../pages/Home.jsx'
import Login from '../pages/Login.jsx'
import Topics from '../pages/Topics.jsx'
import Assignments from '../pages/Assignments.jsx'
import Info from '../pages/Info.jsx'
import Grading from '../pages/Grading.jsx'
import Profile from '../pages/Profile.jsx'
import Practice from '../pages/Practice.jsx'
import Exam from '../pages/Exam.jsx'
import Progress from '../pages/Progress.jsx'
import Manage from '../pages/Manage.jsx'
import Bank from '../pages/Bank.jsx'
import ImportDoc from '../pages/ImportDoc.jsx'
import Permissions from '../pages/Permissions.jsx'
import School from '../pages/School.jsx'
import Studio from '../pages/Studio.jsx'
import Team from '../pages/Team.jsx'
import Workspace from '../pages/Workspace.jsx'

const nav = (label, long, icon, audience, group, order, end = false) => ({
  label,
  long,
  icon,
  audience,
  group,
  primary: group === 'primary',
  order,
  end,
})

export const fallbackPath = '/'

export const audienceValues = Object.freeze({
  public: 'public',
  all: 'all',
  student: 'student',
  staff: 'staff',
  admin: 'admin',
  super: 'super',
})

export function audienceAllowed(audience, flags = {}) {
  const role = flags.role
  const isStaff = flags.isStaff ?? ['teacher', 'admin', 'super_admin'].includes(role)
  const isAdmin = flags.isAdmin ?? ['admin', 'super_admin'].includes(role)
  const isSuper = flags.isSuper ?? role === 'super_admin'
  const values = Array.isArray(audience) ? audience : [audience]
  return values.some((value) => {
    if (!value || value === audienceValues.public || value === audienceValues.all) return true
    if (value === audienceValues.student) return !isStaff
    if (value === audienceValues.staff) return isStaff
    if (value === audienceValues.admin) return isAdmin
    if (value === audienceValues.super) return isSuper
    return false
  })
}

export const routeRegistry = [
  {
    id: 'home',
    path: '/',
    component: Home,
    audience: audienceValues.all,
    navigation: {
      desktop: [
        nav('Trang chủ', 'Trang chủ', IconHome, audienceValues.student, 'primary', 10, true),
        nav('Tổng quan', 'Tổng quan', IconHome, audienceValues.staff, 'primary', 10, true),
      ],
      mobile: [
        nav('Trang chủ', 'Trang chủ', IconHome, audienceValues.student, 'primary', 10, true),
        nav('Tổng quan', 'Tổng quan', IconHome, audienceValues.staff, 'primary', 10, true),
      ],
    },
  },
  {
    id: 'workspace',
    path: '/workspace',
    component: Workspace,
    audience: audienceValues.all,
    navigation: {
      desktop: [
        nav('Đội tuyển', 'Đội tuyển', IconUsers, audienceValues.all, 'primary', 15),
      ],
      mobile: [
        nav('Đội tuyển', 'Đội tuyển', IconUsers, audienceValues.all, 'more', 15),
      ],
    },
  },
  {
    id: 'workspace-context',
    path: '/schools/:schoolSlug/teams/:teamSlug',
    component: Workspace,
    audience: audienceValues.all,
    navigation: {},
  },
  {
    id: 'login',
    path: '/login',
    component: Login,
    audience: audienceValues.public,
    navigation: {},
  },
  {
    id: 'topics',
    path: '/topics',
    component: Topics,
    audience: audienceValues.all,
    navigation: {},
  },
  {
    id: 'topics-detail',
    path: '/topics/:subjectId',
    component: Topics,
    audience: audienceValues.all,
    navigation: {},
  },
  {
    id: 'assignments',
    path: '/assignments',
    component: Assignments,
    audience: audienceValues.all,
    navigation: {
      desktop: [
        nav('Bài tập', 'Bài tập', IconTask, audienceValues.student, 'primary', 30),
        nav('Bài tập', 'Bài tập', IconTask, audienceValues.staff, 'primary', 50),
      ],
      mobile: [
        nav('Bài tập', 'Bài tập', IconTask, audienceValues.student, 'primary', 30),
        nav('Bài tập', 'Bài tập', IconTask, audienceValues.staff, 'primary', 30),
      ],
    },
  },
  {
    id: 'assignments-detail',
    path: '/assignments/:id',
    component: Assignments,
    audience: audienceValues.all,
    navigation: {},
  },
  {
    id: 'info',
    path: '/info',
    component: Info,
    audience: audienceValues.all,
    navigation: {
      desktop: [
        nav('Thông tin', 'Thông tin', IconChart, audienceValues.student, 'primary', 40),
      ],
      mobile: [
        nav('Thông tin', 'Thông tin', IconChart, audienceValues.student, 'primary', 40),
        nav('Thông tin', 'Thông tin', IconChart, audienceValues.staff, 'more', 40),
      ],
    },
  },
  {
    id: 'grading',
    path: '/grading',
    component: Grading,
    audience: audienceValues.staff,
    navigation: {
      desktop: [
        nav('Chấm bài', 'Chấm bài', IconPen, audienceValues.staff, 'primary', 60),
      ],
      mobile: [
        nav('Chấm bài', 'Chấm bài', IconPen, audienceValues.staff, 'primary', 40),
      ],
    },
  },
  {
    id: 'grading-detail',
    path: '/grading/:id',
    component: Grading,
    audience: audienceValues.staff,
    navigation: {},
  },
  {
    id: 'profile',
    path: '/profile',
    component: Profile,
    audience: audienceValues.all,
    navigation: {
      desktop: [
        nav('Cá nhân', 'Hồ sơ', IconUser, audienceValues.all, 'primary', 80),
      ],
      mobile: [
        nav('Cá nhân', 'Hồ sơ', IconUser, audienceValues.all, 'more', 80),
      ],
    },
  },
  {
    id: 'practice',
    path: '/practice',
    component: Practice,
    audience: audienceValues.all,
    navigation: {
      desktop: [
        nav('Luyện nhanh', 'Luyện nhanh', IconCap, audienceValues.all, 'extra', 10),
      ],
      mobile: [
        nav('Luyện nhanh', 'Luyện nhanh', IconCap, audienceValues.all, 'more', 90),
      ],
    },
  },
  {
    id: 'exam',
    path: '/exam',
    component: Exam,
    audience: audienceValues.all,
    navigation: {
      desktop: [
        nav('Thi thử', 'Thi thử bấm giờ', IconTimer, audienceValues.all, 'extra', 20),
      ],
      mobile: [
        nav('Thi thử', 'Thi thử bấm giờ', IconTimer, audienceValues.all, 'more', 100),
      ],
    },
  },
  {
    id: 'progress',
    path: '/progress',
    component: Progress,
    audience: audienceValues.all,
    navigation: {
      desktop: [
        nav('Thống kê', 'Thống kê', IconTable, audienceValues.staff, 'primary', 70),
      ],
      mobile: [
        nav('Thống kê', 'Thống kê', IconTable, audienceValues.all, 'more', 50),
      ],
    },
  },
  {
    id: 'manage',
    path: '/manage/*',
    component: Manage,
    audience: audienceValues.staff,
    navigation: {},
  },
]

export const manageRouteRegistry = [
  {
    id: 'studio',
    path: '/manage/studio',
    component: Studio,
    audience: audienceValues.staff,
    label: 'Studio',
    long: 'Studio',
    icon: IconWand,
    navigation: {
      desktop: [
        nav('Studio', 'Studio', IconWand, audienceValues.staff, 'primary', 20),
      ],
      mobile: [
        nav('Studio', 'Studio', IconWand, audienceValues.staff, 'primary', 20),
      ],
    },
  },
  {
    id: 'team',
    path: '/manage/team',
    component: Team,
    audience: audienceValues.staff,
    fallback: true,
    label: 'Học sinh',
    long: 'Học sinh',
    icon: IconUsers,
    navigation: {
      desktop: [
        nav('Học sinh', 'Học sinh', IconUsers, audienceValues.staff, 'primary', 30),
      ],
      mobile: [
        nav('Học sinh', 'Học sinh', IconUsers, audienceValues.staff, 'more', 30),
      ],
    },
  },
  {
    id: 'bank',
    path: '/manage/bank',
    component: Bank,
    audience: audienceValues.staff,
    label: 'Ngân hàng',
    long: 'Ngân hàng đề',
    icon: IconShield,
    navigation: {
      desktop: [
        nav('Ngân hàng', 'Ngân hàng đề', IconShield, audienceValues.staff, 'extra', 30),
      ],
      mobile: [
        nav('Ngân hàng', 'Ngân hàng đề', IconShield, audienceValues.staff, 'more', 110),
      ],
    },
  },
  {
    id: 'import',
    path: '/manage/import',
    component: ImportDoc,
    audience: audienceValues.staff,
    label: 'Nhập đề',
    long: 'Nhập đề DOCX',
    icon: IconFileUp,
    navigation: {
      desktop: [
        nav('Nhập đề', 'Nhập đề DOCX', IconFileUp, audienceValues.staff, 'extra', 40),
      ],
      mobile: [
        nav('Nhập đề', 'Nhập đề DOCX', IconFileUp, audienceValues.staff, 'more', 120),
      ],
    },
  },
  {
    id: 'school',
    path: '/manage/school',
    component: School,
    audience: audienceValues.admin,
    label: 'Nhà trường',
    long: 'Nhà trường',
    icon: IconSchool,
    navigation: {
      desktop: [
        nav('Nhà trường', 'Nhà trường', IconSchool, audienceValues.admin, 'extra', 50),
      ],
      mobile: [
        nav('Nhà trường', 'Nhà trường', IconSchool, audienceValues.admin, 'more', 130),
      ],
    },
  },
  {
    id: 'permissions',
    path: '/manage/permissions',
    component: Permissions,
    audience: audienceValues.super,
    label: 'Phân quyền',
    long: 'Phân quyền',
    icon: IconShield,
    navigation: {
      desktop: [
        nav('Phân quyền', 'Phân quyền', IconShield, audienceValues.super, 'extra', 60),
      ],
      mobile: [
        nav('Phân quyền', 'Phân quyền', IconShield, audienceValues.super, 'more', 140),
      ],
    },
  },
]

export function getManageRouteDescriptors(flags = {}) {
  return manageRouteRegistry.filter((entry) => audienceAllowed(entry.audience, flags))
}

export function getNavigationItems(surface, flags = {}) {
  const entries = [...routeRegistry, ...manageRouteRegistry]
  return entries
    .flatMap((entry) => (entry.navigation?.[surface] || [])
      .filter((item) => audienceAllowed(item.audience ?? entry.audience, flags))
      .map((item, index) => ({
        ...item,
        to: entry.path,
        routeId: entry.id,
        key: `${entry.id}-${item.audience}-${item.group}-${index}`,
      })))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}

export function getPrimaryNavigation(surface, flags = {}) {
  return getNavigationItems(surface, flags).filter((item) => item.group === 'primary')
}

export function getMoreNavigation(flags = {}) {
  return getNavigationItems('mobile', flags).filter((item) => item.group === 'more')
}
