# PRODUCT

## Phạm vi

Ứng dụng ôn luyện HSG THPT dạng PWA, một domain duy nhất, backend PHP/MySQL.

## Vai trò

- student: học tập, làm bài, xem kết quả/tiến độ của mình.
- teacher: quản lý đội mình phụ trách, nội dung, chấm bài, báo cáo.
- admin: quản trị trường, lớp, người dùng, module.
- super_admin: quản trị hệ thống, break-glass đa trường.

## Thành phần

| Khu vực | Chính |
|---|---|
| Auth | `api/config.php`, `api/index.php`, `src/pages/Login.jsx` |
| Phân quyền | `api/lib/policy.php`, `role_permissions`, `src/pages/Permissions.jsx` |
| Trường/đội | `api/routes_v2.php`, `src/pages/School.jsx`, `src/pages/Workspace.jsx` |
| Nội dung | `api/index.php` (subjects/topics/lessons/questions), `src/pages/Topics.jsx`, `src/pages/Studio.jsx` |
| Bài tập/thi | `api/index.php`, `src/pages/Assignments.jsx`, `src/pages/Exam.jsx` |
| Tiến độ | `api/index.php`, `src/pages/Progress.jsx`, `src/pages/Results.jsx` |
| Dữ liệu | `database/migrations`, `database/seeds` |
| Hạ tầng | `scripts/copy-api.cjs`, `.github/workflows/quality.yml` |

## Nguyên tắc

- PHP/MySQL là nguồn duy nhất.
- Membership chỉ dùng `school_memberships` và `team_memberships`.
- Mọi API đi qua `/api` cùng origin; client dùng session token.
- Secret chỉ nằm trong Environment Variables Hostinger, không vào repo.
