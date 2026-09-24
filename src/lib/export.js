// Xuất Excel (CSV BOM) + in PDF (print) — không cần thư viện ngoài.
export function exportCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) lines.push(r.map(esc).join(','))
  const csv = '﻿' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Mở cửa sổ in → người dùng chọn “Lưu thành PDF”. */
export function printPdf(title, headers, rows, footNote = '') {
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return false
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:system-ui,Segoe UI,Arial,sans-serif;padding:24px;color:#111}
  h1{font-size:18px;margin:0 0 4px}
  .meta{font-size:12px;color:#555;margin-bottom:16px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f0f3f8}
  .foot{margin-top:16px;font-size:11px;color:#666}
  @media print{ .noprint{display:none} }
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">Xuất ngày ${new Date().toLocaleString('vi-VN')}</div>
<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
${footNote ? `<div class="foot">${esc(footNote)}</div>` : ''}
<div class="foot noprint" style="margin-top:20px"><button onclick="window.print()">In / Lưu PDF</button></div>
<script>window.onload=function(){setTimeout(function(){/*auto ready*/},100)}</script>
</body></html>`)
  w.document.close()
  return true
}
