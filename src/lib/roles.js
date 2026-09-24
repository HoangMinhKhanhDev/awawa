// Helper role — 1 chỗ đổi khi thêm super_admin.
export function roleOf(student) {
  return student?.role || 'student'
}

export function isStaffRole(roleOrStudent) {
  const r = typeof roleOrStudent === 'string' ? roleOrStudent : roleOf(roleOrStudent)
  return r === 'teacher' || r === 'admin' || r === 'super_admin'
}

export function isAdminRole(roleOrStudent) {
  const r = typeof roleOrStudent === 'string' ? roleOrStudent : roleOf(roleOrStudent)
  return r === 'admin' || r === 'super_admin'
}

export function isSuperRole(roleOrStudent) {
  const r = typeof roleOrStudent === 'string' ? roleOrStudent : roleOf(roleOrStudent)
  return r === 'super_admin'
}
