# Đặc tả sản phẩm — Hệ thống bồi dưỡng HSG

Checklist code theo 5 giai đoạn. Trạng thái: ✅ có · 🟡 một phần · ⬜ thiếu.

## Giai đoạn 1 — Nền móng

| # | Mục | Trạng thái | Ghi chú |
|---|---|---|---|
| 1.1 | Đăng nhập / đăng xuất | ✅ | `routes_auth.py`, `Login.jsx`, `Profile.jsx` |
| 1.2 | Đổi mật khẩu | ✅ | |
| 1.3 | Quên mật khẩu (GV đặt lại) | ✅ | `reset-password` |
| 1.4 | Quên mật khẩu (email) | ⬜ | cần SMTP |
| 1.5 | Khóa / mở tài khoản (`active`) | ✅ | Phase 1a — admin khóa, login chặn 403 |
| 1.6 | Role `student` / `teacher` / `admin` | ✅ | Phase 1a thêm `admin` |
| 1.7 | Super admin + permission matrix | ⬜ | GĐ5 |
| 1.8 | Hồ sơ cá nhân + đội / lớp | ✅ | Profile 4 tab HS · 3 tab GV |
| 1.9 | Năm học | ✅ | `school_years` + `/manage/school` |
| 1.10 | Khối lớp | ✅ | `grades` |
| 1.11 | Đội tuyển (thực thể) | ✅ | `teams` |
| 1.12 | Thành viên theo năm (vào/ra) | ✅ | `team_members.left_at` |
| 1.13 | Phân công GV phụ trách đội | ✅ | `member_role='coach'` |
| 1.14 | GV chỉ thấy đội mình phụ trách | ✅ | API scope `/students`, `/me/teams` |
| 1.15 | Admin quản lý user hàng loạt | 🟡 | khóa/mở + danh sách; bulk incomplete |

## Giai đoạn 2 — Nội dung

| # | Mục | Trạng thái |
|---|---|---|
| 2.1 | Chuyên đề CRUD | 🟡 (thiếu sửa/xóa) |
| 2.2 | Bài học + đánh dấu hoàn thành | 🟡 (checkbox, thiếu điều kiện) |
| 2.3 | Sắp xếp thứ tự / bắt buộc / nâng cao | ⬜ |
| 2.4 | Thư viện học liệu (PDF/DOCX/PPTX/…) | ⬜ |
| 2.5 | Ngân hàng câu hỏi CRUD | ✅ |
| 2.6 | Tag, mã câu, sao chép, xem trước | ⬜ |

## Giai đoạn 3 — Học tập

| # | Mục | Trạng thái |
|---|---|---|
| 3.1 | Giao bài + hạn + trạng thái | ✅ (hạn chưa chặn nộp) |
| 3.2 | Giao từ ngân hàng câu | ✅ | Studio bước 4 |
| 3.3 | Đề thủ công / chia sẻ (shared) + mã đề | ✅ | Studio bước 3 · `GET /exams?mode=shared` |
| 3.4 | Ma trận / trộn câu server | ⬜ | |
| 3.5 | Làm bài: autosave, nộp file tự luận | 🟡 |
| 3.6 | Chấm tay + nhận xét | ✅ |
| 3.7 | Chấm từng ý, lịch sử sửa điểm | ⬜ |
| 3.8 | Studio pipeline GV (câu → bài học → đề → BT) | ✅ | `/manage/studio` |

## Giai đoạn 4 — Dữ liệu

| # | Mục | Trạng thái |
|---|---|---|
| 4.1 | Tiến độ cá nhân / theo chuyên đề | ✅ |
| 4.2 | Analytics đội tuyển / theo thời gian | ⬜ |
| 4.3 | Xuất Excel / PDF | ⬜ |

## Giai đoạn 5 — Hoàn thiện

| # | Mục | Trạng thái |
|---|---|---|
| 5.1 | Thông báo | ⬜ |
| 5.2 | Nhật ký hệ thống (audit) | ⬜ |
| 5.3 | Cài đặt trường (tên, logo, quy định) | ⬜ |
| 5.4 | PWA offline bài học | ⬜ |

---

## Module code (tên file)

| Module | Đường dẫn |
|---|---|
| 01 Authentication | `python-core/routes_auth.py`, `src/pages/Login.jsx` |
| 02 User & Permission | `python-core/auth.py`, role trong `students.role` |
| 03 School Management | `python-core/routes_school.py`, `src/pages/School.jsx` |
| 04 Team Management | `routes_school` + `src/pages/Team.jsx` |
| 05 Curriculum | `routes_assign.py` lessons, `src/pages/Topics.jsx` |
| 06 Learning Materials | ⬜ |
| 07 Question Bank | `routes_bank.py`, `src/pages/Bank.jsx` |
| 08 Assignment & Exam | `routes_assign.py`, `routes_exams.py`, `src/pages/Studio.jsx` |
| 09 Assessment & Analytics | `me/progress`, `stats/*`, `src/pages/Progress.jsx` |
| 10 Notification & Reporting | ⬜ |

## Ước mở Phase 1a (đã chốt)

Schema mới: `school_years`, `grades`, `teams`, `team_members`, cột `students.active`.
Role mới: `admin`. Seed admin demo. UI: `/manage/school`.
Không làm: email reset, super admin, lịch học, thông báo, báo cáo.
