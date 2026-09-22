import { useEffect, useState } from 'react'

const ASK_KEY = 'pwa-ask-date'
const REMIND_DAYS = 3

const UA = () => navigator.userAgent || ''
const isIOS = () => /iphone|ipad|ipod/i.test(UA()) && !window.MSStream
const isAndroid = () => /android/i.test(UA())
// Học sinh hay bấm link trong Zalo/Messenger/Facebook -> mở bằng trình duyệt
// nhúng của app đó, KHÔNG cài được PWA. Phải hướng dẫn mở bằng Chrome/Safari thật.
const inAppBrowser = () => /zalo|fbav|fban|fbios|messenger|line\/|micromessenger/i.test(UA())
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

// Hộp thoại mời cài app: tự bật sau ~1.5s ở lần ghé thăm đầu tiên (mobile),
// "Cài ngay" 1 chạm khi trình duyệt cho phép, ngược lại hiện hướng dẫn theo máy.
export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [deferred, setDeferred] = useState(null)

  useEffect(() => {
    if (isStandalone()) return
    // Luôn gắn listener (kể cả khi đang trong thời gian "để sau"),
    // để nút Cài app bấm lúc nào cũng mở được bảng.
    const last = Number(localStorage.getItem(ASK_KEY) || 0)
    const auto = Date.now() - last >= REMIND_DAYS * 24 * 3600 * 1000
    const t = auto ? setTimeout(() => setShow(true), 1500) : null
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); setShow(true) }
    const onInstalled = () => { localStorage.setItem(ASK_KEY, String(Date.now())); setShow(false) }
    const onForce = () => setShow(true)
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

  if (!show || isStandalone()) return null

  const later = () => { localStorage.setItem(ASK_KEY, String(Date.now())); setShow(false) }
  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setDeferred(null)
    later()
  }

  const steps = inAppBrowser()
    ? ['Bạn đang mở web BÊN TRONG Zalo/Facebook nên không cài được app.', 'Bấm menu ⋮ (góc trên) → "Mở bằng trình duyệt" / "Mở trong Chrome".', 'Trong Chrome, bấm nút "Cài app" để cài.']
    : isIOS()
      ? ['Bấm nút Chia sẻ ở thanh Safari.', 'Chọn "Thêm vào MH chính".', 'Mở app bằng biểu tượng ngoài màn hình.']
      : isAndroid()
        ? ['Bấm menu ⋮ góc trên Chrome.', 'Chọn "Thêm vào MH chính" / "Cài đặt ứng dụng".', 'Mở app bằng biểu tượng ngoài màn hình.']
        : ['Mở bằng Chrome/Edge.', 'Bấm biểu tượng Cài đặt trên thanh địa chỉ.', 'Mở app như ứng dụng bình thường.']

  return (
    <div className="sheet-backdrop" onClick={later}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Cài app Ôn luyện HSG" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ gap: 12 }}>
          <img src="icons/icon-192.png" alt="Ôn luyện HSG" width={52} height={52} style={{ borderRadius: 14 }} />
          <div>
            <b>Cài app Ôn luyện HSG?</b>
            <div className="small muted">Nhẹ, mở nhanh, có biểu tượng riêng ngoài màn hình.</div>
          </div>
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
        <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={later}>
          Để sau
        </button>
      </div>
    </div>
  )
}
