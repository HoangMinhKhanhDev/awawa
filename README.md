# Ôn luyện HSG THPT (React PWA + PHP/MySQL)

Một ứng dụng web duy nhất cho giáo viên và học sinh: ngân hàng câu hỏi, chuyên đề, bài tập, thi thử, tiến độ và quản trị trường/lớp/đội.

- Frontend: React + Vite, PWA, chạy tại `dist/`.
- Backend: PHP 7.4+ + MySQL, chạy tại `api/` dưới cùng domain (`/api/...`).
- Không còn Python, Electron hay tunnel LAN. Production duy nhất: Hostinger.

## Chạy dev

```powershell
npm install
npm run dev          # Vite 5173, proxy /api sang VITE_DEV_API_TARGET (mặc định production)
```

## Build & deploy Hostinger

```powershell
npm run build:renderer   # ra dist/ gồm web + api/ + database/ + .htaccess
```

Hostinger Git auto-deploy (`main`) sẽ chạy `npm run build` rồi publish `dist/`.
`api/local.php` được sinh tự động lúc build từ Environment Variables (DB_*, API_TOKEN, AGNES_*).
Không commit secret; đặt biến trong hPanel.

## Database

- `database/seeds/seed_mysql.sql`: dữ liệu mẫu môn/chuyên đề/câu hỏi.
- `database/seeds/seed_phase1a_mysql.sql`: tài khoản demo + lớp/đội.
- `database/migrations/0001..0011`: schema chuẩn, chạy tuần tự.

```powershell
npm run db:migrate:status
npm run db:migrate
```

Migration `0011` hợp nhất membership: dữ liệu `team_members` được đưa vào `team_memberships` rồi bảng legacy bị xoá.

## Kiểm tra

```powershell
npm test
npm run lint
npm run build:web
npm run test:migration:contract
npm run test:migration:db
```

## Mô hình dữ liệu chính

- `schools`, `school_memberships`: người dùng thuộc trường nào, vai trò gì.
- `teams`, `team_memberships`: thành viên đội (student/coach), nguồn `manual`/`class`.
- `classes`, `class_members`, `class_team_links`: lớp, học sinh trong lớp, lớp gắn với đội.
- Nội dung (subjects/topics/lessons/questions) thuộc trường; bài tập/đề/tiến độ thuộc đội.
