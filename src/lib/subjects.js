const ALLOWLIST = ['công nghệ']

export function filterSubjects(list) {
  const rows = Array.isArray(list) ? list : []
  const kept = rows.filter((s) => ALLOWLIST.some((key) => String(s?.name || '').toLowerCase().includes(key)))
  return kept.length ? kept : rows.slice(0, 1)
}
