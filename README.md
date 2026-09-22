# Ôn luyện HSG THPT (PWA + Python server)

Hướng hiện tại (đã chốt): **một app web duy nhất (PWA) cho cả giáo viên và học sinh**,
mở bằng link/QR trên điện thoại. Bản Electron desktop tạm dừng, chưa xóa.

Phạm vi: ngân hàng câu hỏi nhiều môn • luyện chuyên đề • thi thử bấm giờ
**có ghi số lần rời app** • tiến độ • nhập DOCX/PDF text (chưa OCR).

## Chạy thử nghiệm LAN (server đặt trên máy giáo viên)

Máy giáo viên và điện thoại học sinh **dùng chung một WiFi**.

**Terminal 1 — API:**
```powershell
npm run dev:python-lan
# = python python-core/main.py --host 0.0.0.0 --port 8765
```

**Terminal 2 — Web:**
```powershell
npm run dev:lan
# = vite --host (cổng 5173)
```

**Trên điện thoại (cùng WiFi):** mở trình duyệt vào
`http://<IP-máy-giáo-viên>:5173` (VD: `http://192.168.1.13:5173`),
rồi ở màn hình Tổng quan → **Kết nối server** nhập
`http://<IP-máy-giáo-viên>:8765` → Lưu.

Xem IP máy giáo viên: `ipconfig` (dòng IPv4 của Wi-Fi).

> Windows Firewall có thể chặn điện thoại. Lần đầu chạy, Windows thường hiện
> bảng hỏi — chọn **Allow access**. Nếu không thấy bảng hỏi, chạy PowerShell
> **quyền Admin** một lần:
> `New-NetFirewallRule -DisplayName "OnLuyenHSG" -Direction Inbound -LocalPort 8765,5173 -Protocol TCP -Action Allow`

## Tự chạy khi mở máy (chống reboot giết cả cụm)

Máy Windows tự reboot nửa đêm (Windows Update) sẽ tắt hết backend + tunnel,
hôm sau link ngrok chỉ còn trang trắng lỗi. Đã xử lý 2 lớp:

1. **Tự chạy lúc đăng nhập:** file `start-all.bat` (1 click chạy cả Server +
   Tunnel, 2 cửa sổ đen hiện rõ) + shortcut `OnLuyenHSG` đã đặt sẵn trong
   `shell:startup`. Mở máy là tự chạy, không cần làm gì.
2. **Tự canh lúc đang chạy:** `scripts/ngrok.cjs` kiểm tra mỗi 30 giây —
   backend chết thì dựng lại, tunnel rớt thì nối lại, ghi log vào
   `scripts/ngrok.log`, link public lưu ở `public-url.txt`.

Tắt app: đóng 2 cửa sổ đen "OnLuyenHSG Server" và "OnLuyenHSG Tunnel".

## Cẩm nang bắt bệnh màn hình trắng (đọc dòng nào khớp thì làm theo)

| Thấy gì | Nghĩa là gì | Làm gì |
|---|---|---|
| Trắng, có chữ `offline`/3200 hoặc `failed to complete tunnel` | Tunnel/backend chết (VD: vừa reboot, chưa chạy start-all) | Chạy `start-all.bat`, đợi 1 phút, tải lại |
| Trắng, có nút **Visit Site** | Cổng gác của ngrok free (không phải lỗi) | Bấm Visit Site 1 lần là vào app |
| Có dòng "Đang tải Ôn luyện HSG…" đứng yên | Đã vào app nhưng mạng chậm/JS chưa nạp xong | Đợi thêm, kéo tải lại trang |
| Vào được app nhưng báo chưa nối server | API chưa thông | Đợi backend lên (~10s) rồi tải lại |

## Chạy public https qua Cloudflare (khuyên dùng khi test cài app)

Dùng `cloudflared` (đã tải sẵn ở `bin/`, không cần tài khoản):
mở là vào thẳng app, **không có trang chặn Visit Site** như ngrok.
Chạy `start-all.bat` là đủ (Server build production + Tunnel).
URL public `*.trycloudflare.com` **đổi mỗi lần mở tunnel** — xem trong cửa sổ
Tunnel hoặc file `public-url.txt`, gửi link mới cho học sinh.

Vì web và API chung 1 domain https nên không bị lỗi mixed-content, service worker
thật (bản build) chạy được → Chrome Android hiện nút **Cài đặt ngay** 1 chạm.

> Muốn test cài đặt: tunnel phải trỏ vào server production (`npm run prod:lan`
> rồi `npm run tunnel -- 8765`), KHÔNG trỏ vào Vite dev — vì SW dev không đủ
> điều kiện hiện nút cài của Chrome.
> Bản ngrok cũ vẫn còn (`npm run tunnel:ngrok`) nhưng không khuyên dùng khi test
> trên điện thoại: trang chặn của nó hay hiện trắng tinh gây hiểu lầm.

## Cài app lên điện thoại (PWA)

- **Android/Chrome:** mở link https → đợi bảng hỏi → **Cài đặt ngay** 1 chạm.
  (Hoặc menu ⋮ → Cài đặt ứng dụng / Thêm vào MH chính.)
- **iPhone/Safari:** nút Chia sẻ → Thêm vào MH chính.

## Chống gian lận (bản đầu)

Trong lúc thi thử, app đếm **số lần rời app** (chuyển tab/ứng dụng, tắt màn hình)
bằng `visibilitychange` + `blur`/`focus`, hiện trực tiếp cho thí sinh và lưu
kèm bài nộp (`focus_exits` + `focus_log` chi tiết thời gian). Giáo viên xem ở
**Tiến độ học → Lịch sử làm bài**, cột "Rời app".

## Build bản production

```powershell
npm run build:renderer   # ra dist/ + manifest + service worker
npx vite preview --host  # chạy thử bản build trên LAN
```

Triển khai thật cần **HTTPS** (PWA yêu cầu) — dùng Caddy/Nginx + Let's Encrypt,
trỏ tên miền về máy chủ rồi in QR.
