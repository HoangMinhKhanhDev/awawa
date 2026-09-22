import { useEffect, useState } from 'react'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '') && !window.MSStream
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

// Nút "Cài app": Android/Chrome dùng beforeinstallprompt,
// iPhone dùng Share -> Add to Home Screen (Apple không cho prompt tự động).
export default function InstallPWA() {
  const [deferred, setDeferred] = useState(null)
  const [dismissed, setDismissed] = useState(localStorage.getItem('pwa-dismiss') === '1')

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setDeferred(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  if (isStandalone() || dismissed) return null

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setDeferred(null)
  }

  return (
    <div className="card" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>📲 Cài app lên điện thoại</b>
        <button className="btn" onClick={() => { localStorage.setItem('pwa-dismiss', '1'); setDismissed(true) }}>Để sau</button>
      </div>
      {deferred ? (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={install}>Cài đặt ngay</button>
          <span className="small muted">Nhẹ (~vài trăm KB), không qua CH Play.</span>
        </div>
      ) : isIOS() ? (
        <div className="small" style={{ marginTop: 8 }}>
          iPhone: bấm nút <b>Chia sẻ</b> (Share) ở thanh Safari → <b>Thêm vào MH chính</b> (Add to Home Screen).
        </div>
      ) : (
        <div className="small muted" style={{ marginTop: 8 }}>
          Mở bằng Chrome → menu ⋮ → <b>Cài đặt ứng dụng / Thêm vào MH chính</b>.
          (Lưu ý: nút cài chỉ hiện khi mở qua <b>https</b> hoặc localhost.)
        </div>
      )}
    </div>
  )
}
