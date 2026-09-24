# Đặc tả sản phẩm — Hệ thống bồi dưỡng HSG

Checklist code theo 5 giai đoạn. Trạng thái: ✅ có · 🟡 một phần · ⬜ thiếu.

## Giai đoạn 1 — Nền móng

| # | Mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 1.1 | Đăng nhập / đăng xuất | ✅ | `routes_auth.py`, `Login.jsx`, `Profile.jsx` |
| 1.2 | Đổi mật khẩu | ✅ | |
| 1.3 | Quên mật khẩu (GV đặt lại) | ✅ | `reset-password` |
| 1.4 | Quên mật khẩu (email) | ✅ | SMTP env `SMTP_HOST/PORT/USER/PASSWORD/FROM` · `forgot-password` + `reset-password` |
| 1.5 | Khóa / mở tài khoản (`active`) | ✅ | Phase 1a — admin khóa, login chặn 403 |
| 1.6 | Role `student` / `teacher` / `admin` | ✅ | Phase 1a thêm `admin` |
| 1.7 | Super admin + permission matrix | ✅ | role `super_admin` · bảng `role_permissions` · `/manage/permissions` |
| 1.8 | Hồ sơ cá nhân + đội / lớp | ✅ | Profile 4 tab HS · 3 tab GV |
| 1.9 | Năm học | ✅ | `school_years` + `/manage/school` |
| 1.10 | Khối lớp | ✅ | `grades` |
| 1.11 | Đội tuyển (thực thể) | ✅ | `teams` |
| 1.12 | Thành viên theo năm (vào/ra) | ✅ | `team_members.left_at` |
| 1.13 | Phân công GV phụ trách đội | ✅ | `member_role='coach'` |
| 1.14 | GV chỉ thấy đội mình phụ trách | ✅ | API scope `/students`, `/me/teams` |
| 1.15 | Admin quản lý user hàng loạt | ✅ | `POST /students/bulk` activate/deactivate/delete/set_role · checkbox Team |

## Giai đoạn 2 — Nội dung

| # | Mục | Trạng thái |
|---|---|---|
| 2.1 | Chuyên đề CRUD | ✅ PUT/DELETE `/topics/{id}` · UI Sửa/Xóa |
| 2.2 | Bài học + đánh dấu hoàn thành | ✅ checkbox + điều kiện = đủ bài bắt buộc |
| 2.3 | Sắp xếp thứ tự / bắt buộc / nâng cao | ✅ `idx` move up/down · cột `required`/`advanced` |
| 2.4 | Thư viện học liệu (PDF/DOCX/PPTX/…) | ✅ bảng `materials` · tab Tài liệu |
| 2.5 | Ngân hàng câu hỏi CRUD | ✅ |
| 2.6 | Tag, mã câu, sao chép, xem trước | ✅ `code`/`tags` · duplicate · modal preview |

## Giai đoạn 3 — Học tập

| # | Mục | Trạng thái |
|---|---|---|
| 3.1 | Giao bài + hạn + trạng thái | ✅ chặn nộp quá hạn (server + UI badge) |
| 3.2 | Giao từ ngân hàng câu | ✅ Studio bước 4 |
| 3.3 | Đề thủ công / chia sẻ (shared) + mã đề | ✅ Studio bước 3 · `GET /exams?mode=shared` |
| 3.4 | Ma trận / trộn câu server | ✅ `shuffle_q` · trộn mỗi lần GET `/exams/{id}` |
| 3.5 | Làm bài: autosave, nộp file tự luận | ✅ autosave 2s + `files[]` + upload |
| 3.6 | Chấm tay + nhận xét | ✅ |
| 3.7 | Chấm từng ý, lịch sử sửa điểm | ✅ `question_scores` + bảng `grade_history` |
| 3.8 | Studio pipeline GV (câu → bài học → đề → BT) | ✅ `/manage/studio` |

## Giai đoạn 4 — Dữ liệu

| # | Mục | Trạng thái |
|---|---|---|
| 4.1 | Tiến độ cá nhân / theo chuyên đề | ✅ |
| 4.2 | Analytics đội tuyển / theo thời gian | ✅ `/stats/team-timeline` · chart Progress |
| 4.3 | Xuất Excel / PDF | ✅ `src/lib/export.js` (CSV BOM + print PDF) |

## Giai đoạn 5 — Hoàn thiện

| # | Mục | Trạng thái |
|---|---|---|
| 5.1 | Thông báo | ✅ bảng `notifications` · chuông topbar · tạo khi giao bài |
| 5.2 | Nhật ký hệ thống (audit) | ⬜ |
| 5.3 | Cài đặt trường (tên, logo, quy định) | ⬜ |
| 5.4 | PWA offline bài học | ✅ | NetworkFirst cache `lessons-cache` 7 ngày · banner offline Topics |

---

## Module code (tên file)

| Module | Đường dẫn |
|---|---|
| 01 Authentication | `python-core/routes_auth.py`, `src/pages/Login.jsx` |
| 02 User & Permission | `python-core/auth.py` · `role_permissions` · `src/pages/Permissions.jsx` · `src/lib/roles.js` |
| 03 School Management | `python-core/routes_school.py`, `src/pages/School.jsx` |
| 04 Team Management | `routes_school` + `src/pages/Team.jsx` |
| 05 Curriculum | `routes_assign.py` lessons, `src/pages/Topics.jsx` |
| 06 Learning Materials | `routes_bank.py` materials · `api/index.php` `/materials` |
| 07 Question Bank | `routes_bank.py`, `src/pages/Bank.jsx` |
| 08 Assignment & Exam | `routes_assign.py`, `routes_exams.py`, `src/pages/Studio.jsx` |
| 09 Assessment & Analytics | `me/progress`, `stats/*`, `src/pages/Progress.jsx`, `src/lib/export.js` |
| 10 Notification & Reporting | `notifications` + `NotificationsBell.jsx` · export Excel/PDF |

## Ước mở Phase 1a (đã chốt)

Schema mới: `school_years`, `grades`, `teams`, `team_members`, cột `students.active`.
Role mới: `admin`. Seed admin demo. UI: `/manage/school`.
Không làm: email reset (đã bật khi có SMTP), super admin, lịch học, báo cáo nâng cao.
