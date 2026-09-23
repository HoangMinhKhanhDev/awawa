import { useEffect, useRef, useState } from 'react'

// Cờ localStorage:
//  - pwa-installed = '1'  → ĐÃ cài: không bao giờ tự hỏi lại
//  - pwa-dismissed = '1'  → user bấm "Ẩn": không tự hỏi lại (vẫn tải được từ Hồ sơ)
// Hộp chỉ tự bật 1 lần khi chưa cài + chưa Ẩn. Bấm "Cài app" ở Hồ sơ vẫn mở được sheet.
const KEY_INSTALLED = 'pwa-installed'
const KEY_DISMISSED = 'pwa-dismissed'

const UA = () => navigator.userAgent || ''
const isIOS = () => /iphone|ipad|ipod/i.test(UA()) && !window.MSStream
const isAndroid = () => /android/i.test(UA())
// Học sinh hay bấm link trong Zalo/Messenger/Facebook -> mở bằng trình duyệt
// nhúng của app đó, KHÔNG cài được PWA. Phải hướng dẫn mở bằng Chrome/Safari thật.
const inAppBrowser = () => /zalo|fbav|fban|fbios|messenger|line\/|micromessenger/i.test(UA())
const isStandalone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch { return false }
}

const isInstalled = () => {
  try {
    return localStorage.getItem(KEY_INSTALLED) === '1' || isStandalone()
  } catch { return isStandalone() }
}
const isDismissed = () => {
  try { return localStorage.getItem(KEY_DISMISSED) === '1' } catch { return false }
}

function markInstalled() {
  try {
    localStorage.setItem(KEY_INSTALLED, '1')
    localStorage.removeItem(KEY_DISMISSED)
    localStorage.removeItem('pwa-ask-date') // dọn cờ cũ
  } catch {}
}

// Nút "Cài app" ở Hồ sơ dispatch event này để mở sheet bất kỳ lúc nào.
export function openInstallSheet() {
  window.dispatchEvent(new Event('pwa:ask'))
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [deferred, setDeferred] = useState(null)
  const autoTried = useRef(false)

  useEffect(() => {
    // Mở app dưới dạng installed → ghi nhận vĩnh viễn, không hiện gì nữa
    if (isStandalone()) {
      markInstalled()
      return
    }

    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
      // Không tự bật sheet từ beforeinstallprompt — chỉ hiện khi user chủ động
      // (hoặc auto 1 lần đầu chưa dismiss/install)
    }
    const onInstalled = () => {
      markInstalled()
      setShow(false)
    }
    // Auto 1 lần duy nhất: chưa cài + chưa Ẩn + chưa thử lần này
    const t = setTimeout(() => {
      if (autoTried.current) return
      autoTried.current = true
      if (!isInstalled() && !isDismissed()) setShow(true)
    }, 1500)
    const onForce = () => {
      if (isInstalled() && isStandalone()) return
      setShow(true)
    }
    const onKey = (e) => { if (e.key === 'Escape') setShow(false) }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('pwa:ask', onForce)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('pwa:ask', onForce)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Không hiện khi đã cài (standalone) hoặc user đã Ẩn vĩnh viễn (trừ khi force mở)
  if (isStandalone()) return null
  if (!show) return null

  // "Ẩn" — vĩnh viễn không tự hỏi lại; vẫn tải được từ Hồ sơ → Tài khoản
  const hideForever = () => {
    try { localStorage.setItem(KEY_DISMISSED, '1') } catch {}
    setShow(false)
  }
  // Đóng tạm lần này (không set dismissed — nhưng auto cũng chỉ chạy 1 lần/session)
  const close = () => setShow(false)

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    const choice = await deferred.userChoice.catch(() => null)
    setDeferred(null)
    if (choice?.outcome === 'accepted') {
      markInstalled()
      setShow(false)
    }
  }

  const steps = inAppBrowser()
    ? ['Bạn đang mở web BÊN TRONG Zalo/Facebook nên không cài được app.', 'Bấm menu ⋮ (góc trên) → "Mở bằng trình duyệt" / "Mở trong Chrome".', 'Trong Chrome, vào Hồ sơ → Tài khoản → "Cài app".']
    : isIOS()
      ? ['Bấm nút Chia sẻ ở thanh Safari.', 'Chọn "Thêm vào MH chính".', 'Mở app bằng biểu tượng ngoài màn hình.']
      : isAndroid()
        ? ['Bấm menu ⋮ góc trên Chrome.', 'Chọn "Thêm vào MH chính" / "Cài đặt ứng dụng".', 'Mở app bằng biểu tượng ngoài màn hình.']
        : ['Mở bằng Chrome/Edge.', 'Bấm biểu tượng Cài đặt trên thanh địa chỉ.', 'Mở app như ứng dụng bình thường.']

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Cài app Ôn luyện HSG" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ gap: 12 }}>
          <img src="icons/icon-192.png" alt="Ôn luyện HSG" width={52} height={52} style={{ borderRadius: 14 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>Cài app Ôn luyện HSG?</b>
            <div className="small muted">Nhẹ, mở nhanh, có biểu tượng riêng ngoài màn hình.</div>
          </div>
          <button className="btn ghost sm" aria-label="Đóng" onClick={close}>✕</button>
        </div>
        {deferred ? (
          <button className="btn primary" style={{ width: '100%', marginTop: 12 }} onClick={install}>
            Cài đặt ngay
          </button>
        ) : (
          <ol className="small" style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
            {steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        )}
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={hideForever}>
            Ẩn (không hỏi lại)
          </button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={close}>
            Để sau
          </button>
        </div>
        <div className="small muted" style={{ marginTop: 8, textAlign: 'center' }}>
          Vào <b>Hồ sơ → Tài khoản → Cài app</b> bất kỳ lúc nào.
        </div>
      </div>
    </div>
  )
}
